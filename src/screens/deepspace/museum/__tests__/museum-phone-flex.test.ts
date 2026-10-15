// Inside the phone, two Museum boxes must keep a real height.
//
// 2026-10-01 web QA (Apps -> Museum, 320x568 and 375x667) found both at 0px:
//
// 1. The event detail body. [sheetScroll { flexGrow: 0 }, phoneSheetScroll
//    { flex: 1 }] - an explicit flexGrow beats the `flex` shorthand in Yoga and
//    in RN-web, so it resolved to grow 0, basis 0. The sheet showed only
//    "< 42 / 43 > x".
// 2. The two-lane timeline canvas. [viewport { flex: 1 }, phoneViewport
//    { flex: 0, height: MZ.TH }] - RN-web hands `flex: 0` to CSS as `0 1 0%`,
//    and a 0% basis overrides `height`. Timeline mode showed an empty strip.
//    Yoga reads `flex: 0` as basis auto, so a native-only check would pass.
//
// Source-text tests pinned both values and stayed green. This resolves the
// real style objects the way each engine does. Render tests stay blocked on
// RN 0.85 upstream, so the order of each style array is read from the screen.
import { readFileSync } from "node:fs";
import { join } from "node:path";

jest.mock("react-native", () => ({
  StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 },
  Platform: { OS: "web", select: <T,>(choices: { web?: T; default?: T }) => choices.web ?? choices.default },
}));

import { MZ } from "../museum-timeline-data";
import { museumTimelineStyles as styles } from "../museum-timeline-styles";

type FlexStyle = {
  flex?: number;
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: number | string;
  height?: number;
  minHeight?: number;
};
type Resolved = { grow: number; basis: number | string; height?: number; minHeight?: number };

const merge = (parts: unknown[]): FlexStyle => Object.assign({}, ...parts);

/** Yoga: a defined longhand wins; `flex > 0` means basis 0, otherwise auto. */
function yoga(parts: unknown[]): Resolved {
  const s = merge(parts);
  const positive = typeof s.flex === "number" && s.flex > 0;
  return {
    grow: s.flexGrow ?? (positive ? s.flex! : 0),
    basis: s.flexBasis ?? (positive ? 0 : "auto"),
    height: s.height,
    minHeight: s.minHeight,
  };
}

/** RN-web 0.21: `flex: n` (n >= 0) becomes CSS `n 1 0%`; longhand classes win. */
function web(parts: unknown[]): Resolved {
  const s = merge(parts);
  const shorthand = typeof s.flex === "number" && s.flex >= 0;
  return {
    grow: s.flexGrow ?? (shorthand ? s.flex! : 0),
    basis: s.flexBasis ?? (shorthand ? "0%" : "auto"),
    height: s.height,
    minHeight: s.minHeight,
  };
}

/** Main size in a column parent that gives no extra space: CSS ignores `height` unless basis is auto. */
const fixedHeight = (r: Resolved) => (r.basis === "auto" ? r.height ?? 0 : 0);

const screen = readFileSync(join(__dirname, "..", "MuseumTimelineScreen.tsx"), "utf8");
const sheetBody = [styles.sheetScroll, styles.phoneSheetScroll];
const canvas = [styles.viewport, styles.phoneViewport];

test("the style arrays are the ones the screen passes", () => {
  expect(screen).toContain("style={[styles.sheetScroll, phone && styles.phoneSheetScroll]}");
  expect(screen).toContain("style={[styles.viewport, phone && styles.phoneViewport]}");
});

test.each([["yoga", yoga], ["web", web]] as const)("%s: the detail body fills the sheet under its header", (_name, engine) => {
  const r = engine(sheetBody);
  expect(r.grow).toBeGreaterThanOrEqual(1);
  // Basis 0 + minHeight 0 keeps a long detail inside the sheet so it scrolls.
  expect(r.basis).toBe(0);
  expect(r.minHeight).toBe(0);
});

test.each([["yoga", yoga], ["web", web]] as const)("%s: the timeline canvas keeps its two-lane height", (_name, engine) => {
  const r = engine(canvas);
  expect(r.grow).toBe(0);
  expect(fixedHeight(r)).toBe(MZ.TH);
});

test("the shipped forms are caught: shorthand sheet body, and flex 0 on web only", () => {
  expect(web([styles.sheetScroll, { flex: 1, minHeight: 0 }]).grow).toBe(0);
  expect(yoga([styles.sheetScroll, { flex: 1, minHeight: 0 }]).grow).toBe(0);
  expect(fixedHeight(web([styles.viewport, { flex: 0, height: MZ.TH }]))).toBe(0);
  expect(fixedHeight(yoga([styles.viewport, { flex: 0, height: MZ.TH }]))).toBe(MZ.TH);
});

test("standalone /museum keeps its own sizing", () => {
  expect(web([styles.sheetScroll]).grow).toBe(0);
  expect(web([styles.viewport]).grow).toBe(1);
});
