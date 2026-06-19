import {
  cosineSimilarity,
  pageEmbeddingText,
  rankBySimilarity,
} from "../embeddings";

describe("cosineSimilarity", () => {
  test("identical vectors → 1, orthogonal → 0, opposite → -1", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  test("magnitude-invariant", () => {
    expect(cosineSimilarity([2, 0], [5, 0])).toBeCloseTo(1);
  });

  test("guards empty / mismatched / zero vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1], [1, 2])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("rankBySimilarity", () => {
  test("orders candidates by similarity to the query, best first", () => {
    const query = [1, 0];
    const ranked = rankBySimilarity(
      query,
      [
        { id: "ortho", embedding: [0, 1] },
        { id: "same", embedding: [1, 0] },
        { id: "near", embedding: [0.9, 0.1] },
      ],
      2,
    );
    expect(ranked.map((r) => r.id)).toEqual(["same", "near"]);
    expect(ranked[0].score).toBeCloseTo(1);
  });
});

describe("pageEmbeddingText", () => {
  test("joins title + body and caps length", () => {
    expect(pageEmbeddingText({ title: "Carl Jung", body_md: "shadow self" })).toBe("Carl Jung\n\nshadow self");
    expect(pageEmbeddingText({ title: "T", body_md: "x".repeat(5000) }, 100).length).toBe(100);
  });
});
