// Execute the complete, real /research function (including render gates and
// callbacks), lifted by AST. Reuse the hook harness and real graph/lease/timer
// code; replace native elements and read/write transports only. No model call.
import React, { type ReactElement } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";
import { hookHarness } from "../../../lib/nav/__tests__/hook-harness";
import {
  __resetAccountEpochForTests, beginAccountOwnerTransition,
  captureAccountOwnerLease, clearAccountTransition, currentAccountEpoch, noteResolvedOwner,
} from "../../../lib/auth/account-epoch";
import { isTimeoutError, withTimeout } from "../../../lib/async/with-timeout";
import { recordsToResearchGraph } from "../../../lib/records/records-research";
import type { GraphRecord } from "../../../lib/records/records-graph";
import { buildDeepResearchView } from "../wiki-graph-view";

const SCREEN = "src/screens/deepspace/DeepSpaceDesignScreens.tsx";
const source = readFileSync(resolve(__dirname, "../../../..", SCREEN), "utf8");
const AST = ts.createSourceFile(SCREEN, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const research = AST.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "DeepSpaceResearchScreen");
if (!research) throw new Error(`no DeepSpaceResearchScreen in ${SCREEN}`);
const constants = AST.statements.filter((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => ["RESEARCH_SAT", "RESEARCH_READ_TIMEOUT_MS"].includes(declaration.name.getText(AST))));
const js = ts.transpileModule([
  ...constants.map((node) => node.getText(AST).replace(/^export /, "")),
  research.getText(AST).replace(/^export /, ""),
  "return DeepSpaceResearchScreen;",
].join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } }).outputText;

interface Proposal { from_page: string; to_page: string; from_title: string; to_title: string; confidence: number }
type Element = ReactElement<{ children?: unknown; label?: string; text?: string; active?: boolean; accessibilityLabel?: string; onPress?: () => void }>;
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element; return [node, ...nodes(node.props.children)];
}
function drawn(value: unknown): string {
  if (Array.isArray(value)) return value.map(drawn).join(" ");
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!value || typeof value !== "object" || !("props" in value)) return "";
  const node = value as Element; return [node.props.label, node.props.text, drawn(node.props.children)].filter(Boolean).join(" ");
}
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const recordRows = (owner: string): GraphRecord[] => [
  { id: `${owner}-1`, topic: `${owner} private record`, tags: ["domain:career", `${owner}-tag`] },
  { id: `${owner}-2`, topic: `${owner} other record`, tags: ["domain:health", `${owner}-tag`] },
];
const proposalRows = (owner: string): Proposal[] => [{ from_page: `${owner}-1`, to_page: `${owner}-2`, from_title: `${owner} proposal`, to_title: `${owner} other proposal`, confidence: 0.9 }];
let h: ReturnType<typeof hookHarness>;
let auth: { userId: string | null; loading: boolean };
let readRecords: jest.Mock<Promise<GraphRecord[]>, [string]>;
let readProposals: jest.Mock<Promise<Proposal[]>, [string]>;
let writes: Record<string, jest.Mock>;
let push: jest.Mock;
let Screen: () => ReactElement;
const render = () => h.render(Screen);
async function settle() {
  let tree = render();
  for (let i = 0; i < 25; i++) { await Promise.resolve(); tree = render(); }
  return tree;
}
const retries = (tree: unknown) => nodes(tree).filter((node) => node.props.onPress && drawn(node).trim() === "common:actions.retry");
const chip = (tree: unknown) => nodes(tree).find((node) => node.type === "FilterChip");
function owner(next: string | null) { noteResolvedOwner(next); clearAccountTransition(currentAccountEpoch()); auth.userId = next; }
function expectNoWrites() { Object.values(writes).forEach((write) => expect(write).not.toHaveBeenCalled()); }

beforeEach(() => {
  jest.useFakeTimers(); __resetAccountEpochForTests();
  h = hookHarness(); auth = { userId: "A", loading: false }; owner("A");
  readRecords = jest.fn(async (uid: string) => recordRows(uid));
  readProposals = jest.fn(async (uid: string) => proposalRows(uid));
  writes = Object.fromEntries(["backfillEmbeddings", "proposeAllRelatedLinks", "ratifyLink", "rejectInferredLink", "reactExpression"].map((name) => [name, jest.fn()]));
  push = jest.fn();
  const bindings = {
    React, ...h.hooks, ...writes,
    useAuth: () => auth, useAppRouter: () => ({ push }),
    useTranslation: () => ({ i18n: { language: "ko" }, t: (key: string, values?: unknown) => key + (values ? JSON.stringify(values) : "") }),
    useUiSound: () => jest.fn(), WIKI_LINK_CUE: { source: "unused" },
    currentAccountEpoch, captureAccountOwnerLease, withTimeout, isTimeoutError,
    listRecentRecords: readRecords, listInferredLinkDetails: readProposals,
    recordsToResearchGraph, buildDeepResearchView,
    styles: {}, colors: {}, m3: { color: {} }, ddsAlpha2: () => "", stepLine: () => [],
    ...Object.fromEntries(["Shell", "SecondbStatusHeader", "Text", "RNText", "View", "Pressable", "Redirect", "GraphLoading", "FilterChip", "Svg", "Rect", "PixelNodeSvg", "PixelStarSvg"].map((name) => [name, name])),
  };
  Screen = new Function(...Object.keys(bindings), js)(...Object.values(bindings)) as () => ReactElement;
});
afterEach(() => { h.unmount(); jest.clearAllTimers(); jest.useRealTimers(); });

// Preserve the previous five owner-fence behaviors, now through actual JSX.
test("the actual screen runs graph, render gates and navigation callbacks", async () => {
  const tree = await settle();
  expect(drawn(tree)).toContain('research.headerFound{"count":1}');
  expect(drawn(tree)).toContain("A-tag"); expect(drawn(tree)).toContain("A proposal");
  nodes(tree).find((node) => node.props.accessibilityLabel === "A other record")!.props.onPress!();
  expect(push).toHaveBeenCalledWith({ pathname: "/record/[id]", params: { id: "A-2" } });
  nodes(tree).find((node) => node.props.accessibilityLabel === "A proposal ↔ A other proposal")!.props.onPress!();
  expect(push).toHaveBeenCalledWith({ pathname: "/wiki", params: { focusPageId: "A-1" } });
  expectNoWrites();
});
test("A's records, picked tag and proposals are gone in B's first render", async () => {
  chip(await settle())!.props.onPress!(); expect(chip(await settle())!.props.active).toBe(true);
  owner("B"); expect(drawn(render())).not.toMatch(/A .*record|A-tag|A proposal/);
  const tree = await settle(); expect(drawn(tree)).toContain("B other record"); expect(chip(tree)!.props.active).toBe(false);
});
test("a chip press toggles for the same owner", async () => {
  chip(await settle())!.props.onPress!(); expect(chip(await settle())!.props.active).toBe(true);
  chip(await settle())!.props.onPress!(); expect(chip(await settle())!.props.active).toBe(false);
});
test("a slow proposals answer for A cannot land over B's", async () => {
  const old = deferred<Proposal[]>(); readProposals.mockImplementationOnce(() => old.promise);
  await settle(); owner("B"); expect(drawn(await settle())).toContain("B proposal");
  old.resolve(proposalRows("A")); expect(drawn(await settle())).not.toContain("A proposal");
});
test("signed out reads nothing", async () => {
  await settle(); owner(null); const tree = render();
  expect(tree.type).toBe("Redirect"); expect(drawn(tree)).not.toMatch(/A .*record|A-tag|A proposal/);
  expect(readRecords).toHaveBeenCalledTimes(1); expect(readProposals).toHaveBeenCalledTimes(1);
});

test.each(["records", "proposals"] as const)("%s rejection is retryable, not empty, while the other list remains available", async (part) => {
  const read = part === "records" ? readRecords : readProposals;
  read.mockRejectedValueOnce(new Error("unavailable"));
  const tree = await settle();
  expect(drawn(tree)).toContain("common:errors.unknown"); expect(retries(tree)).toHaveLength(1);
  if (part === "records") {
    expect(drawn(tree)).toContain("A proposal"); expect(drawn(tree)).toContain("...");
    expect(drawn(tree)).not.toMatch(/research.emptyInsight|research.headerNone|research.headerFound/);
  } else {
    expect(drawn(tree)).toContain("A other record"); expect(drawn(tree)).not.toContain("research.noProposals");
  }
  retries(tree)[0].props.onPress!(); const ready = await settle();
  expect(drawn(ready)).toContain("A other record"); expect(drawn(ready)).toContain("A proposal");
  expect(retries(ready)).toHaveLength(0); expectNoWrites();
  expect(readRecords).toHaveBeenCalledTimes(part === "records" ? 2 : 1);
  expect(readProposals).toHaveBeenCalledTimes(part === "proposals" ? 2 : 1);
});

test.each(["records", "proposals"] as const)("%s gets its own 10-second deadline and ignores a late success after retry", async (part) => {
  const old = deferred<never[]>(); const read = part === "records" ? readRecords : readProposals;
  read.mockImplementationOnce(() => old.promise);
  let tree = await settle();
  expect(drawn(tree)).not.toContain(part === "records" ? "research.headerNone" : "research.noProposals");
  expect(drawn(tree)).toContain(part === "records" ? "A proposal" : "A other record");
  jest.advanceTimersByTime(9_999); tree = await settle(); expect(retries(tree)).toHaveLength(0);
  jest.advanceTimersByTime(1); tree = await settle(); expect(drawn(tree)).toContain("common:errors.network"); expect(retries(tree)).toHaveLength(1);
  retries(tree)[0].props.onPress!(); tree = await settle(); expect(retries(tree)).toHaveLength(0);
  old.resolve([]); tree = await settle(); expect(drawn(tree)).toContain("A other record"); expect(drawn(tree)).toContain("A proposal");
  expectNoWrites();
});

test("two successful empty reads use the existing empty messages and no retry", async () => {
  readRecords.mockResolvedValue([]); readProposals.mockResolvedValue([]);
  const tree = await settle(); expect(drawn(tree)).toContain("research.headerNone");
  expect(drawn(tree)).toContain("research.emptyInsight"); expect(drawn(tree)).toContain("research.noProposals");
  expect(drawn(tree)).not.toContain("..."); expect(retries(tree)).toHaveLength(0); expectNoWrites();
});
test("both pending reads remain distinct from empty, then each can retry independently", async () => {
  readRecords.mockImplementationOnce(() => new Promise(() => {}));
  readProposals.mockImplementationOnce(() => new Promise(() => {}));
  const loading = await settle(); expect(nodes(loading).filter((node) => node.type === "GraphLoading")).toHaveLength(2);
  expect(drawn(loading)).not.toMatch(/research.headerNone|research.emptyInsight|research.noProposals/);
  jest.advanceTimersByTime(10_000); let tree = await settle(); expect(retries(tree)).toHaveLength(2);
  retries(tree)[0].props.onPress!(); tree = await settle(); expect(drawn(tree)).toContain("A other record"); expect(retries(tree)).toHaveLength(1);
  expect(readProposals).toHaveBeenCalledTimes(1);
  retries(tree)[0].props.onPress!(); tree = await settle(); expect(drawn(tree)).toContain("A proposal"); expectNoWrites();
});

test.each(["records", "proposals"] as const)("%s retry generation wins when two retry taps resolve out of order", async (part) => {
  const read = part === "records" ? readRecords : readProposals;
  read.mockRejectedValueOnce(new Error("initial failure"));
  const old = deferred<never[]>(); const newest = deferred<never[]>();
  const tree = await settle(); const press = retries(tree)[0].props.onPress!;
  read.mockImplementationOnce(() => old.promise).mockImplementationOnce(() => newest.promise);
  press(); press(); await settle(); newest.resolve([]); await settle();
  old.reject(new Error("older retry failure")); const done = await settle();
  expect(retries(done)).toHaveLength(0); expect(drawn(done)).not.toContain("common:errors.unknown"); expectNoWrites();
});

test.each(["records", "proposals"] as const)("%s cannot publish during pre-publication owner transition", async (part) => {
  const read = part === "records" ? readRecords : readProposals; const old = deferred<never[]>();
  read.mockImplementationOnce(() => old.promise); await settle();
  beginAccountOwnerTransition("B"); old.reject(new Error("stale error"));
  expect(drawn(await settle())).not.toContain("common:errors.unknown");
  expect(read).toHaveBeenCalledTimes(1);
  owner("B"); const tree = await settle(); expect(drawn(tree)).toContain("B proposal"); expect(drawn(tree)).toContain("B other record");
});

test("A -> B -> A without an intermediate render clears loaded rows and picked chip", async () => {
  chip(await settle())!.props.onPress!(); await settle();
  owner("B"); owner("A");
  const first = render(); expect(drawn(first)).not.toMatch(/A .*record|A-tag|A proposal/);
  const tree = await settle(); expect(chip(tree)!.props.active).toBe(false);
  expect(readRecords).toHaveBeenCalledTimes(2); expect(readProposals).toHaveBeenCalledTimes(2);
});
test.each(["records", "proposals"] as const)("%s old A response cannot overwrite the newer A session", async (part) => {
  const old = deferred<never[]>(); const read = part === "records" ? readRecords : readProposals;
  read.mockImplementationOnce(() => old.promise); await settle(); owner("B"); owner("A"); await settle();
  old.resolve([]); const tree = await settle(); expect(drawn(tree)).toContain("A other record"); expect(drawn(tree)).toContain("A proposal");
});
test.each(["records", "proposals"] as const)("%s unmount suppresses late publication and stale retry callbacks", async (part) => {
  const read = part === "records" ? readRecords : readProposals;
  read.mockRejectedValueOnce(new Error("first")); const press = retries(await settle())[0].props.onPress!;
  const slow = deferred<never[]>(); read.mockImplementationOnce(() => slow.promise); press(); await settle();
  h.unmount(); slow.resolve([]); for (let i = 0; i < 25; i++) await Promise.resolve();
  expect(h.dirty).toBe(false); press(); expect(read).toHaveBeenCalledTimes(2); expectNoWrites();
});
test("auth unknown starts neither read", async () => {
  auth.loading = true; const tree = await settle();
  expect(nodes(tree).some((node) => node.type === "GraphLoading")).toBe(true);
  expect(readRecords).not.toHaveBeenCalled(); expect(readProposals).not.toHaveBeenCalled();
});
