import { recordEmbeddingText } from "../records-embeddings";

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
