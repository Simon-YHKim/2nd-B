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
import type { SourceKind, SourceRow, WikiPageKind, WikiPageRow } from "./types";

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
}

const STRINGS = {
  en: {
    header: (n: number, m: number, date: string, name: string | null) =>
      `# 2nd-Brain knowledge export — ${date}\n\nYou are consulting${name ? ` ${name}'s` : ""} 2nd-Brain — a personal knowledge graph of ${n} wiki page(s) and ${m} source(s). Pages use Obsidian-style [[wikilinks]] that resolve to other slugs in this bundle. When you cite a page in a reply, use its slug in [[double brackets]].`,
    pagesH: "## Wiki pages",
    sourcesH: "## Sources",
    noPages: "_(no wiki pages yet)_",
    noSources: "_(no sources yet)_",
    truncated: (n: number) => `\n\n_(body truncated — original is ${n} chars)_`,
  },
  ko: {
    header: (n: number, m: number, date: string, name: string | null) =>
      `# 두번째 뇌 지식 내보내기 — ${date}\n\n${name ? `${name}의 ` : ""}두번째 뇌를 참고하는 중이에요. 위키 페이지 ${n}개, 소스 ${m}개로 구성돼 있어요. 페이지는 Obsidian 스타일 [[wikilink]]로 서로 연결됩니다. 답변에서 페이지를 인용할 때는 [[슬러그]] 형식을 사용해 주세요.`,
    pagesH: "## 위키 페이지",
    sourcesH: "## 소스",
    noPages: "_(아직 위키 페이지가 없어요)_",
    noSources: "_(아직 소스가 없어요)_",
    truncated: (n: number) => `\n\n_(본문 잘림 — 원본은 ${n}자)_`,
  },
} as const;

function formatPage(page: WikiPageRow, bodyCharLimit: number | undefined, locale: "en" | "ko"): string {
  const headerFrontmatter = {
    slug: page.slug,
    kind: page.kind,
    tags: page.tags,
    ...page.frontmatter,
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

export function composeWikiExport(
  pages: WikiPageRow[],
  sources: SourceRow[],
  opts: ComposeOpts = {},
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

  const prompt = [
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
  ].join("\n");

  const pageCountsByKind: Record<WikiPageKind, number> = { source: 0, entity: 0, concept: 0 };
  for (const p of pages) pageCountsByKind[p.kind] += 1;

  return {
    prompt,
    pageCount: pages.length,
    pageCountsByKind,
    sourceCount: sources.length,
  };
}

export interface ExportUserWikiOpts extends ComposeOpts {
  /** Cap on pages fetched. Defaults to 500. */
  pageLimit?: number;
  /** Cap on sources fetched. Defaults to 500. */
  sourceLimit?: number;
}

export async function exportUserWiki(userId: string, opts: ExportUserWikiOpts = {}): Promise<WikiExport> {
  const [pages, sources] = await Promise.all([
    listWikiPages(userId, { kinds: opts.pageKinds, limit: opts.pageLimit ?? 500 }),
    listSources(userId, { kinds: opts.sourceKinds, limit: opts.sourceLimit ?? 500 }),
  ]);
  return composeWikiExport(pages, sources, opts);
}
