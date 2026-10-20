// One-call ingest entrypoint: clipper markdown + URL → sources row + Storage upload.
//
// The capture UI (src/app/capture.tsx) and any future Edge Function that
// accepts a clipper payload both call this. Composes buildSourcePayload +
// uploadRawClipping + createSource into a single atomic-from-the-caller's-
// perspective operation.

import { buildSourcePayload } from "./ingest-helpers";
import { abortError, throwIfAborted } from "../async/abort";
import { createSource as legacyCreateSource, getSource, type CreateSourceInput } from "./queries";
import { storageSafeSlug } from "./slug";
import { deleteRawClipping as legacyDeleteRawClipping, rawClippingPath, uploadRawClipping as legacyUploadRawClipping } from "./storage";
import { getEnv } from "../env";
import type { AccountOwnerLease } from "../auth/account-epoch";
import type { AuthenticatedAccountSessionLease } from "../auth/account-session-lease";
import type { ContentMutationKind, ContentSettlement, createContentWipeLedger } from "../account/content-wipe";
import { contentHash, minhashSignature, lshBandKeys } from "../ingest/dedup";
import { decideIngest, type GateDeps } from "../ingest/gate";
import { makeSupabaseGateDeps } from "../ingest/gate-supabase";
import type { SourceKind, SourceRow } from "./types";

export type CaptureMutationObserver = Readonly<{
  owner: AccountOwnerLease;
  generation: number;
  operationId: string;
  session: AuthenticatedAccountSessionLease;
  ledger: Pick<ReturnType<typeof createContentWipeLedger>, "read" | "acquireMutation" | "issueMutation" | "settleMutation">;
  /** Session/consent admission only. Never called to authorize a late settlement. */
  assertCurrent(): void;
}>;

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
  /** Opt-in D4 writes. Omission preserves the live capture/import path. */
  mutationObserver?: CaptureMutationObserver;
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
  const observed = input.mutationObserver ? observedCapture(input, input.mutationObserver) : null;
  const uploadRawClipping = observed?.upload ?? legacyUploadRawClipping;
  const createSource = observed?.create ?? legacyCreateSource;
  const deleteRawClipping = observed?.cleanup ?? legacyDeleteRawClipping;
  observed?.fence();
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
  observed?.fence();
  const decision = decideIngest({
    text: built.body,
    candidates,
    precomputed: { contentHash: hash, signature },
  });

  let dedupOf: string | null = null;
  if (!decision.keep && decision.stage === "exact_duplicate" && decision.survivorId) {
    const drop = {
      content_hash: hash,
      stage: "exact_duplicate" as const,
      reason: decision.reason,
      survivor_id: decision.survivorId,
    };
    if (observed) await observed.drop(drop);
    else await gateDeps.recordDrop(drop);
    throwIfAborted(input.signal);
    observed?.fence();
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
  // storageSafeSlug: Storage rejects non-ASCII keys (400 "Invalid key"), so a
  // Hangul title ("KakaoTalk 가져오기") used to fail EVERY upload straight into
  // the inline fallback — and poisoned storage_path for later readers.
  const storageSlug = `${storageSafeSlug(built.suggested_slug)}-${hash.slice(0, 12)}`;
  const path = rawClippingPath(input.userId, storageSlug);
  let storedToStorage = true;
  try {
    await uploadRawClipping(input.userId, storageSlug, built.body);
  } catch (e) {
    throwIfAborted(input.signal);
    observed?.fence();
    storedToStorage = false;
    if (typeof console !== "undefined") console.warn("[capture] storage upload failed; saving body inline", e);
  }
  throwIfAborted(input.signal);
  observed?.fence();

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

  let source: SourceRow;
  try {
    source = await createSource({
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
  } catch (e) {
    // 0223: the database refused a comms/location import for a minor account. The body was
    // uploaded a moment ago, so remove it too: the account should hold neither the row nor the
    // file. Only this refusal deletes. Any other insert error keeps the upload, because a
    // concurrent capture of the same content may own the same path.
    if (storedToStorage && isMinorImportLocked(e)) {
      await deleteRawClipping(path).catch(() => undefined);
    }
    throw e;
  }
  throwIfAborted(input.signal);
  observed?.fence();

  return {
    source,
    storage_path: path,
    hadFrontmatter: built.hadFrontmatter,
    suggested_slug: built.suggested_slug,
    storagePending: !storedToStorage,
    deduped: dedupOf ? "near_duplicate" : null,
  };
}

/** Read the original response only on the opted-in path: the legacy helpers
 * discard Storage/drop receipts. No error text or abort is rollback evidence. */
function observedCapture(input: CaptureInput, observer: CaptureMutationObserver) {
  const { owner, generation, operationId, ledger, session } = observer;
  const fence = () => {
    throwIfAborted(input.signal);
    observer.assertCurrent();
    session.assertCurrent();
    if (owner.ownerId !== input.userId || !owner.isCurrent() || session.userId !== owner.ownerId
      || session.epoch !== owner.epoch || session.signal !== input.signal) throw abortError();
    const state = ledger.read(owner);
    if (state.phase !== "open" || state.generation !== generation) throw abortError();
  };
  const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  type Reply = { data?: unknown; error?: unknown; status?: number };
  // storage-js 2.106.1 ignores upload FileOptions.signal and constructs data.path
  // locally. Opt-in writes use the captured token/signal and original HTTP body.
  // Do not change the legacy helpers or silently fall back to mutable SDK auth.
  function request(route: string, init: RequestInit, minimal = false): () => Promise<Reply> {
    fence();
    const accessToken = session.accessToken, env = getEnv();
    const url = env.EXPO_PUBLIC_SUPABASE_URL.replace(/\/+$/, "") + route;
    const options = { ...init, signal: session.signal, headers: {
      Authorization: `Bearer ${accessToken}`, apikey: env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      "content-type": "application/json", ...init.headers,
    } };
    return async () => {
      const response = await globalThis.fetch(url, options);
      // Read/parse loss after HTTP success is still an unknown mutation.
      const text = await response.text();
      const mime = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
      if (!(minimal && response.ok && text === "") && mime !== "application/json" && mime !== "application/vnd.pgrst.object+json") {
        throw new Error("capture_response_unconfirmed");
      }
      const data: unknown = minimal && response.ok && text === "" ? null : JSON.parse(text);
      return response.ok ? { data, error: null, status: response.status } : { data: null, error: data, status: response.status };
    };
  }
  async function mutate(kind: Exclude<ContentMutationKind, "usage">, dispatch: () => PromiseLike<Reply>,
    confirmed: (reply: Reply) => boolean): Promise<unknown> {
    fence();
    const ticket = ledger.acquireMutation(owner, generation, { operationId, stepId: kind, kind });
    if (!ticket) throw abortError();
    const operation = ledger.issueMutation(owner, ticket, () => Promise.resolve(dispatch()), () => { fence(); return true; });
    if (!operation) throw abortError();
    // Cancellation records uncertainty immediately, while the original promise
    // can still supply a verified late receipt to this exact epoch/generation.
    const uncertain = () => { ledger.settleMutation(ticket, { outcome: "unknown" }); };
    input.signal?.addEventListener("abort", uncertain, { once: true });
    if (input.signal?.aborted) uncertain();
    try {
      const reply = await operation;
      const valid = object(reply);
      const rejected = kind === "source-insert" && valid && reply.status === 400 && reply.data === null
        && object(reply.error) && reply.error.code === "P0001" && isMinorImportLocked(reply.error);
      // x-upsert:false rejects an existing object before writing. Require the
      // Storage Duplicate body as well as its 400/409 status; other failures stay unknown.
      const duplicate = kind === "raw-upload" && valid && (reply.status === 409 || reply.status === 400)
        && reply.data === null && object(reply.error) && (reply.error.statusCode === "409" || reply.error.error === "Duplicate");
      const outcome: ContentSettlement["outcome"] = rejected || duplicate ? "definitely-not-committed"
        : valid && reply.error === null && confirmed(reply) ? "committed" : "unknown";
      const settled = ledger.settleMutation(ticket, { outcome });
      if (!settled) throw new Error("capture_settlement_rejected");
      if (valid && reply.error) throw reply.error;
      if (outcome !== "committed") throw new Error("capture_mutation_unconfirmed");
      return reply.data;
    } catch (error) {
      // A terminal receipt cannot be weakened by a later observation failure.
      uncertain();
      throw error;
    } finally { input.signal?.removeEventListener("abort", uncertain); }
  }
  return {
    fence,
    async upload(userId: string, slug: string, body: string) {
      const path = rawClippingPath(userId, slug);
      await mutate("raw-upload", request(`/storage/v1/object/raw-clippings/${path.split("/").map(encodeURIComponent).join("/")}`, {
        method: "POST", body, headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "max-age=3600", "x-upsert": "false" },
      }), reply => reply.status === 200 && object(reply.data) && typeof reply.data.Id === "string" && !!reply.data.Id
        && reply.data.Key === `raw-clippings/${path}`);
      return { path };
    },
    async create(row: CreateSourceInput): Promise<SourceRow> {
      return await mutate("source-insert", request("/rest/v1/sources?select=*", {
        method: "POST", body: JSON.stringify(row), headers: { Prefer: "return=representation", Accept: "application/vnd.pgrst.object+json" },
      }), reply => reply.status === 201 && object(reply.data) && typeof reply.data.id === "string" && !!reply.data.id
        && reply.data.user_id === row.user_id && reply.data.storage_path === row.storage_path
        && reply.data.content_hash === row.content_hash) as SourceRow;
    },
    async drop(row: Parameters<GateDeps["recordDrop"]>[0]) {
      // Custom GateDeps return no server receipt; keep their outcome unknown.
      const custom = input.gateDeps;
      await mutate("ingest-drop", custom ? () => custom.recordDrop(row).then(() => ({}))
        : request("/rest/v1/ingest_log", { method: "POST", body: JSON.stringify({ user_id: input.userId, ...row }),
          headers: { Prefer: "return=minimal" } }, true), reply => reply.status === 201 && reply.data === null);
    },
    async cleanup(path: string) {
      await mutate("raw-cleanup", request("/storage/v1/object/raw-clippings", { method: "DELETE", body: JSON.stringify({ prefixes: [path] }) }),
        reply => reply.status === 200 && Array.isArray(reply.data) && reply.data.length === 1 && object(reply.data[0]) && reply.data[0].name === path);
    },
  };
}

/** The refusal 0223 raises (and 0094 for relation_people): `minor_import_locked: ...`. */
export function isMinorImportLocked(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const message = (e as { message?: unknown }).message;
  return typeof message === "string" && message.startsWith("minor_import_locked");
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
