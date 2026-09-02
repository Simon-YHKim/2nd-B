import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DEEP_SPACE_DOCK_PATHS,
  PRIMARY_TAB_PATHS,
  PROFILE_CHILD_PATHS,
  isDeepSpaceDockPath,
  isPrimaryTabPath,
  isProfileChildPath,
} from "../tabs";

describe("primary tab routes", () => {
  test("keeps settings under profile instead of the bottom tab bar", () => {
    expect(PRIMARY_TAB_PATHS).toEqual(["/", "/capture", "/secondb", "/profile"]);
    expect(PRIMARY_TAB_PATHS).not.toContain("/settings");
    expect(isPrimaryTabPath("/settings")).toBe(false);

    expect(PROFILE_CHILD_PATHS).toEqual(["/settings"]);
    expect(isProfileChildPath("/settings")).toBe(true);
  });
});

describe("deep-space dock routes", () => {
  test("covers the dock screens, excluding primary tab roots", () => {
    expect(isDeepSpaceDockPath("/core-brain")).toBe(true);
    expect(isDeepSpaceDockPath("/big-five")).toBe(true);
    expect(isDeepSpaceDockPath("/account")).toBe(true);
    expect(isDeepSpaceDockPath("/ops")).toBe(true);
    // /wiki is a dock tab root since P2-cont (#658) — the BackArrow hides there.
    expect(isDeepSpaceDockPath("/wiki")).toBe(true);
    // P4c/d/e lens screens render the dock too (QA W1-b — chip floated on /people).
    expect(isDeepSpaceDockPath("/people")).toBe(true);
    expect(isDeepSpaceDockPath("/career")).toBe(true);
    expect(isDeepSpaceDockPath("/rest")).toBe(true);

    // Primary tab roots also render the dock but are hidden via isPrimaryTabPath,
    // so they must NOT be duplicated in the dock list.
    for (const tab of PRIMARY_TAB_PATHS) {
      expect(DEEP_SPACE_DOCK_PATHS).not.toContain(tab);
    }

    // /settings became the 5th dock ROOT tab in the rev2 NAV (sb-data) — the
    // dock is its nav, so the floating back arrow must hide there too.
    expect(isDeepSpaceDockPath("/settings")).toBe(true);

    // /privacy 는 2026-08-30 에 독을 갖게 됐다 — Shell 이 DockShell 로 위임되면서
    // 열한 화면이 함께 옮겨왔다. 독이 있으면 뜬 back 칩은 중복이라 숨어야 한다.
    expect(isDeepSpaceDockPath("/privacy")).toBe(true);

    // 독이 없는 스택 라우트는 여전히 뜬 back 칩을 쓴다(dev 갤러리).
    expect(isDeepSpaceDockPath("/deepspace-hub")).toBe(false);
  });

  test("covers the delegated/multiline dock screens the 4th drift shipped unregistered", () => {
    for (const route of ["/records", "/data", "/integrations", "/import", "/growth", "/seen", "/beyond", "/trends", "/import-hub"]) {
      expect(isDeepSpaceDockPath(route)).toBe(true);
    }
  });

  test("matches dynamic dock routes by prefix (star lens / record detail render their own top bar)", () => {
    expect(isDeepSpaceDockPath("/star/career")).toBe(true);
    expect(isDeepSpaceDockPath("/star/rest")).toBe(true);
    expect(isDeepSpaceDockPath("/record/3f9a2c9e-0000-4000-8000-000000000000")).toBe(true);
    // The records LIST route is a static entry, not a prefix artifact.
    expect(isDeepSpaceDockPath("/record")).toBe(false);
    // Prefixes must not swallow unrelated routes.
    expect(isDeepSpaceDockPath("/starship")).toBe(false);
  });
});

// 이 파일 헤더가 약속한 것: 탭 목록의 세 소비자(탭바가 어디서 **뜨는가**,
// back 화살표가 어디서 **숨는가**, 앱 셸이 어디서 하단 **자리를 비우는가**)가
// 서로 어긋나지 않는다. deep-space 가 들어오면서 그 약속이 반쪽 깨졌다 —
// PremiumTabBar 는 deep-space 에서 무조건 null 인데 PremiumAppShell 은 그
// 조건을 몰라, 아무것도 없는 자리를 78dp + safe-area 만큼 비워 뒀다. 공유로
// 열린 딥스페이스 /capture 에서 실제 사공간으로 드러났다(#1551 사후 검증 P2).
describe("탭바를 그리는 조건과 자리를 비우는 조건은 같아야 한다", () => {
  const readRepo = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");
  const read = (path: string): string => readRepo(join("src", "components", "premium", path));

  test("PremiumTabBar 는 deep-space 에서 아무것도 그리지 않는다", () => {
    expect(read("tab-bar.tsx")).toContain("if (isDeepSpaceUI()) return null;");
  });

  test("PremiumAppShell 의 하단 예약도 같은 조건을 본다", () => {
    const shell = read("background.tsx");
    expect(shell).toContain("const ownsBottomClearance = bottomClearanceOwner === \"shell\";");
    expect(shell).toContain("ownsBottomClearance && isTabPath(pathname) && !isDeepSpaceUI()");
    expect(shell).toMatch(
      /const bottomClearance = !ownsBottomClearance\s*\? 0\s*: onTabBar\s*\? TAB_BAR_HEIGHT \+ spacing\.lg \+ insets\.bottom\s*: insets\.bottom;/,
    );
  });

  test("full intake 는 dock 부모에게 하단 여백을 맡기고 자체 tab 높이를 더하지 않는다", () => {
    const capture = readRepo(join("src", "app", "capture.tsx"));
    const captureFull = readRepo(join("src", "app", "capture-full.tsx"));

    expect(capture).not.toContain("TAB_BAR_HEIGHT");
    expect(capture).not.toContain("scrollBottomPadding");
    expect(capture).toContain('import { useKeyboard } from "@/lib/ui/useKeyboard";');
    expect(capture).toContain("const kbHeight = useKeyboard();");
    expect(capture).toContain(
      'const keyboardBehavior = Platform.OS === "ios" ? "padding" : undefined;',
    );
    expect(capture).not.toMatch(/keyboardBehavior\s*=.*:\s*"height"/);
    expect(capture).toContain('Platform.OS === "android" && {');
    expect(capture).toContain(
      "paddingBottom: Math.max(styles.scroll.paddingBottom, kbHeight + spacing.xl)",
    );
    expect(capture).toContain("scroll: { paddingBottom: spacing.xl");
    expect(capture).toMatch(
      /<DeepSpaceScreen active="capture" variant="windowed">\s*<CaptureLegacy\b(?=[^>]*\bembeddedInDock\b)[^>]*\/>/,
    );
    expect(
      capture.match(
        /<PremiumAppShell bottomClearanceOwner=\{embeddedInDock \? "parent" : "shell"\}>/g,
      ),
    ).toHaveLength(3);

    expect(captureFull).toMatch(
      /<DeepSpaceScreen active="capture">\s*<CaptureLegacy\b(?=[^>]*\bembeddedInDock\b)[^>]*\/>/,
    );
    // Legacy UI has no DeepSpaceScreen parent, so its shell still owns safe area.
    expect(captureFull).toMatch(
      /return\s+<CaptureLegacy\b(?![^>]*\bembeddedInDock\b)[^>]*\/>;/,
    );
  });
});
