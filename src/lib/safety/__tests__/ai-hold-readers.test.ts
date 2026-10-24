// Real readers over a filtering in-memory transport. No model, network or RN renderer.
type Row = Record<string, unknown>;
const mockTables: Record<string, Row[]> = {};
const mockErrors = new Set<string>();
const mockReads: string[] = [];
const mockEmbed = jest.fn();
const mockLlm = jest.fn();
const mockDownload = jest.fn();
const mockRpc = jest.fn();

function mockQuery(table: string) {
  mockReads.push(table);
  const base = table.replace(/_ai_eligible$/, "");
  const filters: ((row: Row) => boolean)[] = [];
  let cap = Infinity;
  let offset = 0;
  let patch: Row | undefined;
  let order: { field: string; ascending: boolean } | undefined;
  const reply = () => {
    if (mockErrors.has(table)) return { data: null, error: new Error("read unavailable") };
    let rows = (mockTables[base] ?? []).filter(row => {
      if (!table.endsWith("_ai_eligible")) return true;
      if (row.ai_hold !== false || row.interview_ai_hold === true) return false;
      return base !== "wiki_pages" || row.source_id === null ||
        mockTables.sources.some(source => source.id === row.source_id && source.user_id === row.user_id && source.ai_hold === false);
    }).filter(row => filters.every(filter => filter(row)));
    if (order) {
      const { field, ascending } = order;
      rows = rows.slice().sort((a, b) => String(a[field]).localeCompare(String(b[field])) * (ascending ? 1 : -1));
    }
    rows = rows.slice(offset, offset + cap);
    if (patch) for (const row of rows) Object.assign(row, patch);
    return { data: rows, error: null };
  };
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
    in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
    is: (key: string, value: unknown) => { filters.push(row => (row[key] ?? null) === value); return query; },
    not: (key: string, _op: string, value: unknown) => { filters.push(row => (row[key] ?? null) !== value); return query; },
    contains: (key: string, values: string[]) => { filters.push(row => values.every(value => (row[key] as string[] ?? []).includes(value))); return query; },
    order: (field: string, opts: { ascending: boolean } = { ascending: true }) => { order = { field, ...opts }; return query; },
    limit: (value: number) => { cap = value; return query; },
    range: (from: number, to: number) => { offset = from; cap = to - from + 1; return query; },
    lt: (key: string, value: string) => { filters.push(row => String(row[key]) < value); return query; },
    abortSignal: () => query,
    update: (value: Row) => { patch = value; return query; },
    upsert: (value: Row) => { mockTables[base] = [value]; return query; },
    maybeSingle: async () => { const result = reply(); return { ...result, data: result.data?.[0] ?? null }; },
    then: <T>(resolve: (value: ReturnType<typeof reply>) => T) => Promise.resolve(reply()).then(resolve),
  };
  return query;
}

jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({ from: mockQuery, rpc: mockRpc }) }));
jest.mock("../../llm/boundary", () => ({ EMBED_DIM: 2, embedTexts: (...args: unknown[]) => mockEmbed(...args), callLlm: (...args: unknown[]) => mockLlm(...args) }));
jest.mock("../../wiki/storage", () => ({ downloadRawClipping: (...args: unknown[]) => mockDownload(...args) }));
jest.mock("../../env", () => ({ getEnv: () => ({ EXPO_PUBLIC_LLM_MODE: "mock" }) }));
jest.mock("../../interview/coverage-store", () => ({ loadCoverage: async () => ({ school: { fact: 1, feeling: 1, meaning: 0, belief: 0, echo: 0 } }) }));

import { getAiRecord, hasAiHeldRows } from "../ai-read";
import { getSource, getWikiPageById, listSources, listWikiPages } from "../../wiki/queries";
import { exportUserWiki } from "../../wiki/export";
import { exportContextPack } from "../../wiki/context-pack";
import { embedAndStorePage, backfillEmbeddings, relatedByEmbedding } from "../../wiki/embeddings";
import { embedAndStoreRecord, backfillRecordEmbeddings, relatedRecordsByEmbedding } from "../../records/records-embeddings";
import { loadStructuredContext } from "../../records/load-structured";
import { runPhase1 } from "../../wiki/phase1";
import { generateSourcePage, SourceAiHeldError, SourceNotFoundError } from "../../wiki/phase2";
import { materializeGraphFromPhase1 } from "../../wiki/materialize";
import { proposeNorthstarSentences } from "../../persona/northstar";
import { buildSevenProposalContext } from "../../persona/seven-proposal-context";
import { buildPersona, loadLatestBfi, loadPersonaSnapshot } from "../../persona/build";
import { getSupabaseClient } from "../../supabase/client";
import { CHAT_KEEP_TAG } from "../../chat/keep-exchange";
import { recheckRoleProposalEvidence, type RoleCard } from "../../persona/role-cards";
import { retrieveChatContext } from "../../chat/rag";
import { __resetAccountEpochForTests, noteResolvedOwner, clearAccountTransition, currentAccountEpoch } from "../../auth/account-epoch";

const stamp = "2026-10-24T00:00:00Z";
function source(id: string, ai_hold = false): Row {
  return { id, user_id: "owner", ai_hold, kind: "article", title: id, source_url: null,
    storage_path: `owner/${id}.md`, tags: [], frontmatter: {}, captured_at: stamp,
    ingested: false, ingested_at: null, simon_relevance: null };
}
function page(id: string, ai_hold = false, source_id: string | null = null): Row {
  return { id, user_id: "owner", ai_hold, source_id, kind: "concept", slug: id,
    title: id, body_md: `${id} body`, frontmatter: {}, tags: [], created_at: stamp, updated_at: stamp };
}
function record(id: string, ai_hold = false): Row {
  return { id, user_id: "owner", ai_hold, interview_ai_hold: false, kind: "note",
    topic: id, body: `${id} body`, summary: null, tags: [], system_tags: [], created_at: stamp,
    structured: { form: "fourw", version: 1, fields: { what: `${id} body` } } };
}
beforeEach(() => {
  jest.clearAllMocks(); mockReads.length = 0; mockErrors.clear();
  for (const key of Object.keys(mockTables)) delete mockTables[key];
  mockTables.sources = [source("source-ok"), source("source-held", true)];
  mockTables.wiki_pages = [page("page-ok"), page("page-held", true), page("parent-held", false, "source-held")];
  mockTables.records = [record("record-ok"), record("record-held", true)];
  mockEmbed.mockImplementation(async (input: { texts: string[] }) => ({ vectors: input.texts.map(() => [1, 2]), audit: { modelUsed: "test-model" } }));
  mockLlm.mockResolvedValue({ text: '{"sentences":["One","Two","Three"]}', safety: { zone: "green" }, audit: { modelUsed: "test-model" } });
  mockDownload.mockImplementation(async (path: string) => `${path} body`);
  __resetAccountEpochForTests(); noteResolvedOwner("owner"); clearAccountTransition(currentAccountEpoch());
});

test("source and page lists/details retain originals for the user and exclude holds only for AI", async () => {
  expect(await listSources("owner")).toHaveLength(2);
  expect(await listSources("owner", { aiOnly: true })).toHaveLength(1);
  expect(await getSource("owner", "source-held")).not.toBeNull();
  expect(await getSource("owner", "source-held", true)).toBeNull();
  expect(await listWikiPages("owner")).toHaveLength(3);
  expect(await listWikiPages("owner", { aiOnly: true })).toHaveLength(1);
  expect(await getWikiPageById("owner", "page-held")).not.toBeNull();
  expect(await getWikiPageById("owner", "page-held", true)).toBeNull();
  expect(await getWikiPageById("owner", "parent-held", true)).toBeNull();
});

test("AI wiki context excludes held titles/bodies, while full user export keeps every original", async () => {
  const ai = await exportUserWiki("owner", { forAi: true, includeRecords: true });
  expect(ai).toMatchObject({ pageCount: 1, sourceCount: 1, recordCount: 1 });
  expect(ai.prompt).not.toContain("held");
  expect(ai.prompt).toContain("record-ok body");
  const backup = await exportUserWiki("owner", { includeRecords: true });
  expect(backup).toMatchObject({ pageCount: 3, sourceCount: 2, recordCount: 2 });
  expect(backup.prompt).toContain("record-held body");
});

test("AI context-pack and structured context omit held records", async () => {
  const pack = await exportContextPack("owner", { includeRecords: true });
  expect(pack).toMatchObject({ pageCount: 1, sourceCount: 1, recordCount: 1 });
  expect(JSON.stringify(pack)).not.toContain("held");
  const structured = await loadStructuredContext("owner");
  expect(structured).toContain("record-ok body");
  expect(structured).not.toContain("record-held");
});

test.each([false, true])("a held promoted page cannot re-enter AI context through its kept source (fallback=%s)", async fallback => {
  const kept = { ...source("kept"), kind: "self_knowledge", tags: [CHAT_KEEP_TAG], frontmatter: { _body_fallback: "HELD TRANSCRIPT" } };
  mockTables.sources = [kept];
  mockTables.wiki_pages = [page("held-promotion", true, "kept"), page("visible")];
  if (fallback) mockDownload.mockRejectedValue(new Error("offline"));
  else mockDownload.mockResolvedValue("HELD TRANSCRIPT");
  const result = await exportUserWiki("owner", { forAi: true, includeSavedConversations: true, pageLimit: 1 });
  expect(result.prompt).not.toContain("HELD TRANSCRIPT");
  expect(result.prompt).not.toContain("Saved conversations");
  expect(mockDownload).not.toHaveBeenCalled();
  const backup = await exportUserWiki("owner");
  expect(backup.prompt).toContain("held-promotion body");
});

test("kept-source promotion lookup is owner-scoped and fails closed", async () => {
  mockTables.sources = [{ ...source("kept"), kind: "self_knowledge", tags: [CHAT_KEEP_TAG] }];
  mockTables.wiki_pages = [{ ...page("foreign", true, "kept"), user_id: "other" }];
  const result = await exportUserWiki("owner", { forAi: true, includeSavedConversations: true });
  expect(result.prompt).toContain("owner/kept.md body");
  mockDownload.mockClear(); mockErrors.add("wiki_pages");
  await expect(exportUserWiki("owner", { forAi: true, includeSavedConversations: true })).rejects.toThrow("read unavailable");
  expect(mockDownload).not.toHaveBeenCalled();
});

test("promotion metadata spans server pages and ignores the prompt's page limit", async () => {
  mockTables.sources = ["filler", "kept"].map(id => ({ ...source(id), kind: "self_knowledge", tags: [CHAT_KEEP_TAG] }));
  mockTables.wiki_pages = [
    ...Array.from({ length: 500 }, (_, i) => page(`a-${String(i).padStart(3, "0")}`, false, "filler")),
    page("z-held", true, "kept"),
  ];
  const result = await exportUserWiki("owner", { forAi: true, includeSavedConversations: true, pageLimit: 0 });
  expect(result.prompt).not.toContain("Saved conversations");
  expect(mockDownload).not.toHaveBeenCalled();
  expect(mockReads.filter(table => table === "wiki_pages")).toHaveLength(2);
});

test("promotion metadata distinguishes held, missing and foreign sources without returning content", async () => {
  await expect(generateSourcePage("owner", "source-held")).rejects.toBeInstanceOf(SourceAiHeldError);
  await expect(generateSourcePage("owner", "missing")).rejects.toBeInstanceOf(SourceNotFoundError);
  await expect(generateSourcePage("other", "source-held")).rejects.toBeInstanceOf(SourceNotFoundError);
  expect(mockDownload).not.toHaveBeenCalled(); expect(mockEmbed).not.toHaveBeenCalled();
  expect(await hasAiHeldRows("owner", "records", ["record-held"])).toBe(true);
  expect(await hasAiHeldRows("owner", "records", ["record-ok"])).toBe(false);
  expect(await hasAiHeldRows("other", "records", ["record-held"])).toBe(false);
  mockErrors.add("sources");
  await expect(hasAiHeldRows("owner", "sources", ["source-held"])).rejects.toThrow("read unavailable");
});

test("Polaris results require every proposed evidence ID to remain eligible; saved ratifications stay visible", async () => {
  const card = (id: string, refs: string[], status = "proposed") => ({ id, evidenceRefs: refs.map(ref => `record:${ref}`), status } as RoleCard);
  const cards = [card("ok", ["record-ok"]), card("mixed", ["record-ok", "record-held"]),
    card("held", ["record-held"]), card("missing", ["deleted"]), card("empty", []), card("saved", ["record-held"], "ratified")];
  expect((await recheckRoleProposalEvidence("owner", cards)).map(row => row.id)).toEqual(["ok", "saved"]);
  expect((await recheckRoleProposalEvidence("other", cards)).map(row => row.id)).toEqual(["saved"]);
  mockErrors.add("records_ai_eligible");
  await expect(recheckRoleProposalEvidence("owner", cards)).rejects.toThrow("read unavailable");
  expect(mockReads).not.toContain("records");
});

test("direct record embedding re-reads eligibility and uses the current body", async () => {
  expect(await embedAndStoreRecord("owner", { id: "record-held", body: "stale" }, "en", false, true)).toBe(false);
  expect(await embedAndStoreRecord("stranger", { id: "record-ok", body: "stale" }, "en", false, true)).toBe(false);
  expect(mockEmbed).not.toHaveBeenCalled();
  expect(await embedAndStoreRecord("owner", { id: "record-ok", body: "stale" }, "en", false, true)).toBe(true);
  expect(mockEmbed).toHaveBeenCalledWith(expect.objectContaining({ texts: ["record-ok\n\nrecord-ok body"] }));
});

test.each([false, true])("record batch and per-record rescue exclude holds (retry=%s)", async retry => {
  if (retry) mockEmbed.mockRejectedValueOnce(new Error("batch error"));
  expect(await backfillRecordEmbeddings("owner", { consented: true })).toMatchObject({ fetched: 1, scanned: 1, embedded: 1 });
  expect(JSON.stringify(mockEmbed.mock.calls)).not.toContain("held");
});

test("direct page embedding excludes page and parent holds before reading cached input", async () => {
  for (const id of ["page-held", "parent-held"]) {
    expect(await embedAndStorePage("owner", { id, title: "cached", body_md: "cached", frontmatter: {} })).toBe(false);
  }
  expect(mockEmbed).not.toHaveBeenCalled();
  expect(await embedAndStorePage("owner", { id: "page-ok", title: "cached", body_md: "cached", frontmatter: {} })).toBe(true);
  expect(mockEmbed).toHaveBeenCalledWith(expect.objectContaining({ texts: ["page-ok\n\npage-ok body"] }));
});

test.each([false, true])("page batch and per-page rescue exclude holds (retry=%s)", async retry => {
  if (retry) mockEmbed.mockRejectedValueOnce(new Error("batch error"));
  expect(await backfillEmbeddings("owner")).toEqual({ scanned: 1, embedded: 1 });
  expect(JSON.stringify(mockEmbed.mock.calls)).not.toContain("held");
});

test("old record/page RPC results are intersected with current eligible IDs", async () => {
  mockTables.records[0].embedding = [1, 2]; mockTables.wiki_pages[0].embedding = [1, 2];
  mockRpc.mockImplementation(async (name: string) => ({ data: (name === "match_records" ? mockTables.records : mockTables.wiki_pages).map(row => ({ ...row, similarity: .8 })), error: null }));
  expect((await relatedRecordsByEmbedding("owner", "record-ok")).map(row => row.id)).toEqual(["record-ok"]);
  expect((await relatedByEmbedding("owner", "page-ok")).map(row => row.id)).toEqual(["page-ok"]);
  expect(await relatedByEmbedding("owner", "parent-held")).toEqual([]);
});

test("RAG bodies never use held pages returned by an old RPC", async () => {
  mockRpc.mockImplementation(() => {
    const result = { data: mockTables.wiki_pages.map(row => ({ ...row, similarity: .8 })), error: null };
    return { abortSignal: () => Promise.resolve(result) };
  });
  const result = await retrieveChatContext("owner", "ordinary query", "en");
  expect(result.map(row => row.slug)).toEqual(["page-ok"]);
  expect(result[0].body).toBe("page-ok body");
});

test("summary, promotion and graph materialization reject held origins before any body/model access", async () => {
  await expect(runPhase1({ userId: "owner", sourceId: "source-held", locale: "en" })).rejects.toThrow();
  await expect(generateSourcePage("owner", "source-held")).rejects.toThrow();
  await expect(materializeGraphFromPhase1("owner", { id: "parent-held" }, { entities: ["node"], concepts: [] })).rejects.toThrow("source_page_ai_unavailable");
  expect(mockDownload).not.toHaveBeenCalled(); expect(mockLlm).not.toHaveBeenCalled();
  await runPhase1({ userId: "owner", sourceId: "source-ok", locale: "en" });
  expect(mockLlm).toHaveBeenCalledTimes(1);
});

test("northstar and interview proposal material excludes held rows", async () => {
  mockTables.records = Array.from({ length: 6 }, (_, i) => ({ ...record(`entry-${i}`, i === 5), kind: "audit_response", audit_period: "school", system_tags: ["interview"] }));
  expect(await proposeNorthstarSentences({ userId: "owner", locale: "en" })).toEqual(["One", "Two", "Three"]);
  expect(JSON.stringify(mockLlm.mock.calls)).not.toContain("entry-5");
  expect(JSON.stringify(mockLlm.mock.calls)).toContain("entry-4");
  const result = await buildSevenProposalContext("owner", "school", "en");
  expect(result?.evidenceRefs).toHaveLength(5);
  expect(result?.evidence).not.toContain("entry-5");
});

test("assessment result screen retains a held result while AI synthesis skips it", async () => {
  const scores = { openness: 4, conscientiousness: 4, extraversion: 4, agreeableness: 4, neuroticism: 4 };
  mockTables.records = [{ ...record("assessment", true), tags: ["bfi"], body: JSON.stringify({ scores }) }];
  expect(await loadLatestBfi(getSupabaseClient(), "owner")).toEqual(scores);
  expect(await loadLatestBfi(getSupabaseClient(), "owner", true)).toBeNull();
});

test("persona narrative and evidence refs use eligible records only", async () => {
  mockTables.records = mockTables.records.map(row => ({ ...row, kind: "audit_response" }));
  const persona = await buildPersona("owner", "en", false);
  expect(persona.evidenceRefs).toEqual(["record:record-ok"]);
  expect(JSON.stringify(mockLlm.mock.calls)).toContain("record-ok body");
  expect(JSON.stringify(mockLlm.mock.calls)).not.toContain("record-held");
});

test("role-card preparation skips held assessment enrichment without changing the screen snapshot", async () => {
  mockTables.personas = [{ user_id: "owner", version: 1, patterns: {}, values: [], markdown_export: "",
    traits: { openness: .5, conscientiousness: .5, extraversion: .5, agreeableness: .5, neuroticism: .5 } }];
  mockTables.records = [{ ...record("assessment", true), tags: ["attachment", "ecr"],
    body: JSON.stringify({ style: "secure", anxiety: 2, avoidance: 2 }) }];
  expect((await loadPersonaSnapshot("owner"))?.attachment).not.toBeNull();
  expect((await loadPersonaSnapshot("owner", undefined, true))?.attachment).toBeNull();
});

test("a missing AI view fails closed without an original-table retry", async () => {
  mockErrors.add("records_ai_eligible"); mockErrors.add("wiki_pages_ai_eligible");
  await expect(getAiRecord("owner", "record-ok")).rejects.toThrow("read unavailable");
  await expect(exportUserWiki("owner", { forAi: true })).rejects.toThrow("read unavailable");
  expect(mockReads).not.toContain("records"); expect(mockReads).not.toContain("wiki_pages");
  expect(mockEmbed).not.toHaveBeenCalled(); expect(mockLlm).not.toHaveBeenCalled();
});
