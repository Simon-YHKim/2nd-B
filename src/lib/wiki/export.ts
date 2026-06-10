// Wiki export — bundle the user's wiki pages + sources into a single markdown
// blob suitable for pasting into another LLM (Claude / ChatGPT / etc.) as
// context. Delivers on the landing-page "your second brain travels" promise.
//
// Two layers:
//   - composeWikiExport(pages, sources, opts)  — pure, testable, no DB
//   - exportUserWiki(userId, opts)             — fetches via queries then composes
//
// Format is Obsidian-flavored markdown: [[wikilinks]] preserved, frontmatter
// per page, source index at the bottom. The receiver LLM gets a context bundle
// it can search and cite.

import { joinFrontmatter } from "./frontmatter";
import { listSources, listWikiPages } from "./queries";
import { getSupabaseClient } from "../supabase/client";
import type { SourceKind, SourceRow, WikiPageKind, WikiPageRow } from "./types";

// P2-2 (persona sim): journal/note records are the user's MOST personal data,
// and the danger-zone copy points at this export as the pre-delete backup —
// yet the bundle only carried pages+sources. Records are now included, but
// STRICTLY OPT-IN (includeRecords): the chat RAG snapshot reuses this module
// and must never silently start shipping diary text into prompts.
export interface ExportRecordRow {
  kind: string;
  topic: string | null;
  body: string;
  created_at: string;
  tags: string[] | null;
}

export interface ComposeOpts {
  /** Header date stamp (defaults to today's ISO date). */
  asOf?: string;
  /** Optional user display name woven into the system prompt header. */
  userDisplayName?: string;
  /** Filter to these page kinds; omit for all. */
  pageKinds?: WikiPageKind[];
  /** Filter to these source kinds; omit for all. */
  sourceKinds?: SourceKind[];
  /** Truncate each page body to this many characters; omit for no truncation. */
  bodyCharLimit?: number;
  /** Localized strings — defaults to English. */
  locale?: "en" | "ko";
}

export interface WikiExport {
  /** The full markdown bundle. */
  prompt: string;
  /** Counts surfaced so the UI can show "exported X pages, Y sources". */
  pageCount: number;
  /** Counts of pages by kind. */
  pageCountsByKind: Record<WikiPageKind, number>;
  sourceCount: number;
  /** Journal/note records included (0 unless includeRecords was requested). */
  recordCount: number;
}

const STRINGS = {
  en: {
    header: (n: number, m: number, date: string, name: string | null) =>
      `# 2nd-Brain knowledge export — ${date}\n\nYou are consulting${name ? ` ${name}'s` : ""} 2nd-Brain — a personal knowledge graph of ${n} wiki page(s) and ${m} source(s). Pages use Obsidian-style [[wikilinks]] that resolve to other slugs in this bundle. When you cite a page in a reply, use its slug in [[double brackets]].`,
    pagesH: "## Wiki pages",
    sourcesH: "## Sources",
    recordsH: "## Records (journal & notes)",
    noPages: "_(no wiki pages yet)_",
    noSources: "_(no sources yet)_",
    noRecords: "_(no records yet)_",
    truncated: (n: number) => `\n\n_(body truncated — original is ${n} chars)_`,
  },
  ko: {
    header: (n: number, m: number, date: string, name: string | null) =>
      `# 두번째 뇌 지식 내보내기 — ${date}\n\n${name ? `${name}의 ` : ""}두번째 뇌를 참고하는 중이에요. 위키 페이지 ${n}개, 소스 ${m}개로 구성돼 있어요. 페이지는 Obsidian 스타일 [[wikilink]]로 서로 연결됩니다. 답변에서 페이지를 인용할 때는 [[슬러그]] 형식을 사용해 주세요.`,
    pagesH: "## 위키 페이지",
    sourcesH: "## 소스",
    recordsH: "## 기록 (일기·노트)",
    noPages: "_(아직 위키 페이지가 없어요)_",
    noSources: "_(아직 소스가 없어요)_",
    noRecords: "_(아직 기록이 없어요)_",
    truncated: (n: number) => `\n\n_(본문 잘림 — 원본은 ${n}자)_`,
  },
} as const;

// Allowlist (fail-closed) of frontmatter keys safe to send to an external LLM.
// Arbitrary clipper frontmatter (geolocation, tracking-token URLs, private
// notes) is dropped by default; add a key here only after confirming it is safe
// to egress. Replaces the prior underscore-denylist, which failed open: any
// non-`_`-prefixed internal/private key leaked into the exported bundle.
const EXPORT_SAFE_FRONTMATTER_KEYS = new Set([
  "title", "summary", "summary_en", "summary_ko",
  "aliases", "description", "lang", "category", "author", "published",
]);

function formatPage(page: WikiPageRow, bodyCharLimit: number | undefined, locale: "en" | "ko"): string {
  // Keep ONLY export-safe frontmatter keys (allowlist, fail-closed) so no
  // internal/private clipper frontmatter leaks into the exported LLM context.
  const publicFrontmatter = Object.fromEntries(
    Object.entries(page.frontmatter ?? {}).filter(([k]) => EXPORT_SAFE_FRONTMATTER_KEYS.has(k)),
  );
  const headerFrontmatter = {
    slug: page.slug,
    kind: page.kind,
    tags: page.tags,
    ...publicFrontmatter,
  };
  let body = page.body_md;
  if (bodyCharLimit !== undefined && body.length > bodyCharLimit) {
    body = body.slice(0, bodyCharLimit) + STRINGS[locale].truncated(page.body_md.length);
  }
  const md = joinFrontmatter(headerFrontmatter, body || "");
  return `### [[${page.slug}]]\n\n${md}`;
}

function formatSource(s: SourceRow, locale: "en" | "ko"): string {
  const labelByKind: Record<SourceKind, { en: string; ko: string }> = {
    inbox: { en: "Inbox", ko: "받은편지함" },
    article: { en: "Article", ko: "아티클" },
    video: { en: "Video", ko: "영상" },
    paper: { en: "Paper", ko: "논문" },
    reddit: { en: "Reddit", ko: "레딧" },
    code: { en: "Code", ko: "코드" },
    ai_tool: { en: "AI Tool", ko: "AI 도구" },
    self_knowledge: { en: "Self-Knowledge", ko: "자기 이해" },
  };
  const tags = s.tags.length > 0 ? ` · tags: ${s.tags.join(", ")}` : "";
  const url = s.source_url ? ` · ${s.source_url}` : "";
  const rel = s.simon_relevance !== null ? ` · relevance ${s.simon_relevance}/5` : "";
  const ingest = s.ingested ? "" : locale === "ko" ? " · 미수집" : " · uningested";
  return `- [${labelByKind[s.kind][locale]}] ${s.title}${url}${tags}${rel}${ingest}`;
}

function formatRecord(r: ExportRecordRow, bodyCharLimit: number | undefined, locale: "en" | "ko"): string {
  const kindLabel: Record<string, { en: string; ko: string }> = {
    journal: { en: "Journal", ko: "일기" },
    note: { en: "Note", ko: "노트" },
    audit_response: { en: "Life audit", ko: "라이프 오딧" },
  };
  const date = r.created_at.slice(0, 10);
  const label = (kindLabel[r.kind] ?? { en: r.kind, ko: r.kind })[locale];
  const tags = r.tags && r.tags.length > 0 ? ` · tags: ${r.tags.join(", ")}` : "";
  let body = r.body;
  if (bodyCharLimit !== undefined && body.length > bodyCharLimit) {
    body = body.slice(0, bodyCharLimit) + STRINGS[locale].truncated(r.body.length);
  }
  const title = r.topic && r.topic.trim().length > 0 ? ` — ${r.topic.trim()}` : "";
  return `### ${date} · ${label}${title}${tags}\n\n${body}`;
}

export function composeWikiExport(
  pages: WikiPageRow[],
  sources: SourceRow[],
  opts: ComposeOpts = {},
  // Opt-in (P2-2): undefined = records section entirely absent, keeping the
  // chat RAG snapshot byte-identical to the pre-records format. Pass [] to
  // render the section with the empty marker.
  records?: ExportRecordRow[],
): WikiExport {
  const locale = opts.locale ?? "en";
  const strings = STRINGS[locale];
  const date = opts.asOf ?? new Date().toISOString().slice(0, 10);

  const header = strings.header(pages.length, sources.length, date, opts.userDisplayName ?? null);

  const pagesBlock =
    pages.length === 0
      ? strings.noPages
      : pages.map((p) => formatPage(p, opts.bodyCharLimit, locale)).join("\n\n");

  const sourcesBlock =
    sources.length === 0
      ? strings.noSources
      : sources.map((s) => formatSource(s, locale)).join("\n");

  const parts = [
    header,
    "",
    strings.pagesH,
    "",
    pagesBlock,
    "",
    strings.sourcesH,
    "",
    sourcesBlock,
    "",
  ];

  if (records !== undefined) {
    const recordsBlock =
      records.length === 0
        ? strings.noRecords
        : records.map((r) => formatRecord(r, opts.bodyCharLimit, locale)).join("\n\n");
    parts.push(strings.recordsH, "", recordsBlock, "");
  }

  const prompt = parts.join("\n");

  const pageCountsByKind: Record<WikiPageKind, number> = { source: 0, entity: 0, concept: 0 };
  for (const p of pages) pageCountsByKind[p.kind] += 1;

  return {
    prompt,
    pageCount: pages.length,
    pageCountsByKind,
    sourceCount: sources.length,
    recordCount: records?.length ?? 0,
  };
}

export interface ExportUserWikiOpts extends ComposeOpts {
  /** Cap on pages fetched. Defaults to 500. */
  pageLimit?: number;
  /** Cap on sources fetched. Defaults to 500. */
  sourceLimit?: number;
  /** Include journal/note records (P2-2). OPT-IN: only the user-facing
   *  full-export surface sets this — the chat RAG snapshot must not. */
  includeRecords?: boolean;
  /** Cap on records fetched. Defaults to 500 (newest first). */
  recordLimit?: number;
}

async function listRecordsForExport(userId: string, limit: number): Promise<ExportRecordRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("records")
    .select("kind, topic, body, created_at, tags")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ExportRecordRow[];
}

export async function exportUserWiki(userId: string, opts: ExportUserWikiOpts = {}): Promise<WikiExport> {
  const [pages, sources, records] = await Promise.all([
    listWikiPages(userId, { kinds: opts.pageKinds, limit: opts.pageLimit ?? 500 }),
    listSources(userId, { kinds: opts.sourceKinds, limit: opts.sourceLimit ?? 500 }),
    opts.includeRecords ? listRecordsForExport(userId, opts.recordLimit ?? 500) : Promise.resolve(undefined),
  ]);
  return composeWikiExport(pages, sources, opts, records);
}
