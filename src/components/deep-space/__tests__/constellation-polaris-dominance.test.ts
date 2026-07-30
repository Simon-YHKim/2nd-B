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
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(__dirname, "..", "ConstellationHome.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

/** The numeric coefficient `n` in an `r={n * k}` circle radius whose fill is
 *  `url(#<fill>)`. `#ds-polaris` will not match `#ds-polaris-glow` because the
 *  pattern pins the closing paren right after the id. */
function circleRadiusCoeff(fill: string): number {
  const re = new RegExp(`r=\\{(\\d+(?:\\.\\d+)?)\\s*\\*\\s*k\\}\\s*fill="url\\(#${fill}\\)"`);
  const m = re.exec(SRC);
  expect(m).not.toBeNull();
  return Number(m![1]);
}

// 북극성 (Polaris): r={9 * k} core, r={17 * k} halo.
const polarisCore = circleRadiusCoeff("ds-polaris");
const polarisHalo = circleRadiusCoeff("ds-polaris-glow");

// Domain star radius: `const dotR = 6 * k * (on ? <focus> : 1)` and the halo
// `r={dotR * (on ? <focusGlow> : <restGlow>)}` behind `url(#ds-star-glow)`.
const dotRm = /const dotR\s*=\s*(\d+(?:\.\d+)?)\s*\*\s*k\s*\*\s*\(on\s*\?\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\)/.exec(SRC);
expect(dotRm).not.toBeNull();
const dotBase = Number(dotRm![1]);
const focusCoreF = Number(dotRm![2]);
const restCoreF = Number(dotRm![3]);

const haloM = /r=\{dotR\s*\*\s*\(on\s*\?\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\)\}\s*fill="url\(#ds-star-glow\)"/.exec(SRC);
expect(haloM).not.toBeNull();
const focusGlowM = Number(haloM![1]);
const restGlowM = Number(haloM![2]);

// On-screen coefficients (× k) for a domain star's core dot and its halo.
const focusedCore = dotBase * focusCoreF;
const restingCore = dotBase * restCoreF;
const focusedHalo = focusedCore * focusGlowM;
const restingHalo = restingCore * restGlowM;

describe("북극성 stays dominant over every domain star (Visual Tier)", () => {
  it("keeps even a FOCUSED domain core smaller than the Polaris core", () => {
    expect(focusedCore).toBeLessThan(polarisCore);
  });

  it("keeps even a FOCUSED domain halo smaller than the Polaris halo", () => {
    expect(focusedHalo).toBeLessThan(polarisHalo);
  });

  it("keeps every RESTING domain below Polaris as well", () => {
    expect(restingCore).toBeLessThan(polarisCore);
    expect(restingHalo).toBeLessThan(polarisHalo);
  });

  it("still promotes a tapped domain above its resting size (selection feedback)", () => {
    expect(focusedCore).toBeGreaterThan(restingCore);
    expect(focusedHalo).toBeGreaterThan(restingHalo);
  });
});
