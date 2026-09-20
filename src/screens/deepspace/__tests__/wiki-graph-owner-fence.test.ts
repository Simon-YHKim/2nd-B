// The SECOND copy of useWikiGraphData - the one #1849 did not reach.
//
// There are two loaders in the deep-space tree with the same body: the one in
// dds-wiki-records-screens.tsx, fenced by #1849 and covered by
// src/lib/chat/__tests__/citation-opens-the-cited-page.test.ts, and this one in
// DeepSpaceDesignScreens.tsx, read by DeepSpaceDomainsScreen and the /research
// screen. The fence went to one of them, so this file holds the other to the
// same contract - same shape of test, same question:
//
//   rows fetched for account A must not be readable once B is the owner.
//
// The two loaders are deliberately NOT merged; the fence is what is copied, not
// the screens. So the coverage is copied too, rather than shared through an
// import that would quietly tie the two files together.
//
// Executed, not grepped: the real declarations are lifted out of the real source
// by AST and run against a stand-in hook runtime. If the screen is refactored so
// a lifted piece no longer exists, `lift` throws and this suite goes RED rather
// than passing on a marker it stopped finding.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";

const ROOT = resolve(__dirname, "../../../..");
const SCREEN = "src/screens/deepspace/DeepSpaceDesignScreens.tsx";

const source = readFileSync(resolve(ROOT, SCREEN), "utf8").replace(/\r\n/g, "\n");
const AST = ts.createSourceFile(SCREEN, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

/** The SHORTEST statement of `kind` whose text contains `marker`.
 *
 *  Shortest, because every enclosing statement contains the marker too and the
 *  innermost one is the declaration itself. That also means a marker has to be
 *  specific: this file has TWO `[held, setHeld]` declarations - the loader's and
 *  an unrelated boolean press-state - and the boolean one is shorter, so the
 *  marker below carries its type argument. */
function lift(marker: string, kind: "declaration" | "effect" = "declaration"): string {
  const isWanted = (node: ts.Node): boolean =>
    kind === "declaration"
      ? ts.isVariableStatement(node)
      : ts.isExpressionStatement(node) &&
        ts.isCallExpression(node.expression) &&
        node.expression.expression.getText(AST) === "useEffect";
  let best: string | null = null;
  walk(AST, (node) => {
    if (!isWanted(node)) return;
    const text = node.getText(AST);
    if (text.includes(marker) && (best === null || text.length < best.length)) best = text;
  });
  if (best === null) throw new Error(`no ${kind} in ${SCREEN} contains ${JSON.stringify(marker)}`);
  return best;
}

interface Row {
  id: string;
  title: string;
}
interface OwnedRows {
  ownerId: string | null;
  pages: Row[];
  edges: unknown[];
}

const PIECES = [
  lift("[held, setHeld] = useState<OwnedWikiRows>"),
  lift("listWikiPages(userId, { limit: 200 })", "effect"),
  lift("const owned = held.ownerId"),
];

const A_ROW: Row = { id: "a-page", title: "a private title" };
const B_ROW: Row = { id: "b-page", title: "b own title" };

/** Declared rather than derived from `runtime`'s return type: `runtime` names
 *  `Hooks` in its own signature, so `ReturnType<typeof runtime>` is circular and
 *  `tsc --noEmit` rejects it (ts-jest transpiles happily, which is exactly how
 *  that lands in CI instead of here). */
interface Hooks {
  useState<S>(initial: S): [S, (next: S) => void];
  useEffect(effect: () => void | (() => void), deps: unknown[]): void;
}

type Loader = (props: { userId: string | null }, h: Hooks) => OwnedRows;

interface Runtime {
  hooks: Hooks;
  once(loader: Loader, userId: string | null): OwnedRows;
  settled(loader: Loader, userId: string | null): Promise<OwnedRows>;
}

/** useState + useEffect with real slot identity across renders. Passed in as an
 *  argument rather than patched onto React, so `react` never loads. */
function runtime(): Runtime {
  const slots: { value?: unknown; deps?: unknown[]; cleanup?: unknown }[] = [];
  const queued: (() => void)[] = [];
  let cursor = 0;
  let dirty = false;
  const same = (a: unknown[] | undefined, b: unknown[]): boolean =>
    a !== undefined && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));

  const hooks = {
    useState<S>(initial: S): [S, (next: S) => void] {
      const at = cursor++;
      if (slots[at] === undefined) slots[at] = { value: initial };
      const slot = slots[at];
      return [
        slot.value as S,
        (next: S): void => {
          if (Object.is(next, slot.value)) return;
          slot.value = next;
          dirty = true;
        },
      ];
    },
    useEffect(effect: () => void | (() => void), deps: unknown[]): void {
      const at = cursor++;
      const slot = slots[at];
      if (slot !== undefined && same(slot.deps, deps)) return;
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
    /** One render pass, nothing flushed and nothing awaited: exactly what the
     *  screen draws in the commit after its owner changed, while the load for
     *  the new owner is still in flight. That window is the whole question. */
    once(loader: Loader, userId: string | null): OwnedRows {
      cursor = 0;
      return loader({ userId }, hooks);
    },
    async settled(loader: Loader, userId: string | null): Promise<OwnedRows> {
      dirty = true;
      let out: OwnedRows | null = null;
      for (let round = 0; round < 30 && dirty; round++) {
        dirty = false;
        cursor = 0;
        out = loader({ userId }, hooks);
        for (const run of queued.splice(0)) run();
        await new Promise((r) => setImmediate(r));
      }
      if (out === null) throw new Error("the loader never rendered");
      return out;
    },
  };
}

function build(reads: string[]): Loader {
  const library: Record<string, Row[]> = { "owner-a": [A_ROW], "owner-b": [B_ROW] };
  const js = ts.transpileModule(
    [
      "function WikiRows(props, H) {",
      "  const { useState, useEffect } = H;",
      "  const { userId } = props;",
      PIECES.join("\n"),
      "  return owned;",
      "}",
      "return WikiRows;",
    ].join("\n"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText;
  const bindings: Record<string, unknown> = {
    NO_WIKI_ROWS: { ownerId: null, pages: [], edges: [] } as OwnedRows,
    setLoading: () => undefined,
    listWikiPages: async (userId: string) => {
      reads.push(userId);
      return library[userId] ?? [];
    },
    listAllWikiLinks: async () => [],
  };
  // An unlisted free variable is a ReferenceError at CALL time, not here, so
  // every branch below is exercised or a missing binding would go unnoticed.
  return new Function(...Object.keys(bindings), js)(...Object.values(bindings)) as Loader;
}

describe("the /research + domains loader belongs to the account that loaded it", () => {
  test("the lifted pieces are the real ones", () => {
    // The lift is only worth something if it found the loader and not some other
    // statement that happens to contain the words.
    expect(PIECES[0]).toContain("useState<OwnedWikiRows>(NO_WIKI_ROWS)");
    expect(PIECES[1].startsWith("useEffect(")).toBe(true);
    expect(PIECES[1]).toContain("setHeld({ ownerId: userId, pages: p, edges: e })");
    expect(PIECES[2]).toContain("held.ownerId === userId");
  });

  test("rows loaded for A are not readable once B is the owner", async () => {
    const reads: string[] = [];
    const loader = build(reads);
    const r = runtime();

    const asA = await r.settled(loader, "owner-a");
    expect(reads).toEqual(["owner-a"]);
    expect(asA.pages.map((p) => p.id)).toEqual([A_ROW.id]);

    // The owner flips. This is the commit straight after, with B's own load
    // still in flight - the window the fence exists for.
    const firstAsB = r.once(loader, "owner-b");
    expect(firstAsB.pages).toEqual([]);
    expect(firstAsB.edges).toEqual([]);
    expect(JSON.stringify(firstAsB)).not.toContain(A_ROW.title);

    // ...and once B's own load answers, B sees B's library.
    const asB = await r.settled(loader, "owner-b");
    expect(reads).toEqual(["owner-a", "owner-b"]);
    expect(asB.pages.map((p) => p.id)).toEqual([B_ROW.id]);
  });

  test("a signed-out read is empty, not the last account's rows", () => {
    const reads: string[] = [];
    const r = runtime();
    // Fresh runtime: nothing has loaded, so `held` is still the empty sentinel
    // and a null owner must not match it into visibility.
    expect(r.once(build(reads), null).pages).toEqual([]);
    expect(reads).toEqual([]);
  });

  test("both copies of the loader carry the fence, and neither imports the other", () => {
    // The twin. If someone fences one and not the other again, this names it.
    const twin = readFileSync(
      resolve(ROOT, "src/screens/deepspace/dds-wiki-records-screens.tsx"),
      "utf8",
    ).replace(/\r\n/g, "\n");
    for (const [label, text] of [
      [SCREEN, source],
      ["dds-wiki-records-screens.tsx", twin],
    ] as const) {
      expect(`${label}: ${text.includes("held.ownerId === userId")}`).toBe(`${label}: true`);
    }
    // Held apart on purpose (different screens, different contracts). The two
    // files DO share small pieces - FilterChip, and a re-export of the records
    // screens - so the claim is narrower than "they never touch": each declares
    // its own loader, and neither imports the other's. Merging them is a change
    // of its own, and this is the assertion that would have to be argued first.
    expect(source).toContain("function useWikiGraphData()");
    expect(twin).toContain("function useWikiGraphData()");
    expect(source).not.toMatch(/import[^;]*useWikiGraphData[^;]*from/);
    expect(twin).not.toMatch(/import[^;]*useWikiGraphData[^;]*from/);
  });
});
