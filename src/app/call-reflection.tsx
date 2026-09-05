// Call reflection follows the F3 decision in CLAUDE.md: the app never records
// a call. The user selects an audio file that already exists on their device,
// the server turns it into text, and only text the user explicitly approves is
// saved as a call_reflection record. The original file remains the user's file.
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { DeepSpaceLoader } from "@/components/deepspace/DeepSpaceLoader";
import { MdButton } from "@/components/m3";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { CrisisRouter } from "@/components/safety/CrisisRouter";
import { recordingUriToBase64 } from "@/lib/audio/recording-uri";
import { isAbortError } from "@/lib/async/abort";
import { useAuth } from "@/lib/auth/AuthContext";
import { composeStructured } from "@/lib/capture/structured";
import { transcribeAudio } from "@/lib/llm/boundary";
import { useProgression } from "@/lib/progression/useProgression";
import { createRecord } from "@/lib/records/create";
import type { HotlineId } from "@/lib/safety/lexicon";
import { m3 } from "@/lib/theme/m3";
import { isAudioMime, MAX_AUDIO_FILE_BYTES, pickAudioFile } from "@/lib/wiki/capture-file";

type Phase = "idle" | "stt" | "result";
type UiLocale = "en" | "ko" | "es" | "pt" | "id";

const CALL_REFLECTION_COPY: Record<
  UiLocale,
  {
    title: string;
    intro: string;
    fileHint: string;
    fairText: string;
    loadingTitle: string;
    loadingSub: string;
    privacyNote: string;
    unsupported: string;
    pickFailed: string;
  }
> = {
  en: {
    title: "Reflect on a call file",
    intro: "Choose an audio file already on this device. 2nd-B does not record calls.",
    fileHint: "The file is sent only to turn speech into text. Data charges may apply.",
    fairText: "Use only calls you're part of and let the other person know.",
    loadingTitle: "Turning the call into text",
    loadingSub: "The selected file is being sent to the transcription service. 2nd-B will not save the audio.",
    privacyNote: "Your original file stays on your device. Only text you approve is saved.",
    unsupported: "Choose an audio file such as M4A, MP3, WAV, WEBM, OGG, AAC, or 3GP.",
    pickFailed: "Couldn't open that audio file. Please choose it again.",
  },
  ko: {
    title: "통화 파일 돌아보기",
    intro: "이 기기에 이미 있는 통화 음성 파일을 골라 주세요. 2nd-B는 통화를 직접 녹음하지 않아요.",
    fileHint: "음성을 글로 옮길 때만 파일을 전사 서비스로 보내요. 데이터 사용료가 들 수 있어요.",
    fairText: "내가 참여한 통화만 사용하고, 상대에게 녹음 사실을 알려 주세요.",
    loadingTitle: "통화 파일을 글로 옮기는 중",
    loadingSub: "선택한 파일을 전사 서비스로 보내고 있어요. 2nd-B는 음성 파일을 저장하지 않아요.",
    privacyNote: "원본 파일은 내 기기에 그대로 있어요. 승인한 텍스트만 저장돼요.",
    unsupported: "M4A, MP3, WAV, WEBM, OGG, AAC, 3GP 형식의 음성 파일을 골라 주세요.",
    pickFailed: "음성 파일을 열지 못했어요. 다시 골라 주세요.",
  },
  es: {
    title: "Reflexionar sobre una llamada",
    intro: "Elige un archivo de audio que ya esté en este dispositivo. 2nd-B no graba llamadas.",
    fileHint: "El archivo se envía solo para convertir la voz en texto. Puede consumir datos.",
    fairText: "Usa solo llamadas en las que participes y avisa a la otra persona.",
    loadingTitle: "Convirtiendo la llamada en texto",
    loadingSub: "El archivo se está enviando al servicio de transcripción. 2nd-B no guardará el audio.",
    privacyNote: "El archivo original sigue en tu dispositivo. Solo se guarda el texto que apruebes.",
    unsupported: "Elige un archivo de audio M4A, MP3, WAV, WEBM, OGG, AAC o 3GP.",
    pickFailed: "No se pudo abrir el archivo de audio. Elígelo de nuevo.",
  },
  pt: {
    title: "Relembrar uma chamada",
    intro: "Escolha um arquivo de áudio que já esteja neste dispositivo. O 2nd-B não grava chamadas.",
    fileHint: "O arquivo é enviado apenas para transformar fala em texto. Pode haver uso de dados.",
    fairText: "Use apenas chamadas das quais você participou e avise a outra pessoa.",
    loadingTitle: "Transformando a chamada em texto",
    loadingSub: "O arquivo está sendo enviado ao serviço de transcrição. O 2nd-B não salvará o áudio.",
    privacyNote: "O arquivo original continua no seu dispositivo. Só o texto aprovado é salvo.",
    unsupported: "Escolha um áudio M4A, MP3, WAV, WEBM, OGG, AAC ou 3GP.",
    pickFailed: "Não foi possível abrir o áudio. Escolha o arquivo novamente.",
  },
  id: {
    title: "Tinjau file panggilan",
    intro: "Pilih file audio yang sudah ada di perangkat ini. 2nd-B tidak merekam panggilan.",
    fileHint: "File hanya dikirim untuk mengubah ucapan menjadi teks. Penggunaan data mungkin berlaku.",
    fairText: "Gunakan hanya panggilan yang kamu ikuti dan beri tahu lawan bicara.",
    loadingTitle: "Mengubah panggilan menjadi teks",
    loadingSub: "File dikirim ke layanan transkripsi. 2nd-B tidak akan menyimpan audionya.",
    privacyNote: "File asli tetap di perangkatmu. Hanya teks yang kamu setujui yang disimpan.",
    unsupported: "Pilih file audio M4A, MP3, WAV, WEBM, OGG, AAC, atau 3GP.",
    pickFailed: "File audio tidak dapat dibuka. Silakan pilih lagi.",
  },
};

function uiLocaleFor(language: string): UiLocale {
  const base = language.split("-")[0];
  return base === "ko" || base === "es" || base === "pt" || base === "id" ? base : "en";
}

function hotlineFor(ko: boolean, minor: boolean): HotlineId {
  return ko ? (minor ? "KR_1388" : "KR_109") : "GLOBAL_988";
}

export default function CallReflection() {
  const { t, i18n } = useTranslation("capture");
  const uiLocale = uiLocaleFor(i18n.language);
  const ko = uiLocale === "ko";
  const locale = ko ? "ko" : "en";
  const copy = CALL_REFLECTION_COPY[uiLocale];
  const { userId, isMinor, loading } = useAuth();
  const progression = useProgression();

  const [phase, setPhase] = useState<Phase>("idle");
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [crisis, setCrisis] = useState<{ visible: boolean; hotline: HotlineId }>({
    visible: false,
    hotline: "GLOBAL_988",
  });
  const mountedRef = useRef(true);
  const transcribeAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      transcribeAbortRef.current?.abort();
    };
  }, []);

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  // Keep the existing adult + KR availability gate. F3 changes the capture
  // mechanism, not the consent and jurisdiction scope of recorded call files.
  if (!ko || isMinor === true) {
    return (
      <DeepSpaceScreen active="home" variant="windowed" header="none" title={copy.title} onBack={() => router.back()}>
        <View style={s.blockedWrap}>
          <RNText style={s.blockedTitle}>{t("callReflection.blockedTitle")}</RNText>
          <RNText style={s.blockedBody}>{t("callReflection.blockedBody")}</RNText>
          <MdButton variant="tonal" label={t("callReflection.goBack")} onPress={() => router.back()} style={s.blockedBtn} />
        </View>
      </DeepSpaceScreen>
    );
  }

  async function chooseAndTranscribe() {
    if (!userId || phase === "stt") return;
    setNotice(null);
    setSelectedName(null);

    let file;
    try {
      file = await pickAudioFile();
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[call-reflection] file pick failed", (e as Error).message);
      if (mountedRef.current) setNotice(copy.pickFailed);
      return;
    }
    if (!mountedRef.current || !file) return;
    setSelectedName(file.name);

    if (!isAudioMime(file.mimeType)) {
      setNotice(copy.unsupported);
      return;
    }
    if (file.size > MAX_AUDIO_FILE_BYTES) {
      setNotice(t("file.audioTooLarge", { mb: Math.floor(MAX_AUDIO_FILE_BYTES / 1_000_000) }));
      return;
    }

    const controller = new AbortController();
    transcribeAbortRef.current?.abort();
    transcribeAbortRef.current = controller;
    setPhase("stt");
    try {
      const { base64 } = await recordingUriToBase64(file.uri);
      const reply = await transcribeAudio({
        userId,
        locale,
        base64,
        // DocumentPicker's normalized MIME is more reliable for file:// URIs
        // than the blob type returned by fetch on Android.
        mimeType: file.mimeType,
        minor: isMinor === true,
        signal: controller.signal,
      });
      if (!mountedRef.current || transcribeAbortRef.current !== controller) return;

      // C9: a red-zone transcript is swapped server-side for the fixed crisis
      // response. Route to the hotline instead of showing or saving that text.
      if (reply.safety?.zone === "red") {
        setPhase("idle");
        setSelectedName(null);
        setCrisis({ visible: true, hotline: hotlineFor(ko, isMinor === true) });
        return;
      }
      const text = reply.text.trim();
      if (text.length === 0) {
        setPhase("idle");
        setNotice(t("file.transcriptEmpty"));
        return;
      }
      setTranscript(text);
      setPhase("result");
    } catch (e) {
      if (isAbortError(e) || !mountedRef.current || transcribeAbortRef.current !== controller) return;
      if (typeof console !== "undefined") console.warn("[call-reflection] transcribe failed", (e as Error).message);
      setPhase("idle");
      setNotice(t("file.transcribeFailed"));
    } finally {
      if (transcribeAbortRef.current === controller) transcribeAbortRef.current = null;
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

  function discardTranscript() {
    setTranscript("");
    setSelectedName(null);
    setNotice(null);
    setPhase("idle");
  }

  const crisisModal = (
    <CrisisRouter
      visible={crisis.visible}
      hotline={crisis.hotline}
      onClose={() => setCrisis((current) => ({ ...current, visible: false }))}
    />
  );

  if (phase === "stt") {
    return (
      <DeepSpaceScreen active="home" variant="windowed" header="none" title={copy.title} onBack={() => router.back()}>
        <View style={s.loadingWrap}>
          <DeepSpaceLoader variant="dots" caption={copy.loadingTitle} />
          {selectedName ? (
            <View style={s.selectedRow}>
              <PixelGlyph name="upload_file" color={m3.color.primary} size={18} />
              <RNText style={s.selectedText} numberOfLines={1}>
                {t("file.selected")}: {selectedName}
              </RNText>
            </View>
          ) : null}
          <RNText style={s.loadingSub}>{copy.loadingSub}</RNText>
        </View>
        {crisisModal}
      </DeepSpaceScreen>
    );
  }

  if (phase === "result") {
    return (
      <DeepSpaceScreen active="home" variant="windowed" header="none" title={copy.title} onBack={() => router.back()}>
        <ScrollView contentContainerStyle={s.resultScroll} showsVerticalScrollIndicator={false}>
          <View style={s.resultHead}>
            <PixelGlyph name="task_alt" color={m3.color.primary} size={24} />
            <RNText style={s.resultTitle}>{t("callReflection.transcribed")}</RNText>
          </View>

          {selectedName ? (
            <RNText style={s.fileName} numberOfLines={1}>
              {t("file.selected")}: {selectedName}
            </RNText>
          ) : null}
          <RNText style={s.section}>{t("callReflection.transcriptLabel")}</RNText>
          <View style={s.transcriptCard}>
            <RNText style={s.transcriptText}>{transcript}</RNText>
          </View>

          <View style={s.resultBtns}>
            <MdButton variant="outlined" label={t("callReflection.discard")} onPress={discardTranscript} style={s.btnFlex1} />
            <MdButton variant="filled" label={t("callReflection.approve")} loading={busy} onPress={() => void approve()} style={s.btnFlex2} />
          </View>
          <View style={s.privacyRow}>
            <PixelGlyph name="lock" color={m3.color.onSurfaceVariant} size={16} />
            <RNText style={s.privacyTxt}>{copy.privacyNote}</RNText>
          </View>
        </ScrollView>
        {crisisModal}
      </DeepSpaceScreen>
    );
  }

  return (
    <DeepSpaceScreen active="home" variant="windowed" header="none" title={copy.title} onBack={() => router.back()}>
      <View style={s.frame}>
        <View style={s.hero}>
          <View style={s.uploadTile}>
            <PixelGlyph name="upload_file" color={m3.color.primary} size={52} />
          </View>
          <RNText style={s.title}>{copy.title}</RNText>
          <RNText style={s.desc}>{copy.intro}</RNText>

          <View style={s.infoCol}>
            <View style={s.infoRow}>
              <View style={s.infoBadge}>
                <RNText style={s.infoBadgeText}>{t("callReflection.howBadge")}</RNText>
              </View>
              <RNText style={s.infoText}>{copy.fileHint}</RNText>
            </View>
            <View style={s.infoRow}>
              <View style={s.infoBadge}>
                <RNText style={s.infoBadgeText}>{t("callReflection.fairBadge")}</RNText>
              </View>
              <RNText style={s.infoText}>{copy.fairText}</RNText>
            </View>
          </View>

          {selectedName ? (
            <RNText style={s.fileName} numberOfLines={1}>
              {t("file.selected")}: {selectedName}
            </RNText>
          ) : null}
          {notice ? <RNText style={s.notice}>{notice}</RNText> : null}
        </View>

        <View style={s.footer}>
          <MdButton variant="filled" label={t("file.pick")} onPress={() => void chooseAndTranscribe()} />
          <MdButton variant="text" label={t("callReflection.maybeLater")} onPress={() => router.back()} />
        </View>
      </View>
      {crisisModal}
    </DeepSpaceScreen>
  );
}

const s = StyleSheet.create({
  frame: { flex: 1 },
  hero: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18, paddingHorizontal: 28 },
  uploadTile: {
    width: 120,
    height: 120,
    borderRadius: m3.shape.none,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: m3.color.primaryContainer,
  },
  title: { color: m3.color.onSurface, fontSize: 22, fontWeight: "500", textAlign: "center" },
  desc: { color: m3.color.onSurfaceVariant, fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 300 },
  infoCol: { alignSelf: "stretch", gap: 8, marginTop: 4 },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: m3.shape.none,
    backgroundColor: m3.color.surfaceContainerHighest,
  },
  infoBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: m3.shape.none, backgroundColor: m3.color.secondaryContainer },
  infoBadgeText: { color: m3.color.onSecondaryContainer, fontSize: 11, fontWeight: "700" },
  infoText: { flex: 1, color: m3.color.onSurface, fontSize: 12, lineHeight: 17 },
  fileName: { alignSelf: "stretch", color: m3.color.onSurfaceVariant, fontSize: 12, textAlign: "center" },
  notice: { color: m3.color.error, fontSize: 13, lineHeight: 18, textAlign: "center" },
  footer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 18, gap: 8 },
  blockedWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 32 },
  blockedTitle: { color: m3.color.onSurface, fontSize: 18, fontWeight: "600", textAlign: "center" },
  blockedBody: { color: m3.color.onSurfaceVariant, fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 300 },
  blockedBtn: { marginTop: 6 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 },
  selectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: 300,
    minHeight: 44,
    paddingHorizontal: 12,
    backgroundColor: m3.color.surfaceContainerHighest,
  },
  selectedText: { flexShrink: 1, color: m3.color.onSurface, fontSize: 12 },
  loadingSub: { color: m3.color.onSurfaceVariant, fontSize: 13, lineHeight: 19, textAlign: "center", maxWidth: 304 },
  resultScroll: { padding: m3.spacing.s4, paddingBottom: 40, gap: m3.spacing.s2 },
  resultHead: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, marginBottom: 8 },
  resultTitle: { color: m3.color.onSurface, fontSize: 22, fontWeight: "500" },
  section: { color: m3.color.onSurface, fontSize: 13, fontWeight: "500", marginTop: 12, marginBottom: 2 },
  transcriptCard: { backgroundColor: m3.color.surfaceContainerHighest, borderRadius: m3.shape.none, padding: 14 },
  transcriptText: { color: m3.color.onSurface, fontSize: 14, lineHeight: 21 },
  resultBtns: { flexDirection: "row", gap: 8, marginTop: 22 },
  btnFlex1: { flex: 1 },
  btnFlex2: { flex: 2 },
  privacyRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12 },
  privacyTxt: { flexShrink: 1, color: m3.color.onSurfaceVariant, fontSize: 12, lineHeight: 17, textAlign: "center" },
});
