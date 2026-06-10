// First-run onboarding (onboarding pack §3) — a short, concrete intro that
// ends at the first saved record. No RAG/clinical/game wording (§9).
// Completion is recorded in localStorage (§4) so the index redirect only sends
// a user here once.
//
// J4 (e2e journey register): compressed from three steps to ONE. The user has
// already typed email + password + DOB + consent acks at sign-up; three more
// gate screens before the first piece of value violated the canon (minimum
// gates before first value, one message per screen) and steps 1-2 carried no
// actionable information beyond what step 3 said. The single step keeps the
// honest where-it-lives promise (기록 보관소, J1) and folds the trust message
// (answers grounded in your records) into one body line. The 1-min manual
// remains the opt-in deep-dive for everything the cut steps used to say.

import { useWindowDimensions, View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumAppShell, PremiumLoadingState } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { markOnboardingComplete } from "@/lib/onboarding/state";
import { ShardArt } from "@/components/art/IslandArt";
import { SecondBSprite } from "@/components/art/SecondBSprite";

interface Step {
  art: "firstShard";
  title: { ko: string; en: string };
  body: { ko: string; en: string };
  cta: { ko: string; en: string };
}

const STEP: Step = {
  art: "firstShard",
  title: { ko: "먼저 한 문장만 저장해요", en: "Start with one sentence" },
  body: {
    ko: "오늘 기억하고 싶은 일, 배운 것, 링크 하나면 충분해요. 저장한 조각은 기록 보관소에 모이고, 세컨비의 답은 그 기록을 근거로 해요.",
    en: "A thought, lesson, or link is enough. Your pieces collect in your records, and SecondB's answers are grounded in them.",
  },
  cta: { ko: "첫 기록 저장", en: "Save my first note" },
};

export default function Onboarding() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const { width } = useWindowDimensions();

  if (loading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={locale === "ko" ? "온보딩을 불러오는 중이에요…" : "Loading onboarding…"} />
        </View>
      </PremiumAppShell>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const artW = Math.min(width - spacing.lg * 2, 360);
  const openGraphHint = locale === "ko" ? "온보딩을 마치고 그래프로 이동합니다." : "Completes onboarding and opens the graph.";
  const primaryHint =
    locale === "ko"
      ? "온보딩을 마치고 첫 기록 화면으로 이동합니다."
      : "Completes onboarding and opens the first capture screen.";

  function finishToCapture() {
    markOnboardingComplete();
    router.replace({ pathname: "/capture", params: { entry: "firstRun" } });
  }
  function finishToGraph() {
    markOnboardingComplete();
    router.replace("/");
  }

  return (
    <PremiumAppShell>
      <View style={styles.root}>
        <View style={styles.body}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <OnboardingPremiumArt width={artW} />
          </View>
          <Text variant="heading" style={styles.title}>{STEP.title[locale]}</Text>
          <Text variant="body" color="textMuted" style={styles.bodyText}>{STEP.body[locale]}</Text>
        </View>

        <View style={styles.actions}>
          <Button label={STEP.cta[locale]} variant="primary" onPress={finishToCapture} accessibilityHint={primaryHint} />
          <Button
            label={locale === "ko" ? "건너뛰고 둘러보기" : "Skip and look around"}
            // O-R1 P1: the escape hatch must not weigh the same as the
            // primary CTA — one clearly dominant action per screen.
            variant="ghost"
            onPress={() => finishToGraph()}
            accessibilityHint={openGraphHint}
          />
        </View>
      </View>
    </PremiumAppShell>
  );
}

function OnboardingPremiumArt({ width }: { width: number }) {
  const stageW = Math.min(width, 360);
  return (
    <View style={[styles.artStage, { width: stageW }]}>
      <ShardArt id="core_violet" size={Math.min(130, stageW * 0.38)} />
      <SecondBSprite state="carrying_shard" size={86} float />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
  root: { flex: 1, justifyContent: "space-between", paddingVertical: spacing.lg },
  body: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.lg },
  title: { textAlign: "center" },
  bodyText: { textAlign: "center", maxWidth: 420, lineHeight: 22 },
  actions: { gap: spacing.sm },
  artStage: {
    minHeight: 200,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
});
