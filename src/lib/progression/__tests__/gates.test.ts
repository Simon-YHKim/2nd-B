import { checkGate, FEATURE_UNLOCK_LEVEL } from "../gates";

describe("checkGate", () => {
  it("keeps the onboarding audit open from the start", () => {
    const g = checkGate("audit", 0);
    expect(g.unlocked).toBe(true);
    expect(g.currentLevel).toBe(1);
  });

  it("locks journal below Lv3 and unlocks it at 200 XP", () => {
    const locked = checkGate("journal", 199);
    expect(locked.unlocked).toBe(false);
    expect(locked.requiredLevel).toBe(3);

    const unlocked = checkGate("journal", 200);
    expect(unlocked.unlocked).toBe(true);
    expect(unlocked.currentLevel).toBe(3);
  });

  it("locks note below Lv3", () => {
    expect(checkGate("note", 100).unlocked).toBe(false);
    expect(checkGate("note", 200).unlocked).toBe(true);
  });

  it("locks self_context below Lv6 and unlocks it at 800 XP", () => {
    expect(checkGate("self_context", 799).unlocked).toBe(false);
    expect(checkGate("self_context", 800).unlocked).toBe(true);
    expect(FEATURE_UNLOCK_LEVEL.self_context).toBe(6);
  });

  it("locks rag_export below Lv8", () => {
    expect(checkGate("rag_export", 1599).unlocked).toBe(false);
    expect(checkGate("rag_export", 1600).unlocked).toBe(true);
  });
});
