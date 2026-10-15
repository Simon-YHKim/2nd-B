// AUTHBOOT-GATE-01 · AUTHBOOT-R1-01 (게이트 지적, 2026-10-05): GateCover 가 덮은 트리가 웹에서
// 키보드로 닿았다.
//
// R2A-01 수정으로 붙들기는 라우트 트리를 내리지 않고 덮는다. 덮인 트리에는 pointerEvents="none" 과
// 네이티브 접근성 prop 둘(accessibilityElementsHidden · importantForAccessibility)만 걸려 있었는데,
// react-native-web 0.21 은 그 둘을 DOM 에 옮기지 않고 pointerEvents 는 CSS 클래스로만 만든다.
// 그래서 덮인 트리의 Pressable 은 tabindex="0" 탭 정지로 남아, 웹에서 Tab + Enter 로 보이지 않는
// 재시도 · 로그아웃 · BackArrow · CompletionToast(작업 닫기 · 결과로 이동)를 누를 수 있었다.
// 이 PR 전에는 붙드는 동안 그 트리가 통째로 언마운트됐으므로 이 PR 이 만든 상태다.
//
// 이 파일은 RN 0.85 렌더 테스트가 아니다(그 길은 막혀 있다). react-native 를 react-native-web 으로
// 바꿔 끼우고 react-dom/server 로 GateCover 의 실제 웹 마크업을 그린 뒤, 그 마크업을 브라우저의
// 순차 포커스 규칙으로 읽는다: 탭 정지 = tabindex 0 이상(또는 button · a[href] · input 등)이고 inert
// 조상이 없는 요소. inert 는 그 하위를 탭 순서 · 키보드 실행 · 접근성 트리에서 뺀다(HTML 표준).
// 브라우저가 inert 를 실제로 지키는지는 이 파일 밖(헤드리스 Chrome 실측)이다.
import React from "react";

jest.mock("react-native", () => require("react-native-web"));

// GateCover 는 JSX 를 React import 없이 쓴다(앱은 자동 런타임). 테스트 변환은
// React.createElement 를 내므로 GateCover 를 불러오기 전에 전역에 둔다.
(globalThis as { React?: typeof React }).React = React;

const { renderToStaticMarkup } = require("react-dom/server") as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};
const { GateCover, releaseFocusInside } = require("@/components/ui/GateCover") as typeof import("@/components/ui/GateCover");
const RNW = require("react-native-web") as {
  Pressable: React.ComponentType<{ accessibilityRole?: string; onPress?: () => void; children?: React.ReactNode }>;
  Text: React.ComponentType<{ children?: React.ReactNode }>;
};

type Stop = { label: string; underInert: boolean };

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const NATIVE_FOCUSABLE = new Set(["button", "input", "select", "textarea"]);

/** renderToStaticMarkup 결과(잘 짜인 마크업)에서 탭 정지 후보를 문서 순서대로 뽑는다. */
function tabStops(html: string): Stop[] {
  const stack: { inert: boolean; stop: Stop | null }[] = [];
  const stops: Stop[] = [];
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>|([^<]+)/g)) {
    const [, closing, rawTag, attrs = "", text] = m;
    if (text !== undefined) {
      for (const frame of stack) if (frame.stop) frame.stop.label += text;
      continue;
    }
    if (closing) {
      stack.pop();
      continue;
    }
    const tag = rawTag.toLowerCase();
    const inert = /\sinert(?:=|\s|\/|$)/.test(attrs) || (stack.at(-1)?.inert ?? false);
    const tabindex = /\stabindex="(-?\d+)"/.exec(attrs);
    const focusable = tabindex
      ? Number(tabindex[1]) >= 0
      : NATIVE_FOCUSABLE.has(tag) || (tag === "a" && /\shref=/.test(attrs));
    const stop = focusable ? { label: "", underInert: inert } : null;
    if (stop) stops.push(stop);
    if (!VOID.has(tag) && !attrs.trimEnd().endsWith("/")) stack.push({ inert, stop });
  }
  return stops;
}

const h = React.createElement;
const button = (label: string) =>
  h(RNW.Pressable, { accessibilityRole: "button", onPress: () => undefined }, h(RNW.Text, null, label));

// 덮인 트리 쪽: 장면이 그리는 재시도 · 로그아웃 사본과 장면 래퍼 밖의 전역 오버레이 버튼들.
const routeTree = () =>
  h(
    React.Fragment,
    null,
    button("under-retry"),
    button("under-signout"),
    button("under-back"),
    button("under-toast-dismiss"),
  );
const retryCover = () => h(React.Fragment, null, button("cover-retry"), button("cover-signout"));

const reachable = (stops: Stop[]) => stops.filter((s) => !s.underInert).map((s) => s.label);
const held = (stops: Stop[]) => stops.filter((s) => s.underInert).map((s) => s.label);

// RN-web 은 View 의 pointerEvents prop 에 한 번 폐기 경고를 낸다(앱 전체가 쓰는 prop 이다).
// 그 한 줄만 걸러 내고 나머지 경고는 그대로 둔다.
const warn = console.warn;
beforeAll(() => {
  jest.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("props.pointerEvents is deprecated")) return;
    warn(...args);
  });
});
afterAll(() => jest.restoreAllMocks());

describe("GateCover 웹: 덮인 트리는 키보드로 닿지 않는다", () => {
  test("덮였을 때 Tab 으로 닿는 것은 덮개 위 버튼뿐이고, 아래 트리는 마운트된 채 inert 안에 있다", () => {
    const html = renderToStaticMarkup(h(GateCover, { cover: retryCover(), children: routeTree() }));
    const stops = tabStops(html);
    expect(reachable(stops)).toEqual(["cover-retry", "cover-signout"]);
    // R2A-01 계약: 자식은 덮여도 그려진다(언마운트가 고리의 원인이었다).
    expect(held(stops)).toEqual(["under-retry", "under-signout", "under-back", "under-toast-dismiss"]);
  });

  test("덮개가 없으면 inert 도 없다: 같은 트리가 그대로 탭 순서에 있다", () => {
    const html = renderToStaticMarkup(h(GateCover, { cover: null, children: routeTree() }));
    expect(html).not.toMatch(/\sinert(?:=|\s|\/|>)/);
    const stops = tabStops(html);
    expect(reachable(stops)).toEqual(["under-retry", "under-signout", "under-back", "under-toast-dismiss"]);
    expect(held(stops)).toEqual([]);
  });

  test("읽는 자가 맞는지: inert 없이 덮기만 하면 아래 버튼이 탭 정지로 잡힌다", () => {
    // 고치기 전 GateCover 의 웹 마크업 모양(pointerEvents 클래스만 있는 래퍼)을 그대로 만든다.
    // 이 경우를 잡지 못하는 판독기라면 위 두 테스트의 통과는 아무 뜻이 없다.
    const { View } = require("react-native-web") as {
      View: React.ComponentType<{ pointerEvents?: string; children?: React.ReactNode }>;
    };
    const html = renderToStaticMarkup(
      h(View, null, h(View, { pointerEvents: "none" }, routeTree()), h(View, null, retryCover())),
    );
    expect(reachable(tabStops(html))).toEqual([
      "under-retry",
      "under-signout",
      "under-back",
      "under-toast-dismiss",
      "cover-retry",
      "cover-signout",
    ]);
  });
});

// inert 만으로는 한 틈이 남는다: 덮개가 올라올 때 이미 포커스를 쥐고 있던 버튼은 브라우저가 다음
// 렌더링 갱신을 할 때까지 포커스를 쥐고, 그 사이 Enter · Space 가 그 버튼을 누른다(헤드리스 Chrome 154
// 실측, 2026-10-05: 덮은 뒤 50ms 에 Enter → 숨은 로그아웃 click 1회). 그래서 덮는 커밋에서 트리 안에 남은
// 포커스를 놓는다. 서버 렌더는 effect 를 돌리지 않으므로 규칙은 순수 함수로, 배선은 소스 계약으로 본다.
describe("GateCover 웹: 덮는 순간 트리 안에 남은 포커스를 놓는다", () => {
  const tree = (inside: unknown[]) => ({ contains: (node: unknown) => inside.includes(node) });
  const focusable = () => ({ blur: jest.fn() });

  test("포커스가 덮인 트리 안이면 blur 한다", () => {
    const active = focusable();
    expect(releaseFocusInside(tree([active]), { activeElement: active })).toBe(true);
    expect(active.blur).toHaveBeenCalledTimes(1);
  });

  test("포커스가 트리 밖(덮개 · 다른 곳)이면 건드리지 않는다", () => {
    const active = focusable();
    expect(releaseFocusInside(tree([]), { activeElement: active })).toBe(false);
    expect(active.blur).not.toHaveBeenCalled();
  });

  test("문서가 없거나(네이티브 · 서버) 포커스 · 트리가 없으면 아무것도 하지 않는다", () => {
    const active = focusable();
    expect(releaseFocusInside(tree([active]), undefined)).toBe(false);
    expect(releaseFocusInside(tree([active]), { activeElement: null })).toBe(false);
    expect(releaseFocusInside(null, { activeElement: active })).toBe(false);
    expect(active.blur).not.toHaveBeenCalled();
  });

  test("소스 계약: 덮일 때(웹) 레이아웃 effect 가 덮인 트리의 ref 로 포커스를 놓는다", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const source = readFileSync(join(__dirname, "..", "GateCover.tsx"), "utf8");
    const fn = source.slice(source.indexOf("export function GateCover("));
    // 덮개가 오르는 커밋과 같은 작업 안에서 돈다(useEffect 면 그 사이 키 입력이 들어올 수 있다).
    expect(fn).toMatch(
      /useLayoutEffect\(\(\) => \{\s*if \(!covered \|\| !web \|\| typeof document === "undefined"\) return;\s*releaseFocusInside\(treeRef\.current\b[^;]*, document\);\s*\}, \[covered, web\]\);/,
    );
    // ref 는 inert 가 걸리는 바로 그 래퍼(자식을 감싼 View)에 있다. 덮개 쪽이 아니다.
    const ref = fn.indexOf("ref={treeRef}");
    expect(ref).toBeGreaterThan(-1);
    expect(fn.indexOf("ref={treeRef}", ref + 1)).toBe(-1);
    expect(ref).toBeLessThan(fn.indexOf("{...webInert}"));
    expect(fn.indexOf("{...webInert}")).toBeLessThan(fn.indexOf("{children}"));
    expect(fn.indexOf("{children}")).toBeLessThan(fn.indexOf("{cover}"));
  });
});
