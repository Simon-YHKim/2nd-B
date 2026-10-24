import { deleteContentRowsCaptured, type CapturedContentWipeRequest, type ContentWipeTable } from "../content-wipe-transport";
import { prepareRecordPhotoWipe } from "../../capture/record-photos";

const mockSdk = jest.fn(() => { throw new Error("mutable SDK must not run"); });
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => mockSdk() }));
jest.mock("../../env", () => ({ getEnv: () => ({ EXPO_PUBLIC_SUPABASE_URL: "https://project.example.test/", EXPO_PUBLIC_SUPABASE_ANON_KEY: "public-anon" }) }));
const originalFetch = globalThis.fetch, fetchMock = jest.fn();
const request = (): CapturedContentWipeRequest => ({ userId: "owner-a", accessToken: "captured-a", signal: new AbortController().signal });
function success(count = 0, rows?: unknown, headers: Record<string, string> = {}): Response {
  return new Response(rows === undefined ? null : JSON.stringify(rows), {
    status: rows === undefined ? 204 : 200,
    headers: { "content-range": `*/${count}`, "preference-applied": rows === undefined ? "return=minimal, count=exact" : "return=representation, count=exact", "content-type": "application/json; charset=utf-8", ...headers },
  });
}
const failure = (status: number, code: string, extra: Record<string, unknown> = {}) => new Response(
  JSON.stringify({ code, message: "server refused request", details: null, hint: null, ...extra }),
  { status, headers: { "content-type": "application/json" } },
);
beforeEach(() => { fetchMock.mockReset().mockResolvedValue(success()); mockSdk.mockClear(); globalThis.fetch = fetchMock as typeof fetch; });
afterEach(() => { globalThis.fetch = originalFetch; jest.restoreAllMocks(); });

test.each(["wiki_pages", "sources", "records", "chat_usage", "self_contexts", "clipper_templates"] as const)(
  "%s dispatches synchronously once with the captured owner/JWT/signal and exact DELETE preference", async table => {
    const captured = request(); fetchMock.mockResolvedValue(table === "records" ? success(0, []) : success(0));
    const work = deleteContentRowsCaptured(table, captured);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0], parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(`https://project.example.test/rest/v1/${table}`);
    expect([...parsed.searchParams]).toEqual(table === "records"
      ? [["user_id", "eq.owner-a"], ["select", "structured"]]
      : [[table === "clipper_templates" ? "owner_id" : "user_id", "eq.owner-a"]]);
    expect(init).toEqual({ method: "DELETE", signal: captured.signal, redirect: "error", headers: {
      Authorization: "Bearer captured-a", apikey: "public-anon", "content-type": "application/json", Accept: "application/json",
      Prefer: `count=exact,return=${table === "records" ? "representation" : "minimal"}`,
    } });
    expect(await work).toEqual(table === "records" ? { outcome: "committed", count: 0, recordRows: { state: "complete", rows: [] } } : { outcome: "committed", count: 0 });
    expect(mockSdk).not.toHaveBeenCalled();
  },
);

test.each(["wiki_pages", "sources", "records", "chat_usage", "self_contexts", "clipper_templates"] as const)(
  "%s preserves exact count when PostgREST CORS hides Preference-Applied", async table => {
    const response = table === "records" ? success(1, [{ structured: null }]) : success(1);
    response.headers.delete("preference-applied"); fetchMock.mockResolvedValue(response);
    expect(response.headers.get("preference-applied")).toBeNull();
    expect(await deleteContentRowsCaptured(table, request())).toEqual(table === "records"
      ? { outcome: "committed", count: 1, recordRows: { state: "complete", rows: [{ structured: null }] } }
      : { outcome: "committed", count: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers.Prefer).toBe(`count=exact,return=${table === "records" ? "representation" : "minimal"}`);
  },
);
test.each(["missing", "*/*", "*/-1", "*/1.5", "*/01", "*/9007199254740992", "0-0/1"])(
  "hidden Preference-Applied never substitutes for missing or invalid count %s", async range => {
    const response = success(1); response.headers.delete("preference-applied");
    if (range === "missing") response.headers.delete("content-range"); else response.headers.set("content-range", range);
    fetchMock.mockResolvedValue(response);
    await expect(deleteContentRowsCaptured("sources", request())).resolves.toEqual({ outcome: "unknown", count: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);

test.each([0, 1, 321, Number.MAX_SAFE_INTEGER])("exact nonnegative count %s is preserved", async count => {
  fetchMock.mockResolvedValue(success(count));
  await expect(deleteContentRowsCaptured("wiki_pages", request())).resolves.toEqual({ outcome: "committed", count });
});

test.each(["*/*", "*/-1", "*/1.5", "*/01", "*/+1", "*/1x", "*/9007199254740992", "0-0/1", "*/1/1", ""])(
  "invalid DELETE count header %s stays unknown", async range => {
    fetchMock.mockResolvedValue(success(1, undefined, { "content-range": range }));
    await expect(deleteContentRowsCaptured("sources", request())).resolves.toEqual({ outcome: "unknown", count: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);
test.each(["", "count=planned", "count=estimated", "count=exact,count=estimated", "count=exact,tx=rollback", "count=exact,Tx=rollback"])(
  "unconfirmed count/transaction preference %s stays unknown", async preference => {
    fetchMock.mockResolvedValue(success(0, undefined, { "preference-applied": preference }));
    await expect(deleteContentRowsCaptured("sources", request())).resolves.toEqual({ outcome: "unknown", count: null });
  },
);
// Review #2627 r2: a visible Preference-Applied is read as RFC 7240 preferences (optional whitespace around
// "=", quoted values, ";" parameters, case-insensitive names). Rollback, any count other than exact, any
// tx other than commit, and anything that does not parse stay unknown.
test.each([
  "count=exact, tx = rollback", 'count=exact, tx="rollback"', "count=exact, tx=rollback;foo=bar", "count=exact, TX=ROLLBACK",
  "count=exact, count = planned", 'count="estimated"', "count=exact;x=1, count=planned;y=2", "count", "count=exact, tx",
  "count=exact, tx=maybe", 'count=exact, tx="rollback', "count=exact, =rollback", "count=exact, tx=roll back",
  "count=exact, tx==rollback", "count=exact, t{x}=commit", 'count=exact, tx="roll\\back"', "count=exact; ;, tx=rollback",
])("visible preference %s stays unknown", async preference => {
  fetchMock.mockResolvedValue(success(0, undefined, { "preference-applied": preference }));
  await expect(deleteContentRowsCaptured("sources", request())).resolves.toEqual({ outcome: "unknown", count: null });
});
// Review #2627 r4 -> Q-261018-60 가: a visible Preference-Applied commits only in a known shape - exactly one
// count=exact, optionally one return=minimal or return=representation (what this request sends), comma separated
// with optional whitespace, no ";" parameters. Every other spelling, including ones that merely agree, is unknown.
test.each([
  "count=exact", "Count=Exact", "return=minimal, count=exact", " count=exact ",
  "count=exact , return=minimal", "RETURN=MINIMAL,COUNT=EXACT",
])("visible preference %s in a known shape with the exact */N commits", async preference => {
  fetchMock.mockResolvedValue(success(7, undefined, { "preference-applied": preference }));
  await expect(deleteContentRowsCaptured("sources", request())).resolves.toEqual({ outcome: "committed", count: 7 });
});
// Review #2627 r5 -> Q-261018-63 가: a visible return must be the mode this table asked for - records asked
// return=representation (200), every other table return=minimal (204). No return at all still commits.
test.each([
  { table: "records" as const, preference: "count=exact,return=representation", outcome: "committed" },
  { table: "records" as const, preference: "count=exact", outcome: "committed" },
  { table: "records" as const, preference: "count=exact,return=minimal", outcome: "unknown" },
  { table: "records" as const, preference: "RETURN=MINIMAL, count=exact", outcome: "unknown" },
  { table: "sources" as const, preference: "count=exact,return=representation", outcome: "unknown" },
  { table: "sources" as const, preference: "Return=Representation, count=exact", outcome: "unknown" },
  { table: "wiki_pages" as const, preference: "count=exact,return=representation", outcome: "unknown" },
])("$table with visible $preference is $outcome", async ({ table, preference, outcome }) => {
  fetchMock.mockResolvedValue(table === "records"
    ? success(0, [], { "preference-applied": preference })
    : success(0, undefined, { "preference-applied": preference }));
  const result = await deleteContentRowsCaptured(table, request());
  expect(result.outcome).toBe(outcome);
  if (outcome === "unknown") expect(result).toEqual({ outcome: "unknown", count: null });
});
// The three empty-parameter cases from round 4, the parameter cases from round 3, and the spellings rounds 2-3 had
// accepted: all unknown now.
test.each([
  "count=exact;", "count=exact;;", "count=exact; ,",
  "count=exact;tx=rollback", "count=exact;count=planned", "return=minimal;tx=rollback,count=exact",
  "COUNT=EXACT;TX=ROLLBACK", "count=exact;Count=Planned", "Return=Minimal;Tx=RollBack, count=exact",
  "count=exact;tx", "count=exact;count", 'count=exact;tx="rollback"', "count=exact; tx = rollback",
  "count=exact;foo=1;tx=rollback", "return=minimal;count=exact",
  'count="exact"', "count = exact , tx = commit", 'count=exact;foo="a,b", tx="commit"', "count=exact,,tx=commit",
  " count=exact ; q=1 ", "COUNT=EXACT, TX=COMMIT", 'count=exact;foo="a,b"', "count=exact;tx=commit", "count=exact;count=exact",
  "COUNT=EXACT;TX=COMMIT, return=minimal;q=1", "count=exact, tx=commit", "count=exact, count=exact",
  "count=exact, return=minimal, return=representation", "count=exact, return=headers-only", "count=exact,", ",count=exact",
  "return=minimal", "count=exact\treturn=minimal",
])("visible preference %s outside the known shape stays unknown", async preference => {
  fetchMock.mockResolvedValue(success(0, undefined, { "preference-applied": preference }));
  await expect(deleteContentRowsCaptured("sources", request())).resolves.toEqual({ outcome: "unknown", count: null });
});
test.each([
  { status: 401, code: "42501" }, { status: 403, code: "42501" }, { status: 409, code: "23503" },
  { status: 400, code: "23514" }, { status: 400, code: "P0001" },
])("documented SQL rollback $status/$code is definite noncommit", async ({ status, code }) => {
  fetchMock.mockResolvedValue(failure(status, code));
  await expect(deleteContentRowsCaptured("sources", request())).resolves.toEqual({ outcome: "definitely-not-committed", count: null });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
test.each([
  { status: 500, code: "42501" }, { status: 400, code: "23503" }, { status: 403, code: "P0001" },
  { status: 403, code: "AccessDenied" }, { status: 409, code: "proxy" }, { status: 400, code: "prefix23514" },
])("ambiguous rejection $status/$code is unknown", async ({ status, code }) => {
  fetchMock.mockResolvedValue(failure(status, code));
  await expect(deleteContentRowsCaptured("sources", request())).resolves.toEqual({ outcome: "unknown", count: null });
});
test.each([{ message: 9 }, { message: "" }, { details: [] }, { hint: {} }, { code: null }, { details: undefined }])(
  "malformed SQL error shape %j is unknown", async extra => {
    fetchMock.mockResolvedValue(failure(403, "42501", extra));
    await expect(deleteContentRowsCaptured("sources", request())).resolves.toEqual({ outcome: "unknown", count: null });
  },
);

test.each(["reject", "throw", "malformed-success", "malformed-error", "empty-error", "wrong-content-type", "redirect", "unexpected-success"])(
  "%s never supplies success, a retry, or raw error data", async mode => {
    const sensitive = "owner-a/private-photo-and-token";
    if (mode === "reject") fetchMock.mockRejectedValue(new Error(sensitive));
    else if (mode === "throw") fetchMock.mockImplementation(() => { throw new Error(sensitive); });
    else if (mode === "malformed-success") fetchMock.mockResolvedValue(new Response("{broken", { status: 200, headers: { "content-range": "*/1", "preference-applied": "count=exact", "content-type": "application/json" } }));
    else if (mode === "malformed-error") fetchMock.mockResolvedValue(new Response("{broken", { status: 403, headers: { "content-type": "application/json" } }));
    else if (mode === "empty-error") fetchMock.mockResolvedValue(new Response(null, { status: 403 }));
    else if (mode === "wrong-content-type") fetchMock.mockResolvedValue(new Response('{"code":"42501","message":"refused","details":null,"hint":null}', { status: 403, headers: { "content-type": "text/plain" } }));
    else if (mode === "redirect") fetchMock.mockResolvedValue(new Response(null, { status: 307 }));
    else fetchMock.mockResolvedValue(new Response("[]", { status: 201, headers: { "content-range": "*/0", "preference-applied": "count=exact", "content-type": "application/json" } }));
    const result = await deleteContentRowsCaptured("records", request());
    expect(result).toEqual({ outcome: "unknown", count: null }); expect(JSON.stringify(result)).not.toContain(sensitive);
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(mockSdk).not.toHaveBeenCalled();
  },
);

test.each(["table", "prototype-table", "owner", "token", "missing-signal", "aborted"])("invalid %s issues no fetch", async mode => {
  const captured = request(); let table: ContentWipeTable = "records";
  if (mode === "table") table = "users" as ContentWipeTable;
  if (mode === "prototype-table") table = "constructor" as ContentWipeTable;
  if (mode === "owner") Object.assign(captured, { userId: "a&user_id=neq.b" });
  if (mode === "token") Object.assign(captured, { accessToken: "a\r\nx-header: b" });
  if (mode === "missing-signal") Object.assign(captured, { signal: undefined });
  if (mode === "aborted") { const controller = new AbortController(); controller.abort(); Object.assign(captured, { signal: controller.signal }); }
  await expect(deleteContentRowsCaptured(table, captured)).rejects.toBeDefined(); expect(fetchMock).not.toHaveBeenCalled();
});

test.each([null, {}, [null], [{}], [], [{ structured: null }, { structured: null }]].map(rows => ({ rows })))(
  "valid DB count with incomplete original rows $rows never confirms a photo plan", async ({ rows }) => {
    fetchMock.mockResolvedValue(success(1, rows));
    const result = await deleteContentRowsCaptured("records", request());
    expect(result).toEqual({ outcome: "committed", count: 1, recordRows: { state: "unconfirmed" } });
    expect(prepareRecordPhotoWipe(rows, 1, "owner-a")).toEqual({ state: "unconfirmed" });
  },
);
test("complete original record rows feed the actual strict manifest without exposing other row columns", async () => {
  const path = "owner-a/photo-12345678.jpg";
  fetchMock.mockResolvedValue(success(1, [{ body: "private record text", structured: { photos: [{ path, mime: "image/jpeg" }] } }]));
  const result = await deleteContentRowsCaptured("records", request());
  if (result.outcome !== "committed" || result.recordRows?.state !== "complete") throw new Error("missing original rows");
  expect(result.count).toBe(1); expect(JSON.stringify(result)).not.toContain("private record text");
  expect(prepareRecordPhotoWipe(result.recordRows.rows, result.count, "owner-a")).toEqual({ state: "complete", batches: [[path]] });
});
test("late confirmed response survives caller abort for the future original-ticket settlement", async () => {
  const controller = new AbortController(); let resolve!: (response: Response) => void;
  fetchMock.mockReturnValue(new Promise<Response>(yes => { resolve = yes; }));
  const work = deleteContentRowsCaptured("wiki_pages", { ...request(), signal: controller.signal });
  controller.abort(); resolve(success(3));
  await expect(work).resolves.toEqual({ outcome: "committed", count: 3 });
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(mockSdk).not.toHaveBeenCalled();
});
