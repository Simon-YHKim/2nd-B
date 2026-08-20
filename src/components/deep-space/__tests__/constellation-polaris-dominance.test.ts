// Visual Tier dominance guard for the constellation home.
//
// CLAUDE.md standing rule: "Never make a domain star (layer A) look as large or
// bright as 북극성 (layer C)"; drilldown "tapped domain star = promoted near
// 북극성; others recede." Before this guard, tapping a domain grew it to the
// Polaris core (dotR 6k -> 9k == Polaris 9k) and PAST the Polaris halo
// (9k * 2.5 = 22.5k > 17k), inverting the hierarchy on a real, reachable tap.
//
// Render tests are blocked here (RN 0.85 + jest), so — exactly like
// constellation-canon-parity — this reads the renderer's radius coefficients out
// of the source. Every radius on the stage is `<coeff> * k` (k = the box scale,
// always > 0), so comparing the coefficients compares the on-screen radii at
// every screen width. Normalize CRLF first (core.autocrlf=true here).
//
// 2026-08-21: the stage moved from `<Circle r={n * k}>` to 4방향 pixel stars
// (PIXEL-CLAY 규칙 1). The radii are now NAMED CONSTANTS instead of numbers
// buried in JSX, so this reads the constants — which is both simpler and
// harder to defeat by reshuffling the markup. It also now checks the drawn
// span (pixelStarSpan), not just the requested radius: the star geometry
// rounds to integer rects, and two different radii CAN round to the same
// drawn star. A rounding collision would silently flatten the hierarchy.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { pixelStarSpan } from "../../pixel/pixel-star";

const SRC = readFileSync(
  join(__dirname, "..", "ConstellationHome.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

/** The value of a top-level `const NAME = <number>;` in the renderer. */
function coeff(name: string): number {
  const m = new RegExp(`^const ${name} = (\\d+(?:\\.\\d+)?);$`, "m").exec(SRC);
  expect(m).not.toBeNull();
  return Number(m![1]);
}

const polarisCore = coeff("POLARIS_CORE_R");
const polarisMid = coeff("POLARIS_MID_R");
const polarisHalo = coeff("POLARIS_HALO_R");

const domainCore = coeff("DOMAIN_CORE_R");
const focusMult = coeff("DOMAIN_FOCUS_MULT");
const haloRest = coeff("DOMAIN_HALO_MULT_REST");
const haloFocus = coeff("DOMAIN_HALO_MULT_FOCUS");

// On-screen coefficients (× k) for a domain star's core and its halo.
const focusedCore = domainCore * focusMult;
const restingCore = domainCore;
const focusedHalo = focusedCore * haloFocus;
const restingHalo = restingCore * haloRest;

// A phone-ish stage: boxW 340 -> k = 340/380. The drawn span matters because
// pixelStarRects rounds; comparing at a real k is the honest check.
const K = 340 / 380;
const drawn = (c: number) => pixelStarSpan(c * K);

describe("북극성 stays dominant over every domain star (Visual Tier)", () => {
  it("keeps even a FOCUSED domain core smaller than the Polaris core", () => {
    expect(focusedCore).toBeLessThan(polarisCore);
    expect(drawn(focusedCore)).toBeLessThan(drawn(polarisCore));
  });

  it("keeps even a FOCUSED domain halo smaller than the Polaris halo", () => {
    expect(focusedHalo).toBeLessThan(polarisHalo);
    expect(drawn(focusedHalo)).toBeLessThan(drawn(polarisHalo));
  });

  it("keeps every RESTING domain below Polaris as well", () => {
    expect(restingCore).toBeLessThan(polarisCore);
    expect(restingHalo).toBeLessThan(polarisHalo);
    expect(drawn(restingCore)).toBeLessThan(drawn(polarisCore));
    expect(drawn(restingHalo)).toBeLessThan(drawn(polarisHalo));
  });

  it("still promotes a tapped domain above its resting size (selection feedback)", () => {
    expect(focusedCore).toBeGreaterThan(restingCore);
    expect(focusedHalo).toBeGreaterThan(restingHalo);
    // Rounding must not eat the promotion — if both round to the same star,
    // tapping does nothing visible even though the numbers differ.
    expect(drawn(focusedCore)).toBeGreaterThan(drawn(restingCore));
    expect(drawn(focusedHalo)).toBeGreaterThan(drawn(restingHalo));
  });

  it("keeps the Polaris colour bands ordered outward (halo > mid > core)", () => {
    expect(polarisHalo).toBeGreaterThan(polarisMid);
    expect(polarisMid).toBeGreaterThan(polarisCore);
    // Bands that round together would collapse the 3-step banding into 1 step,
    // which is what replaced the old radial gradient.
    expect(drawn(polarisHalo)).toBeGreaterThan(drawn(polarisMid));
    expect(drawn(polarisMid)).toBeGreaterThan(drawn(polarisCore));
  });
});

describe("the constellation draws stars as rects, not circles (PIXEL-CLAY 규칙 1)", () => {
  // The 7 domain stars + 북극성 + the background twinkles all moved to rects.
  // The only <Circle> left on the stage is the neural-field bloom, which is
  // nebula, not a star. If someone re-adds a circular star this catches it.
  it("has no <Circle> left in the star layer", () => {
    const stage = SRC.slice(SRC.indexOf("const POLARIS_CORE_R"));
    expect(stage).not.toContain("<Circle");
  });

  it("renders both 북극성 and the domain stars through PixelStarSvg", () => {
    expect(SRC).toContain("<PixelStarSvg");
    expect(SRC).toContain("POLARIS_CORE_R * k");
    expect(SRC).toContain("DOMAIN_CORE_R * k");
  });
});
