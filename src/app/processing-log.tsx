import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, StyleSheet, View, type ListRenderItem } from "react-native";
import { Redirect, router } from "expo-router";
import { useTranslation } from "react-i18next";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { DeepSpaceLoader } from "@/components/deepspace";
import { MdButton, MdCard } from "@/components/m3";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth/AuthContext";
import { isAvailableUiLocale, type AvailableUiLocale } from "@/lib/i18n/locales";
import {
  createProcessingLogWindow,
  listProcessingLogPage,
  type ProcessingLogProvider,
  type ProcessingLogPurpose,
  type ProcessingLogRow,
  type ProcessingLogWindow,
} from "@/lib/supabase/audit-reader";
import { m3 } from "@/lib/theme/m3";

interface ProcessingLogCopy {
  intro: string;
  profileError: string;
  loading: string;
  emptyTitle: string;
  emptyBody: string;
  loadError: string;
  loadMoreError: string;
  retry: string;
  providerUnavailable: string;
  modelUnavailable: string;
  timeUnavailable: string;
  purposes: Record<ProcessingLogPurpose, string>;
}

const COPY: Record<AvailableUiLocale, ProcessingLogCopy> = {
  en: {
    intro: "This shows AI-related processing for your account during the last 7 days. It never shows the contents of your records.",
    profileError: "We couldn't confirm your profile. Check your connection and try again.",
    loading: "Loading your processing log…",
    emptyTitle: "No processing in the last 7 days",
    emptyBody: "When an AI-related feature runs, its time and available service details will appear here.",
    loadError: "Couldn't load your processing log.",
    loadMoreError: "Couldn't load the next records.",
    retry: "Try again",
    providerUnavailable: "Service information unavailable",
    modelUnavailable: "Model details unavailable",
    timeUnavailable: "Time unavailable",
    purposes: {
      reflection: "Reflection question",
      source: "Source organization",
      connection: "Connecting records",
      "self-understanding": "Self-understanding update",
      conversation: "SecondB conversation",
      capture: "Capture organization",
      import: "Import organization",
      planning: "Planning support",
      summary: "Summary",
      crosscheck: "Answer cross-check",
      safety: "Safety check",
      voice: "Voice transcription",
      other: "Processing event",
    },
  },
  ko: {
    intro: "이 계정에서 AI 기능과 관련된 처리를 최근 7일 기준으로 보여줘요. 기록 내용은 표시하지 않아요.",
    profileError: "프로필을 확인하지 못했어요. 연결 상태를 확인한 뒤 다시 시도해 주세요.",
    loading: "처리 기록을 불러오는 중입니다…",
    emptyTitle: "최근 7일 처리 기록이 없어요",
    emptyBody: "AI 관련 기능이 실행되면 시간과 확인 가능한 서비스 정보가 여기에 표시돼요.",
    loadError: "처리 기록을 불러오지 못했어요.",
    loadMoreError: "다음 기록을 불러오지 못했어요.",
    retry: "다시 시도",
    providerUnavailable: "서비스 정보 없음",
    modelUnavailable: "모델 세부 정보 없음",
    timeUnavailable: "시간 정보 없음",
    purposes: {
      reflection: "되돌아보기 질문",
      source: "자료 정리",
      connection: "기록 연결",
      "self-understanding": "자기 이해 업데이트",
      conversation: "세컨비 대화",
      capture: "담은 내용 정리",
      import: "가져온 내용 정리",
      planning: "계획 지원",
      summary: "요약",
      crosscheck: "답변 교차 확인",
      safety: "안전 확인",
      voice: "음성 받아쓰기",
      other: "처리 기록",
    },
  },
  es: {
    intro: "Muestra el procesamiento relacionado con IA de esta cuenta durante los últimos 7 días. No muestra el contenido de tus registros.",
    profileError: "No pudimos confirmar tu perfil. Comprueba la conexión e inténtalo de nuevo.",
    loading: "Cargando tu registro de procesamiento…",
    emptyTitle: "No hubo procesamiento en los últimos 7 días",
    emptyBody: "Cuando se ejecute una función relacionada con IA, aparecerán aquí la hora y los datos del servicio disponibles.",
    loadError: "No se pudo cargar tu registro de procesamiento.",
    loadMoreError: "No se pudieron cargar los siguientes registros.",
    retry: "Reintentar",
    providerUnavailable: "Información del servicio no disponible",
    modelUnavailable: "Detalles del modelo no disponibles",
    timeUnavailable: "Hora no disponible",
    purposes: {
      reflection: "Pregunta de reflexión",
      source: "Organización de fuentes",
      connection: "Conexión de registros",
      "self-understanding": "Actualización de autoconocimiento",
      conversation: "Conversación con SecondB",
      capture: "Organización de capturas",
      import: "Organización de importaciones",
      planning: "Apoyo para planificar",
      summary: "Resumen",
      crosscheck: "Comprobación cruzada de la respuesta",
      safety: "Comprobación de seguridad",
      voice: "Transcripción de voz",
      other: "Evento de procesamiento",
    },
  },
  pt: {
    intro: "Mostra o processamento relacionado à IA nesta conta nos últimos 7 dias. O conteúdo dos seus registros não é exibido.",
    profileError: "Não foi possível confirmar seu perfil. Verifique a conexão e tente novamente.",
    loading: "Carregando seu registro de processamento…",
    emptyTitle: "Nenhum processamento nos últimos 7 dias",
    emptyBody: "Quando um recurso relacionado à IA for executado, o horário e os dados de serviço disponíveis aparecerão aqui.",
    loadError: "Não foi possível carregar seu registro de processamento.",
    loadMoreError: "Não foi possível carregar os próximos registros.",
    retry: "Tentar novamente",
    providerUnavailable: "Informações do serviço indisponíveis",
    modelUnavailable: "Detalhes do modelo indisponíveis",
    timeUnavailable: "Horário indisponível",
    purposes: {
      reflection: "Pergunta de reflexão",
      source: "Organização de fontes",
      connection: "Conexão de registros",
      "self-understanding": "Atualização de autoconhecimento",
      conversation: "Conversa com SecondB",
      capture: "Organização de capturas",
      import: "Organização de importações",
      planning: "Apoio ao planejamento",
      summary: "Resumo",
      crosscheck: "Verificação cruzada da resposta",
      safety: "Verificação de segurança",
      voice: "Transcrição de voz",
      other: "Evento de processamento",
    },
  },
  id: {
    intro: "Menampilkan pemrosesan terkait AI pada akun ini selama 7 hari terakhir. Isi catatanmu tidak ditampilkan.",
    profileError: "Kami tidak dapat mengonfirmasi profilmu. Periksa koneksi lalu coba lagi.",
    loading: "Memuat log pemrosesanmu…",
    emptyTitle: "Tidak ada pemrosesan dalam 7 hari terakhir",
    emptyBody: "Saat fitur terkait AI berjalan, waktu dan informasi layanan yang tersedia akan muncul di sini.",
    loadError: "Log pemrosesanmu tidak dapat dimuat.",
    loadMoreError: "Catatan berikutnya tidak dapat dimuat.",
    retry: "Coba lagi",
    providerUnavailable: "Informasi layanan tidak tersedia",
    modelUnavailable: "Detail model tidak tersedia",
    timeUnavailable: "Waktu tidak tersedia",
    purposes: {
      reflection: "Pertanyaan refleksi",
      source: "Penataan sumber",
      connection: "Menghubungkan catatan",
      "self-understanding": "Pembaruan pemahaman diri",
      conversation: "Percakapan SecondB",
      capture: "Penataan tangkapan",
      import: "Penataan impor",
      planning: "Dukungan perencanaan",
      summary: "Ringkasan",
      crosscheck: "Pemeriksaan silang jawaban",
      safety: "Pemeriksaan keamanan",
      voice: "Transkripsi suara",
      other: "Peristiwa pemrosesan",
    },
  },
};

const PROVIDER_LABEL: Record<Exclude<ProcessingLogProvider, null>, string> = {
  "google-gemini": "Google Gemini",
  "anthropic-claude": "Anthropic Claude",
  openai: "OpenAI",
  xai: "xAI",
};

type LoadPhase = "idle" | "loading" | "ready" | "error";

interface ProcessingLogState {
  ownerId: string | null;
  phase: LoadPhase;
  rows: ProcessingLogRow[];
  rangeWindow: ProcessingLogWindow | null;
  nextOffset: number;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError: boolean;
}

interface PaginationCursor {
  ownerId: string | null;
  rangeWindow: ProcessingLogWindow | null;
  nextOffset: number;
  hasMore: boolean;
  loadMoreError: boolean;
}

function emptyState(): ProcessingLogState {
  return {
    ownerId: null,
    phase: "idle",
    rows: [],
    rangeWindow: null,
    nextOffset: 0,
    hasMore: false,
    loadingMore: false,
    loadMoreError: false,
  };
}

function uiLocaleFor(language: string | undefined): AvailableUiLocale {
  const candidate = language?.toLowerCase().split("-")[0];
  return isAvailableUiLocale(candidate) ? candidate : "en";
}

function ProcessingLogSeparator() {
  return <View style={styles.separator} />;
}

export default function ProcessingLogScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const locale = uiLocaleFor(i18n.resolvedLanguage ?? i18n.language);
  const copy = COPY[locale];
  const { userId, loading: authLoading, hasProfile, profileProbeFailed, refresh } = useAuth();
  const [state, setState] = useState<ProcessingLogState>(emptyState);
  const [reloadKey, setReloadKey] = useState(0);
  const [profileRetrying, setProfileRetrying] = useState(false);
  const mountedRef = useRef(true);
  const requestGenerationRef = useRef(0);
  const profileRetryGenerationRef = useRef(0);
  const profileRetryInFlightRef = useRef(false);
  const loadMoreInFlightRef = useRef(false);
  const paginationRef = useRef<PaginationCursor>({
    ownerId: null,
    rangeWindow: null,
    nextOffset: 0,
    hasMore: false,
    loadMoreError: false,
  });
  const canRead = !authLoading && !!userId && hasProfile === true && !profileProbeFailed;

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    [locale],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    profileRetryGenerationRef.current += 1;
    profileRetryInFlightRef.current = false;
    setProfileRetrying(false);
  }, [userId]);

  useEffect(() => {
    if (!canRead || !userId) return;
    const generation = ++requestGenerationRef.current;
    const rangeWindow = createProcessingLogWindow();
    loadMoreInFlightRef.current = false;
    paginationRef.current = {
      ownerId: userId,
      rangeWindow,
      nextOffset: 0,
      hasMore: false,
      loadMoreError: false,
    };
    setState({
      ownerId: userId,
      phase: "loading",
      rows: [],
      rangeWindow,
      nextOffset: 0,
      hasMore: false,
      loadingMore: false,
      loadMoreError: false,
    });

    void listProcessingLogPage({ userId, window: rangeWindow })
      .then((page) => {
        if (generation !== requestGenerationRef.current) return;
        paginationRef.current = {
          ownerId: userId,
          rangeWindow,
          nextOffset: page.nextOffset,
          hasMore: page.hasMore,
          loadMoreError: false,
        };
        setState({
          ownerId: userId,
          phase: "ready",
          rows: page.rows,
          rangeWindow,
          nextOffset: page.nextOffset,
          hasMore: page.hasMore,
          loadingMore: false,
          loadMoreError: false,
        });
      })
      .catch(() => {
        if (generation !== requestGenerationRef.current) return;
        paginationRef.current = {
          ownerId: userId,
          rangeWindow,
          nextOffset: 0,
          hasMore: false,
          loadMoreError: false,
        };
        setState({
          ownerId: userId,
          phase: "error",
          rows: [],
          rangeWindow,
          nextOffset: 0,
          hasMore: false,
          loadingMore: false,
          loadMoreError: false,
        });
      });

    return () => {
      if (requestGenerationRef.current === generation) requestGenerationRef.current += 1;
      loadMoreInFlightRef.current = false;
    };
  }, [canRead, reloadKey, userId]);

  const retryProfile = useCallback(() => {
    if (profileRetryInFlightRef.current) return;
    profileRetryInFlightRef.current = true;
    const generation = ++profileRetryGenerationRef.current;
    setProfileRetrying(true);
    void refresh()
      .catch(() => undefined)
      .finally(() => {
        if (generation !== profileRetryGenerationRef.current) return;
        profileRetryInFlightRef.current = false;
        if (mountedRef.current) setProfileRetrying(false);
      });
  }, [refresh]);

  const retryInitial = useCallback(() => {
    setState((current) => ({ ...current, phase: "loading" }));
    setReloadKey((current) => current + 1);
  }, []);

  const requestMore = useCallback((retryAfterError: boolean) => {
    const cursor = paginationRef.current;
    if (
      !userId
      || cursor.ownerId !== userId
      || !cursor.rangeWindow
      || !cursor.hasMore
      || (cursor.loadMoreError && !retryAfterError)
      || loadMoreInFlightRef.current
    ) return;

    loadMoreInFlightRef.current = true;
    const generation = requestGenerationRef.current;
    const rangeWindow = cursor.rangeWindow;
    const offset = cursor.nextOffset;
    paginationRef.current = { ...cursor, loadMoreError: false };
    setState((current) => current.ownerId === userId
      ? { ...current, loadingMore: true, loadMoreError: false }
      : current);

    void listProcessingLogPage({ userId, window: rangeWindow, offset })
      .then((page) => {
        if (
          generation !== requestGenerationRef.current
          || paginationRef.current.ownerId !== userId
          || paginationRef.current.rangeWindow !== rangeWindow
        ) return;
        paginationRef.current = {
          ownerId: userId,
          rangeWindow,
          nextOffset: page.nextOffset,
          hasMore: page.hasMore,
          loadMoreError: false,
        };
        setState((current) => {
          if (current.ownerId !== userId || current.rangeWindow !== rangeWindow) return current;
          const knownIds = new Set(current.rows.map((row) => row.id));
          const newRows = page.rows.filter((row) => !knownIds.has(row.id));
          return {
            ...current,
            rows: [...current.rows, ...newRows],
            nextOffset: page.nextOffset,
            hasMore: page.hasMore,
            loadingMore: false,
            loadMoreError: false,
          };
        });
      })
      .catch(() => {
        if (
          generation !== requestGenerationRef.current
          || paginationRef.current.ownerId !== userId
          || paginationRef.current.rangeWindow !== rangeWindow
        ) return;
        paginationRef.current = { ...paginationRef.current, loadMoreError: true };
        setState((current) => current.ownerId === userId
          ? { ...current, loadingMore: false, loadMoreError: true }
          : current);
      })
      .finally(() => {
        if (generation === requestGenerationRef.current) loadMoreInFlightRef.current = false;
      });
  }, [userId]);

  const loadMore = useCallback(() => requestMore(false), [requestMore]);
  const retryLoadMore = useCallback(() => requestMore(true), [requestMore]);

  const renderItem: ListRenderItem<ProcessingLogRow> = useCallback(({ item }) => {
    const purpose = copy.purposes[item.purpose];
    const provider = item.provider ? PROVIDER_LABEL[item.provider] : copy.providerUnavailable;
    const model = item.model ?? copy.modelUnavailable;
    const parsedDate = new Date(item.createdAt);
    const when = Number.isNaN(parsedDate.getTime()) ? copy.timeUnavailable : dateFormatter.format(parsedDate);
    return (
      <MdCard variant="outlined">
        <View
          accessible
          accessibilityLabel={`${purpose}. ${provider}. ${model}. ${when}.`}
          style={styles.row}
        >
          <Text variant="caption" style={styles.purpose}>{purpose}</Text>
          <Text variant="body" style={styles.provider}>{provider}</Text>
          <Text variant="subtle" style={styles.meta}>{model}</Text>
          <Text variant="subtle" style={styles.meta}>{when}</Text>
        </View>
      </MdCard>
    );
  }, [copy, dateFormatter]);

  if (!authLoading && !userId) return <Redirect href="/sign-in" />;
  if (!authLoading && hasProfile === false && !profileProbeFailed) {
    return <Redirect href="/complete-profile" />;
  }

  const title = t("privacy.processingLog");
  if (!authLoading && userId && profileProbeFailed) {
    return (
      <DeepSpaceScreen active="settings" header="none" variant="windowed" title={title} onBack={() => router.back()}>
        <View style={styles.center} accessibilityLiveRegion="polite">
          <Text variant="body" style={styles.centerText}>{copy.profileError}</Text>
          <MdButton label={copy.retry} loading={profileRetrying} onPress={retryProfile} />
        </View>
      </DeepSpaceScreen>
    );
  }

  const visibleState = state.ownerId === userId ? state : emptyState();
  if (authLoading || !userId || hasProfile !== true || visibleState.phase === "idle" || visibleState.phase === "loading") {
    return (
      <DeepSpaceScreen active="settings" header="none" variant="windowed" title={title} onBack={() => router.back()}>
        <View style={styles.center} accessibilityLiveRegion="polite">
          <DeepSpaceLoader variant="dots" />
          <Text variant="subtle" style={styles.centerText}>{copy.loading}</Text>
        </View>
      </DeepSpaceScreen>
    );
  }

  if (visibleState.phase === "error") {
    return (
      <DeepSpaceScreen active="settings" header="none" variant="windowed" title={title} onBack={() => router.back()}>
        <View style={styles.center} accessibilityLiveRegion="polite">
          <Text variant="body" style={styles.centerText}>{copy.loadError}</Text>
          <MdButton label={copy.retry} onPress={retryInitial} />
        </View>
      </DeepSpaceScreen>
    );
  }

  return (
    <DeepSpaceScreen active="settings" header="none" variant="windowed" title={title} onBack={() => router.back()}>
      <FlatList
        accessibilityLabel={title}
        style={styles.list}
        contentContainerStyle={styles.content}
        data={visibleState.rows}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ItemSeparatorComponent={ProcessingLogSeparator}
        ListHeaderComponent={(
          <View style={styles.header}>
            <Text variant="body" style={styles.intro}>{copy.intro}</Text>
            <View style={styles.rangeBadge}>
              <Text variant="caption" style={styles.rangeText}>{t("privacy.last7")}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={(
          <View style={styles.empty} accessibilityLiveRegion="polite">
            <Text variant="heading" style={styles.emptyTitle}>{copy.emptyTitle}</Text>
            <Text variant="body" style={styles.centerText}>{copy.emptyBody}</Text>
          </View>
        )}
        ListFooterComponent={visibleState.loadingMore ? (
          <View style={styles.footer} accessibilityLiveRegion="polite">
            <DeepSpaceLoader variant="dots" />
            <Text variant="subtle" style={styles.centerText}>{copy.loading}</Text>
          </View>
        ) : visibleState.loadMoreError ? (
          <View style={styles.footer} accessibilityLiveRegion="polite">
            <Text variant="subtle" style={styles.centerText}>{copy.loadMoreError}</Text>
            <MdButton label={copy.retry} variant="text" onPress={retryLoadMore} />
          </View>
        ) : <View style={styles.footerSpacer} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        removeClippedSubviews={false}
        showsVerticalScrollIndicator={false}
      />
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  content: {
    paddingHorizontal: m3.spacing.s6,
    paddingTop: m3.spacing.s4,
    paddingBottom: m3.spacing.s8,
  },
  header: { gap: m3.spacing.s4, marginBottom: m3.spacing.s6 },
  intro: { color: m3.color.onSurfaceVariant },
  rangeBadge: {
    alignSelf: "flex-start",
    backgroundColor: m3.color.secondaryContainer,
    borderWidth: 1,
    borderColor: m3.color.outlineVariant,
    borderRadius: m3.shape.none,
    paddingHorizontal: m3.spacing.s4,
    paddingVertical: m3.spacing.s2,
  },
  rangeText: { color: m3.color.onSecondaryContainer },
  separator: { height: m3.spacing.s4 },
  row: { gap: m3.spacing.s2 },
  purpose: { color: m3.color.primary },
  provider: { color: m3.color.onSurface },
  meta: { color: m3.color.onSurfaceVariant },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s6,
    padding: m3.spacing.s8,
  },
  centerText: { color: m3.color.onSurfaceVariant, textAlign: "center" },
  empty: {
    alignItems: "center",
    gap: m3.spacing.s4,
    paddingHorizontal: m3.spacing.s8,
    paddingVertical: m3.spacing.s8,
  },
  emptyTitle: { color: m3.color.onSurface, textAlign: "center" },
  footer: {
    alignItems: "center",
    gap: m3.spacing.s4,
    paddingVertical: m3.spacing.s8,
  },
  footerSpacer: { height: m3.spacing.s8 },
});
