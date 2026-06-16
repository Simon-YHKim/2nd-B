// /review (memo §4 T3, demo-loop step 5): the propose -> ratify surface. Assembles
// the ready pieces - buildPersona -> proposalContextForStar -> proposeSelfModelChange
// -> RatifySheet -> applyRatify. User-triggered (no Gemini on mount). v1 proposes
// for star1 (지금의 나); persist depth is minimal (confirmation) - full D9 tier-history
// is a follow-up. Errors degrade gracefully (no profile / offline -> friendly note).

import { useState } from "react";
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

export default function ReviewScreen() {
  const { i18n } = useTranslation();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const { userId, isMinor } = useAuth();
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState<SelfModelProposal | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function generate() {
    if (!userId || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const card = await buildPersona(userId, locale, isMinor === true);
      const ctx = proposalContextForStar(card, "now");
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
        setResult(locale === "ko" ? "지금은 제안할 변화가 없어요." : "No change to propose right now.");
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

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="caption" color="textMuted">{locale === "ko" ? "08. 점검" : "08. Review"}</Text>
        <Text variant="body" style={styles.title}>
          {locale === "ko" ? "내가 달라졌다면 별자리도 함께 점검" : "If you've changed, review your constellation"}
        </Text>
        <Text variant="subtle" color="textMuted" style={styles.lede}>
          {locale === "ko"
            ? "비서가 기록을 보고 다음 한 걸음을 제안해요. 승인할 때만 반영돼요."
            : "Your assistant proposes a next step from your records. It applies only when you ratify."}
        </Text>
        <Button label={locale === "ko" ? "제안 받기" : "Get a proposal"} variant="primary" onPress={generate} />
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
});
