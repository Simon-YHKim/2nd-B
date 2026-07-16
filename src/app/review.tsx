// /review (memo §4 T3, demo-loop step 5): the propose -> ratify surface. Assembles
// the ready pieces - buildPersona -> proposalContextForStar -> proposeSelfModelChange
// -> RatifySheet -> applyRatify. User-triggered (no Gemini on mount). v1 proposes
// for star1 (지금의 나). Surfaces D9 tier shifts (loadTierShifts) as a re-check nudge.
// Errors degrade gracefully (no profile / offline -> friendly note).

import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { cosmic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { buildPersona } from "@/lib/persona/build";
import { proposalContextForStar } from "@/lib/persona/proposal-context";
import { proposeSelfModelChange } from "@/lib/persona/propose-self-model";
import { applyRatify, type RatifyDecision, type SelfModelProposal } from "@/lib/persona/proposal";
import { RatifySheet } from "@/components/persona/RatifySheet";
import { loadTierShifts } from "@/lib/persona/load-tier-shifts";
import { tierShiftNudge, type TierShift } from "@/lib/persona/tier-history";
import { SELF_UNDERSTANDING_STARS } from "@/lib/persona/stars";
import { recordStarTiers } from "@/lib/persona/record-star-tiers";
import { reactExpression } from "@/lib/companion/expression";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceReviewScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";

function starName(id: TierShift["starId"], locale: "en" | "ko"): string {
  const star = SELF_UNDERSTANDING_STARS.find((s) => s.id === id);
  return star ? (locale === "ko" ? star.nameKo : star.nameEn) : id;
}

function ReviewScreenLegacy() {
  const { t, i18n } = useTranslation("review");
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const { userId, isMinor } = useAuth();
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState<SelfModelProposal | null>(null);
  // Real, resolvable record refs behind the proposal (0060), captured at build
  // time so a ratify can cite the records the card was built from — not the LLM's
  // invented proposal.citations.
  const [evidenceRefs, setEvidenceRefs] = useState<string[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [shifts, setShifts] = useState<TierShift[]>([]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    // D9 (memo §10): surface stars whose tendency has shifted as a re-check nudge.
    loadTierShifts(userId)
      .then((s) => {
        if (active) setShifts(s);
      })
      .catch(() => {
        // best-effort; no shift banner on failure.
      });
    return () => {
      active = false;
    };
  }, [userId]);

  async function generate() {
    if (!userId || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const card = await buildPersona(userId, locale, isMinor === true);
      const ctx = proposalContextForStar(card, "now");
      setEvidenceRefs(ctx.evidenceRefs);
      const p = await proposeSelfModelChange(
        userId,
        { kind: "star", star: "now" },
        ctx.before,
        ctx.evidence,
        5,
        locale,
        isMinor === true,
      );
      if (p) {
        setProposal(p);
        setSheetOpen(true);
      } else {
        setResult(t("noProposal"));
      }
    } catch {
      setResult(
        locale === "ko"
          ? "제안을 불러오지 못했어요. 다시 시도해 주세요."
          : "Couldn't load a proposal. Try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleDecision(decision: RatifyDecision) {
    const r = applyRatify(4, decision);
    setSheetOpen(false);
    if (decision === "ratify" && userId && proposal?.target.kind === "star") {
      // Persist the ratified tier so D9 history + trend detection reflect it.
      // Cite evidenceRefs (real `record:<id>` for the records this card was built
      // from), NOT proposal.citations — those are Gemini-emitted labels with no
      // real-id whitelist behind them. The write boundary re-sanitizes to
      // resolvable refs only, so a fabricated string could never survive (0060).
      void recordStarTiers(userId, { [proposal.target.star]: r.resultingLevel }, "journal", {
        origin: "ratify",
        citations: evidenceRefs,
      });
    }
    // 승인 = a quick wink (the ratify gesture across the app).
    if (decision === "ratify") reactExpression("wink");
    setResult(
      decision === "ratify"
        ? locale === "ko"
          ? `승인됐어요 - 실행가능(L${r.resultingLevel})으로 올라갔어요.`
          : `Ratified - moved to actionable (L${r.resultingLevel}).`
        : locale === "ko"
          ? "이번엔 그대로 둘게요."
          : "Left as is for now.",
    );
  }

  // D9 re-check nudge, evidence-aware (0060): surfaces how many real records
  // back the shifted stars. Pure helper so the string logic stays tested.
  const nudge = tierShiftNudge(shifts, locale, starName);

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="caption" color="textMuted">{t("eyebrow")}</Text>
        <Text variant="body" style={styles.title}>
          {t("headline")}
        </Text>
        <Text variant="subtle" color="textMuted" style={styles.lede}>
          {locale === "ko"
            ? "비서가 기록을 보고 다음 한 걸음을 제안해요. 승인할 때만 반영돼요."
            : "Your assistant proposes a next step from your records. It applies only when you ratify."}
        </Text>
        {nudge ? (
          <Text variant="subtle" color="brand" style={styles.shifts}>{nudge}</Text>
        ) : null}
        <Button label={t("cta")} variant="primary" onPress={generate} />
        {loading ? <ActivityIndicator color={cosmic.soulViolet} style={styles.spinner} /> : null}
        {result ? (
          <Text variant="body" color="textMuted" style={styles.result}>{result}</Text>
        ) : null}
      </ScrollView>
      <RatifySheet
        proposal={proposal}
        locale={locale}
        visible={sheetOpen}
        onDecision={handleDecision}
        onClose={() => setSheetOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: cosmic.space950 },
  body: { padding: spacing.lg, gap: spacing.sm },
  title: { marginTop: 2 },
  lede: { marginBottom: spacing.sm },
  spinner: { marginTop: spacing.sm },
  result: { marginTop: spacing.sm },
  shifts: { marginBottom: spacing.sm },
});

export default function ReviewScreen() {
  if (isDeepSpaceUI()) return <DeepSpaceReviewScreen />;
  return <ReviewScreenLegacy />;
}
