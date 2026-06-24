import fs from "node:fs";
import path from "node:path";

/**
 * Canon guard for the SecondB character head (design/2nd-Brain 화면설계.dc.html).
 *
 * The canon head is a flat PNG with a LIVE face layered over it: glowing cyan eyes
 * that blink + track the touch, and a mood-shaped mouth. There is NO floating orb
 * above the head (the canon has none — the green dot was an off-canon addition the
 * user asked to remove). Source-discipline idiom (no RN render mocks), same as the
 * sibling deep-space canon tests, so it stays robust across UI churn.
 */
const SRC = path.resolve(__dirname, "../../..");
const canonHead = fs.readFileSync(path.join(SRC, "components", "deepspace", "SecondbHead.tsx"), "utf8");
const hyphenHead = fs.readFileSync(path.join(SRC, "components", "deep-space", "SecondbHead.tsx"), "utf8");

describe("SecondB head canon", () => {
  test("renders a live face: eyes, blink, mouth", () => {
    expect(canonHead).toMatch(/styles\.eye/);
    expect(canonHead).toMatch(/styles\.mouth/);
    expect(canonHead).toMatch(/\bblink\b/);
    // Eyes blink via scaleY and track via translate toward the touch.
    expect(canonHead).toMatch(/scaleY:\s*blink/);
  });

  test("has per-mood expression shapes (eyes + mouth), not just one face", () => {
    // Eyes change shape by mood (squint / droop), mouth curves smile/flat/frown.
    expect(canonHead).toMatch(/EYE_BY_MOOD/);
    expect(canonHead).toMatch(/function mouthPath/);
    expect(canonHead).toMatch(/positive/);
    expect(canonHead).toMatch(/negative/);
  });

  test("reacts to user actions: subscribes to the expression emitter", () => {
    expect(canonHead).toMatch(/subscribeExpression/);
    // The reaction overrides the base mood (effMood), then reverts.
    expect(canonHead).toMatch(/effMood/);
  });

  test("has no floating mood orb above the head", () => {
    expect(canonHead).not.toMatch(/styles\.orb/);
    expect(canonHead).not.toMatch(/orbStyle|moodColor|MOOD_COLOR/);
  });

  test("uses deepSpace.* tokens for the face (no hex literals)", () => {
    expect(canonHead).toMatch(/deepSpace\.accent/);
    // No raw hex colour literals in the component body.
    expect(canonHead).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });

  test("the deep-space chrome head re-exports the single canon implementation", () => {
    expect(hyphenHead).toMatch(/export \{[^}]*SecondbHead[^}]*\} from "@\/components\/deepspace\/SecondbHead"/);
    // The chrome head must not keep its own orb implementation.
    expect(hyphenHead).not.toMatch(/styles\.orb/);
  });
});
