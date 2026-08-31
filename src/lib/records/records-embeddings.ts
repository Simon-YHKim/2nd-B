// Records semantic layer over the `records` table (migration 0071), mirroring
// the wiki_pages path in ../wiki/embeddings.ts.
//
// SAFETY: every model call routes through embedTexts (the LLM boundary — C1/C3/C9
// + cost guard, currently $0/mo held), so this module never touches @google/genai
// directly and inherits the same holds: live-key egress refused → no vector;
// red-zone text → zero vector, never stored. Nothing is embedded or written until
// that gated path is opened (Simon D5: opt-in + consent + spend cap). Until then
// these functions are inert — the same held/dormant posture as the wiki layer.
//
// Populate lazily: embedAndStoreRecord on write, or backfillRecordEmbeddings to
// fill records without a vector. relatedRecordsByEmbedding reads neighbours back
// via the match_records kNN RPC (migration 0071).

import { embedTexts, EMBED_DIM } from "../llm/boundary";
import { embedVendor, type LlmVendor } from "../llm/routing";
import { getSupabaseClient } from "../supabase/client";

// D5 consent gate for records (journal) embedding — the MOST sensitive corpus.
// Adults must explicitly opt in (the `records_embedding` privacy pref, OFF by
// default; privacy/prefs.ts). Minors are hard-blocked here (not merely
// server-locked) because journal text is the highest-sensitivity data. NOTHING
// in this module embeds a record unless this returns true: the write primitives
// take the resolved consent and fail closed (no-op) without it.
export function recordsEmbeddingAllowed(
  isMinor: boolean | null | undefined,
  recordsEmbeddingPref: boolean | null | undefined,
): boolean {
  return isMinor !== true && recordsEmbeddingPref === true;
}

/**
 * The processor named in the records_embedding consent copy.
 *
 * The consent screen used to hardcode "Gemini". Measured 2026-08-31 on the live
 * web with the QA account: opting in and saving one record produced an
 * ai_audit_log row `embed_index / openai / text-embedding-3-large` — the text
 * had gone to OpenAI while the screen the user had just read said Gemini
 * (EXPO_PUBLIC_EMBED_VENDOR moved on 2026-08-23; the copy did not). A consent
 * that names the wrong processor is not consent to the right one, so the name
 * is read from the same switch the call follows. Only the two vendors
 * embedVendor() can return have a label; both process overseas.
 */
const EMBED_VENDOR_LABEL: Record<Extract<LlmVendor, "openai" | "gemini">, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
};

export function embedVendorLabel(): string {
  const vendor = embedVendor();
  return vendor === "gemini" ? EMBED_VENDOR_LABEL.gemini : EMBED_VENDOR_LABEL.openai;
}

/** Minimal record shape this module embeds — the semantic-ish text fields. */
export interface EmbeddableRecord {
  id: string;
  topic?: string | null;
  summary?: string | null;
  body: string;
}

/** The text we embed for a record: topic + summary + body, blank-line joined,
 *  trimmed and capped (gemini-embedding-2 counts input tokens; 2k chars is
 *  plenty). Null/blank fields are dropped so a bare-body record still embeds. */
export function recordEmbeddingText(
  record: Pick<EmbeddableRecord, "topic" | "summary" | "body">,
  max = 2000,
): string {
  const text = [record.topic, record.summary, record.body]
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .join("\n\n")
    .trim();
  return text.length > max ? text.slice(0, max) : text;
}

/** Postgres vector input format is the same bracketed list as JSON. */
function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

/** Store a record's embedding (vector column, migration 0071). */
export async function storeRecordEmbedding(
  userId: string,
  recordId: string,
  embedding: number[],
  /** The model that ACTUALLY produced it - see wiki/embeddings.ts. */
  embeddingModel: string,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("records")
    // 0142: see the note in wiki/embeddings.ts.
    .update({ embedding: toVectorLiteral(embedding), embedding_model: embeddingModel })
    .eq("user_id", userId)
    .eq("id", recordId);
  if (error) throw error;
}

/**
 * D5: forget the user's records semantic index — null out every stored vector.
 * Called when the user turns records embedding OFF (consent revoked) so the
 * toggle's "turning it off deletes the stored vectors" promise is honest. RLS
 * scopes to the user; only rows that actually carry a vector are touched.
 */
export async function clearRecordEmbeddings(userId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("records")
    // Clearing the vector clears its provenance too - a model name on a row
    // with no embedding would make the column lie about what is indexed.
    .update({ embedding: null, embedding_model: null })
    .eq("user_id", userId)
    .not("embedding", "is", null);
  if (error) throw error;
}

/**
 * Embed one record and persist its vector. Returns false (no write) when the
 * record has no text or the model produced nothing usable (red-zone → zero
 * vector, or live-key egress refused by the cost guard upstream).
 */
export async function embedAndStoreRecord(
  userId: string,
  record: EmbeddableRecord,
  locale: "en" | "ko" = "en",
  minor = false,
  consented = false,
): Promise<boolean> {
  // D5: fail closed — never embed journal content without explicit consent.
  if (!recordsEmbeddingAllowed(minor, consented)) return false;
  const text = recordEmbeddingText(record);
  if (text.length === 0) return false;
  const { vectors, audit } = await embedTexts({ userId, texts: [text], locale, minor });
  const vec = vectors[0];
  if (!vec || vec.length !== EMBED_DIM || vec.every((x) => x === 0)) return false;
  await storeRecordEmbedding(userId, record.id, vec, audit.modelUsed);
  return true;
}

export interface RelatedRecord {
  id: string;
  kind: string;
  topic: string | null;
  summary: string | null;
  similarity: number;
}

/**
 * Semantic neighbours of a record via the pgvector kNN RPC (migration 0071).
 * Empty when the record has no embedding yet.
 */
export async function relatedRecordsByEmbedding(
  userId: string,
  recordId: string,
  k = 6,
): Promise<RelatedRecord[]> {
  const supabase = getSupabaseClient();
  const { data: rec, error: e1 } = await supabase
    .from("records")
    .select("embedding, embedding_model")
    .eq("user_id", userId)
    .eq("id", recordId)
    .maybeSingle();
  if (e1) throw e1;
  const row = rec as { embedding: string | number[] | null; embedding_model: string | null } | null;
  const embedding = row?.embedding ?? null;
  if (!embedding) return [];
  // NULL means the row predates 0142 and its space is unknown. Passing NULL
  // through means "do not filter", which is the pre-0142 behaviour and the
  // right answer for a row we cannot place.
  const storedModel = row?.embedding_model ?? null;
  const { data, error } = await supabase.rpc("match_records", {
    p_user_id: userId,
    query_embedding: embedding,
    match_count: k,
    exclude_id: recordId,
    // This reader uses a STORED vector as its query, so the space to match is
    // the one that ROW is in - read from the row, not from a constant and not
    // from a fresh embed call (there is none here).
    p_embedding_model: storedModel,
  });
  if (error) throw error;
  return (data ?? []) as RelatedRecord[];
}

export interface BackfillResult {
  /** Rows with usable text that this page tried to embed. */
  scanned: number;
  embedded: number;
  /** Rows the page fetched, including empty-text ones (drives pagination). */
  fetched: number;
  /** created_at of the oldest fetched row — the keyset cursor for the next page. */
  oldest: string | null;
}

/**
 * Embed records that don't have a vector yet (bounded). Mirrors
 * backfillEmbeddings: ONE embedTexts call for the batch (not N serial calls),
 * best-effort per-record store. Red-zone texts return zero vectors and are
 * never stored; a batch failure falls back to per-record so one poisoned text
 * can't wedge the whole build.
 */
export async function backfillRecordEmbeddings(
  userId: string,
  opts: {
    locale?: "en" | "ko";
    minor?: boolean;
    limit?: number;
    consented?: boolean;
    /** Keyset cursor: only fetch rows with created_at strictly before this. */
    before?: string;
  } = {},
): Promise<BackfillResult> {
  // D5: fail closed — never batch-embed journal content without explicit consent.
  if (!recordsEmbeddingAllowed(opts.minor, opts.consented)) {
    return { scanned: 0, embedded: 0, fetched: 0, oldest: null };
  }
  const limit = opts.limit ?? 50;
  const supabase = getSupabaseClient();
  let query = supabase
    .from("records")
    .select("id, topic, summary, body, created_at")
    .eq("user_id", userId)
    .is("embedding", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  // Rows that never embed (red-zone → zero vector never stored, empty text)
  // stay NULL and would occupy this newest-first page forever, hiding every
  // older row. The cursor steps past them. Sub-microsecond created_at ties at
  // a page boundary could be skipped; acceptable for a best-effort index that
  // the next toggle rebuilds in full anyway.
  if (opts.before) query = query.lt("created_at", opts.before);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as (EmbeddableRecord & { created_at: string })[];
  const oldest = rows.length > 0 ? rows[rows.length - 1].created_at : null;
  const targets = rows
    .map((r) => ({ record: r, text: recordEmbeddingText(r) }))
    .filter((t) => t.text.length > 0);
  if (targets.length === 0) return { scanned: 0, embedded: 0, fetched: rows.length, oldest };

  let embedded = 0;
  try {
    const { vectors, audit } = await embedTexts({
      userId,
      texts: targets.map((t) => t.text),
      locale: opts.locale ?? "en",
      minor: opts.minor ?? false,
    });
    for (let i = 0; i < targets.length; i++) {
      const vec = vectors[i];
      if (!vec || vec.length !== EMBED_DIM || vec.every((x) => x === 0)) continue;
      try {
        await storeRecordEmbedding(userId, targets[i].record.id, vec, audit.modelUsed);
        embedded += 1;
      } catch {
        // best-effort; move on
      }
    }
  } catch {
    for (const target of targets) {
      try {
        // The 5th argument is the caller's consent — dropping it defaults to
        // false and recordsEmbeddingAllowed turns this whole rescue loop into
        // a silent no-op (found by adversarial review the day the first
        // production caller landed).
        const ok = await embedAndStoreRecord(
          userId,
          target.record,
          opts.locale ?? "en",
          opts.minor ?? false,
          opts.consented ?? false,
        );
        if (ok) embedded += 1;
      } catch {
        // best-effort; isolate and move on
      }
    }
  }
  return { scanned: targets.length, embedded, fetched: rows.length, oldest };
}

export interface BackfillAllResult {
  rounds: number;
  fetched: number;
  embedded: number;
  /**
   * True when maxRounds stopped the loop with rows possibly remaining. This is
   * "this run stopped here", NOT "the next toggle continues": off → on deletes
   * every vector first and rebuilds from the newest row, so a user with more
   * than batchSize × maxRounds un-embedded records keeps an un-indexed tail
   * until a server-side batch exists. Honest cap over silent spend.
   */
  capped: boolean;
  /** True when stillConsented() turned false mid-run and the loop stopped. */
  aborted: boolean;
  /** True when the final consent check was false and this run cleared vectors. */
  cleared: boolean;
}

/**
 * REQ-260901-02 (a), Simon 2026-08-31: when the records_embedding consent
 * flips false → true, index the records that ALREADY exist — the consent copy
 * now names them, so the index should too. Pages through every NULL-embedding
 * row with the created_at keyset cursor above and stops at maxRounds as a cost
 * guard. Fails closed without consent and for minors: the 0072 clamp is
 * untouched, this only ever narrows on top.
 *
 * stillConsented is how a DETACHED run stays honest while the user can still
 * act (adversarial review, 2026-08-31): it is read from the SERVER before
 * every round — so an OFF that lands mid-run stops the batch, and a 0072
 * clamp that silently rewrote the just-saved pref to false stops it before
 * round 1 ever fetches — and once more after the loop: if consent is off by
 * then, the run deletes the vectors it stored after the user's own clear ran,
 * keeping the "끄면 벡터 삭제" promise. Rounds are sequential awaits, so the
 * final check runs after the last store has settled.
 *
 * Retry path: rows that fail (red-zone, store error, batch failure) simply
 * keep embedding NULL; toggling off (which deletes vectors) → on runs the
 * whole build again from scratch. See docs/RECORDS-EMBEDDING.md.
 */
export async function backfillAllRecordEmbeddings(
  userId: string,
  opts: {
    locale?: "en" | "ko";
    minor?: boolean;
    consented?: boolean;
    batchSize?: number;
    maxRounds?: number;
    /** Live consent probe (server truth). Absent → the snapshot governs. */
    stillConsented?: () => Promise<boolean> | boolean;
  } = {},
): Promise<BackfillAllResult> {
  const none: BackfillAllResult = { rounds: 0, fetched: 0, embedded: 0, capped: false, aborted: false, cleared: false };
  if (!recordsEmbeddingAllowed(opts.minor, opts.consented)) return none;
  const batchSize = opts.batchSize ?? 50;
  const maxRounds = opts.maxRounds ?? 10;
  let rounds = 0;
  let fetched = 0;
  let embedded = 0;
  let capped = false;
  let aborted = false;
  let cleared = false;
  let before: string | undefined;
  for (;;) {
    if (rounds >= maxRounds) {
      capped = true;
      break;
    }
    if (opts.stillConsented && !(await opts.stillConsented())) {
      aborted = true;
      break;
    }
    const res = await backfillRecordEmbeddings(userId, {
      locale: opts.locale,
      minor: opts.minor,
      consented: opts.consented,
      limit: batchSize,
      before,
    });
    rounds += 1;
    fetched += res.fetched;
    embedded += res.embedded;
    if (res.fetched < batchSize || !res.oldest) break; // last page
    before = res.oldest;
  }
  if (opts.stillConsented && !(await opts.stillConsented())) {
    // Consent went off while (or right after) this run stored vectors. The
    // user's own clear may have run BEFORE our later stores landed — clean up
    // after ourselves so no vector survives a consent that is OFF.
    aborted = true;
    try {
      await clearRecordEmbeddings(userId);
      cleared = true;
    } catch {
      // best-effort; the rows are pref-gated for reads either way, and the
      // next off→on cycle clears again.
    }
  }
  if (fetched > 0 && typeof console !== "undefined") {
    // Cost-guard visibility: one line per run with the batch counts.
    console.log(
      `[records-embedding] backfill on consent: rounds=${rounds} fetched=${fetched} embedded=${embedded}${capped ? " capped" : ""}${aborted ? " aborted" : ""}${cleared ? " cleared" : ""}`,
    );
  }
  return { rounds, fetched, embedded, capped, aborted, cleared };
}
