import { checkGate, FEATURE_UNLOCK_LEVEL } from "../gates";

describe("checkGate — level entry restrictions removed (2026-06-02)", () => {
  it("keeps the onboarding audit open from the start", () => {
    const g = checkGate("audit", 0);
    expect(g.unlocked).toBe(true);
    expect(g.currentLevel).toBe(1);
  });

  it("unlocks every gated feature from 0 XP — no progression-level barrier", () => {
    for (const feature of Object.keys(FEATURE_UNLOCK_LEVEL) as (keyof typeof FEATURE_UNLOCK_LEVEL)[]) {
      expect(checkGate(feature, 0).unlocked).toBe(true);
    }
  });

  it("every feature now requires only Lv1 (gating moved to subscription/usage)", () => {
    for (const lvl of Object.values(FEATURE_UNLOCK_LEVEL)) {
      expect(lvl).toBe(1);
    }
  });

  it("journal / note / self_context / rag_export are reachable regardless of XP", () => {
    expect(checkGate("journal", 0).unlocked).toBe(true);
    expect(checkGate("note", 0).unlocked).toBe(true);
    expect(checkGate("self_context", 0).unlocked).toBe(true);
    expect(checkGate("rag_export", 0).unlocked).toBe(true);
  });
});
