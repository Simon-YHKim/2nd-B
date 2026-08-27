/**
 * Axis-scoped layer-B validation lens (rev2 P3b, clone-audit 16/19/20): the
 * shared read-only body for /values (가치관), /motivation (동기·SDT), and
 * /strengths (강점). Cloned 1:1 from the reference ValuesScreen (sb-validate.jsx)
 * + MotivationScreen / StrengthsScreen (sb-surfaces.jsx): headline + subtitle +
 * the sibling-check action pair.
 *
 * HONESTY (canon:186-190 + iden.tsx precedent): the reference prototype fills
 * these axes with example scores (Self-Direction 78, 확신 61%) plus an insight
 * claiming the user's records back the read. But no real per-axis measurement
 * exists yet (deriveValues only ranks; no values/SDT/strengths instrument is
 * wired), so rendering the canon numbers as the user's own read would fabricate
 * data on a self-understanding surface. Until a real loader lands
 * (deriveValuesScored + measured Big Five) we show a neutral "not measured yet"
 * state with the interview CTA instead of the example scores, keeping the
 * design shell clone-faithful while telling the truth.
 *
 * Chrome: DeepSpaceScreen active="lens", windowed (radius-24 card over the
 * shared sky) with the M3 top app bar carrying the axis name (the same
 * ds.axisCheck.<axis>.headline key the body uses, so all 5 locales localize).
 * All colors route through m3.* tokens — no cosmic tokens, no hex literals.
 */
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { canonGlyph, type AnyGlyphName } from "@/components/pixel/pixel-glyphs";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton, MdCard, ProgressLinear, m3TextStyle } from "@/components/m3";
import { SecondbHead } from "@/components/deepspace/SecondbHead";
import { m3 } from "@/lib/theme/m3";
import { flattenAlpha, withAlpha } from "@/lib/theme/tokens";
import { keepAllKo } from "@/lib/i18n/keep-all";
import type { AxisCheckId } from "@/lib/audit/axis-checks";
import type { LoadedValues, LoadedStrengths, LoadedMotivation } from "@/lib/persona/build";
import { VALUE_ROW_KEY, type ValueId } from "@/lib/persona/values-survey";
import { STRENGTH_ROW_KEY, type StrengthId } from "@/lib/persona/strengths-survey";
import { MOTIVATION_ROW_KEY, type MotivationNeedKey } from "@/lib/persona/motivation-survey";

// Material-symbol stroke idiom (2dp currentColor, round caps), matching the
// 아이콘 좌표는 여기 없다 — `components/pixel/pixel-glyphs.ts` 가 정본이다.
// 원래 이 자리에 문자열 SVG 레지스트리가 있었다(저장소에서 열둘 번째).
//
// ⚠ 파일 주석이 스스로 "공유 아이콘 세트를 가볍게 두려고 여기 따로 둔다" 고
// 적고 있었다. 다섯 중 다섯이 전부 다른 레지스트리에도 있는 아이콘이었으니,
// 가벼워진 것은 없고 벌 수만 늘었다.
function LensIcon({ name, color, size = 20 }: { name: string; color: string; size?: number }) {
  return <PixelGlyph name={canonGlyph(name)} color={color} size={size} />;
}

// Sibling-check action pair (reference bottom buttons): a tonal primary + an
// outlined secondary. Routes are the real app screens.
const ACTIONS: Record<AxisCheckId, { primaryRoute: string; primaryIcon: AnyGlyphName; secondaryRoute: string }> = {
  values: { primaryRoute: "/interview", primaryIcon: "forum", secondaryRoute: "/big-five" },
  motivation: { primaryRoute: "/strengths", primaryIcon: "auto_awesome", secondaryRoute: "/big-five" },
  strengths: { primaryRoute: "/secondb", primaryIcon: "forum", secondaryRoute: "/motivation" },
};

type AxisCopyLocale = "en" | "ko" | "es" | "pt" | "id";

function axisCopyLocale(language: string): AxisCopyLocale {
  const base = language.split("-")[0];
  return base === "ko" || base === "es" || base === "pt" || base === "id" ? base : "en";
}

const AXIS_RESULT_COPY: Record<
  AxisCopyLocale,
  {
    confidence: (pct: number) => string;
    valueInsight: (topName: string) => string;
    strengthInsight: (topName: string) => string;
    intrinsicLabel: (pct: number) => string;
    extrinsicLabel: (pct: number) => string;
    balanceNote: (intrinsicHigher: boolean) => string;
    motivationSide: (intrinsicHigher: boolean) => string;
    motivationInsight: (side: string, topNeedName: string) => string;
  }
> = {
  en: {
    confidence: (pct) => `${pct}% confidence`,
    valueInsight: (topName) =>
      `Right now ${topName} comes out highest. This is an estimate from the self-report you just answered, and it can shift over time.`,
    strengthInsight: (topName) =>
      `Right now ${topName} comes out highest. This is an estimate from the self-report you just answered, and it can shift over time.`,
    intrinsicLabel: (pct) => `Intrinsic ${pct}%`,
    extrinsicLabel: (pct) => `Extrinsic ${pct}%`,
    balanceNote: (intrinsicHigher) =>
      intrinsicHigher
        ? "Right now the 'because I want to' side is a bit larger. This is an estimate from the self-report you just answered."
        : "Right now the 'reward/recognition' side is a bit larger. This is an estimate from the self-report you just answered.",
    motivationSide: (intrinsicHigher) => (intrinsicHigher ? "Intrinsic" : "Extrinsic"),
    motivationInsight: (side, topNeedName) =>
      `${side} motivation comes out a bit higher, and among the three needs ${topNeedName} is highest. This is an estimate from the self-report you just answered, and it can shift over time.`,
  },
  ko: {
    confidence: (pct) => `확신 ${pct}%`,
    valueInsight: (topName) =>
      `지금은 ${topName} 쪽이 가장 높게 나왔어요. 방금 답한 자기보고를 바탕으로 한 추정이라, 시간이 지나며 달라질 수 있어요.`,
    strengthInsight: (topName) =>
      `지금은 ${topName} 쪽이 가장 높게 나왔어요. 방금 답한 자기보고를 바탕으로 한 추정이라, 시간이 지나며 달라질 수 있어요.`,
    intrinsicLabel: (pct) => `내적 ${pct}%`,
    extrinsicLabel: (pct) => `외적 ${pct}%`,
    balanceNote: (intrinsicHigher) =>
      intrinsicHigher
        ? "지금은 '하고 싶어서' 쪽이 조금 더 커요. 방금 답한 자기보고를 바탕으로 한 추정이라 달라질 수 있어요."
        : "지금은 '보상·평가' 쪽이 조금 더 커요. 방금 답한 자기보고를 바탕으로 한 추정이라 달라질 수 있어요.",
    motivationSide: (intrinsicHigher) => (intrinsicHigher ? "내적 동기" : "외적 동기"),
    motivationInsight: (side, topNeedName) =>
      `${side}가 조금 더 크게 나왔고, 세 욕구 중에서는 ${topNeedName} 쪽이 가장 높아요. 방금 답한 자기보고를 바탕으로 한 추정이라, 시간이 지나며 달라질 수 있어요.`,
  },
  es: {
    confidence: (pct) => `${pct}% de confianza`,
    valueInsight: (topName) =>
      `Ahora ${topName} aparece como lo más alto. Es una estimación basada en el autoinforme que acabas de responder, y puede cambiar con el tiempo.`,
    strengthInsight: (topName) =>
      `Ahora ${topName} aparece como lo más alto. Es una estimación basada en el autoinforme que acabas de responder, y puede cambiar con el tiempo.`,
    intrinsicLabel: (pct) => `Intrínseca ${pct}%`,
    extrinsicLabel: (pct) => `Extrínseca ${pct}%`,
    balanceNote: (intrinsicHigher) =>
      intrinsicHigher
        ? "Ahora pesa un poco más el lado de 'porque quiero'. Es una estimación basada en el autoinforme que acabas de responder."
        : "Ahora pesa un poco más el lado de 'recompensa/reconocimiento'. Es una estimación basada en el autoinforme que acabas de responder.",
    motivationSide: (intrinsicHigher) => (intrinsicHigher ? "La motivación intrínseca" : "La motivación extrínseca"),
    motivationInsight: (side, topNeedName) =>
      `${side} aparece un poco más alta, y entre las tres necesidades ${topNeedName} es la más alta. Es una estimación basada en el autoinforme que acabas de responder, y puede cambiar con el tiempo.`,
  },
  pt: {
    confidence: (pct) => `${pct}% de confiança`,
    valueInsight: (topName) =>
      `Agora ${topName} aparece como o ponto mais alto. Esta é uma estimativa baseada no autorrelato que você acabou de responder, e pode mudar com o tempo.`,
    strengthInsight: (topName) =>
      `Agora ${topName} aparece como o ponto mais alto. Esta é uma estimativa baseada no autorrelato que você acabou de responder, e pode mudar com o tempo.`,
    intrinsicLabel: (pct) => `Intrínseca ${pct}%`,
    extrinsicLabel: (pct) => `Extrínseca ${pct}%`,
    balanceNote: (intrinsicHigher) =>
      intrinsicHigher
        ? "Agora o lado de 'porque eu quero' está um pouco maior. Esta é uma estimativa baseada no autorrelato que você acabou de responder."
        : "Agora o lado de 'recompensa/reconhecimento' está um pouco maior. Esta é uma estimativa baseada no autorrelato que você acabou de responder.",
    motivationSide: (intrinsicHigher) => (intrinsicHigher ? "A motivação intrínseca" : "A motivação extrínseca"),
    motivationInsight: (side, topNeedName) =>
      `${side} aparece um pouco mais alta, e entre as três necessidades ${topNeedName} é a mais alta. Esta é uma estimativa baseada no autorrelato que você acabou de responder, e pode mudar com o tempo.`,
  },
  id: {
    confidence: (pct) => `${pct}% keyakinan`,
    valueInsight: (topName) =>
      `Saat ini ${topName} muncul paling tinggi. Ini perkiraan dari laporan diri yang baru kamu jawab, dan bisa berubah seiring waktu.`,
    strengthInsight: (topName) =>
      `Saat ini ${topName} muncul paling tinggi. Ini perkiraan dari laporan diri yang baru kamu jawab, dan bisa berubah seiring waktu.`,
    intrinsicLabel: (pct) => `Intrinsik ${pct}%`,
    extrinsicLabel: (pct) => `Ekstrinsik ${pct}%`,
    balanceNote: (intrinsicHigher) =>
      intrinsicHigher
        ? "Saat ini sisi 'karena aku ingin' sedikit lebih besar. Ini perkiraan dari laporan diri yang baru kamu jawab."
        : "Saat ini sisi 'imbalan/pengakuan' sedikit lebih besar. Ini perkiraan dari laporan diri yang baru kamu jawab.",
    motivationSide: (intrinsicHigher) => (intrinsicHigher ? "Motivasi intrinsik" : "Motivasi ekstrinsik"),
    motivationInsight: (side, topNeedName) =>
      `${side} sedikit lebih tinggi, dan dari tiga kebutuhan ${topNeedName} adalah yang tertinggi. Ini perkiraan dari laporan diri yang baru kamu jawab, dan bisa berubah seiring waktu.`,
  },
};

// Populated 가치관 body — the reference ValuesScreen layout (sb-validate.jsx),
// but driven ONLY by the user's real values self-report (never the prototype's
// example numbers). Renders the CORE VALUES top-3 highlight, the 6-bar 가치
// 스펙트럼, and a 세컨비 insight generated from the ACTUAL top value. Confidence
// is shown next to the headline (honest, sub-max). Scoring/labels: values-survey.ts.
function ValuesPopulated({ result }: { result: LoadedValues }) {
  const { t, i18n } = useTranslation("home");
  const copy = AXIS_RESULT_COPY[axisCopyLocale(i18n.language)];

  const rowKey = (v: ValueId) => VALUE_ROW_KEY[v] ?? v;
  const name = (v: ValueId) => t(`ds.axisCheck.values.rows.${rowKey(v)}.name`);
  const note = (v: ValueId) => t(`ds.axisCheck.values.rows.${rowKey(v)}.note`);

  const sorted = [...result.scores].sort((a, b) => b.score - a.score);
  const top3 = sorted.slice(0, 3);
  const topName = name(sorted[0].value);
  // Honest insight — grounded in the user's actual highest self-report value,
  // framed as an estimate that can shift, never a medical verdict or a claim that
  // records "prove" it (the reference's hardcoded 자율성 line is not reused).
  const insight = copy.valueInsight(topName);

  return (
    <>
      {/* ── CORE VALUES top-3 highlight ─────────────────────────────── */}
      <View style={styles.coreCard}>
        <Text style={styles.coreLabel}>{t("ds.axisCheck.values.coreLabel")}</Text>
        <View style={styles.coreRow}>
          {top3.map((s, i) => (
            <View key={s.value} style={[styles.coreCell, i === 0 && styles.coreCellFirst]}>
              <Text style={[styles.coreRank, i === 0 && styles.coreRankFirst]}>{i + 1}</Text>
              <Text style={[styles.coreName, i === 0 && styles.coreNameFirst]}>{name(s.value)}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── 가치 스펙트럼 — 6 ranked bars ───────────────────────────── */}
      <Text style={[m3TextStyle("titleSmall"), styles.sectionLabel]}>
        {t("ds.axisCheck.values.spectrum")}
      </Text>
      <View style={styles.spectrum}>
        {sorted.map((s) => (
          <View key={s.value} style={styles.specRow}>
            <View style={styles.specHead}>
              <Text style={[m3TextStyle("bodyMedium"), styles.specName]}>{name(s.value)}</Text>
              <Text style={[m3TextStyle("labelMedium"), styles.specMono]}>{s.score}</Text>
            </View>
            <ProgressLinear
              value={Math.max(0, Math.min(1, s.score / 100))}
              color={m3.color.tertiary}
              accessibilityLabel={`${name(s.value)} ${s.score}`}
            />
            <Text style={[m3TextStyle("bodySmall"), styles.specNote]}>{note(s.value)}</Text>
          </View>
        ))}
      </View>

      {/* ── 세컨비 insight (grounded in the real top value) ─────────── */}
      <View style={styles.insightCard}>
        <SecondbHead size={30} track={false} />
        <Text style={[m3TextStyle("bodyMedium"), styles.insightText]}>{insight}</Text>
      </View>
    </>
  );
}

// Populated 동기 body — the reference MotivationScreen layout (sb-surfaces.jsx),
// but driven ONLY by the user's real motivation self-report (never the prototype's
// example 내적 68% / 외적 32% numbers). Renders the INTRINSIC↔EXTRINSIC balance bar
// with the ACTUAL intrinsicPct/extrinsicPct, a 3-bar SDT-need spectrum
// (autonomy/competence/relatedness), and a 세컨비 insight grounded in whichever side
// (intrinsic/extrinsic) is higher plus the top need. Confidence is shown next to the
// headline (honest, sub-max). Scoring/labels: motivation-survey.ts.
function MotivationPopulated({ result }: { result: LoadedMotivation }) {
  const { t, i18n } = useTranslation("home");
  const copy = AXIS_RESULT_COPY[axisCopyLocale(i18n.language)];

  const rowKey = (k: MotivationNeedKey) => MOTIVATION_ROW_KEY[k] ?? k;
  const name = (k: MotivationNeedKey) => t(`ds.axisCheck.motivation.rows.${rowKey(k)}.name`);
  const note = (k: MotivationNeedKey) => t(`ds.axisCheck.motivation.rows.${rowKey(k)}.note`);

  const needs = [...result.needs].sort((a, b) => b.score - a.score);
  const topNeedName = name(needs[0].key);
  const intrinsicHigher = result.intrinsicPct >= result.extrinsicPct;

  // Balance-bar labels built from the user's REAL percentages — NEVER the i18n
  // example strings (내적 68% / 외적 32%), which are prototype placeholders.
  const intrinsicLabel = copy.intrinsicLabel(result.intrinsicPct);
  const extrinsicLabel = copy.extrinsicLabel(result.extrinsicPct);

  // Balance note + insight grounded in which side is actually higher and which
  // need is top — framed as an estimate that can shift, never a verdict and never
  // the reference's hardcoded 자율성 claim.
  const balanceNote = copy.balanceNote(intrinsicHigher);
  const insight = copy.motivationInsight(copy.motivationSide(intrinsicHigher), topNeedName);

  return (
    <>
      {/* ── 내적 ↔ 외적 balance bar (real percentages) ───────────────── */}
      <MdCard variant="outlined" style={styles.balanceCard}>
        <Text style={[m3TextStyle("labelLarge"), styles.balanceTitle]}>
          {t("ds.axisCheck.motivation.balanceTitle")}
        </Text>
        <View style={styles.balanceBar}>
          <View style={[styles.balanceIntrinsic, { flex: Math.max(result.intrinsicPct, 0) }]}>
            <Text style={styles.balanceIntrinsicText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{intrinsicLabel}</Text>
          </View>
          <View style={[styles.balanceExtrinsic, { flex: Math.max(result.extrinsicPct, 0) }]}>
            <Text style={styles.balanceExtrinsicText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{extrinsicLabel}</Text>
          </View>
        </View>
        <Text style={[m3TextStyle("bodySmall"), styles.balanceNote]}>{balanceNote}</Text>
      </MdCard>

      {/* ── 세 가지 욕구 · 자기결정성 — 3 SDT-need bars ─────────────── */}
      <Text style={[m3TextStyle("titleSmall"), styles.sectionLabel]}>
        {t("ds.axisCheck.motivation.spectrum")}
      </Text>
      <View style={styles.spectrum}>
        {needs.map((n) => (
          <View key={n.key} style={styles.specRow}>
            <View style={styles.specHead}>
              <Text style={[m3TextStyle("bodyMedium"), styles.specName]}>{name(n.key)}</Text>
              <Text style={[m3TextStyle("labelMedium"), styles.specMono]}>{n.score}</Text>
            </View>
            <ProgressLinear
              value={Math.max(0, Math.min(1, n.score / 100))}
              color={m3.color.tertiary}
              accessibilityLabel={`${name(n.key)} ${n.score}`}
            />
            <Text style={[m3TextStyle("bodySmall"), styles.specNote]}>{note(n.key)}</Text>
          </View>
        ))}
      </View>

      {/* ── 세컨비 insight (grounded in the real balance + top need) ── */}
      <View style={styles.insightCard}>
        <SecondbHead size={30} track={false} />
        <Text style={[m3TextStyle("bodyMedium"), styles.insightText]}>{insight}</Text>
      </View>
    </>
  );
}

// Populated 강점 body — mirrors ValuesPopulated (sb-surfaces.jsx StrengthsScreen),
// driven ONLY by the user's real strengths self-report (never the prototype's
// example numbers). Renders the SIGNATURE strengths top-3 highlight, the 5-bar 강점
// 스펙트럼, and a 세컨비 insight generated from the ACTUAL top strength. Confidence
// is shown next to the headline (honest, sub-max). Scoring/labels: strengths-survey.ts.
function StrengthsPopulated({ result }: { result: LoadedStrengths }) {
  const { t, i18n } = useTranslation("home");
  const copy = AXIS_RESULT_COPY[axisCopyLocale(i18n.language)];

  const rowKey = (s: StrengthId) => STRENGTH_ROW_KEY[s] ?? s;
  const name = (s: StrengthId) => t(`ds.axisCheck.strengths.rows.${rowKey(s)}.name`);
  const note = (s: StrengthId) => t(`ds.axisCheck.strengths.rows.${rowKey(s)}.note`);

  const sorted = [...result.scores].sort((a, b) => b.score - a.score);
  const top3 = sorted.slice(0, 3);
  const topName = name(sorted[0].strength);
  // Honest insight — grounded in the user's actual highest self-report strength,
  // framed as an estimate that can shift, never a verdict or a claim that records
  // "prove" it (the reference's hardcoded 호기심 line is not reused).
  const insight = copy.strengthInsight(topName);

  return (
    <>
      {/* ── SIGNATURE strengths top-3 highlight ─────────────────────── */}
      <View style={styles.coreCard}>
        <Text style={styles.coreLabel}>{t("ds.axisCheck.strengths.coreLabel")}</Text>
        <View style={styles.coreRow}>
          {top3.map((s, i) => (
            <View key={s.strength} style={[styles.coreCell, i === 0 && styles.coreCellFirst]}>
              <Text style={[styles.coreRank, i === 0 && styles.coreRankFirst]}>{i + 1}</Text>
              <Text style={[styles.coreName, i === 0 && styles.coreNameFirst]}>{name(s.strength)}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── 강점 스펙트럼 — 5 ranked bars ──────────────────────────── */}
      <Text style={[m3TextStyle("titleSmall"), styles.sectionLabel]}>
        {t("ds.axisCheck.strengths.spectrum")}
      </Text>
      <View style={styles.spectrum}>
        {sorted.map((s) => (
          <View key={s.strength} style={styles.specRow}>
            <View style={styles.specHead}>
              <Text style={[m3TextStyle("bodyMedium"), styles.specName]}>{name(s.strength)}</Text>
              <Text style={[m3TextStyle("labelMedium"), styles.specMono]}>{s.score}</Text>
            </View>
            <ProgressLinear
              value={Math.max(0, Math.min(1, s.score / 100))}
              color={m3.color.tertiary}
              accessibilityLabel={`${name(s.strength)} ${s.score}`}
            />
            <Text style={[m3TextStyle("bodySmall"), styles.specNote]}>{note(s.strength)}</Text>
          </View>
        ))}
      </View>

      {/* ── 세컨비 insight (grounded in the real top strength) ──────── */}
      <View style={styles.insightCard}>
        <SecondbHead size={30} track={false} />
        <Text style={[m3TextStyle("bodyMedium"), styles.insightText]}>{insight}</Text>
      </View>
    </>
  );
}

function AxisLens({
  axis,
  valuesResult,
  strengthsResult,
  motivationResult,
}: {
  axis: AxisCheckId;
  valuesResult?: LoadedValues | null;
  strengthsResult?: LoadedStrengths | null;
  motivationResult?: LoadedMotivation | null;
}) {
  const { t, i18n } = useTranslation("home");
  const act = ACTIONS[axis];
  const k = (leaf: string) => t(`ds.axisCheck.${axis}.${leaf}`);
  const copy = AXIS_RESULT_COPY[axisCopyLocale(i18n.language)];

  // Populated only when THIS axis has a real self-report result in hand: values →
  // ValuesPopulated (>=3 scores for the top-3 card), strengths → StrengthsPopulated
  // (>=3), motivation → MotivationPopulated (>=1 SDT need + a balance split).
  // Otherwise the honest not-measured state stands in for the reference's example
  // scores (see file header).
  const valuesPopulated = axis === "values" && !!valuesResult && valuesResult.scores.length >= 3;
  const strengthsPopulated = axis === "strengths" && !!strengthsResult && strengthsResult.scores.length >= 3;
  const motivationPopulated =
    axis === "motivation" && !!motivationResult && motivationResult.needs.length >= 1;
  const populated = valuesPopulated || strengthsPopulated || motivationPopulated;
  const activeConfidence = valuesPopulated
    ? valuesResult!.confidence
    : strengthsPopulated
      ? strengthsResult!.confidence
      : motivationPopulated
        ? motivationResult!.confidence
        : 0;
  const confPct = populated ? Math.round(activeConfidence * 100) : 0;

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View style={styles.headRow}>
        <Text style={[m3TextStyle("headlineSmall"), styles.headline]}>{k("headline")}</Text>
        {populated ? (
          <Text style={[m3TextStyle("labelMedium"), styles.confidence]}>
            {copy.confidence(confPct)}
          </Text>
        ) : null}
      </View>
      <Text style={[m3TextStyle("bodyMedium"), styles.subtitle]} accessibilityLabel={k("subtitle")}>{keepAllKo(k("subtitle"))}</Text>

      {valuesPopulated ? (
        <ValuesPopulated result={valuesResult as LoadedValues} />
      ) : motivationPopulated ? (
        <MotivationPopulated result={motivationResult as LoadedMotivation} />
      ) : strengthsPopulated ? (
        <StrengthsPopulated result={strengthsResult as LoadedStrengths} />
      ) : (
        <MdCard variant="outlined" style={styles.emptyCard}>
          <SecondbHead size={30} track={false} />
          <View style={styles.emptyBody}>
            <Text style={[m3TextStyle("titleSmall"), styles.emptyTitle]}>
              {t("ds.axisCheck.emptyTitle")}
            </Text>
            <Text style={[m3TextStyle("bodyMedium"), styles.emptyText]}>
              {t("ds.axisCheck.emptyText")}
            </Text>
          </View>
        </MdCard>
      )}

      {/* ── sibling-check actions ────────────────────────────────────── */}
      <View style={styles.actions}>
        <MdButton
          label={k("actionPrimary")}
          variant="tonal"
          onPress={() => router.push(act.primaryRoute as never)}
          icon={<LensIcon name={act.primaryIcon} color={m3.color.onSecondaryContainer} size={18} />}
          style={styles.actionBtn}
        />
        <MdButton
          label={k("actionSecondary")}
          variant="outlined"
          onPress={() => router.push(act.secondaryRoute as never)}
          style={styles.actionBtn}
        />
      </View>
    </ScrollView>
  );
}

export function AxisCheckScreen({
  axis,
  valuesResult,
  strengthsResult,
  motivationResult,
}: {
  axis: AxisCheckId;
  /** Real values self-report result — when present (and axis is "values"),
   *  AxisLens renders the populated layout instead of the not-measured state. */
  valuesResult?: LoadedValues | null;
  /** Real strengths self-report result — when present (and axis is "strengths"),
   *  AxisLens renders the populated layout instead of the not-measured state. */
  strengthsResult?: LoadedStrengths | null;
  /** Real motivation self-report result — when present (and axis is "motivation"),
   *  AxisLens renders the populated balance + SDT-need layout. */
  motivationResult?: LoadedMotivation | null;
}) {
  const { t } = useTranslation("home");
  // Bar title reuses the axis body's headline key so es/pt/id localize too.
  const barTitle = t(`ds.axisCheck.${axis}.headline`);

  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={barTitle} onBack={() => router.back()}>
      <AxisLens
        axis={axis}
        valuesResult={valuesResult}
        strengthsResult={strengthsResult}
        motivationResult={motivationResult}
      />
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },

  // head
  headRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  headline: { color: m3.color.onSurface, fontFamily: m3.font.brand, flexShrink: 1 },
  levelChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: m3.shape.none, backgroundColor: m3.color.tertiaryContainer },
  levelChipText: { color: m3.color.onTertiaryContainer, fontFamily: m3.font.brand, fontWeight: "600" },
  confidence: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },
  subtitle: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 4, marginBottom: 16 },

  // 가치관 — CORE VALUES top-3 card
  coreCard: { borderRadius: m3.shape.none, padding: 18, backgroundColor: m3.color.primaryContainer, borderWidth: 1, borderColor: m3.color.outlineVariant },
  coreLabel: { fontFamily: m3.font.mono, fontSize: 10, letterSpacing: 1.4, color: flattenAlpha(m3.color.onPrimaryContainer, 0.8, m3.color.primaryContainer), marginBottom: 12 },
  coreRow: { flexDirection: "row", gap: 8 },
  coreCell: { flex: 1, alignItems: "center", paddingVertical: 12, paddingHorizontal: 6, borderRadius: m3.shape.none, backgroundColor: m3.color.surface, borderWidth: 1, borderColor: m3.color.outlineVariant },
  coreCellFirst: { backgroundColor: m3.color.primary, borderColor: m3.color.primary },
  coreRank: { fontFamily: m3.font.mono, fontSize: 12, color: m3.color.onSurfaceVariant },
  coreRankFirst: { color: m3.color.onPrimary },
  coreName: { fontSize: 15, fontWeight: "700", color: m3.color.onSurface, fontFamily: m3.font.brand, marginTop: 4 },
  coreNameFirst: { color: m3.color.onPrimary },

  // 동기 — 내적 ↔ 외적 balance bar
  balanceCard: { padding: 16 },
  balanceTitle: { color: m3.color.onSurface, fontFamily: m3.font.brand, marginBottom: 10 },
  balanceBar: { flexDirection: "row", height: 38, borderRadius: m3.shape.none, overflow: "hidden" },
  balanceIntrinsic: { flex: 68, backgroundColor: m3.color.primary, alignItems: "center", justifyContent: "center" },
  // lineHeight (~1.38x) — the bar is overflow:hidden height 38, so a Korean
  // 내적/외적 %  numberOfLines Text with no line box gets its 받침 clipped on Android.
  balanceIntrinsicText: { color: m3.color.onPrimary, fontFamily: m3.font.brand, fontSize: 12, fontWeight: "700", lineHeight: 18 },
  balanceExtrinsic: { flex: 32, backgroundColor: m3.color.surfaceContainerHighest, alignItems: "center", justifyContent: "center" },
  balanceExtrinsicText: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, fontSize: 12, fontWeight: "600", lineHeight: 18 },
  balanceNote: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 10 },

  // 강점 — 3 signature cards
  sigRow: { flexDirection: "row", gap: 8 },
  sigCard: { flex: 1, padding: 14, alignItems: "center", borderRadius: m3.shape.none },
  sigCardFirst: { backgroundColor: m3.color.surfaceContainerLow, borderWidth: 2, borderColor: m3.color.primary, ...m3.elevation.level1 },
  sigCardRest: { backgroundColor: m3.color.surfaceContainerHighest },
  sigIconBox: { width: 40, height: 40, borderRadius: m3.shape.none, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  sigIconBoxFirst: { backgroundColor: m3.color.primary },
  sigIconBoxRest: { backgroundColor: m3.color.secondaryContainer },
  sigName: { color: m3.color.onSurface, fontFamily: m3.font.brand, textAlign: "center" },

  // section label + spectrum
  sectionLabel: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 20, marginBottom: 10 },
  spectrum: { gap: 13 },
  specRow: { gap: 5 },
  specHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  specName: { color: m3.color.onSurface, fontFamily: m3.font.brand, fontWeight: "600" },
  specMono: { fontFamily: m3.font.mono, color: m3.color.onSurfaceVariant },
  specNote: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 4 },
  strRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  strBody: { flex: 1, gap: 4 },

  // 세컨비 insight card
  insightCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 16,
    padding: 14,
    borderRadius: m3.shape.medium,
    backgroundColor: m3.color.secondaryContainer,
  },
  insightText: { flex: 1, color: m3.color.onSecondaryContainer, fontFamily: m3.font.brand },

  // honesty neutral state (no real per-axis measurement yet)
  emptyCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 16, padding: 16, borderRadius: m3.shape.medium },
  emptyBody: { flex: 1, gap: 4 },
  emptyTitle: { color: m3.color.onSurface, fontFamily: m3.font.brand, fontWeight: "700" },
  emptyText: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },

  // actions
  actions: { flexDirection: "row", gap: 8, marginTop: 18 },
  actionBtn: { flex: 1 },
});
