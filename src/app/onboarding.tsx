// First-run onboarding — one deep-space screen that ends at the first saved
// record. It intentionally avoids the legacy premium/island art track.

import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Text } from "@/components/ui/Text";
import { InlineLoader } from "@/components/ui/InlineLoader";
import { SecondbHead } from "@/components/deep-space/SecondbHead";
import { deepSpace, deepSpaceRadii, deepSpaceSpacing, withAlpha } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { markOnboardingComplete } from "@/lib/onboarding/state";

interface Step {
  art: "firstShard";
  title: { ko: string; en: string };
  body: { ko: string; en: string };
  cta: { ko: string; en: string };
  skip: { ko: string; en: string };
}

const STEP: Step = {
  art: "firstShard",
  title: { ko: "먼저 한 문장만 저장해요", en: "Start with one sentence" },
  body: {
    ko: "오늘 기억하고 싶은 일, 배운 것, 링크 하나면 충분해요. 저장한 별가루는 기록 보관소에 모이고, 세컨비의 답은 그 기록을 근거로 해요.",
    en: "A thought, lesson, or link is enough. Your pieces collect in your records, and SecondB's answers are grounded in them.",
  },
  cta: { ko: "첫 기록 저장", en: "Save my first note" },
  skip: { ko: "건너뛰고 둘러보기", en: "Skip and look around" },
};

export default function Onboarding() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = i18n.language === "ko" ? "ko" : "en";

  if (loading) return <InlineLoader />;
  if (!userId) return <Redirect href="/sign-in" />;

  const openGraphHint = locale === "ko" ? "온보딩을 마치고 홈으로 이동합니다." : "Completes onboarding and opens the graph.";
  const primaryHint =
    locale === "ko"
      ? "온보딩을 마치고 첫 기록 화면으로 이동합니다."
      : "Completes onboarding and opens the first capture screen.";

  function finishToCapture() {
    markOnboardingComplete();
    router.replace({ pathname: "/capture", params: { entry: "firstRun" } });
  }

  function finishToHome() {
    markOnboardingComplete();
    router.replace("/");
  }

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View pointerEvents="none" style={styles.spaceWash}>
        <View style={styles.topGlow} />
        <View style={[styles.star, styles.starA]} />
        <View style={[styles.star, styles.starB]} />
        <View style={[styles.star, styles.starC]} />
        <View style={[styles.star, styles.starD]} />
        <View style={[styles.star, styles.starE]} />
      </View>

      <View style={styles.hero}>
        <View style={styles.soulCard}>
          <View style={styles.soulCrossH} />
          <View style={styles.soulCrossV} />
          <View style={styles.soulSparkA} />
          <View style={styles.soulSparkB} />
        </View>
        <SecondbHead size={112} mood="positive" accessibilityLabel={locale === "ko" ? "세컨비" : "SecondB"} />
      </View>

      <View style={styles.copyBlock}>
        <Text variant="heading" style={styles.title}>{STEP.title[locale]}</Text>
        <Text variant="body" style={styles.body}>{STEP.body[locale]}</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={STEP.cta[locale]}
          accessibilityHint={primaryHint}
          onPress={finishToCapture}
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
        >
          <Text variant="caption" style={styles.primaryText}>{STEP.cta[locale]}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={STEP.skip[locale]}
          accessibilityHint={openGraphHint}
          onPress={finishToHome}
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
        >
          <Text variant="caption" style={styles.secondaryText}>{STEP.skip[locale]}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: deepSpace.bgEdge,
    paddingHorizontal: deepSpaceSpacing.lg,
    paddingBottom: deepSpaceSpacing.md,
  },
  spaceWash: { ...StyleSheet.absoluteFill, overflow: "hidden" },
  topGlow: {
    position: "absolute",
    top: -120,
    left: -80,
    right: -80,
    height: 340,
    borderRadius: 170,
    backgroundColor: deepSpace.bgGlow,
    opacity: 0.88,
  },
  star: {
    position: "absolute",
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: deepSpace.accentSoft,
    opacity: 0.7,
  },
  starA: { top: 70, left: "18%" },
  starB: { top: 138, right: "25%", opacity: 0.5 },
  starC: { top: 248, left: "50%", opacity: 0.45 },
  starD: { bottom: 220, right: "12%", opacity: 0.85 },
  starE: { bottom: 84, left: "30%", opacity: 0.45 },
  hero: {
    flex: 1,
    minHeight: 320,
    alignItems: "center",
    justifyContent: "center",
    gap: deepSpaceSpacing.lg,
  },
  soulCard: {
    width: 132,
    height: 132,
    borderRadius: deepSpaceRadii.lg,
    borderWidth: 1,
    borderColor: deepSpace.soulLine,
    backgroundColor: withAlpha(deepSpace.bgMid, 0.72),
    alignItems: "center",
    justifyContent: "center",
    shadowColor: deepSpace.soul,
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 9,
  },
  soulCrossH: {
    position: "absolute",
    width: 76,
    height: 7,
    borderRadius: 4,
    backgroundColor: deepSpace.soul,
  },
  soulCrossV: {
    position: "absolute",
    width: 7,
    height: 76,
    borderRadius: 4,
    backgroundColor: deepSpace.soul,
  },
  soulSparkA: {
    position: "absolute",
    width: 34,
    height: 2,
    borderRadius: 1,
    backgroundColor: deepSpace.accentSoft,
    transform: [{ rotate: "45deg" }],
  },
  soulSparkB: {
    position: "absolute",
    width: 34,
    height: 2,
    borderRadius: 1,
    backgroundColor: deepSpace.accentSoft,
    transform: [{ rotate: "-45deg" }],
  },
  copyBlock: {
    alignItems: "center",
    gap: deepSpaceSpacing.sm,
    paddingBottom: deepSpaceSpacing.lg,
  },
  title: {
    color: deepSpace.textHi,
    fontSize: 30,
    textAlign: "center",
    textShadowColor: deepSpace.accent,
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  body: {
    maxWidth: 620,
    color: deepSpace.textMid,
    fontSize: 18,
    textAlign: "center",
  },
  actions: {
    gap: deepSpaceSpacing.sm,
  },
  primary: {
    minHeight: 72,
    borderRadius: deepSpaceRadii.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: deepSpace.mint,
  },
  primaryText: {
    color: deepSpace.bgEdge,
    fontSize: 18,
  },
  secondary: {
    minHeight: 64,
    borderRadius: deepSpaceRadii.lg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: deepSpace.cardLineStrong,
    backgroundColor: withAlpha(deepSpace.bgMid, 0.35),
  },
  secondaryText: {
    color: deepSpace.textHi,
    fontSize: 17,
  },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});
