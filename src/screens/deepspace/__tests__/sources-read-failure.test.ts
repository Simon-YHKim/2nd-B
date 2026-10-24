// Real screen/card, owned read hook, list/storage/profile read functions. Only
// native views, mutation entrypoints, navigation and Supabase I/O are fixtures.
import type { ReactElement } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hookHarness } from "../../../lib/nav/__tests__/hook-harness";
import { __resetAccountEpochForTests, beginAccountOwnerTransition, clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../../../lib/auth/account-epoch";
import type { SourceRow } from "../../../lib/wiki/types";
import { parseProfileContext } from "../../../lib/import/profile-context";

type Reply = { data: unknown; error: unknown };
type Query = { table: string; filters: Record<string, unknown>; limit?: number; order?: string; authorization?: string };
let mockHarness: ReturnType<typeof hookHarness>;
let mockFocused = true;
let mockAuth = { userId: "owner-a" as string | null, loading: false, isMinor: false };
const mockList = jest.fn(); const mockContext = jest.fn(); const mockSession = jest.fn(); const mockDownload = jest.fn();
const mockPhase1 = jest.fn(); const mockPhase2 = jest.fn(); const mockRpc = jest.fn(); const mockPush = jest.fn();
const mockReads: Query[] = [];
let mockRows: SourceRow[];
const source = (id: string, extra: Partial<SourceRow> = {}): SourceRow => ({
  id, user_id: "owner-a", title: `Title ${id}`, kind: "article", source_url: null, storage_path: `owner-a/${id}.md`,
  tags: ["memo", "reasoning:ratified"], frontmatter: {}, ingested: false, ingested_at: null,
  simon_relevance: null, captured_at: "2026-10-16T00:00:00Z", ...extra,
});
const context = () => ({ document: parseProfileContext(JSON.stringify({
  format: "polascope.user-context", version: "1.0-draft", origin: { service: "unknown", model: null, exported_at: null },
  coverage: { accessed: ["current_chat"], unavailable: [], omissions: [], more_items: "unknown", account_completeness: "unknown" },
  sources: [{ id: "s1", kind: "chat_excerpt", speaker: "user", conversation_id: null, message_id: null, label: null, occurred_at: null, excerpt: "I prefer mornings." }],
  items: [{ id: "i1", category: "preference", statement: "I prefer mornings.", reported_basis: "user_statement", evidence_ids: ["s1"], valid_time: { from: null, to: null, description: null }, conflicts_with: [] }],
})), confirmed_ids: ["i1"] });

jest.mock("../../../lib/supabase/client", () => ({ getSupabaseClient: () => ({
  auth: { getSession: (...args: unknown[]) => mockSession(...args) }, rpc: (...args: unknown[]) => mockRpc(...args),
  storage: { from: (bucket: string) => ({ download: (path: string) => mockDownload(bucket, path) }) },
  from: (table: string) => {
    const read: Query = { table, filters: {} };
    const chain = {
      select: () => chain, eq: (name: string, value: unknown) => { read.filters[name] = value; return chain; },
      limit: (value: number) => { read.limit = value; return chain; }, order: (name: string) => { read.order = name; return chain; },
      setHeader: (_name: string, value: string) => { read.authorization = value; return chain; },
      single: () => { mockReads.push(read); return mockContext(read); },
      then: (resolve: (result: Reply) => unknown, reject?: (error: unknown) => unknown) => { mockReads.push(read); return Promise.resolve(mockList(read)).then(resolve, reject); },
    };
    return chain; // No insert/update/delete: read retries cannot silently write.
  },
}) }));
jest.mock("../../../lib/llm/boundary", () => ({ callLlm: jest.fn(() => { throw new Error("No model call allowed in read tests"); }) }));
jest.mock("../../../lib/wiki/phase1", () => ({
  readPhase1: jest.requireActual<typeof import("../../../lib/wiki/phase1")>("../../../lib/wiki/phase1").readPhase1,
  runPhase1: (...args: unknown[]) => mockPhase1(...args),
}));
jest.mock("../../../lib/wiki/phase2", () => ({ generateSourcePage: (...args: unknown[]) => mockPhase2(...args) }));
jest.mock("react-native", () => ({ StyleSheet: { create: (styles: unknown) => styles } }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "ko" }, t: (key: string, args?: unknown) => key + (args ? JSON.stringify(args) : "") }) }));
jest.mock("expo-router", () => ({ Redirect: "Redirect", useFocusEffect: (effect: () => void | (() => void)) =>
  mockHarness.hooks.useEffect(() => mockFocused ? effect() : undefined, [effect, mockFocused]) }));
jest.mock("@/components/phone/PhoneUIKit", () => ({ PhonePressable: "Pressable", PhoneScrollView: "ScrollView", PhoneView: "View" }));
jest.mock("@/components/ui/PlainText", () => ({ PlainText: "RNText" }));
jest.mock("@/components/pixel/PixelGlyph", () => ({ PixelGlyph: "PixelGlyph" }));
jest.mock("@/components/m3", () => ({ MdButton: "MdButton", MdCard: "MdCard", m3TextStyle: () => ({}) }));
jest.mock("@/components/deepspace", () => ({ DeepSpaceLoader: "DeepSpaceLoader" }));
jest.mock("@/components/deep-space/DeepSpaceScreen", () => ({ DeepSpaceScreen: "DeepSpaceScreen" }));
jest.mock("@/components/profile-import/summary", () => ({ ProfileContextSummary: "ProfileContextSummary" }));
jest.mock("@/lib/auth/AuthContext", () => ({ useAuth: () => mockAuth }));
jest.mock("@/lib/nav/phone-embed", () => ({ useAppRouter: () => ({ push: mockPush, back: jest.fn() }) }));

type Props = { children?: unknown; label?: string; accessibilityLabel?: string; accessibilityState?: { expanded?: boolean }; onPress?: () => void | Promise<void>; context?: unknown };
type Node = ReactElement<Props>;
let Screen: () => ReactElement;
let rootHarness: ReturnType<typeof hookHarness>;
let bodyHarness: ReturnType<typeof hookHarness> | null;
let bodyKey: string | null;
const spies: jest.SpyInstance[] = [];
beforeAll(() => {
  const React = jest.requireActual<typeof import("react")>("react");
  for (const name of ["useState", "useRef", "useMemo", "useCallback", "useEffect", "useSyncExternalStore"] as const) {
    spies.push(jest.spyOn(React, name).mockImplementation(((...args: unknown[]) =>
      (mockHarness.hooks[name] as (...args: unknown[]) => unknown)(...args)) as never));
  }
  (globalThis as { React?: unknown }).React = React;
  Screen = jest.requireActual<typeof import("../dds-sources-screen")>("../dds-sources-screen").DeepSpaceSourcesScreen;
});
afterAll(() => { spies.forEach((spy) => spy.mockRestore()); delete (globalThis as { React?: unknown }).React; });
beforeEach(() => {
  jest.useFakeTimers(); __resetAccountEpochForTests(); noteResolvedOwner("owner-a");
  rootHarness = hookHarness(); bodyHarness = null; bodyKey = null; mockHarness = rootHarness;
  mockFocused = true; mockAuth = { userId: "owner-a", loading: false, isMinor: false }; mockRows = [source("one"), source("two")];
  mockReads.length = 0; mockPush.mockReset(); mockRpc.mockReset().mockImplementation(() => { throw new Error("Unexpected RPC"); });
  mockList.mockReset().mockImplementation(() => Promise.resolve({ data: mockRows.map((r) => ({ ...r, frontmatter: { ...r.frontmatter }, tags: [...r.tags] })), error: null }));
  mockContext.mockReset().mockImplementation(() => Promise.resolve({ data: context(), error: null }));
  mockSession.mockReset().mockImplementation(() => Promise.resolve({ data: { session: { user: { id: mockAuth.userId }, access_token: "fixture-owner-token" } }, error: null }));
  mockDownload.mockReset().mockImplementation((_bucket: string, path: string) => Promise.resolve({ data: { text: () => Promise.resolve(`Body ${path}`) }, error: null }));
  mockPhase1.mockReset().mockResolvedValue({ summary: "Saved summary", entities: [], concepts: [], questions: ["Saved question"], generated_at: "now", model: "fixture" });
  mockPhase2.mockReset().mockResolvedValue({});
});
afterEach(() => { bodyHarness?.unmount(); rootHarness.unmount(); jest.clearAllTimers(); jest.useRealTimers(); });

function render(): Node {
  mockHarness = rootHarness;
  const root = rootHarness.render(Screen);
  if (typeof root.type === "function" && root.type.name === "SourcesBody") {
    const key = String(root.key);
    if (!bodyHarness || bodyKey !== key) { bodyHarness?.unmount(); bodyHarness = hookHarness(); bodyKey = key; }
    mockHarness = bodyHarness;
    return bodyHarness.render(() => (root.type as (props: unknown) => Node)(root.props));
  }
  bodyHarness?.unmount(); bodyHarness = null; bodyKey = null;
  return root as Node;
}
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const n = value as Node;
  if (typeof n.type === "function" && n.type.name === "SourceCard") return nodes((n.type as (props: unknown) => Node)(n.props));
  return [n, ...nodes(n.props.children)];
}
function texts(tree: unknown): unknown[] { return nodes(tree).filter((n) => n.type === "RNText").map((n) => n.props.children); }
function button(tree: unknown, label: string) { return nodes(tree).find((n) => n.props.label === label || n.props.accessibilityLabel === label); }
function card(tree: unknown, id = "one") { return nodes(tree).find((n) => n.type === "Pressable" && n.props.accessibilityLabel?.includes(`Title ${id}`)); }
async function settle() { let tree = render(); for (let i = 0; i < 30; i++) { await Promise.resolve(); tree = render(); } return tree; }
async function expand(id = "one") { const tree = await settle(); card(tree, id)!.props.onPress!(); return settle(); }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const failure = (tree: Node, key = "common:errors.unknown") => {
  expect(texts(tree)).toContain(key); expect(button(tree, "common:actions.retry")).toBeDefined();
  expect(texts(tree)).not.toContain("ds.sources.empty"); expect(button(tree, "ds.sources.emptyCta")).toBeUndefined();
};
const noMutation = () => { expect(mockPhase1).not.toHaveBeenCalled(); expect(mockPhase2).not.toHaveBeenCalled(); expect(mockRpc).not.toHaveBeenCalled(); };

test("a list error is not empty; retry only re-reads the owned 100-row list", async () => {
  mockList.mockResolvedValueOnce({ data: null, error: new Error("server unavailable") });
  const failed = await settle(); failure(failed); expect(texts(failed).some((v) => String(v).startsWith("ds.sources.count"))).toBe(false);
  button(failed, "common:actions.retry")!.props.onPress!(); const ready = await settle(); expect(card(ready)).toBeDefined();
  expect(mockReads).toHaveLength(2); expect(mockReads[0]).toMatchObject({ table: "sources", filters: { user_id: "owner-a" }, limit: 100, order: "captured_at" });
  expect(mockReads[1]).toEqual(mockReads[0]); noMutation();
});

test("only a successful empty list shows the import CTA", async () => {
  mockRows = []; const empty = await settle(); expect(texts(empty)).toContain("ds.sources.empty");
  expect(button(empty, "common:actions.retry")).toBeUndefined(); button(empty, "ds.sources.emptyCta")!.props.onPress!(); expect(mockPush).toHaveBeenCalledWith("/import");
});

test.each(["resolve", "reject"] as const)("list timeout retries and ignores a late %s", async (completion) => {
  const old = deferred<Reply>(); mockList.mockReturnValueOnce(old.promise);
  expect(texts(await settle())).toContain("..."); jest.advanceTimersByTime(9_999); expect(texts(await settle())).toContain("...");
  jest.advanceTimersByTime(1); const failed = await settle(); failure(failed, "common:errors.network");
  button(failed, "common:actions.retry")!.props.onPress!(); await settle();
  if (completion === "resolve") old.resolve({ data: [], error: null }); else old.reject(new Error("late rejection"));
  expect(card(await settle())).toBeDefined(); expect(jest.getTimerCount()).toBe(0); noMutation();
});

test("a held list retry cannot replace a newer retry", async () => {
  mockList.mockRejectedValueOnce(new Error("offline")); const failed = await settle(); const retry = button(failed, "common:actions.retry")!.props.onPress!;
  const next = deferred<Reply>(); mockList.mockReturnValueOnce(next.promise); retry(); await settle(); retry(); await settle();
  expect(mockList).toHaveBeenCalledTimes(2); next.resolve({ data: [], error: null }); expect(texts(await settle())).toContain("ds.sources.empty");
});

test("preview errors leave the independent list and offer a download-only retry", async () => {
  mockDownload.mockResolvedValueOnce({ data: null, error: new Error("storage unavailable") });
  const failed = await expand(); failure(failed); expect(card(failed, "two")).toBeDefined(); expect(texts(failed)).toContain('ds.sources.count{"n":2}');
  button(failed, "common:actions.retry")!.props.onPress!(); expect(texts(await settle()).flat()).toContain("Body owner-a/one.md");
  expect(mockList).toHaveBeenCalledTimes(1); expect(mockDownload.mock.calls).toEqual([["raw-clippings", "owner-a/one.md"], ["raw-clippings", "owner-a/one.md"]]); noMutation();
});

test.each(["download", "blob-text"])("a %s stall includes the whole 10s preview deadline and ignores its late body", async (stage) => {
  const old = deferred<any>(); mockDownload.mockReturnValueOnce(stage === "download" ? old.promise : Promise.resolve({ data: { text: () => old.promise }, error: null }));
  expect(texts(await expand())).toContain("ds.sources.previewLoading"); jest.advanceTimersByTime(9_999); expect(texts(await settle())).toContain("ds.sources.previewLoading");
  jest.advanceTimersByTime(1); const failed = await settle(); failure(failed, "common:errors.network"); button(failed, "common:actions.retry")!.props.onPress!(); await settle();
  old.resolve(stage === "download" ? { data: { text: () => Promise.resolve("stale") }, error: null } : "stale");
  expect(texts(await settle()).flat()).toContain("Body owner-a/one.md"); expect(texts(await settle()).flat()).not.toContain("stale"); expect(jest.getTimerCount()).toBe(0); noMutation();
});

test.each(["error", "timeout", "no-path"])("actual inline text stays readable on Storage %s", async (kind) => {
  mockRows[0].frontmatter = { _body_fallback: "Saved inline body" };
  if (kind === "no-path") mockRows[0].storage_path = "";
  else if (kind === "error") mockDownload.mockRejectedValueOnce(new Error("offline"));
  else mockDownload.mockReturnValueOnce(new Promise(() => {}));
  let tree = await expand(); if (kind === "timeout") { jest.advanceTimersByTime(10_000); tree = await settle(); }
  expect(texts(tree).flat()).toContain("Saved inline body"); expect(button(tree, "common:actions.retry")).toBeUndefined(); noMutation();
});

test("no body is an availability error, while a successfully downloaded empty string is not", async () => {
  mockRows[0].storage_path = ""; failure(await expand()); expect(mockDownload).not.toHaveBeenCalled();
  card(await settle())!.props.onPress!(); await settle();
  mockDownload.mockResolvedValue({ data: { text: () => Promise.resolve("") }, error: null });
  const tree = await expand("two"); expect(button(tree, "common:actions.retry")).toBeUndefined(); expect(texts(tree).flat()).toContain("");
});

test("successful preview cache, 600-character clipping, titles and system-looking tags keep their current meaning", async () => {
  mockDownload.mockResolvedValue({ data: { text: () => Promise.resolve("x".repeat(700)) }, error: null });
  let tree = await expand(); expect(texts(tree).flat()).toContain("x".repeat(600)); expect(texts(tree).flat()).toContain("…");
  expect(texts(tree)).toContain("Title one"); expect(texts(tree).flat()).toContain("memo #reasoning:ratified");
  card(tree)!.props.onPress!(); tree = await settle(); card(tree)!.props.onPress!(); await settle(); expect(mockDownload).toHaveBeenCalledTimes(1); noMutation();
});

const managedRow = () => source("managed", { frontmatter: { profile_context_import_id: "batch-one", _body_fallback: "RAW MUST NOT DISPLAY" }, ingested: true });
async function expandManaged() {
  const tree = await settle(); nodes(tree).find((n) => n.type === "Pressable" && n.props.accessibilityLabel?.includes("profile:contextImport.title"))!.props.onPress!(); return settle();
}
test("managed preview passes the validated document and exact confirmation IDs to its renderer", async () => {
  mockRows = [managedRow()]; const tree = await expandManaged();
  expect(nodes(tree).find((n) => n.type === "ProfileContextSummary")!.props.context).toEqual({ document: context().document, confirmedIds: ["i1"] });
  expect(mockReads.at(-1)).toMatchObject({ table: "profile_context_imports", filters: { user_id: "owner-a", source_id: "managed", status: "active" }, authorization: "Bearer fixture-owner-token" });
  expect(button(tree, "ds.sources.brief")).toBeUndefined(); expect(button(tree, "ds.sources.page")).toBeUndefined();
  button(tree, "profile:contextImport.history")!.props.onPress!(); expect(mockPush).toHaveBeenCalledWith("/profile-import?mode=history");
  expect(mockDownload).not.toHaveBeenCalled(); noMutation();
});

test.each(["auth-error", "ledger-error", "missing", "invalid", "auth-timeout", "ledger-timeout"])("managed %s never uses raw fallback, and retry only reads its active ledger", async (kind) => {
  mockRows = [managedRow()];
  if (kind === "auth-error") mockSession.mockRejectedValueOnce(new Error("auth unavailable"));
  if (kind === "ledger-error") mockContext.mockResolvedValueOnce({ data: null, error: new Error("ledger unavailable") });
  if (kind === "missing") mockContext.mockResolvedValueOnce({ data: null, error: null });
  if (kind === "invalid") mockContext.mockResolvedValueOnce({ data: { ...context(), confirmed_ids: ["unrelated"] }, error: null });
  if (kind === "auth-timeout") mockSession.mockReturnValueOnce(new Promise(() => {}));
  if (kind === "ledger-timeout") mockContext.mockReturnValueOnce(new Promise(() => {}));
  let failed = await expandManaged(); if (kind.endsWith("timeout")) { jest.advanceTimersByTime(10_000); failed = await settle(); }
  failure(failed, kind.endsWith("timeout") ? "common:errors.network" : "common:errors.unknown");
  expect(texts(failed).flat()).not.toContain("RAW MUST NOT DISPLAY"); expect(nodes(failed).find((n) => n.type === "ProfileContextSummary")).toBeUndefined();
  button(failed, "common:actions.retry")!.props.onPress!(); expect(nodes(await settle()).find((n) => n.type === "ProfileContextSummary")).toBeDefined();
  expect(mockDownload).not.toHaveBeenCalled(); expect(mockList).toHaveBeenCalledTimes(1); noMutation();
});

test("a late managed context cannot replace a newer ordinary preview", async () => {
  mockRows = [managedRow(), source("one")]; const old = deferred<Reply>(); mockContext.mockReturnValueOnce(old.promise);
  await expandManaged(); card(await settle())!.props.onPress!(); await settle(); old.resolve({ data: context(), error: null });
  const tree = await settle(); expect(texts(tree).flat()).toContain("Body owner-a/one.md");
  expect(nodes(tree).find((n) => n.type === "ProfileContextSummary")).toBeUndefined(); noMutation();
});

test("an owner hold before the queued list starts issues no request", async () => {
  render(); beginAccountOwnerTransition(null); await settle(); expect(mockReads).toHaveLength(0); noMutation();
});

test("collapse/reopen creates a new attempt and a held old retry cannot replace it", async () => {
  mockDownload.mockRejectedValueOnce(new Error("offline")); const failed = await expand(); const oldRetry = button(failed, "common:actions.retry")!.props.onPress!;
  card(failed)!.props.onPress!(); await settle(); const next = deferred<Reply>(); mockDownload.mockReturnValueOnce(next.promise);
  card(await settle())!.props.onPress!(); await settle(); oldRetry(); await settle(); expect(mockDownload).toHaveBeenCalledTimes(2);
  next.resolve({ data: { text: () => Promise.resolve("new body") }, error: null }); expect(texts(await settle()).flat()).toContain("new body");
});

test("source A→B→A replacement rejects both older completions", async () => {
  const a = deferred<Reply>(); const b = deferred<Reply>(); mockDownload.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  await expand(); card(await settle(), "two")!.props.onPress!(); await settle(); card(await settle())!.props.onPress!(); await settle();
  a.resolve({ data: { text: () => Promise.resolve("old A") }, error: null }); b.resolve({ data: { text: () => Promise.resolve("old B") }, error: null });
  const tree = await settle(); expect(texts(tree).flat()).toContain("Body owner-a/one.md"); expect(texts(tree).flat()).not.toContain("old A"); expect(texts(tree).flat()).not.toContain("old B");
});

test.each(["list", "preview"])("%s is fenced synchronously on owner hold and account ABA", async (kind) => {
  const old = deferred<Reply>(); if (kind === "list") mockList.mockReturnValueOnce(old.promise); else mockDownload.mockReturnValueOnce(old.promise);
  const waiting = kind === "list" ? await settle() : await expand(); const oldCard = card(waiting);
  beginAccountOwnerTransition(null); oldCard?.props.onPress?.();
  old.resolve(kind === "list" ? { data: [source("private-a")], error: null } : { data: { text: () => Promise.resolve("private-a") }, error: null });
  await settle(); expect(bodyHarness).toBeNull();
  noteResolvedOwner(null); noteResolvedOwner("owner-a"); clearAccountTransition(currentAccountEpoch());
  const fresh = await settle(); expect(texts(fresh).flat()).not.toContain("private-a"); expect(card(fresh)).toBeDefined(); expect(card(fresh)!.props.accessibilityState?.expanded).toBe(false); expect(jest.getTimerCount()).toBe(0);
});

test("a direct owner change remounts the body and drops the previous preview", async () => {
  const old = deferred<Reply>(); mockDownload.mockReturnValueOnce(old.promise); await expand(); const originalKey = bodyKey;
  beginAccountOwnerTransition("owner-b"); mockAuth.userId = "owner-b"; noteResolvedOwner("owner-b"); clearAccountTransition(currentAccountEpoch());
  mockRows = [source("new-owner", { user_id: "owner-b", storage_path: "owner-b/new.md" })]; const fresh = await settle(); expect(bodyKey).not.toBe(originalKey);
  old.resolve({ data: { text: () => Promise.resolve("private-a") }, error: null }); expect(texts(await settle()).flat()).not.toContain("private-a"); expect(card(fresh, "new-owner")).toBeDefined();
  expect(mockReads.at(-1)?.filters.user_id).toBe("owner-b");
});

test("blur cancels reads; refocus starts a new list and cannot use an old retry", async () => {
  mockDownload.mockRejectedValueOnce(new Error("offline")); const failed = await expand(); const retry = button(failed, "common:actions.retry")!.props.onPress!;
  mockFocused = false; await settle(); retry(); mockFocused = true; await settle(); retry(); await settle();
  expect(mockList).toHaveBeenCalledTimes(2); expect(mockDownload).toHaveBeenCalledTimes(1); expect(card(await settle())!.props.accessibilityState?.expanded).toBe(false); noMutation();
});

test("unmount cancels timers and blocks held retry and late result", async () => {
  const old = deferred<Reply>(); mockDownload.mockReturnValueOnce(old.promise); await expand(); const oldBody = bodyHarness!;
  bodyHarness!.unmount(); rootHarness.unmount(); old.resolve({ data: { text: () => Promise.resolve("late") }, error: null });
  for (let i = 0; i < 30; i++) await Promise.resolve();
  expect(oldBody.dirty).toBe(false); expect(jest.getTimerCount()).toBe(0); noMutation();
});

test.each(["brief", "page"])("successful %s followed by refresh failure is not rerun by list retry", async (kind) => {
  const tree = await expand(); mockList.mockResolvedValueOnce({ data: null, error: new Error("refresh failed") });
  button(tree, kind === "brief" ? "ds.sources.brief" : "ds.sources.page")!.props.onPress!(); const failed = await settle(); failure(failed);
  expect(texts(failed)).not.toContain(kind === "brief" ? "ds.sources.briefError" : "ds.sources.pageError");
  if (kind === "page") expect(texts(failed).some((t) => String(t).startsWith("ds.sources.pageDone"))).toBe(true);
  mockRows[0] = source("one", { storage_path: "owner-a/updated.md" }); button(failed, "common:actions.retry")!.props.onPress!(); const ready = await settle();
  expect(texts(ready).flat()).toContain("Body owner-a/updated.md");
  expect(kind === "brief" ? mockPhase1 : mockPhase2).toHaveBeenCalledTimes(1); expect(kind === "brief" ? mockPhase2 : mockPhase1).not.toHaveBeenCalled();
  expect(mockList).toHaveBeenCalledTimes(3); expect(mockRpc).not.toHaveBeenCalled();
  if (kind === "brief") expect(texts(ready)).toContain("Saved summary");
});

test("an older preview cannot populate a new row snapshot after post-action refresh", async () => {
  const old = deferred<Reply>(); mockDownload.mockReturnValueOnce(old.promise); const waiting = await expand();
  mockRows[0] = source("one", { storage_path: "owner-a/replaced.md" }); button(waiting, "ds.sources.page")!.props.onPress!(); await settle();
  old.resolve({ data: { text: () => Promise.resolve("stale snapshot") }, error: null });
  expect(texts(await settle()).flat()).toContain("Body owner-a/replaced.md"); expect(texts(await settle()).flat()).not.toContain("stale snapshot");
});

test("post-action refresh drops a removed expanded row", async () => {
  const tree = await expand(); mockRows = [source("two")]; button(tree, "ds.sources.page")!.props.onPress!(); const ready = await settle();
  expect(card(ready)).toBeUndefined(); expect(card(ready, "two")!.props.accessibilityState?.expanded).toBe(false); expect(mockDownload).toHaveBeenCalledTimes(1);
});

test("a mutation completing after blur cannot launch its old list-refresh callback", async () => {
  const job = deferred<unknown>(); mockPhase2.mockReturnValueOnce(job.promise); const tree = await settle(); button(tree, "ds.sources.page")!.props.onPress!(); await settle();
  mockFocused = false; await settle(); mockFocused = true; await settle(); const reads = mockList.mock.calls.length;
  job.resolve({}); await settle(); expect(mockList).toHaveBeenCalledTimes(reads); expect(mockPhase2).toHaveBeenCalledTimes(1);
});

test("the read hook imports no generation, import-apply or data-mutation entrypoint", () => {
  const hook = readFileSync(join(__dirname, "../../../lib/wiki/use-sources-read.ts"), "utf8");
  expect(hook).not.toMatch(/\b(runPhase1|generateSourcePage|applyProfileContextImport|withdrawProfileContextImport|enqueueAutoReasoning)\s*\(/);
});
