import { readFileSync } from "node:fs";
import { m3 } from "@/lib/theme/m3";

// Read the shipped font advances, including accented Latin and Hangul glyphs.
function widthsFor(face: string) {
  const FONT = readFileSync(`assets/fonts/${face}-subset.ttf`);
const TABLES: Record<string, number> = {};
for (let i = 0; i < FONT.readUInt16BE(4); i += 1) {
  const o = 12 + i * 16;
  TABLES[FONT.toString("latin1", o, o + 4)] = FONT.readUInt32BE(o + 8);
}
const UNITS_PER_EM = FONT.readUInt16BE(TABLES.head + 18);
const H_METRICS = FONT.readUInt16BE(TABLES.hhea + 34);

function glyphOf(cp: number): number {
  const base = TABLES.cmap;
  for (let i = 0; i < FONT.readUInt16BE(base + 2); i += 1) {
    const sub = base + FONT.readUInt32BE(base + 4 + i * 8 + 4);
    const format = FONT.readUInt16BE(sub);
    if (format === 12) {
      for (let g = 0; g < FONT.readUInt32BE(sub + 12); g += 1) {
        const o = sub + 16 + g * 12;
        if (cp >= FONT.readUInt32BE(o) && cp <= FONT.readUInt32BE(o + 4)) {
          return FONT.readUInt32BE(o + 8) + (cp - FONT.readUInt32BE(o));
        }
      }
    } else if (format === 4 && cp <= 0xffff) {
      const segX2 = FONT.readUInt16BE(sub + 6);
      const ends = sub + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const ranges = deltas + segX2;
      for (let s = 0; s < segX2 / 2; s += 1) {
        if (cp > FONT.readUInt16BE(ends + 2 * s)) continue;
        const first = FONT.readUInt16BE(starts + 2 * s);
        if (cp < first) break;
        const delta = FONT.readInt16BE(deltas + 2 * s);
        const range = FONT.readUInt16BE(ranges + 2 * s);
        if (range === 0) return (cp + delta) & 0xffff;
        const g = FONT.readUInt16BE(ranges + 2 * s + range + 2 * (cp - first));
        return g === 0 ? 0 : (g + delta) & 0xffff;
      }
    }
  }
  return 0;
}


  return (text: string) => [...text].reduce((width, char) => {
    const glyph = glyphOf(char.codePointAt(0)!);
    if (!glyph) throw new Error(`Missing glyph: ${face} ${char}`);
    return width + FONT.readUInt16BE(TABLES.hmtx + 4 * Math.min(glyph, H_METRICS - 1)) / UNITS_PER_EM;
  }, 0) * m3.type.labelMedium.size;
}

const read = (path: string) => readFileSync(path, "utf8");
const source = read("src/components/m3/MdNavBar.tsx");
const cap = Number(source.match(/const TAB_LABEL_MAX_FONT_SIZE_MULTIPLIER = ([\d.]+);/)?.[1]);
const keys = ["home", "capture", "chat", "wiki", "settings"];
const available = (360 - 2 * m3.spacing.s2 - 4 * m3.spacing.s2) / 5 - 2 * m3.spacing.s1;
const widths = ["en", "ko", "es", "pt", "id"].flatMap(locale => {
  const labels = JSON.parse(read(`locales/${locale}/home.json`)).ds.dock;
  return ["Galmuri9", "Galmuri11Bold"].flatMap(face => {
    const measure = widthsFor(face);
    return keys.map(key => ({ locale, face, text: labels[key] as string, width: measure(labels[key]) }));
  });
});

describe("D5 five-tab font scaling at 360dp", () => {
  test("caps only the label and preserves the complete spoken name", () => {
    expect(source).toContain("maxFontSizeMultiplier={TAB_LABEL_MAX_FONT_SIZE_MULTIPLIER}");
    expect(source).toContain("accessibilityLabel={item.accessibilityLabel ?? item.label}");
    expect(source).toContain('m3TextStyle("labelMedium")');
    expect(source).toContain('chromeFaceFor("700")');
    expect(source).toContain("gap: m3.spacing.s2");
    expect(source).toContain("paddingHorizontal: m3.spacing.s2");
    expect(source).toContain("borderLeftWidth: m3.spacing.s1");
    expect(source).toContain("borderRightWidth: m3.spacing.s1");
    expect(m3.type.labelMedium).toMatchObject({ size: 10, tracking: 0 });
    expect(m3.font.brand).toBe("Galmuri11");
    expect(read("src/components/deep-space/DeepSpaceScreen.tsx")).toContain(
      'const TABS: DeepSpaceTab[] = ["home", "capture", "chat", "wiki", "settings"]',
    );
  });

  test.each(widths)("$locale $face $text fits even at system scale 2", ({ width }) => {
    expect(width * Math.min(2, cap)).toBeLessThanOrEqual(available);
  });

  test("uses the largest fitting hundredth across both faces and all locales", () => {
    const widest = Math.max(...widths.map(row => row.width));
    expect(available).toBeCloseTo(63.2);
    expect(widest).toBeCloseTo(61.6666666667);
    expect(cap).toBe(Math.floor(available / widest * 100) / 100);
    expect(widest * (cap + 0.01)).toBeGreaterThan(available);
  });
});
