import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from "react-native";

import { SecondbStatusHeader } from "@/components/deepspace";
import { startTask } from "@/lib/tasks/store";
import { Text } from "@/components/ui/Text";
import { colors, radius, spacing } from "@/theme/tokens";
import { withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";

interface FlowColumn {
  title: string;
  subtitle: string;
  tone: "mint" | "cyan" | "soul";
  items: { label: string; path: Href; note: string }[];
}

const FLOW: FlowColumn[] = [
  {
    title: "① 진입",
    subtitle: "온보딩 · 인증",
    tone: "mint",
    items: [
      { label: "인트로", path: "/onboarding", note: "첫 기록까지" },
      { label: "로그인", path: "/sign-in", note: "Google · email" },
      { label: "가입", path: "/sign-up", note: "age-tier" },
      { label: "프로필", path: "/complete-profile", note: "동의 · 기본값" },
    ],
  },
  {
    title: "② 홈",
    subtitle: "북극성 · 7별",
    tone: "soul",
    items: [
      { label: "홈 별자리", path: "/deepspace-home", note: "preview" },
      { label: "소울코어", path: "/core-brain", note: "북극성" },
      { label: "라이브 홈", path: "/", note: "shell" },
    ],
  },
  {
    title: "③ 자기이해",
    subtitle: "7렌즈",
    tone: "cyan",
    items: [
      { label: "지금의 나", path: "/big-five", note: "now" },
      { label: "회상", path: "/interview", note: "recall" },
      { label: "보여지는 나", path: "/persona", note: "seen" },
      { label: "리듬", path: "/esm", note: "rhythm" },
      { label: "관계", path: "/attachment", note: "relational" },
      { label: "될 수 있는 나", path: "/imagine", note: "possible" },
      { label: "가치", path: "/audit", note: "values" },
    ],
  },
  {
    title: "④ 매일 허브",
    subtitle: "담기 · 세컨비",
    tone: "cyan",
    items: [
      { label: "허브 preview", path: "/deepspace-hub", note: "4 panels" },
      { label: "담기", path: "/capture", note: "first save" },
      { label: "세컨비", path: "/secondb", note: "chat" },
      { label: "트렌드", path: "/trends", note: "rising" },
      { label: "기록", path: "/records", note: "archive" },
    ],
  },
  {
    title: "⑤ 지식망",
    subtitle: "그래프 · wiki",
    tone: "soul",
    items: [
      { label: "그래프", path: "/graph", note: "map" },
      { label: "위키", path: "/wiki", note: "knowledge" },
      { label: "인사이트", path: "/insights", note: "patterns" },
      { label: "리서치", path: "/research", note: "sources" },
      { label: "AI 뮤지엄", path: "/museum", note: "history" },
    ],
  },
  {
    title: "⑥ 시스템",
    subtitle: "계정 · 내보내기",
    tone: "mint",
    items: [
      { label: "프로필", path: "/profile", note: "me" },
      { label: "계정", path: "/account", note: "identity" },
      { label: "개인정보", path: "/privacy", note: "trust" },
      { label: "IDEN", path: "/iden", note: "export" },
      { label: "지원", path: "/support", note: "help" },
    ],
  },
];

export function DeepSpaceFlowMapScreen() {
  const router = useRouter();

  // Loading-system demo (Claude Design loading.dc.html, C to D to E): wraps a
  // long task with startTask so the global BackgroundTaskDock (D) spins while the
  // app stays usable, then the CompletionToast (E) shows on finish (no auto-nav,
  // the user taps the result link). This QA screen is not a merged feature, so
  // wiring the demo here keeps the shipped screens untouched.
  // TODO: point run() at a real long task (e.g. star re-analysis / import parse)
  // once one is exposed outside the merged feature screens.
  const runLoadingDemo = () => {
    startTask({
      title: "별을 다시 살펴보는 중",
      mode: "background",
      etaSec: 8,
      resultHref: "/museum",
      run: () => new Promise<void>((resolve) => setTimeout(resolve, 8000)),
    });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.phone}>
        <View style={styles.statusBar}>
          <RNText style={styles.statusText}>9:41</RNText>
          <RNText style={styles.statusText}>●●● ▮</RNText>
        </View>
        <SecondbStatusHeader
          mood="positive"
          text="전체 흐름을 한 장으로 묶었어요. 홈이 모든 화면의 중심이에요."
          tip="막히는 화면 없이 진입, 홈, 담기, 내보내기까지 이어져야 해요."
        />
        <Text variant="caption" pixelEn style={styles.kicker}>2ND-BRAIN · FLOW MAP</Text>
        <Text variant="heading" style={styles.title}>화면 관계 지도</Text>
        <Text variant="body" style={styles.subtitle}>정본 flowmap을 실제 route로 검증하는 deep-space QA 화면입니다.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="로딩 시스템 미리보기"
          onPress={runLoadingDemo}
          style={[styles.chip, styles.demoChip]}
          android_ripple={{ color: withAlpha(colors.cyan, 0.12) }}
        >
          <Text variant="caption" style={styles.chipLabel}>로딩 시스템 미리보기</Text>
          <Text variant="subtle" style={styles.chipNote}>백그라운드 도크 + 완료 토스트 데모</Text>
        </Pressable>
        <View style={styles.grid}>
          {FLOW.map((column) => (
            <View key={column.title} style={styles.column}>
              <Text variant="caption" style={[styles.columnTitle, styles[`${column.tone}Text`]]}>{column.title}</Text>
              <Text variant="subtle" style={styles.columnSub}>{column.subtitle}</Text>
              {column.items.map((item) => (
                <Pressable
                  key={`${column.title}-${item.path}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.label} 열기`}
                  onPress={() => router.push(item.path)}
                  style={styles.chip}
                  android_ripple={{ color: withAlpha(colors.cyan, 0.12) }}
                >
                  <Text variant="caption" style={styles.chipLabel}>{item.label}</Text>
                  <Text variant="subtle" style={styles.chipNote}>{item.note}</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgDeep },
  content: { alignItems: "center", paddingHorizontal: 20, paddingTop: 40, paddingBottom: 40 },
  phone: { width: 320, minHeight: 680, overflow: "hidden", borderRadius: radius.phone, backgroundColor: colors.bgDeep, borderWidth: 1, borderColor: colors.borderHi, paddingBottom: 22 },
  statusBar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 22, paddingTop: 14 },
  statusText: { color: colors.textMid, fontFamily: fontFamilies.pixelKo, fontSize: 11, lineHeight: 16 },
  kicker: { marginTop: spacing.md, marginHorizontal: 20, color: colors.cyanBright, fontSize: 7, lineHeight: 12, letterSpacing: 1.2 },
  title: { marginTop: spacing.xs, marginHorizontal: 20, color: colors.textTitle, fontSize: 18 },
  subtitle: { marginTop: spacing.xs, marginHorizontal: 20, color: colors.textMid, fontSize: 12.5 },
  grid: { paddingHorizontal: 14, paddingTop: spacing.lg, gap: spacing.md },
  column: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.cardBg, padding: spacing.md },
  columnTitle: { fontSize: 12 },
  columnSub: { marginTop: 2, marginBottom: spacing.sm, color: colors.textLo, fontSize: 11 },
  mintText: { color: colors.mint },
  cyanText: { color: colors.cyanBright },
  soulText: { color: colors.soul },
  chip: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.cardBg, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, marginTop: spacing.xs },
  chipLabel: { color: colors.textTitle, fontSize: 11 },
  chipNote: { marginTop: 2, color: colors.textLo, fontSize: 10.5 },
  demoChip: { marginHorizontal: 20, marginTop: spacing.md },
});
