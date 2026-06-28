import { cosmic, semanticLight } from "../tokens";
import { contrastRatio } from "../contrast";

// WCAG 2.2 contrast audit of the design tokens in BOTH modes (dark deep-space +
// light), so the design system stays robust to any screen composition. Two roles:
//   (1) a regression GUARD — primary/muted/brand body text must keep clearing AA
//       4.5:1 in both modes;
//   (2) it documents the FLAGGED borderline tokens (dark quietGray + lineDim, light
//       textSubtle + border) with exact ratios + exception rationale, for the palette
//       design review (DESIGN.md is Simon's call — this audit changes no token).
// The pattern is consistent across modes: primary/muted/brand text passes comfortably
// (8–18:1); the dimmest "subtle" text is ~3.8–4.2:1 (large-text only) and the dim
// dividers are ~1.3–1.6:1 (decorative only).

describe("contrastRatio (WCAG formula correctness)", () => {
  test("black/white is the 21:1 maximum; identical colors are 1:1", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrastRatio(cosmic.space950, cosmic.space950)).toBeCloseTo(1, 5);
  });
});

describe("WCAG AA contrast audit — dark tokens", () => {
  const BG = cosmic.space950; // primary background
  const SURFACE = cosmic.space800;

  test("primary + muted text clear AA body contrast (4.5:1) on bg and surface [GUARD]", () => {
    expect(contrastRatio(cosmic.moonWhite, BG)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(cosmic.softWhite, BG)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(cosmic.mistGray, BG)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(cosmic.moonWhite, SURFACE)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(cosmic.mistGray, SURFACE)).toBeGreaterThanOrEqual(4.5);
  });

  // FLAGGED (design decision, NOT changed here): quietGray is the dimmest "subtle"
  // text. On bg it is ~3.99:1 — it clears AA only as LARGE text (>=18pt / 14pt bold,
  // where 3:1 applies), NOT as normal body text. Guard the large-text floor and pin
  // the known body-text shortfall so a future darkening is caught.
  test("quietGray subtle text clears 3:1 (large-text only), below 4.5:1 body [FLAGGED]", () => {
    const r = contrastRatio(cosmic.quietGray, BG);
    expect(r).toBeGreaterThanOrEqual(3);
    expect(r).toBeLessThan(4.5);
  });

  // FLAGGED: lineDim is the dim divider/border (~1.63:1 on bg) — below SC 1.4.11's
  // 3:1, so it is conformant ONLY if treated as a DECORATIVE divider (1.4.11 exempts
  // pure decoration / non-essential boundaries), never as an essential UI state
  // indicator. Flagged for the palette review.
  test("lineDim border is below 1.4.11 3:1 — valid only as a decorative divider [FLAGGED]", () => {
    expect(contrastRatio(cosmic.lineDim, BG)).toBeLessThan(3);
  });
});

describe("WCAG AA contrast audit — light tokens [both-mode robustness]", () => {
  const LBG = semanticLight.background;

  test("primary + muted + brand text clear AA body contrast (4.5:1) on the light bg [GUARD]", () => {
    expect(contrastRatio(semanticLight.text, LBG)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(semanticLight.textMuted, LBG)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(semanticLight.brand, LBG)).toBeGreaterThanOrEqual(4.5);
  });

  // FLAGGED: light textSubtle is ~4.18:1 — large-text only (3:1), not body. Mirrors
  // the dark quietGray case; same design call for the palette review.
  test("light textSubtle clears 3:1 (large-text only), below 4.5:1 body [FLAGGED]", () => {
    const r = contrastRatio(semanticLight.textSubtle, LBG);
    expect(r).toBeGreaterThanOrEqual(3);
    expect(r).toBeLessThan(4.5);
  });

  // FLAGGED: light border is ~1.28:1 — decorative divider only (SC 1.4.11 exempts
  // pure decoration). Mirrors the dark lineDim case.
  test("light border is below 1.4.11 3:1 — decorative divider only [FLAGGED]", () => {
    expect(contrastRatio(semanticLight.border, LBG)).toBeLessThan(3);
  });
});
