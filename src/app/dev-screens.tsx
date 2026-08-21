// /dev-screens — 앱 안에서 모든 화면에 직접 들어가 보는 개발자용 목록.
//
// Simon 2026-08-19 (결정 콘솔 V2 의견): "남은 화면 및 링크가 없는 것은 내가
// 앱에서 볼 수 있도록 별도 경로를 만들자. 설정 탭에 개발자용 화면으로 진입할
// 수 있는 버튼이 있었으면 좋겠고, 이곳에서 진입 버튼들을 만들어서 화면들을
// 보고 기능이 되는지를 확인할 수 있으면 좋겠어."
//
// 화면 목록과 표시는 `src/lib/dev/screen-index.ts` 가 들고 있고, 그 파일이
// 실제 라우트와 어긋나면 `screen-index.test.ts` 가 CI 를 막는다. 여기서는
// 그리기만 한다.
//
// 읽기 전용이다. 데이터를 만들지도 지우지도 않고, LLM 을 부르지 않는다.
// 하는 일은 `router.push` 하나뿐이다.

import { router } from "expo-router";
import { ScrollView, View, StyleSheet, Platform, Pressable } from "react-native";

import { DevOnlyRoute } from "@/components/ui/DevOnlyRoute";
import { Text } from "@/components/ui/Text";
import { DEV_SCREEN_GROUPS, devScreens, orphanScreens, type DevScreen } from "@/lib/dev/screen-index";
import { semantic, spacing, radii } from "@/lib/theme/tokens";

export default function DevScreensRoute() {
  return (
    <DevOnlyRoute>
      <DevScreenIndex />
    </DevOnlyRoute>
  );
}

/** 한 화면에 붙는 표시들. 왜 비어 보이는지를 누르기 **전에** 알려주는 것이 목적이다. */
function badgesFor(s: DevScreen): string[] {
  const out: string[] = [];
  if (s.orphan) out.push("입구 없음");
  if (s.dev) out.push("개발 전용");
  if (s.auth) out.push("로그인 필요");
  if (s.sample) out.push("견본 값");
  if (s.stub) out.push("넘김");
  return out;
}

function ScreenRow({ screen }: { screen: DevScreen }) {
  const badges = badgesFor(screen);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${screen.label} 열기`}
      onPress={() => router.push(screen.href)}
      style={styles.row}
    >
      <View style={styles.rowMain}>
        <Text variant="body">{screen.label}</Text>
        <Text variant="caption" color="textSubtle">
          {screen.href}
        </Text>
        {badges.length > 0 ? (
          <Text variant="caption" color="textSubtle">
            {badges.join(" · ")}
          </Text>
        ) : null}
        {screen.note ? (
          <Text variant="caption" color="textSubtle">
            {screen.note}
          </Text>
        ) : null}
      </View>
      <Text variant="body" color="brand">
        {"열기 >"}
      </Text>
    </Pressable>
  );
}

function DevScreenIndex() {
  const all = devScreens();
  const orphans = orphanScreens();

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text variant="heading">화면 전체 목록</Text>
      <Text variant="subtle" style={styles.gap}>
        앱의 모든 화면에 여기서 바로 들어갈 수 있습니다. 개발 빌드에서만 열립니다.
      </Text>

      <View style={styles.card}>
        <Text variant="caption">
          화면 {all.length} · 입구 없음 {orphans.length} · 로그인 필요{" "}
          {all.filter((s) => s.auth).length} · 개발 전용 {all.filter((s) => s.dev).length}
        </Text>
        <Text variant="subtle">
          이 목록은 `src/app` 의 실제 라우트 파일과 1:1 로 대조됩니다. 어긋나면 CI 가 막습니다.
        </Text>
      </View>

      <Text variant="caption" style={styles.section}>
        정상 경로로는 못 들어가는 화면
      </Text>
      <View style={styles.card}>
        <Text variant="subtle" style={styles.why}>
          앱 안 어디에서도 링크되지 않아 이 목록이 유일한 입구입니다. 이 화면을 만든 이유입니다.
        </Text>
        {orphans.map((s) => (
          <ScreenRow key={`orphan-${s.file}`} screen={s} />
        ))}
      </View>

      {DEV_SCREEN_GROUPS.map((group) => (
        <View key={group.title}>
          <Text variant="caption" style={styles.section}>
            {group.title} ({group.screens.length})
          </Text>
          <View style={styles.card}>
            {group.screens.map((s) => (
              <ScreenRow key={s.file} screen={s} />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.background },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    ...(Platform.OS === "web" ? { maxWidth: 720, width: "100%", alignSelf: "center" as const } : null),
  },
  gap: { marginTop: spacing.xs },
  why: { marginBottom: spacing.xs },
  section: { marginTop: spacing.lg, marginBottom: spacing.xs },
  card: {
    backgroundColor: semantic.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    // 터치 타깃 44px 이상 (PRD 불변식). 목록이 길어 오탭이 잦은 화면이다.
    minHeight: 44,
    paddingVertical: spacing.xs,
  },
  rowMain: { flex: 1, gap: 2 },
});
