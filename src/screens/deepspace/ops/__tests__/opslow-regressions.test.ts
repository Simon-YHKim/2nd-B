// Gate lows: execute actual screen callbacks without loading RN or a renderer.
// Only the surrounding hook state and I/O are supplied by this test.
import { readFileSync } from "fs";
import { join } from "path";
import ts from "typescript";
import { createHash } from "crypto";

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: async (algorithm: string, value: string) => {
    if (algorithm !== "SHA-256") throw new Error("expected SHA-256");
    return jest.requireActual<typeof import("crypto")>("crypto").createHash("sha256").update(value).digest("hex");
  },
}));
jest.mock("@/lib/persona/load-domain-levels", () => ({ invalidateDomainLevels: jest.fn() }));
jest.mock("@/lib/supabase/client", () => ({ getSupabaseClient: jest.fn() }));

import { getSupabaseClient } from "@/lib/supabase/client";
import { invalidateDomainLevels } from "@/lib/persona/load-domain-levels";
import { deleteLedgerEntry } from "@/lib/finance/ledger";
import { addToShelf, manualBook, pageCountEdit, parsePageDraft, updateShelfEntry } from "@/lib/reading/shelf";
import { searchFoods, type FoodNutrition } from "@/lib/nutrition/foods";
import { bookSearchFailed, bookSearchSettled } from "../tool-logic";

const source = readFileSync(join(__dirname, "..", "screens.tsx"), "utf8").replace(/\r\n/g, "\n");
const ast = ts.createSourceFile("screens.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function screenNode(name: string): ts.FunctionDeclaration {
  const found = ast.statements.find((n): n is ts.FunctionDeclaration => ts.isFunctionDeclaration(n) && n.name?.text === name);
  if (!found) throw new Error(`missing screen ${name}`);
  return found;
}
function callback<T>(screen: string, name: string, context: Record<string, unknown>): T {
  let expression: ts.Expression | undefined;
  const walk = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && n.name.getText(ast) === name) expression = n.initializer;
    ts.forEachChild(n, walk);
  };
  walk(screenNode(screen));
  if (!expression) throw new Error(`missing callback ${screen}.${name}`);
  const code = ts.transpileModule(`const callback = ${expression.getText(ast)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(...Object.keys(context), `${code}\nreturn callback;`)(...Object.values(context)) as T;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

type Lookup = { kind: string; items?: FoodNutrition[] };
function lookupHarness(search = jest.fn<Promise<FoodNutrition[]>, [string]>()) {
  const seq = { current: 0 };
  const cache = new Map<string, FoodNutrition[]>();
  let view: Lookup = { kind: "idle" };
  const setLookup = (next: Lookup) => { view = next; };
  const reset = callback<() => void>("MealsScreen", "resetLookup", { lookupSeq: seq, setLookup });
  const lookup = (draft: string, pending: object | null = {}, mealWriting = false) => callback<() => Promise<void>>("MealsScreen", "onLookUp", {
    draft, pending, mealWriting, ko: true, lookupSeq: seq, setLookup, FOOD_LOOKUP_CACHE: cache, FOOD_LOOKUP_CACHE_MAX: 30, searchFoods: search,
  })();
  return { reset, lookup, search, cache, view: () => view };
}

describe("BL-04: lookup completion belongs to the current query and sheet generation", () => {
  test.each(["success", "failure"])("an old %s cannot replace a newer answer", async (outcome) => {
    const first = deferred<FoodNutrition[]>();
    const h = lookupHarness();
    h.search.mockReturnValueOnce(first.promise).mockResolvedValueOnce([{ name: "국수" }]);
    const pending = h.lookup("밥");
    h.reset();
    await h.lookup("국수");
    if (outcome === "success") first.resolve([{ name: "밥" }]);
    else first.reject(new Error("offline"));
    await pending;
    expect(h.view()).toEqual({ kind: "done", items: [{ name: "국수" }] });
  });

  test.each(["typing", "reopen same cell", "open another cell", "close"])("%s retires an unanswered lookup even without another request", async () => {
    const first = deferred<FoodNutrition[]>();
    const h = lookupHarness();
    h.search.mockReturnValueOnce(first.promise);
    const pending = h.lookup("밥");
    h.reset();
    first.resolve([{ name: "밥" }]);
    await pending;
    expect(h.view()).toEqual({ kind: "idle" });
  });

  test("A to B to A still refuses the first A response", async () => {
    const first = deferred<FoodNutrition[]>();
    const h = lookupHarness();
    h.search.mockReturnValueOnce(first.promise).mockResolvedValueOnce([{ name: "새 결과" }]);
    const pending = h.lookup("밥");
    h.reset();
    h.reset();
    await h.lookup("밥");
    first.resolve([{ name: "이전 결과" }]);
    await pending;
    expect(h.view()).toEqual({ kind: "done", items: [{ name: "새 결과" }] });
    expect(h.cache.get("밥")).toEqual([{ name: "새 결과" }]);
  });

  test("a cache hit supersedes an in-flight request", async () => {
    const first = deferred<FoodNutrition[]>();
    const h = lookupHarness();
    h.search.mockReturnValueOnce(first.promise);
    h.cache.set("국수", [{ name: "국수" }]);
    const pending = h.lookup("밥");
    await h.lookup("국수");
    first.resolve([{ name: "밥" }]);
    await pending;
    expect(h.view()).toEqual({ kind: "done", items: [{ name: "국수" }] });
    expect(h.search).toHaveBeenCalledTimes(1);
  });

  test("screen events retire responses synchronously, and unmount retires outstanding work", () => {
    const meals = screenNode("MealsScreen").getText(ast);
    expect(meals).toMatch(/setDraft\(v\);\s*resetLookup\(\);/);
    expect(meals).toMatch(/setDraft\(name\);\s*resetLookup\(\);/);
    expect(meals).toMatch(/setDraft\(current\?\.title \?\? ""\);\s*resetLookup\(\);/);
    expect(meals).toContain("if (!mealWriting) resetLookup();");
    expect(meals).toMatch(/mealWriteLock\(userId, sheet.date, sheet.slot\), async \(\) => \{\s*resetLookup\(\);/);
    expect(meals).toMatch(/if \(action === "close"\) \{\s*resetLookup\(\);/);
    expect(meals).toContain("useEffect(() => () => { lookupSeq.current += 1; }, []);");
    expect(meals).toContain('disabled={mealWriting || lookup.kind === "busy"}');
  });
  test("no lookup starts in a closed sheet or during a meal write", async () => {
    const h = lookupHarness();
    await h.lookup("밥", null);
    await h.lookup("밥", {}, true);
    expect(h.search).not.toHaveBeenCalled();
    expect(h.view()).toEqual({ kind: "idle" });
  });
});

describe("BL-08: reject oversized page edits without ever keeping their prefix", () => {
  test("0000120 is refused, keeps the old field, and cannot become 12 on the next edit", () => {
    const refused = pageCountEdit("45", "0000120");
    expect(refused).toEqual({ text: "45", overflow: true });
    const corrected = pageCountEdit(refused.text, "120");
    expect(corrected).toEqual({ text: "120", overflow: false });
    expect(parsePageDraft(corrected.text, "300")).toEqual({ current_page: 120, total_pages: 300 });
  });
  test("both fields enforce the raw limit, while numeric boundaries and unknown total still work", () => {
    expect(parsePageDraft("0000120", "")).toBeNull();
    expect(parsePageDraft("12", "0000300")).toBeNull();
    expect(parsePageDraft("100000", "")).toEqual({ current_page: 100000, total_pages: null });
    expect(parsePageDraft("100001", "")).toBeNull();
    expect(pageCountEdit("", "")).toEqual({ text: "", overflow: false });
  });
  test.each(["curOverflow", "totalOverflow"])("%s prevents saving the held number", async (field) => {
    const write = jest.fn().mockResolvedValue("busy");
    const error = jest.fn();
    const save = callback<() => Promise<void>>("ReadingScreen", "onSavePages", {
      userId: "u", pageSaving: false,
      pageEdit: { id: "book", session: 1, cur: "45", total: "300", curOverflow: false, totalOverflow: false, [field]: true },
      parsePageDraft, setPageErr: error, runExclusive: write, pageWriteLock: () => ({ held: false }),
    });
    await save();
    expect(error).toHaveBeenCalledWith(true);
    expect(write).not.toHaveBeenCalled();
  });
  test("both native fields use whole-edit refusal and expose the rejected field until corrected", () => {
    const reading = screenNode("ReadingScreen").getText(ast);
    expect(reading).not.toMatch(/maxLength=/);
    expect(reading).toContain("const edit = pageCountEdit(p.cur, v);");
    expect(reading).toContain("cur: edit.text, curOverflow: edit.overflow");
    expect(reading).toContain("const edit = pageCountEdit(p.total, v);");
    expect(reading).toContain("total: edit.text, totalOverflow: edit.overflow");
    expect(reading).toContain("{pageErr || pageEdit.curOverflow || pageEdit.totalOverflow ? (");
    expect(reading).toContain("curOverflow: false,");
    expect(reading).toContain("totalOverflow: false,");
  });
});

describe("S-03: stable full-title manual identity with legacy short ids", () => {
  test("200 characters and longer titles sharing that prefix stay distinct", async () => {
    const prefix = "가".repeat(200);
    const a = await manualBook(`${prefix}첫째`);
    const b = await manualBook(`${prefix}둘째`);
    expect(a?.id).toBe(`manual:${prefix}첫째`);
    expect(a?.id).not.toBe(b?.id);
    expect(a?.title).toHaveLength(200);
    expect((await manualBook(prefix))?.id).toBe(`manual:${prefix}`);
    expect((await manualBook(prefix))?.id).not.toBe(a?.id);
  });
  test("long normalized repeats deduplicate without colliding with a literal hash title", async () => {
    const a = await manualBook(`${"A".repeat(400)}  Book`);
    const b = await manualBook(`  ${"a".repeat(400)} book  `);
    expect(a?.id).toBe(b?.id);
    expect(a?.id).toBe(`manual:SHA256:${createHash("sha256").update(`${"a".repeat(400)} book`).digest("hex")}`);
    const literal = await manualBook(a!.id.slice("manual:".length));
    expect(literal?.id).not.toBe(a?.id);
    expect((await manualBook("Demian"))?.id).toBe("manual:demian");
    expect((await manualBook("x".repeat(10000)))?.id).toHaveLength(78);
  });
  test("case-fold expansion across 200 and 400 units preserves legacy ids and stable dedup", async () => {
    const short = `${"A".repeat(199)}İ`;
    const expanded = short.toLowerCase();
    expect((await manualBook(short))?.id).toBe(`manual:${expanded}`);
    expect((await manualBook(expanded))?.id).toBe(`manual:${expanded}`);
    const legacy = "İ".repeat(200);
    expect((await manualBook(legacy))?.id).toBe(`manual:${legacy.toLowerCase()}`);
    const long = `${legacy}A`;
    const book = await manualBook(long);
    expect(book?.id).toHaveLength(78);
    expect(book?.id).toBe((await manualBook(long.toLowerCase()))?.id);
  });
  test("an existing short manual row returns with its progress untouched", async () => {
    const row = { id: "old", user_id: "u", volume_id: "manual:demian", title: "Demian", status: "reading", current_page: 120, total_pages: 200 };
    const db = { from: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), maybeSingle: jest.fn().mockResolvedValue({ data: row, error: null }), insert: jest.fn() };
    jest.mocked(getSupabaseClient).mockReturnValue(db as unknown as ReturnType<typeof getSupabaseClient>);
    const entry = await addToShelf("u", (await manualBook("  DEMIAN  "))!);
    expect(entry.current_page).toBe(120);
    expect(entry.status).toBe("reading");
    expect(db.eq).toHaveBeenCalledWith("volume_id", "manual:demian");
    expect(db.insert).not.toHaveBeenCalled();
  });
  test("a late manual identity cannot replace the next book search", async () => {
    const oldBook = deferred<Awaited<ReturnType<typeof manualBook>>>();
    const seq = { current: 0 };
    const manual = jest.fn();
    const search = jest.fn();
    const make = (q: string, book: () => Promise<Awaited<ReturnType<typeof manualBook>>>) => callback<() => Promise<void>>("ReadingScreen", "onSearch", {
      q, searchSeq: seq, setManual: manual, setSearch: search, searchBooks: async () => [], manualBook: book, bookSearchSettled, bookSearchFailed,
    });
    const first = make("old", () => oldBook.promise)();
    await Promise.resolve();
    await make("new", () => manualBook("new"))();
    oldBook.resolve(await manualBook("old"));
    await first;
    expect(manual).toHaveBeenLastCalledWith(expect.objectContaining({ id: "manual:new" }));
    expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ q: "new" }));
  });
});

describe("BL-05/S-06 and BL-06/S-07: domain cache follows committed writes", () => {
  test.each(["pages", "ledger"])("%s invalidates only after success and scopes the write to its owner", async (kind) => {
    const result = deferred<{ error: Error | null }>();
    const db = { from: jest.fn().mockReturnThis(), update: jest.fn().mockReturnThis(), delete: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), then: result.promise.then.bind(result.promise) };
    jest.mocked(getSupabaseClient).mockReturnValue(db as unknown as ReturnType<typeof getSupabaseClient>);
    jest.mocked(invalidateDomainLevels).mockClear();
    const operation = kind === "pages" ? updateShelfEntry("u", "row", { current_page: 20 }) : deleteLedgerEntry("u", "row");
    expect(invalidateDomainLevels).not.toHaveBeenCalled();
    result.resolve({ error: null });
    await operation;
    expect(invalidateDomainLevels).toHaveBeenCalledTimes(1);
    expect(invalidateDomainLevels).toHaveBeenCalledWith("u");
    expect(db.eq).toHaveBeenCalledWith("user_id", "u");
    expect(db.eq).toHaveBeenCalledWith("id", "row");
  });
  test.each(["pages", "ledger"])("failed %s write does not invalidate", async (kind) => {
    const error = new Error("refused");
    const db = { from: jest.fn().mockReturnThis(), update: jest.fn().mockReturnThis(), delete: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), then: (resolve: (value: unknown) => void) => resolve({ error }) };
    jest.mocked(getSupabaseClient).mockReturnValue(db as unknown as ReturnType<typeof getSupabaseClient>);
    jest.mocked(invalidateDomainLevels).mockClear();
    await expect(kind === "pages" ? updateShelfEntry("u", "row", { current_page: 20 }) : deleteLedgerEntry("u", "row")).rejects.toBe(error);
    expect(invalidateDomainLevels).not.toHaveBeenCalled();
  });
});

describe("CD-R1-02: transport failures never become cached zero matches", () => {
  test.each([503, 401, 429, 500])("HTTP %i shows failure and retry actually calls the proxy again", async (status) => {
    const invoke = jest.fn()
      .mockResolvedValueOnce({ data: null, error: { context: { status }, message: "quota_check_unavailable" } })
      .mockResolvedValueOnce({ data: { data: { items: [{ FOOD_NM_KR: "밥" }] } }, error: null });
    jest.mocked(getSupabaseClient).mockReturnValue({ functions: { invoke } } as unknown as ReturnType<typeof getSupabaseClient>);
    const h = lookupHarness(jest.fn((query: string) => searchFoods(query)));
    await h.lookup("밥");
    expect(h.view()).toEqual({ kind: "failed" });
    expect(h.cache.has("밥")).toBe(false);
    await h.lookup("밥");
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(h.view()).toEqual({ kind: "done", items: [{ name: "밥" }] });
  });
  test("a successful zero-match answer is still cached", async () => {
    const invoke = jest.fn().mockResolvedValue({ data: { data: { items: [] } }, error: null });
    jest.mocked(getSupabaseClient).mockReturnValue({ functions: { invoke } } as unknown as ReturnType<typeof getSupabaseClient>);
    const h = lookupHarness(jest.fn((query: string) => searchFoods(query)));
    await h.lookup("밥");
    await h.lookup("밥");
    expect(h.view()).toEqual({ kind: "done", items: [] });
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
