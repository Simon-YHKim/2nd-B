import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg from "react-native-svg";

import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { PixelStarSvg } from "@/components/pixel/PixelStarSvg";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { Text } from "@/components/ui/Text";
import {
  isAvailableUiLocale,
  systemLocaleFor,
  type AvailableUiLocale,
  type SystemLocale,
} from "@/lib/i18n/locales";
import { createRecord, listRecentRecords } from "@/lib/records/create";
import { m3 } from "@/lib/theme/m3";
import { deepSpace } from "@/lib/theme/tokens";

// Screen-local data contract and pure state helpers. Exported for focused tests;
// keeping them here preserves the five-file migration boundary.
export const TTFV_REVIEW_LIMIT = 12;
export const TTFV_LOAD_TIMEOUT_MS = 8_000;
export const TTFV_EXCERPT_CHARS = 180;

export type TTFVChoice = "affirm" | "soft";

export interface TTFVReview {
  id: string;
  excerpt: string;
  createdAt: string;
  truncated: boolean;
}

export type TTFVContentState =
  | { userId: string; kind: "loading" }
  | { userId: string; kind: "empty" }
  | { userId: string; kind: "error" }
  | { userId: string; kind: "review"; review: TTFVReview };

export type TTFVSaveState =
  | { choice: null; status: "idle" }
  | { choice: TTFVChoice; status: "saving" | "error" | "saved" };

interface TTFVRecordRow {
  id?: unknown;
  body?: unknown;
  created_at?: unknown;
  tags?: unknown;
}

export type TTFVRecordReader = (
  userId: string,
  limit: number,
) => Promise<readonly TTFVRecordRow[] | null | undefined>;

export interface TTFVCopy {
  eyebrow: string;
  title: string;
  authLoading: string;
  dataLoading: string;
  graphicA11y: string;
  recordLabel: string;
  recordedAt: string;
  excerptDisclosure: string;
  reviewQuestion: string;
  reviewBody: string;
  affirm: string;
  soft: string;
  saving: string;
  saveErrorTitle: string;
  saveErrorBody: string;
  saveRetry: string;
  savedTitle: string;
  savedBody: string;
  homeAction: string;
  emptyTitle: string;
  emptyBody: string;
  emptyAction: string;
  loadErrorTitle: string;
  loadErrorBody: string;
  loadRetry: string;
  timeUnknown: string;
  recordPrefix: string;
  recordAffirm: string;
  recordSoft: string;
}

export const TTFV_COPY: Record<AvailableUiLocale, TTFVCopy> = {
  en: {
    eyebrow: "FIRST RECORD",
    title: "Look back at one record",
    authLoading: "Checking your account...",
    dataLoading: "Finding your latest record...",
    graphicA11y: "A pixel star beside a record card",
    recordLabel: "YOUR LATEST RECORD",
    recordedAt: "Recorded",
    excerptDisclosure: "A shortened excerpt is shown.",
    reviewQuestion: "Does this record still feel like you today?",
    reviewBody: "Only your words and when you wrote them are used for this review.",
    affirm: "Yes, it does",
    soft: "A little different",
    saving: "Saving your choice...",
    saveErrorTitle: "Your choice was not saved",
    saveErrorBody: "Your choice is still selected. Try again when you are ready.",
    saveRetry: "Try saving again",
    savedTitle: "Your review is saved",
    savedBody: "We kept your choice without changing a star or drawing a new conclusion.",
    homeAction: "Go to constellation",
    emptyTitle: "Start with your own words",
    emptyBody: "There is no record to review yet. Capture one thought and come back.",
    emptyAction: "Capture a thought",
    loadErrorTitle: "We could not load a record",
    loadErrorBody: "This is different from having no records. Check your connection and try again.",
    loadRetry: "Try loading again",
    timeUnknown: "Time unavailable",
    recordPrefix: "First record review",
    recordAffirm: "This record still feels like me.",
    recordSoft: "This record feels a little different now.",
  },
  ko: {
    eyebrow: "첫 기록",
    title: "기록 한 건 돌아보기",
    authLoading: "계정을 확인하고 있어요...",
    dataLoading: "가장 최근 기록을 찾고 있어요...",
    graphicA11y: "기록 카드 옆의 픽셀 별",
    recordLabel: "가장 최근 기록",
    recordedAt: "기록한 때",
    excerptDisclosure: "긴 기록은 짧게 잘라 보여줘요.",
    reviewQuestion: "이 기록이 지금의 나와도 맞나요?",
    reviewBody: "이 검토에는 내가 쓴 말과 기록한 때만 사용해요.",
    affirm: "맞아요",
    soft: "조금 달라요",
    saving: "선택을 저장하고 있어요...",
    saveErrorTitle: "선택을 저장하지 못했어요",
    saveErrorBody: "선택은 그대로 남아 있어요. 준비되면 다시 시도해 주세요.",
    saveRetry: "다시 저장하기",
    savedTitle: "검토를 저장했어요",
    savedBody: "새로운 결론을 만들거나 별을 바꾸지 않고 선택만 남겼어요.",
    homeAction: "별자리로 가기",
    emptyTitle: "내 말로 먼저 시작해요",
    emptyBody: "아직 돌아볼 기록이 없어요. 생각 하나를 담고 다시 와 주세요.",
    emptyAction: "생각 담기",
    loadErrorTitle: "기록을 불러오지 못했어요",
    loadErrorBody: "기록이 없는 상태와는 달라요. 연결을 확인하고 다시 시도해 주세요.",
    loadRetry: "다시 불러오기",
    timeUnknown: "기록 시각을 알 수 없음",
    recordPrefix: "첫 기록 검토",
    recordAffirm: "이 기록은 지금도 나와 맞아요.",
    recordSoft: "이 기록은 지금의 나와 조금 달라요.",
  },
  es: {
    eyebrow: "PRIMER REGISTRO",
    title: "Revisa un registro",
    authLoading: "Comprobando tu cuenta...",
    dataLoading: "Buscando tu registro más reciente...",
    graphicA11y: "Una estrella de píxeles junto a una tarjeta de registro",
    recordLabel: "TU REGISTRO MÁS RECIENTE",
    recordedAt: "Registrado",
    excerptDisclosure: "Se muestra un fragmento abreviado.",
    reviewQuestion: "¿Este registro todavía se parece a ti hoy?",
    reviewBody: "Esta revisión solo usa tus palabras y el momento en que las escribiste.",
    affirm: "Sí, así es",
    soft: "Un poco diferente",
    saving: "Guardando tu elección...",
    saveErrorTitle: "Tu elección no se guardó",
    saveErrorBody: "Tu elección sigue marcada. Inténtalo de nuevo cuando quieras.",
    saveRetry: "Intentar guardar de nuevo",
    savedTitle: "Tu revisión está guardada",
    savedBody: "Guardamos tu elección sin cambiar ninguna estrella ni sacar una conclusión nueva.",
    homeAction: "Ir a la constelación",
    emptyTitle: "Empieza con tus propias palabras",
    emptyBody: "Todavía no hay un registro para revisar. Guarda una idea y vuelve después.",
    emptyAction: "Guardar una idea",
    loadErrorTitle: "No pudimos cargar un registro",
    loadErrorBody: "Esto no significa que no haya registros. Revisa tu conexión e inténtalo de nuevo.",
    loadRetry: "Intentar cargar de nuevo",
    timeUnknown: "Hora no disponible",
    recordPrefix: "Revisión del primer registro",
    recordAffirm: "Este registro todavía se parece a mí.",
    recordSoft: "Este registro se siente un poco diferente ahora.",
  },
  pt: {
    eyebrow: "PRIMEIRO REGISTRO",
    title: "Reveja um registro",
    authLoading: "Verificando sua conta...",
    dataLoading: "Buscando seu registro mais recente...",
    graphicA11y: "Uma estrela de pixels ao lado de um cartão de registro",
    recordLabel: "SEU REGISTRO MAIS RECENTE",
    recordedAt: "Registrado",
    excerptDisclosure: "Um trecho abreviado é mostrado.",
    reviewQuestion: "Este registro ainda parece com você hoje?",
    reviewBody: "Esta revisão usa apenas suas palavras e o momento em que você as escreveu.",
    affirm: "Sim, parece",
    soft: "Um pouco diferente",
    saving: "Salvando sua escolha...",
    saveErrorTitle: "Sua escolha não foi salva",
    saveErrorBody: "Sua escolha continua marcada. Tente novamente quando quiser.",
    saveRetry: "Tentar salvar novamente",
    savedTitle: "Sua revisão foi salva",
    savedBody: "Guardamos sua escolha sem mudar nenhuma estrela nem criar uma nova conclusão.",
    homeAction: "Ir para a constelação",
    emptyTitle: "Comece com suas próprias palavras",
    emptyBody: "Ainda não há um registro para revisar. Guarde uma ideia e volte depois.",
    emptyAction: "Guardar uma ideia",
    loadErrorTitle: "Não foi possível carregar um registro",
    loadErrorBody: "Isso é diferente de não ter registros. Verifique sua conexão e tente novamente.",
    loadRetry: "Tentar carregar novamente",
    timeUnknown: "Horário indisponível",
    recordPrefix: "Revisão do primeiro registro",
    recordAffirm: "Este registro ainda parece comigo.",
    recordSoft: "Este registro parece um pouco diferente agora.",
  },
  id: {
    eyebrow: "CATATAN PERTAMA",
    title: "Tinjau satu catatan",
    authLoading: "Memeriksa akunmu...",
    dataLoading: "Mencari catatan terbarumu...",
    graphicA11y: "Bintang piksel di samping kartu catatan",
    recordLabel: "CATATAN TERBARUMU",
    recordedAt: "Dicatat",
    excerptDisclosure: "Kutipan yang dipersingkat ditampilkan.",
    reviewQuestion: "Apakah catatan ini masih terasa seperti dirimu hari ini?",
    reviewBody: "Tinjauan ini hanya memakai kata-katamu dan waktu saat kamu menulisnya.",
    affirm: "Ya, masih",
    soft: "Sedikit berbeda",
    saving: "Menyimpan pilihanmu...",
    saveErrorTitle: "Pilihanmu belum tersimpan",
    saveErrorBody: "Pilihanmu tetap terpilih. Coba lagi saat kamu siap.",
    saveRetry: "Coba simpan lagi",
    savedTitle: "Tinjauanmu tersimpan",
    savedBody: "Kami menyimpan pilihanmu tanpa mengubah bintang atau membuat kesimpulan baru.",
    homeAction: "Ke konstelasi",
    emptyTitle: "Mulai dengan kata-katamu sendiri",
    emptyBody: "Belum ada catatan untuk ditinjau. Simpan satu pikiran lalu kembali lagi.",
    emptyAction: "Simpan satu pikiran",
    loadErrorTitle: "Catatan tidak dapat dimuat",
    loadErrorBody: "Ini berbeda dari tidak memiliki catatan. Periksa koneksi lalu coba lagi.",
    loadRetry: "Coba muat lagi",
    timeUnknown: "Waktu tidak tersedia",
    recordPrefix: "Tinjauan catatan pertama",
    recordAffirm: "Catatan ini masih terasa seperti diriku.",
    recordSoft: "Catatan ini terasa sedikit berbeda sekarang.",
  },
};

const DATE_LOCALE: Record<AvailableUiLocale, string> = {
  en: "en-US",
  ko: "ko-KR",
  es: "es-ES",
  pt: "pt-BR",
  id: "id-ID",
};

export class TTFVLoadTimeoutError extends Error {
  constructor() {
    super("TTFV record load timed out");
    this.name = "TTFVLoadTimeoutError";
  }
}

export function uiLocaleFor(language: string | null | undefined): AvailableUiLocale {
  const candidate = language?.toLowerCase().split("-")[0];
  return isAvailableUiLocale(candidate) ? candidate : "en";
}

export function formatTTFVRecordTime(
  createdAt: string,
  locale: AvailableUiLocale,
  fallback: string,
): string {
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(DATE_LOCALE[locale], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function normalizedExcerpt(body: unknown): { excerpt: string; truncated: boolean } | null {
  if (typeof body !== "string") return null;
  const normalized = body.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  const characters = Array.from(normalized);
  if (characters.length <= TTFV_EXCERPT_CHARS) return { excerpt: normalized, truncated: false };
  return {
    excerpt: `${characters.slice(0, TTFV_EXCERPT_CHARS - 1).join("").trimEnd()}…`,
    truncated: true,
  };
}

function isFirstLight(row: TTFVRecordRow): boolean {
  return Array.isArray(row.tags) && row.tags.some((tag) => tag === "first_light");
}

export async function loadTTFVReview(
  userId: string,
  reader: TTFVRecordReader,
  timeoutMs = TTFV_LOAD_TIMEOUT_MS,
): Promise<TTFVReview | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new TTFVLoadTimeoutError()), timeoutMs);
  });

  try {
    const rows = await Promise.race([reader(userId, TTFV_REVIEW_LIMIT), timeout]);
    for (const row of rows ?? []) {
      if (isFirstLight(row)) continue;
      if (typeof row.id !== "string" || typeof row.created_at !== "string") continue;
      const excerpt = normalizedExcerpt(row.body);
      if (!excerpt) continue;
      return { id: row.id, createdAt: row.created_at, ...excerpt };
    }
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function visibleTTFVContent(state: TTFVContentState, userId: string): TTFVContentState {
  return state.userId === userId ? state : { userId, kind: "loading" };
}

export function shouldMarkTTFVSeen(state: TTFVContentState): boolean {
  return state.kind === "review" || state.kind === "empty";
}

export const IDLE_TTFV_SAVE: TTFVSaveState = { choice: null, status: "idle" };

export function beginTTFVSave(choice: TTFVChoice): TTFVSaveState {
  return { choice, status: "saving" };
}

export function failTTFVSave(state: TTFVSaveState): TTFVSaveState {
  return state.choice ? { choice: state.choice, status: "error" } : state;
}

export function completeTTFVSave(state: TTFVSaveState): TTFVSaveState {
  return state.choice ? { choice: state.choice, status: "saved" } : state;
}

export function buildFirstLightRecordInput(args: {
  userId: string;
  minor: boolean;
  systemLocale: SystemLocale;
  uiLocale: AvailableUiLocale;
  choice: TTFVChoice;
}) {
  const copy = TTFV_COPY[args.uiLocale];
  return {
    userId: args.userId,
    locale: args.systemLocale,
    minor: args.minor,
    kind: "note" as const,
    body: `${copy.recordPrefix}: ${args.choice === "soft" ? copy.recordSoft : copy.recordAffirm}`,
    withFollowup: false,
    tags: ["first_light", `first_light:${args.choice}`],
  };
}

type TTFVScreenProps =
  | { mode: "auth-loading" }
  | {
      mode: "authenticated";
      userId: string;
      minor: boolean;
      onContentReady: () => void;
    };

const EMPTY_LOADING_STATE: TTFVContentState = { userId: "", kind: "loading" };

export function TTFVScreen(props: TTFVScreenProps) {
  const { i18n } = useTranslation("deepspace");
  const uiLocale = uiLocaleFor(i18n.language);
  const copy = TTFV_COPY[uiLocale];
  const userId = props.mode === "authenticated" ? props.userId : null;
  const minor = props.mode === "authenticated" ? props.minor : true;
  const onContentReady = props.mode === "authenticated" ? props.onContentReady : null;

  const [content, setContent] = useState<TTFVContentState>(EMPTY_LOADING_STATE);
  const [save, setSave] = useState<TTFVSaveState>(IDLE_TTFV_SAVE);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const loadRequestRef = useRef(0);
  const saveRequestRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const currentUserRef = useRef<string | null>(userId);
  const seenUserRef = useRef<string | null>(null);
  currentUserRef.current = userId;

  useEffect(() => {
    const requestId = ++loadRequestRef.current;
    saveRequestRef.current += 1;
    saveInFlightRef.current = false;
    setSave(IDLE_TTFV_SAVE);

    if (!userId) {
      setContent(EMPTY_LOADING_STATE);
      return () => {
        if (loadRequestRef.current === requestId) loadRequestRef.current += 1;
      };
    }

    setContent({ userId, kind: "loading" });
    void loadTTFVReview(userId, listRecentRecords)
      .then((review) => {
        if (loadRequestRef.current !== requestId || currentUserRef.current !== userId) return;
        setContent(review ? { userId, kind: "review", review } : { userId, kind: "empty" });
      })
      .catch(() => {
        if (loadRequestRef.current !== requestId || currentUserRef.current !== userId) return;
        setContent({ userId, kind: "error" });
      });

    return () => {
      if (loadRequestRef.current === requestId) loadRequestRef.current += 1;
      saveRequestRef.current += 1;
      saveInFlightRef.current = false;
    };
  }, [loadAttempt, userId]);

  const visibleContent = userId ? visibleTTFVContent(content, userId) : EMPTY_LOADING_STATE;

  useEffect(() => {
    if (!userId || !onContentReady || !shouldMarkTTFVSeen(visibleContent)) return;
    if (seenUserRef.current === userId) return;
    seenUserRef.current = userId;
    onContentReady();
  }, [onContentReady, userId, visibleContent]);

  async function saveChoice(choice: TTFVChoice) {
    if (!userId || visibleContent.kind !== "review" || saveInFlightRef.current) return;
    if (save.status === "saved") return;

    const requestId = ++saveRequestRef.current;
    const saving = beginTTFVSave(choice);
    saveInFlightRef.current = true;
    setSave(saving);

    try {
      await createRecord(
        buildFirstLightRecordInput({
          userId,
          minor,
          systemLocale: systemLocaleFor(i18n.language),
          uiLocale,
          choice,
        }),
      );
      if (saveRequestRef.current !== requestId || currentUserRef.current !== userId) return;
      setSave(completeTTFVSave(saving));
    } catch {
      if (saveRequestRef.current !== requestId || currentUserRef.current !== userId) return;
      setSave(failTTFVSave(saving));
    } finally {
      if (saveRequestRef.current === requestId) saveInFlightRef.current = false;
    }
  }

  const graphicTone =
    visibleContent.kind === "error"
      ? m3.color.error
      : visibleContent.kind === "empty"
        ? m3.color.tertiary
        : m3.color.primary;

  return (
    <SafeAreaView style={styles.frame} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text variant="caption" style={styles.eyebrow}>
          {copy.eyebrow}
        </Text>
        <Text variant="heading" style={styles.title}>
          {copy.title}
        </Text>

        <View style={styles.graphic} accessible accessibilityLabel={copy.graphicA11y}>
          <Svg width={104} height={86} viewBox="0 0 104 86">
            <PixelStarSvg cx={52} cy={38} r={18} fill={m3.color.surfaceContainerHighest} />
            <PixelStarSvg cx={52} cy={38} r={10} fill={graphicTone} />
            <PixelStarSvg cx={52} cy={38} r={4} fill={m3.color.onPrimary} />
          </Svg>
          <PixelSurface
            variant="inset"
            background={m3.color.surfaceContainer}
            style={styles.graphicBadge}
            contentStyle={styles.graphicBadgeContent}
          >
            <PixelGlyph name="article" color={m3.color.onSurfaceVariant} size={24} />
          </PixelSurface>
        </View>

        {props.mode === "auth-loading" ? (
          <MessageSurface glyph="schedule" title={copy.authLoading} />
        ) : visibleContent.kind === "loading" ? (
          <MessageSurface glyph="schedule" title={copy.dataLoading} />
        ) : visibleContent.kind === "empty" ? (
          <MessageSurface glyph="add" title={copy.emptyTitle} body={copy.emptyBody}>
            <Action label={copy.emptyAction} glyph="add" primary onPress={() => router.push("/capture")} />
          </MessageSurface>
        ) : visibleContent.kind === "error" ? (
          <MessageSurface glyph="warning" title={copy.loadErrorTitle} body={copy.loadErrorBody}>
            <Action label={copy.loadRetry} glyph="refresh" onPress={() => setLoadAttempt((attempt) => attempt + 1)} />
          </MessageSurface>
        ) : save.status === "saved" ? (
          <MessageSurface glyph="check" title={copy.savedTitle} body={copy.savedBody}>
            <Action label={copy.homeAction} glyph="star" primary onPress={() => router.replace("/")} />
          </MessageSurface>
        ) : (
          <View style={styles.reviewWrap}>
            <PixelSurface variant="inset" background={m3.color.surfaceContainer} contentStyle={styles.recordCard}>
              <View style={styles.recordHeader}>
                <PixelGlyph name="article" color={m3.color.primary} size={24} />
                <View style={styles.recordHeaderText}>
                  <Text variant="caption" style={styles.recordLabel} numberOfLines={1}>
                    {copy.recordLabel}
                  </Text>
                  <Text variant="caption" style={styles.recordTime} numberOfLines={1}>
                    {copy.recordedAt}: {formatTTFVRecordTime(visibleContent.review.createdAt, uiLocale, copy.timeUnknown)}
                  </Text>
                </View>
              </View>
              <Text variant="body" style={styles.excerpt} numberOfLines={4}>
                {visibleContent.review.excerpt}
              </Text>
              {visibleContent.review.truncated ? (
                <Text variant="caption" style={styles.disclosure}>
                  {copy.excerptDisclosure}
                </Text>
              ) : null}
            </PixelSurface>

            <View style={styles.questionBlock}>
              <Text variant="heading" style={styles.question}>
                {copy.reviewQuestion}
              </Text>
              <Text variant="body" style={styles.reviewBody}>
                {copy.reviewBody}
              </Text>
            </View>

            <View style={styles.actions}>
              <Action
                label={copy.affirm}
                glyph="check"
                primary
                disabled={save.status === "saving"}
                selected={save.choice === "affirm"}
                busy={save.status === "saving" && save.choice === "affirm"}
                onPress={() => {
                  void saveChoice("affirm");
                }}
              />
              <Action
                label={copy.soft}
                glyph="edit"
                disabled={save.status === "saving"}
                selected={save.choice === "soft"}
                busy={save.status === "saving" && save.choice === "soft"}
                onPress={() => {
                  void saveChoice("soft");
                }}
              />
            </View>

            {save.status === "saving" ? (
              <Text variant="caption" style={styles.statusText} accessibilityLiveRegion="polite">
                {copy.saving}
              </Text>
            ) : save.status === "error" ? (
              <PixelSurface variant="frame" background={m3.color.errorContainer} contentStyle={styles.saveError}>
                <View style={styles.errorHeading}>
                  <PixelGlyph name="warning" color={m3.color.onErrorContainer} size={24} />
                  <Text variant="body" style={styles.saveErrorTitle}>
                    {copy.saveErrorTitle}
                  </Text>
                </View>
                <Text variant="body" style={styles.saveErrorBody}>
                  {copy.saveErrorBody}
                </Text>
                <Action
                  label={copy.saveRetry}
                  glyph="refresh"
                  onPress={() => {
                    if (save.choice) void saveChoice(save.choice);
                  }}
                />
              </PixelSurface>
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function MessageSurface({
  glyph,
  title,
  body,
  children,
}: {
  glyph: "add" | "check" | "schedule" | "warning";
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <PixelSurface
      variant="bevel"
      background={m3.color.surfaceContainerHigh}
      style={styles.messageSurface}
      contentStyle={styles.messageContent}
    >
      <PixelGlyph name={glyph} color={m3.color.primary} size={24} />
      <Text variant="heading" style={styles.messageTitle}>
        {title}
      </Text>
      {body ? (
        <Text variant="body" style={styles.messageBody}>
          {body}
        </Text>
      ) : null}
      {children}
    </PixelSurface>
  );
}

function Action({
  label,
  glyph,
  onPress,
  primary = false,
  disabled = false,
  selected = false,
  busy = false,
}: {
  label: string;
  glyph: "add" | "check" | "edit" | "refresh" | "star";
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  selected?: boolean;
  busy?: boolean;
}) {
  const background = primary ? m3.color.primary : m3.color.surfaceContainerHighest;
  const color = primary ? m3.color.onPrimary : m3.color.onSurface;
  return (
    <PixelPressable
      fullWidth
      onPress={onPress}
      disabled={disabled}
      background={background}
      accessibilityLabel={label}
      accessibilityState={{ selected, busy }}
      contentStyle={styles.actionContent}
    >
      <PixelGlyph name={glyph} color={color} size={24} />
      <Text variant="body" style={[styles.actionLabel, { color }]} numberOfLines={2}>
        {label}
      </Text>
    </PixelPressable>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: deepSpace.bg },
  scroll: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: m3.spacing.s6,
    paddingTop: m3.spacing.s8,
    paddingBottom: m3.spacing.s8,
    gap: m3.spacing.s3,
  },
  eyebrow: {
    color: m3.color.primary,
    fontSize: 10,
    letterSpacing: 2,
    textAlign: "center",
    paddingBottom: m3.spacing.s1,
  },
  title: { color: m3.color.onSurface, fontSize: 20, lineHeight: 28, textAlign: "center", paddingBottom: m3.spacing.s1 },
  graphic: { width: 132, height: 96, alignItems: "center", justifyContent: "center" },
  graphicBadge: { position: "absolute", right: 0, bottom: 2 },
  graphicBadgeContent: { paddingHorizontal: m3.spacing.s2, paddingVertical: m3.spacing.s2 },
  messageSurface: { width: "100%", maxWidth: 342, marginTop: m3.spacing.s4 },
  messageContent: { alignItems: "center", gap: m3.spacing.s3, paddingVertical: m3.spacing.s6 },
  messageTitle: { color: m3.color.onSurface, fontSize: 18, lineHeight: 26, textAlign: "center", paddingBottom: 2 },
  messageBody: { color: m3.color.onSurfaceVariant, fontSize: 14, lineHeight: 21, textAlign: "center", paddingBottom: 2 },
  reviewWrap: { width: "100%", maxWidth: 342, gap: m3.spacing.s4 },
  recordCard: { gap: m3.spacing.s3, paddingVertical: m3.spacing.s4 },
  recordHeader: { flexDirection: "row", alignItems: "center", gap: m3.spacing.s3 },
  recordHeaderText: { flex: 1, gap: m3.spacing.s1 },
  recordLabel: { color: m3.color.primary, fontSize: 10, letterSpacing: 1, paddingBottom: 2 },
  recordTime: { color: m3.color.onSurfaceVariant, fontSize: 11, lineHeight: 16, paddingBottom: 2 },
  excerpt: { color: m3.color.onSurface, fontSize: 15, lineHeight: 23, paddingBottom: 3 },
  disclosure: { color: m3.color.onSurfaceVariant, fontSize: 11, lineHeight: 16, paddingBottom: 2 },
  questionBlock: { alignItems: "center", gap: m3.spacing.s2 },
  question: { color: m3.color.onSurface, fontSize: 18, lineHeight: 26, textAlign: "center", paddingBottom: 2 },
  reviewBody: { color: m3.color.onSurfaceVariant, fontSize: 13, lineHeight: 19, textAlign: "center", paddingBottom: 2 },
  actions: { width: "100%", gap: m3.spacing.s3 },
  actionContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s2,
    paddingVertical: m3.spacing.s2,
  },
  actionLabel: { flexShrink: 1, fontSize: 14, lineHeight: 20, textAlign: "center", paddingBottom: 2 },
  statusText: { color: m3.color.onSurfaceVariant, textAlign: "center", fontSize: 12, lineHeight: 18, paddingBottom: 2 },
  saveError: { gap: m3.spacing.s3, paddingVertical: m3.spacing.s4 },
  errorHeading: { flexDirection: "row", alignItems: "center", gap: m3.spacing.s2 },
  saveErrorTitle: { flex: 1, color: m3.color.onErrorContainer, fontSize: 14, lineHeight: 20, paddingBottom: 2 },
  saveErrorBody: { color: m3.color.onErrorContainer, fontSize: 13, lineHeight: 19, paddingBottom: 2 },
});
