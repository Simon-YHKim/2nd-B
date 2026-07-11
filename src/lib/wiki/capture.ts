// One-call ingest entrypoint: clipper markdown + URL → sources row + Storage upload.
//
// The capture UI (src/app/capture.tsx) and any future Edge Function that
// accepts a clipper payload both call this. Composes buildSourcePayload +
// uploadRawClipping + createSource into a single atomic-from-the-caller's-
// perspective operation.

import { buildSourcePayload } from "./ingest-helpers";
import { throwIfAborted } from "../async/abort";
import { createSource, getSource } from "./queries";
import { rawClippingPath, uploadRawClipping } from "./storage";
import { contentHash, minhashSignature, lshBandKeys } from "../ingest/dedup";
import { decideIngest, type GateDeps } from "../ingest/gate";
import { makeSupabaseGateDeps } from "../ingest/gate-supabase";
import type { SourceKind, SourceRow } from "./types";

export interface CaptureInput {
  /** The current user's id. Storage path scopes to it; sources.user_id requires it. */
  userId: string;
  /** Raw clipper-emitted markdown (frontmatter block + body, or body only). */
  rawMd: string;
  /** Optional URL used when the frontmatter has no url/source. Drives kind detection. */
  fallbackUrl?: string | null;
  /** Force a clipper kind (e.g., "self_knowledge" for user-authored notes). */
  kindOverride?: SourceKind | null;
  /**
   * User-final tag list from the capture screen. Merged with frontmatter tags
   * (dedup, lowercased). When the user accepted the LLM suggestion as-is, this
   * is the LLM list; when they edited it, this is the edited list.
   */
  userTags?: string[] | null;
  /**
   * Wiki track selected on the capture screen ("daily" or "pro"). Written into
   * `sources.frontmatter.wiki_track` so the inbox can filter and downstream UI
   * can show the badge.
   */
  track?: "daily" | "pro" | null;
  /**
   * Extra frontmatter the AI clipper classifier filled by reading the content
   * (target-category, actionable-takeaway, summary, and kind-specific props like
   * topic-area / doc-type). Merged into sources.frontmatter so storage matches
   * the clipper template format. See classify-clipper.ts.
   */
  extraFrontmatter?: Record<string, unknown> | null;
  /** AI-estimated 0..1 relevance; overrides the frontmatter-derived value. */
  simonRelevance?: number | null;
  /** Optional UI-owned cancellation signal for capture submit flows. */
  signal?: AbortSignal;
  /**
   * Ingest-gate deps (dedup). Defaults to the Supabase-backed factory; tests
   * inject a fake. Exposed so callers can disable/stub the gate if needed.
   */
  gateDeps?: GateDeps;
}

export interface CaptureResult {
  source: SourceRow;
  storage_path: string;
  /** True when frontmatter was parsed. False = body-only capture. */
  hadFrontmatter: boolean;
  /** Slug used for the storage path (also a sensible starting slug for the source's wiki page). */
  suggested_slug: string;
  /** True when the Storage upload failed and the body landed inline as
   *  frontmatter._body_fallback. The piece is safe, but callers should
   *  surface the degraded state instead of reporting a clean success. */
  storagePending: boolean;
  /**
   * Set when the ingest gate matched an existing clip:
   *   - "exact_duplicate": nothing was saved; `source` is the existing row
   *     (idempotent save). No new Storage upload happened.
   *   - "near_duplicate": a new row WAS saved but linked to the survivor via
   *     `source.dedup_of` (we don't silently discard a maybe-different clip).
   * null on a normal first-time capture.
   */
  deduped: "exact_duplicate" | "near_duplicate" | null;
}

export async function captureFromMarkdown(input: CaptureInput): Promise<CaptureResult> {
  throwIfAborted(input.signal);
  const built = buildSourcePayload(input.rawMd, input.fallbackUrl ?? null, input.kindOverride ?? null);
  throwIfAborted(input.signal);

  // §1 ingest gate (dedup). Runs on the body text BEFORE any Storage upload, so
  // a re-clipped article costs no upload. Relevance gating is NOT here — the
  // phase1 Gemini score doesn't exist yet at capture; only exact/near dedup can
  // decide now. An exact duplicate is an idempotent save (return the existing
  // row, nothing written). A near duplicate is still saved but linked to its
  // survivor via dedup_of — we never silently discard a maybe-distinct clip.
  const gateDeps = input.gateDeps ?? makeSupabaseGateDeps(input.userId, input.signal);
  const hash = contentHash(built.body);
  const signature = minhashSignature(built.body);
  const bands = lshBandKeys(signature);
  const candidates = await gateDeps.findCandidates(bands, hash);
  throwIfAborted(input.signal);
  const decision = decideIngest({
    text: built.body,
    candidates,
    precomputed: { contentHash: hash, signature },
  });

  let dedupOf: string | null = null;
  if (!decision.keep && decision.stage === "exact_duplicate" && decision.survivorId) {
    await gateDeps.recordDrop({
      content_hash: hash,
      stage: "exact_duplicate",
      reason: decision.reason,
      survivor_id: decision.survivorId,
    });
    throwIfAborted(input.signal);
    const existing = await getSource(input.userId, decision.survivorId);
    if (existing) {
      return {
        source: existing,
        storage_path: existing.storage_path,
        hadFrontmatter: built.hadFrontmatter,
        suggested_slug: built.suggested_slug,
        storagePending: false,
        deduped: "exact_duplicate",
      };
    }
    // Survivor vanished (deleted between fetch and now) — fall through and save.
  } else if (!decision.keep && decision.stage === "near_duplicate") {
    dedupOf = decision.survivorId;
  }

  // The body-only markdown is persisted to Storage; the frontmatter also lives
  // in sources.frontmatter (jsonb). The upload is BEST-EFFORT: a transient
  // Storage error (bucket hiccup, network) must NOT lose the user's piece, so we
  // never let it abort the save. We use the canonical path regardless, and when
  // the upload didn't land we stash the body in frontmatter (_body_fallback) so
  // nothing is lost and a re-upload can recover it later.
  // Storage key = title-slug + a content-hash suffix so two DIFFERENT captures
  // that happen to share a title no longer collide on one path (the second upload
  // would otherwise overwrite the first source's body, corrupting it). Exact
  // duplicates already returned above, so every distinct capture here has a
  // distinct content hash. suggested_slug (the human-facing wiki slug) is left
  // untouched — only the physical storage path is disambiguated.
  const storageSlug = `${built.suggested_slug}-${hash.slice(0, 12)}`;
  const path = rawClippingPath(input.userId, storageSlug);
  let storedToStorage = true;
  try {
    await uploadRawClipping(input.userId, storageSlug, built.body);
  } catch (e) {
    throwIfAborted(input.signal);
    storedToStorage = false;
    if (typeof console !== "undefined") console.warn("[capture] storage upload failed; saving body inline", e);
  }
  throwIfAborted(input.signal);

  // Merge LLM-classifier output (user-final) with whatever the frontmatter
  // already carried. Tags get deduped + lowercased. Track lives in frontmatter
  // under `wiki_track` — keeps the schema flat (no new column required) and
  // matches the phase1 pattern of storing classifier metadata in jsonb.
  const mergedTags = mergeTags(built.payload.tags, input.userTags ?? null);
  const mergedFrontmatter = {
    ...built.payload.frontmatter,
    ...(input.track ? { wiki_track: input.track } : {}),
    ...(input.extraFrontmatter ?? {}),
    ...(storedToStorage ? {} : { _storage_pending: true, _body_fallback: built.body }),
  };

  const source = await createSource({
    user_id: input.userId,
    kind: built.payload.kind,
    title: built.payload.title,
    source_url: built.payload.source_url,
    storage_path: path,
    frontmatter: mergedFrontmatter,
    tags: mergedTags,
    simon_relevance: scaleAiRelevance(input.simonRelevance) ?? built.payload.simon_relevance,
    content_hash: hash,
    dedup_signature: signature,
    dedup_bands: bands,
    dedup_of: dedupOf,
  }, input.signal);
  throwIfAborted(input.signal);

  return {
    source,
    storage_path: path,
    hadFrontmatter: built.hadFrontmatter,
    suggested_slug: built.suggested_slug,
    storagePending: !storedToStorage,
    deduped: dedupOf ? "near_duplicate" : null,
  };
}

// classifyClipper estimates relevance on a 0..1 scale, but sources.simon_relevance
// is the clipper 1..5 integer (CHECK simon_relevance BETWEEN 1 AND 5). Map the AI
// estimate onto 1..5 so a successful classification never writes a fractional or
// out-of-range value (0.4 -> 2, 0 -> 1, 1 -> 5). null/NaN means "no AI estimate",
// so the caller falls back to the frontmatter-derived value.
export function scaleAiRelevance(r: number | null | undefined): number | null {
  if (r == null || !Number.isFinite(r)) return null;
  const scaled = Math.round(r * 5);
  return Math.min(5, Math.max(1, scaled));
}

// Lowercase + trim + dedupe. Frontmatter tags come first to preserve original
// ordering; user tags append in their displayed order. Empty strings dropped.
function mergeTags(frontmatterTags: string[], userTags: string[] | null): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...frontmatterTags, ...(userTags ?? [])]) {
    const norm = raw.trim().toLowerCase();
    if (norm.length === 0 || seen.has(norm)) continue;
    seen.add(norm);
    merged.push(norm);
  }
  return merged;
}
