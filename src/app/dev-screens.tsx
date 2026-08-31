// /dev-screens — 앱의 화면 역할과 안전한 개발 진입점을 함께 보는 개발자용 목록.
//
// Simon 2026-08-19 (결정 콘솔 V2 의견): "남은 화면 및 링크가 없는 것은 내가
// 앱에서 볼 수 있도록 별도 경로를 만들자. 설정 탭에 개발자용 화면으로 진입할
// 수 있는 버튼이 있었으면 좋겠고, 이곳에서 진입 버튼들을 만들어서 화면들을
// 보고 기능이 되는지를 확인할 수 있으면 좋겠어."
//
// 화면 목록과 역할은 `src/lib/dev/screen-index.ts` 가 들고 있고, 그 파일이
// 실제 라우트와 어긋나면 `screen-index.test.ts` 가 CI 를 막는다. 이 화면은
// 정상 화면과 Design Lab은 열되, mount만으로 외부 호출·가입·세션 변경이 가능한
// 딥링크/콜백은 계약 정보만 보여주고 절대 실행하지 않는다.

import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Platform, SectionList, StyleSheet, View } from "react-native";

import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { DevOnlyRoute } from "@/components/ui/DevOnlyRoute";
import { Text } from "@/components/ui/Text";
import { clarityGateSnapshot } from "@/lib/analytics";
import { probeNativeClarity } from "@/lib/analytics/clarity-native";
import {
  DEV_SCREEN_GROUPS,
  canOpenFromDevRegistry,
  designLabScreens,
  devScreens,
  entryRoleCounts,
  screenEntry,
  type DevScreen,
} from "@/lib/dev/screen-index";
import { m3 } from "@/lib/theme/m3";

type ScreenSectionKind = "design-lab" | "external-contract" | "standard";

interface ScreenSection {
  title: string;
  description?: string;
  kind: ScreenSectionKind;
  data: DevScreen[];
}

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
  const entry = screenEntry(s);
  if (entry.kind === "deep-link") {
    if (entry.contract === "invite") out.push("외부 초대 링크");
    if (entry.contract === "peer-response") out.push("외부 응답 링크");
    if (entry.contract === "oauth-callback") out.push("OAuth 콜백");
  }
  if (entry.kind === "redirect") out.push(`호환 redirect → ${entry.destination}`);
  if (entry.kind === "dev") out.push("Design Lab");
  if (s.dev) out.push("개발 전용");
  if (s.auth !== undefined) out.push("로그인 필요");
  if (s.sample) out.push("견본 값");
  if (s.stub && entry.kind !== "redirect") out.push("넘김");
  return out;
}

function ScreenDetails({ screen }: { screen: DevScreen }) {
  const badges = badgesFor(screen);
  return (
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
  );
}

function ScreenRow({ screen }: { screen: DevScreen }) {
  if (!canOpenFromDevRegistry(screen)) {
    return (
      <View
        accessible
        accessibilityLabel={`${screen.label}. 외부 계약. 이 목록에서는 열 수 없습니다.`}
        style={styles.rowRoot}
      >
        <PixelSurface variant="inset" contentStyle={styles.rowContent}>
          <ScreenDetails screen={screen} />
          <View style={styles.rowAction}>
            <PixelGlyph name="lock" color={m3.color.onSurfaceVariant} size={24} />
            <Text variant="caption" color="textSubtle">
              외부 계약
            </Text>
          </View>
        </PixelSurface>
      </View>
    );
  }

  return (
    <PixelPressable
      fullWidth
      variant="frame"
      accessibilityLabel={`${screen.label} 열기`}
      accessibilityHint={`${screen.href} 화면으로 이동합니다.`}
      onPress={() => router.push(screen.href)}
      rootStyle={styles.rowRoot}
      contentStyle={styles.rowContent}
    >
      <ScreenDetails screen={screen} />
      <View style={styles.rowAction}>
        <PixelGlyph name="arrow_forward" color={m3.color.primary} size={24} />
        <Text variant="caption" style={styles.actionText}>
          열기
        </Text>
      </View>
    </PixelPressable>
  );
}

function designLabGlyph(file: DevScreen["file"]): "grid" | "hub" | "visibility" | "share" {
  if (file === "deepspace-hub") return "hub";
  if (file === "deepspace-preview") return "visibility";
  if (file === "deepspace-flowmap") return "share";
  return "grid";
}

function DesignLabRow({ screen }: { screen: DevScreen }) {
  return (
    <PixelPressable
      fullWidth
      variant="bevel"
      accessibilityLabel={`${screen.label} Design Lab 화면 열기`}
      accessibilityHint="개발 빌드에서 디자인 검수 화면으로 이동합니다."
      onPress={() => router.push(screen.href)}
      rootStyle={styles.rowRoot}
      contentStyle={styles.rowContent}
    >
      <View style={styles.designLabMain}>
        <PixelGlyph name={designLabGlyph(screen.file)} color={m3.color.primary} size={24} />
        <ScreenDetails screen={screen} />
      </View>
      <View style={styles.rowAction}>
        <PixelGlyph name="arrow_forward" color={m3.color.primary} size={24} />
        <Text variant="caption" style={styles.actionText}>
          열기
        </Text>
      </View>
    </PixelPressable>
  );
}

function registrySections(all: readonly DevScreen[]): ScreenSection[] {
  const designLab = designLabScreens();
  const externalContracts = all.filter((screen) => {
    const entry = screenEntry(screen);
    return entry.kind === "deep-link" || entry.kind === "redirect";
  });
  const standardGroups = DEV_SCREEN_GROUPS.map((group) => ({
    title: group.title,
    kind: "standard" as const,
    data: group.screens.filter((screen) => screenEntry(screen).kind === "standard"),
  })).filter((section) => section.data.length > 0);

  return [
    {
      title: "Design Lab",
      description: "production 메뉴와 분리한 PIXEL-CLAY 디자인·흐름 검수 화면입니다.",
      kind: "design-lab",
      data: designLab,
    },
    {
      title: "외부 진입 · 호환 경로",
      description:
        "딥링크와 OAuth 콜백은 진입만으로 조회·가입·세션 변경이 생길 수 있어 계약만 표시합니다. redirect는 옛 링크 호환을 확인할 수 있습니다.",
      kind: "external-contract",
      data: externalContracts,
    },
    ...standardGroups,
  ];
}

function RegistryHeader({ counts }: { counts: ReturnType<typeof entryRoleCounts> }) {
  return (
    <View style={styles.header}>
      <Text variant="heading" accessibilityRole="header">
        화면 전체 목록
      </Text>
      <Text variant="subtle">
        앱 화면의 실제 역할과 안전한 개발 진입점을 함께 봅니다. 개발 빌드에서만 열립니다.
      </Text>

      <PixelSurface variant="inset" style={styles.cardFrame} contentStyle={styles.cardContent}>
        <Text variant="caption">
          전체 {counts.total} · 일반 진입 {counts.standard} · 외부 딥링크 {counts.deepLink} · redirect{" "}
          {counts.redirect}
        </Text>
        <Text variant="caption">
          Design Lab {counts.designLab} · 개발 전용 {counts.devOnly} · 로그인 필요 {counts.authRequired}
        </Text>
        <Text variant="subtle">
          이 목록은 `src/app` 실제 라우트와 1:1로 대조됩니다. 역할이나 파일이 어긋나면 CI가 막습니다.
        </Text>
      </PixelSurface>

      <ClarityStatusRow />
    </View>
  );
}

function DevScreenIndex() {
  const all = devScreens();
  const counts = entryRoleCounts(all);
  const sections = registrySections(all);

  return (
    <SectionList<DevScreen, ScreenSection>
      style={styles.root}
      contentContainerStyle={styles.content}
      sections={sections}
      keyExtractor={(screen) => screen.file}
      ListHeaderComponent={<RegistryHeader counts={counts} />}
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            {section.kind === "design-lab" ? (
              <PixelGlyph name="grid" color={m3.color.primary} size={24} />
            ) : null}
            <Text variant="caption" accessibilityRole="header">
              {section.title} ({section.data.length})
            </Text>
          </View>
          {section.description ? <Text variant="subtle">{section.description}</Text> : null}
        </View>
      )}
      renderItem={({ item, section }) =>
        section.kind === "design-lab" ? <DesignLabRow screen={item} /> : <ScreenRow screen={item} />
      }
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={7}
      stickySectionHeadersEnabled={false}
      showsVerticalScrollIndicator={false}
    />
  );
}

/**
 * Clarity 상태 한 줄 — "왜 대시보드에 안 뜨는가" 를 앱 안에서 판정하기 위한 자리.
 *
 * SDK 는 기본 로그를 안 남기고 릴리스 빌드에는 콘솔이 없어서, 지금까지는 대시보드에
 * 안 뜬다는 것만 알 뿐 **어느 고리가 끊겼는지** 알 방법이 없었다. 게이트 값을 전부
 * 한 줄에 편다.
 *
 * ⚠ 읽는 법: 이 화면(/dev-screens)은 Clarity **허용 라우트가 아니다.** 그래서 여기
 * 서 있는 동안 route/allowed 는 false 이고 capturing 도 false 인 것이 정상이다.
 * 판정은 허용 라우트(/ 또는 /settings)를 다녀온 뒤 **session** 이 생겼는지로 한다.
 */
function ClarityStatusRow() {
  const [line, setLine] = useState<string>("...");
  useEffect(() => {
    let alive = true;
    void (async () => {
      const g = clarityGateSnapshot();
      const p = await probeNativeClarity();
      if (!alive) return;
      setLine(
        [
          `consent=${g.consent}`,
          `flags=${g.analyticsEnabled}/${g.clarityEnabled}`,
          `projectId=${g.projectId}`,
          `route=${g.route}${g.allowedRoute ? "(allowed)" : "(not-allowed)"}`,
          `module=${p.modulePresent}`,
          `init=${p.initialized}`,
          `capturing=${p.capturing}`,
          `sdkPaused=${p.sdkPaused === null ? "?" : p.sdkPaused}`,
          `session=${p.sessionUrl ? "yes" : "no"}`,
        ].join(" · "),
      );
    })();
    return () => {
      alive = false;
    };
  }, []);
  return (
    <PixelSurface variant="frame" style={styles.cardFrame} contentStyle={styles.cardContent}>
      <Text variant="caption">Clarity 상태</Text>
      <Text variant="subtle">
        이 화면은 허용 라우트가 아니라 여기서는 capturing=false가 정상입니다. 홈이나 설정을 다녀온 뒤
        session이 yes로 바뀌는지로 판정하세요.
      </Text>
      <Text variant="subtle">{line}</Text>
    </PixelSurface>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: m3.color.background },
  content: {
    paddingHorizontal: m3.spacing.s6,
    paddingTop: m3.spacing.s6,
    paddingBottom: m3.spacing.s8,
    ...(Platform.OS === "web" ? { maxWidth: 720, width: "100%", alignSelf: "center" as const } : null),
  },
  header: { gap: m3.spacing.s2 },
  cardFrame: { marginTop: m3.spacing.s2 },
  cardContent: { gap: m3.spacing.s3, padding: m3.spacing.s4 },
  sectionHeader: { gap: m3.spacing.s2, marginTop: m3.spacing.s6, marginBottom: m3.spacing.s2 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: m3.spacing.s4 },
  rowRoot: { marginBottom: m3.spacing.s2 },
  rowContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: m3.spacing.s4,
    paddingVertical: m3.spacing.s3,
    paddingHorizontal: m3.spacing.s4,
  },
  rowMain: { flex: 1, gap: m3.spacing.s1 },
  rowAction: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s2,
  },
  actionText: { color: m3.color.primary },
  designLabMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s4,
  },
});
