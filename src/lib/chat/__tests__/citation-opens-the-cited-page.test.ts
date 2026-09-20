// A source card that says "this is where the answer came from" and then opens a
// LIST is not showing the source. It is showing the shelf the source is on. And a
// card that opens the right page for the WRONG ACCOUNT is worse than either.
//
// SecondB cites the user's own wiki pages as [[slug]] markers (lib/chat/sources.ts)
// and the chat renders those as tappable cards. The deep-space chrome resolved the
// slug to a page id and deep-linked /wiki?focusPageId (med#23). The legacy chrome
// did not: it carried a "once a slug->page resolver exists" note beside a bare
// router.push("/wiki"). One file, two behaviours - in a file whose own header
// promises "the send handler, RAG/citation parsing ... are byte-identical for both
// variants - there is NO logic fork".
//
// This file guards that one tap end to end, in three layers:
//
//   1. SHAPE (source assertions) - the lookup exists, lives in one place, and both
//      drawers reach it. A behaviour test cannot see "exactly one implementation".
//   2. ROUTE (executable) - the handler is lifted out of the screen by AST and RUN,
//      so the assertion is about where the tap GOES, not about which characters are
//      present. An R48 gate proved the shape layer alone stays green when the
//      success-branch push is deleted outright; that mutant dies here.
//   3. OWNER (executable) - the wiki screen's focus state is lifted out and run
//      across an account change, because the row a citation pulls in is a row of
//      someone's own writing and it must not survive into the next account.
//
// Layers 2 and 3 are source-extracted rather than rendered: react-test-renderer is
// blocked on RN 0.85 here, and neither the handler nor the focus state needs a real
// renderer - they need their own inputs and a way to watch what they do with them.
import { readFileSync } from "fs";
import { join } from "path";
import ts from "typescript";

import { buildDeepWikiView, snippetOf, type WikiEdge } from "@/screens/deepspace/wiki-graph-view";
import type { WikiPageRow } from "@/lib/wiki/types";

const ROOT = join(__dirname, "..", "..", "..", "..");

// CRLF-normalised: this repo checks out CRLF on Windows, and a scanner that
// silently matches nothing still reports PASS.
const read = (rel: string): string =>
  readFileSync(join(ROOT, rel), "utf8").split("\r\n").join("\n");

const CHAT = "src/app/secondb.tsx";
const WIKI = "src/screens/deepspace/dds-wiki-records-screens.tsx";
const QUERIES = "src/lib/wiki/queries.ts";

describe("a cited piece opens the piece", () => {
  test("the scanner is reading the real chat screen", () => {
    const src = read(CHAT);
    expect(src.length).toBeGreaterThan(50_000);
    // Both chromes really do live in this one file, so "two drawers" is a fact
    // about the file rather than an assumption this test is making.
    expect(src).toContain('const isDeepSpace = variant === "deep-space";');
    expect(src).toContain("setRefDrawer(");
  });

  test("no citation tap closes the drawer and jumps straight to the wiki list", () => {
    // The exact shape the legacy drawer had. Nothing between the dismiss and the
    // push means nothing was ever looked up.
    const BLIND_JUMP = /setRefDrawer\(null\);\s*\n\s*router\.push\("\/wiki"\);/g;
    const hits = [...read(CHAT).matchAll(BLIND_JUMP)].map((h) => h[0]);
    expect(hits).toEqual([]);
  });

  test("the slug is resolved in exactly one place, so the two chromes cannot drift", () => {
    const src = read(CHAT);
    // One lookup...
    expect([...src.matchAll(/getWikiPage\(/g)]).toHaveLength(1);
    // ...reached from both drawers, and from nothing else.
    expect([...src.matchAll(/onPress=\{\(\) => openCitedPage\(slug\)\}/g)]).toHaveLength(2);
    // The miss still lands on the list: the old behaviour kept as a fallback,
    // not deleted.
    expect(src).toMatch(/else router\.push\("\/wiki"\);/);
    // The failed-query fallback survives too, but it is now fenced by the same
    // owner lease as the success arm. Re-pinned in R49: the old assertion wanted
    // the bare `.catch(() => router.push("/wiki"))`, which cannot coexist with
    // the fence. What the assertion is FOR is unchanged - a thrown query still
    // lands somewhere rather than nowhere.
    expect(src).toMatch(/\.catch\(\(\) => \{\s*\n\s*if \(lease\.isCurrent\(\)\) router\.push\("\/wiki"\);\s*\n\s*\}\)/);
  });

  test("the lookup is by slug, which is what a citation carries", () => {
    // Feeding a citation slug into a by-id lookup would resolve nothing, forever,
    // and would look from the outside exactly like the bug this file closes.
    const q = read(QUERIES);
    const from = q.indexOf("export async function getWikiPage(");
    expect(from).toBeGreaterThan(-1);
    const body = q.slice(from, q.indexOf("\n}", from));
    expect(body).toContain('.eq("slug", slug)');
  });

  test("the screen on the other end reads focusPageId", () => {
    // Sending a parameter nobody reads is a half-fix that looks whole - the
    // failure mode this repo already keeps a guard family for
    // (route-params-have-a-reader).
    const src = read(WIKI);
    expect(src).toMatch(/useLocalSearchParams<\{ focusPageId\?: string \}>\(\)/);
    expect(src).toMatch(/setExpandedId\(focusPageId\)/);
  });

  test("a cited page outside the loaded window is still fetched, not dropped", () => {
    // The screen loads a bounded slice of the library, most-recently-updated
    // first. The RAG citation path picks pages by vector neighbourhood
    // (lib/chat/rag.ts) with no recency floor, so it can cite a page well
    // outside that slice. The old effect gave up when the id was not in the
    // loaded list, and gave up SILENTLY - no toast, no error, just the default
    // row - which is indistinguishable from "the deep link is broken".
    const src = read(WIKI);
    // The window really is bounded, so "outside it" is a reachable state and
    // not a hypothetical this test invented.
    expect(src).toMatch(/listWikiPages\(userId, \{ limit: \d+ \}\)/);
    // ...and the absent row is pulled by id rather than abandoned.
    expect(src).toContain("getWikiPageById(userId, focusPageId)");
    // The fetched row has to reach what is actually drawn. Feeding the raw
    // loaded slice back into the view would pin an id that is not in it.
    expect(src).toMatch(/buildDeepWikiView\(listedPages,/);
  });

  test("a second citation is honoured on a wiki screen that is already open", () => {
    // The old guard was `if (!focusPageId || expandedId !== null) return;`.
    // Any expanded row - including the one the FIRST deep link opened - made
    // every later citation a no-op on a mounted /wiki. Honouring per id keeps
    // the original intent (do not fight a row the user opened by hand) while
    // letting a genuinely new target through.
    const src = read(WIKI);
    expect(src).not.toContain("if (!focusPageId || expandedId !== null) return;");
    expect(src).toContain("honouredFocusRef.current");
  });
});

// ---------------------------------------------------------------------------
// The extractor. Lift a named declaration (or a bare statement) out of a real
// source file, compile it, and run it with everything it reaches for handed in.
//
// Why not import the modules: both files are React screens that pull in
// react-native, expo-router and a theme graph, none of which load under this
// repo's node test environment. The logic under test does not need any of them.
// ---------------------------------------------------------------------------

function parse(rel: string): ts.SourceFile {
  return ts.createSourceFile(
    rel,
    readFileSync(join(ROOT, rel), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

/** The SHORTEST statement of `kind` whose text contains `marker`.
 *
 *  Shortest, because a marker is contained by every enclosing statement too and
 *  the innermost one is the declaration itself. `kind` is a NODE SHAPE, not a
 *  hint: asking for the shortest statement containing "getWikiPageById(...)"
 *  returns the bare `void ...then(...)` line INSIDE the effect, which then runs
 *  during render with its `alive` flag out of scope - a fetch really happens, so
 *  a call-count assertion still passes while the state write never lands. That is
 *  the shape of test this file exists to stop, so callers also assert on the text
 *  that comes back. */
function lift(
  file: ts.SourceFile,
  marker: string,
  kind: "declaration" | "effect" = "declaration",
): string {
  const isWanted = (node: ts.Node): boolean =>
    kind === "declaration"
      ? ts.isVariableStatement(node)
      : ts.isExpressionStatement(node) &&
        ts.isCallExpression(node.expression) &&
        node.expression.expression.getText(file) === "useEffect";
  let best: string | null = null;
  walk(file, (node) => {
    if (!isWanted(node)) return;
    const text = node.getText(file);
    if (text.includes(marker) && (best === null || text.length < best.length)) best = text;
  });
  if (best === null) throw new Error(`no ${kind} in ${file.fileName} contains ${JSON.stringify(marker)}`);
  return best;
}

function compile<T>(source: string, tail: string, bindings: Record<string, unknown>): T {
  const js = ts.transpileModule([source, tail].join("\n"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  // An unlisted free variable is a ReferenceError at CALL time, not here - so
  // every branch below is exercised, or a missing binding would go unnoticed.
  return new Function(...Object.keys(bindings), js)(...Object.values(bindings)) as T;
}

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

// ---------------------------------------------------------------------------
// Layer 2 - where the tap actually goes.
// ---------------------------------------------------------------------------

type Push = string | { pathname: string; params?: Record<string, unknown> };

const CHAT_AST = parse(CHAT);
const OPEN_CITED_PAGE = lift(CHAT_AST, "const openCitedPage = (slug: string)");

interface Lease {
  isCurrent(): boolean;
}

function tapHost(opts: {
  userId?: string | null;
  page?: { id: string } | null;
  reject?: boolean;
  lease?: Lease | null;
} = {}) {
  const pushes: Push[] = [];
  const drawer: unknown[] = [];
  const lookups: { userId: string; slug: string }[] = [];
  let ownerIsCurrent = true;
  const open = compile<(slug: string) => void>(OPEN_CITED_PAGE, "return openCitedPage;", {
    setRefDrawer: (value: unknown) => drawer.push(value),
    userId: opts.userId === undefined ? "owner-a" : opts.userId,
    router: { push: (target: Push) => pushes.push(target) },
    captureAccountOwnerLease: () =>
      opts.lease === undefined ? { isCurrent: () => ownerIsCurrent } : opts.lease,
    getWikiPage: (userId: string, slug: string) => {
      lookups.push({ userId, slug });
      return opts.reject
        ? Promise.reject(new Error("query failed"))
        : Promise.resolve(opts.page === undefined ? { id: "page-77" } : opts.page);
    },
  });
  return { open, pushes, drawer, lookups, flipOwner: () => { ownerIsCurrent = false; } };
}

describe("the tap is executed, not just read", () => {
  test("the lifted handler is the real one", () => {
    // Binding by name is position-blind; pin what came back before running it.
    expect(OPEN_CITED_PAGE).toContain("getWikiPage(userId, slug)");
    expect(OPEN_CITED_PAGE).toContain("setRefDrawer(null)");
  });

  test("a resolved slug pushes /wiki carrying that page's id", async () => {
    // THE mutation the R48 gate got past the source layer: replacing this branch
    // with a bare `return` left every string assertion above satisfied while the
    // tap went nowhere.
    const host = tapHost();
    host.open("walks-in-may");
    await settle();

    expect(host.lookups).toEqual([{ userId: "owner-a", slug: "walks-in-may" }]);
    expect(host.pushes).toEqual([{ pathname: "/wiki", params: { focusPageId: "page-77" } }]);
    // The drawer closes first, so the destination is never drawn behind it.
    expect(host.drawer).toEqual([null]);
  });

  test("an unknown slug falls back to the list", async () => {
    const host = tapHost({ page: null });
    host.open("no-such-page");
    await settle();
    expect(host.pushes).toEqual(["/wiki"]);
  });

  test("a failed query falls back to the list", async () => {
    const host = tapHost({ reject: true });
    host.open("walks-in-may");
    await settle();
    expect(host.pushes).toEqual(["/wiki"]);
  });

  test("signed out, nothing is looked up and the list is all there is", async () => {
    const host = tapHost({ userId: null });
    host.open("walks-in-may");
    await settle();
    expect(host.lookups).toEqual([]);
    expect(host.pushes).toEqual(["/wiki"]);
  });
});

describe("a tap does not outlive the account that made it", () => {
  test("an account change between tap and answer cancels the move", async () => {
    // Supabase can publish A -> B with no signed-out frame. Without the lease
    // both continuations still ran, so A's tap moved B's app - measured by an
    // R48 gate as ownerAtCompletion "owner-B".
    const host = tapHost();
    host.open("walks-in-may");
    host.flipOwner();
    await settle();

    expect(host.lookups).toHaveLength(1);
    expect(host.pushes).toEqual([]);
  });

  test("the same is true when the query throws", async () => {
    const host = tapHost({ reject: true });
    host.open("walks-in-may");
    host.flipOwner();
    await settle();
    expect(host.pushes).toEqual([]);
  });

  test("a tap made after the owner already moved is dropped, not redirected", async () => {
    // A null lease means the published owner is no longer the one this screen
    // rendered for. Falling back to /wiki here would be the same wrong move.
    const host = tapHost({ lease: null });
    host.open("walks-in-may");
    await settle();
    expect(host.lookups).toEqual([]);
    expect(host.pushes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Layer 3 - the row a citation pulls in belongs to one account.
// ---------------------------------------------------------------------------

const WIKI_AST = parse(WIKI);

const FOCUS_PIECES = [
  lift(WIKI_AST, "[activeTag, setActiveTag]"),
  lift(WIKI_AST, "[expandedId, setExpandedId]"),
  lift(WIKI_AST, "[linkedPage, setLinkedPage]"),
  lift(WIKI_AST, "honouredFocusRef = useRef"),
  lift(WIKI_AST, "getWikiPageById(userId, focusPageId)", "effect"),
  lift(WIKI_AST, "const listedPages"),
  lift(WIKI_AST, "const view = useMemo"),
  lift(WIKI_AST, "const openId ="),
];

interface FocusProps {
  userId: string | null;
  focusPageId?: string;
  pages: WikiPageRow[];
  edges: WikiEdge[];
  loading: boolean;
}

interface FocusOut {
  listedPages: WikiPageRow[];
  view: ReturnType<typeof buildDeepWikiView>;
  openId: string | null;
  expandedId: string | null;
}

type Deps = readonly unknown[] | undefined;

const sameDeps = (a: Deps, b: Deps): boolean =>
  a !== undefined && b !== undefined && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

interface Slot {
  value?: unknown;
  ref?: { current: unknown };
  deps?: Deps;
  cleanup?: (() => void) | void;
}

/** The four hooks the lifted pieces use, with real slot identity across renders.
 *  Passed in as an argument rather than patched onto React, so `react` never
 *  loads and nothing global is touched. */
function focusRuntime() {
  const slots: Slot[] = [];
  const queued: (() => void)[] = [];
  let cursor = 0;
  let dirty = false;

  const hooks = {
    useState<S>(initial: S | (() => S)): [S, (next: S | ((prev: S) => S)) => void] {
      const at = cursor++;
      if (slots[at] === undefined) {
        slots[at] = { value: typeof initial === "function" ? (initial as () => S)() : initial };
      }
      const slot = slots[at];
      const set = (next: S | ((prev: S) => S)): void => {
        const value = typeof next === "function" ? (next as (prev: S) => S)(slot.value as S) : next;
        if (Object.is(value, slot.value)) return;
        slot.value = value;
        dirty = true;
      };
      return [slot.value as S, set];
    },
    useRef<S>(initial: S): { current: S } {
      const at = cursor++;
      if (slots[at] === undefined) slots[at] = { ref: { current: initial } };
      return slots[at].ref as { current: S };
    },
    useMemo<S>(factory: () => S, deps: Deps): S {
      const at = cursor++;
      const slot = slots[at];
      if (slot !== undefined && sameDeps(slot.deps, deps)) return slot.value as S;
      const value = factory();
      slots[at] = { value, deps };
      return value;
    },
    useEffect(effect: () => void | (() => void), deps: Deps): void {
      const at = cursor++;
      const slot = slots[at];
      if (slot !== undefined && sameDeps(slot.deps, deps)) return;
      const previous = slot?.cleanup;
      slots[at] = { deps, cleanup: previous };
      queued.push(() => {
        if (typeof previous === "function") previous();
        slots[at] = { deps, cleanup: effect() };
      });
    },
  };

  return {
    hooks,
    /** One render pass, no effects flushed and nothing awaited: what the screen
     *  draws in the commit right after its owner changed, while the load for the
     *  new owner is still in flight. That window is the whole question here. */
    renderOnce<T>(component: (props: never, h: typeof hooks) => T, props: unknown): T {
      cursor = 0;
      return component(props as never, hooks);
    },
    async render(component: (props: FocusProps, h: typeof hooks) => FocusOut, props: FocusProps): Promise<FocusOut> {
      dirty = true;
      let out: FocusOut | null = null;
      for (let round = 0; round < 30 && dirty; round++) {
        dirty = false;
        cursor = 0;
        out = component(props, hooks);
        for (const run of queued.splice(0)) run();
        await settle();
      }
      if (out === null) throw new Error("the component never rendered");
      return out;
    },
  };
}

const row = (id: string, owner: string, tag: string): WikiPageRow =>
  ({
    id,
    user_id: owner,
    slug: id,
    title: `${id} title`,
    body_md: `the body of ${id}, written by ${owner}`,
    kind: "note",
    tags: [tag],
    source_id: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
  }) as unknown as WikiPageRow;

/** A's page, outside the loaded window - the one a citation has to fetch by id. */
const A_CITED = row("a-cited", "owner-a", "tag-of-a");
/** B's own page, the only thing B may see. */
const B_OWN = row("b-own", "owner-b", "tag-of-b");

describe("a fetched citation row belongs to the account that fetched it", () => {
  test("the lifted pieces are the real ones", () => {
    expect(FOCUS_PIECES[2]).toContain("useState<{ ownerId: string; page: WikiPageRow } | null>(null)");
    // The whole effect, not the fetch line inside it: the inner statement is the
    // shorter match and would run during render with `alive` unbound.
    expect(FOCUS_PIECES[4].startsWith("useEffect(")).toBe(true);
    expect(FOCUS_PIECES[4]).toContain("getWikiPageById(userId, focusPageId)");
    expect(FOCUS_PIECES[4]).toContain("honouredFocusRef.current = honour");
    expect(FOCUS_PIECES[4]).toContain("alive = false");
    expect(FOCUS_PIECES[5]).toContain("const listedPages");
    expect(FOCUS_PIECES[5]).toContain("...pages]");
    expect(FOCUS_PIECES[6]).toContain("buildDeepWikiView(listedPages");
    expect(FOCUS_PIECES[7]).toContain("const openId =");
  });

  test("owner A's out-of-window citation renders for A, and nothing of it survives into B", async () => {
    const fetched: { userId: string; id: string }[] = [];
    const library: Record<string, Record<string, WikiPageRow>> = {
      "owner-a": { [A_CITED.id]: A_CITED },
      "owner-b": { [B_OWN.id]: B_OWN },
    };
    const focus = compile<(props: FocusProps, h: unknown) => FocusOut>(
      [
        "function WikiFocus(props, H) {",
        "  const { useState, useRef, useEffect, useMemo } = H;",
        "  const { userId, focusPageId, pages, edges, loading } = props;",
        FOCUS_PIECES.join("\n"),
        "  return { listedPages, view, openId, expandedId };",
        "}",
      ].join("\n"),
      "return WikiFocus;",
      {
        buildDeepWikiView,
        getWikiPageById: async (userId: string, id: string) => {
          fetched.push({ userId, id });
          return library[userId]?.[id] ?? null;
        },
      },
    );

    const runtime = focusRuntime();

    // A taps a citation naming a page outside the 200-row window. Self-check:
    // if this half did not work the second half would pass vacuously.
    const asA = await runtime.render(focus, {
      userId: "owner-a",
      focusPageId: A_CITED.id,
      pages: [],
      edges: [],
      loading: false,
    });
    expect(fetched).toEqual([{ userId: "owner-a", id: A_CITED.id }]);
    expect(asA.listedPages.map((p) => p.id)).toEqual([A_CITED.id]);
    expect(asA.view.pages.map((p) => p.id)).toEqual([A_CITED.id]);
    expect(asA.openId).toBe(A_CITED.id);

    // Supabase publishes A -> B with no signed-out frame. The same mounted
    // screen now renders for B.
    const asB = await runtime.render(focus, {
      userId: "owner-b",
      focusPageId: A_CITED.id,
      pages: [B_OWN],
      edges: [],
      loading: false,
    });

    // Not "B refetched" and not a call count: after an owner change the defect
    // is that NOTHING happens, so count-based assertions go green on the bug.
    // What matters is what is drawable.
    const drawn = JSON.stringify(asB.view.pages);
    expect(drawn).not.toContain(A_CITED.title);
    expect(drawn).not.toContain(snippetOf(A_CITED.body_md));
    expect(drawn).not.toContain(A_CITED.tags[0]);

    expect(asB.listedPages.map((p) => p.id)).toEqual([B_OWN.id]);
    expect(asB.view.pages.map((p) => p.id)).toEqual([B_OWN.id]);
    // And the row B lands on is B's own, not a leftover id that opens nothing.
    expect(asB.openId).toBe(B_OWN.id);
  });

  test("B asking for the same id again is answered by B's own library, not A's", async () => {
    const fetched: { userId: string; id: string }[] = [];
    const library: Record<string, Record<string, WikiPageRow>> = {
      "owner-a": { [A_CITED.id]: A_CITED },
      "owner-b": {},
    };
    const focus = compile<(props: FocusProps, h: unknown) => FocusOut>(
      [
        "function WikiFocus(props, H) {",
        "  const { useState, useRef, useEffect, useMemo } = H;",
        "  const { userId, focusPageId, pages, edges, loading } = props;",
        FOCUS_PIECES.join("\n"),
        "  return { listedPages, view, openId, expandedId };",
        "}",
      ].join("\n"),
      "return WikiFocus;",
      {
        buildDeepWikiView,
        getWikiPageById: async (userId: string, id: string) => {
          fetched.push({ userId, id });
          return library[userId]?.[id] ?? null;
        },
      },
    );

    const runtime = focusRuntime();
    await runtime.render(focus, {
      userId: "owner-a",
      focusPageId: A_CITED.id,
      pages: [],
      edges: [],
      loading: false,
    });
    await runtime.render(focus, {
      userId: "owner-b",
      focusPageId: A_CITED.id,
      pages: [B_OWN],
      edges: [],
      loading: false,
    });

    // The "honoured once" guard is keyed on the pair, so B is allowed to ask.
    // The query is owner-filtered, so B's ask comes back empty - which is the
    // point: B's answer comes from B's library, never from what A left behind.
    expect(fetched).toEqual([
      { userId: "owner-a", id: A_CITED.id },
      { userId: "owner-b", id: A_CITED.id },
    ]);
  });
});

// The loaded window itself is fenced the same way, and by the same reasoning: the
// effect below overwrites its rows only once the network answers, so a screen that
// was not thrown away would draw the previous account's whole 200-row library for
// the length of the refetch. That is a wider surface than the one cited row, so a
// guard that covered only the citation would be an incomplete claim.

const ROWS_PIECES = [
  lift(WIKI_AST, "[held, setHeld]"),
  lift(WIKI_AST, "listWikiPages(userId, { limit: 200 })", "effect"),
  lift(WIKI_AST, "const owned = held.ownerId"),
];

interface OwnedRows {
  ownerId: string | null;
  pages: WikiPageRow[];
  edges: WikiEdge[];
}

describe("the loaded window belongs to the account that loaded it", () => {
  test("the lifted pieces are the real ones", () => {
    expect(ROWS_PIECES[1].startsWith("useEffect(")).toBe(true);
    expect(ROWS_PIECES[1]).toContain("setHeld({ ownerId: userId, pages: p, edges: e })");
    expect(ROWS_PIECES[2]).toContain("held.ownerId === userId");
  });

  test("rows loaded for A are not readable once B is the owner", async () => {
    const loaded: string[] = [];
    const library: Record<string, WikiPageRow[]> = {
      "owner-a": [A_CITED],
      "owner-b": [B_OWN],
    };
    const rows = compile<(props: { userId: string | null }, h: unknown) => OwnedRows>(
      [
        "function WikiRows(props, H) {",
        "  const { useState, useEffect } = H;",
        "  const { userId } = props;",
        ROWS_PIECES.join("\n"),
        "  return owned;",
        "}",
      ].join("\n"),
      "return WikiRows;",
      {
        NO_WIKI_ROWS: { ownerId: null, pages: [], edges: [] } as OwnedRows,
        setLoading: () => undefined,
        listWikiPages: async (userId: string) => {
          loaded.push(userId);
          return library[userId] ?? [];
        },
        listAllWikiLinks: async () => [] as WikiEdge[],
      },
    );

    const runtime = focusRuntime();
    const render = (userId: string | null): Promise<OwnedRows> =>
      runtime.render(rows as never, { userId } as never) as unknown as Promise<OwnedRows>;

    const asA = await render("owner-a");
    expect(loaded).toEqual(["owner-a"]);
    expect(asA.pages.map((p) => p.id)).toEqual([A_CITED.id]);

    // The owner flips. This is the commit straight after, with B's own load still
    // in flight - the window the fence exists for.
    const firstAsB = runtime.renderOnce<OwnedRows>(rows as never, { userId: "owner-b" });
    expect(firstAsB.pages).toEqual([]);
    expect(firstAsB.edges).toEqual([]);
    expect(JSON.stringify(firstAsB)).not.toContain(A_CITED.title);

    // ...and once B's own load answers, B sees B's library.
    const asB = await render("owner-b");
    expect(loaded).toEqual(["owner-a", "owner-b"]);
    expect(asB.pages.map((p) => p.id)).toEqual([B_OWN.id]);
  });
});
