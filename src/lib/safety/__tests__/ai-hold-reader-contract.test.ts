import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const root = resolve(__dirname, "../../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n");
function fn(path: string, name: string): string {
  const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = source.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!declaration) throw new Error(`Missing ${name} in ${path}`);
  return declaration.getText(source);
}

test.each([
  ["src/lib/chat/conversation.ts", "gatherChatContext", 2],
  ["src/lib/ops/daily-brief.ts", "", 1],
  ["src/lib/ops/recommend.ts", "", 1],
])("every model wiki-export caller opts into AI eligibility: %s", (path, _name, count) => {
  expect(read(path).match(/forAi: true/g)).toHaveLength(count);
});

test.each([
  ["src/lib/persona/build.ts", "buildPersona"],
  ["src/lib/persona/role-cards.ts", "proposeRoleCards"],
  ["src/lib/persona/seven-proposal-context.ts", "buildSevenProposalContext"],
])("tag-dependent model reads retain the hold filter across compatibility attempts: %s", (path, name) => {
  const body = fn(path, name);
  expect(body).toMatch(/withSystemTagsColumn\([\s\S]*?\.from\("records"\)[\s\S]*?\.eq\("ai_hold", false\)/);
});

test("persona rebuild uses AI-only assessments; result-only screens keep the original reader defaults", () => {
  const build = fn("src/lib/persona/build.ts", "buildPersona");
  for (const name of ["loadLatestMbti", "loadLatestAttachment", "loadLatestBfi", "loadLatestIpip"]) {
    expect(build).toContain(`${name}(supabase, userId, true)`);
    const reader = fn("src/lib/persona/build.ts", name);
    expect(reader).toContain("aiOnly = false");
    expect(reader).toContain('.from(aiOnly ? "records_ai_eligible" : "records")');
  }
});

test("every batch index and inferred-link traversal reads eligible pages", () => {
  for (const name of ["backfillEmbeddings", "proposeAllRelatedLinks"]) {
    expect(fn("src/lib/wiki/embeddings.ts", name)).toContain("listWikiPages(userId, { limit: 200, aiOnly: true })");
  }
});

test("role-card preparation also opts into eligible assessment enrichment", () => {
  expect(fn("src/lib/persona/role-cards.ts", "proposeRoleCards")).toContain("loadPersonaSnapshot(userId, undefined, true)");
  const snapshot = fn("src/lib/persona/build.ts", "loadPersonaSnapshot");
  expect(snapshot).toContain("aiOnly = false");
  expect(snapshot).toContain("loadLatestMbti(supabase, userId, aiOnly)");
  expect(snapshot).toContain("loadLatestAttachment(supabase, userId, aiOnly)");
});

test("ordinary UI/export/count/storage recovery readers remain unfiltered", () => {
  for (const path of [
    "src/lib/records/list-all-records.ts", "src/lib/records/get-piece.ts", "src/lib/records/source-pieces.ts",
    "src/lib/persona/load-evidence-shards.ts", "src/lib/growth/gather.ts", "src/lib/trends/gather.ts",
    "src/lib/dashboard/load.ts", "src/lib/wiki/promote-pending.ts", "supabase/functions/export-account/index.ts",
  ]) {
    expect(read(path)).not.toMatch(/_ai_eligible|\.eq\(["']ai_hold["'],\s*false\)/);
  }
  expect(read("src/screens/deepspace/DeepSpaceDesignScreens.tsx")).toContain('exportUserWiki(userId, { locale, includeRecords, aiCopyTail: t("secondb:aiCopyTail") })');
});

const draft = read("db/migration-drafts/UNNUMBERED_ai_hold_readers.sql");
function sqlFunction(sql: string, name: string): string {
  const block = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`));
  if (!block) throw new Error(`Missing SQL ${name}`);
  return block[0];
}
test.each(["match_records", "match_wiki_pages"])("server search draft changes only the source view: %s", name => {
  const before = sqlFunction(read("db/migrations/0142_embedding_provenance.sql"), name);
  const after = sqlFunction(draft, name);
  expect(after).toBe(before.replace("FROM records r", "FROM public.records_ai_eligible r")
    .replace("FROM wiki_pages w", "FROM public.wiki_pages_ai_eligible w"));
});
test.each(["reserve_polaris_generation", "polaris_evidence_snapshot"])("Polaris draft adds hold exclusion without changing owner/locks/settlement: %s", name => {
  const before = sqlFunction(read("db/migrations/0225_interview_transcript_ledger.sql"), name);
  expect(sqlFunction(draft, name)).toBe(before
    .replace("AND NOT interview_ai_hold", "AND NOT interview_ai_hold AND NOT ai_hold")
    .replace("AND NOT r.interview_ai_hold", "AND NOT r.interview_ai_hold AND NOT r.ai_hold"));
});
test("server dashboard source reads routines only, not the held-record corpus", () => {
  const source = read("db/migrations/0236_dashboard_generation.sql").split("CREATE FUNCTION public.dashboard_generation_source")[1].split("$$;")[0];
  expect(source).toContain("FROM public.ops_routines");
  expect(source).not.toMatch(/public\.(records|sources|wiki_pages)\b/);
});
