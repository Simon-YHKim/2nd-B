import { shouldStopDrilling, drillStopReason, DEFAULT_DRILL_TARGET } from "../drill-stop";

describe("interview drill stop rule", () => {
  test("default target is L4 (교차검증)", () => {
    expect(DEFAULT_DRILL_TARGET).toBe(4);
  });

  test("stops once the axis reaches the target level", () => {
    expect(shouldStopDrilling({ currentLevel: 4 })).toBe(true);
    expect(drillStopReason({ currentLevel: 4 })).toBe("target_reached");
    expect(shouldStopDrilling({ currentLevel: 5 })).toBe(true);
  });

  test("keeps probing below target when no cap is hit", () => {
    expect(shouldStopDrilling({ currentLevel: 2 })).toBe(false);
    expect(drillStopReason({ currentLevel: 3, turnsSpent: 10, hardTurnCap: 50 })).toBe("continue");
  });

  test("a custom lower target lets self-only axes stop at L3 (D6)", () => {
    // When peer (별3) is unavailable, the self-only path caps at L3.
    expect(shouldStopDrilling({ currentLevel: 3, targetLevel: 3 })).toBe(true);
    expect(drillStopReason({ currentLevel: 3, targetLevel: 3 })).toBe("target_reached");
  });

  test("hard turn cap is a safety net for a never-converging axis", () => {
    expect(shouldStopDrilling({ currentLevel: 2, turnsSpent: 50, hardTurnCap: 50 })).toBe(true);
    expect(drillStopReason({ currentLevel: 2, turnsSpent: 50, hardTurnCap: 50 })).toBe("hard_cap");
    expect(shouldStopDrilling({ currentLevel: 2, turnsSpent: 49, hardTurnCap: 50 })).toBe(false);
  });
});
