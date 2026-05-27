// Coverage helpers + next-layer planner for the drill-down interview.
//
// nextProbe() itself depends on callGemini and stays out of these unit
// tests — we'd need to mock the LLM. The deterministic surface that
// drives drill behavior (coverage accounting + layer selection) is
// fully testable here, and that's what guards user experience: the LLM
// generates the *wording*, the planner controls the *path*.

import {
  emptyCoverage,
  incrementCoverage,
  totalTurns,
  cellsCovered,
  isPeriodComplete,
  nextLayerSuggestion,
  DRILL_LAYERS,
  LIFE_PERIODS,
  type Coverage,
} from "../probe";

describe("emptyCoverage", () => {
  test("returns a 5×5 zero matrix", () => {
    const c = emptyCoverage();
    expect(Object.keys(c).sort()).toEqual([...LIFE_PERIODS].sort());
    for (const p of LIFE_PERIODS) {
      expect(Object.keys(c[p]).sort()).toEqual([...DRILL_LAYERS].sort());
      for (const l of DRILL_LAYERS) {
        expect(c[p][l]).toBe(0);
      }
    }
  });

  test("returns a fresh object on each call (no aliasing)", () => {
    const a = emptyCoverage();
    const b = emptyCoverage();
    a.childhood.fact = 99;
    expect(b.childhood.fact).toBe(0);
  });
});

describe("incrementCoverage", () => {
  test("does not mutate the input", () => {
    const c = emptyCoverage();
    const next = incrementCoverage(c, "teens", "feeling");
    expect(c.teens.feeling).toBe(0);
    expect(next.teens.feeling).toBe(1);
  });

  test("accumulates across calls", () => {
    let c = emptyCoverage();
    c = incrementCoverage(c, "current", "echo");
    c = incrementCoverage(c, "current", "echo");
    c = incrementCoverage(c, "current", "echo");
    expect(c.current.echo).toBe(3);
  });
});

describe("totalTurns + cellsCovered", () => {
  test("counts every increment", () => {
    let c = emptyCoverage();
    c = incrementCoverage(c, "childhood", "fact");
    c = incrementCoverage(c, "childhood", "fact");
    c = incrementCoverage(c, "teens", "feeling");
    expect(totalTurns(c)).toBe(3);
    expect(cellsCovered(c)).toBe(2);
  });
});

describe("isPeriodComplete", () => {
  test("false when any layer is empty", () => {
    let c = emptyCoverage();
    c = incrementCoverage(c, "twenties", "fact");
    c = incrementCoverage(c, "twenties", "feeling");
    c = incrementCoverage(c, "twenties", "meaning");
    c = incrementCoverage(c, "twenties", "belief");
    // echo still 0 → not complete
    expect(isPeriodComplete(c, "twenties")).toBe(false);
  });

  test("true when all five layers have ≥1", () => {
    let c = emptyCoverage();
    for (const l of DRILL_LAYERS) c = incrementCoverage(c, "thirties", l);
    expect(isPeriodComplete(c, "thirties")).toBe(true);
  });

  test("scoped per period — completion in one doesn't leak to others", () => {
    let c = emptyCoverage();
    for (const l of DRILL_LAYERS) c = incrementCoverage(c, "childhood", l);
    expect(isPeriodComplete(c, "childhood")).toBe(true);
    expect(isPeriodComplete(c, "teens")).toBe(false);
  });
});

describe("nextLayerSuggestion — drill strategy", () => {
  test("empty coverage → starts at FACT (can't drill what isn't introduced)", () => {
    expect(nextLayerSuggestion(emptyCoverage(), "childhood")).toBe("fact");
  });

  test("after FACT, picks FEELING (next deepest empty layer)", () => {
    const c = incrementCoverage(emptyCoverage(), "childhood", "fact");
    expect(nextLayerSuggestion(c, "childhood")).toBe("feeling");
  });

  test("after FACT+FEELING, picks MEANING", () => {
    let c = emptyCoverage();
    c = incrementCoverage(c, "teens", "fact");
    c = incrementCoverage(c, "teens", "feeling");
    expect(nextLayerSuggestion(c, "teens")).toBe("meaning");
  });

  test("drills down to BELIEF then ECHO", () => {
    let c = emptyCoverage();
    c = incrementCoverage(c, "twenties", "fact");
    c = incrementCoverage(c, "twenties", "feeling");
    c = incrementCoverage(c, "twenties", "meaning");
    expect(nextLayerSuggestion(c, "twenties")).toBe("belief");

    c = incrementCoverage(c, "twenties", "belief");
    expect(nextLayerSuggestion(c, "twenties")).toBe("echo");
  });

  test("balance pass: once every layer is ≥1, returns the shallowest covered", () => {
    // All five at 1 except FACT at 3 — balance pass should drill back to
    // whatever has the lowest count (any of the four non-FACT).
    let c = emptyCoverage();
    for (const l of DRILL_LAYERS) c = incrementCoverage(c, "current", l);
    c = incrementCoverage(c, "current", "fact");
    c = incrementCoverage(c, "current", "fact");
    const layer = nextLayerSuggestion(c, "current");
    expect(layer).not.toBe("fact");
    expect((c.current[layer] ?? 0)).toBe(1);
  });

  test("period scoping: only counts coverage in the asked period", () => {
    // Childhood fully covered, but we ask about teens (empty) → FACT.
    let c = emptyCoverage();
    for (const l of DRILL_LAYERS) c = incrementCoverage(c, "childhood", l);
    expect(nextLayerSuggestion(c, "teens")).toBe("fact");
  });
});
