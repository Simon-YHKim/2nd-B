// /research (DeepSpaceResearchScreen) holds three things that belong to the
// signed-in account: its records (the graph, hubs and headline titles), the tag
// chip it picked (the graph caption prints that tag name) and the AI link
// proposals (both page titles). QA 261004 SG-02: the route can stay mounted
// while the account changes (A signs out, B signs in), and all three were bare
// state, so B saw A's titles, A's tag and A's proposals until B's own loads
// answered. wiki-graph-owner-fence.test.ts says why it does not cover this
// screen: it no longer reads that loader, so it needs its own test.
//
//   values loaded for A must not be readable once B is the owner.
//
// Executed, not grepped: the real declarations are lifted out of the real source
// by AST and run against a stand-in hook runtime. If a lifted piece stops
// existing, `lift` throws and this suite goes RED.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";

const ROOT = resolve(__dirname, "../../../..");
const SCREEN = "src/screens/deepspace/DeepSpaceDesignScreens.tsx";

const source = readFileSync(resolve(ROOT, SCREEN), "utf8").replace(/\r\n/g, "\n");
const AST = ts.createSourceFile(SCREEN, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const RESEARCH = (() => {
  let found: ts.FunctionDeclaration | null = null;
  AST.forEachChild((node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "DeepSpaceResearchScreen") found = node;
  });
  if (found === null) throw new Error(`no DeepSpaceResearchScreen in ${SCREEN}`);
  return found as ts.FunctionDeclaration;
})();

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

type Kind = "declaration" | "effect" | "onPress";

/** The SHORTEST node of `kind` inside DeepSpaceResearchScreen whose text
 *  contains `marker`. Scoped to that one function: this file holds dozens of
 *  screens and several of them declare state with the same names. */
function lift(marker: string, kind: Kind = "declaration"): string {
  const isWanted = (node: ts.Node): boolean => {
    if (kind === "declaration") return ts.isVariableStatement(node);
    if (kind === "onPress") return ts.isJsxAttribute(node) && node.name.getText(AST) === "onPress";
    return (
      ts.isExpressionStatement(node) &&
      ts.isCallExpression(node.expression) &&
      node.expression.expression.getText(AST) === "useEffect"
    );
  };
  let best: ts.Node | null = null;
  walk(RESEARCH, (node) => {
    if (!isWanted(node)) return;
    const text = node.getText(AST);
    if (text.includes(marker) && (best === null || text.length < best.getText(AST).length)) best = node;
  });
  if (best === null) throw new Error(`no ${kind} in DeepSpaceResearchScreen contains ${JSON.stringify(marker)}`);
  const picked = best as ts.Node;
  if (kind === "onPress") {
    // `onPress={() => ...}`: keep the handler expression, drop the attribute.
    const init = (picked as ts.JsxAttribute).initializer;
    if (!init || !ts.isJsxExpression(init) || !init.expression) throw new Error("onPress has no handler");
    return init.expression.getText(AST);
  }
  return picked.getText(AST);
}

const PIECES = {
  records: lift("[heldRecords, setHeldRecords] = useState"),
  recordsEffect: lift("listRecentRecords(userId)", "effect"),
  recordsRead: lift("const records = heldRecords"),
  pick: lift("[clusterPick, setClusterPick] = useState"),
  pickRead: lift("const activeCluster = clusterPick"),
  proposals: lift("[heldProposals, setHeldProposals] = useState"),
  proposalsRead: lift("const proposals = heldProposals"),
  loadProposals: lift("const loadProposals = useMemo("),
  proposalsEffect: lift("void loadProposals(userId", "effect"),
  chipPress: lift("setClusterPick(", "onPress"),
};

interface Proposal {
  from_page: string;
  to_page: string;
  from_title: string;
  to_title: string;
  confidence: number;
}
interface Shown {
  records: { id: string; title: string }[] | null;
  activeCluster: string | null;
  proposals: Proposal[];
  pressChip: (tag: string) => void;
}

interface Hooks {
  useState<S>(initial: S): [S, (next: S | ((prev: S) => S)) => void];
  useEffect(effect: () => void | (() => void), deps: unknown[]): void;
  useMemo<T>(factory: () => T, deps: unknown[]): T;
}

type Screen = (props: { userId: string | null }, h: Hooks) => Shown;

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
    useMemo<T>(factory: () => T, deps: unknown[]): T {
      const at = cursor++;
      const slot = slots[at];
      if (slot !== undefined && same(slot.deps, deps)) return slot.value as T;
      const value = factory();
      slots[at] = { value, deps };
      return value;
    },
  };

  return {
    /** One render, nothing flushed: the commit straight after the owner changed. */
    once(screen: Screen, userId: string | null): Shown {
      cursor = 0;
      return screen({ userId }, hooks);
    },
    async settled(screen: Screen, userId: string | null): Promise<Shown> {
      dirty = true;
      let out: Shown | null = null;
      for (let round = 0; round < 30 && dirty; round++) {
        dirty = false;
        cursor = 0;
        out = screen({ userId }, hooks);
        for (const run of queued.splice(0)) run();
        await new Promise((r) => setImmediate(r));
      }
      if (out === null) throw new Error("the screen never rendered");
      return out;
    },
  };
}

interface Fakes {
  records: Record<string, { id: string; title: string }[]>;
  /** A proposals answer per owner; a function holds the answer until called back. */
  proposals: Record<string, Proposal[] | ((answer: (rows: Proposal[]) => void) => void)>;
}

function build(fakes: Fakes): Screen {
  const js = ts.transpileModule(
    [
      "function ResearchLoads(props, H) {",
      "  const { useState, useEffect, useMemo } = H;",
      "  const { userId } = props;",
      PIECES.records,
      PIECES.recordsEffect,
      PIECES.recordsRead,
      PIECES.pick,
      PIECES.pickRead,
      PIECES.proposals,
      PIECES.proposalsRead,
      PIECES.loadProposals,
      PIECES.proposalsEffect,
      `  const pressChip = (tag) => { const c = { tag }; (${PIECES.chipPress})(); };`,
      "  return { records, activeCluster, proposals, pressChip };",
      "}",
      "return ResearchLoads;",
    ].join("\n"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText;
  const bindings: Record<string, unknown> = {
    listRecentRecords: async (owner: string) => fakes.records[owner] ?? [],
    listInferredLinkDetails: (owner: string) => {
      const answer = fakes.proposals[owner] ?? [];
      if (typeof answer === "function") return new Promise<Proposal[]>((resolve) => answer(resolve));
      return Promise.resolve(answer);
    },
  };
  return new Function(...Object.keys(bindings), js)(...Object.values(bindings)) as Screen;
}

const A_RECORD = { id: "a-rec", title: "A's private record title" };
const B_RECORD = { id: "b-rec", title: "B's own record" };
const A_PROPOSAL: Proposal = { from_page: "a1", to_page: "a2", from_title: "A secret", to_title: "A other", confidence: 0.9 };
const B_PROPOSAL: Proposal = { from_page: "b1", to_page: "b2", from_title: "B one", to_title: "B two", confidence: 0.8 };

describe("/research shows only the signed-in account's loads", () => {
  test("the lifted pieces are the real ones", () => {
    expect(PIECES.recordsEffect.startsWith("useEffect(")).toBe(true);
    expect(PIECES.recordsEffect).toContain("setHeldRecords({ ownerId: userId, rows: rows as GraphRecord[] })");
    expect(PIECES.recordsRead).toContain("heldRecords.ownerId === userId");
    expect(PIECES.pickRead).toContain("clusterPick.ownerId === userId");
    expect(PIECES.proposalsRead).toContain("heldProposals.ownerId === userId");
    expect(PIECES.proposalsEffect).toContain("() => alive");
    expect(PIECES.chipPress).toContain("{ ownerId: userId, tag: c.tag }");
    // The render path still reads these names (graph, caption, proposal list).
    const body = RESEARCH.getText(AST);
    expect(body).toContain("recordsToResearchGraph(records ?? []");
    expect(body).toContain("tag: activeCluster ?? view.clusters[0].tag");
    expect(body).toContain("proposals.map((p) => {");
  });

  test("A's records, picked tag and proposals are gone in B's first render", async () => {
    const screen = build({
      records: { "owner-a": [A_RECORD], "owner-b": [B_RECORD] },
      proposals: { "owner-a": [A_PROPOSAL], "owner-b": [] },
    });
    const r = runtime();

    const asA = await r.settled(screen, "owner-a");
    expect(asA.records).toEqual([A_RECORD]);
    expect(asA.proposals).toEqual([A_PROPOSAL]);
    asA.pressChip("a-secret-tag");
    expect((await r.settled(screen, "owner-a")).activeCluster).toBe("a-secret-tag");

    // The owner flips; B's loads are still out.
    const firstAsB = r.once(screen, "owner-b");
    expect(firstAsB.records).toBeNull(); // the screen shows its loading state
    expect(firstAsB.proposals).toEqual([]);
    expect(firstAsB.activeCluster).toBeNull();
    expect(JSON.stringify(firstAsB)).not.toMatch(/A's private|A secret|a-secret-tag/);

    // B's answers land, including an empty proposals answer.
    const asB = await r.settled(screen, "owner-b");
    expect(asB.records).toEqual([B_RECORD]);
    expect(asB.proposals).toEqual([]);
    expect(asB.activeCluster).toBeNull();
  });

  test("a chip press toggles for the same owner", async () => {
    const screen = build({ records: { "owner-a": [A_RECORD] }, proposals: {} });
    const r = runtime();
    (await r.settled(screen, "owner-a")).pressChip("career");
    const picked = await r.settled(screen, "owner-a");
    expect(picked.activeCluster).toBe("career");
    picked.pressChip("career");
    expect((await r.settled(screen, "owner-a")).activeCluster).toBeNull();
  });

  test("a slow proposals answer for A cannot land over B's", async () => {
    let answerA: ((rows: Proposal[]) => void) | null = null;
    const screen = build({
      records: {},
      proposals: { "owner-a": (answer) => { answerA = answer; }, "owner-b": [B_PROPOSAL] },
    });
    const r = runtime();
    await r.settled(screen, "owner-a");
    expect(answerA).not.toBeNull();

    expect((await r.settled(screen, "owner-b")).proposals).toEqual([B_PROPOSAL]);
    answerA!([A_PROPOSAL]);
    await new Promise((done) => setImmediate(done));
    expect((await r.settled(screen, "owner-b")).proposals).toEqual([B_PROPOSAL]);
  });

  test("signed out reads nothing", () => {
    const r = runtime();
    const out = r.once(build({ records: {}, proposals: {} }), null);
    expect(out).toMatchObject({ records: null, proposals: [], activeCluster: null });
  });
});
