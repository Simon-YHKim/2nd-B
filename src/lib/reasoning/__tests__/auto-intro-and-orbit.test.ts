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
    expect(reasoning).toContain("Easing.linear");
    expect(reasoning).toContain("styles.orbitRing");
  });

  test("the determinate percent bar is gated to the done phase", () => {
    const trackIndex = reasoning.indexOf("<View style={styles.progressTrack}>");
    expect(trackIndex).toBeGreaterThan(-1);
    const gateIndex = reasoning.lastIndexOf('phase === "done" ? (', trackIndex);
    expect(gateIndex).toBeGreaterThan(-1);
    expect(trackIndex - gateIndex).toBeLessThan(300);
  });
});
