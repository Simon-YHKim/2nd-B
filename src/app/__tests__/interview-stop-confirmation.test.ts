import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { captureAccountOwnerLease, clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../../lib/auth/account-epoch";
import { answerDisposition, canCreditAnswer, confirmedAnswer } from "../../lib/interview/continuity";
import { emptyCoverage, nextMove, type InterviewTurn } from "../../lib/interview/probe";
import { MAX_SCAFFOLDS_PER_LAYER } from "../../lib/interview/stuck";
import { storedTurns } from "../../lib/interview/saved-story";
import { classifyInputAnyLocale } from "../../lib/safety/classifier";

jest.mock("../../lib/llm/boundary", () => ({ callLlm: jest.fn() }));
const source = ts.createSourceFile("interview.tsx", readFileSync(resolve(__dirname, "../interview.tsx"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function runNode(node: ts.Node, scope: Record<string, unknown>) {
  const js = ts.transpileModule(`const run = (${node.getText(source)});`, {
    fileName: "callback.tsx",
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function(...Object.keys(scope), `${js}\nreturn run;`)(...Object.values(scope));
}
function callback(name: string, scope: Record<string, unknown>) {
  let body: ts.Node | undefined;
  function visit(n: ts.Node) {
    if (ts.isFunctionDeclaration(n) && n.name?.text === name) body = n;
    if (ts.isVariableDeclaration(n) && n.name.getText(source) === name && n.initializer && ts.isCallExpression(n.initializer)) body = n.initializer.arguments[0];
    ts.forEachChild(n, visit);
  }
  visit(source);
  if (!body) throw new Error(`Missing actual callback ${name}`);
  return runNode(body, scope);
}
function hookCallback(name: string, index: number, scope: Record<string, unknown>) {
  let node: ts.Node | undefined;
  function visit(n: ts.Node) {
    if (ts.isCallExpression(n) && n.expression.getText(source) === name) node = n.arguments[index];
    ts.forEachChild(n, visit);
  }
  visit(source);
  if (!node) throw new Error(`Missing actual hook ${name}`);
  return runNode(node, scope);
}
type Pending = { text: string; owner: NonNullable<ReturnType<typeof captureAccountOwnerLease>>;
  locale: "en" | "ko"; period: string; minor: boolean };
const examples = [
  ["여기까지 오는 데 친구들이 많이 도와줬어요.", "ko"],
  ["중단됐던 프로젝트를 다시 했어요.", "ko"],
  ["말하기 싫어요 라고 했지만 결국 이야기했어요.", "ko"],
  ["Stop signs were everywhere in my town.", "en"],
  ["I want to stop worrying about grades.", "en"],
  ["I'm done with school and started my first job last month.", "en"],
] as const;
function setup(text: string = examples[0][0], locale: "en" | "ko" = "ko") {
  noteResolvedOwner(null); noteResolvedOwner("A"); clearAccountTransition(currentAccountEpoch());
  const stopChoiceRef = { current: null as Pending | null };
  const scope = {
    userId: "A", locale, period: "work", isMinor: false, busy: false, coverageReady: true,
    draft: text, turns: [{ role: "interviewer", text: "What happened?", layer: "fact" }] as InterviewTurn[],
    pendingLayer: "fact", coverage: emptyCoverage(), stuckStreak: 0, abandoned: [],
    ended: { current: false }, mounted: { current: true }, crisisRouting: { current: false }, stopChoiceRef,
    contextRef: { current: { userId: "A" as string | null, locale, period: "work", minor: false } },
    t: (key: string) => key, captureAccountOwnerLease, answerDisposition, MAX_SCAFFOLDS_PER_LAYER,
    classifyInputAnyLocale: jest.fn(classifyInputAnyLocale),
    isLocalNonAnswer: (value: string, layer: "fact", continued: boolean) => !canCreditAnswer(value, layer, locale, continued),
    setStopChoice: jest.fn(), setTurns: jest.fn(), setDraft: jest.fn(), setNotice: jest.fn(),
    setBusy: jest.fn(), setDone: jest.fn(), setPendingLayer: jest.fn(), setOpeners: jest.fn(),
    setCoverage: jest.fn(), setStuckStreak: jest.fn(), setAbandoned: jest.fn(), changeAngle: jest.fn(),
    ask: jest.fn(async (_history: InterviewTurn[]) => {}), finish: jest.fn(), send: jest.fn(), stopChoiceIsCurrent: jest.fn(), resolveStopChoice: jest.fn(),
    shouldScaffold: () => true, publishCrisisNotice: jest.fn(), hotlineFor: () => "KR_109",
    startInterviewCrisisRouting: jest.fn((_guard, _input, visible: () => void) => { visible(); return { started: true, done: Promise.resolve() }; }),
    navigation: { dispatch: jest.fn() },
  };
  scope.finish = jest.fn(callback("finish", scope));
  scope.stopChoiceIsCurrent = callback("stopChoiceIsCurrent", scope);
  scope.send = callback("send", scope);
  scope.resolveStopChoice = callback("resolveStopChoice", scope);
  return scope;
}

test.each(examples)("normal stop-prefixed answer awaits a choice without egress: %s", async (text, locale) => {
  const s = setup(text, locale);
  expect(answerDisposition(text, locale)).toBe("stop");
  await s.send(); await s.send();
  expect(s.stopChoiceRef.current?.text).toBe(text);
  expect(s.setStopChoice).toHaveBeenCalledTimes(1);
  expect(s.ask).not.toHaveBeenCalled(); expect(s.finish).not.toHaveBeenCalled();
  expect(s.setTurns).not.toHaveBeenCalled(); expect(s.setCoverage).not.toHaveBeenCalled();
  expect(s.setDraft).not.toHaveBeenCalled();
});

test.each([
  ["그만할 거예요", "ko"], ["그만할래요, 시간이 없어요", "ko"],
  ["여기까지 할게요 머리가 아파요", "ko"], ["Please stop asking me questions", "en"],
  ["Stop; I can't continue", "en"], ["Stop: please", "en"], ["I'm done talking about this", "en"],
] as const)("keeps broad explicit stop coverage, and Finish retains the text without a call: %s", async (text, locale) => {
  const s = setup(text, locale);
  await s.send(); const pending = s.stopChoiceRef.current;
  expect(pending).not.toBeNull();
  s.resolveStopChoice("finish", pending);
  expect(s.ask).not.toHaveBeenCalled(); expect(s.ended.current).toBe(true);
  const saved = s.setTurns.mock.calls[0][0] as InterviewTurn[];
  expect(storedTurns(saved).at(-1)).toEqual({ role: "user", text, period: "work", answered: false });
  expect(s.setCoverage).not.toHaveBeenCalled();
});

test.each(examples)("Continue submits one answer and bypasses only the stop disposition: %s", async (text, locale) => {
  const s = setup(text, locale); await s.send(); const pending = s.stopChoiceRef.current;
  expect(s.resolveStopChoice("continue", pending)).toBe(true);
  expect(s.resolveStopChoice("continue", pending)).toBe(false);
  expect(s.resolveStopChoice("finish", pending)).toBe(false);
  expect(s.ask).toHaveBeenCalledTimes(1); expect(s.finish).not.toHaveBeenCalled();
  const history = s.ask.mock.calls[0] as unknown as [InterviewTurn[]];
  const last = history[0].at(-1)!;
  expect(last.text).toBe(text); expect(last.continuedAfterStop).toBe(true);
  expect(canCreditAnswer(text, "fact", locale)).toBe(false);
  expect(canCreditAnswer(text, "fact", locale, true)).toBe(true);
  expect(confirmedAnswer(text, "fact", locale, null, true)).toBe(false);
  expect(confirmedAnswer(text, "fact", locale, undefined, true)).toBe(false);
  expect(confirmedAnswer(text, "fact", locale, "fact", true)).toBe(true);
  expect(nextMove(emptyCoverage(), "work", [], new Date(), null, [], { history: history[0], locale }).kind).not.toBe("finish");
});

test.each(["Stop", "no thanks", "skip", "I don't know", "yes"])("confirmed continuation does not grant a sparse/refused fact: %s", text => {
  expect(canCreditAnswer(text, "fact", "en", true)).toBe(false);
});

test("hardware Back uses the same one-shot Continue path", async () => {
  const s = setup(); await s.send(); const back = hookCallback("useHardwareBack", 0, s);
  expect(back()).toBe(true); expect(back()).toBe(false); expect(s.ask).toHaveBeenCalledTimes(1);
});

test.each(["GO_BACK", "POP"])("native/browser %s continues without replaying navigation", async type => {
  const s = setup(); await s.send();
  hookCallback("usePreventRemove", 1, s)({ data: { action: { type } } });
  expect(s.ask).toHaveBeenCalledTimes(1); expect(s.navigation.dispatch).not.toHaveBeenCalled();
});

test("an auth reset never submits an answer and replays the exact removal action", async () => {
  const s = setup(); await s.send(); const action = { type: "RESET", payload: { routes: [] } };
  hookCallback("usePreventRemove", 1, s)({ data: { action } });
  expect(s.ask).not.toHaveBeenCalled(); expect(s.navigation.dispatch).toHaveBeenCalledWith(action);
  expect(s.stopChoiceRef.current).toBeNull();
});

test.each(["owner", "epoch", "locale", "period", "minor", "unmount", "ended"])("stale %s confirmation cannot submit or finish", async change => {
  const s = setup(); await s.send(); const pending = s.stopChoiceRef.current;
  if (change === "owner") { noteResolvedOwner("B"); clearAccountTransition(currentAccountEpoch()); }
  if (change === "epoch") { noteResolvedOwner(null); noteResolvedOwner("A"); clearAccountTransition(currentAccountEpoch()); }
  if (change === "locale") s.contextRef.current.locale = "en";
  if (change === "period") s.contextRef.current.period = "now";
  if (change === "minor") s.contextRef.current.minor = true;
  if (change === "unmount") s.mounted.current = false;
  if (change === "ended") s.ended.current = true;
  expect(s.resolveStopChoice("continue", pending)).toBe(false);
  expect(s.ask).not.toHaveBeenCalled(); expect(s.finish).not.toHaveBeenCalled(); expect(s.setTurns).not.toHaveBeenCalled();
});

test("a stale button from an earlier prompt cannot consume the current prompt", async () => {
  const s = setup(); await s.send(); const old = s.stopChoiceRef.current;
  const current = { ...old!, text: "여기까지 했던 일을 이어서 설명할게요" };
  s.stopChoiceRef.current = current;
  expect(s.resolveStopChoice("finish", old)).toBe(false);
  expect(s.stopChoiceRef.current).toBe(current); expect(s.finish).not.toHaveBeenCalled();
});

test("safety runs before confirmation and again on continued submission", async () => {
  const red = classifyInputAnyLocale("죽고 싶어요", "ko");
  expect(red.zone).toBe("red");
  const first = setup(); first.classifyInputAnyLocale.mockReturnValueOnce(red); await first.send();
  expect(first.stopChoiceRef.current).toBeNull(); expect(first.finish).toHaveBeenCalledTimes(1);
  expect(first.ask).not.toHaveBeenCalled(); expect(first.setTurns).not.toHaveBeenCalled();
  const continued = setup(); await continued.send(); continued.classifyInputAnyLocale.mockReturnValueOnce(red);
  continued.resolveStopChoice("continue");
  expect(continued.finish).toHaveBeenCalledTimes(1); expect(continued.publishCrisisNotice).toHaveBeenCalledTimes(1);
  expect(continued.ask).not.toHaveBeenCalled(); expect(continued.setTurns).not.toHaveBeenCalled();
});


type ElementNode = { type: string; props: Record<string, unknown>; children: unknown[] };
function stopChoiceTree(pending: Pending, locale: string, resolveChoice: jest.Mock) {
  let choice: ts.ConditionalExpression | undefined;
  const visit = (n: ts.Node) => {
    if (ts.isConditionalExpression(n) && n.condition.getText(source) === "stopChoice") choice = n;
    ts.forEachChild(n, visit);
  };
  visit(source);
  if (!choice) throw new Error("Missing actual confirmation JSX");
  const strings = JSON.parse(readFileSync(resolve(__dirname, `../../../locales/${locale}/interview.json`), "utf8")).drill;
  return runNode(choice, {
    stopChoice: pending, resolveStopChoice: resolveChoice,
    React: { createElement: (type: string, props: Record<string, unknown>, ...children: unknown[]) => ({ type, props: props ?? {}, children }) },
    View: "View", Text: "Text", MdCard: "MdCard", Pressable: "Pressable", styles: {},
    m3TextStyle: () => ({}), t: (key: string) => strings[key.split(".")[1]],
  }) as ElementNode;
}
function allElements(tree: ElementNode): ElementNode[] {
  return [tree, ...tree.children.filter((x): x is ElementNode => !!x && typeof x === "object" && "type" in x).flatMap(allElements)];
}

test.each(["ko", "en", "es", "pt", "id"])("actual %s JSX offers exactly the two choices and keeps their pending token", async locale => {
  const s = setup(); await s.send(); const pending = s.stopChoiceRef.current!;
  const choose = jest.fn(), nodes = allElements(stopChoiceTree(pending, locale, choose));
  const buttons = nodes.filter((n) => n.type === "Pressable");
  expect(buttons).toHaveLength(2);
  expect(nodes.some((n) => n.type === "TextInput")).toBe(false);
  expect(nodes.some((n) => n.children.includes(pending.text))).toBe(true);
  const strings = JSON.parse(readFileSync(resolve(__dirname, `../../../locales/${locale}/interview.json`), "utf8")).drill;
  expect(buttons.map((b) => b.props.accessibilityLabel)).toEqual([strings.stopFinish, strings.stopContinue]);
  (buttons[0].props.onPress as () => void)(); (buttons[1].props.onPress as () => void)();
  expect(choose.mock.calls).toEqual([["finish", pending], ["continue", pending]]);
});

test("an already queued Enough button keeps pending text in the saved transcript", async () => {
  const s = setup(); await s.send();
  let event: ts.Node | undefined;
  const visit = (n: ts.Node) => {
    if (ts.isJsxOpeningElement(n) && n.tagName.getText(source) === "Pressable"
        && n.attributes.getText(source).includes('accessibilityLabel={t("drill.enough")}')) {
      const attr = n.attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText(source) === "onPress") as ts.JsxAttribute;
      if (attr.initializer && ts.isJsxExpression(attr.initializer)) event = attr.initializer.expression;
    }
    ts.forEachChild(n, visit);
  };
  visit(source);
  if (!event) throw new Error("Missing actual Enough handler");
  runNode(event, s)();
  expect(s.ask).not.toHaveBeenCalled(); expect(s.ended.current).toBe(true);
  expect(storedTurns(s.setTurns.mock.calls[0][0]).at(-1)?.text).toBe(s.draft);
});
