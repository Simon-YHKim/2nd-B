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
// Shape assertions keep one slug resolver and one drawer route. The thin screen
// handler is executed below; cited-wiki-page-read.test.ts executes the shipping
// hook, query, hook inputs, drawer JSX, and navigation callback for success,
// missing, rejection, timeout/retry, and account/chat/route/drawer lifetimes.
// The source-wiki-conversation integration also executes capture -> promotion ->
// RAG citation -> that same hook and tap. Loaded-row ownership is exercised below;
// the full destination focus hook and visible row run in
// screens/deepspace/__tests__/wiki-pages-read-failure.test.ts.
import { readFileSync } from "fs";
import { join } from "path";
import ts from "typescript";

import { buildDeepWikiView, type WikiEdge } from "@/screens/deepspace/wiki-graph-view";
import type { WikiPageRow } from "@/lib/wiki/types";
import { captureAccountOwnerLease, clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "@/lib/auth/account-epoch";
import { isTimeoutError, withTimeout } from "@/lib/async/with-timeout";

const ROOT = join(__dirname, "..", "..", "..", "..");

// CRLF-normalised: this repo checks out CRLF on Windows, and a scanner that
// silently matches nothing still reports PASS.
const read = (rel: string): string =>
  readFileSync(join(ROOT, rel), "utf8").split("\r\n").join("\n");

const CHAT = "src/app/secondb.tsx";
const WIKI = "src/screens/deepspace/dds-wiki-records-screens.tsx";
const QUERIES = "src/lib/wiki/queries.ts";
const RESOLVER = "src/lib/chat/use-cited-wiki-page.ts";
const FOCUSED_READ = "src/lib/wiki/use-focused-wiki-page.ts";

describe("a cited piece opens the piece", () => {
  test("the scanner is reading the real chat screen", () => {
    const src = read(CHAT);
    // 2026-10-05: the file lost its legacy chrome with the EXPO_PUBLIC_UI lever
    // (Simon decision Q-261004-11 C), so it holds one drawer. It used
    // to assert `variant === "deep-space"` here to prove both chromes lived in it.
    expect(src.length).toBeGreaterThan(50_000);
    expect(src).toContain("citedWiki.openDrawer(");
  });

  test("no citation tap closes the drawer and jumps straight to the wiki list", () => {
    // The exact shape the legacy drawer had. Nothing between the dismiss and the
    // push means nothing was ever looked up.
    const BLIND_JUMP = /setRefDrawer\(null\);\s*\n\s*router\.push\("\/wiki"\);/g;
    const hits = [...read(CHAT).matchAll(BLIND_JUMP)].map((h) => h[0]);
    expect(hits).toEqual([]);
  });

  test("the slug is resolved in exactly one place, and the drawer reaches it", () => {
    const src = read(CHAT);
    expect([...read(RESOLVER).matchAll(/getWikiPage\(/g)]).toHaveLength(1);
    expect([...src.matchAll(/onPress=\{\(\) => openCitedPage\(slug\)\}/g)]).toHaveLength(1);
    expect(src).toContain("citedWiki.openCitedPage(slug)");
    expect(src).toContain("recordDetail:state.missingTitle");
    expect(src).toContain("onPress={citedWiki.retry}");
    // Failed or absent lookups stay in the drawer. Only a resolved page ID
    // reaches navigation; behavior is executed in cited-wiki-page-read.test.
    expect(src).not.toContain('else router.push("/wiki")');
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
    // useScreenParams is useLocalSearchParams outside the dashboard phone and the
    // phone route's query inside it (src/lib/nav/phone-embed.tsx).
    expect(src).toMatch(/useScreenParams<\{ focusPageId\?: string \}>\(\)/);
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
    expect(src).toContain("useFocusedWikiPage(userId, focusPageId, pages,");
    expect(read(FOCUSED_READ)).toContain("getWikiPageById(userId, focusPageId)");
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

const OPEN_CITED_PAGE = lift(parse(CHAT), "const openCitedPage = (slug: string)");

test("the shipping tap delegates the unchanged citation slug to the owned resolver", () => {
  const resolve = jest.fn();
  const open = compile<(slug: string) => void>(OPEN_CITED_PAGE, "return openCitedPage;", {
    citedWiki: { openCitedPage: resolve },
  });
  open("walks-in-may");
  expect(resolve).toHaveBeenCalledWith("walks-in-may");
});

// The old inline-handler success/missing/failure/owner cases now execute the
// real hook + query + screen wiring in cited-wiki-page-read.test.ts, including
// timeout, retry, drawer, route, conversation, account-epoch and ABA lifetimes.

// ---------------------------------------------------------------------------
// Layer 3 - the row a citation pulls in belongs to one account.
// ---------------------------------------------------------------------------

const WIKI_AST = parse(WIKI);

// The extracted partial focus-state tests moved to the existing actual-component
// suite wiki-pages-read-failure.test.ts. It now executes the full focused read
// hook and query, tests A→B / same-ID ownership, and checks the visible result.

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
    expect(ROWS_PIECES[1]).toContain('setHeld({ ownerId: userId, epoch: accountEpoch, attempt, status: "ready", pages: p, edges: e })');
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
        "  const authLoading = false;",
        "  const accountEpoch = currentAccountEpoch();",
        "  const attempt = 0;",
        ROWS_PIECES.join("\n"),
        "  return owned;",
        "}",
      ].join("\n"),
      "return WikiRows;",
      {
        NO_WIKI_ROWS: { ownerId: null, pages: [], edges: [] } as OwnedRows,
        captureAccountOwnerLease,
        currentAccountEpoch,
        withTimeout,
        isTimeoutError,
        WIKI_PAGES_READ_TIMEOUT_MS: 10_000,
        listWikiPages: async (userId: string) => {
          loaded.push(userId);
          return library[userId] ?? [];
        },
        listAllWikiLinks: async () => [] as WikiEdge[],
      },
    );

    const runtime = focusRuntime();
    const render = (userId: string | null): Promise<OwnedRows> => {
      noteResolvedOwner(userId);
      clearAccountTransition(currentAccountEpoch());
      return runtime.render(rows as never, { userId } as never) as unknown as Promise<OwnedRows>;
    };

    const asA = await render("owner-a");
    expect(loaded).toEqual(["owner-a"]);
    expect(asA.pages.map((p) => p.id)).toEqual([A_CITED.id]);

    // The owner flips. This is the commit straight after, with B's own load still
    // in flight - the window the fence exists for.
    noteResolvedOwner("owner-b");
    clearAccountTransition(currentAccountEpoch());
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
