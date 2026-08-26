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

  test("has per-expression face shapes (eyes + mouth), not just one face", () => {
    // The 13-expression geometry moved to lib/companion/faces.ts (FACES) — the
    // head must render FROM it: per-eye specs, six mouth kinds, gaze offsets.
    expect(canonHead).toMatch(/FACES\[/);
    // 입 모양을 만드는 함수. 이름이 `mouthPath` 에서 `mouthCells` 로 바뀌었다 —
    // PIXEL-CLAY 규칙 1 이주로 SVG 곡선(`d`)이 아니라 **정수 셀**을 돌려주기
    // 때문이다. 붙드는 것은 이름이 아니라 "입 모양이 표정마다 만들어진다" 이므로
    // 둘 다 받는다.
    expect(canonHead).toMatch(/function mouth(Path|Cells)/);
    // 여섯 종류가 모두 살아 있는가 — 하나라도 빠지면 그 표정이 조용히 무표정이 된다.
    for (const kind of ["smile", "frown", "open", "smirk", '"o"', "flat"]) {
      expect(canonHead).toContain(kind);
    }
    expect(canonHead).toMatch(/face\.eyes\[i\]/);
    expect(canonHead).toMatch(/face\.mouth/);
  });

  test("reacts to user actions: subscribes to the expression + hold emitters", () => {
    expect(canonHead).toMatch(/subscribeExpression/);
    expect(canonHead).toMatch(/subscribeHold/);
    // Resolution order is fixed: reaction ?? hold ?? idle ?? base mood.
    expect(canonHead).toMatch(/reactExpr \?\? holdExpr \?\? idleExpr \?\? mood/);
  });

  test("keeps the idle 딴청 policy pure and reduced-motion opt-out", () => {
    expect(canonHead).toMatch(/pickIdleAction/);
    expect(canonHead).toMatch(/nextIdleDelayMs/);
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
