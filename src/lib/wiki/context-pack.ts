// §6 Personal Context Pack — the export "moat".
//
// AI-OS-ARCHITECTURE §6: the file the user exports is the product's moat. The
// thesis ("AI 시대 가장 가치있는 자산 = 나 자신") is realized when any consumer
// LLM — ChatGPT, Gemini Gems, Claude Projects — can operate on the user as
// their personal OS. That needs a 2-LAYER file, not a big dump:
//
//   Layer 1 (header / router): a compact, self-contained block — SKILL.md /
//     AGENTS.md framing (YAML frontmatter + markdown headings). Identity +
//     "how to use me" RULES + an index of what's inside. Designed to fit the
//     tightest consumer limit (Gemini Gems ~4K chars) ON ITS OWN so it
//     gracefully degrades: the header alone is a working personal context even
//     with no detail attached.
//   Layer 2 (detail): the full wiki pages / sources / records, reused from
//     export.ts. Attached as the Gem/Project "knowledge", pulled on demand.
//
// Two §6 invariants drive the layout:
//   - RULES AT THE TOP (header) — lost-in-the-middle U-curve means rules buried
//     mid-document is worst-case.
//   - THE SESSION REQUEST AT THE VERY BOTTOM — Anthropic's query-at-end is +30%.
//     So `full` ends with a "Your task" placeholder, after all context. For
//     header-only (Gems) use, the consumer's own input box is the query-at-end.
//
// Pure + testable: composeContextPack has no I/O; exportContextPack fetches then
// composes. Vocabulary stays lexicon-clean (creative-agency voice, not clinical).

import { formatPage, formatSource, formatRecord, STRINGS, type ExportRecordRow } from "./export";
import { listSources, listWikiPages } from "./queries";
import { getSupabaseClient } from "../supabase/client";
import type { SourceKind, SourceRow, WikiPageKind, WikiPageRow } from "./types";

/** Consumer-app instruction-size limits (chars). Claude Projects = unlimited. */
export const PACK_TARGET_LIMITS = {
  geminiGems: 4000,
  customGpt: 8000,
} as const;

/** Optional, already lexicon-safe identity woven into the header. */
export interface PackIdentity {
  displayName?: string | null;
  /** One-line "who this is" — e.g. composed from the self-portrait fields. */
  oneLiner?: string | null;
  /** Recurring patterns / traits as short safe labels (e.g. ["Curious"]). */
  topPatterns?: string[];
}

export interface ContextPackOpts {
  asOf?: string;
  locale?: "en" | "ko";
  identity?: PackIdentity;
  /** Header budget for graceful degrade. Default = Gemini Gems (4000). */
  headerCharBudget?: number;
  /** Truncate each detail body to N chars (passed to export helpers). */
  bodyCharLimit?: number;
}

export interface ContextPackSection {
  id: string;
  title: string;
  itemCount: number;
}

export interface ContextPack {
  /** Layer 1 — the router/index header (rules + identity + index). */
  header: string;
  /** Layer 2 — the full knowledge detail. */
  detail: string;
  /** header + detail + the trailing "Your task" placeholder (query-at-end). */
  full: string;
  headerChars: number;
  /** Which consumer targets the header alone fits within. */
  fitsHeaderOnly: { geminiGems: boolean; customGpt: boolean };
  sections: ContextPackSection[];
  pageCount: number;
  sourceCount: number;
  recordCount: number;
}

const PACK_STRINGS = {
  en: {
    title: (name: string | null) => `# ${name ? `${name}'s` : "Your"} personal context — read this first`,
    whoH: "## Who this is",
    whoFallback: "A person building a record of themselves — their knowledge, notes, and patterns — to think with.",
    patterns: (p: string[]) => (p.length > 0 ? ` Recurring patterns: ${p.join(", ")}.` : ""),
    rulesH: "## How to use this (rules)",
    rules: (name: string) => [
      `1. This file is ${name}'s own context — saved knowledge, notes, and patterns. Ground answers in it; do not invent facts about ${name}.`,
      `2. Cite by section name when you use something from here.`,
      `3. Treat ${name} as a capable thinking partner pursuing self-understanding and growth — not as someone to assess. Avoid clinical framing.`,
      `4. If a section you need is not attached, ask for it instead of guessing.`,
      `5. Read these rules first; the specific request is at the very bottom of this file.`,
    ],
    indexH: "## What's inside (index)",
    topicsHint: (tags: string[]) => (tags.length > 0 ? ` (recurring topics: ${tags.join(", ")})` : ""),
    taskH: "## Your task",
    task: (name: string) =>
      `Put your request for ${name} here, at the bottom. Everything above is their context; this is what you want done with it.`,
    you: "you",
  },
  ko: {
    title: (name: string | null) => `# ${name ? `${name}의` : "나의"} 개인 컨텍스트 — 먼저 읽어주세요`,
    whoH: "## 이 사람은",
    whoFallback: "자기 자신을 기록으로 쌓아가는 사람 — 지식·노트·패턴을 모아 함께 생각하기 위해.",
    patterns: (p: string[]) => (p.length > 0 ? ` 반복되는 패턴: ${p.join(", ")}.` : ""),
    rulesH: "## 사용 방법 (규칙)",
    rules: (name: string) => [
      `1. 이 파일은 ${name}의 컨텍스트입니다 — 저장한 지식·노트·패턴. 답변은 여기에 근거하고, ${name}에 대해 없는 사실을 지어내지 마세요.`,
      `2. 여기서 가져온 내용은 섹션 이름으로 인용하세요.`,
      `3. ${name}을(를) 자기 이해와 성장을 추구하는 유능한 사고 파트너로 대하세요 — 평가 대상이 아니라. 임상적 표현은 피하세요.`,
      `4. 필요한 섹션이 첨부되지 않았다면, 추측하지 말고 요청하세요.`,
      `5. 이 규칙을 먼저 읽으세요. 구체적인 요청은 이 파일 맨 아래에 있습니다.`,
    ],
    indexH: "## 안에 들어있는 것 (색인)",
    topicsHint: (tags: string[]) => (tags.length > 0 ? ` (자주 나오는 주제: ${tags.join(", ")})` : ""),
    taskH: "## 당신의 과제",
    task: (name: string) =>
      `${name}에 대한 요청을 여기 맨 아래에 적으세요. 위는 전부 컨텍스트이고, 이게 그걸로 하고 싶은 일입니다.`,
    you: "이 사람",
  },
} as const;

const FRONTMATTER = (name: string | null, date: string) =>
  [
    "---",
    "kind: personal-context-pack",
    "spec: 2nd-Brain Personal Context Layer",
    `owner: ${name ?? "(anonymous)"}`,
    `generated: ${date}`,
    "---",
  ].join("\n");

// Top recurring tags across sources + pages, most frequent first.
function topTags(pages: WikiPageRow[], sources: SourceRow[], limit = 5): string[] {
  const freq = new Map<string, number>();
  for (const t of [...pages.flatMap((p) => p.tags ?? []), ...sources.flatMap((s) => s.tags ?? [])]) {
    const norm = t.trim();
    if (norm.length === 0) continue;
    freq.set(norm, (freq.get(norm) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([t]) => t);
}

/**
 * Compose the 2-layer Personal Context Pack. Pure — no I/O. `records` is
 * opt-in (undefined = no records section, matching export.ts semantics).
 */
export function composeContextPack(
  pages: WikiPageRow[],
  sources: SourceRow[],
  opts: ContextPackOpts = {},
  records?: ExportRecordRow[],
): ContextPack {
  const locale = opts.locale ?? "en";
  const s = PACK_STRINGS[locale];
  const ex = STRINGS[locale];
  const date = opts.asOf ?? new Date().toISOString().slice(0, 10);
  const budget = opts.headerCharBudget ?? PACK_TARGET_LIMITS.geminiGems;

  const name = opts.identity?.displayName?.trim() || null;
  const nameForRules = name ?? s.you;

  const conceptCount = pages.filter((p) => p.kind === "concept").length;
  const entityCount = pages.filter((p) => p.kind === "entity").length;
  const sourcePageCount = pages.filter((p) => p.kind === "source").length;
  const tags = topTags(pages, sources);

  const sections: ContextPackSection[] = [
    { id: "concepts", title: locale === "ko" ? "위키 — 개념" : "Wiki — concepts", itemCount: conceptCount },
    { id: "entities", title: locale === "ko" ? "위키 — 인물·대상" : "Wiki — entities", itemCount: entityCount },
    { id: "source-pages", title: locale === "ko" ? "위키 — 소스 페이지" : "Wiki — source pages", itemCount: sourcePageCount },
    { id: "sources", title: locale === "ko" ? "저장한 소스" : "Saved sources", itemCount: sources.length },
  ];
  if (records !== undefined) {
    sections.push({ id: "records", title: locale === "ko" ? "기록 — 일기·노트" : "Records — journal & notes", itemCount: records.length });
  }

  // --- Layer 1: header (router / index) ---
  const indexLines = sections
    .filter((sec) => sec.itemCount > 0 || sec.id === "sources")
    .map((sec) => {
      const hint = sec.id === "sources" ? s.topicsHint(tags) : "";
      return `- **${sec.title}**: ${sec.itemCount}${hint}`;
    });

  const who = opts.identity?.oneLiner?.trim() || s.whoFallback;
  const headerParts = [
    FRONTMATTER(name, date),
    "",
    s.title(name),
    "",
    s.whoH,
    "",
    `${who}${s.patterns(opts.identity?.topPatterns ?? [])}`,
    "",
    s.rulesH,
    "",
    ...s.rules(nameForRules),
    "",
    s.indexH,
    "",
    ...indexLines,
  ];
  const header = headerParts.join("\n");

  // --- Layer 2: detail (full knowledge) ---
  const pagesBlock = pages.length === 0 ? ex.noPages : pages.map((p) => formatPage(p, opts.bodyCharLimit, locale)).join("\n\n");
  const sourcesBlock = sources.length === 0 ? ex.noSources : sources.map((src) => formatSource(src, locale)).join("\n");
  const detailParts = [ex.pagesH, "", pagesBlock, "", ex.sourcesH, "", sourcesBlock];
  if (records !== undefined) {
    const recordsBlock = records.length === 0 ? ex.noRecords : records.map((r) => formatRecord(r, opts.bodyCharLimit, locale)).join("\n\n");
    detailParts.push("", ex.recordsH, "", recordsBlock);
  }
  const detail = detailParts.join("\n");

  // --- full: header + detail + query-at-end task placeholder ---
  const full = [header, "", detail, "", s.taskH, "", s.task(nameForRules)].join("\n");

  return {
    header,
    detail,
    full,
    headerChars: header.length,
    fitsHeaderOnly: {
      geminiGems: header.length <= budget,
      customGpt: header.length <= PACK_TARGET_LIMITS.customGpt,
    },
    sections,
    pageCount: pages.length,
    sourceCount: sources.length,
    recordCount: records?.length ?? 0,
  };
}

export interface ExportContextPackOpts extends ContextPackOpts {
  pageKinds?: WikiPageKind[];
  sourceKinds?: SourceKind[];
  pageLimit?: number;
  sourceLimit?: number;
  includeRecords?: boolean;
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

/** Fetch the user's data and compose their Personal Context Pack. */
export async function exportContextPack(userId: string, opts: ExportContextPackOpts = {}): Promise<ContextPack> {
  const [pages, sources, records] = await Promise.all([
    listWikiPages(userId, { kinds: opts.pageKinds, limit: opts.pageLimit ?? 500 }),
    listSources(userId, { kinds: opts.sourceKinds, limit: opts.sourceLimit ?? 500 }),
    opts.includeRecords ? listRecordsForExport(userId, opts.recordLimit ?? 500) : Promise.resolve(undefined),
  ]);
  return composeContextPack(pages, sources, opts, records);
}
