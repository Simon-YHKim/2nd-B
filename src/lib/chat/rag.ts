// D-26 A1: query-relevant retrieval for secondb_chat.
//
// The chat used to ship the WHOLE wiki snapshot (50 pages x 600 chars) on
// every turn. With embeddings live again (P0-2, gemini-embedding-2), the chat
// can instead embed the user's message and pull only the top-k semantically
// relevant pages via the pgvector kNN RPC (match_wiki_pages, migration 0047).
// ~8 focused pages beat 50 arbitrary ones for grounding AND cut the per-turn
// prompt by ~10x — the "RAG top-8" seat of the D-26 A1 verdict.
//
// Fail-soft by design: any miss (no embeddings yet, embed egress failure,
// red-zone query -> zero vector, RPC error) returns [] and the caller falls
// back to the legacy whole-wiki snapshot, so chat NEVER breaks on RAG.
//
// Cost: one embedTexts call per chat turn (shared proxy spend counter). C9
// holds inside embedTexts (red text is never embedded); C1 holds because the
// only model access is through the gemini.ts boundary.

import { EMBED_DIM, embedTexts } from "../llm/gemini";
import { getSupabaseClient } from "../supabase/client";

export interface RagPage {
  slug: string;
  title: string;
  /** body_md clipped to the caller's char budget. */
  body: string;
  similarity: number;
}

export interface RetrieveChatContextOpts {
  k?: number;
  bodyCharLimit?: number;
  minor?: boolean;
}

/** Floor below which a neighbour is noise, not grounding. Mirrors the 0.5
 *  confidence floor used by proposalsFromNeighbors (mock/random vectors sit
 *  near 0 cosine, so dev/CI naturally falls back to the snapshot path). */
export const RAG_MIN_SIMILARITY = 0.3;

export async function retrieveChatContext(
  userId: string,
  query: string,
  locale: "en" | "ko",
  opts: RetrieveChatContextOpts = {},
): Promise<RagPage[]> {
  const k = opts.k ?? 8;
  const bodyCharLimit = opts.bodyCharLimit ?? 600;

  const { vectors } = await embedTexts({
    userId,
    texts: [query],
    locale,
    minor: opts.minor ?? false,
  });
  const vec = vectors[0];
  // Zero vector = red-zone query (C9 skip) or an empty model reply — no RAG.
  if (!vec || vec.length !== EMBED_DIM || vec.every((x) => x === 0)) return [];

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("match_wiki_pages", {
    p_user_id: userId,
    query_embedding: `[${vec.join(",")}]`,
    match_count: k,
  });
  if (error || !Array.isArray(data) || data.length === 0) return [];
  const neighbors = (data as { id: string; slug: string; title: string; similarity: number }[])
    .filter((n) => n.similarity >= RAG_MIN_SIMILARITY);
  if (neighbors.length === 0) return [];

  // The kNN RPC returns metadata only; fetch the bodies for the survivors.
  const { data: pages, error: e2 } = await supabase
    .from("wiki_pages")
    .select("id, slug, title, body_md")
    .eq("user_id", userId)
    .in("id", neighbors.map((n) => n.id));
  if (e2 || !Array.isArray(pages)) return [];
  const byId = new Map(
    (pages as { id: string; slug: string; title: string; body_md: string | null }[]).map((p) => [p.id, p]),
  );

  const out: RagPage[] = [];
  for (const n of neighbors) {
    const p = byId.get(n.id);
    if (!p) continue;
    out.push({
      slug: p.slug,
      title: p.title,
      body: (p.body_md ?? "").slice(0, bodyCharLimit),
      similarity: n.similarity,
    });
  }
  return out;
}

/** Render RAG pages as the same [[slug]]-citable shape the snapshot uses, so
 *  the existing citation parser keeps working unchanged. Sanitization/fencing
 *  is the CALLER's job (conversation.ts wraps this in <UNTRUSTED>). */
export function formatRagPages(pages: RagPage[], locale: "en" | "ko"): string {
  const header =
    locale === "ko"
      ? "## 이 질문과 관련된 위키 페이지 (관련도순)"
      : "## Wiki pages relevant to this question (by relevance)";
  const blocks = pages.map((p) => `### [[${p.slug}]] ${p.title}\n${p.body}`);
  return `${header}\n\n${blocks.join("\n\n")}`;
}
