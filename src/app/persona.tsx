import { useEffect, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, Share } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumAppShell, PremiumErrorState, PremiumLoadingState, PremiumToast, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { useAuth } from "@/lib/auth/AuthContext";
import { buildPersona, instrumentLabel, isMeasuredSource, type PersonaCard } from "@/lib/persona/build";
import { SELF_UNDERSTANDING_STARS } from "@/lib/persona/stars";
import { brightnessBand, type BrightnessBand } from "@/lib/persona/brightness-visual";
import { buildCenterCards } from "@/lib/persona/center";
import { TYPE_NICKNAME } from "@/lib/persona/mbti";
import { STYLE_LABEL, STYLE_DESCRIPTION } from "@/lib/persona/attachment";
import { labelFramework } from "@/lib/audit/frameworkLabels";
import type { Framework } from "@/lib/audit/questions";
import { CompanionMoment, useCompanionMoment } from "@/components/art/CompanionSprite";
import { CORE_VILLAGE_UI } from "@/lib/village-ui";
import { ReflectionScaffold } from "@/components/persona/ReflectionScaffold";
import { isAvailableUiLocale, systemLocaleFor, type AvailableUiLocale } from "@/lib/i18n/locales";

type PersonaToast = { message: string; tone: "info" | "success" | "danger" };

const PERSONA_COPY: Record<AvailableUiLocale, {
  errorBody: string;
  emptySubtitle: string;
  emptySpeech: string;
  exportError: string;
  measuredSubtitle: (instrument: string) => string;
  estimatedSubtitle: string;
  soulBand: Record<BrightnessBand, string>;
  soulBrightness: (band: string, lit: number) => string;
  bigFiveProxyNote: string;
  patternNote: string;
  mbtiNote: string;
  backToCapture: string;
  dimHigh: string;
  dimLow: string;
  tools: { label: string; sub: string; route: "/audit?screener=1" | "/big-five" | "/attachment" | "/ipip-neo" | "/rlss"; fast?: boolean }[];
}> = {
  en: {
    errorBody: "Something interrupted gathering your pieces. Please try again in a moment.",
    emptySubtitle: "Finish one tool and we can build self-model v1",
    emptySpeech: "Three minutes on your relationship pattern lights your first star right away. Shall we start here?",
    exportError: "Couldn't finish the export. Try again from the export button.",
    measuredSubtitle: (instrument) => `${instrument} measurement · attachment combined`,
    estimatedSubtitle: "Journal-based estimate · assessments update it",
    soulBand: { dim: "dim", fair: "fair", bright: "bright" },
    soulBrightness: (band, lit) => `Brightness ${band} · ${lit}/7 stars lit`,
    bigFiveProxyNote: "Big Five proxy (v1). A pattern view from your records, not an evaluation.",
    patternNote: "Themes you've returned to most often in recent entries. Observation, not verdict.",
    mbtiNote: "MBTI has weak scientific validity. Use as a self-awareness starting point only.",
    backToCapture: "Back to capture",
    dimHigh: "above",
    dimLow: "below",
    tools: [
      { label: "Attachment style / ECR-S", sub: "12 items · ~3 min · lights one star now", route: "/attachment", fast: true },
      { label: "Life audit", sub: "25 items · ~8 min", route: "/audit?screener=1" },
      { label: "Big Five (BFI-44)", sub: "44 items · ~8 min", route: "/big-five" },
      { label: "Personality, in depth (IPIP-NEO-120)", sub: "120 items · ~15 min · 30 facets", route: "/ipip-neo" },
      { label: "Life Satisfaction / RLSS", sub: "6 items · ~2 min", route: "/rlss" },
    ],
  },
  ko: {
    errorBody: "별가루를 모으는 중에 잠깐 문제가 생겼어요. 잠시 후 다시 시도해 주세요.",
    emptySubtitle: "도구 하나만 마쳐도 자기 모델 v1을 만들 수 있어요",
    emptySpeech: "3분이면 가까운 관계 패턴을 짚고 별 하나가 바로 켜져요. 여기서 같이 시작해 볼까요?",
    exportError: "내보내기를 마치지 못했어요. 내보내기 버튼에서 다시 시도해 주세요.",
    measuredSubtitle: (instrument) => `${instrument} 실측 · 애착 합성`,
    estimatedSubtitle: "일기 기반 추정 · 평가하면 실측으로 업데이트",
    soulBand: { dim: "흐릿", fair: "보통", bright: "밝음" },
    soulBrightness: (band, lit) => `밝기 ${band} · 별 ${lit}/7 켜짐`,
    bigFiveProxyNote: "Big Five 근사치 (v1). 기록에서 보이는 패턴일 뿐, 판단이나 평가는 아니에요.",
    patternNote: "최근 기록에서 가장 자주 다룬 주제예요. 단정이 아닌 관찰입니다.",
    mbtiNote: "MBTI는 학술적 신뢰도가 낮은 분류입니다. 자기 인식의 출발점으로만 가볍게 보세요.",
    backToCapture: "별가루 담기로 돌아가기",
    dimHigh: "평균 위",
    dimLow: "평균 아래",
    tools: [
      { label: "애착 스타일 / Attachment", sub: "12문항 · 약 3분 · 별 하나 바로 켜져요", route: "/attachment", fast: true },
      { label: "라이프 오딧", sub: "25문항 · 약 8분", route: "/audit?screener=1" },
      { label: "Big Five (BFI-44)", sub: "44문항 · 약 8분", route: "/big-five" },
      { label: "성격 정밀검사 (IPIP-NEO-120)", sub: "120문항 · 약 15분 · facet 30개", route: "/ipip-neo" },
      { label: "삶의 만족도 / RLSS", sub: "6문항 · 약 2분", route: "/rlss" },
    ],
  },
  es: {
    errorBody: "Algo interrumpió la reunión de tus piezas. Inténtalo de nuevo en un momento.",
    emptySubtitle: "Completa una herramienta y podremos crear el modelo de ti v1",
    emptySpeech: "Tres minutos sobre tu patrón de relaciones encienden tu primera estrella. ¿Empezamos aquí?",
    exportError: "No se pudo terminar la exportación. Inténtalo desde el botón de exportar.",
    measuredSubtitle: (instrument) => `${instrument} medido · apego combinado`,
    estimatedSubtitle: "Estimación basada en diario · las evaluaciones la actualizan",
    soulBand: { dim: "tenue", fair: "media", bright: "brillante" },
    soulBrightness: (band, lit) => `Brillo ${band} · ${lit}/7 estrellas encendidas`,
    bigFiveProxyNote: "Aproximación Big Five (v1). Es una vista de patrones desde tus registros, no una evaluación.",
    patternNote: "Temas a los que has vuelto con más frecuencia en entradas recientes. Observación, no veredicto.",
    mbtiNote: "MBTI tiene validez científica débil. Úsalo solo como punto de partida para conocerte.",
    backToCapture: "Volver a guardar",
    dimHigh: "encima",
    dimLow: "debajo",
    tools: [
      { label: "Estilo de apego / ECR-S", sub: "12 ítems · ~3 min · enciende una estrella", route: "/attachment", fast: true },
      { label: "Auditoría de vida", sub: "25 ítems · ~8 min", route: "/audit?screener=1" },
      { label: "Big Five (BFI-44)", sub: "44 ítems · ~8 min", route: "/big-five" },
      { label: "Personalidad en profundidad (IPIP-NEO-120)", sub: "120 ítems · ~15 min · 30 facetas", route: "/ipip-neo" },
      { label: "Satisfacción vital / RLSS", sub: "6 ítems · ~2 min", route: "/rlss" },
    ],
  },
  pt: {
    errorBody: "Algo interrompeu a reunião das suas peças. Tente novamente em instantes.",
    emptySubtitle: "Conclua uma ferramenta e criaremos o modelo de si v1",
    emptySpeech: "Três minutos sobre seu padrão de relações acendem sua primeira estrela. Vamos começar por aqui?",
    exportError: "Não foi possível terminar a exportação. Tente novamente pelo botão de exportar.",
    measuredSubtitle: (instrument) => `${instrument} medido · apego combinado`,
    estimatedSubtitle: "Estimativa baseada no diário · avaliações atualizam isso",
    soulBand: { dim: "suave", fair: "médio", bright: "brilhante" },
    soulBrightness: (band, lit) => `Brilho ${band} · ${lit}/7 estrelas acesas`,
    bigFiveProxyNote: "Aproximação Big Five (v1). Uma visão de padrões dos seus registros, não uma avaliação.",
    patternNote: "Temas aos quais você voltou com mais frequência nos registros recentes. Observação, não veredito.",
    mbtiNote: "MBTI tem validade científica fraca. Use apenas como ponto de partida para autoconhecimento.",
    backToCapture: "Voltar a guardar",
    dimHigh: "acima",
    dimLow: "abaixo",
    tools: [
      { label: "Estilo de apego / ECR-S", sub: "12 itens · ~3 min · acende uma estrela", route: "/attachment", fast: true },
      { label: "Auditoria de vida", sub: "25 itens · ~8 min", route: "/audit?screener=1" },
      { label: "Big Five (BFI-44)", sub: "44 itens · ~8 min", route: "/big-five" },
      { label: "Personalidade em profundidade (IPIP-NEO-120)", sub: "120 itens · ~15 min · 30 facetas", route: "/ipip-neo" },
      { label: "Satisfação com a vida / RLSS", sub: "6 itens · ~2 min", route: "/rlss" },
    ],
  },
  id: {
    errorBody: "Ada gangguan saat mengumpulkan bagian dirimu. Coba lagi sebentar lagi.",
    emptySubtitle: "Selesaikan satu alat dan kami bisa membuat model diri v1",
    emptySpeech: "Tiga menit tentang pola relasimu menyalakan bintang pertama. Mulai dari sini?",
    exportError: "Ekspor belum selesai. Coba lagi dari tombol ekspor.",
    measuredSubtitle: (instrument) => `${instrument} terukur · kelekatan digabungkan`,
    estimatedSubtitle: "Perkiraan dari jurnal · asesmen akan memperbaruinya",
    soulBand: { dim: "redup", fair: "cukup", bright: "terang" },
    soulBrightness: (band, lit) => `Kecerahan ${band} · ${lit}/7 bintang menyala`,
    bigFiveProxyNote: "Proksi Big Five (v1). Ini tampilan pola dari catatanmu, bukan evaluasi.",
    patternNote: "Tema yang paling sering kamu ulangi di entri terbaru. Observasi, bukan putusan.",
    mbtiNote: "MBTI memiliki validitas ilmiah yang lemah. Gunakan hanya sebagai titik awal memahami diri.",
    backToCapture: "Kembali menyimpan",
    dimHigh: "di atas",
    dimLow: "di bawah",
    tools: [
      { label: "Gaya kelekatan / ECR-S", sub: "12 item · ~3 mnt · menyalakan satu bintang", route: "/attachment", fast: true },
      { label: "Audit hidup", sub: "25 item · ~8 mnt", route: "/audit?screener=1" },
      { label: "Big Five (BFI-44)", sub: "44 item · ~8 mnt", route: "/big-five" },
      { label: "Kepribadian mendalam (IPIP-NEO-120)", sub: "120 item · ~15 mnt · 30 faset", route: "/ipip-neo" },
      { label: "Kepuasan hidup / RLSS", sub: "6 item · ~2 mnt", route: "/rlss" },
    ],
  },
};

function displayLocaleFor(localeTag: string | null | undefined): AvailableUiLocale {
  const base = localeTag?.split("-")[0];
  if (isAvailableUiLocale(localeTag)) return localeTag;
  if (isAvailableUiLocale(base)) return base;
  return "en";
}

function PersonaLegacy() {
  const { t, i18n } = useTranslation("secondb");
  const { t: tp } = useTranslation("persona");
  const { userId, loading, hasProfile, isMinor } = useAuth();
  const displayLocale = displayLocaleFor(i18n.language);
  const copy = PERSONA_COPY[displayLocale];
  const locale = systemLocaleFor(i18n.language);
  const [persona, setPersona] = useState<PersonaCard | null>(null);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [toast, setToast] = useState<PersonaToast | null>(null);
  const { moment: companionMoment, fire: fireCompanion } = useCompanionMoment();
  // One build per resolved (userId, locale) — keyed so a relog or language
  // switch rebuilds, but the auth resolve window (hasProfile/isMinor flipping
  // from null) does not re-fire it.
  const builtKey = useRef<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    // buildPersona() calls Gemini on mount and forwards `minor` for crisis
    // routing (C10). Wait for fully-resolved auth: while `loading` is true,
    // hasProfile/isMinor are still null, so building now would (a) treat a
    // minor as an adult on the crisis hotline and (b) re-fire once they
    // resolve — an extra Gemini call + duplicate personas upsert. Gate on the
    // settled state, and dedupe per (userId, locale) so it runs exactly once.
    // isMinor must be resolved before any crisis-capable build so a minor gets
    // the youth hotline (C10), not just hasProfile — guard the residual edge
    // where a profile resolves true while isMinor is still null.
    if (loading || !userId || hasProfile !== true || isMinor === null) return;
    const buildKey = `${userId}:${locale}:${retryKey}`;
    if (builtKey.current === buildKey) return;
    builtKey.current = buildKey;
    function runBuild() {
      if (!userId) return;
      setBuilding(true);
      setBuildError(false);
      buildPersona(userId, locale, isMinor === true)
        .then((p) => {
          setPersona(p);
          setBuildError(false);
          // 아치 builds the connections once a persona card synthesizes (companion pack §3).
          if (p) fireCompanion("personaUpdated");
        })
        .catch((e) => {
          // Raw error stays in logs only; users see product-tone copy + retry.
          console.warn("[persona] build failed", (e as Error).message);
          builtKey.current = null;
          setBuildError(true);
        })
        .finally(() => setBuilding(false));
    }
    runBuild();
  }, [loading, userId, hasProfile, isMinor, locale, retryKey, fireCompanion]);

  if (loading || building) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={tp("loading")} />
        </View>
      </PremiumAppShell>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === false) return <Redirect href="/complete-profile" />;
  if (buildError) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumErrorState
            title={tp("errorTitle")}
            body={copy.errorBody}
            retryLabel={tp("tryAgain")}
            onRetry={() => {
              setBuildError(false);
              setRetryKey((k) => k + 1);
            }}
          />
          <View style={styles.errorActions}>
            <Button
              label={tp("backToCapture")}
              variant="secondary"
              onPress={() => router.replace("/capture")}
            />
          </View>
        </View>
      </PremiumAppShell>
    );
  }
  if (!persona) {
    // ECR-first activation: the 12-item attachment check is the cheapest validated
    // instrument and lights star5 straight to ladder L4, so it leads as the fast
    // first-value path (the others follow). `fast` flags the lead card's accent.
    const toolCards = copy.tools;
    return (
      <PremiumAppShell>
        <ScrollView contentContainerStyle={styles.emptyScroll}>
          <SceneHero
            eyebrow={tp("eyebrow")}
            title={tp("notEnough")}
            subtitle={copy.emptySubtitle}
            island={CORE_VILLAGE_UI.island}
            worker={CORE_VILLAGE_UI.worker}
            accent={CORE_VILLAGE_UI.accent}
            speech={copy.emptySpeech}
            primaryAction={{
              label: tp("startRelCheck"),
              onPress: () => router.push("/attachment"),
            }}
          />
          <View style={styles.toolGrid}>
            {toolCards.map((tc) => (
              <View
                key={tc.route}
                style={[styles.toolCard, tc.fast ? styles.toolCardFast : null]}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="body" style={{ fontWeight: "600" }}>{tc.label}</Text>
                  <Text variant="subtle" color="textMuted" style={{ marginTop: 2 }}>{tc.sub}</Text>
                </View>
                <Button
                  label={tp("start")}
                  variant={tc.fast ? "primary" : "secondary"}
                  onPress={() => router.push(tc.route)}
                />
              </View>
            ))}
          </View>
        </ScrollView>
      </PremiumAppShell>
    );
  }

  async function handleExport() {
    if (!persona) return;
    try {
      await Share.share({ message: persona.markdownExport, title: "2nd-Brain Persona" });
    } catch (e) {
      // Raw error stays in logs only; users see product-tone copy + retry.
      console.warn("[persona] export failed", (e as Error).message);
      setToast({
        tone: "danger",
        message: copy.exportError,
      });
    }
  }

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SceneHero
          eyebrow={tp("eyebrow")}
          title={tp("gathered")}
          subtitle={
            isMeasuredSource(persona.traitsSource)
              ? copy.measuredSubtitle(instrumentLabel(persona.traitsSource) ?? "Big Five")
              : copy.estimatedSubtitle
          }
          island={CORE_VILLAGE_UI.island}
          worker={CORE_VILLAGE_UI.worker}
          accent={CORE_VILLAGE_UI.accent}
          speech={t("personaHero.speech")}
          primaryAction={{
            label: tp("openCenter"),
            onPress: () => router.push("/core-brain"),
          }}
          secondaryAction={{
            label: tp("export"),
            variant: "secondary",
            onPress: handleExport,
          }}
        />

        {/* 소울 코어 — §7-2 three-card summary in Core Brain voice.
            Each card's meaning is coded by its left-border accent
            (mint / signal-blue / pixel-lamp), per DESIGN.md accent budget. */}
        <View style={styles.centerSection}>
          <Text variant="caption" color="textMuted" style={{ letterSpacing: 0 }}>
            {tp("soulCore")}
          </Text>
          {persona.soulCoreBrightness != null ? (
            <Text variant="subtle" color="brand" style={{ marginTop: 2 }}>
              {copy.soulBrightness(
                copy.soulBand[brightnessBand(persona.soulCoreBrightness)],
                SELF_UNDERSTANDING_STARS.filter((s) => (persona.starLevels?.[s.id] ?? 1) >= 2).length,
              )}
            </Text>
          ) : null}
          {buildCenterCards(persona, locale).map((card) => (
            <View key={card.id} style={[styles.centerCard, { borderStartColor: card.accent }]}>
              <Text variant="caption" color="textMuted">{card.title}</Text>
              <Text variant="body" style={{ marginTop: 2 }}>{card.body}</Text>
            </View>
          ))}
        </View>

        <View style={styles.traitsCard}>
          {Object.entries(persona.traits).map(([k, v]) => {
            const label = TRAIT_LABELS[locale][k as keyof typeof TRAIT_LABELS["en"]] ?? k;
            const aboveMean = v > 0.5;
            return (
              <View key={k} style={styles.traitRow}>
                <Text variant="body" style={{ width: 160 }}>{label}</Text>
                <View style={styles.barOuter}>
                  <View style={[styles.barInner, { width: `${v * 100}%` }]} />
                  {/* Midline reference at 50% so users can read above/below */}
                  <View style={styles.barMidline} />
                </View>
                <Text
                  variant="subtle"
                  color={aboveMean ? "brand" : "textMuted"}
                  style={{ width: 64, textAlign: "right" }}
                >
                  {aboveMean ? tp("above") : tp("below")}
                </Text>
              </View>
            );
          })}
          <Text variant="subtle" color="textSubtle" style={{ marginTop: spacing.sm }}>
            {copy.bigFiveProxyNote}
          </Text>
        </View>

        <View style={styles.narrativeCard}>
          <Text variant="caption" color="textMuted">
            {tp("aiSummary")}
          </Text>
          <Text variant="body" style={{ marginTop: spacing.xs }}>{persona.patterns.summary}</Text>
        </View>

        {Object.entries(persona.patterns).filter(([k]) => k.startsWith("top_")).length > 0 ? (
          <ReflectionScaffold locale={locale} />
        ) : null}

        {Object.entries(persona.patterns).filter(([k]) => k.startsWith("top_")).length > 0 ? (
          <View style={styles.patternsCard}>
            <Text variant="caption" color="textMuted">
              {tp("observedPatterns")}
            </Text>
            {Object.entries(persona.patterns)
              .filter(([k]) => k.startsWith("top_"))
              .map(([k, count]) => {
                const kind = k.replace(/^top_/, "");
                return (
                  <View key={k} style={styles.patternRow}>
                    <View style={styles.patternDot} />
                    <Text variant="body" style={{ flex: 1 }}>{kind}</Text>
                    <Text variant="subtle" color="textMuted">
                      {tp("countTimes", { n: count })}
                    </Text>
                  </View>
                );
              })}
            <Text variant="subtle" color="textSubtle" style={{ marginTop: spacing.xs }}>
              {copy.patternNote}
            </Text>
          </View>
        ) : null}

        {persona.mbti ? (
          <View style={styles.mbtiCard}>
            <Text variant="caption" color="textMuted">
              {tp("mbtiRef")}
            </Text>
            <View style={styles.mbtiRow}>
              <Text variant="heading" color="text" style={styles.mbtiType}>
                {persona.mbti.type}
              </Text>
              <View style={{ flex: 1 }}>
                <Text variant="body" style={{ fontWeight: "600" }}>
                  {TYPE_NICKNAME[locale][persona.mbti.type] ?? persona.mbti.type}
                </Text>
                <Text variant="subtle" color="textMuted" style={{ marginTop: 2 }}>
                  {copy.mbtiNote}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {persona.attachment ? (
          <View style={styles.attachmentCard}>
            <Text variant="caption" color="textMuted">
              {tp("attachmentStyle")}
            </Text>
            <Text variant="body" style={{ marginTop: spacing.xs, fontWeight: "600" }}>
              {STYLE_LABEL[locale][persona.attachment.style]}
            </Text>
            <Text variant="subtle" color="textMuted" style={{ marginTop: spacing.xs }}>
              {STYLE_DESCRIPTION[locale][persona.attachment.style]}
            </Text>
            <View style={styles.attachmentDims}>
              <AttachmentDimBar
                label={tp("anxiety")}
                value={persona.attachment.anxiety}
                locale={displayLocale}
              />
              <AttachmentDimBar
                label={tp("avoidance")}
                value={persona.attachment.avoidance}
                locale={displayLocale}
              />
            </View>
          </View>
        ) : null}

        {persona.values.length > 0 ? (
          <View style={styles.valuesCard}>
            <Text variant="caption" color="textMuted">
              {tp("relevantFrameworks")}
            </Text>
            <Text variant="body" style={{ marginTop: spacing.xs }}>
              {persona.values.map((f) => labelFramework(f as Framework, locale)).join(" · ")}
            </Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button
            label={tp("exportMd")}
            variant="primary"
            onPress={handleExport}
          />
          <Button
            label={tp("retakeBigFive")}
            variant="secondary"
            onPress={() => router.replace("/big-five")}
          />
          <Button
            label={tp("attachmentTest")}
            variant="secondary"
            onPress={() => router.replace("/attachment")}
          />
          <Button
            label={copy.backToCapture}
            variant="secondary"
            onPress={() => router.replace("/capture")}
          />
        </View>
      </ScrollView>
      {/* 아치 appears briefly when the persona model rebuilds (companion pack §3) */}
      {companionMoment ? (
        <CompanionMoment moment={companionMoment} style={styles.companionFlash} />
      ) : null}
      {toast ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <PremiumToast message={toast.message} tone={toast.tone} />
        </View>
      ) : null}
    </PremiumAppShell>
  );
}

// ECR-S anxiety/avoidance values are on a 1-7 Likert scale. Mid-point (4) is
// the median-split threshold the scorer uses to classify style.
function AttachmentDimBar({ label, value, locale }: { label: string; value: number; locale: AvailableUiLocale }) {
  const pct = Math.max(0, Math.min(1, (value - 1) / 6));
  const high = value > 4;
  const copy = PERSONA_COPY[locale];
  return (
    <View style={styles.dimRow}>
      <Text variant="subtle" color="textMuted" style={{ width: 56 }}>{label}</Text>
      <View style={styles.dimBarOuter}>
        <View style={[styles.dimBarInner, { width: `${pct * 100}%` }]} />
        <View style={styles.dimBarMid} />
      </View>
      <Text
        variant="subtle"
        color={high ? "brand" : "textMuted"}
        style={{ width: 64, textAlign: "right" }}
      >
        {high ? copy.dimHigh : copy.dimLow}
      </Text>
    </View>
  );
}

// Big Five trait labels translated for the persona card. Keys match
// the PersonaTraits TypeScript shape from lib/persona/build.ts.
const TRAIT_LABELS: Record<"en" | "ko", Record<"openness" | "conscientiousness" | "extraversion" | "agreeableness" | "neuroticism", string>> = {
  en: {
    openness: "Openness",
    conscientiousness: "Conscientiousness",
    extraversion: "Extraversion",
    agreeableness: "Agreeableness",
    neuroticism: "Neuroticism",
  },
  ko: {
    openness: "개방성",
    conscientiousness: "성실성",
    extraversion: "외향성",
    agreeableness: "친화성",
    neuroticism: "신경성",
  },
};

const styles = StyleSheet.create({
  scroll: { gap: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.md },
  errorActions: { width: "100%", maxWidth: 300 },
  toastWrap: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.xl, alignItems: "stretch" },
  companionFlash: { position: "absolute", bottom: 40, right: 20 },
  centerSection: { gap: spacing.sm },
  centerCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderStartWidth: 3,
    borderRadius: 0,
    padding: spacing.md,
  },
  traitsCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: 0,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  traitRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  barOuter: {
    flex: 1,
    height: 8,
    backgroundColor: semantic.surfaceAlt,
    borderRadius: 0,
    overflow: "hidden",
    position: "relative",
  },
  barInner: { height: "100%", backgroundColor: semantic.brand },
  barMidline: {
    position: "absolute",
    left: "50%",
    top: -2,
    bottom: -2,
    width: 1,
    backgroundColor: semantic.textSubtle,
    opacity: 0.35,
  },
  narrativeCard: {
    backgroundColor: semantic.surfaceAlt,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: 0,
    padding: spacing.md,
  },
  valuesCard: {
    backgroundColor: semantic.surfaceAlt,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: 0,
    padding: spacing.md,
  },
  patternsCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: 0,
    padding: spacing.md,
    gap: spacing.xs,
  },
  patternRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 2 },
  patternDot: { width: 6, height: 6, borderRadius: m3.shape.none, backgroundColor: semantic.brand },
  actions: { gap: spacing.md, marginTop: spacing.md },
  emptyActions: { gap: spacing.md, marginTop: spacing.xl, width: "100%", maxWidth: 320 },
  emptyScroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  emptyHeader: { alignItems: "center", marginTop: spacing.xl },
  toolGrid: { gap: spacing.sm, marginTop: spacing.md },
  toolCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: 0,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  // Lead (fast) card: a left-border accent marks the cheapest first-value path.
  toolCardFast: {
    borderStartColor: cosmic.soulViolet,
    borderStartWidth: 3,
  },
  mbtiCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: 0,
    padding: spacing.md,
  },
  mbtiRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.xs },
  mbtiType: { fontVariant: ["tabular-nums"], letterSpacing: 0 },
  attachmentCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: 0,
    padding: spacing.md,
  },
  attachmentDims: { marginTop: spacing.md, gap: spacing.xs },
  dimRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dimBarOuter: {
    flex: 1,
    height: 6,
    backgroundColor: semantic.surfaceAlt,
    borderRadius: 0,
    overflow: "hidden",
    position: "relative",
  },
  dimBarInner: { height: "100%", backgroundColor: semantic.brand },
  dimBarMid: {
    position: "absolute",
    left: "50%",
    top: -2,
    bottom: -2,
    width: 1,
    backgroundColor: semantic.textSubtle,
    opacity: 0.35,
  },
});

// D4 (Simon 2026-08-18): /persona 와 /core-brain 이 같은 것을 두 번 보여주고
// 있었다. 둘 다 buildPersona + buildCenterCards + loadDomainLevels 로 만들고,
// 둘 다 "나의 종합" 을 제시한다. 진입점은 각각 13개와 14개였다.
//
// 캐논이 정한 정본은 /core-brain 이다 - 파일 헤더가 "user-facing name is 북극성"
// 이라 적고 있고, 홈의 북극성 탭과 딥스페이스 lens 독이 둘 다 그리로 간다.
// 그래서 딥스페이스에서는 여기가 정본으로 넘긴다. "나를 보는 자리가 어디인가"
// 에 답이 둘이면 그건 화면이 부족한 게 아니라 많은 것이다.
//
// 지우지 않고 리다이렉트로 두는 이유는 이 저장소의 기존 관행과 같다
// (jarvis → secondb, mbti → persona, journal → capture): 저장된 링크와 외부
// 링크가 404 가 되면 안 된다.
//
// 레거시 스킨(EXPO_PUBLIC_UI=legacy)은 그대로 PersonaLegacy 를 쓴다. 롤백
// 경로까지 건드릴 이유가 없다.
export default function Persona() {
  if (isDeepSpaceUI()) {
    return <Redirect href="/core-brain" />;
  }
  return <PersonaLegacy />;
}
