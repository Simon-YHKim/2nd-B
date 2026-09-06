// /dev-screens — 앱의 화면 역할과 안전한 개발 진입점을 함께 보는 개발자용 목록.
//
// Simon 2026-08-19 (결정 콘솔 V2 의견): "남은 화면 및 링크가 없는 것은 내가
// 앱에서 볼 수 있도록 별도 경로를 만들자. 설정 탭에 개발자용 화면으로 진입할
// 수 있는 버튼이 있었으면 좋겠고, 이곳에서 진입 버튼들을 만들어서 화면들을
// 보고 기능이 되는지를 확인할 수 있으면 좋겠어."
//
// 화면 목록과 두 축(진입 출처 · UI 모드별 렌더)은 `src/lib/dev/screen-index.ts` 가
// 들고 있고, 그 파일이 실제 라우트와 어긋나면 `screen-index.test.ts` 가 CI 를 막는다.
// 이 화면은 정상 화면·옛 링크 호환·Design Lab 은 열되, mount 만으로 외부 호출·가입·
// 세션 변경이 가능한 딥링크/콜백은 계약 정보만 보여주고 절대 실행하지 않는다.

import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Platform, Pressable, SectionList, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { DevOnlyRoute } from "@/components/ui/DevOnlyRoute";
import { Text } from "@/components/ui/Text";
import { clarityGateSnapshot } from "@/lib/analytics";
import { probeNativeClarity } from "@/lib/analytics/clarity-native";
import {
  DEV_SCREEN_GROUPS,
  canOpenFromDevRegistry,
  designLabScreens,
  devScreenVariants,
  devScreens,
  entryRoleCounts,
  openableVariants,
  screenEntry,
  screenRender,
  type DevScreen,
  type DevScreenVariant,
  type ModeRender,
} from "@/lib/dev/screen-index";
import { m3 } from "@/lib/theme/m3";

type ScreenSectionKind = "design-lab" | "external-contract" | "legacy-link" | "standard";

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

/** UI 모드 한쪽의 렌더 결과를 배지 문구로. */
function modeRenderText(mode: ModeRender): string {
  if (mode.kind === "screen") return "실화면";
  if (mode.kind === "redirect") return `→ ${mode.to}`;
  return `dev 실화면 · 아니면 → ${mode.productionRedirect}`;
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
  if (entry.kind === "legacy-link") out.push("옛 링크 전용");
  if (entry.kind === "dev") out.push("Design Lab");
  const render = screenRender(s);
  if (render.kind === "redirect") out.push(`항상 → ${render.to}`);
  if (render.kind === "ui-mode-split") {
    out.push(`딥스페이스 ${modeRenderText(render.deepspace)} · legacy ${modeRenderText(render.legacy)}`);
  }
  if (s.dev) out.push("개발 전용");
  if (s.auth) out.push("로그인 필요");
  if (s.sample) out.push("견본 값");
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

/**
 * 전폭 pressable 행. `PixelPressable` 은 루트가 `alignSelf: "flex-start"` 라 목록
 * 행처럼 부모 가로폭을 채울 수 없어서, 같은 press 물리(베벨 반전 + 한 프레임
 * translate = steps(1))를 `Pressable` + `PixelSurface` 로 직접 놓는다.
 */
function PressRow({
  screen,
  variant,
  glyph,
}: {
  screen: DevScreen;
  variant: "frame" | "bevel";
  glyph?: "grid" | "hub" | "visibility" | "share";
}) {
  const [held, setHeld] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${screen.label} 열기`}
      accessibilityHint={`${screen.href} 화면으로 이동합니다.`}
      onPress={() => router.push(screen.href)}
      onPressIn={() => setHeld(true)}
      onPressOut={() => setHeld(false)}
      style={styles.rowRoot}
    >
      <View style={held ? styles.rowSunk : null}>
        <PixelSurface variant={variant} pressed={held} contentStyle={styles.rowContent}>
          {glyph ? (
            <View style={styles.rowGlyph}>
              <PixelGlyph name={glyph} color={m3.color.primary} size={24} />
            </View>
          ) : null}
          <ScreenDetails screen={screen} />
          <View style={styles.rowAction}>
            <PixelGlyph name="arrow_forward" color={m3.color.primary} size={24} />
            <Text variant="caption" style={styles.actionText}>
              열기
            </Text>
          </View>
        </PixelSurface>
      </View>
    </Pressable>
  );
}

/**
 * 소유 화면 **바로 밑**에 붙는 QA 변형 버튼.
 *
 * 들여쓰기 + `tune` 글리프로 "새 화면이 아니라 같은 화면을 다른 파라미터로
 * 여는 것"을 형태로 말한다. 이걸 일반 행과 똑같이 그리면 100개 대장을 눈으로
 * 세는 사람이 개수를 잘못 읽는다 — 변형은 라우트가 아니다.
 */
function VariantRow({ screen, variant }: { screen: DevScreen; variant: DevScreenVariant }) {
  const [held, setHeld] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      // 목록 안 버튼이라 소유 화면 이름을 label 에 함께 넣는다. 스크린리더로는
      // 앞 행이 안 보여서 "내보내기 시안" 하나만으로는 어느 화면의 변형인지 모른다.
      accessibilityLabel={`${screen.label} 변형 · ${variant.label} 열기`}
      accessibilityHint={`${variant.href} 로 이동합니다. 같은 화면을 다른 파라미터로 엽니다.`}
      onPress={() => router.push(variant.href)}
      onPressIn={() => setHeld(true)}
      onPressOut={() => setHeld(false)}
      style={styles.variantRoot}
    >
      <View style={held ? styles.rowSunk : null}>
        <PixelSurface variant="bevel" pressed={held} contentStyle={styles.variantContent}>
          <View style={styles.rowGlyph}>
            <PixelGlyph name="tune" color={m3.color.primary} size={24} />
          </View>
          <View style={styles.rowMain}>
            <Text variant="body">{variant.label}</Text>
            <Text variant="caption" color="textSubtle">
              {variant.href}
            </Text>
            {variant.note ? (
              <Text variant="caption" color="textSubtle">
                {variant.note}
              </Text>
            ) : null}
          </View>
          <View style={styles.rowAction}>
            <PixelGlyph name="arrow_forward" color={m3.color.primary} size={24} />
          </View>
        </PixelSurface>
      </View>
    </Pressable>
  );
}

/**
 * 한 화면의 변형들. `openableVariants` 가 딥링크 계약의 변형을 비워 주므로
 * 여기서 계약을 다시 판정하지 않는다 — 판정이 두 곳에 있으면 갈린다.
 */
function VariantList({ screen }: { screen: DevScreen }) {
  const variants = openableVariants(screen);
  if (variants.length === 0) return null;
  return (
    <View style={styles.variantGroup}>
      {variants.map((variant) => (
        <VariantRow key={variant.href} screen={screen} variant={variant} />
      ))}
    </View>
  );
}

function designLabGlyph(file: DevScreen["file"]): "grid" | "hub" | "visibility" | "share" {
  if (file === "deepspace-hub") return "hub";
  if (file === "deepspace-preview") return "visibility";
  if (file === "deepspace-flowmap") return "share";
  return "grid";
}

function ScreenRow({ screen, section }: { screen: DevScreen; section: ScreenSection }) {
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
  if (section.kind === "design-lab") {
    return <PressRow screen={screen} variant="bevel" glyph={designLabGlyph(screen.file)} />;
  }
  return <PressRow screen={screen} variant="frame" />;
}

function registrySections(): ScreenSection[] {
  const all = devScreens();
  const externalContracts = all.filter((screen) => screenEntry(screen).kind === "deep-link");
  const legacyLinks = all.filter((screen) => screenEntry(screen).kind === "legacy-link");
  const standardGroups = DEV_SCREEN_GROUPS.map((group) => ({
    title: group.title,
    kind: "standard" as const,
    data: group.screens.filter((screen) => screenEntry(screen).kind === "standard"),
  })).filter((section) => section.data.length > 0);

  return [
    {
      title: "Design Lab",
      description: "production 메뉴와 분리한 디자인·흐름 검수 화면입니다.",
      kind: "design-lab",
      data: designLabScreens(),
    },
    {
      title: "외부 진입 계약",
      description:
        "딥링크와 OAuth 콜백은 진입만으로 조회·가입·세션 변경이 생길 수 있어 계약만 표시합니다.",
      kind: "external-contract",
      data: externalContracts,
    },
    {
      title: "옛 링크 호환",
      description: "저장된 옛 링크 전용 redirect 입니다. 눌러서 호환 경로가 살아 있는지 확인할 수 있습니다.",
      kind: "legacy-link",
      data: legacyLinks,
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
          전체 {counts.total} · 일반 진입 {counts.standard} · 외부 딥링크 {counts.deepLink} · 옛 링크{" "}
          {counts.legacyLink} · Design Lab {counts.designLab}
        </Text>
        <Text variant="caption">
          항상 redirect {counts.alwaysRedirect} · UI 모드 분기 {counts.modeSplit} · 개발 전용 {counts.devOnly} ·
          로그인 필요 {counts.authRequired}
        </Text>
        <Text variant="caption">
          QA 변형 {devScreenVariants().length} — 라우트 수에 세지 않습니다. 소유 화면 바로 아래에 붙습니다.
        </Text>
        <Text variant="subtle">
          이 목록은 `src/app` 실제 라우트와 1:1 로 대조됩니다. 역할이나 파일이 어긋나면 CI 가 막습니다.
        </Text>
      </PixelSurface>

      <ClarityStatusRow />
    </View>
  );
}

function DevScreenIndex() {
  const insets = useSafeAreaInsets();
  const counts = entryRoleCounts();
  const sections = registrySections();
  // 전역 floating control(뒤로 가기)이 화면 위에 떠 있어서, 목록 viewport 자체를
  // 그 아래에서 시작시킨다. 스크롤 콘텐츠가 컨트롤 밑으로 지나가며 겹치지 않는다.
  const topHeadroom = insets.top + m3.minTouch + m3.spacing.s6;
  // 아래쪽도 safe-area 만큼 비운다. 고정 여백만 두면 Android gesture nav bar 와
  // iPhone home indicator 가 마지막 행을 가린다.
  const bottomHeadroom = insets.bottom + m3.spacing.s8;

  return (
    <View style={[styles.root, { paddingTop: topHeadroom }]}>
      <SectionList<DevScreen, ScreenSection>
        style={styles.list}
        contentContainerStyle={[styles.content, { paddingBottom: bottomHeadroom }]}
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
        renderItem={({ item, section }) => (
          <View>
            <ScreenRow screen={item} section={section} />
            <VariantList screen={item} />
          </View>
        )}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

/**
 * Clarity 상태 한 줄 — "왜 대시보드에 안 뜨는가" 를 앱 안에서 판정하기 위한 자리.
 *
 * SDK 는 기본 로그를 안 남기고 릴리스 빌드에는 콘솔이 없어서, 지금까지는 대시보드에
 * 안 뜬다는 것만 알 뿐 **어느 고리가 끊겼는지** 알 방법이 없었다. 게이트 값을 전부
 * 한 줄에 편다.
 *
 * 현재 웹과 네이티브 Clarity 는 모두 코드에서 비활성이다. flags 는 원시 운영값이고,
 * 실제 기대값은 hardOff=true, init=false, capturing=false, session=no 다.
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
          `hardOff=${g.webHardDisabled}/${g.nativeHardDisabled}`,
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
        웹과 네이티브 모두 현재 코드상 비활성입니다. flags 값과 무관하게 init=false, capturing=false,
        session=no 가 정상입니다.
      </Text>
      <Text variant="subtle">{line}</Text>
    </PixelSurface>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: m3.color.background },
  list: { flex: 1 },
  // paddingBottom 은 여기 두지 않는다 — safe-area 를 더한 bottomHeadroom 이 인라인으로 준다.
  content: {
    paddingHorizontal: m3.spacing.s6,
    ...(Platform.OS === "web" ? { maxWidth: 720, width: "100%", alignSelf: "center" as const } : null),
  },
  header: { gap: m3.spacing.s2 },
  cardFrame: { marginTop: m3.spacing.s2 },
  cardContent: { gap: m3.spacing.s3, padding: m3.spacing.s4 },
  sectionHeader: { gap: m3.spacing.s2, marginTop: m3.spacing.s6, marginBottom: m3.spacing.s2 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: m3.spacing.s4 },
  rowRoot: { marginBottom: m3.spacing.s2 },
  // 절대 규칙 5: 계단 모션. 상태 전환이라 애니메이션이 없다 — 한 프레임에 붙는
  // steps(1). PixelPressable 의 press 물리와 같은 값이다.
  rowSunk: { transform: [{ translateY: m3.spacing.s1 }] },
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
  // 변형은 소유 행에서 한 단 들여쓴다 — 형태가 소속을 말한다. 아래 여백은
  // 소유 행과 붙여 두어 "이 화면에 딸린 것" 으로 읽히게 한다.
  variantGroup: { marginLeft: m3.spacing.s6, marginBottom: m3.spacing.s2 },
  variantRoot: { marginBottom: m3.spacing.s1 },
  // minTouch 는 줄이지 않는다. 들여쓴 보조 행이라고 탭 표적까지 작아지면
  // 손가락 큰 사람과 흔들리는 손에서 먼저 못 쓰게 된다.
  variantContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: m3.spacing.s3,
    paddingVertical: m3.spacing.s2,
    paddingHorizontal: m3.spacing.s4,
  },
  rowGlyph: { flexShrink: 0 },
  rowAction: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s2,
  },
  actionText: { color: m3.color.primary },
});
