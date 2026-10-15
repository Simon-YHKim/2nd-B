// Z84 (A-Z first-use check): on the wiki's "list | graph" and the capture screen's
// "plain | 5W1H" buttons, the chosen cell was only a shade lighter than the other and its text
// was dimmer, so it read as the one not chosen. Simon picked "fill the chosen cell with the
// bright blue" (2026-10-13, Q-261013-19). Measured on 8081 before: chosen rgb(35,46,74) with
// text rgb(212,218,230); not chosen transparent with text rgb(234,238,245).
// Source contract plus the colours' contrast: render tests are not available here.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { m3 } from "../../../lib/theme/m3";

const source = readFileSync(join(__dirname, "..", "SegBtn.tsx"), "utf8").split("\r\n").join("\n");

function luminance(hex: string): number {
  const value = hex.replace("#", "");
  const channel = (i: number) => {
    const c = parseInt(value.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrast(a: string, b: string): number {
  const high = Math.max(luminance(a), luminance(b));
  const low = Math.min(luminance(a), luminance(b));
  return (high + 0.05) / (low + 0.05);
}

describe("the chosen cell of a segmented button is the filled one", () => {
  it("fills the chosen cell with the primary blue and writes on it with its own ink", () => {
    expect(source).toContain("  segOn: { backgroundColor: m3.color.primary },");
    expect(source).toContain("let fg: string = on ? m3.color.onPrimary : m3.color.onSurfaceVariant;");
  });

  it("keeps the disabled group on the disabled tokens of the same pair", () => {
    expect(source).toContain("  segOnDisabled: { backgroundColor: m3.disabled.primary },");
    expect(source).toContain("fg = on ? m3.disabled.onPrimary : m3.disabled.onSurface;");
  });

  it("no longer paints the chosen cell with the near-background container", () => {
    expect(source).not.toContain("segOn: { backgroundColor: m3.color.secondaryContainer }");
    expect(source).not.toContain("m3.color.onSecondaryContainer");
  });

  it("leaves the in-app phone's own look alone: a white cell on the grey track", () => {
    expect(source).toContain('phone && { borderLeftWidth: 0, backgroundColor: on ? phoneIos.cell : "transparent" },');
  });

  // The chosen cell must stand out from the screen, and both texts must stay readable.
  it("keeps the chosen cell and both texts readable", () => {
    expect(contrast(m3.color.onPrimary, m3.color.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(m3.color.onSurfaceVariant, m3.color.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(m3.color.primary, m3.color.surface)).toBeGreaterThanOrEqual(3);
    // Before: the chosen cell against the screen was close to nothing.
    expect(contrast(m3.color.secondaryContainer, m3.color.surface)).toBeLessThan(1.5);
  });
});
