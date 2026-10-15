import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { captureAccountOwnerLease, clearAccountTransition, currentAccountEpoch, noteResolvedOwner } from "../../lib/auth/account-epoch";
import { dismissCrisisNotice, getCrisisNotice, publishCrisisNotice } from "../../lib/safety/crisis-notice";

// Execute the screen's real callbacks, including deferred promises. Native
// rendering is inert here; account ownership and the app notice store are real.
const screen = readFileSync(resolve(__dirname, "../interview.tsx"), "utf8");
const source = ts.createSourceFile("interview.tsx", screen, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function callback(name: string, scope: Record<string, unknown>) {
  let body: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer
      && ts.isCallExpression(node.initializer)) body = node.initializer.arguments[0];
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) body = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!body) throw new Error(`Missing callback ${name}`);
  const js = ts.transpileModule(`const run = (${body.getText(source)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(...Object.keys(scope), `${js}\nreturn run;`)(...Object.values(scope));
}

function setup() {
  noteResolvedOwner(null);
  noteResolvedOwner("A");
  clearAccountTransition(currentAccountEpoch());
  const old = getCrisisNotice();
  if (old) dismissCrisisNotice(old.id);
  let settle!: (value: { zone: string; hotline?: "KR_119" | "KR_112" }) => void;
  let reject!: (error: Error) => void;
  const request = new Promise<{ zone: string; hotline?: "KR_119" | "KR_112" }>((yes, no) => { settle = yes; reject = no; });
  const ended = { current: false };
  const mounted = { current: true };
  const scope = {
    userId: "A", period: "20s", locale: "ko", isMinor: false, concreteOnly: false,
    ended, mounted, captureAccountOwnerLease, publishCrisisNotice,
    nextMove: jest.fn(() => ({ kind: "drill", layer: "fact" })),
    entriesOf: jest.fn(() => []), nextProbe: jest.fn(() => request),
    hotlineFor: () => "KR_109", t: (key: string) => key,
    setBusy: jest.fn(), setNotice: jest.fn(), setDone: jest.fn(), setPendingLayer: jest.fn(), setOpeners: jest.fn(),
    setTurns: jest.fn(), setCoverage: jest.fn(), confirmedAnswer: jest.fn(), incrementCoverage: jest.fn(),
    readDayLimitRefusal: jest.fn(async () => false), setDayLimited: jest.fn(), finish: jest.fn(),
  };
  scope.finish = jest.fn(callback("finish", scope));
  return { scope, settle, reject, ask: callback("ask", scope) };
}

test.each(["stopped", "unmounted", "active"])("late red reaches app when interview is %s and adds no question or credit", async state => {
  const { scope, settle, ask } = setup();
  const pending = ask([{ role: "user", text: "some answer", layer: "fact" }], {}, null, [], "fact");
  if (state !== "active") scope.ended.current = true;
  if (state === "unmounted") scope.mounted.current = false;
  settle({ zone: "red" });
  await pending;
  expect(getCrisisNotice()?.hotline).toBe("KR_109");
  expect(scope.setCoverage).not.toHaveBeenCalled();
  expect(scope.setTurns).not.toHaveBeenCalled();
  expect(scope.confirmedAnswer).not.toHaveBeenCalled();
  if (state === "unmounted") {
    expect(scope.finish).not.toHaveBeenCalled();
    expect(scope.setBusy.mock.calls).toEqual([[true]]);
  } else {
    expect(scope.ended.current).toBe(true);
    expect(scope.setDone).toHaveBeenCalledWith(true);
    dismissCrisisNotice(getCrisisNotice()!.id);
    await ask([], {});
    expect(scope.nextProbe).toHaveBeenCalledTimes(1); // closing cannot resume
  }
});

test.each(["B", null])("late red after switching to %s cannot reach the next owner", async owner => {
  const { scope, settle, ask } = setup();
  const pending = ask([], {});
  noteResolvedOwner(owner);
  clearAccountTransition(currentAccountEpoch());
  settle({ zone: "red" });
  await pending;
  expect(getCrisisNotice()).toBeNull();
  expect(scope.finish).not.toHaveBeenCalled();
  expect(scope.setBusy.mock.calls).toEqual([[true]]);
});

test.each(["stopped", "unmounted"])("ordinary result after %s remains discarded", async state => {
  const { scope, settle, ask } = setup();
  const pending = ask([], {});
  scope.ended.current = true;
  scope.mounted.current = state !== "unmounted";
  settle({ zone: "green" });
  await pending;
  expect(getCrisisNotice()).toBeNull();
  expect(scope.setCoverage).not.toHaveBeenCalled();
  expect(scope.setTurns).not.toHaveBeenCalled();
});

test("late failure after unmount cannot change the next screen", async () => {
  const { scope, reject, ask } = setup();
  const pending = ask([], {});
  scope.mounted.current = false;
  scope.ended.current = true;
  reject(new Error("offline"));
  await pending;
  expect(scope.setNotice.mock.calls).toEqual([[null]]);
  expect(scope.setBusy.mock.calls).toEqual([[true]]);
});

test("local red ends before ledger writes finish without adding a saved answer or credit", async () => {
  const { scope } = setup();
  let ledgerDone!: () => void;
  const done = new Promise<void>(resolve => { ledgerDone = resolve; });
  const sendScope = {
    ...scope, busy: false, coverageReady: true, draft: "위기 입력", turns: [],
    crisisRouting: { current: false }, setDraft: jest.fn(),
    classifyInputAnyLocale: jest.fn(() => ({ zone: "red" })),
    startInterviewCrisisRouting: jest.fn((_guard, _input, visible) => { visible(); return { started: true, done }; }),
  };
  const send = callback("send", sendScope);
  await send();
  expect(getCrisisNotice()?.hotline).toBe("KR_109");
  expect(scope.ended.current).toBe(true);
  expect(scope.setTurns).not.toHaveBeenCalled();
  expect(scope.setCoverage).not.toHaveBeenCalled();
  expect(scope.nextProbe).not.toHaveBeenCalled();
  dismissCrisisNotice(getCrisisNotice()!.id);
  await send();
  expect(sendScope.startInterviewCrisisRouting).toHaveBeenCalledTimes(1);
  ledgerDone();
});

test("app guidance is mounted outside route gates while existing screen dialogs stay focus-bound", () => {
  const layout = readFileSync(resolve(__dirname, "../_layout.tsx"), "utf8");
  expect(layout.indexOf("<AppCrisisHost />")).toBeGreaterThan(layout.indexOf("</SecondbHeadTrackProvider>"));
  expect(layout.indexOf("<AppCrisisHost />")).toBeLessThan(layout.indexOf("</AuthProvider>"));
  const router = readFileSync(resolve(__dirname, "../../components/safety/CrisisRouter.tsx"), "utf8");
  expect(router).toContain("<CrisisDialog {...props} Dialog={Modal} />");
  expect(router).toContain("Dialog={MotionModal}");
  expect(router).toContain("if (!notice) return null;");
});


test.each(["KR_119", "KR_112"] as const)("late %s survives interview end without an extra question", async (hotline) => {
  const { scope, settle, ask } = setup();
  const pending = ask([{ role: "user", text: "some answer", layer: "fact" }], {}, null, [], "fact");
  scope.ended.current = true;
  settle({ zone: "red", hotline });
  await pending;
  expect(getCrisisNotice()?.hotline).toBe(hotline);
  expect(scope.setTurns).not.toHaveBeenCalled();
  expect(scope.setCoverage).not.toHaveBeenCalled();
  expect(scope.confirmedAnswer).not.toHaveBeenCalled();
});
