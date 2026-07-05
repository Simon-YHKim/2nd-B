import { recordEmbeddingText, recordsEmbeddingAllowed } from "../records-embeddings";

describe("recordsEmbeddingAllowed (D5 consent gate)", () => {
  test("adult who opted in → true", () => {
    expect(recordsEmbeddingAllowed(false, true)).toBe(true);
  });
  test("adult who did NOT opt in → false (privacy-by-design default)", () => {
    expect(recordsEmbeddingAllowed(false, false)).toBe(false);
    expect(recordsEmbeddingAllowed(false, null)).toBe(false);
    expect(recordsEmbeddingAllowed(false, undefined)).toBe(false);
  });
  test("minor is hard-blocked even if the pref is somehow true", () => {
    expect(recordsEmbeddingAllowed(true, true)).toBe(false);
  });
  test("unknown minor status is treated as adult (real minors are server-locked OFF)", () => {
    expect(recordsEmbeddingAllowed(null, true)).toBe(true);
    expect(recordsEmbeddingAllowed(undefined, true)).toBe(true);
    expect(recordsEmbeddingAllowed(null, false)).toBe(false);
  });
});

describe("recordEmbeddingText", () => {
  test("joins topic + summary + body with blank lines", () => {
    expect(recordEmbeddingText({ topic: "T", summary: "S", body: "B" })).toBe("T\n\nS\n\nB");
  });

  test("drops null and blank-only fields, keeping order", () => {
    expect(recordEmbeddingText({ topic: null, summary: "", body: "B" })).toBe("B");
    expect(recordEmbeddingText({ topic: "T", summary: null, body: "B" })).toBe("T\n\nB");
  });

  test("caps at the max length", () => {
    const long = "x".repeat(3000);
    expect(recordEmbeddingText({ topic: null, summary: null, body: long }, 2000)).toHaveLength(2000);
  });

  test("returns empty string when there is no usable text", () => {
    expect(recordEmbeddingText({ topic: null, summary: "   ", body: "" })).toBe("");
  });
});
