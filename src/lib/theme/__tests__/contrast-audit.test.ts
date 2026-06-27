import { cosmic } from "../tokens";
import { contrastRatio } from "../contrast";

// WCAG 2.2 contrast audit of the dark (deep-space) design tokens. Two roles:
//   (1) a regression GUARD — primary/muted body text must keep clearing AA 4.5:1;
//   (2) it documents two FLAGGED borderline tokens (quietGray, lineDim) with their
//       exact ratios + the exception rationale, for the palette design review
//       (DESIGN.md is Simon's call — this audit does not change any token).

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
