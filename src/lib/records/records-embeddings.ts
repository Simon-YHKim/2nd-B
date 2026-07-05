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

import { embedTexts, EMBED_DIM } from "../llm/gemini";
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

/** Minimal record shape this module embeds — the semantic-ish text fields. */
export interface EmbeddableRecord {
  id: string;
  topic?: string | null;
  summary?: string | null;
  body: string;
}

/** The text we embed for a record: topic + summary + body, blank-line joined,
 *  trimmed and capped (text-embedding-004 counts input tokens; 2k chars is
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
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("records")
    .update({ embedding: toVectorLiteral(embedding) })
    .eq("user_id", userId)
    .eq("id", recordId);
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
  const { vectors } = await embedTexts({ userId, texts: [text], locale, minor });
  const vec = vectors[0];
  if (!vec || vec.length !== EMBED_DIM || vec.every((x) => x === 0)) return false;
  await storeRecordEmbedding(userId, record.id, vec);
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
    .select("embedding")
    .eq("user_id", userId)
    .eq("id", recordId)
    .maybeSingle();
  if (e1) throw e1;
  const embedding = (rec as { embedding: string | number[] | null } | null)?.embedding ?? null;
  if (!embedding) return [];
  const { data, error } = await supabase.rpc("match_records", {
    p_user_id: userId,
    query_embedding: embedding,
    match_count: k,
    exclude_id: recordId,
  });
  if (error) throw error;
  return (data ?? []) as RelatedRecord[];
}

export interface BackfillResult {
  scanned: number;
  embedded: number;
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
  opts: { locale?: "en" | "ko"; minor?: boolean; limit?: number; consented?: boolean } = {},
): Promise<BackfillResult> {
  // D5: fail closed — never batch-embed journal content without explicit consent.
  if (!recordsEmbeddingAllowed(opts.minor, opts.consented)) return { scanned: 0, embedded: 0 };
  const limit = opts.limit ?? 50;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("records")
    .select("id, topic, summary, body")
    .eq("user_id", userId)
    .is("embedding", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as EmbeddableRecord[];
  const targets = rows
    .map((r) => ({ record: r, text: recordEmbeddingText(r) }))
    .filter((t) => t.text.length > 0);
  if (targets.length === 0) return { scanned: 0, embedded: 0 };

  let embedded = 0;
  try {
    const { vectors } = await embedTexts({
      userId,
      texts: targets.map((t) => t.text),
      locale: opts.locale ?? "en",
      minor: opts.minor ?? false,
    });
    for (let i = 0; i < targets.length; i++) {
      const vec = vectors[i];
      if (!vec || vec.length !== EMBED_DIM || vec.every((x) => x === 0)) continue;
      try {
        await storeRecordEmbedding(userId, targets[i].record.id, vec);
        embedded += 1;
      } catch {
        // best-effort; move on
      }
    }
  } catch {
    for (const target of targets) {
      try {
        const ok = await embedAndStoreRecord(userId, target.record, opts.locale ?? "en", opts.minor ?? false);
        if (ok) embedded += 1;
      } catch {
        // best-effort; isolate and move on
      }
    }
  }
  return { scanned: targets.length, embedded };
}
