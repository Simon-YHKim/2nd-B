// Tests cover the parser + the readPhase1 type guard. The orchestrator
// itself is a thin compose over getSource + downloadRawClipping +
// callGemini + UPDATE; integration tests live with PR 4/5 against a real
// DB, since unit-testing the chain doesn't validate the SQL contract.

import { readPhase1 } from "../phase1";

describe("readPhase1", () => {
  const valid = {
    summary: "abc",
    entities: ["A"],
    concepts: ["B"],
    questions: ["Q1", "Q2", "Q3", "Q4"],
    generated_at: "2026-05-25T00:00:00Z",
    model: "gemini-2.5-flash",
  };

  test("accepts a well-formed __phase1__ block", () => {
    const r = readPhase1({ __phase1__: valid });
    expect(r).toEqual(valid);
  });

  test("returns null when key missing", () => {
    expect(readPhase1({})).toBeNull();
  });

  test("returns null when __phase1__ is not an object", () => {
    expect(readPhase1({ __phase1__: "stringy" })).toBeNull();
    expect(readPhase1({ __phase1__: null })).toBeNull();
    expect(readPhase1({ __phase1__: 42 })).toBeNull();
  });

  test("returns null when required fields are missing", () => {
    expect(readPhase1({ __phase1__: { summary: "x" } })).toBeNull();
    expect(readPhase1({ __phase1__: { ...valid, summary: 123 } })).toBeNull();
    expect(readPhase1({ __phase1__: { ...valid, questions: "not array" } })).toBeNull();
  });

  test("preserves field types verbatim", () => {
    const r = readPhase1({ __phase1__: valid });
    expect(r?.summary).toBe("abc");
    expect(r?.entities).toEqual(["A"]);
    expect(r?.questions).toHaveLength(4);
  });
});
