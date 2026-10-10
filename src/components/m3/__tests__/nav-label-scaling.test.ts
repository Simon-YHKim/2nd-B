import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { m3 } from "@/lib/theme/m3";
import { NAV_LABEL_WIDTHS, navLabelLayout, recordNavSlotWidth } from "../nav-label-layout";
import { navLabelFont } from "./nav-label-font";

const read = (path: string) => readFileSync(path, "utf8");
const keys = ["home", "capture", "chat", "wiki", "settings"];
const locales = ["ko", "en", "es", "pt", "id"];
const fonts = ["Galmuri9", "Galmuri11Bold"].map(navLabelFont);
const itemsFor = (locale: string) => {
  const dock = JSON.parse(read(`locales/${locale}/home.json`)).ds.dock;
  return keys.map(key => ({ key, label: dock[key] as string }));
};
// Independent geometry of the existing button-like bar, pinned to source below.
const slotFor = (width: number) => (width - 2 * 4 - 4 * 4) / 5 - 2 * 2;
const slots = (width: number) => Object.fromEntries(keys.map(key => [key, slotFor(width)]));
const layout = (width: number, locale: string, system: number, density = 3.5, platform = "android") =>
  navLabelLayout(itemsFor(locale), slots(width), system, density, platform);
const androidSize = (size: number, density: number) => Math.ceil(size * density - 1e-8) / density;
const six = (value: number) => Number(value.toFixed(6));

describe("D5 dock labels: measured slots, current copy and one shared scale", () => {
  test("shipped labels and both font files regenerate the runtime width table", () => {
    const measured: Record<string, number> = {};
    for (const locale of locales) for (const { label } of itemsFor(locale)) {
      measured[label] = Math.ceil(Math.max(...fonts.map(font => font.width(label, 10))) * 1000) / 1000;
    }
    expect(NAV_LABEL_WIDTHS).toEqual(measured);
    // Copy stays in locales; even equal-width renames require revalidation.
    expect(createHash("sha256").update(JSON.stringify(
      locales.map(locale => itemsFor(locale).map(item => item.label)),
    )).digest("hex")).toBe("96db73ac92a46f7fce9c6f3949acaebad3701fdb8cebf422463b25ea5e79e522");
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
    expect(table).toEqual(expected);
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
    for (const density of [1, 2.625, 3.5, 4]) for (const width of [360, 393, 411]) {
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

  test("first paint and incomplete measurements stay visible at base scale until all slots arrive", () => {
    let measured = {};
    for (const key of keys) {
      expect(navLabelLayout(itemsFor("ko"), measured, 2, 3.5, "android").scale).toBe(1);
      measured = recordNavSlotWidth(measured, key, slotFor(411));
    }
    expect(navLabelLayout(itemsFor("ko"), measured, 2, 3.5, "android").scale).toBe(1.6);
    expect(navLabelLayout([{ key: "new", label: "Unmeasured label" }], { new: 80 }, 2, 3.5, "android").scale).toBe(1);
    expect(navLabelLayout([], {}, 2, 3.5, "android").scale).toBe(1);
  });

  test("layout events update their own slot without mutation or redundant renders", () => {
    const first = Object.freeze(slots(411));
    const resized = recordNavSlotWidth(first, "capture", 50);
    expect(resized).toEqual({ ...first, capture: 50 });
    expect(first.capture).toBe(73.4);
    expect(recordNavSlotWidth(resized, "capture", 50)).toBe(resized);
    for (const width of [0, -1, NaN, Infinity]) {
      const invalid = recordNavSlotWidth(first, "capture", width);
      expect(invalid.capture).toBe(0);
      expect(navLabelLayout(itemsFor("ko"), invalid, 2, 3.5, "android").scale).toBe(1);
    }
  });

  test("uses the narrowest actual slot and current language, also in a smaller host", () => {
    const measured = { ...slots(411), capture: slotFor(360) };
    const compact = navLabelLayout(itemsFor("ko"), measured, 2, 3.5, "android");
    expect(compact.scale).toBeCloseTo(1.542857);
    expect(compact).toEqual(layout(360, "ko", 2));
    expect(navLabelLayout(itemsFor("id"), measured, 2, 3.5, "android").scale).toBe(1);
    // Selection/order changes cannot change the common scale.
    expect(navLabelLayout(itemsFor("ko").reverse(), measured, 2, 3.5, "android")).toEqual(compact);
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
    expect(source).toContain('const { fontScale, scale: pixelRatio } = useWindowDimensions()');
    expect(source).toContain('navLabelLayout(items, slotWidths, fontScale, pixelRatio, Platform.OS)');
    expect(source.indexOf("const labelLayout =")).toBeLessThan(source.indexOf("items.map"));
    expect(source).toContain("onLayout={web ? undefined : (event) => {");
    expect(source).toContain("const width = event.nativeEvent.layout.width;");
    expect(source).toContain("setSlotWidths(previous => recordNavSlotWidth(previous, item.key, width));");
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
    expect(source).toContain('press: { alignItems: "center", gap: m3.spacing.s1, justifyContent: "center", minHeight: 52 }');
    expect(source).toContain('tab: { flex: 1, minHeight: 52, justifyContent: "center" }');
    expect(source).toContain("paddingHorizontal: m3.spacing.s2");
    expect(source).toContain("paddingBottom: m3.spacing.s2 + bottomInset");
    expect(source).toContain("gap: m3.spacing.s2");
    expect(source).toContain("paddingTop: m3.spacing.s2");
    for (const side of ["Top", "Left", "Bottom", "Right"]) {
      expect(source).toContain(`border${side}Width: m3.spacing.s1`);
    }
    expect(m3.spacing).toMatchObject({ s1: 2, s2: 4 });
    expect(source).toContain("borderTopWidth: 1");
    expect(source).toContain('indicatorCenter: { width: 64, height: 32 }');
    expect(read("src/components/deep-space/DeepSpaceScreen.tsx")).toContain("size={24}");
    // Existing button bar: 52 touch + 4 tab borders + 8 padding + 1 bar border.
    expect(52 + 2 * m3.spacing.s1 + 2 * m3.spacing.s2 + 1).toBe(65);
  });
});
