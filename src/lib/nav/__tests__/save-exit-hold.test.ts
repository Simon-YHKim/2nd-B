// 저장 중에는 칸을 걷어내지 않는다 (QA 261004 게이트 NAV-R3-01).
// 다만 끝나지 않는 저장이 칸을 영영 붙들지는 않는다 (게이트 NAV-R4-01).
//
// 고치기 전: /esm 에서 저장 응답을 기다리는 동안 "홈으로" 를 누르면 goHome(POP_TO)
// 이 ESM 칸을 걷어냈다. 저장이 실패하면 실패 표시는 사라진 컴포넌트로 가고 고른
// 값도 같이 사라져 다시 시도할 길이 없었다.
//
// r4 에서 그걸 막자, 이번에는 응답이 끝내 오지 않는 저장이 홈 · 독 · 뒤로 · 스와이프를
// 전부 영영 막았다. 잠금을 푸는 것이 저장의 끝뿐이었다. 그래서 제한 시간이 생겼다.
//
// 네 층을 본다.
//   1. 순수 상태(createSaveExitHold): 잠금 · 맡긴 이동 · 성공/실패/결과 모름 처리 ·
//      늦은 결과 무시 · 재시도 키.
//   2. 훅(useSaveExitHold): 렌더를 흉내 내어(상태 칸 · 효과를 커밋 뒤에 실행)
//      제거 가드 · goHome 멈춤 · 홈 버튼 · 이어서 하는 이동 · 제한 시간이 실제로 맞물리는지.
//   3. /esm 배선: 저장이 runSave 안에서 돌고, insert 의 id 가 재시도 키이며, 저장 함수가
//      화면을 건드리지 않고, 입력은 "saved" 에서만 지우고, 홈 버튼이 저장 중에 비활성이다
//      (TypeScript AST - 주석은 증거가 아니다).
//   4. 로그인의 요청 중 뒤로(createRequestBackHold): 요청마다 제한 시간까지만 붙든다.
//      useSignInForm 배선은 go-home.test.ts 가 본다.
//
// 렌더 테스트는 이 저장소에서 막혀 있어(RN 0.85) 훅은 React 를 흉내 내어 부른다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

import {
  SAVE_EXIT_HOLD_LIMIT_MS,
  createRequestBackHold,
  createSaveExitHold,
  useSaveExitHold,
  type SaveExitHoldHandle,
} from "../save-exit-hold";

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

/** 대기 중인 then 콜백을 돌린다. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

/** k1, k2, … 를 차례로 내는 키 생성기. */
function counterKeys(): () => string {
  let n = 0;
  return () => `k${(n += 1)}`;
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
    const hold = createSaveExitHold(counterKeys());
    const first = hold.begin("a");
    expect(first).not.toBeNull();
    expect(hold.active).toBe(true);
    expect(hold.begin("a")).toBeNull();
    expect(hold.finish(first!, "saved")).toBe(true);
    expect(hold.active).toBe(false);
    expect(hold.begin("a")).not.toBeNull();
  });

  it("성공이 아니면(실패 · 결과 모름) 저장 중에 맡긴 이동을 버리고, 성공하면 한 번만 돌려준다", () => {
    for (const settlement of ["failed", "unsettled"] as const) {
      const hold = createSaveExitHold(counterKeys());
      const ticket = hold.begin("a")!;
      hold.defer(jest.fn());
      expect(hold.takeExit()).toBeNull(); // 저장 중에는 아직 없다
      hold.finish(ticket, settlement);
      expect(hold.takeExit()).toBeNull();
    }

    const hold = createSaveExitHold(counterKeys());
    const exit = jest.fn();
    const ticket = hold.begin("a")!;
    hold.defer(() => undefined);
    hold.defer(exit); // 마지막 것 하나만 남는다
    hold.finish(ticket, "saved");
    expect(hold.takeExit()).toBe(exit);
    expect(hold.takeExit()).toBeNull();
  });

  it("제한 시간으로 끝낸 저장의 늦은 결과는 다음 저장의 잠금도 맡긴 이동도 건드리지 않는다 (NAV-R4-01)", () => {
    const hold = createSaveExitHold(counterKeys());
    const late = hold.begin("a")!;
    expect(hold.finish(late, "unsettled")).toBe(true);
    expect(hold.active).toBe(false);

    const next = hold.begin("a")!;
    const exit = jest.fn();
    hold.defer(exit);
    expect(hold.finish(late, "saved")).toBe(false);
    expect(hold.finish(late, "failed")).toBe(false);
    expect(hold.active).toBe(true);
    expect(hold.takeExit()).toBeNull();

    expect(hold.finish(next, "saved")).toBe(true);
    expect(hold.takeExit()).toBe(exit);
  });

  it("재시도 키: 저장되기 전까지 같은 입력은 같은 키, 저장된 뒤나 다른 입력은 새 키", () => {
    const hold = createSaveExitHold(counterKeys());
    const a1 = hold.begin("a")!;
    hold.finish(a1, "unsettled");
    const a2 = hold.begin("a")!;
    expect(a2.key).toBe(a1.key); // 결과를 모른 채 다시 보낸 것은 같은 행
    hold.finish(a2, "failed");
    const a3 = hold.begin("a")!;
    expect(a3.key).toBe(a1.key); // 실패 뒤도 같다 - 응답만 잃었을 수 있다
    hold.finish(a3, "saved");
    const a4 = hold.begin("a")!;
    expect(a4.key).not.toBe(a1.key); // 저장된 뒤 같은 답을 또 고른 것은 새 기록
    hold.finish(a4, "failed");
    const b = hold.begin("b")!;
    expect(b.key).not.toBe(a4.key); // 다른 답은 다른 행
    // 저장 중에 들어온 두 번째 begin 은 키를 바꾸지 않는다.
    expect(hold.begin("c")).toBeNull();
    hold.finish(b, "failed");
    expect(hold.begin("b")!.key).toBe(b.key);
  });
});

describe("useSaveExitHold - 저장 중 홈 · 뒤로 · 독", () => {
  it("저장 중 누른 홈은 칸을 걷어내지 못하고, 저장이 실패하면 그 이동은 버려진다 (NAV-R3-01)", async () => {
    const first = useHookRender();
    expect(first.saving).toBe(false);
    expect(mockPrevent.value).toBe(false);

    const save = deferred<boolean>();
    const done = first.run("a", () => save.promise);

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
    await expect(during.run("a", second)).resolves.toBe("busy");
    expect(second).not.toHaveBeenCalled();

    save.resolve(false);
    await expect(done).resolves.toBe("failed");
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
    const done = first.run("a", () => save.promise);
    useHookRender();
    expect(removeAttempt(POP_TO_HOME)).toBe(true);

    save.resolve(true);
    await expect(done).resolves.toBe("saved");
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
    const done = first.run("a", () => save.promise);
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

describe("useSaveExitHold - 끝나지 않는 저장도 칸을 영영 붙들지 않는다 (NAV-R4-01)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("제한 시간이 지나면 잠금이 풀리고, 맡긴 이동은 버려지고, 홈 · 독 · 뒤로로 직접 떠날 수 있다", async () => {
    const first = useHookRender();
    const never = first.run("a", () => new Promise<boolean>(() => undefined));
    useHookRender();
    expect(removeAttempt(POP_TO_HOME)).toBe(true);

    // 제한 시간 1ms 전까지는 그대로 붙든다.
    jest.advanceTimersByTime(SAVE_EXIT_HOLD_LIMIT_MS - 1);
    const holding = useHookRender();
    expect(holding.saving).toBe(true);
    expect(mockPrevent.value).toBe(true);
    expect(mockStopProbe.current!()).toBe(true);

    jest.advanceTimersByTime(1);
    await expect(never).resolves.toBe("unsettled");
    const after = useHookRender();
    expect(after.saving).toBe(false);
    expect(mockPrevent.value).toBe(false); // 독 · 하드웨어 뒤로 · 스와이프가 다시 나간다
    expect(mockStopProbe.current!()).toBe(false); // 위 화면의 goHome 도 여기서 멈추지 않는다
    // 결과를 모르는 채 맡아 둔 이동을 대신 하지 않는다 - 떠날지는 사람이 다시 고른다.
    expect(mockDispatch).not.toHaveBeenCalled();
    useHookRender();
    expect(mockDispatch).not.toHaveBeenCalled();
    const home = jest.fn();
    after.whenIdle(home)();
    expect(home).toHaveBeenCalledTimes(1);
  });

  it("제한 시간 뒤에 돌아온 결과는 버린다 - 새 저장의 잠금을 풀지도, 맡긴 이동을 재생하지도 않는다", async () => {
    const first = useHookRender();
    const slow = deferred<boolean>();
    const late = first.run("a", () => slow.promise);
    useHookRender();
    jest.advanceTimersByTime(SAVE_EXIT_HOLD_LIMIT_MS);
    await expect(late).resolves.toBe("unsettled");

    const after = useHookRender();
    const retry = deferred<boolean>();
    const again = after.run("a", () => retry.promise);
    useHookRender();
    expect(removeAttempt(POP_TO_HOME)).toBe(true);

    slow.resolve(true); // 첫 요청이 이제야 성공했다
    await flush();
    const during = useHookRender();
    expect(during.saving).toBe(true);
    expect(mockStopProbe.current!()).toBe(true);
    expect(mockDispatch).not.toHaveBeenCalled();

    retry.resolve(true);
    await expect(again).resolves.toBe("saved");
    useHookRender();
    expect(mockDispatch).toHaveBeenCalledTimes(1); // 재생은 둘째 저장의 성공 한 번뿐
  });

  it("제한 시간 뒤에 늦게 던진 예외는 아무 데도 닿지 않는다", async () => {
    const first = useHookRender();
    const slow = deferred<boolean>();
    const late = first.run("a", () => slow.promise);
    jest.advanceTimersByTime(SAVE_EXIT_HOLD_LIMIT_MS);
    await expect(late).resolves.toBe("unsettled");
    const after = useHookRender();

    slow.reject(new Error("late network"));
    await flush();
    expect(useHookRender().saving).toBe(false);
    expect(mockDispatch).not.toHaveBeenCalled();
    // 잠금이 남아 있지 않다 - 새 저장이 시작된다.
    await expect(after.run("a", async () => true)).resolves.toBe("saved");
  });

  it("결과를 모른 채 다시 보낸 저장은 같은 키를 받고, 저장된 뒤에는 새 키를 받는다", async () => {
    const keys: string[] = [];
    const first = useHookRender();
    const unknown = first.run("a", (key) => {
      keys.push(key);
      return new Promise<boolean>(() => undefined);
    });
    jest.advanceTimersByTime(SAVE_EXIT_HOLD_LIMIT_MS);
    await expect(unknown).resolves.toBe("unsettled");

    const after = useHookRender();
    await expect(
      after.run("a", async (key) => {
        keys.push(key);
        return true;
      }),
    ).resolves.toBe("saved");
    const later = useHookRender();
    await expect(
      later.run("a", async (key) => {
        keys.push(key);
        return true;
      }),
    ).resolves.toBe("saved");

    expect(keys).toHaveLength(3);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("제한 시간 안에 끝나면 시계가 남지 않는다", async () => {
    const first = useHookRender();
    await expect(first.run("a", async () => true)).resolves.toBe("saved");
    expect(jest.getTimerCount()).toBe(0);
  });
});

// ── /esm 배선 ──────────────────────────────────────────────────────────────

const ESM = "src/app/esm.tsx";

interface EsmWiring {
  /** useSaveExitHold() 를 구조 분해한 지역 이름. */
  names: { saving?: string; run?: string; whenIdle?: string };
  /** esm_responses insert 가 run(…) 의 저장 함수 안에만 있는가. */
  insertInsideRun: boolean;
  /** insert 의 id 가 run 이 넘긴 재시도 키이고, 23505(같은 키가 이미 저장됨)를 성공으로 세는가. */
  keyedRetry: boolean;
  /** 저장 함수가 화면 상태(set…)를 건드리지 않는가. 제한 시간 뒤의 늦은 결과는 버려져야 한다. */
  taskLeavesScreenAlone: boolean;
  /** 입력 setter 는 run 의 결과가 "saved" 인 가지에서만, 그리고 거기서는 부르는가. */
  inputClearedOnlyWhenSaved: boolean;
  /** "failed" 가지가 실패 안내(setToast)를 띄우는가. */
  failureShown: boolean;
  /** "unsettled" 가지가 무언가를 알리는가(상태를 바꾸는가). */
  unsettledShown: boolean;
  /** onPress={whenIdle(goHome)} 인 버튼이 disabled={saving} 를 갖는가. */
  homeDisabledWhileSaving: boolean;
}

const INPUT_SETTERS = new Set(["setScaleValue", "setSelectedTags", "setKind"]);
const isSetter = (name: string) => /^set[A-Z]/.test(name);

function esmWiring(source: string): EsmWiring {
  const sf = ts.createSourceFile(ESM, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names: EsmWiring["names"] = {};
  const runCalls: { call: ts.CallExpression; task: ts.ArrowFunction | ts.FunctionExpression }[] = [];
  const inserts: ts.CallExpression[] = [];
  const homeButtons: ts.JsxAttributes[] = [];

  const within = (node: ts.Node, outer: ts.Node) => node.getStart(sf) >= outer.getStart(sf) && node.getEnd() <= outer.getEnd();
  const calledNames = (root: ts.Node): { name: string; node: ts.CallExpression }[] => {
    const out: { name: string; node: ts.CallExpression }[] = [];
    const seek = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) out.push({ name: node.expression.text, node });
      ts.forEachChild(node, seek);
    };
    seek(root);
    return out;
  };
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
      const task = node.arguments[1];
      if (task && (ts.isArrowFunction(task) || ts.isFunctionExpression(task))) runCalls.push({ call: node, task });
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

  const run = runCalls.length === 1 ? runCalls[0] : null;
  const insert = inserts.length === 1 ? inserts[0] : null;
  const insertInsideRun = !!run && !!insert && within(insert, run.task);

  // 재시도 키: insert({ id: <저장 함수의 첫 인자>, … }) 이고 return 에 `.code === "23505"` 가 있다.
  let keyedRetry = false;
  if (run && insert && insertInsideRun) {
    const keyParam = run.task.parameters[0]?.name;
    const row = insert.arguments[0];
    const idIsKey =
      !!keyParam &&
      ts.isIdentifier(keyParam) &&
      !!row &&
      ts.isObjectLiteralExpression(row) &&
      row.properties.some(
        (p) =>
          ts.isPropertyAssignment(p) &&
          p.name.getText(sf) === "id" &&
          ts.isIdentifier(p.initializer) &&
          p.initializer.text === keyParam.text,
      );
    let duplicateIsSaved = false;
    const seek = (node: ts.Node, inReturn: boolean) => {
      const nowInReturn = inReturn || ts.isReturnStatement(node);
      if (
        nowInReturn &&
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
        ts.isPropertyAccessExpression(node.left) &&
        node.left.name.text === "code" &&
        ts.isStringLiteral(node.right) &&
        node.right.text === "23505"
      ) {
        duplicateIsSaved = true;
      }
      ts.forEachChild(node, (child) => seek(child, nowInReturn));
    };
    seek(run.task, false);
    keyedRetry = idIsKey && duplicateIsSaved;
  }

  const taskLeavesScreenAlone = !!run && calledNames(run.task).every(({ name }) => !isSetter(name));

  // 결과 가지: `const o = await run(…)` 를 담은 함수 안의 `if (o === "…")`.
  let inputClearedOnlyWhenSaved = false;
  let failureShown = false;
  let unsettledShown = false;
  if (run) {
    const awaited = run.call.parent;
    const declaration = awaited && ts.isAwaitExpression(awaited) ? awaited.parent : undefined;
    const outcome = declaration && ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name) ? declaration.name.text : null;
    let fn: ts.Node | undefined = run.call.parent;
    while (fn && !ts.isFunctionDeclaration(fn) && !ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) fn = fn.parent;
    if (outcome && fn) {
      const branches = new Map<string, ts.Statement>();
      const seek = (node: ts.Node) => {
        if (
          ts.isIfStatement(node) &&
          ts.isBinaryExpression(node.expression) &&
          node.expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
          node.expression.left.getText(sf) === outcome &&
          ts.isStringLiteral(node.expression.right)
        ) {
          branches.set(node.expression.right.text, node.thenStatement);
        }
        ts.forEachChild(node, seek);
      };
      seek(fn);
      const saved = branches.get("saved");
      const inputCalls = calledNames(fn).filter(({ name }) => INPUT_SETTERS.has(name));
      inputClearedOnlyWhenSaved =
        !!saved && inputCalls.length > 0 && inputCalls.every(({ node }) => within(node, saved));
      const failed = branches.get("failed");
      failureShown = !!failed && calledNames(failed).some(({ name }) => name === "setToast");
      const unsettled = branches.get("unsettled");
      unsettledShown = !!unsettled && calledNames(unsettled).some(({ name }) => isSetter(name));
    }
  }

  const homeDisabledWhileSaving =
    homeButtons.length === 1 &&
    homeButtons[0].properties.some(
      (p) => ts.isJsxAttribute(p) && p.name.getText(sf) === "disabled" && p.initializer?.getText(sf) === `{${names.saving}}`,
    );

  return {
    names,
    insertInsideRun,
    keyedRetry,
    taskLeavesScreenAlone,
    inputClearedOnlyWhenSaved,
    failureShown,
    unsettledShown,
    homeDisabledWhileSaving,
  };
}

describe("/esm 은 저장 중 칸을 붙들고, 결과를 모를 때도 안전하게 놓는다", () => {
  const GOOD = [
    "function S() {",
    "  const { saving, run: go, whenIdle: idle } = useSaveExitHold();",
    "  async function submit() {",
    "    const outcome = await go(sig, async (key) => {",
    '      const { error } = await db.from("esm_responses").insert({ id: key, a: 1 });',
    '      return !error || error.code === "23505";',
    "    });",
    '    if (outcome === "saved") { setUnconfirmed(false); setScaleValue(null); }',
    '    else if (outcome === "failed") { setToast(x); }',
    '    else if (outcome === "unsettled") { setUnconfirmed(true); }',
    "  }",
    "  return <B onPress={idle(goHome)} disabled={saving} />;",
    "}",
  ].join("\n");
  const ALL_TRUE = {
    insertInsideRun: true,
    keyedRetry: true,
    taskLeavesScreenAlone: true,
    inputClearedOnlyWhenSaved: true,
    failureShown: true,
    unsettledShown: true,
    homeDisabledWhileSaving: true,
  };

  it("판정기: 바른 배선은 전부 참", () => {
    expect(esmWiring(GOOD)).toEqual({ names: { saving: "saving", run: "go", whenIdle: "idle" }, ...ALL_TRUE });
  });

  // 변이 하나가 정확히 그 항목만 떨어뜨린다(다른 항목은 그대로) - 판정기가 실제로 그 모양을 본다.
  // insert 를 저장 함수 밖으로 빼면 재시도 키도 같이 떨어진다(키는 저장 함수의 인자다).
  it.each<[string, string, string, (keyof typeof ALL_TRUE)[]]>([
    [
      "insert 가 저장 함수 밖",
      "    const outcome = await go(sig, async (key) => {\n      const { error } = await db.from(\"esm_responses\").insert({ id: key, a: 1 });",
      "    const { error } = await db.from(\"esm_responses\").insert({ id: key, a: 1 });\n    const outcome = await go(sig, async (key) => {",
      ["insertInsideRun", "keyedRetry"],
    ],
    ["id 가 재시도 키가 아니다", "insert({ id: key, a: 1 })", "insert({ id: other, a: 1 })", ["keyedRetry"]],
    ["23505 를 성공으로 세지 않는다", 'return !error || error.code === "23505";', "return !error;", ["keyedRetry"]],
    ["저장 함수가 화면을 건드린다", "      return !error ||", "      setSaved(true);\n      return !error ||", ["taskLeavesScreenAlone"]],
    ["실패 가지가 입력을 지운다", "{ setToast(x); }", "{ setToast(x); setSelectedTags([]); }", ["inputClearedOnlyWhenSaved"]],
    ["결과 모름 가지가 입력을 지운다", "{ setUnconfirmed(true); }", "{ setUnconfirmed(true); setScaleValue(null); }", ["inputClearedOnlyWhenSaved"]],
    ["저장돼도 입력을 지우지 않는다", " setScaleValue(null); }", " }", ["inputClearedOnlyWhenSaved"]],
    ["실패를 알리지 않는다", "{ setToast(x); }", "{ }", ["failureShown"]],
    ["결과 모름을 알리지 않는다", "{ setUnconfirmed(true); }", "{ }", ["unsettledShown"]],
    ["홈 버튼에 비활성이 없다", " disabled={saving}", "", ["homeDisabledWhileSaving"]],
  ])("변이: %s", (_label, from, to, broken) => {
    expect(GOOD).toContain(from);
    const wiring = esmWiring(GOOD.replace(from, to));
    const expected = { ...ALL_TRUE };
    for (const key of broken) expected[key] = false;
    expect(wiring).toEqual({ names: { saving: "saving", run: "go", whenIdle: "idle" }, ...expected });
  });

  it("src/app/esm.tsx", () => {
    const wiring = esmWiring(readFileSync(join(process.cwd(), ESM), "utf8"));
    expect(wiring).toEqual({ names: { saving: "saving", run: "runSave", whenIdle: "whenIdle" }, ...ALL_TRUE });
  });
});

// ── 로그인 요청 중의 뒤로 (게이트 NAV-R4-01) ────────────────────────────────

describe("createRequestBackHold - 요청 중 뒤로는 요청마다 제한 시간까지만 삼킨다 (NAV-R4-01)", () => {
  it("끝나지 않는 요청도 제한 시간이 지나면 뒤로를 놓는다", () => {
    let now = 0;
    const hold = createRequestBackHold(15_000, () => now);
    expect(hold.holding()).toBe(false);
    hold.begin(); // 끝내 응답이 오지 않는 요청
    now = 14_999;
    expect(hold.holding()).toBe(true);
    now = 15_000;
    expect(hold.holding()).toBe(false);
  });

  it("겹친 요청은 각자의 시계를 따른다 - 늦게 시작한 요청이 남아 있으면 붙든다", () => {
    let now = 0;
    const hold = createRequestBackHold(15_000, () => now);
    hold.begin();
    now = 10_000;
    const endSecond = hold.begin();
    now = 15_000;
    expect(hold.holding()).toBe(true); // 둘째는 5초째
    now = 24_999;
    expect(hold.holding()).toBe(true);
    now = 25_000;
    expect(hold.holding()).toBe(false);
    endSecond();
    expect(hold.holding()).toBe(false);
  });

  it("요청이 끝나면 제한 시간 전이라도 바로 놓고, 두 번 끝내도 다른 요청을 지우지 않는다", () => {
    let now = 0;
    const hold = createRequestBackHold(15_000, () => now);
    const endFirst = hold.begin();
    const endSecond = hold.begin();
    now = 1;
    endFirst();
    endFirst();
    expect(hold.holding()).toBe(true);
    endSecond();
    expect(hold.holding()).toBe(false);
  });
});
