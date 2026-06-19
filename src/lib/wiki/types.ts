// Wiki / RAG types — mirror tables introduced by db/migrations/0022_wiki_rag.sql.
// Kept hand-written (rather than re-running types.gen.ts) until the migration is
// applied to the remote Supabase project.

export type SourceKind =
  | "inbox"
  | "article"
  | "video"
  | "paper"
  | "reddit"
  | "code"
  | "ai_tool"
  | "self_knowledge";

export const SOURCE_KINDS: readonly SourceKind[] = [
  "inbox",
  "article",
  "video",
  "paper",
  "reddit",
  "code",
  "ai_tool",
  "self_knowledge",
] as const;

export type WikiPageKind = "source" | "entity" | "concept";

export const WIKI_PAGE_KINDS: readonly WikiPageKind[] = ["source", "entity", "concept"] as const;

export interface SourceRow {
  id: string;
  user_id: string;
  kind: SourceKind;
  title: string;
  source_url: string | null;
  storage_path: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  simon_relevance: number | null;
  ingested: boolean;
  ingested_at: string | null;
  captured_at: string;
  // §1 ingest gate (0044). Optional — legacy rows predate these columns.
  content_hash?: string | null;
  relevance_score?: number | null;
  dedup_of?: string | null;
  dedup_signature?: number[] | null;
  dedup_bands?: string[] | null;
}

export interface WikiPageRow {
  id: string;
  user_id: string;
  slug: string;
  kind: WikiPageKind;
  title: string;
  body_md: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  source_id: string | null;
  created_at: string;
  updated_at: string;
}

// Edge provenance (migration 0046), mapped to the propose->ratify canon:
//   wikilink — an explicit [[wikilink]] the user wrote (structural truth)
//   inferred — an AI-proposed connection awaiting the user's ratification
//   ratified — an inferred link the user accepted
export type RelationType = "wikilink" | "inferred" | "ratified";

export const RELATION_TYPES: readonly RelationType[] = ["wikilink", "inferred", "ratified"] as const;

export interface WikiLinkRow {
  user_id: string;
  from_page: string;
  to_page: string;
  /** Edge provenance (0046). Optional for rows read before the migration. */
  relation_type?: RelationType;
  /** Model 0..1 score; explicit/ratified links are 1.0 (0046). */
  confidence?: number;
  created_at: string;
}
