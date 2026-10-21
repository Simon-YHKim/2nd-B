import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { choiceAvailability, emptyCoverage } from "../../lib/interview/probe";
import type { InterviewChoice } from "../interview";

const screen = readFileSync(join(__dirname, "..", "interview.tsx"), "utf8");
const source = ts.createSourceFile("screen.tsx", screen, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function declaration(name: string): ts.FunctionDeclaration {
  let found: ts.FunctionDeclaration | undefined;
  function visit(node: ts.Node) { if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node; ts.forEachChild(node, visit); }
  visit(source); if (!found) throw new Error(`Missing ${name}`); return found;
}
function evaluate(text: string, scope: Record<string, unknown>) {
  const js = ts.transpileModule(`const run = (${text});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  return new Function(...Object.keys(scope), `${js}\nreturn run;`)(...Object.values(scope));
}
const projectMode = evaluate(declaration("projectMode").getText(source), {}) as (...args: unknown[]) => { mode: string };
type Node = { type: string; props: Record<string, unknown>; children: unknown[] };
function textOf(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "children" in node) return textOf((node as Node).children);
  return "";
}
function hosts(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(hosts);
  if (!node || typeof node !== "object" || !("children" in node)) return [];
  return [node as Node, ...hosts((node as Node).children)];
}
const frame = { turns: [{ role: "user" as const, text: "I left" }], coverage: emptyCoverage(), pendingLayer: null,
  openers: [], abandoned: [], concreteOnly: false, stuckStreak: 0, draft: "" };
function selected(reason: "first-pass-handled" | "no-eligible" | "question-exhausted" | "local-prompts-exhausted" = "first-pass-handled"): InterviewChoice {
  return { kind: "sceneChoice", reason, generation: {}, snapshot: frame, action: null };
}
// Compile the shipped JSX into inert hosts, not an RN renderer or a parallel view implementation.
function ui(choice: InterviewChoice | null = selected(), options: { ended?: boolean; crisis?: boolean; inactive?: boolean; receipt?: string; retryable?: boolean } = {}) {
  const view = projectMode(!options.inactive, options.crisis, options.ended, options.ended, choice);
  const calls = { chooseNext: jest.fn(), startNewScene: jest.fn(), keepIt: jest.fn(), finish: jest.fn(), retryCoverage: jest.fn(), send: jest.fn() };
  const scope = { ...calls, view, done: view.mode === "legacy-ended", choice,
    choices: choiceAvailability({ kind: choice?.kind ?? "sceneChoice", reason: choice?.kind === "sceneChoice" ? choice.reason : undefined,
      eligible: ["fact"], hasUserTurns: true, locked: !!options.receipt }),
    receipt: { phase: options.receipt ?? "idle" }, saveBusy: false, saveLive: !options.crisis && !options.inactive,
    saveFailureKey: "drill.recordSaveUnknown", retryable: options.retryable ?? false, failModal: true,
    styles: {}, m3TextStyle: () => ({}), m3: { color: {} }, spacing: { sm: 8 }, kbHeight: 0, t: (key: string) => key, homeT: (key: string) => key,
    scrollRef: { current: null }, priorityReveal: null, cancelGuidanceReveal: () => {}, guidanceDisplay: { copy: {} }, markGuidanceReady: () => {}, dismissGuidance: () => {},
    tableOpen: false, setTableOpen: jest.fn(), userTurns: 1, period: "work", locale: "en", coverage: emptyCoverage(), coveredPeriods: [],
    turns: [], busy: false, notice: null, pendingLayer: null, inputLocked: view.mode !== "active" || !!options.receipt,
    concreteOnly: false, openers: [], draft: "", editDraft: jest.fn(), changeAngle: jest.fn(), started: { current: true }, toast: null, setFailModal: jest.fn(),
    React: { Fragment: "fragment", createElement: (type: string, props: Record<string, unknown> | null, ...children: unknown[]) => ({ type, props: props ?? {}, children }) },
    ...Object.fromEntries(["InterviewFrame", "ScrollView", "View", "Text", "InterviewGuidanceRow", "Pressable", "Glyph", "DrillProgress", "MdCard", "MdButton", "SecondbHead", "PremiumLoadingState", "TextInput", "PremiumToast", "PremiumModal"].map(tag => [tag, tag])),
  };
  const ret = declaration("InterviewSession").body!.statements.filter(ts.isReturnStatement).at(-1)!;
  const tree = evaluate(ret.expression!.getText(source), scope);
  const all = hosts(tree);
  const button = (label: string) => all.find(n => ["Pressable", "MdButton"].includes(n.type) && (n.props.label === label || textOf(n) === label));
  return { calls, all, button, view };
}
test("actual scene JSX invokes three dedicated handlers and keeps guidance ahead of choices", () => {
  const choice = selected(), h = ui(choice);
  for (const key of ["continueScene", "newScene", "saveAndFinish"]) expect(h.button(`drill.${key}`)).toBeDefined();
  (h.button("drill.continueScene")!.props.onPress as () => void)();
  (h.button("drill.newScene")!.props.onPress as () => void)();
  (h.button("drill.saveAndFinish")!.props.onPress as () => void)();
  expect(h.calls.chooseNext).toHaveBeenCalledWith("more", choice); expect(h.calls.startNewScene).toHaveBeenCalledWith(choice); expect(h.calls.keepIt).toHaveBeenCalledWith(choice);
  expect(h.calls.send).not.toHaveBeenCalled();
  expect(h.all.findIndex(n => n.type === "InterviewGuidanceRow")).toBeLessThan(h.all.findIndex(n => textOf(n) === "drill.sceneChoice"));
  expect(h.all.find(n => n.type === "TextInput")?.props.editable).toBe(false);
});
test("actual stuck JSX has new scene and dedicated skip-layer, no story-more/save", () => {
  const choice: InterviewChoice = { kind: "stuckChoice", layer: "fact", attempts: 2, generation: {}, snapshot: frame, action: null };
  const h = ui(choice); expect(h.button("drill.continueScene")).toBeUndefined(); expect(h.button("drill.saveAndFinish")).toBeUndefined();
  (h.button("drill.skipLayer")!.props.onPress as () => void)(); expect(h.calls.chooseNext).toHaveBeenCalledWith("skip-layer", choice);
});
test.each(["no-eligible", "question-exhausted", "local-prompts-exhausted"] as const)("actual disabled and accessible controls for %s", reason => {
  const h = ui(selected(reason));
  expect(h.button("drill.continueScene")?.props).toMatchObject({ disabled: true, accessibilityState: { disabled: true } });
  expect(h.button("drill.newScene")?.props.disabled).toBe(reason === "local-prompts-exhausted");
});
test.each(["recordPending", "coveragePending", "committed"])("actual legacy screen wins over %s and blocks duplicate save", receipt => {
  const h = ui(selected(), { ended: true, receipt });
  expect(h.button("approve")?.props.disabled).toBe(true); expect(h.button("drill.continueScene")).toBeUndefined();
  expect(h.all.some(n => textOf(n) === "drill.saveTitle")).toBe(true);
});
test("unknown has no retry button; only explicit coverage retry calls retryCoverage", () => {
  expect(ui(selected(), { receipt: "recordPending" }).button("tryAgain")).toBeUndefined();
  const h = ui(selected(), { receipt: "coveragePending", retryable: true });
  (h.button("tryAgain")!.props.onPress as () => void)(); expect(h.calls.retryCoverage).toHaveBeenCalledTimes(1); expect(h.calls.keepIt).not.toHaveBeenCalled();
});
test("pure mode ordering is independent of receipt and crisis/inactive do not show ordinary controls", () => {
  expect(projectMode(false, true, true, true, selected())).toEqual({ mode: "inactive" });
  expect(projectMode(true, true, true, true, selected())).toEqual({ mode: "crisis-ended" });
  expect(projectMode(true, false, true, false, selected())).toEqual({ mode: "legacy-ended" });
  expect(projectMode(true, false, false, false, selected())).toEqual({ mode: "choosing" });
  expect(projectMode(true, false, false, false, null)).toEqual({ mode: "active" });
  for (const options of [{ crisis: true }, { inactive: true }]) {
    const h = ui(selected(), { ...options, ended: true, receipt: "recordPending" });
    expect(h.button("approve")).toBeUndefined(); expect(h.button("drill.continueScene")).toBeUndefined();
    expect(h.all.find(n => n.type === "PremiumModal")?.props.visible).toBe(false);
  }
});
