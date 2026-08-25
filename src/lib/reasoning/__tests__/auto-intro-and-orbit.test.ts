// Spec docs/reasoning-ux-spec_260718.html 잔여 두 건 (2026-07-18 handoff E):
//   화면 A 인터랙션 — "처음 ON: 소비 규칙을 설명하는 bottom sheet 확인 후 활성화"
//   화면 D 그래픽 — "세컨비 head와 일정 속도의 궤도 진행 링 하나" (퍼센트 과장 금지)
// Render tests are blocked on RN 0.85 + jest (see memory/render-tests), so the
// wiring is pinned structurally, the repo's established pattern.

import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../../..");
const reasoning = readFileSync(path.join(root, "src/app/reasoning.tsx"), "utf8");
const sheet = readFileSync(
  path.join(root, "src/components/deep-space/AutoReasoningIntroSheet.tsx"),
  "utf8",
);

describe("spec A — first-ON consumption-rules sheet", () => {
  test("the first enable routes through the intro sheet; OFF stays immediate", () => {
    expect(reasoning).toContain("getAutoIntroSeen");
    expect(reasoning).toContain("setAutoIntroVisible(true)");
    const offIndex = reasoning.indexOf("auto.setEnabled(false);");
    const introIndex = reasoning.indexOf("setAutoIntroVisible(true)");
    expect(offIndex).toBeGreaterThan(-1);
    expect(offIndex).toBeLessThan(introIndex);
  });

  test("confirm marks the intro seen AND enables the pref", () => {
    const confirmIndex = reasoning.indexOf("onConfirm={() => {");
    expect(confirmIndex).toBeGreaterThan(-1);
    const confirmBlock = reasoning.slice(confirmIndex, confirmIndex + 400);
    expect(confirmBlock).toContain("setAutoIntroSeen");
    expect(confirmBlock).toContain("auto.setEnabled(true)");
  });

  test("the sheet states the consumption rule in both locales (spec A 카피)", () => {
    expect(sheet).toContain("직접 실행할 1회는 항상 남겨 둬요");
    expect(sheet).toContain("always reserve one for manual use");
  });
});

describe("spec D — constant-speed orbit ring while running", () => {
  test("the ring spins at constant speed, never scaled to progress", () => {
    expect(reasoning).toContain("일정 속도의 궤도 진행 링");
    expect(reasoning).toContain("styles.orbitRing");
    // 링은 **진행률이 아니라 시간**으로 돈다. 그것을 지키는 방법은 두 가지다:
    //  (1) 이징이 등속이어야 한다 — 예전에는 Easing.linear 였고, PIXEL-CLAY 규칙 5
    //      (계단 이징만) 이후에는 pixelStepsFor(duration) 다. 둘 다 등속이고,
    //      뒤엣것은 칸으로 끊길 뿐 빨라지거나 느려지지 않는다.
    //  (2) toValue 가 진행률에서 오면 안 된다 — 상수 1 이어야 한다.
    // 리터럴 하나를 박으면 규칙이 움직일 때마다 이 검사가 거짓으로 깨진다.
    // 그래서 **불변식**을 본다.
    const orbitTiming = /Animated\.timing\(orbit, \{([^}]*)\}/.exec(reasoning);
    expect(orbitTiming).not.toBeNull();
    const args = orbitTiming![1];
    expect(args).toContain("toValue: 1");
    expect(args).toMatch(/easing: (pixelStepsFor\(|Easing\.linear)/);
    // ⚠ 'duration' 안에 'ratio' 가 들어 있다. 낱말 경계를 잡지 않으면 자기 자신에게 걸린다.
    expect(args).not.toMatch(/(progress|ratio|pct|percent)/i);
  });

  test("the determinate percent bar is gated to the done phase", () => {
    const trackIndex = reasoning.indexOf("<View style={styles.progressTrack}>");
    expect(trackIndex).toBeGreaterThan(-1);
    const gateIndex = reasoning.lastIndexOf('phase === "done" ? (', trackIndex);
    expect(gateIndex).toBeGreaterThan(-1);
    expect(trackIndex - gateIndex).toBeLessThan(300);
  });
});
