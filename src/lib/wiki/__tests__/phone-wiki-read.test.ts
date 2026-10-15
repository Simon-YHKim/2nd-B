import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import type { ReactElement } from "react";
import { hookHarness } from "../../nav/__tests__/hook-harness";
import { __resetAccountEpochForTests, beginAccountOwnerTransition, clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../../auth/account-epoch";
import { filterPhoneWikiPages } from "../phone-search";

type Reply = { data: unknown; error: unknown };
type Query = { table: string; owner: string; id?: string; to?: string; ids?: string[]; columns?: string; limit?: number };
let mockHarness: ReturnType<typeof hookHarness>;
let mockFocused: boolean;
let mockOverride: (query: Query) => Reply | Promise<Reply> | undefined;
const mockQueries: Query[] = [];
const row = (id: string, owner = "owner-a") => ({ id, user_id: owner, slug: id, title: id, body_md: `body ${id}`, tags: [], kind: "note", created_at: "2026-10-15T00:00:00Z", updated_at: "2026-10-15T00:00:00Z" });
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({ from: (table: string) => {
  const query: Query = { table, owner: "" };
  const chain = {
    select(columns: string) { query.columns = columns; return chain; },
    eq(key: string, value: string) { if (key === "user_id") query.owner = value; if (key === "id") query.id = value; if (key === "to_page") query.to = value; return chain; },
    in(_key: string, ids: string[]) { query.ids = ids; return chain; },
    order() { return chain; }, limit(value: number) { query.limit = value; return chain; }, maybeSingle() { return chain; },
    then(resolve: (value: Reply) => unknown, reject: (error: unknown) => unknown) {
      mockQueries.push({ ...query });
      const data = table === "wiki_links" ? [{ from_page: "backlink" }] : query.id ? row(query.id, query.owner) : [row(query.ids?.[0] ?? "listed", query.owner)];
      return Promise.resolve(mockOverride(query) ?? { data, error: null }).then(resolve, reject);
    },
  };
  return chain;
} }) }));
jest.mock("expo-router", () => ({ useFocusEffect: (callback: () => void | (() => void)) => mockHarness.hooks.useEffect(() => mockFocused ? callback() : undefined, [callback, mockFocused]) }));

type Module = typeof import("../use-phone-wiki-read");
let product: Module;
let owner: string;
let listOpen: boolean;
let pageId: string | null;
const spies: jest.SpyInstance[] = [];
beforeAll(() => {
  const react = jest.requireActual<typeof import("react")>("react");
  for (const name of ["useState", "useRef", "useMemo", "useCallback", "useSyncExternalStore"] as const) {
    spies.push(jest.spyOn(react, name).mockImplementation(((...args: unknown[]) =>
      (mockHarness.hooks[name] as (...args: unknown[]) => unknown)(...args)) as never));
  }
  product = jest.requireActual<Module>("../use-phone-wiki-read");
});
afterAll(() => spies.forEach((spy) => spy.mockRestore()));
beforeEach(() => {
  jest.useFakeTimers(); __resetAccountEpochForTests(); noteResolvedOwner("owner-a"); clearAccountTransition(currentAccountEpoch());
  mockHarness = hookHarness(); mockFocused = true; mockOverride = () => undefined; mockQueries.length = 0;
  owner = "owner-a"; listOpen = false; pageId = "cited";
});
afterEach(() => { mockHarness.unmount(); jest.clearAllTimers(); jest.useRealTimers(); });
const render = () => mockHarness.render(() => product.usePhoneWikiRead(owner, listOpen, pageId));
async function settle() { let read = render(); for (let i = 0; i < 30; i++) { await Promise.resolve(); read = render(); } return read; }
function deferred() { let resolve!: (value: Reply) => void; let reject!: (reason: unknown) => void; const promise = new Promise<Reply>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

// Render the phone's actual JSX branches and derived declarations. UI hosts are
// strings, but predicates/copy/retry callbacks come from the product source.
const source = readFileSync(join(process.cwd(), "src/components/dashboard/DashboardPhone.tsx"), "utf8");
const ast = ts.createSourceFile("DashboardPhone.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate: (node: ts.Node) => boolean) { let match: ts.Node | undefined; const walk = (node: ts.Node) => { if (!match && predicate(node)) match = node; else if (!match) node.forEachChild(walk); }; walk(ast); if (!match) throw new Error("Phone product declaration missing"); return match; }
function phone(read: ReturnType<Module["usePhoneWikiRead"]>) {
  const names = ["wikiPages", "wikiPage", "wikiBacklinks", "wikiLoading", "wikiFailed", "wikiDetailLoading", "wikiDetailFailed"];
  const declarations = names.map((name) => { const node = find((n) => ts.isVariableDeclaration(n) && n.name.getText(ast) === name) as ts.VariableDeclaration; return `const ${name} = ${node.initializer!.getText(ast)};`; }).join("\n");
  const condition = listOpen ? 'route === "/wiki"' : 'route.startsWith("/wiki/page/")';
  const node = find((n) => ts.isConditionalExpression(n) && n.condition.getText(ast) === condition);
  const code = ts.transpileModule(`${declarations}\nconst result = ${node.getText(ast)};`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const bindings = { React: jest.requireActual("react"), View: "View", PhoneAction: "PhoneAction", PixelRoundRect: "PixelRoundRect", Text: "Text", TextInput: "TextInput", styles: {}, phoneIos: {}, t: (key: string) => key, go: jest.fn(), ownerId: owner, wikiDetailId: pageId, wikiRead: read, route: listOpen ? "/wiki" : `/wiki/page/${pageId}`, wikiQuery: "", setWikiQuery: jest.fn(), filteredWikiPages: filterPhoneWikiPages(read.list.value ?? [], "") };
  return new Function(...Object.keys(bindings), `${code}\nreturn result;`)(...Object.values(bindings)) as unknown;
}
type Element = ReactElement<{ children?: unknown; label?: string; onPress?: () => void }>;
function nodes(value: unknown): Element[] { if (Array.isArray(value)) return value.flatMap(nodes); if (!value || typeof value !== "object" || !("props" in value)) return []; const node = value as Element; return [node, ...nodes(node.props.children)]; }
function drawn(value: unknown): string { if (Array.isArray(value)) return value.map(drawn).join(""); if (typeof value === "number" || typeof value === "string") return String(value); if (!value || typeof value !== "object" || !("props" in value)) return ""; const node = value as Element; return [node.props.label, drawn(node.props.children)].filter(Boolean).join(" "); }
const retry = (tree: unknown) => nodes(tree).find((node) => node.props.label === "common:actions.retry")?.props.onPress;

test("actual query scopes and independent page/backlink results are preserved", async () => {
  const read = await settle(); expect(read.page.value?.id).toBe("cited"); expect(read.backlinks.value?.[0].id).toBe("backlink");
  expect(mockQueries).toEqual([{ table: "wiki_pages", owner, columns: "*", id: "cited" }, { table: "wiki_links", owner, columns: "from_page", to: "cited" }, { table: "wiki_pages", owner, columns: "*", ids: ["backlink"] }]);
  expect(drawn(phone(read))).toContain("wiki:backlinks (1)");
});

test.each(["page", "edges", "backlink-pages"])("%s query failure is visible and retry only reads", async (kind) => {
  mockOverride = (q) => ((kind === "page" && q.id) || (kind === "edges" && q.table === "wiki_links") || (kind === "backlink-pages" && q.ids)) ? { data: null, error: new Error("read failed") } : undefined;
  const failed = await settle(); const tree = phone(failed);
  expect(drawn(tree)).toContain("common:errors.unknown"); expect(drawn(tree)).not.toContain("wiki:empty"); expect(retry(tree)).toBeDefined();
  if (kind !== "page") { expect(drawn(tree)).toContain("body cited"); expect(drawn(tree)).toContain("wiki:backlinks (...)"); expect(drawn(tree)).not.toContain("wiki:backlinks (0)"); }
  mockOverride = () => undefined; retry(tree)!(); const ready = await settle(); expect(drawn(phone(ready))).toContain("wiki:backlinks (1)"); expect(retry(phone(ready))).toBeUndefined();
});

test.each(["page", "edges", "backlink-pages"])("%s hang has a 10s deadline and late completion cannot replace retry", async (kind) => {
  const slow = deferred(); mockOverride = (q) => ((kind === "page" && q.id) || (kind === "edges" && q.table === "wiki_links") || (kind === "backlink-pages" && q.ids)) ? slow.promise : undefined;
  let read = await settle(); expect(drawn(phone(read))).toContain("..."); expect(drawn(phone(read))).not.toContain("wiki:empty");
  if (kind !== "page") expect(drawn(phone(read))).toContain("body cited");
  jest.advanceTimersByTime(9_999); read = await settle(); expect(retry(phone(read))).toBeUndefined();
  jest.advanceTimersByTime(1); read = await settle(); expect(drawn(phone(read))).toContain("common:errors.network");
  mockOverride = () => undefined; retry(phone(read))!(); read = await settle();
  slow.resolve({ data: null, error: null }); read = await settle(); expect(read.page.value?.id).toBe("cited"); expect(read.backlinks.value?.length).toBe(1);
});

test("successful missing page and empty backlink reads retain their distinct meanings", async () => {
  mockOverride = (q) => q.id ? { data: null, error: null } : q.table === "wiki_links" ? { data: [], error: null } : undefined;
  let read = await settle(); expect(read.page.status).toBe("ready"); expect(drawn(phone(read))).toContain("wiki:empty"); expect(retry(phone(read))).toBeUndefined();
  mockOverride = (q) => q.table === "wiki_links" ? { data: [], error: null } : undefined;
  read.retry(); read = await settle(); expect(drawn(phone(read))).toContain("wiki:backlinks (0)"); expect(retry(phone(read))).toBeUndefined();
});

test("list failure and successful empty list render different phone states", async () => {
  listOpen = true; pageId = null; mockOverride = () => ({ data: null, error: new Error("list failed") });
  const failed = await settle(); expect(drawn(phone(failed))).toContain("common:errors.unknown"); expect(drawn(phone(failed))).not.toContain("wiki:empty");
  mockOverride = () => ({ data: [], error: null }); retry(phone(failed))!(); const empty = await settle();
  expect(drawn(phone(empty))).toContain("wiki:empty"); expect(retry(phone(empty))).toBeUndefined();
  expect(mockQueries.every((q) => q.owner === owner && q.table === "wiki_pages" && q.limit === 200)).toBe(true);
});

test("list stall times out and a newer attempt ignores its late result", async () => {
  listOpen = true; pageId = null; const slow = deferred(); mockOverride = () => slow.promise;
  let read = await settle(); jest.advanceTimersByTime(10_000); read = await settle(); expect(drawn(phone(read))).toContain("common:errors.network");
  mockOverride = () => undefined; read.retry(); read = await settle(); expect(read.list.value?.[0].id).toBe("listed");
  slow.resolve({ data: [], error: null }); expect((await settle()).list.value?.length).toBe(1);
});

test("new citation target hides the previous page before its read and rejects stale retry/result", async () => {
  const first = await settle(); const slow = deferred(); mockOverride = (q) => q.id === "second" ? slow.promise : undefined;
  pageId = "second"; expect(render().page.value).toBeNull(); await settle(); const count = mockQueries.length; first.retry(); await settle(); expect(mockQueries).toHaveLength(count);
  pageId = "third"; const fresh = await settle(); expect(fresh.page.value?.id).toBe("third");
  slow.resolve({ data: row("second"), error: null }); expect((await settle()).page.value?.id).toBe("third");
});

test("owner hold and ABA hide content and old retries before new owner publication", async () => {
  const old = await settle(); beginAccountOwnerTransition(null); expect(render().page.value).toBeNull(); old.retry(); await settle(); const count = mockQueries.length;
  noteResolvedOwner(null); noteResolvedOwner("owner-a"); clearAccountTransition(currentAccountEpoch()); const fresh = await settle(); expect(fresh.page.value?.id).toBe("cited");
  old.retry(); await settle(); expect(mockQueries.length).toBe(count + 3);
});

test("A late read cannot publish into B", async () => {
  const slow = deferred(); mockOverride = (q) => q.owner === "owner-a" ? slow.promise : undefined; const old = await settle();
  beginAccountOwnerTransition("owner-b"); noteResolvedOwner("owner-b"); clearAccountTransition(currentAccountEpoch()); owner = "owner-b";
  expect(render().page.value).toBeNull(); let read = await settle(); expect(read.page.value?.user_id).toBe("owner-b");
  old.retry(); slow.resolve({ data: row("private-a"), error: null }); read = await settle(); expect(read.page.value?.user_id).toBe("owner-b");
});

test("blur cancels wait timers and blocks retry; refocus performs a fresh read", async () => {
  const slow = deferred(); mockOverride = () => slow.promise; const old = await settle(); mockFocused = false; await settle();
  expect(jest.getTimerCount()).toBe(0); const count = mockQueries.length; old.retry(); await settle(); expect(mockQueries).toHaveLength(count);
  mockOverride = () => undefined; mockFocused = true; const fresh = await settle(); expect(fresh.page.value?.id).toBe("cited");
  slow.reject(new Error("old failure")); expect((await settle()).page.status).toBe("ready");
});

test("unmount cancels timers and prevents late publication or retry", async () => {
  const slow = deferred(); mockOverride = () => slow.promise; const read = await settle(); mockHarness.unmount(); read.retry();
  slow.resolve({ data: row("late"), error: null }); for (let i = 0; i < 30; i++) await Promise.resolve();
  expect(mockHarness.dirty).toBe(false); expect(jest.getTimerCount()).toBe(0); expect(mockQueries).toHaveLength(2);
});

test("non-wiki routes and a pre-publication hold start no query", async () => {
  pageId = null; await settle(); expect(mockQueries).toHaveLength(0);
  beginAccountOwnerTransition(null); pageId = "cited"; await settle(); expect(mockQueries).toHaveLength(0);
});
