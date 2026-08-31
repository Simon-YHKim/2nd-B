import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MUSEUM_INITIAL_YEAR,
  MUSEUM_VISIBLE_MAX_YEAR,
  MUSEUM_VISIBLE_YEAR_SPAN,
  beginMuseumSheetTransition,
  clampMuseumYear,
  museumDialFractionForYear,
  museumScrollXForYear,
  museumTargetId,
  museumYearFromDial,
  museumYearFromScroll,
  stepMuseumSelection,
  toggleMuseumSelection,
} from "../museum-interaction";
import { MUSEUM, MUSEUM_BY_YEAR, MZ } from "../museum-timeline-data";

const read = (path: string): string =>
  readFileSync(join(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

describe("PIXEL-CLAY museum interaction contract", () => {
  const ids = new Set(MUSEUM.map((event) => event.id));

  test("pins the full canon and the existing visible seek range", () => {
    expect(MUSEUM).toHaveLength(43);
    expect(MUSEUM_INITIAL_YEAR).toBe(2022);
    expect(MUSEUM_VISIBLE_MAX_YEAR).toBe(2026);
    expect(MUSEUM_VISIBLE_YEAR_SPAN).toBe(MUSEUM_VISIBLE_MAX_YEAR - MZ.START);
    expect(clampMuseumYear(Number.NEGATIVE_INFINITY)).toBe(MZ.START);
    expect(clampMuseumYear(9999)).toBe(MUSEUM_VISIBLE_MAX_YEAR);
  });

  test("clamps dial input and round-trips the initial centred seek", () => {
    expect(museumYearFromDial(-50, 300)).toBe(MZ.START);
    expect(museumYearFromDial(350, 300)).toBe(MUSEUM_VISIBLE_MAX_YEAR);
    expect(museumYearFromDial(10, 0)).toBe(MZ.START);
    expect(museumYearFromDial(10, Number.NaN)).toBe(MZ.START);

    const dialWidth = 360;
    for (const fraction of [0.25, 0.5, 0.75]) {
      const dialYear = museumYearFromDial(dialWidth * fraction, dialWidth);
      expect(dialYear).toBe(MZ.START + MUSEUM_VISIBLE_YEAR_SPAN * fraction);
      expect(museumDialFractionForYear(dialYear)).toBeCloseTo(fraction, 10);
    }

    const viewportWidth = 390;
    const initialOffset = museumScrollXForYear(MUSEUM_INITIAL_YEAR, viewportWidth);
    expect(museumYearFromScroll(initialOffset, viewportWidth)).toBe(MUSEUM_INITIAL_YEAR);
  });

  test("selects, rapidly switches, deselects, and ignores a missing id", () => {
    const first = MUSEUM[0].id;
    const second = MUSEUM[1].id;
    let selected: string | null = null;

    selected = toggleMuseumSelection(selected, first, ids);
    expect(selected).toBe(first);
    selected = toggleMuseumSelection(selected, second, ids);
    expect(selected).toBe(second);
    expect(toggleMuseumSelection(selected, "missing-event", ids)).toBe(second);
    expect(toggleMuseumSelection(selected, second, ids)).toBeNull();
  });

  test("clamps chronological previous and next at both ends", () => {
    const first = MUSEUM_BY_YEAR[0];
    const middle = MUSEUM_BY_YEAR[20];
    const last = MUSEUM_BY_YEAR[MUSEUM_BY_YEAR.length - 1];

    expect(stepMuseumSelection(MUSEUM_BY_YEAR, first.id, -1)).toBeNull();
    expect(stepMuseumSelection(MUSEUM_BY_YEAR, first.id, 1)).toBe(
      MUSEUM_BY_YEAR[1].id,
    );
    expect(stepMuseumSelection(MUSEUM_BY_YEAR, middle.id, -1)).toBe(
      MUSEUM_BY_YEAR[19].id,
    );
    expect(stepMuseumSelection(MUSEUM_BY_YEAR, middle.id, 1)).toBe(
      MUSEUM_BY_YEAR[21].id,
    );
    expect(stepMuseumSelection(MUSEUM_BY_YEAR, last.id, 1)).toBeNull();
    expect(stepMuseumSelection(MUSEUM_BY_YEAR, "missing-event", 1)).toBeNull();
  });

  test("jumps only to the exact related id and fails closed when missing", () => {
    const source = MUSEUM.find((event) => event.rel.length > 0);
    expect(source).toBeDefined();
    const relatedId = source?.rel[0] ?? "";
    expect(museumTargetId(relatedId, ids)).toBe(relatedId);
    expect(museumTargetId("missing-relation", ids)).toBeNull();
  });

  test("stops stale transitions across rapid selection, reduced motion, and unmount", () => {
    const calls: string[] = [];
    const value = {
      setValue: (next: number) => calls.push(`set:${next}`),
      stopAnimation: () => calls.push("value:stop"),
    };
    const makeAnimation = () => ({
      start: () => calls.push("animation:start"),
      stop: () => calls.push("animation:stop"),
    });

    const cleanupFirst = beginMuseumSheetTransition(value, true, false, makeAnimation);
    cleanupFirst();
    const cleanupRapidSwitch = beginMuseumSheetTransition(
      value,
      true,
      false,
      makeAnimation,
    );
    cleanupRapidSwitch();
    const cleanupReduced = beginMuseumSheetTransition(value, true, true, () => {
      throw new Error("reduced motion must not create an animation");
    });
    cleanupReduced();

    expect(calls).toEqual([
      "value:stop",
      "set:0",
      "animation:start",
      "animation:stop",
      "value:stop",
      "value:stop",
      "set:0",
      "animation:start",
      "animation:stop",
      "value:stop",
      "value:stop",
      "set:1",
      "value:stop",
    ]);
  });

  test("keeps all current canon references editorial and URL-free", () => {
    const references = MUSEUM.flatMap((event) => event.refs);
    expect(references.length).toBeGreaterThan(0);
    expect(
      references.some((reference) =>
        Object.prototype.hasOwnProperty.call(reference, "url"),
      ),
    ).toBe(false);
  });
});

describe("PIXEL-CLAY museum renderer wiring", () => {
  const screen = read(
    "src/screens/deepspace/museum/MuseumTimelineScreen.tsx",
  );
  const styles = read(
    "src/screens/deepspace/museum/museum-timeline-styles.ts",
  );
  const interaction = read(
    "src/screens/deepspace/museum/museum-interaction.ts",
  );

  test("uses shared PIXEL surfaces and rect-only timeline geometry", () => {
    expect(screen).toContain("<PixelSurface");
    expect(screen).toContain("<PixelPressable");
    expect(screen).toContain("<PixelGlyph");
    expect(screen).toContain("<PixelDither");
    expect(screen).toContain("<Rect");
    expect(screen).not.toMatch(/<(?:Pressable|MdButton|Line|Path|Circle|Polyline|Polygon)\b/);
    expect(`${screen}\n${styles}`).not.toMatch(
      /\b(?:opacity|withAlpha|borderRadius|shadowRadius|gradient)\b/,
    );
  });

  test("keeps 44dp actions, compact reflow, and explicit accessibility state", () => {
    expect(styles).toContain("minHeight: m3.minTouch");
    expect(screen).toContain("windowWidth < 360");
    expect(styles).toContain('factSurfaceCompact: { flexBasis: "100%" }');
    expect(screen).toContain(
      "accessibilityState={{ selected: active, expanded: active }}",
    );
    expect(screen).toContain("accessibilityState={{ expanded: true }}");
    expect(screen).toContain('accessibilityRole="adjustable"');
  });

  test("uses the native reduced-motion signal and cleans every animation path", () => {
    expect(screen).toContain("AccessibilityInfo.isReduceMotionEnabled()");
    expect(screen).toContain('"reduceMotionChanged"');
    expect(screen).toContain("subscription.remove()");
    expect(screen).toContain("beginMuseumSheetTransition(");
    expect(interaction).toContain("if (reducedMotion)");
    expect(interaction).toContain("value.stopAnimation()");
    expect(interaction).toContain("animation.stop()");
    expect(screen).not.toMatch(/\.start\s*\(\s*\([^)]*\)\s*=>/);
  });

  test("does not invent an external-reference action or perform external I/O", () => {
    expect(`${screen}\n${interaction}`).not.toMatch(
      /\bLinking\b|openURL|open_in_new|\bfetch\s*\(/,
    );
    expect(screen).toContain('accessibilityRole="text"');
    expect(screen).toContain("MUSEUM_REF_LABEL[reference.kind]");
  });

  test("renders only canon event/detail fields rather than fixture events", () => {
    expect(screen).toContain("MUSEUM.map((event)");
    expect(screen).toContain("selected.body");
    expect(screen).toContain("selectedDetail.long");
    expect(screen).not.toMatch(/w_ww2|a_chatgpt|a_2ndb|fixture|sampleEvent/);
  });
});

describe("museum byte-stable boundaries", () => {
  test("preserves the route, canon converter, and existing canon test", () => {
    expect(sha256(read("src/app/museum.tsx"))).toBe(
      "777f7c3c9539c7dea04a310dc358feb6b27a953e50f60055886f0dbf848666ea",
    );
    expect(
      sha256(read("src/screens/deepspace/museum/museum-timeline-data.ts")),
    ).toBe("8e590d2dce774fd6c9b471ed151c975fe4fca25bba0306ac5643ea63a6e62f88");
    expect(
      sha256(
        read("src/screens/deepspace/museum/__tests__/museum-canon.test.ts"),
      ),
    ).toBe("1133f083076759e7aa49ad444b705331609169ce38302738e59916fa068b3ca1");
  });
});
