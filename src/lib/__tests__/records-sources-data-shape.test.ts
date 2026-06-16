import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { SourceRow, WikiPageRow } from "../wiki/types";

type InsertRecordRow = {
  user_id: string;
  kind: string;
  body: string;
  topic: string | null;
  tags: string[];
};

const recordRows: Array<InsertRecordRow & { id: string; created_at: string }> = [];
const sourceRows: SourceRow[] = [];
const wikiRows: WikiPageRow[] = [];
const repoRoot = path.resolve(__dirname, "../../..");

jest.mock("../llm/gemini", () => ({
  callAdvisor: jest.fn(),
  callGemini: jest.fn(),
  classifyRecordTextForCrisis: jest.fn().mockResolvedValue(null),
}));

jest.mock("../progression/xp", () => ({
  awardXpSafe: jest.fn().mockResolvedValue(null),
}));

jest.mock("../knowledge/engines", () => ({
  buildMemorizedPattern: jest.fn(() => ({ user_id: "u1" })),
}));

jest.mock("../wiki/storage", () => ({
  rawClippingPath: (userId: string, slug: string) => `${userId}/${slug}.md`,
  uploadRawClipping: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../wiki/queries", () => ({
  createSource: jest.fn((input: Omit<SourceRow, "id" | "captured_at" | "ingested" | "ingested_at">) => {
    const row: SourceRow = {
      ...input,
      id: `s${sourceRows.length + 1}`,
      captured_at: "2026-06-14T03:10:00Z",
      ingested: false,
      ingested_at: null,
    };
    sourceRows.push(row);
    return Promise.resolve(row);
  }),
  listSources: jest.fn(() => Promise.resolve(sourceRows)),
  listWikiPages: jest.fn(() => Promise.resolve(wikiRows)),
  // §1 ingest gate (0044): no prior clip -> capture follows the keep path.
  findIngestCandidates: jest.fn(() => Promise.resolve([])),
  recordIngestDrop: jest.fn(() => Promise.resolve()),
}));

jest.mock("../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      if (table !== "records") throw new Error(`unexpected table ${table}`);
      return {
        insert: (row: InsertRecordRow) => ({
          select: () => ({
            single: async () => {
              const stored = {
                ...row,
                id: `r${recordRows.length + 1}`,
                created_at: "2026-06-14T03:00:00Z",
              };
              recordRows.push(stored);
              return { data: { id: stored.id }, error: null };
            },
          }),
        }),
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({
                data: recordRows.map((r) => ({
                  kind: r.kind,
                  topic: r.topic,
                  body: r.body,
                  created_at: r.created_at,
                  tags: r.tags,
                })),
                error: null,
              }),
            }),
          }),
        }),
      };
    },
  }),
}));

import { createRecord } from "../records/create";
import { mergeEvidence } from "../persona/evidence";
import { captureFromMarkdown } from "../wiki/capture";
import { exportUserWiki } from "../wiki/export";

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (name !== "__tests__") walkTsFiles(full, out);
      continue;
    }
    if (/\.(?:ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function sourcesQueryBlocks(source: string): string[] {
  const blocks: string[] = [];
  const fromSources = /\.from\(\s*["']sources["']\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = fromSources.exec(source)) !== null) {
    const start = match.index;
    const nextFrom = source.indexOf(".from(", start + 1);
    const nextSemicolon = source.indexOf(";", start);
    const candidates = [nextFrom, nextSemicolon].filter((index) => index > start);
    const end = candidates.length > 0 ? Math.min(...candidates) : Math.min(source.length, start + 1200);
    blocks.push(source.slice(start, end));
  }
  return blocks;
}

function selectArgs(block: string): string[] {
  const args: string[] = [];
  const selectCall = /\.select\s*\(\s*(["'`])([\s\S]*?)\1/g;
  let match: RegExpExecArray | null;
  while ((match = selectCall.exec(block)) !== null) {
    args.push(match[2] ?? "");
  }
  return args;
}

function topLevelSelectItems(selectArg: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let item = "";

  for (const char of selectArg) {
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      items.push(item.trim());
      item = "";
      continue;
    }
    item += char;
  }

  if (item.trim()) items.push(item.trim());
  return items;
}

function selectsTopLevelCreatedAt(selectArg: string): boolean {
  return topLevelSelectItems(selectArg).some((item) => {
    const normalized = item.replace(/\s+/g, "");
    const column = normalized.includes(":") ? normalized.split(":").at(-1) : normalized;
    return column === "created_at";
  });
}

function sourcesCreatedAtViolations(): string[] {
  const files = [...walkTsFiles(path.join(repoRoot, "src", "app")), ...walkTsFiles(path.join(repoRoot, "src", "lib"))];
  const violations: string[] = [];
  for (const file of files) {
    const rel = path.relative(repoRoot, file).split(path.sep).join("/");
    const source = readFileSync(file, "utf8");
    for (const block of sourcesQueryBlocks(source)) {
      if (/\.order\s*\(\s*["'`]created_at["'`]/.test(block)) {
        violations.push(`${rel}: sources query orders by created_at`);
      }
      if (selectArgs(block).some(selectsTopLevelCreatedAt)) {
        violations.push(`${rel}: sources query selects created_at`);
      }
    }
  }
  return violations;
}

describe("records and sources data-shape contract", () => {
  beforeEach(() => {
    recordRows.length = 0;
    sourceRows.length = 0;
    wikiRows.length = 0;
  });

  test("createRecord and captureFromMarkdown rows remain consumable by evidence merge and wiki export", async () => {
    await createRecord({
      userId: "u1",
      locale: "en",
      kind: "journal",
      body: "Journal body that should survive export.",
      topic: "Morning review",
      tags: ["daily", "work"],
      withFollowup: false,
    });

    await captureFromMarkdown({
      userId: "u1",
      rawMd: "# Captured insight\n\nA source body that should survive source export.",
      kindOverride: "self_knowledge",
      userTags: ["taste"],
      simonRelevance: 0.6,
    });

    expect(recordRows).toHaveLength(1);
    expect(sourceRows).toHaveLength(1);

    const evidence = mergeEvidence(recordRows, sourceRows, "en");
    expect(evidence.map((row) => [row.origin, row.id, row.type, row.title, row.route])).toEqual([
      ["source", "s1", "capture", "Captured insight", "/capture"],
      ["record", "r1", "journal", "Morning review", "/capture"],
    ]);
    expect(Object.fromEntries(evidence.map((row) => [row.id, row.domain]))).toMatchObject({
      r1: "work",
      s1: "taste",
    });

    const exported = await exportUserWiki("u1", {
      asOf: "2026-06-14",
      includeRecords: true,
    });

    expect(exported.sourceCount).toBe(1);
    expect(exported.recordCount).toBe(1);
    expect(exported.prompt).toContain("[Self-Knowledge] Captured insight");
    expect(exported.prompt).toContain("tags: taste");
    expect(exported.prompt).toContain("relevance 3/5");
    expect(exported.prompt).toContain("### 2026-06-14");
    expect(exported.prompt).toMatch(/Journal\s+\S+\s+Morning review/);
    expect(exported.prompt).toContain("tags: daily, work");
    expect(exported.prompt).toContain("Journal body that should survive export.");
  });

  test("sources queries use captured_at instead of created_at", () => {
    expect(sourcesCreatedAtViolations()).toEqual([]);
  });
});
