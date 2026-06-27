// WCAG 2.x contrast utilities (SC 1.4.3 text 4.5:1 normal / 3:1 large; SC 1.4.11
// non-text/UI 3:1). Pure; implements the WCAG relative-luminance and contrast-ratio
// formulas exactly. Used by the contrast-audit test to guard the design tokens
// against regressions that would drop text below AA (research 2026-06-28:
// accessibility thresholds are self-implementable; RN supplies none).

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of a #RRGGBB hex color (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two #RRGGBB hex colors (1:1 .. 21:1). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
