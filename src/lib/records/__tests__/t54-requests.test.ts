// Real supabase-js URL/body encoding, in-memory HTTP responses only.
import { createClient } from "@supabase/supabase-js";

const OWNER = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";
const requests: { url: URL; method: string; body?: Record<string, unknown>; signal?: AbortSignal | null }[] = [];
let stored: Record<string, unknown> | null;
let absent = false;
let patchError: string | null = null;
const mockFetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
  requests.push({ url, method, body, signal: init?.signal });
  const send = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
  if (absent && (url.searchParams.get("select")?.includes("system_tags") || body?.system_tags)) {
    return send({ code: method === "PATCH" ? "PGRST204" : "42703", message: "column system_tags missing" }, 400);
  }
  if (method === "PATCH") {
    if (patchError) return send({ code: patchError, message: "write refused" }, 400);
    const expected = url.searchParams.get("system_tags");
    const literal = `{${((stored?.system_tags ?? []) as string[]).map((s) => `"${s}"`).join(",")}}`;
    if (!stored || url.searchParams.get("user_id") !== `eq.${OWNER}` ||
        url.searchParams.get("id") !== `eq.${ID}` || expected !== `eq.${literal}`) return send([]);
    stored = { ...stored, ...body };
    return send([{ id: ID }]);
  }
  const columns = url.searchParams.get("select");
  const row = stored ? Object.fromEntries(Object.entries(stored).filter(([key]) => columns === "*" || columns?.split(",").includes(key))) : null;
  const headers = new Headers(init?.headers);
  return send(headers.get("accept")?.includes("vnd.pgrst.object") ? row : row ? [row] : []);
});

jest.mock("../../supabase/client", () => {
  let client: unknown;
  return { getSupabaseClient: () => client ??= createClient("https://wire.example.supabase.co", "test-only", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => mockFetch(input, init) },
  }) };
});
jest.mock("../../llm/boundary", () => ({ callAdvisor: jest.fn(), callLlm: jest.fn(), classifyRecordTextForCrisis: jest.fn() }));
jest.mock("../../progression/xp", () => ({ awardXpSafe: jest.fn() }));
jest.mock("../../persona/load-domain-levels", () => ({ invalidateDomainLevels: jest.fn() }));
jest.mock("../../env", () => ({ getEnv: () => ({ EXPO_PUBLIC_LLM_MODE: "mock" }) }));
jest.mock("../records-embeddings", () => ({ embedAndStoreRecord: jest.fn(), recordsEmbeddingAllowed: jest.fn() }));
jest.mock("../../supabase/privacy", () => ({ fetchPrivacyPrefs: jest.fn() }));
jest.mock("../../knowledge/engines", () => ({ buildMemorizedPattern: jest.fn() }));
jest.mock("../../wiki/storage", () => ({ downloadRawClipping: jest.fn() }));
jest.mock("../../supabase/profile-context-import", () => ({ fetchProfileImportedContext: jest.fn() }));

import { getRecordById, listRecentRecords, listRecordsByIds, updateRecordTags } from "../create";
import { listAllRecords } from "../list-all-records";
import { listSourcePieces } from "../source-pieces";
import { getPieceById } from "../get-piece";
import { getSource, listSources, updateSourceTags } from "../../wiki/queries";
import { isReasoningRatified } from "../system-tags";

beforeEach(() => {
  requests.length = 0;
  absent = false;
  patchError = null;
  stored = { id: ID, user_id: OWNER, kind: "note", body: "body", title: "title", tags: ["domain:growth"],
    system_tags: ["reasoning:ratified"], created_at: "2026-10-19T00:00:00Z", captured_at: "2026-10-19T00:00:00Z", frontmatter: {} };
});

const readers = [
  ["recent records", async () => (await listRecentRecords(OWNER))[0]],
  ["ID records", async () => (await listRecordsByIds(OWNER, [ID]))[0]],
  ["record detail", () => getRecordById(OWNER, ID)],
  ["all records", async () => (await listAllRecords(OWNER))[0]],
  ["source pieces", async () => (await listSourcePieces(OWNER, { excludeProfileImports: true }))[0]],
  ["source detail", () => getPieceById(OWNER, `src-${ID}`)],
  ["source row", () => getSource(OWNER, ID)],
  ["source rows", async () => (await listSources(OWNER))[0]],
] as const;

test.each(readers)("%s preserves present, empty, and absent system columns", async (_name, read) => {
  for (const tags of [["reasoning:ratified"], []]) {
    stored!.system_tags = tags;
    const row = await read();
    expect(row).toHaveProperty("system_tags", tags);
    expect(isReasoningRatified(row!)).toBe(tags.length > 0);
  }
  delete stored!.system_tags;
  absent = true;
  requests.length = 0;
  const row = await read();
  expect(row).not.toHaveProperty("system_tags");
  for (const { url } of requests) expect(url.searchParams.get("user_id")).toBe(`eq.${OWNER}`);
  if (requests[0].url.searchParams.get("select") !== "*") {
    expect(requests).toHaveLength(2);
    expect(requests[0].url.searchParams.get("select")).toContain("system_tags");
    expect(requests[1].url.searchParams.get("select")).not.toContain("system_tags");
    const first = new URL(requests[0].url); const second = new URL(requests[1].url);
    first.searchParams.delete("select"); second.searchParams.delete("select");
    expect(second.toString()).toBe(first.toString());
  }
});

test.each([updateRecordTags, updateSourceTags])("ratification payload uses the real SDK without encoding user tags in filters", async (update) => {
  const tags = ["domain:career", "comma,tag", '"quoted"', "back\\slash", "{braces}", "NULL", "한글", ""];
  for (const system_tags of [[], ["NULL"], ["interview", "reasoning:ratified"]]) {
    stored!.system_tags = system_tags;
    requests.length = 0;
    await update(OWNER, ID, tags, { system_tags });
    expect(requests).toHaveLength(1);
    const request = requests[0];
    expect(request.method).toBe("PATCH");
    expect(request.url.searchParams.get("select")).toBe("id");
    expect(request.url.searchParams.has("tags")).toBe(false);
    expect(request.url.searchParams.get("system_tags")).toBe(`eq.{${system_tags.map((s) => `"${s}"`).join(",")}}`);
    expect(stored!.tags).toEqual(tags);
    expect(stored!.system_tags).toEqual([...new Set([...system_tags, "reasoning:ratified"])]);
  }
});

test.each([updateRecordTags, updateSourceTags])("system-array races, deletion and another owner fail without altering stored data", async (update) => {
  stored!.system_tags = ["interview", "new-marker"];
  const before = JSON.stringify(stored);
  await expect(update(OWNER, ID, ["domain:career"], { system_tags: ["interview"] })).rejects.toThrow();
  expect(JSON.stringify(stored)).toBe(before);
  await expect(update("another-owner", ID, [], { system_tags: ["interview", "new-marker"] })).rejects.toThrow();
  expect(JSON.stringify(stored)).toBe(before);
  stored = null;
  await expect(update(OWNER, ID, [], { system_tags: [] })).rejects.toThrow();
});

test.each([updateRecordTags, updateSourceTags])("column/cache, RLS and constraint failures never retry tags-only", async (update) => {
  for (const code of ["PGRST204", "42703", "42501", "23514"]) {
    patchError = code;
    requests.length = 0;
    const before = JSON.stringify(stored);
    await expect(update(OWNER, ID, [], { system_tags: [] })).rejects.toMatchObject({ code });
    expect(requests).toHaveLength(1);
    expect(JSON.stringify(stored)).toBe(before);
  }
});
