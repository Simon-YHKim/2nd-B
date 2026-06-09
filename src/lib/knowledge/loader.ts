// Path A (Karpathy Wiki) loader. Per docs/handoff/build-rag-wiki.md §6.2.
//
// In dev / node test environments we read the batch markdown files from
// disk. In the bundled mobile/web build the markdown is shipped as a
// static asset (bundler-resolved import) — see `BATCH_ASSETS`.

import { getSupabaseClient } from "../supabase/client";
import type { KnowledgeRow, QueryFilters } from "./types";

// Bundled markdown — v2 will ship as Expo assets or Supabase Storage objects.
// v1 reads from disk (dev/node tests) and falls back to an inline schema stub
// when running in a mobile bundle that doesn't have node:fs available.
const BATCH_ASSETS: Record<string, () => Promise<string>> = {};
const SCHEMA_ASSET: (() => Promise<string>) | null = null;

let cachedSchema: string | null = null;
const cachedBatches: Map<string, string> = new Map();

// Try fs first (dev/node), then bundled asset (mobile/web).
async function readDocFile(repoRelPath: string): Promise<string | null> {
  if (typeof process !== "undefined" && (process as any).versions?.node) {
    try {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const root = process.cwd();
      const abs = path.join(root, repoRelPath);
      return await fs.readFile(abs, "utf8");
    } catch {
      return null;
    }
  }
  return null;
}

export async function loadSchema(): Promise<string> {
  if (cachedSchema) return cachedSchema;
  const fromFs = await readDocFile("docs/research/CLAUDE.md");
  if (fromFs) {
    cachedSchema = fromFs;
    return fromFs;
  }
  if (SCHEMA_ASSET) {
    try {
      const bundled = await (SCHEMA_ASSET as () => Promise<string>)();
      cachedSchema = bundled;
      return bundled;
    } catch {
      // fall through to inline stub
    }
  }
  cachedSchema = `# Knowledge Base — runtime fallback
§0 Crisis content short-circuits to fixed templates (1393 / 988).
§0 Never diagnose. Never infer protected categories.
§0 Cite at most one observation. End with one reflective question.
`;
  return cachedSchema;
}

export async function loadBatch(slug: string): Promise<string> {
  if (cachedBatches.has(slug)) return cachedBatches.get(slug)!;
  const fromFs = await readDocFile(`docs/research/batches/${slug}.md`);
  if (fromFs) {
    cachedBatches.set(slug, fromFs);
    return fromFs;
  }
  const loader = BATCH_ASSETS[slug];
  if (loader) {
    try {
      const md = await loader();
      cachedBatches.set(slug, md);
      return md;
    } catch {
      // fall through
    }
  }
  // Empty string — caller treats as "batch unavailable in this build".
  return "";
}

export async function queryRows(filters: QueryFilters = {}): Promise<KnowledgeRow[]> {
  const supabase = getSupabaseClient();
  let q = supabase
    .from("knowledge_sources")
    .select(
      "id, title, authors, doi, url, framework, age_range, locale, verified_at, summary_ko, summary_en, application_notes",
    );

  if (filters.framework) {
    if (Array.isArray(filters.framework)) {
      q = q.in("framework", filters.framework);
    } else {
      q = q.eq("framework", filters.framework);
    }
  }
  if (filters.locale) {
    // 'both' rows are surfaced regardless of user locale.
    q = q.in("locale", [filters.locale, "both"]);
  }
  if (filters.ageRange) {
    // 'lifespan' rows are surfaced regardless of user age.
    q = q.in("age_range", [filters.ageRange, "lifespan"]);
  }
  // Defense-in-depth (security audit 2026-06-10): only curated seeds
  // (added_by IS NULL, per 0013/0041) or curator-verified rows may ground an
  // Advisor prompt. RLS (0041 + 0043 trust-flag lock) already blocks
  // cross-user reach; this also keeps a user's own unverified submission —
  // and any future RLS regression — out of the "curated research" evidence
  // the model is told to trust.
  q = q.or("added_by.is.null,verified_at.not.is.null");
  q = q.limit(filters.limit ?? 10);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as KnowledgeRow[];
}

// Test-only cache reset.
export function __resetKnowledgeCache(): void {
  cachedSchema = null;
  cachedBatches.clear();
}
