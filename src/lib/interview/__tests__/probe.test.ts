// Coverage helpers + next-layer planner for the drill-down interview.
//
// nextProbe() itself depends on callLlm and stays out of these unit
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
    a.infancy.fact = 99;
    expect(b.infancy.fact).toBe(0);
  });
});

describe("incrementCoverage", () => {
  test("does not mutate the input", () => {
    const c = emptyCoverage();
    const next = incrementCoverage(c, "school", "feeling");
    expect(c.school.feeling).toBe(0);
    expect(next.school.feeling).toBe(1);
  });

  test("accumulates across calls", () => {
    let c = emptyCoverage();
    c = incrementCoverage(c, "now", "echo");
    c = incrementCoverage(c, "now", "echo");
    c = incrementCoverage(c, "now", "echo");
    expect(c.now.echo).toBe(3);
  });
});

describe("totalTurns + cellsCovered", () => {
  test("counts every increment", () => {
    let c = emptyCoverage();
    c = incrementCoverage(c, "infancy", "fact");
    c = incrementCoverage(c, "infancy", "fact");
    c = incrementCoverage(c, "school", "feeling");
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
    for (const l of DRILL_LAYERS) c = incrementCoverage(c, "later", l);
    expect(isPeriodComplete(c, "later")).toBe(true);
  });

  test("scoped per period — completion in one doesn't leak to others", () => {
    let c = emptyCoverage();
    for (const l of DRILL_LAYERS) c = incrementCoverage(c, "infancy", l);
    expect(isPeriodComplete(c, "infancy")).toBe(true);
    expect(isPeriodComplete(c, "school")).toBe(false);
  });
});

describe("nextLayerSuggestion — drill strategy", () => {
  test("empty coverage → starts at FACT (can't drill what isn't introduced)", () => {
    expect(nextLayerSuggestion(emptyCoverage(), "infancy")).toBe("fact");
  });

  test("after FACT, picks FEELING (next deepest empty layer)", () => {
    const c = incrementCoverage(emptyCoverage(), "infancy", "fact");
    expect(nextLayerSuggestion(c, "infancy")).toBe("feeling");
  });

  test("after FACT+FEELING, picks MEANING", () => {
    let c = emptyCoverage();
    c = incrementCoverage(c, "school", "fact");
    c = incrementCoverage(c, "school", "feeling");
    expect(nextLayerSuggestion(c, "school")).toBe("meaning");
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
    for (const l of DRILL_LAYERS) c = incrementCoverage(c, "now", l);
    c = incrementCoverage(c, "now", "fact");
    c = incrementCoverage(c, "now", "fact");
    const layer = nextLayerSuggestion(c, "now");
    expect(layer).not.toBe("fact");
    expect((c.now[layer] ?? 0)).toBe(1);
  });

  test("period scoping: only counts coverage in the asked period", () => {
    // Childhood fully covered, but we ask about teens (empty) → FACT.
    let c = emptyCoverage();
    for (const l of DRILL_LAYERS) c = incrementCoverage(c, "infancy", l);
    expect(nextLayerSuggestion(c, "school")).toBe("fact");
  });
});
