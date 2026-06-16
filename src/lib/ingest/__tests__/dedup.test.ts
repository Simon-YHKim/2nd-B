import {
  NUM_HASHES,
  LSH_BANDS,
  normalizeForHash,
  contentHash,
  shingles,
  minhashSignature,
  estimateSimilarity,
  lshBandKeys,
  isNearDuplicate,
} from "../dedup";

describe("normalizeForHash", () => {
  it("collapses whitespace, lowercases, and trims", () => {
    expect(normalizeForHash("  Hello   World\n\tFoo  ")).toBe("hello world foo");
  });

  it("applies NFKC unicode normalization", () => {
    // Fullwidth 'Ａ' (U+FF21) → 'a' after NFKC + lowercase.
    expect(normalizeForHash("Ａ")).toBe("a");
  });
});

describe("contentHash (exact dedup / idempotency key)", () => {
  it("is stable for the same input across calls", () => {
    const t = "The quick brown fox jumps over the lazy dog.";
    expect(contentHash(t)).toBe(contentHash(t));
  });

  it("ignores cosmetic differences that normalizeForHash erases", () => {
    expect(contentHash("Hello   World")).toBe(contentHash("  hello world "));
  });

  it("differs for materially different text", () => {
    expect(contentHash("alpha beta gamma")).not.toBe(contentHash("alpha beta delta"));
  });

  it("emits a 16-char (64-bit) lowercase hex string", () => {
    expect(contentHash("anything at all")).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("shingles", () => {
  it("produces k-word shingles and de-duplicates them", () => {
    const s = shingles("a b c d", 3);
    expect(s).toEqual(new Set(["a b c", "b c d"]));
  });

  it("drops punctuation but keeps words", () => {
    const s = shingles("hello, world! foo", 2);
    expect(s).toEqual(new Set(["hello world", "world foo"]));
  });

  it("returns a single whole-text shingle when shorter than k", () => {
    expect(shingles("two words", 3)).toEqual(new Set(["two words"]));
  });

  it("returns an empty set for empty/whitespace input", () => {
    expect(shingles("   ").size).toBe(0);
  });
});

describe("minhashSignature", () => {
  it("has NUM_HASHES entries and is deterministic", () => {
    const sig = minhashSignature("the quick brown fox jumps");
    expect(sig).toHaveLength(NUM_HASHES);
    expect(sig).toEqual(minhashSignature("the quick brown fox jumps"));
  });

  it("estimates similarity 1.0 for identical text", () => {
    const t = "reflection and growth compound over time when captured daily";
    expect(estimateSimilarity(minhashSignature(t), minhashSignature(t))).toBe(1);
  });
});

describe("estimateSimilarity", () => {
  it("is high for near-duplicate reworded text", () => {
    const a = "the quick brown fox jumps over the lazy dog every morning";
    const b = "the quick brown fox jumps over the lazy dog each morning";
    expect(estimateSimilarity(minhashSignature(a), minhashSignature(b))).toBeGreaterThan(0.6);
  });

  it("is low for unrelated text", () => {
    const a = "supabase row level security policy for the sources table";
    const b = "a recipe for slow roasted tomatoes with garlic and basil";
    expect(estimateSimilarity(minhashSignature(a), minhashSignature(b))).toBeLessThan(0.3);
  });

  it("returns 0 for mismatched-length signatures", () => {
    expect(estimateSimilarity([1, 2, 3], [1, 2])).toBe(0);
  });
});

describe("lshBandKeys", () => {
  it("emits LSH_BANDS deterministic keys", () => {
    const sig = minhashSignature("personal context layer ingest gate dedup");
    const keys = lshBandKeys(sig);
    expect(keys).toHaveLength(LSH_BANDS);
    expect(keys).toEqual(lshBandKeys(sig));
  });

  it("shares at least one band key between near-duplicates", () => {
    const a = "the quick brown fox jumps over the lazy dog every single morning";
    const b = "the quick brown fox jumps over the lazy dog every single evening";
    const shared = lshBandKeys(minhashSignature(a)).filter((k) =>
      lshBandKeys(minhashSignature(b)).includes(k),
    );
    expect(shared.length).toBeGreaterThan(0);
  });
});

describe("isNearDuplicate", () => {
  it("flags a single-word re-clip of a longer passage at the default threshold", () => {
    const a = "I went to the store today to buy milk eggs bread and a dozen ripe bananas for the week";
    const b = "I went to the store today to buy milk eggs bread and a dozen ripe bananas this week";
    expect(isNearDuplicate(a, b)).toBe(true);
  });

  it("does not flag unrelated clippings", () => {
    expect(
      isNearDuplicate(
        "notes on attachment theory and adult relationships",
        "quarterly tax filing checklist for freelancers",
      ),
    ).toBe(false);
  });

  it("honors a lowered threshold for shorter, noisier clips", () => {
    const a = "captured insight about morning routines and energy levels through the day";
    const b = "captured insight about morning routines and energy levels throughout the day";
    // Default 0.8 is intentionally conservative (prefer a missed dedup over a
    // wrong drop); a tuned-down threshold still catches the rewording.
    expect(isNearDuplicate(a, b)).toBe(false);
    expect(isNearDuplicate(a, b, 0.4)).toBe(true);
  });
});
