// Pure deduplication primitives for the §1 ingest gate.
//
// Two layers, no DB / LLM / async dependencies (RN + node test safe):
//   1. Exact dedup    — `contentHash()` over post-scrub normalized text. This
//      is the idempotency key (C2): re-dumping the same clipping yields the
//      same hash, so the gate (PR `gate.ts`) short-circuits before any Gemini
//      call. Non-cryptographic by design — collisions are acceptable at
//      personal-corpus scale and the cost of a false dedup is one dropped
//      duplicate, not a security boundary (mirrors the djb2 note in gemini.ts).
//   2. Near-duplicate — MinHash signatures + LSH banding estimate Jaccard
//      similarity over word shingles so trivially-reworded re-clips collapse
//      onto the survivor before the embedding pass runs.
//
// Determinism is load-bearing: the same text MUST produce the same hash,
// signature, and band keys across runs and devices, otherwise idempotency and
// cross-run LSH bucketing break. All hash seeds are fixed constants below.

/** k-shingle width (words per shingle) for near-duplicate detection. */
export const SHINGLE_K = 3;
/** Number of MinHash permutations per signature. */
export const NUM_HASHES = 64;
/** LSH bands; rows-per-band = NUM_HASHES / LSH_BANDS. Must divide NUM_HASHES. */
export const LSH_BANDS = 16;
/** Default estimated-Jaccard threshold at/above which two docs are near-dups. */
export const NEAR_DUPLICATE_THRESHOLD = 0.8;

// 2^31 - 1, a Mersenne prime — the modulus for the MinHash permutation family.
const MERSENNE_PRIME = 2147483647;

/**
 * Canonicalize text before exact hashing so cosmetic differences (casing,
 * whitespace runs, unicode form, surrounding space) don't defeat dedup.
 * This is the "post-scrub normalized text" the idempotency key hashes.
 */
export function normalizeForHash(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// djb2 — one of the two independent 32-bit rolls combined into contentHash.
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

// sdbm — second independent roll; combining two 32-bit hashes into a 64-bit
// hex string drops collision probability far below a single djb2.
function sdbm(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (s.charCodeAt(i) + (h << 6) + (h << 16) - h) | 0;
  return h >>> 0;
}

function toHex8(n: number): string {
  return (n >>> 0).toString(16).padStart(8, "0");
}

/**
 * Exact-dedup idempotency key: a 64-bit (16 hex char) hash of the normalized
 * text. Stable across runs/devices. Equal inputs (after normalization) → equal
 * hashes; the gate treats a repeat hash as an already-ingested clipping.
 */
export function contentHash(text: string): string {
  const norm = normalizeForHash(text);
  return toHex8(djb2(norm)) + toHex8(sdbm(norm));
}

/**
 * Word-level k-shingles as a de-duplicated set. Punctuation is dropped and
 * whitespace collapsed so shingles reflect content, not formatting. Texts with
 * fewer than k words yield a single whole-text shingle so short clips still
 * compare meaningfully.
 */
export function shingles(text: string, k: number = SHINGLE_K): Set<string> {
  const words = normalizeForHash(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
  const out = new Set<string>();
  if (words.length === 0) return out;
  if (words.length < k) {
    out.add(words.join(" "));
    return out;
  }
  for (let i = 0; i + k <= words.length; i++) {
    out.add(words.slice(i, i + k).join(" "));
  }
  return out;
}

// (a*b) % m without exceeding 2^53, for a, b in [0, m) and m < 2^31.
// 16-bit split keeps every intermediate product within safe-integer range.
function mulmod(a: number, b: number, m: number): number {
  const ah = Math.floor(a / 0x10000);
  const al = a % 0x10000;
  const high = ((ah * b) % m) * 0x10000 % m;
  return (high + al * b) % m;
}

// Deterministic permutation coefficients (a in [1, P), b in [0, P)), generated
// once from a fixed seed via a mulberry32 PRNG so signatures are reproducible.
const COEFFS: { a: number; b: number }[] = (() => {
  let seed = 0x9e3779b9;
  const next = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out: { a: number; b: number }[] = [];
  for (let i = 0; i < NUM_HASHES; i++) {
    out.push({
      a: 1 + Math.floor(next() * (MERSENNE_PRIME - 1)),
      b: Math.floor(next() * MERSENNE_PRIME),
    });
  }
  return out;
})();

/**
 * MinHash signature: for each of NUM_HASHES permutations, the minimum permuted
 * shingle hash. Estimated Jaccard similarity of two texts ≈ the fraction of
 * signature positions that match. Empty text → an all-max sentinel signature
 * (similarity 1.0 against another empty text, ~0 against any non-empty one).
 */
export function minhashSignature(text: string): number[] {
  const sig = new Array<number>(NUM_HASHES).fill(MERSENNE_PRIME);
  const sh = shingles(text);
  if (sh.size === 0) return sig;
  for (const shingle of sh) {
    const base = djb2(shingle) % MERSENNE_PRIME;
    for (let i = 0; i < NUM_HASHES; i++) {
      const { a, b } = COEFFS[i];
      const v = (mulmod(a, base, MERSENNE_PRIME) + b) % MERSENNE_PRIME;
      if (v < sig[i]) sig[i] = v;
    }
  }
  return sig;
}

/**
 * Estimated Jaccard similarity in [0, 1] from two MinHash signatures: the
 * fraction of positions that agree. Signatures must be the same length.
 */
export function estimateSimilarity(sigA: number[], sigB: number[]): number {
  if (sigA.length !== sigB.length || sigA.length === 0) return 0;
  let matches = 0;
  for (let i = 0; i < sigA.length; i++) if (sigA[i] === sigB[i]) matches++;
  return matches / sigA.length;
}

/**
 * LSH band keys for bucketing candidates: split the signature into LSH_BANDS
 * contiguous bands and hash each (with the band index folded in so identical
 * band values in different positions don't collide). Two documents sharing any
 * band key are near-duplicate candidates — the orchestrator (`gate.ts`) only
 * needs to compare signatures within a shared bucket, not pairwise across all.
 */
export function lshBandKeys(signature: number[]): string[] {
  const rows = Math.floor(signature.length / LSH_BANDS);
  const keys: string[] = [];
  for (let band = 0; band < LSH_BANDS; band++) {
    const start = band * rows;
    const slice = signature.slice(start, start + rows).join(",");
    keys.push(`${band}:${toHex8(djb2(slice))}`);
  }
  return keys;
}

/**
 * Convenience predicate: are two texts near-duplicates at/above `threshold`
 * estimated Jaccard similarity? For bulk comparison, precompute signatures with
 * `minhashSignature` and bucket with `lshBandKeys` instead of calling this
 * pairwise.
 */
export function isNearDuplicate(
  a: string,
  b: string,
  threshold: number = NEAR_DUPLICATE_THRESHOLD,
): boolean {
  return estimateSimilarity(minhashSignature(a), minhashSignature(b)) >= threshold;
}
