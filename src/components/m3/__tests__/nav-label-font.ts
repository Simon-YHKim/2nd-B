import { readFileSync } from "node:fs";

/** Read the shipped TrueType metrics without loading React Native or a renderer. */
export function navLabelFont(face: string) {
  const font = readFileSync(`assets/fonts/${face}-subset.ttf`);
  const tables: Record<string, number> = {};
  for (let i = 0; i < font.readUInt16BE(4); i += 1) {
    const offset = 12 + i * 16;
    tables[font.toString("latin1", offset, offset + 4)] = font.readUInt32BE(offset + 8);
  }
  const units = font.readUInt16BE(tables.head + 18);
  const metrics = font.readUInt16BE(tables.hhea + 34);
  function glyphOf(cp: number): number {
    const base = tables.cmap;
    for (let i = 0; i < font.readUInt16BE(base + 2); i += 1) {
      const sub = base + font.readUInt32BE(base + 8 + i * 8);
      const format = font.readUInt16BE(sub);
      if (format === 12) {
        for (let g = 0; g < font.readUInt32BE(sub + 12); g += 1) {
          const offset = sub + 16 + g * 12;
          const first = font.readUInt32BE(offset);
          if (cp >= first && cp <= font.readUInt32BE(offset + 4)) {
            return font.readUInt32BE(offset + 8) + cp - first;
          }
        }
      } else if (format === 4 && cp <= 0xffff) {
        const segX2 = font.readUInt16BE(sub + 6);
        const ends = sub + 14;
        const starts = ends + segX2 + 2;
        const deltas = starts + segX2;
        const ranges = deltas + segX2;
        for (let s = 0; s < segX2 / 2; s += 1) {
          if (cp > font.readUInt16BE(ends + 2 * s)) continue;
          const first = font.readUInt16BE(starts + 2 * s);
          if (cp < first) break;
          const delta = font.readInt16BE(deltas + 2 * s);
          const range = font.readUInt16BE(ranges + 2 * s);
          if (range === 0) return (cp + delta) & 0xffff;
          const glyph = font.readUInt16BE(ranges + 2 * s + range + 2 * (cp - first));
          return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
        }
      }
    }
    throw new Error(`Missing glyph: ${face} U+${cp.toString(16)}`);
  }
  return {
    font,
    // Font ascent/descent metrics used for the default Android font padding.
    height: Math.max(
      font.readInt16BE(tables.hhea + 4) - font.readInt16BE(tables.hhea + 6),
      font.readUInt16BE(tables["OS/2"] + 74) + font.readUInt16BE(tables["OS/2"] + 76),
    ) / units,
    bounds(char: string) {
      const glyph = glyphOf(char.codePointAt(0)!);
      const longOffsets = font.readInt16BE(tables.head + 50) === 1;
      const offset = tables.glyf + (longOffsets
        ? font.readUInt32BE(tables.loca + glyph * 4)
        : font.readUInt16BE(tables.loca + glyph * 2) * 2);
      return {
        left: font.readInt16BE(offset + 2) / units,
        bottom: font.readInt16BE(offset + 4) / units,
        right: font.readInt16BE(offset + 6) / units,
        top: font.readInt16BE(offset + 8) / units,
      };
    },
    width(text: string, size: number) {
      let advance = 0;
      for (const char of text) {
        const glyph = glyphOf(char.codePointAt(0)!);
        if (!glyph) throw new Error(`Missing glyph: ${face} ${char}`);
        advance += font.readUInt16BE(tables.hmtx + 4 * Math.min(glyph, metrics - 1));
      }
      return advance / units * size;
    },
  };
}
