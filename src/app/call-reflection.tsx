// 통화 녹음 (call recording flow, docs/CALL-RECORDING-SPEC.md §5). A clone of the
// reference CallRecScreen (reference-app/sb-flows.jsx) reshaped to the finalized
// 31-callrec capture: an on-device transcription flow that never keeps the audio.
// idle → rec → stt → result. The result's "승인하고 위키에 담기" persists a real
// call_reflection note via createRecord (the app's real record path) so the flow
// is wired, not a mock. m3.* tokens only; static mic glyph + a 1s timer (no rAF
// loops) per ANDROID_QA_GUIDELINES.
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";
import Svg, { Path } from "react-native-svg";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { useProgression } from "@/lib/progression/useProgression";
import { createRecord } from "@/lib/records/create";
import { composeStructured } from "@/lib/capture/structured";
import { m3 } from "@/lib/theme/m3";

type Phase = "idle" | "rec" | "stt" | "result";

function MicGlyph({ color, size = 52 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3.5a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0v-5a3 3 0 0 0-3-3z" fill={color} />
      <Path d="M6 11a6 6 0 0 0 12 0M12 17v3.5M8.5 20.5h7" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function CallReflection() {
  const { i18n } = useTranslation("capture");
  const ko = i18n.language === "ko";
  const locale = ko ? "ko" : "en";
  const { userId, isMinor, loading } = useAuth();
  const progression = useProgression();

  const [phase, setPhase] = useState<Phase>("idle");
  const [secs, setSecs] = useState(0);
  const [busy, setBusy] = useState(false);

  // Recording timer — a plain 1s interval (not an animation frame loop).
  useEffect(() => {
    if (phase !== "rec") return;
    const id = setInterval(() => setSecs((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // On-device transcription is simulated (the reference is a prototype); the
  // audio never leaves the device and is never persisted.
  useEffect(() => {
    if (phase !== "stt") return;
    const id = setTimeout(() => setPhase("result"), 1800);
    return () => clearTimeout(id);
  }, [phase]);

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  const mmss = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

  const transcript = ko
    ? [
        { who: "상대", text: "이번 주말에 시간 괜찮아? 오랜만에 얼굴 보자." },
        { who: "나", text: "응 좋아. 요즘 일이 많아서 사람 보는 게 좀 줄었더라." },
        { who: "상대", text: "너 원래 사람 만나면 충전되는 스타일이잖아." },
      ]
    : [
        { who: "Them", text: "Free this weekend? Let's finally catch up." },
        { who: "Me", text: "Sure. Work's been busy so I've been seeing people less." },
        { who: "Them", text: "You always recharge from being around people, though." },
      ];
  const meLabel = ko ? "나" : "Me";

  async function approve() {
    if (!userId || busy) return;
    setBusy(true);
    try {
      const gist = ko ? "사람을 만나면 충전되는 결이 한 번 더 보인 통화" : "A call showing again that people recharge me";
      const fields = { who_label: "", gist, feeling: "", followup: "" };
      const body = transcript.map((l) => `${l.who}: ${l.text}`).join("\n");
      await createRecord({
        userId,
        locale,
        kind: "note",
        body,
        topic: ko ? "통화 녹음" : "Call recording",
        tags: ["call_reflection", "관계", "건강"],
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

  // ---- STT (loading) ----
  if (phase === "stt") {
    return (
      <DeepSpaceScreen active="home" variant="windowed" header="none" title={ko ? "통화 녹음" : "Call recording"} onBack={() => router.back()}>
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={m3.color.primary} />
          <RNText style={s.loadingTitle}>{ko ? "통화를 받아 적는 중" : "Transcribing the call"}</RNText>
          <RNText style={s.loadingSub}>
            {ko ? "기기 안에서 음성을 텍스트로 바꾸고 있어요. 녹음 파일은 곧 삭제돼요." : "Turning speech into text on your device. The recording is deleted shortly."}
          </RNText>
        </View>
      </DeepSpaceScreen>
    );
  }

  // ---- Result ----
  if (phase === "result") {
    return (
      <DeepSpaceScreen active="home" variant="windowed" header="none" title={ko ? "통화 녹음" : "Call recording"} onBack={() => router.back()}>
        <ScrollView contentContainerStyle={s.resultScroll} showsVerticalScrollIndicator={false}>
          <View style={s.resultHead}>
            <Svg width={22} height={22} viewBox="0 0 24 24">
              <Path d="M12 3a9 9 0 1 0 9 9" stroke={m3.color.primary} strokeWidth={1.9} fill="none" strokeLinecap="round" />
              <Path d="M8.4 12.2l2.5 2.5L20 6" stroke={m3.color.primary} strokeWidth={1.9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <RNText style={s.resultTitle}>{ko ? "녹음을 분석했어요" : "The recording is analysed"}</RNText>
          </View>

          <RNText style={s.section}>{ko ? "받아 적은 통화 · 3분 12초" : "Transcript · 3m 12s"}</RNText>
          <View style={s.transcriptCard}>
            {transcript.map((l, i) => {
              const me = l.who === meLabel;
              return (
                <View key={i} style={s.line}>
                  <View style={[s.whoBadge, me ? s.whoMe : s.whoThem]}>
                    <RNText style={[s.whoTxt, me ? s.whoTxtMe : s.whoTxtThem]}>{l.who}</RNText>
                  </View>
                  <RNText style={s.lineTxt}>{l.text}</RNText>
                </View>
              );
            })}
          </View>

          <RNText style={s.section}>{ko ? "세컨비의 제안 · 반영할까요?" : "세컨비's suggestion · reflect it?"}</RNText>
          <View style={s.sbCard}>
            <RNText style={s.sbText}>
              {ko
                ? "관계·건강 별과 이어지는 통화예요. 사람을 만나면 충전되는 결이 한 번 더 보였어요."
                : "This call links to your Relationships and Health stars. It showed again that people recharge you."}
            </RNText>
          </View>
          <View style={s.chipRow}>
            {(ko ? ["관계", "건강", "사람과 충전"] : ["Relationships", "Health", "Recharged by people"]).map((c) => (
              <View key={c} style={s.chip}><RNText style={s.chipTxt}>{c}</RNText></View>
            ))}
          </View>

          <View style={s.resultBtns}>
            <MdButton variant="outlined" label={ko ? "버리기" : "Discard"} onPress={() => router.push("/")} style={s.btnFlex1} />
            <MdButton variant="filled" label={ko ? "승인하고 위키에 담기" : "Approve and save"} loading={busy} onPress={() => void approve()} style={s.btnFlex2} />
          </View>
          <View style={s.privacyRow}>
            <Svg width={14} height={14} viewBox="0 0 24 24">
              <Path d="M6 10V8a6 6 0 0 1 12 0v2M5 10h14v9H5z" stroke={m3.color.onSurfaceVariant} strokeWidth={1.7} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <RNText style={s.privacyTxt}>{ko ? "원본 음성은 저장하지 않았어요. 텍스트만 남아요." : "The original audio was never saved. Only text remains."}</RNText>
          </View>
        </ScrollView>
      </DeepSpaceScreen>
    );
  }

  // ---- idle / rec (31-callrec) ----
  const recording = phase === "rec";
  return (
    <DeepSpaceScreen active="home" variant="windowed" header="none" title={ko ? "통화 녹음" : "Call recording"} onBack={() => router.back()}>
      <View style={s.frame}>
        <View style={s.hero}>
          <View style={[s.circle, recording ? s.circleRec : s.circleIdle]}>
            <MicGlyph color={recording ? m3.color.error : m3.color.onSurfaceVariant} />
          </View>

          {recording ? (
            <>
              <RNText style={s.timer}>{mmss}</RNText>
              <RNText style={s.desc}>{ko ? "통화를 녹음하고 있어요. 끝나면 자동으로 받아 적어요." : "Recording the call. It transcribes automatically when you stop."}</RNText>
            </>
          ) : (
            <>
              <RNText style={s.title}>{ko ? "통화 녹음" : "Call recording"}</RNText>
              <RNText style={s.desc}>
                {ko
                  ? "통화 내용을 기기에서 받아 적고, 세컨비가 어울리는 별로 엮어요. 원본 음성은 저장하지 않아요."
                  : "We transcribe the call on your device and 세컨비 links it to the right stars. The original audio is never saved."}
              </RNText>
              <View style={s.platformCol}>
                <View style={s.platformRow}>
                  <View style={[s.osBadge, s.osAndroid]}><RNText style={s.osAndroidTxt}>Android</RNText></View>
                  <RNText style={s.platformTxt}>{ko ? "통화 녹음 API로 자동 녹음" : "Auto-records via the call-recording API"}</RNText>
                </View>
                <View style={s.platformRow}>
                  <View style={[s.osBadge, s.osIos]}><RNText style={s.osIosTxt}>iOS</RNText></View>
                  <RNText style={s.platformTxt}>{ko ? "스피커폰 동시 녹음으로 우회" : "Falls back to simultaneous speakerphone capture"}</RNText>
                </View>
              </View>
            </>
          )}
        </View>

        <View style={s.footer}>
          {recording ? (
            <>
              <MdButton variant="filled" label={ko ? "녹음 멈추고 분석" : "Stop and analyse"} onPress={() => setPhase("stt")} style={s.stopBtn} />
              <MdButton variant="text" label={ko ? "취소 · 저장 안 함" : "Cancel · don't save"} onPress={() => { setSecs(0); setPhase("idle"); }} />
            </>
          ) : (
            <>
              <MdButton variant="filled" label={ko ? "녹음 시작" : "Start recording"} onPress={() => { setSecs(0); setPhase("rec"); }} />
              <MdButton variant="text" label={ko ? "다음에 할게요" : "Maybe later"} onPress={() => router.push("/settings")} />
            </>
          )}
        </View>
      </View>
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
  osAndroid: { backgroundColor: m3.accent.moodPositive },
  osAndroidTxt: { color: m3.accent.onAccentInk, fontSize: 11, fontWeight: "700" },
  osIos: { backgroundColor: m3.color.surfaceContainerLow },
  osIosTxt: { color: m3.color.onSurface, fontSize: 11, fontWeight: "700" },
  platformTxt: { flex: 1, color: m3.color.onSurface, fontSize: 12, lineHeight: 16 },
  footer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 18, gap: 8 },
  stopBtn: { backgroundColor: m3.color.error },
  // result
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 },
  loadingTitle: { color: m3.color.onSurface, fontSize: 16, fontWeight: "500", textAlign: "center" },
  loadingSub: { color: m3.color.onSurfaceVariant, fontSize: 13, lineHeight: 19, textAlign: "center" },
  resultScroll: { padding: m3.spacing.s4, paddingBottom: 40, gap: m3.spacing.s2 },
  resultHead: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, marginBottom: 8 },
  resultTitle: { color: m3.color.onSurface, fontSize: 22, fontWeight: "500" },
  section: { color: m3.color.onSurface, fontSize: 13, fontWeight: "500", marginTop: 12, marginBottom: 2 },
  transcriptCard: { backgroundColor: m3.color.surfaceContainerHighest, borderRadius: m3.shape.medium, padding: 14, gap: 10 },
  line: { flexDirection: "row", gap: 8 },
  whoBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: "flex-start" },
  whoMe: { backgroundColor: m3.color.primary },
  whoThem: { backgroundColor: m3.color.surfaceContainerHigh },
  whoTxt: { fontSize: 11, fontWeight: "700" },
  whoTxtMe: { color: m3.color.onPrimary },
  whoTxtThem: { color: m3.color.onSurfaceVariant },
  lineTxt: { flex: 1, color: m3.color.onSurface, fontSize: 14, lineHeight: 20 },
  sbCard: { backgroundColor: m3.color.tertiaryContainer, borderRadius: m3.shape.medium, padding: 14 },
  sbText: { color: m3.color.onTertiaryContainer, fontSize: 14, lineHeight: 20 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  chip: { borderWidth: 1, borderColor: m3.color.outlineVariant, borderRadius: m3.shape.small, paddingHorizontal: 11, paddingVertical: 6 },
  chipTxt: { color: m3.color.onSurfaceVariant, fontSize: 12 },
  resultBtns: { flexDirection: "row", gap: 8, marginTop: 22 },
  btnFlex1: { flex: 1 },
  btnFlex2: { flex: 2 },
  privacyRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12 },
  privacyTxt: { color: m3.color.onSurfaceVariant, fontSize: 12 },
});
