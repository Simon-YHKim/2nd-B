// First-run onboarding (onboarding pack §3) — a 5-step intro that ends at
// the first shard. Copy is the village voice; no RAG/clinical/game wording
// (§9). Completion is recorded in localStorage (§4) so the index redirect
// only sends a user here once.

import { useState } from "react";
import { View, StyleSheet, useWindowDimensions, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";
import { SvgXml } from "react-native-svg";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { cosmic, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { ONBOARDING_XML, ONBOARDING_ASPECT } from "@/components/art/onboardingXml";
import { markOnboardingComplete } from "@/lib/onboarding/state";

interface Step {
  art: keyof typeof ONBOARDING_XML;
  title: { ko: string; en: string };
  body: { ko: string; en: string };
  cta: { ko: string; en: string };
}

const STEPS: Step[] = [
  {
    art: "welcome",
    title: { ko: "내 생각 조각이 작은 지도가 돼요", en: "Your thoughts become a small map" },
    body: {
      ko: "2ndB는 내가 남긴 기록과 지식을 연결해 나에게 맞는 다음 한 걸음을 함께 찾아주는 앱이에요.",
      en: "2ndB links what you write and learn, then helps you find your next step.",
    },
    cta: { ko: "시작하기", en: "Start" },
  },
  {
    art: "village",
    title: { ko: "그래프가 곧 마을이에요", en: "The graph is a village" },
    body: { ko: "노드는 장소, 연결선은 길, 기록은 조각이 됩니다.", en: "Nodes are places, lines are roads, records are pieces." },
    cta: { ko: "마을 둘러보기", en: "Look around the village" },
  },
  {
    art: "secondb",
    title: { ko: "세컨비를 만나보세요", en: "Meet SecondB" },
    body: { ko: "세컨비는 내 조각을 참고해서 대답하는 작은 AI 친구예요.", en: "SecondB is a small AI friend who answers using your own pieces." },
    cta: { ko: "세컨비와 시작", en: "Start with SecondB" },
  },
  {
    art: "trust",
    title: { ko: "내 조각은 조심히 다뤄요", en: "Your pieces are handled gently" },
    body: { ko: "세컨비가 답할 때 어떤 조각을 참고했는지 함께 보여줘요.", en: "When SecondB answers, it shows which pieces it drew on." },
    cta: { ko: "좋아요", en: "Sounds good" },
  },
  {
    art: "firstShard",
    title: { ko: "첫 조각을 남겨볼까요?", en: "Leave your first piece?" },
    body: {
      ko: "한 문장이어도 충분해요. 첫 조각이 들어오면 그래프에 작은 길이 켜져요.",
      en: "One sentence is enough. Your first piece lights a small road in the graph.",
    },
    cta: { ko: "첫 조각 저장", en: "Save my first piece" },
  },
];

export default function Onboarding() {
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;
  const artW = Math.min(width - spacing.lg * 2, 360);

  function finishToJournal() {
    markOnboardingComplete();
    router.replace({ pathname: "/journal", params: { entry: "firstRun" } });
  }
  function finishToGraph() {
    markOnboardingComplete();
    router.replace("/");
  }

  function onPrimary() {
    if (isLast) finishToJournal();
    else setIndex((i) => i + 1);
  }

  return (
    <Screen>
      <View style={styles.root}>
        <View style={styles.topBar}>
          <View style={styles.dots} accessibilityLabel={locale === "ko" ? `${index + 1} / ${STEPS.length} 단계` : `Step ${index + 1} of ${STEPS.length}`}>
            {STEPS.map((_, i) => (
              <View key={i} style={[styles.dot, i === index ? styles.dotActive : null]} />
            ))}
          </View>
          <Pressable onPress={() => finishToGraph()} hitSlop={8} accessibilityLabel={locale === "ko" ? "건너뛰기" : "Skip"}>
            <Text variant="caption" color="textMuted">{locale === "ko" ? "건너뛰기" : "Skip"}</Text>
          </Pressable>
        </View>

        <View style={styles.body}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <SvgXml xml={ONBOARDING_XML[step.art]} width={artW} height={artW / ONBOARDING_ASPECT[step.art]} />
          </View>
          <Text variant="heading" style={styles.title}>{step.title[locale]}</Text>
          <Text variant="body" color="textMuted" style={styles.bodyText}>{step.body[locale]}</Text>
        </View>

        <View style={styles.actions}>
          <Button label={step.cta[locale]} variant="primary" onPress={onPrimary} />
          {isLast ? (
            <Button
              label={locale === "ko" ? "건너뛰고 둘러보기" : "Skip and look around"}
              variant="secondary"
              onPress={() => finishToGraph()}
            />
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "space-between", paddingVertical: spacing.lg },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dots: { flexDirection: "row", gap: spacing.xs, alignItems: "center" },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: semantic.border },
  dotActive: { backgroundColor: cosmic.signalMint, width: 18 },
  body: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.lg },
  title: { textAlign: "center" },
  bodyText: { textAlign: "center", lineHeight: 22, paddingHorizontal: spacing.md },
  actions: { gap: spacing.sm },
});
