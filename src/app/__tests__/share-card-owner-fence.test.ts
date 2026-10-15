// /share-card loads three things for the signed-in account - the star count, the
// 북극성 문장 and the piece count - and puts them on an image the user exports.
// QA 261004 SG-02: the route can stay mounted while the account changes (A signs
// out, B signs in), and the loaded values were bare state. B saw A's sentence and
// A's star count until B's own loads answered, and an empty answer for B (no
// 북극성 문장) never replaced A's sentence at all, so A's words could leave on B's
// card.
//
//   values loaded for A must not be readable once B is the owner, and an empty
//   answer is an answer.
//
// Executed, not grepped (same shape as
// src/screens/deepspace/__tests__/wiki-graph-owner-fence.test.ts): the real
// declarations are lifted out of the real source by AST and run against a
// stand-in hook runtime. If a lifted piece stops existing, `lift` throws and this
// suite goes RED rather than passing on a marker it stopped finding.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";

import { deriveCardProps } from "@/lib/share/insight-card";

const ROOT = resolve(__dirname, "../../..");
const SCREEN = "src/app/share-card.tsx";

const source = readFileSync(resolve(ROOT, SCREEN), "utf8").replace(/\r\n/g, "\n");
const AST = ts.createSourceFile(SCREEN, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

/** The SHORTEST statement of `kind` whose text contains `marker` (every
 *  enclosing statement contains it too; the innermost one is the piece). */
function lift(marker: string, kind: "declaration" | "effect" | "function" = "declaration"): string {
  const isWanted = (node: ts.Node): boolean =>
    kind === "declaration"
      ? ts.isVariableStatement(node)
      : kind === "function"
        ? ts.isFunctionDeclaration(node)
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

const PIECES = [
  lift("function ownedBy<T>", "function"),
  lift("[heldLitStars, setHeldLitStars] = useState"),
  lift("[heldPieceCount, setHeldPieceCount] = useState"),
  lift("[heldSentence, setHeldSentence] = useState"),
  lift("[failedOwner, setFailedOwner] = useState"),
  lift("[retryKey, setRetryKey] = useState"),
  lift("loadDomainLevels(owner)", "effect"),
  lift("const litStars = ownedBy("),
  lift("const pieceCount = ownedBy("),
  lift("const sentence = ownedBy("),
  lift("const loadFailed ="),
];

interface Shown {
  litStars: number | null;
  pieceCount: number | null;
  sentence: string | null;
  loadFailed: boolean;
  retry: () => void;
}

interface Hooks {
  useState<S>(initial: S): [S, (next: S | ((prev: S) => S)) => void];
  useEffect(effect: () => void | (() => void), deps: unknown[]): void;
}

type Loader = (props: { userId: string | null }, h: Hooks) => Shown;

/** useState + useEffect with real slot identity across renders, passed in as an
 *  argument so `react` never loads. */
function runtime() {
  const slots: { value?: unknown; deps?: unknown[]; cleanup?: unknown }[] = [];
  const queued: (() => void)[] = [];
  let cursor = 0;
  let dirty = false;
  const same = (a: unknown[] | undefined, b: unknown[]): boolean =>
    a !== undefined && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));

  const hooks: Hooks = {
    useState<S>(initial: S): [S, (next: S | ((prev: S) => S)) => void] {
      const at = cursor++;
      if (slots[at] === undefined) slots[at] = { value: initial };
      const slot = slots[at];
      return [
        slot.value as S,
        (next) => {
          const value = typeof next === "function" ? (next as (prev: S) => S)(slot.value as S) : next;
          if (Object.is(value, slot.value)) return;
          slot.value = value;
          dirty = true;
        },
      ];
    },
    useEffect(effect, deps) {
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
    /** One render, nothing flushed: the commit straight after the owner
     *  changed, while the new owner's loads are still out. */
    once(loader: Loader, userId: string | null): Shown {
      cursor = 0;
      return loader({ userId }, hooks);
    },
    async settled(loader: Loader, userId: string | null): Promise<Shown> {
      dirty = true;
      let out: Shown | null = null;
      for (let round = 0; round < 30 && dirty; round++) {
        dirty = false;
        cursor = 0;
        out = loader({ userId }, hooks);
        for (const run of queued.splice(0)) run();
        await new Promise((r) => setImmediate(r));
      }
      if (out === null) throw new Error("the screen never rendered");
      return out;
    },
  };
}

interface Account {
  levels: Record<string, number> | Error;
  sentence: string | null;
  pieces: number | null;
}

function build(accounts: Record<string, Account>, reads: string[]): Loader {
  const js = ts.transpileModule(
    [
      PIECES[0],
      "function ShareCardLoads(props, H) {",
      "  const { useState, useEffect } = H;",
      "  const { userId } = props;",
      ...PIECES.slice(1),
      "  return { litStars, pieceCount, sentence, loadFailed, retry: () => setRetryKey((k) => k + 1) };",
      "}",
      "return ShareCardLoads;",
    ].join("\n"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText;
  const bindings: Record<string, unknown> = {
    loadDomainLevels: async (owner: string) => {
      reads.push(`levels:${owner}`);
      const levels = accounts[owner].levels;
      if (levels instanceof Error) throw levels;
      return { domainLevels: levels };
    },
    fetchCurrentNorthstar: async (owner: string) => ({ sentence: accounts[owner].sentence, savedAt: null }),
    countUserPieces: async (owner: string) => accounts[owner].pieces,
  };
  return new Function(...Object.keys(bindings), js)(...Object.values(bindings)) as Loader;
}

const A_SENTENCE = "A's private north-star sentence";
const FALLBACK = "the bundled default insight line";

describe("/share-card shows only the signed-in account's loads", () => {
  test("the lifted pieces are the real ones", () => {
    expect(PIECES[0]).toContain("held.ownerId === ownerId");
    expect(PIECES[6].startsWith("useEffect(")).toBe(true);
    expect(PIECES[6]).toContain("setHeldSentence({ ownerId: owner, value: s.sentence || null })");
    expect(PIECES[7]).toBe("const litStars = ownedBy(heldLitStars, userId);");
    // The render path below the loads still reads these four names.
    expect(source).toContain("litStars,\n    northStarSentence: sentence,");
    expect(source).toContain("pieceCount={pieceCount}");
    expect(source).toContain("if (loadFailed) {");
  });

  test("A's sentence and counts are gone in B's first render and stay gone after B's empty answer", async () => {
    const reads: string[] = [];
    const accounts: Record<string, Account> = {
      "owner-a": { levels: { career: 3, health: 2, rest: 1 }, sentence: A_SENTENCE, pieces: 9 },
      "owner-b": { levels: { career: 2 }, sentence: null, pieces: 1 },
    };
    const loader = build(accounts, reads);
    const r = runtime();

    const asA = await r.settled(loader, "owner-a");
    expect(asA).toMatchObject({ litStars: 2, pieceCount: 9, sentence: A_SENTENCE, loadFailed: false });

    // The owner flips; B's loads are still out.
    const firstAsB = r.once(loader, "owner-b");
    expect(firstAsB).toMatchObject({ litStars: null, pieceCount: null, sentence: null, loadFailed: false });
    // With no known count the screen waits and nothing can be exported.
    expect(deriveCardProps({ litStars: firstAsB.litStars, northStarSentence: firstAsB.sentence, fallbackInsight: FALLBACK }))
      .toEqual({ insight: FALLBACK, handle: "me", litCount: null });

    // B has no 북극성 문장: that empty answer is B's, and A's never comes back.
    const asB = await r.settled(loader, "owner-b");
    expect(asB).toMatchObject({ litStars: 1, pieceCount: 1, sentence: null, loadFailed: false });
    const card = deriveCardProps({ litStars: asB.litStars, northStarSentence: asB.sentence, fallbackInsight: FALLBACK });
    expect(card.insight).toBe(FALLBACK);
    expect(JSON.stringify(card)).not.toContain(A_SENTENCE);
    expect(reads).toEqual(["levels:owner-a", "levels:owner-b"]);
  });

  test("A's load failure is not B's error screen", async () => {
    const accounts: Record<string, Account> = {
      "owner-a": { levels: new Error("offline"), sentence: null, pieces: null },
      "owner-b": { levels: { career: 2 }, sentence: "b", pieces: 2 },
    };
    const loader = build(accounts, []);
    const r = runtime();
    expect((await r.settled(loader, "owner-a")).loadFailed).toBe(true);
    expect(r.once(loader, "owner-b").loadFailed).toBe(false);
    expect(await r.settled(loader, "owner-b")).toMatchObject({ litStars: 1, sentence: "b", loadFailed: false });
  });

  test("a retry for the same account takes an empty sentence answer as the new value", async () => {
    const owner: Account = { levels: new Error("offline"), sentence: "kept from before", pieces: 3 };
    const loader = build({ "owner-a": owner }, []);
    const r = runtime();
    const first = await r.settled(loader, "owner-a");
    expect(first).toMatchObject({ sentence: "kept from before", loadFailed: true });

    // The sentence was removed elsewhere; the retry's answer has none.
    owner.levels = { career: 2 };
    owner.sentence = null;
    first.retry();
    expect(await r.settled(loader, "owner-a")).toMatchObject({ litStars: 1, sentence: null, loadFailed: false });
  });

  test("signed out reads nothing", () => {
    const r = runtime();
    expect(r.once(build({}, []), null)).toMatchObject({ litStars: null, pieceCount: null, sentence: null, loadFailed: false });
  });
});
