// First-run onboarding (onboarding pack §3) — a short, concrete intro that
// ends at the first saved record. No RAG/clinical/game wording (§9).
// Completion is recorded in localStorage (§4) so the index redirect only sends
// a user here once.

import { useEffect, useState } from "react";
import { View, StyleSheet, useWindowDimensions, Pressable, BackHandler } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumAppShell, PremiumLoadingState } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { cosmic, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { markOnboardingComplete } from "@/lib/onboarding/state";
import { IslandArt, ShardArt } from "@/components/art/IslandArt";
import { SecondBSprite } from "@/components/art/SecondBSprite";
import { WorkerSprite } from "@/components/art/WorkerSprite";

type OnboardingArt = "welcome" | "village" | "secondb" | "trust" | "firstShard";

interface Step {
  art: OnboardingArt;
  title: { ko: string; en: string };
  body: { ko: string; en: string };
  cta: { ko: string; en: string };
}

const STEPS: Step[] = [
  {
    art: "welcome",
    title: { ko: "하루 생각을 짧게 남기세요", en: "Save the day in small notes" },
    body: {
      ko: "일기, 메모, 링크를 저장하면 두번째 뇌가 반복되는 관심사와 다음 행동을 찾기 쉽게 정리해요.",
      en: "Save a journal line, memo, or link. 2nd-Brain organizes them so patterns and next actions are easier to find.",
    },
    cta: { ko: "기록 방법 보기", en: "See how it works" },
  },
  {
    art: "trust",
    title: { ko: "답은 내 기록에서 시작해요", en: "Answers start from your records" },
    body: {
      ko: "세컨비가 답할 때 참고한 기록을 함께 보여줘요. 부족한 내용은 새 메모나 링크로 보태면 돼요.",
      en: "When SecondB answers, it shows the records it used. If something is missing, save a note or link first.",
    },
    cta: { ko: "첫 기록 준비", en: "Get ready to save" },
  },
  {
    art: "firstShard",
    title: { ko: "먼저 한 문장만 저장해요", en: "Start with one sentence" },
    body: {
      ko: "오늘 기억하고 싶은 일, 배운 것, 링크 하나면 충분해요. 저장한 뒤 그래프에서 다시 볼 수 있어요.",
      en: "A thought, lesson, or link is enough. Save it now, then revisit it from the graph.",
    },
    cta: { ko: "첫 기록 저장", en: "Save my first note" },
  },
];

export default function Onboarding() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);

  // Android hardware back steps backward through onboarding instead of exiting
  // the app / blanking the screen. At step 0 it falls through to default back.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (index > 0) {
        setIndex((i) => i - 1);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [index]);

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

  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;
  const artW = Math.min(width - spacing.lg * 2, 360);
  const progressText = `${index + 1} / ${STEPS.length}`;
  const openGraphHint = locale === "ko" ? "온보딩을 마치고 그래프로 이동합니다." : "Completes onboarding and opens the graph.";
  const primaryHint = isLast
    ? locale === "ko"
      ? "온보딩을 마치고 첫 기록 화면으로 이동합니다."
      : "Completes onboarding and opens the first capture screen."
    : locale === "ko"
      ? "다음 온보딩 단계로 이동합니다."
      : "Moves to the next onboarding step.";

  function finishToCapture() {
    markOnboardingComplete();
    router.replace({ pathname: "/capture", params: { entry: "firstRun" } });
  }
  function finishToGraph() {
    markOnboardingComplete();
    router.replace("/");
  }

  function onPrimary() {
    if (isLast) finishToCapture();
    else setIndex((i) => i + 1);
  }

  return (
    <PremiumAppShell>
      <View style={styles.root}>
        <View style={styles.topBar}>
          <View style={styles.progressWrap}>
            <View
              style={styles.dots}
              accessible
              accessibilityLabel={locale === "ko" ? `${index + 1} / ${STEPS.length} 단계` : `Step ${index + 1} of ${STEPS.length}`}
            >
              {STEPS.map((_, i) => (
                <View key={i} style={[styles.dot, i === index ? styles.dotActive : null]} />
              ))}
            </View>
            <Text variant="caption" color="textMuted" style={styles.progressText}>{progressText}</Text>
          </View>
          <Pressable
            onPress={() => finishToGraph()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={locale === "ko" ? "건너뛰기" : "Skip"}
            accessibilityHint={openGraphHint}
          >
            <Text variant="caption" color="textMuted">{locale === "ko" ? "건너뛰기" : "Skip"}</Text>
          </Pressable>
        </View>

        <View style={styles.body}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <OnboardingPremiumArt id={step.art} width={artW} />
          </View>
          <Text variant="heading" style={styles.title}>{step.title[locale]}</Text>
          <Text variant="body" color="textMuted" style={styles.bodyText}>{step.body[locale]}</Text>
        </View>

        <View style={styles.actions}>
          <Button label={step.cta[locale]} variant="primary" onPress={onPrimary} accessibilityHint={primaryHint} />
          {isLast ? (
            <Button
              label={locale === "ko" ? "건너뛰고 둘러보기" : "Skip and look around"}
              variant="secondary"
              onPress={() => finishToGraph()}
              accessibilityHint={openGraphHint}
            />
          ) : null}
        </View>
      </View>
    </PremiumAppShell>
  );
}

function OnboardingPremiumArt({ id, width }: { id: OnboardingArt; width: number }) {
  const stageW = Math.min(width, 360);
  const islandSize = Math.min(220, stageW * 0.62);
  const smallIsland = Math.min(118, stageW * 0.32);
  const shardSize = Math.min(76, stageW * 0.22);

  if (id === "village") {
    return (
      <View style={[styles.artStage, { width: stageW }]}>
        <View style={styles.villageRow}>
          <IslandArt id="imagine" size={smallIsland} />
          <IslandArt id="knowledge" size={smallIsland} />
          <IslandArt id="work_growth" size={smallIsland} />
        </View>
        <IslandArt id="core" size={islandSize * 0.75} />
      </View>
    );
  }

  if (id === "secondb") {
    return (
      <View style={[styles.artStage, { width: stageW }]}>
        <View style={styles.secondBFrame}>
          <SecondBSprite state="wave_a" size={118} float />
        </View>
      </View>
    );
  }

  if (id === "trust") {
    return (
      <View style={[styles.artStage, { width: stageW }]}>
        <View style={styles.shardRow}>
          <WorkerSprite id="gadi" size={64} />
          <ShardArt id="wiki_blue" size={shardSize} />
          <ShardArt id="journal_gold" size={shardSize} />
          <ShardArt id="capture_mint" size={shardSize} />
        </View>
      </View>
    );
  }

  if (id === "firstShard") {
    return (
      <View style={[styles.artStage, { width: stageW }]}>
        <ShardArt id="core_violet" size={Math.min(130, stageW * 0.38)} />
        <SecondBSprite state="carrying_shard" size={86} float />
      </View>
    );
  }

  return (
    <View style={[styles.artStage, { width: stageW }]}>
      <IslandArt id="core" size={islandSize} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
  root: { flex: 1, justifyContent: "space-between", paddingVertical: spacing.lg },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressWrap: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  dots: { flexDirection: "row", gap: spacing.xs, alignItems: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: semantic.border },
  dotActive: { backgroundColor: cosmic.signalMint, width: 22 },
  progressText: { fontWeight: "700" },
  body: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.lg },
  artStage: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
  },
  villageRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginBottom: -20,
  },
  secondBFrame: {
    width: 160,
    height: 160,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "rgba(114,242,199,0.38)",
    backgroundColor: "rgba(167,139,250,0.14)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: cosmic.soulViolet,
    shadowOpacity: 0.38,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  shardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  title: { textAlign: "center" },
  bodyText: { textAlign: "center", lineHeight: 22, paddingHorizontal: spacing.md },
  actions: { gap: spacing.sm },
});
