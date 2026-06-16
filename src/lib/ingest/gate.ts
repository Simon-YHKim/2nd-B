// §1 ingest gate (AI-OS Personal Context Layer, queue C).
//
// Decides whether an incoming clipping is KEPT (flows on to Phase 1/2 + a
// `sources` row) or DROPPED (recorded in `ingest_log`, never stored). Three
// drop reasons run here, in order: exact duplicate (idempotency, C2), near
// duplicate (MinHash-LSH), and low relevance / spam (from the phase1 Gemini
// pass). PII scrub and the schema-invalid drop live on other rungs (queue D
// and the phase1 Zod retry) — this module only owns dedup + relevance.
//
// Pure-first: `decideIngest()` is a pure function (the orchestrator and tests
// drive it without any I/O). `runIngestGate()` is the thin async shell that
// fetches LSH-bucketed candidates and writes the drop record through injected
// deps, so the DB/Supabase layer stays out of the decision logic.

import {
  contentHash,
  minhashSignature,
  estimateSimilarity,
  lshBandKeys,
  NEAR_DUPLICATE_THRESHOLD,
} from "./dedup";

/** Drop reasons recorded in `ingest_log.stage` (0044). */
export type DropStage =
  | "exact_duplicate"
  | "near_duplicate"
  | "low_relevance"
  | "schema_invalid"
  | "policy_block";

/** Below this phase1 relevance (1..5) a clip is dropped. Mirrors phase1. */
export const RELEVANCE_KEEP_THRESHOLD = 2;

/** A prior `sources` row a new clip is compared against for dedup. */
export interface IngestCandidate {
  id: string;
  /** post-scrub content hash (sources.content_hash). */
  contentHash: string;
  /** MinHash signature for near-dup compare; omit to skip near compare. */
  signature?: number[];
}

export interface KeepDecision {
  keep: true;
  contentHash: string;
  /** Computed once here so the caller can persist it without recomputing. */
  signature: number[];
}

export interface DropDecision {
  keep: false;
  stage: DropStage;
  reason: string;
  contentHash: string;
  /** The surviving row this collapsed onto (exact/near dup); null otherwise. */
  survivorId: string | null;
}

export type IngestDecision = KeepDecision | DropDecision;

export interface DecideArgs {
  /** Post-scrub normalized-or-raw clip text (contentHash normalizes again). */
  text: string;
  /** phase1 relevance (1..5), or null/undefined when not yet scored. */
  relevance?: number | null;
  /** phase1 keep flag — false marks spam / ads / no personal value. */
  keepFlag?: boolean | null;
  /** Prior rows to compare against (already LSH-bucketed by the caller). */
  candidates: IngestCandidate[];
  relevanceThreshold?: number;
  nearDuplicateThreshold?: number;
  /** Precomputed hash/signature to avoid recompute; derived from text if absent. */
  precomputed?: { contentHash: string; signature: number[] };
}

/**
 * Pure ingest decision. No I/O — exact dedup, then near-dup, then relevance.
 * Returns the first matching drop, or a keep with the computed hash/signature.
 */
export function decideIngest(args: DecideArgs): IngestDecision {
  const relevanceThreshold = args.relevanceThreshold ?? RELEVANCE_KEEP_THRESHOLD;
  const nearThreshold = args.nearDuplicateThreshold ?? NEAR_DUPLICATE_THRESHOLD;
  const hash = args.precomputed?.contentHash ?? contentHash(args.text);
  const signature = args.precomputed?.signature ?? minhashSignature(args.text);

  // 1. Exact duplicate — idempotency: same hash already ingested (C2).
  const exact = args.candidates.find((c) => c.contentHash === hash);
  if (exact) {
    return {
      keep: false,
      stage: "exact_duplicate",
      reason: "content_hash already ingested",
      contentHash: hash,
      survivorId: exact.id,
    };
  }

  // 2. Near duplicate — highest-similarity candidate at/above threshold.
  let best: { id: string; sim: number } | null = null;
  for (const c of args.candidates) {
    if (!c.signature) continue;
    const sim = estimateSimilarity(signature, c.signature);
    if (sim >= nearThreshold && (best === null || sim > best.sim)) {
      best = { id: c.id, sim };
    }
  }
  if (best !== null) {
    return {
      keep: false,
      stage: "near_duplicate",
      reason: `near-duplicate of ${best.id} (est. similarity ${best.sim.toFixed(2)})`,
      contentHash: hash,
      survivorId: best.id,
    };
  }

  // 3. Relevance / spam — phase1's keep flag wins, then the numeric threshold.
  if (args.keepFlag === false) {
    return {
      keep: false,
      stage: "low_relevance",
      reason: "phase1 keep=false (spam / ads / no personal value)",
      contentHash: hash,
      survivorId: null,
    };
  }
  if (typeof args.relevance === "number" && args.relevance < relevanceThreshold) {
    return {
      keep: false,
      stage: "low_relevance",
      reason: `relevance ${args.relevance} below threshold ${relevanceThreshold}`,
      contentHash: hash,
      survivorId: null,
    };
  }

  return { keep: true, contentHash: hash, signature };
}

/** A row to append to `ingest_log` (0044) when a clip is dropped. */
export interface IngestDropRecord {
  content_hash: string;
  stage: DropStage;
  reason: string;
  survivor_id: string | null;
}

export interface GateDeps {
  /**
   * Fetch prior `sources` rows that could collide: an exact `contentHash`
   * match OR any row sharing one of the LSH `bandKeys`. Returning a superset
   * is fine — `decideIngest` does the precise compare.
   */
  findCandidates: (bandKeys: string[], contentHash: string) => Promise<IngestCandidate[]>;
  /** Append a drop record to `ingest_log`. Only called on a drop. */
  recordDrop: (row: IngestDropRecord) => Promise<void>;
}

/**
 * Orchestrate the gate: compute the hash/signature once, fetch LSH-bucketed
 * candidates, run the pure decision, and persist a drop record when dropped.
 * Returns the decision so the caller persists kept rows (with content_hash +
 * relevance_score) through its existing capture path.
 */
export async function runIngestGate(
  args: Omit<DecideArgs, "candidates" | "precomputed">,
  deps: GateDeps,
): Promise<IngestDecision> {
  const hash = contentHash(args.text);
  const signature = minhashSignature(args.text);
  const candidates = await deps.findCandidates(lshBandKeys(signature), hash);

  const decision = decideIngest({
    ...args,
    candidates,
    precomputed: { contentHash: hash, signature },
  });

  if (!decision.keep) {
    await deps.recordDrop({
      content_hash: decision.contentHash,
      stage: decision.stage,
      reason: decision.reason,
      survivor_id: decision.survivorId,
    });
  }
  return decision;
}
