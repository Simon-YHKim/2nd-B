// 저장 중에는 칸을 걷어내지 않는다 (QA 261004 게이트 NAV-R3-01).
//
// 고치기 전: /esm 에서 저장 응답을 기다리는 동안 "홈으로" 를 누르면 goHome(POP_TO)
// 이 ESM 칸을 걷어냈다. 저장이 실패하면 실패 표시는 사라진 컴포넌트로 가고 고른
// 값도 같이 사라져 다시 시도할 길이 없었다.
//
// 세 층을 본다.
//   1. 순수 상태(createSaveExitHold): 잠금 · 맡긴 이동 · 성공/실패 처리.
//   2. 훅(useSaveExitHold): 렌더를 흉내 내어(상태 칸 · 효과를 커밋 뒤에 실행)
//      제거 가드 · goHome 멈춤 · 홈 버튼 · 이어서 하는 이동이 실제로 맞물리는지.
//   3. /esm 배선: 저장이 runSave 안에서 돌고, 실패 가지가 입력을 지우지 않고,
//      홈 버튼이 저장 중에 비활성이다(TypeScript AST - 주석은 증거가 아니다).
//
// 렌더 테스트는 이 저장소에서 막혀 있어(RN 0.85) 훅은 React 를 흉내 내어 부른다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

import { createSaveExitHold, useSaveExitHold, type SaveExitHoldHandle } from "../save-exit-hold";

type PreventCallback = (options: { data: { action: unknown } }) => void;

const mockDispatch = jest.fn();
const mockPrevent: { value: boolean; callback: PreventCallback | null } = { value: false, callback: null };
const mockStopProbe: { current: (() => boolean) | null } = { current: null };
const mockHooks: { slots: unknown[]; slot: number; effects: (() => void)[] } = { slots: [], slot: 0, effects: [] };

jest.mock("react", () => ({
  ...jest.requireActual("react"),
  // 상태 칸은 렌더 사이에 남는다. 효과는 렌더가 끝난 뒤(커밋) 한꺼번에 돈다.
  useState: (init: unknown) => {
    const i = mockHooks.slot++;
    if (!(i in mockHooks.slots)) mockHooks.slots[i] = typeof init === "function" ? (init as () => unknown)() : init;
    return [mockHooks.slots[i], (next: unknown) => (mockHooks.slots[i] = next)];
  },
  useCallback: <T>(fn: T) => fn,
  useEffect: (effect: () => void) => {
    mockHooks.effects.push(effect);
  },
}));
jest.mock("expo-router", () => ({
  useNavigation: () => ({ dispatch: (...args: unknown[]) => mockDispatch(...args) }),
}));
jest.mock("expo-router/react-navigation", () => ({
  // React Navigation 의 usePreventRemove 는 그린 값으로 막고, 막으면 콜백을 부른다.
  usePreventRemove: (value: boolean, callback: PreventCallback) => {
    mockPrevent.value = value;
    mockPrevent.callback = callback;
  },
}));
jest.mock("../go-home", () => ({
  useGoHomeStop: (probe: () => boolean) => {
    mockStopProbe.current = probe;
  },
}));

/** 화면 하나를 그리고 커밋한다(효과 실행). */
function useHookRender(): SaveExitHoldHandle {
  mockHooks.slot = 0;
  mockHooks.effects = [];
  const handle = useSaveExitHold();
  for (const effect of mockHooks.effects) effect();
  return handle;
}

/** 칸을 걷어내는 이동이 왔다. 막혔으면 true. */
function removeAttempt(action: object): boolean {
  if (!mockPrevent.value) return false;
  mockPrevent.callback!({ data: { action } });
  return true;
}

const POP_TO_HOME = { type: "POP_TO", target: "root", payload: { name: "index", params: {} } };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  mockDispatch.mockReset();
  mockPrevent.value = false;
  mockPrevent.callback = null;
  mockStopProbe.current = null;
  mockHooks.slots = [];
});

describe("createSaveExitHold - 저장 하나 동안의 잠금", () => {
  it("저장 중에는 두 번째 저장이 시작되지 않는다", () => {
    const hold = createSaveExitHold();
    expect(hold.begin()).toBe(true);
    expect(hold.active).toBe(true);
    expect(hold.begin()).toBe(false);
    hold.finish(true);
    expect(hold.active).toBe(false);
    expect(hold.begin()).toBe(true);
  });

  it("실패하면 저장 중에 맡긴 이동을 버리고, 성공하면 한 번만 돌려준다", () => {
    const hold = createSaveExitHold();
    const exit = jest.fn();

    hold.begin();
    hold.defer(exit);
    expect(hold.takeExit()).toBeNull(); // 저장 중에는 아직 없다
    hold.finish(false);
    expect(hold.takeExit()).toBeNull();

    hold.begin();
    hold.defer(() => undefined);
    hold.defer(exit); // 마지막 것 하나만 남는다
    hold.finish(true);
    expect(hold.takeExit()).toBe(exit);
    expect(hold.takeExit()).toBeNull();
  });
});

describe("useSaveExitHold - 저장 중 홈 · 뒤로 · 독", () => {
  it("저장 중 누른 홈은 칸을 걷어내지 못하고, 저장이 실패하면 그 이동은 버려진다 (NAV-R3-01)", async () => {
    const first = useHookRender();
    expect(first.saving).toBe(false);
    expect(mockPrevent.value).toBe(false);

    const save = deferred<boolean>();
    const done = first.run(() => save.promise);

    // 다시 그리기 전, 누른 그 프레임에 이미 잠겨 있다.
    expect(mockStopProbe.current!()).toBe(true);
    const home = jest.fn();
    first.whenIdle(home)();
    expect(home).not.toHaveBeenCalled();

    const during = useHookRender();
    expect(during.saving).toBe(true);
    expect(mockPrevent.value).toBe(true);
    // 독 · 하드웨어 뒤로 · 위 화면의 goHome 이 보내는 POP_TO 도 막힌다.
    expect(removeAttempt(POP_TO_HOME)).toBe(true);

    // 저장 중 두 번째 저장은 시작되지 않는다.
    const second = jest.fn(async () => true);
    await during.run(second);
    expect(second).not.toHaveBeenCalled();

    save.resolve(false);
    await done;
    const after = useHookRender();
    expect(after.saving).toBe(false);
    expect(mockPrevent.value).toBe(false);
    expect(mockStopProbe.current!()).toBe(false);
    // 화면이 남는다: 막아 둔 이동을 이어서 하지 않는다.
    expect(mockDispatch).not.toHaveBeenCalled();
    useHookRender();
    expect(mockDispatch).not.toHaveBeenCalled();

    // 저장이 끝난 뒤의 홈은 평소대로 간다.
    after.whenIdle(home)();
    expect(home).toHaveBeenCalledTimes(1);
  });

  it("저장이 성공하면 막아 둔 이동을 막힘이 풀린 뒤 한 번 이어서 한다", async () => {
    const first = useHookRender();
    const save = deferred<boolean>();
    const done = first.run(() => save.promise);
    useHookRender();
    expect(removeAttempt(POP_TO_HOME)).toBe(true);

    save.resolve(true);
    await done;
    expect(mockDispatch).not.toHaveBeenCalled(); // 아직 막힘이 그려진 채다
    useHookRender();
    expect(mockPrevent.value).toBe(false);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith(POP_TO_HOME);
    useHookRender();
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it("저장이 예외로 끝나도 잠금이 풀리고 막아 둔 이동은 버려진다", async () => {
    const first = useHookRender();
    const save = deferred<boolean>();
    const done = first.run(() => save.promise);
    useHookRender();
    removeAttempt(POP_TO_HOME);

    save.reject(new Error("network"));
    await expect(done).rejects.toThrow("network");
    const after = useHookRender();
    expect(after.saving).toBe(false);
    expect(mockStopProbe.current!()).toBe(false);
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

// ── /esm 배선 ──────────────────────────────────────────────────────────────

const ESM = "src/app/esm.tsx";

interface EsmWiring {
  /** useSaveExitHold() 를 구조 분해한 지역 이름. */
  names: { saving?: string; run?: string; whenIdle?: string };
  /** esm_responses insert 가 run(…) 의 콜백 안에만 있는가. */
  insertInsideRun: boolean;
  /** insert 결과의 실패 가지가 false 를 돌려주고 입력 setter 를 부르지 않는가. */
  failureKeepsInput: boolean;
  /** onPress={whenIdle(goHome)} 인 버튼이 disabled={saving} 를 갖는가. */
  homeDisabledWhileSaving: boolean;
}

const INPUT_SETTERS = new Set(["setScaleValue", "setSelectedTags", "setKind"]);

function esmWiring(source: string): EsmWiring {
  const sf = ts.createSourceFile(ESM, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names: EsmWiring["names"] = {};
  const runCallbacks: ts.Node[] = [];
  const inserts: ts.Node[] = [];
  const homeButtons: ts.JsxAttributes[] = [];

  const within = (node: ts.Node, outer: ts.Node) => node.getStart(sf) >= outer.getStart(sf) && node.getEnd() <= outer.getEnd();
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      node.initializer.expression.getText(sf) === "useSaveExitHold"
    ) {
      for (const element of node.name.elements) {
        const key = (element.propertyName ?? element.name).getText(sf) as keyof EsmWiring["names"];
        names[key] = element.name.getText(sf);
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "insert") {
      if (node.expression.expression.getText(sf).includes('from("esm_responses")')) inserts.push(node);
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === names.run) {
      const task = node.arguments[0];
      if (task && (ts.isArrowFunction(task) || ts.isFunctionExpression(task))) runCallbacks.push(task);
    }
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const onPress = node.attributes.properties.find(
        (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(sf) === "onPress",
      );
      if (onPress?.initializer?.getText(sf) === `{${names.whenIdle}(goHome)}`) homeButtons.push(node.attributes);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  const insertInsideRun = inserts.length === 1 && runCallbacks.some((cb) => within(inserts[0], cb));

  let failureKeepsInput = false;
  for (const cb of runCallbacks) {
    const seek = (node: ts.Node) => {
      if (ts.isIfStatement(node) && node.expression.getText(sf) === "error") {
        const branch = node.thenStatement;
        let returnsFalse = false;
        let clears = false;
        const inspect = (inner: ts.Node) => {
          if (ts.isReturnStatement(inner) && inner.expression?.kind === ts.SyntaxKind.FalseKeyword) returnsFalse = true;
          if (ts.isCallExpression(inner) && ts.isIdentifier(inner.expression) && INPUT_SETTERS.has(inner.expression.text)) clears = true;
          ts.forEachChild(inner, inspect);
        };
        inspect(branch);
        failureKeepsInput = returnsFalse && !clears;
      }
      ts.forEachChild(node, seek);
    };
    seek(cb);
  }

  const homeDisabledWhileSaving =
    homeButtons.length === 1 &&
    homeButtons[0].properties.some(
      (p) => ts.isJsxAttribute(p) && p.name.getText(sf) === "disabled" && p.initializer?.getText(sf) === `{${names.saving}}`,
    );

  return { names, insertInsideRun, failureKeepsInput, homeDisabledWhileSaving };
}

describe("/esm 은 저장 중 칸을 붙든다", () => {
  it("판정기: 실패 가지에서 입력을 지우거나, 홈 버튼에 비활성이 없거나, 저장이 runSave 밖이면 잡는다", () => {
    const good = [
      "function S() {",
      "  const { saving, run: go, whenIdle: idle } = useSaveExitHold();",
      "  async function submit() { await go(async () => {",
      '    const { error } = await db.from("esm_responses").insert({});',
      "    if (error) { setToast(x); return false; }",
      "    setScaleValue(null); return true;",
      "  }); }",
      "  return <B onPress={idle(goHome)} disabled={saving} />;",
      "}",
    ].join("\n");
    expect(esmWiring(good)).toEqual({
      names: { saving: "saving", run: "go", whenIdle: "idle" },
      insertInsideRun: true,
      failureKeepsInput: true,
      homeDisabledWhileSaving: true,
    });
    const bad = good
      .replace("{ setToast(x); return false; }", "{ setToast(x); setSelectedTags([]); return false; }")
      .replace(" disabled={saving}", "")
      .replace('  async function submit() { await go(async () => {\n    const { error } = await db.from("esm_responses").insert({});', '  async function submit() { const { error } = await db.from("esm_responses").insert({}); await go(async () => {');
    expect(esmWiring(bad)).toMatchObject({ insertInsideRun: false, failureKeepsInput: false, homeDisabledWhileSaving: false });
  });

  it("src/app/esm.tsx", () => {
    const wiring = esmWiring(readFileSync(join(process.cwd(), ESM), "utf8"));
    expect(wiring).toEqual({
      names: { saving: "saving", run: "runSave", whenIdle: "whenIdle" },
      insertInsideRun: true,
      failureKeepsInput: true,
      homeDisabledWhileSaving: true,
    });
  });
});
