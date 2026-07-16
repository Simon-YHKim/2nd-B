// 통화 녹음 (call recording flow, docs/CALL-RECORDING-SPEC.md §5). Real on-device
// capture → transcript: the user records their OWN call (speakerphone so both
// voices reach the mic), the audio is transcribed via transcribeAudio and then
// DROPPED — only the text is kept, saved as a call_reflection record.
// idle → rec → stt → result. Reuses the exact capture(음성) pipeline
// (useAudioRecorder + recordingUriToBase64 + transcribeAudio, C9 red-zone gate).
//
// Platform reality (CALL-RECORDING-SPEC §legal-safe): Android/iOS block third-
// party capture of the call's own audio stream, so there is NO silent auto-
// record. The sanctioned path is speakerphone mic capture the user starts — the
// UI says so honestly rather than promising an impossible call-audio API.
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from "expo-audio";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton } from "@/components/m3";
import { CrisisRouter } from "@/components/safety/CrisisRouter";
import type { HotlineId } from "@/lib/safety/lexicon";
import { useAuth } from "@/lib/auth/AuthContext";
import { useProgression } from "@/lib/progression/useProgression";
import { createRecord } from "@/lib/records/create";
import { composeStructured } from "@/lib/capture/structured";
import { transcribeAudio } from "@/lib/llm/gemini";
import { discardRecording, recordingUriToBase64 } from "@/lib/audio/recording-uri";
import { m3 } from "@/lib/theme/m3";

type Phase = "idle" | "rec" | "stt" | "result";

function hotlineFor(ko: boolean, minor: boolean): HotlineId {
  return ko ? (minor ? "KR_1388" : "KR_109") : "GLOBAL_988";
}

function MicGlyph({ color, size = 52 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3.5a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0v-5a3 3 0 0 0-3-3z" fill={color} />
      <Path d="M6 11a6 6 0 0 0 12 0M12 17v3.5M8.5 20.5h7" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function CallReflection() {
  const { t, i18n } = useTranslation("capture");
  const ko = i18n.language === "ko";
  const locale = ko ? "ko" : "en";
  const { userId, isMinor, loading } = useAuth();
  const progression = useProgression();
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const [phase, setPhase] = useState<Phase>("idle");
  const [secs, setSecs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [crisis, setCrisis] = useState<{ visible: boolean; hotline: HotlineId }>({
    visible: false,
    hotline: "GLOBAL_988",
  });

  // Recording timer — a plain 1s interval (not an animation frame loop).
  useEffect(() => {
    if (phase !== "rec") return;
    const id = setInterval(() => setSecs((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  // Jurisdiction + age gate (Simon decision 2026-07-06): call recording is
  // offered only to ADULT users on the KR locale. Korea permits one-party-consent
  // recording of a call you are part of, but many jurisdictions (US two-party
  // states, Germany, etc.) require all-party consent, so we scope the feature to
  // the KR locale rather than open it globally, and exclude minors. Locale is the
  // only jurisdiction signal available (no geolocation) — revisit if a region
  // signal is added. The "notify the other party" disclosure lives in the idle UI.
  if (!ko || isMinor === true) {
    return (
      <DeepSpaceScreen active="home" variant="windowed" header="none" title={t("callReflection.title")} onBack={() => router.back()}>
        <View style={s.blockedWrap}>
          <RNText style={s.blockedTitle}>{t("callReflection.blockedTitle")}</RNText>
          <RNText style={s.blockedBody}>{t("callReflection.blockedBody")}</RNText>
          <MdButton variant="tonal" label={t("callReflection.goBack")} onPress={() => router.back()} style={s.blockedBtn} />
        </View>
      </DeepSpaceScreen>
    );
  }

  const mmss = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

  // ---- start recording (idle → rec) ----
  async function startRecording() {
    setNotice(null);
    if (Platform.OS === "web") {
      setNotice(t("callReflection.webUnreliable"));
      return;
    }
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setNotice(t("callReflection.micPermission"));
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setSecs(0);
      setPhase("rec");
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[call-reflection] start failed", (e as Error).message);
      setPhase("idle");
      setNotice(t("callReflection.startFailed"));
    }
  }

  // ---- stop + transcribe (rec → stt → result) ----
  async function stopAndTranscribe() {
    if (!userId || phase !== "rec") return;
    setPhase("stt");
    let recordingUri: string | null = null;
    try {
      await audioRecorder.stop();
      recordingUri = audioRecorder.uri;
      if (!recordingUri) {
        setPhase("idle");
        setNotice(t("callReflection.noRecording"));
        return;
      }
      const { base64, mimeType } = await recordingUriToBase64(recordingUri);
      const reply = await transcribeAudio({ userId, locale, base64, mimeType, minor: isMinor === true });
      // C9: a red-zone transcript was swapped server-side for the fixed crisis
      // template — route to the hotline instead of keeping it.
      if (reply.safety?.zone === "red") {
        setPhase("idle");
        setCrisis({ visible: true, hotline: hotlineFor(ko, isMinor === true) });
        return;
      }
      const text = reply.text.trim();
      if (text.length === 0) {
        setPhase("idle");
        setNotice(t("callReflection.nothingToTranscribe"));
        return;
      }
      setTranscript(text);
      setPhase("result");
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[call-reflection] transcribe failed", (e as Error).message);
      setPhase("idle");
      setNotice(t("callReflection.transcribeFailed"));
    } finally {
      // Honor the "원본 녹음은 곧 삭제돼요" promise: drop the temp audio once the
      // text has been extracted (runs on the crisis / empty / error paths too).
      await discardRecording(recordingUri);
    }
  }

  async function approve() {
    if (!userId || busy || transcript.length === 0) return;
    setBusy(true);
    try {
      const fields = { who_label: "", gist: transcript.slice(0, 80), feeling: "", followup: "" };
      await createRecord({
        userId,
        locale,
        kind: "note",
        body: transcript,
        topic: t("callReflection.recordTopic"),
        tags: ["call_reflection", "voice"],
        tier: progression.tier,
        minor: isMinor === true,
        structured: composeStructured("call_reflection", fields) ?? undefined,
      });
      router.push("/records");
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[call-reflection] save failed", (e as Error).message);
      setBusy(false);
    }
  }

  const crisisModal = (
    <CrisisRouter
      visible={crisis.visible}
      hotline={crisis.hotline}
      onClose={() => setCrisis((c) => ({ ...c, visible: false }))}
    />
  );

  // ---- STT (loading) ----
  if (phase === "stt") {
    return (
      <DeepSpaceScreen active="home" variant="windowed" header="none" title={t("callReflection.title")} onBack={() => router.back()}>
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={m3.color.primary} />
          <RNText style={s.loadingTitle}>{t("callReflection.transcribing")}</RNText>
          <RNText style={s.loadingSub}>
            {ko ? "음성을 텍스트로 바꾸고 있어요. 원본 녹음은 곧 삭제돼요." : "Turning speech into text. The recording is deleted shortly."}
          </RNText>
        </View>
        {crisisModal}
      </DeepSpaceScreen>
    );
  }

  // ---- Result ----
  if (phase === "result") {
    return (
      <DeepSpaceScreen active="home" variant="windowed" header="none" title={t("callReflection.title")} onBack={() => router.back()}>
        <ScrollView contentContainerStyle={s.resultScroll} showsVerticalScrollIndicator={false}>
          <View style={s.resultHead}>
            <Svg width={22} height={22} viewBox="0 0 24 24">
              <Path d="M12 3a9 9 0 1 0 9 9" stroke={m3.color.primary} strokeWidth={1.9} fill="none" strokeLinecap="round" />
              <Path d="M8.4 12.2l2.5 2.5L20 6" stroke={m3.color.primary} strokeWidth={1.9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <RNText style={s.resultTitle}>{t("callReflection.transcribed")}</RNText>
          </View>

          <RNText style={s.section}>{t("callReflection.transcriptLabel")}</RNText>
          <View style={s.transcriptCard}>
            <RNText style={s.transcriptText}>{transcript}</RNText>
          </View>

          <View style={s.resultBtns}>
            <MdButton variant="outlined" label={t("callReflection.discard")} onPress={() => router.push("/")} style={s.btnFlex1} />
            <MdButton variant="filled" label={t("callReflection.approve")} loading={busy} onPress={() => void approve()} style={s.btnFlex2} />
          </View>
          <View style={s.privacyRow}>
            <Svg width={14} height={14} viewBox="0 0 24 24">
              <Path d="M6 10V8a6 6 0 0 1 12 0v2M5 10h14v9H5z" stroke={m3.color.onSurfaceVariant} strokeWidth={1.7} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <RNText style={s.privacyTxt}>{ko ? "원본 음성은 저장하지 않았어요. 텍스트만 남아요." : "The original audio was never saved. Only text remains."}</RNText>
          </View>
        </ScrollView>
        {crisisModal}
      </DeepSpaceScreen>
    );
  }

  // ---- idle / rec ----
  const recording = phase === "rec";
  return (
    <DeepSpaceScreen active="home" variant="windowed" header="none" title={t("callReflection.title")} onBack={() => router.back()}>
      <View style={s.frame}>
        <View style={s.hero}>
          <View style={[s.circle, recording ? s.circleRec : s.circleIdle]}>
            <MicGlyph color={recording ? m3.color.error : m3.color.onSurfaceVariant} />
          </View>

          {recording ? (
            <>
              <RNText style={s.timer}>{mmss}</RNText>
              <RNText style={s.desc}>{t("callReflection.recordingDesc")}</RNText>
            </>
          ) : (
            <>
              <RNText style={s.title}>{t("callReflection.title")}</RNText>
              <RNText style={s.desc}>{t("callReflection.idleDesc")}</RNText>
              {/* Honest platform note: the OS blocks silent call-audio capture, so
                  this is user-started speakerphone mic capture, party-to-the-call only. */}
              <View style={s.platformCol}>
                <View style={s.platformRow}>
                  <View style={[s.osBadge, s.osHint]}><RNText style={s.osHintTxt}>{t("callReflection.howBadge")}</RNText></View>
                  <RNText style={s.platformTxt}>{t("callReflection.howText")}</RNText>
                </View>
                <View style={s.platformRow}>
                  <View style={[s.osBadge, s.osHint]}><RNText style={s.osHintTxt}>{t("callReflection.fairBadge")}</RNText></View>
                  <RNText style={s.platformTxt}>{ko ? "내가 낀 통화만 녹음돼요. 상대에게 녹음을 알려 주세요." : "Only calls you're part of. Please let the other person know."}</RNText>
                </View>
              </View>
            </>
          )}
          {notice ? <RNText style={s.notice}>{notice}</RNText> : null}
        </View>

        <View style={s.footer}>
          {recording ? (
            <>
              <MdButton variant="filled" label={t("callReflection.stopAnalyse")} onPress={() => void stopAndTranscribe()} style={s.stopBtn} />
              <MdButton
                variant="text"
                label={t("callReflection.cancelNoSave")}
                onPress={() => {
                  // "저장 안 함" must also DELETE the temp audio file — every
                  // other exit path discards it; this one left it on disk.
                  void audioRecorder
                    .stop()
                    .then(() => discardRecording(audioRecorder.uri))
                    .catch(() => {});
                  setSecs(0);
                  setPhase("idle");
                }}
              />
            </>
          ) : (
            <>
              <MdButton variant="filled" label={t("callReflection.startRecording")} onPress={() => void startRecording()} />
              <MdButton variant="text" label={t("callReflection.maybeLater")} onPress={() => router.push("/settings")} />
            </>
          )}
        </View>
      </View>
      {crisisModal}
    </DeepSpaceScreen>
  );
}

const s = StyleSheet.create({
  frame: { flex: 1 },
  hero: { flex: 1, alignItems: "center", justifyContent: "center", gap: 20, paddingHorizontal: 28 },
  circle: { width: 120, height: 120, borderRadius: 60, alignItems: "center", justifyContent: "center" },
  circleIdle: { backgroundColor: m3.color.surfaceContainerHighest },
  circleRec: { backgroundColor: m3.color.errorContainer },
  title: { color: m3.color.onSurface, fontSize: 22, fontWeight: "500", textAlign: "center" },
  timer: { fontFamily: m3.font.mono, fontSize: 30, fontWeight: "700", color: m3.color.onSurface },
  desc: { color: m3.color.onSurfaceVariant, fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 288 },
  platformCol: { alignSelf: "stretch", gap: 8, marginTop: 4 },
  platformRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: m3.color.surfaceContainerHighest },
  osBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  osHint: { backgroundColor: m3.color.secondaryContainer },
  osHintTxt: { color: m3.color.onSecondaryContainer, fontSize: 11, fontWeight: "700" },
  platformTxt: { flex: 1, color: m3.color.onSurface, fontSize: 12, lineHeight: 16 },
  notice: { color: m3.color.error, fontSize: 13, textAlign: "center", marginTop: 4 },
  footer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 18, gap: 8 },
  stopBtn: { backgroundColor: m3.color.error },
  blockedWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 32 },
  blockedTitle: { color: m3.color.onSurface, fontSize: 18, fontWeight: "600", textAlign: "center" },
  blockedBody: { color: m3.color.onSurfaceVariant, fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 300 },
  blockedBtn: { marginTop: 6 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 },
  loadingTitle: { color: m3.color.onSurface, fontSize: 16, fontWeight: "500", textAlign: "center" },
  loadingSub: { color: m3.color.onSurfaceVariant, fontSize: 13, lineHeight: 19, textAlign: "center" },
  resultScroll: { padding: m3.spacing.s4, paddingBottom: 40, gap: m3.spacing.s2 },
  resultHead: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, marginBottom: 8 },
  resultTitle: { color: m3.color.onSurface, fontSize: 22, fontWeight: "500" },
  section: { color: m3.color.onSurface, fontSize: 13, fontWeight: "500", marginTop: 12, marginBottom: 2 },
  transcriptCard: { backgroundColor: m3.color.surfaceContainerHighest, borderRadius: m3.shape.medium, padding: 14 },
  transcriptText: { color: m3.color.onSurface, fontSize: 14, lineHeight: 21 },
  resultBtns: { flexDirection: "row", gap: 8, marginTop: 22 },
  btnFlex1: { flex: 1 },
  btnFlex2: { flex: 2 },
  privacyRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12 },
  privacyTxt: { color: m3.color.onSurfaceVariant, fontSize: 12 },
});
