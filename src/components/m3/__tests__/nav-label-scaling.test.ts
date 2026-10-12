import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { m3 } from "@/lib/theme/m3";
import { AVAILABLE_UI_LOCALES } from "@/lib/i18n/locales";
import { FONT_STYLE_ORDER, setFontStyle } from "@/lib/settings/readable-font";
import { chromeFaceFor, m3TextStyle } from "../typeface";
import {
  NAV_BAR_GEOMETRY, NAV_LABEL_FACES, NAV_LABEL_LOCALES, NAV_LABEL_WIDTHS,
  navLabelLayout, navSlotWidths, recordNavSlotWidth, type NavSlotMeasurements,
} from "../nav-label-layout";
import { navLabelFont } from "./nav-label-font";

// Only Platform.select in typography needs the repository's tiny node mock.
// No RN renderer, component or hook is imported/mounted by these tests.
jest.mock("react-native");
afterEach(() => setFontStyle("pixel"));

const read = (path: string) => readFileSync(path, "utf8");
const keys = ["home", "capture", "chat", "wiki", "settings"];
const locales = AVAILABLE_UI_LOCALES;
const fonts = NAV_LABEL_FACES.map(navLabelFont);
const itemsFor = (locale: string) => {
  const dock = JSON.parse(read(`locales/${locale}/home.json`)).ds.dock;
  return keys.map(key => ({ key, label: dock[key] as string }));
};
// Independent geometry of the existing button-like bar, pinned to source below.
const slotFor = (width: number) => (width - 2 * 4 - 4 * 4) / 5 - 2 * 2;
const slots = (width: number) => Object.fromEntries(keys.map(key => [key, slotFor(width)]));
const layout = (width: number, locale: string, system: number, density = 3.5, platform = "android") =>
  navLabelLayout(itemsFor(locale), slots(width), system, density, platform, locale);
const androidSize = (size: number, density: number) => Math.ceil(size * density - 1e-8) / density;
const six = (value: number) => Number(value.toFixed(6));

describe("D5 dock labels: measured slots, current copy and one shared scale", () => {
  test("shipped labels and both font files regenerate the runtime width table", () => {
    expect([...NAV_LABEL_LOCALES].sort()).toEqual([...AVAILABLE_UI_LOCALES].sort());
    const measured: Record<string, number> = {};
    for (const locale of locales) for (const { label } of itemsFor(locale)) {
      expect(Object.hasOwn(NAV_LABEL_WIDTHS, label)).toBe(true);
      measured[label] = Math.ceil(Math.max(...fonts.map(font => font.width(label, 10))) * 1000) / 1000;
    }
    expect(NAV_LABEL_WIDTHS).toEqual(measured);
    // Copy stays in locales; even equal-width renames require revalidation.
    expect(createHash("sha256").update(JSON.stringify(
      locales.map(locale => itemsFor(locale).map(item => item.label)),
    )).digest("hex")).toBe("2751579f01d1c9b552fba06197a0fb2f5bfdc9038251d79ea0d5982f6b85fa29");
    // Even a font replacement with identical advances requires a review.
    expect(fonts.map(font => createHash("sha256").update(font.font).digest("hex"))).toEqual([
      "3758d4f96d4d0f26fe0ce1d2d7ceaffd303f678e51db4477922c8b05d139f836",
      "1d9d49715a39be65980072d72845a52dbed5887618e21d87aea1e3de2b2d28af",
    ]);
    expect(m3.type.labelMedium).toEqual({ size: 10, line: 15, tracking: 0, weight: "400" });
    expect(m3.font.brand).toBe("Galmuri11");
    const typeface = read("src/components/m3/typeface.ts");
    expect(typeface).toContain('10: "Galmuri9"');
    expect(typeface).toContain('Galmuri11: "Galmuri11Bold"');
    const assets = read("src/theme/typography.ts");
    for (const face of ["Galmuri9", "Galmuri11Bold"]) {
      expect(assets).toContain(`require("../../assets/fonts/${face}-subset.ttf")`);
    }
  });

  test("every canonical font mode resolves both tab faces inside the measured set", () => {
    for (const mode of FONT_STYLE_ORDER) {
      setFontStyle(mode);
      const inactive = m3TextStyle("labelMedium");
      expect(NAV_LABEL_FACES).toContain(inactive.fontFamily);
      expect(NAV_LABEL_FACES).toContain(chromeFaceFor("700"));
      expect(inactive).toMatchObject({ fontSize: 10, lineHeight: 15, letterSpacing: 0 });
      expect(inactive).not.toHaveProperty("fontWeight");
    }
  });

  test("pins the 60 applied scales, plus Android pixel rounding, at Device Lab density 3.5", () => {
    const table = [360, 393, 411].flatMap(width => locales.map(locale => ({
      width, locale,
      scales: [1, 1.3, 1.6, 2].map(system => six(layout(width, locale, system).scale)),
      pixels: [1, 1.3, 1.6, 2].map(system => Math.round(androidSize(layout(width, locale, system).fontSize, 3.5) * 3.5)),
    })));
    const expected = [
      [360, "ko", [1, 1.3, 1.542857, 1.542857], [35, 46, 54, 54]],
      [360, "en", [1, 1.3, 1.371429, 1.371429], [35, 46, 48, 48]],
      [360, "es", [1, 1.257143, 1.257143, 1.257143], [35, 44, 44, 44]],
      [360, "pt", [1, 1.257143, 1.257143, 1.257143], [35, 44, 44, 44]],
      [360, "id", [1, 1, 1, 1], [35, 35, 35, 35]],
      [393, "ko", [1, 1.3, 1.6, 1.6], [35, 46, 56, 56]],
      [393, "en", [1, 1.3, 1.514286, 1.514286], [35, 46, 53, 53]],
      [393, "es", [1, 1.3, 1.4, 1.4], [35, 46, 49, 49]],
      [393, "pt", [1, 1.3, 1.4, 1.4], [35, 46, 49, 49]],
      [393, "id", [1, 1.114286, 1.114286, 1.114286], [35, 39, 39, 39]],
      [411, "ko", [1, 1.3, 1.6, 1.6], [35, 46, 56, 56]],
      [411, "en", [1, 1.3, 1.6, 1.6], [35, 46, 56, 56]],
      [411, "es", [1, 1.3, 1.457143, 1.457143], [35, 46, 51, 51]],
      [411, "pt", [1, 1.3, 1.457143, 1.457143], [35, 46, 51, 51]],
      [411, "id", [1, 1.171429, 1.171429, 1.171429], [35, 41, 41, 41]],
    ].map(([width, locale, scales, pixels]) => ({ width, locale, scales, pixels }));
    expect(table).toEqual(expect.arrayContaining(expected));
    expect(table).toHaveLength(expected.length);
  });

  test("all 600 label/face measurements fit at every matrix point, retaining pre-existing base-size limits", () => {
    for (const density of [1, 1.5, 2, 2.625, 2.75, 3, 3.5, 4]) {
      for (const width of [360, 393, 411]) for (const locale of locales) {
        for (const system of [1, 1.3, 1.6, 2]) {
          const result = layout(width, locale, system, density);
          const renderedSize = androidSize(result.fontSize, density);
          expect(renderedSize).toBeLessThanOrEqual(16 + 1e-8);
          for (const font of fonts) for (const { label } of itemsFor(locale)) {
            // Actual runtime fontSize, native rounding and independent font data;
            // merely clamping a hypothetical 2x to the declared cap is not proof.
            const textWidth = Math.ceil(font.width(label, renderedSize) * density - 1e-8) / density;
            const baseWidth = Math.ceil(font.width(label, androidSize(10, density)) * density - 1e-8) / density;
            if (baseWidth > slotFor(width)) {
              // At 360dp, density 2.625 can already overflow Pengaturan
              // at 1x after Android rounds 10dp up. The 1x floor forbids shrinking.
              expect([width, locale, density]).toEqual([360, "id", 2.625]);
              expect(result.scale).toBe(1);
              expect(textWidth).toBe(baseWidth);
            } else {
              expect(textWidth).toBeLessThanOrEqual(slotFor(width));
            }
          }
        }
        const capped = layout(width, locale, 2, density);
        if (capped.cap < 1.6) {
          const nextPixelSize = capped.fontSize + 1 / density;
          const widest = Math.max(...fonts.flatMap(font => itemsFor(locale).map(item => font.width(item.label, nextPixelSize))));
          // The next physical font pixel must break either the 1.6 ceiling or fit.
          expect(nextPixelSize > 16 || widest > slotFor(width) - 2 / density).toBe(true);
        }
      }
    }
  });

  test("scaled lines and 24dp icons fit inside the unchanged 52dp touch surface", () => {
    for (const density of [1, 2, 2.625, 3, 3.5, 4]) for (const width of [360, 393, 411, 432, 480, 1024]) {
      for (const locale of locales) for (const system of [1, 1.3, 1.6, 2]) {
        const result = layout(width, locale, system, density);
        const linePixels = Math.ceil(result.lineHeight * density);
        expect(result.indicatorHeight).toBeGreaterThanOrEqual(24);
        expect(result.indicatorHeight + 2 + linePixels / density + 2 / density).toBeLessThanOrEqual(52);
        const size = androidSize(result.fontSize, density);
        for (const font of fonts) {
          expect(font.height * size).toBeLessThanOrEqual(linePixels / density);
          for (const item of itemsFor(locale)) for (const char of item.label) {
            const bounds = font.bounds(char);
            expect((bounds.top - bounds.bottom) * size).toBeLessThanOrEqual(linePixels / density);
            expect(bounds.left).toBeGreaterThanOrEqual(0);
            expect(bounds.right * size).toBeLessThanOrEqual(font.width(char, size));
          }
        }
      }
    }
    expect(layout(411, "ko", 1)).toMatchObject({ fontSize: 10, lineHeight: 15, indicatorHeight: 32 });
  });

  test("first paint, partial measurement and every remount have the same layout", () => {
    for (const width of [360, 393, 411, 432, 480]) for (const locale of locales) {
      const items = itemsFor(locale);
      let measured: NavSlotMeasurements = {};
      for (const key of keys) {
        expect(navLabelLayout(items, navSlotWidths(items, measured, width, true), 2, 3.5, "android", locale))
          .toEqual(layout(width, locale, 2));
        measured = recordNavSlotWidth(measured, key, slotFor(width), width);
      }
      const settled = navLabelLayout(items, navSlotWidths(items, measured, width, true), 2, 3.5, "android", locale);
      expect(settled).toEqual(layout(width, locale, 2));
      expect(navLabelLayout(items, navSlotWidths(items, {}, width, true), 2, 3.5, "android", locale)).toEqual(settled);
    }
  });

  test("unknown names and invalid slots retain a visible base-size fallback", () => {
    expect(navLabelLayout([{ key: "new", label: "Unmeasured label" }], { new: 80 }, 2, 3.5, "android", "en").scale).toBe(1);
    expect(navLabelLayout([], {}, 2, 3.5, "android", "en").scale).toBe(1);
    for (const width of [0, -1, NaN, Infinity]) {
      expect(navLabelLayout(itemsFor("ko"), { ...slots(411), capture: width }, 2, 3.5, "android", "ko").scale).toBe(1);
    }
  });

  test("layout events update their own slot without mutation or redundant renders", () => {
    const first = Object.freeze(recordNavSlotWidth({}, "capture", 73.4, 411));
    const resized = recordNavSlotWidth(first, "capture", 50, 411);
    expect(resized).toEqual({ capture: { width: 50, windowWidth: 411 } });
    expect(first.capture.width).toBe(73.4);
    expect(recordNavSlotWidth(resized, "capture", 50, 411)).toBe(resized);
    expect(recordNavSlotWidth(resized, "capture", 50, 393)).toEqual({ capture: { width: 50, windowWidth: 393 } });
    for (const width of [0, -1, NaN, Infinity]) {
      const invalid = recordNavSlotWidth(first, "capture", width, 411);
      expect(invalid.capture.width).toBe(0);
      expect(navSlotWidths(itemsFor("ko"), invalid, 411, true)).toEqual(slots(411));
    }
  });

  test("pairs each name with its own slot before choosing the shared minimum", () => {
    const measured = { ...slots(411), capture: slotFor(360) };
    const compact = navLabelLayout(itemsFor("ko"), measured, 2, 3.5, "android", "ko");
    expect(compact.scale).toBe(1.6);
    expect(navLabelLayout(itemsFor("id"), measured, 2, 3.5, "android", "id")).toEqual(layout(411, "id", 2));
    // Moving the narrow slot to the widest name really must constrain it.
    expect(navLabelLayout(itemsFor("ko"), { ...slots(411), chat: slotFor(360) }, 2, 3.5, "android", "ko"))
      .toEqual(layout(360, "ko", 2));
    // Selection/order changes cannot change the common scale.
    expect(navLabelLayout(itemsFor("ko").reverse(), measured, 2, 3.5, "android", "ko")).toEqual(compact);
  });

  test("current onLayout corrections only use the smaller width", () => {
    const items = itemsFor("ko");
    const measured = recordNavSlotWidth(recordNavSlotWidth({}, "chat", 50, 411), "capture", 100, 411);
    const resolved = navSlotWidths(items, measured, 411, true);
    expect(resolved).toEqual({ ...slots(411), chat: 50 });
    const result = navLabelLayout(items, resolved, 2, 3.5, "android", "ko");
    for (const font of fonts) for (const item of items) {
      expect(font.width(item.label, androidSize(result.fontSize, 3.5))).toBeLessThanOrEqual(resolved[item.key]);
    }
  });

  test("window width changes reject old measurements including late events", () => {
    const items = itemsFor("ko");
    for (const [before, after] of [[480, 360], [360, 480]]) {
      let measured: NavSlotMeasurements = {};
      for (const key of keys) measured = recordNavSlotWidth(measured, key, 40, before);
      expect(navSlotWidths(items, measured, after, true)).toEqual(slots(after));
      measured = recordNavSlotWidth(measured, "capture", slotFor(after), after);
      expect(navSlotWidths(items, measured, after, true)).toEqual(slots(after));
      measured = recordNavSlotWidth(measured, "capture", 40, before);
      expect(navSlotWidths(items, measured, after, true)).toEqual(slots(after));
    }
  });

  test("window geometry handles button and plain bars without borrowing borders or gaps", () => {
    for (const width of [320, 360, 393, 411, 480, 1024]) for (const count of [1, 3, 5]) {
      const items = itemsFor("en").slice(0, count);
      const button = navSlotWidths(items, {}, width, true);
      const plain = navSlotWidths(items, {}, width, false);
      for (const item of items) {
        expect(button[item.key]).toBe((width - 8 - (count - 1) * 4) / count - 4);
        expect(plain[item.key]).toBe((width - 8) / count);
      }
    }
    expect(navSlotWidths([], {}, 411, true)).toEqual({});
  });

  test("Korean alone has a decision cap regardless of width or extra vertical space", () => {
    for (const width of [320, 360, 432, 480, 1024]) for (const density of [2, 2.625, 3, 3.5]) {
      for (const pressHeight of [52, 80, 120]) for (const locale of ["ko", "ko-KR"]) {
        const result = navLabelLayout(itemsFor("en"), slots(width), 4, density, "android", locale, { ...NAV_BAR_GEOMETRY, pressHeight });
        expect(result.scale).toBeLessThanOrEqual(1.6);
        if (width >= 432) expect(result.scale).toBe(1.6);
      }
    }
  });

  test("non-Korean grows beyond 1.6 up to horizontal fit when vertical space permits", () => {
    for (const locale of locales.filter(code => code !== "ko")) for (const platform of ["android", "ios"]) {
      const result = navLabelLayout(itemsFor(locale), slots(720), 4, 3.5, platform, locale, { ...NAV_BAR_GEOMETRY, pressHeight: 100 });
      expect(result.scale).toBeGreaterThan(1.6);
      const size = platform === "android" ? androidSize(result.fontSize, 3.5) : result.fontSize;
      for (const font of fonts) for (const item of itemsFor(locale)) {
        expect(font.width(item.label, size)).toBeLessThanOrEqual(slotFor(720) - 2 / 3.5);
      }
      const next = size + 1 / 3.5;
      expect(Math.max(...fonts.flatMap(font => itemsFor(locale).map(item => font.width(item.label, next)))))
        .toBeGreaterThan(slotFor(720) - 2 / 3.5);
    }
  });

  test("current vertical geometry limits non-Korean using rounded line boxes and an intact icon", () => {
    // Actual HEAD has s1=2, not 4: the vertical ceiling is slightly above 1.6.
    // These independent physical-pixel budgets also prove the next step cannot fit.
    for (const density of [2, 2.625, 3, 3.5]) for (const platform of ["android", "ios"]) {
      const result = layout(1024, "en", 4, density, platform);
      const budget = Math.floor((52 - 24 - 2) * density - 2) / density;
      const ceiling = platform === "android" ? Math.floor(budget / 15 * 10 * density) / density / 10 : budget / 15;
      expect(result.scale).toBeCloseTo(ceiling, 10);
      expect(result.scale).toBeGreaterThan(1.6);
      expect(result.indicatorHeight).toBeGreaterThanOrEqual(24);
      expect(Math.ceil(result.lineHeight * density) / density + 24 + 2 + 2 / density).toBeLessThanOrEqual(52);
      const nextScale = platform === "android" ? result.scale + 1 / (10 * density) : result.scale + 1e-4;
      expect(Math.ceil(15 * nextScale * density) / density + 24 + 2 + 2 / density).toBeGreaterThan(52);
    }
  });

  test("keeps the 1.0 floor and documents the pre-existing 320dp Indonesian overflow", () => {
    const result = layout(320, "id", 2);
    expect(result.scale).toBe(1);
    const overflow = fonts[1].width(itemsFor("id")[4].label, result.fontSize) - slotFor(320);
    expect(overflow).toBeCloseTo(6.4666666667);
    expect(slotFor(320)).toBeCloseTo(55.2);
  });

  test("honors the system below the cap and keeps the web at its existing size", () => {
    for (const system of [0.85, 1, 1.1, 1.3]) {
      expect(layout(411, "ko", system).scale).toBe(system);
      expect(layout(411, "ko", system).fontSize).toBe(10 * system);
    }
    for (const width of [320, 360, 393, 411]) for (const locale of locales) {
      for (const system of [1, 1.3, 1.6, 2]) {
        expect(layout(width, locale, system, 3.5, "web"))
          .toMatchObject({ scale: 1, fontSize: 10, lineHeight: 15, indicatorHeight: 32 });
      }
    }
    expect(layout(411, "ko", 2, 3, "ios")).toMatchObject({ cap: 1.6, scale: 1.6 });
    expect(layout(411, "ko", NaN, NaN).scale).toBe(1);
  });

  test("native labels consume one shared layout and preserve all tab semantics", () => {
    const source = read("src/components/m3/MdNavBar.tsx");
    expect(source).toContain('const { width: windowWidth, fontScale, scale: pixelRatio } = useWindowDimensions()');
    expect(source).toContain('const { i18n } = useTranslation()');
    expect(source).toContain('navSlotWidths(items, measurements, windowWidth, buttonLike)');
    expect(source).toContain('navLabelLayout(items, slotWidths, fontScale, pixelRatio, Platform.OS, renderedUiLanguage(i18n))');
    expect(source.indexOf("const labelLayout =")).toBeLessThan(source.indexOf("items.map"));
    expect(source).toContain("onLayout={web ? undefined : (event) => {");
    expect(source).toContain("const width = event.nativeEvent.layout.width;");
    expect(source).toContain("setMeasurements(previous => recordNavSlotWidth(previous, item.key, width, windowWidth));");
    expect(source).toContain("!web && { fontSize: labelLayout.fontSize, lineHeight: labelLayout.lineHeight }");
    expect(source).toContain("!web && { height: labelLayout.indicatorHeight }");
    expect(source).toContain("allowFontScaling={web}");
    expect(source).toContain("numberOfLines={1}");
    expect(source).toContain("{item.label}");
    expect(source).toContain('m3TextStyle("labelMedium")');
    expect(source).toContain('on && { fontFamily: chromeFaceFor("700") }');
    expect(source).toContain("accessibilityLabel={item.accessibilityLabel ?? item.label}");
    expect(source).toContain('accessibilityRole="tab"');
    expect(source).toContain("accessibilityState={{ selected: on }}");
    expect(source).toContain("aria-selected={on}");
    expect(source).toContain("onPress={() => onSelect(item.key)}");
    expect(source).not.toMatch(/opacity:|display:|adjustsFontSizeToFit|Dimensions\.get/);
    const screen = read("src/components/deep-space/DeepSpaceScreen.tsx");
    expect(screen).toContain('const TABS: DeepSpaceTab[] = ["home", "capture", "chat", "wiki", "settings"]');
    expect(screen).toContain('label: t("ds.dock." + key)');
    expect(screen).toContain('items={dockItems}');
    expect(screen.slice(screen.indexOf("if (embed)"), screen.indexOf("<SafeAreaView"))).not.toContain("MdNavBar");
  });

  test("source geometry keeps bar height, tab borders, spacing and fonts in sync with the proof", () => {
    const source = read("src/components/m3/MdNavBar.tsx");
    expect(source).toContain('press: { alignItems: "center", gap: NAV_BAR_GEOMETRY.gap, justifyContent: "center", minHeight: NAV_BAR_GEOMETRY.pressHeight }');
    expect(source).toContain('tab: { flex: 1, minHeight: NAV_BAR_GEOMETRY.pressHeight, justifyContent: "center" }');
    expect(source).toContain("paddingHorizontal: NAV_BAR_GEOMETRY.paddingHorizontal,");
    expect(source).toContain("paddingBottom: m3.spacing.s2 + bottomInset },");
    expect(source).toContain("gap: NAV_BAR_GEOMETRY.buttonGap,");
    expect(source).toContain("paddingTop: m3.spacing.s2,");
    for (const side of ["Top", "Left", "Bottom", "Right"]) {
      expect(source).toContain(`border${side}Width: NAV_BAR_GEOMETRY.buttonBorder,`);
    }
    expect(m3.spacing).toMatchObject({ s1: 2, s2: 4 });
    expect(source).toContain("borderTopWidth: 1,");
    expect(source).toContain('indicatorCenter: { width: 64, height: NAV_BAR_GEOMETRY.indicatorHeight }');
    expect(source).toMatch(/indicator: \{\s*width: 64,\s*height: NAV_BAR_GEOMETRY.indicatorHeight/);
    const shell = read("src/components/deep-space/DeepSpaceScreen.tsx");
    expect(shell).toContain('<TabIcon tab={key} color={color} size={24} />');
    expect(shell).toContain('edges={["top", "bottom"]}');
    expect(shell).toMatch(/buttonDock: \{\s*backgroundColor: m3.color.surfaceContainerHigh,\s*borderTopColor: m3.color.surfaceBright,\s*\}/);
    expect(shell).toContain('root: { flex: 1, backgroundColor: deepSpace.bgEdge }');
    expect(NAV_BAR_GEOMETRY).toEqual({ pressHeight: 52, iconSize: 24, gap: 2, indicatorHeight: 32, paddingHorizontal: 4, buttonGap: 4, buttonBorder: 2 });
    // Existing button bar: 52 touch + 4 tab borders + 8 padding + 1 bar border.
    expect(52 + 2 * m3.spacing.s1 + 2 * m3.spacing.s2 + 1).toBe(65);
  });
});
