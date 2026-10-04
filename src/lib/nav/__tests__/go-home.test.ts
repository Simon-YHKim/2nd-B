// 홈으로 가는 길이 홈을 하나 더 만들지 않는가 (QA 261004 D-01 · D-12).
//
// 다섯 층을 본다.
//
//   1. 라우터: expo-router 56 이 실제로 쓰는 StackRouter 에 POP_TO 를 넣으면
//      아래의 홈이 그대로 남고 하나뿐이다. 같은 자리에서 REPLACE 는 홈을 둘로
//      만든다 - 고치기 전의 모양을 대조군으로 같이 적는다.
//   2. 헬퍼: goHome / RedirectHome 이 정말 dismissTo("/") 를 부른다.
//   3. 막는 화면(게이트 NS-02): 지금 칸과 홈 사이에 저장 안 한 화면이 있으면
//      그 화면 바로 위까지만 걷어낸다 - 같은 실제 라우터로 확인한다.
//   4. 계정이 바뀐 뒤 다시 쓰는 홈(게이트 NS-01 반박): 칸은 같아도 화면은 새로
//      마운트된다는 전제가 정말 서 있는가.
//   5. 배송 코드: 홈을 쌓는 이동(`<Redirect>` · `<Link>` · push · replace ·
//      navigate)이 자리(파일 · 컴포넌트 · 감싼 조건 · 앞 문장)까지 고정한 명단
//      밖으로 늘지 않고(홈 push 는 0), 칸을 막는 가드는 전부 goHome 에 이름을
//      올리며, 인증 화면의 하드웨어 뒤로는 포커스된 동안만 듣는다(게이트 NS-04 r2).
//
// 렌더 테스트는 이 저장소에서 막혀 있어(RN 0.85) 소스는 TypeScript AST 로 읽는다.
// 주석은 AST 에 없으므로 설명문이 증거로 읽히지 않는다.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";

import {
  __resetAccountEpochForTests,
  accountEpochFromSnapshot,
  accountTransitionSnapshot,
  clearAccountTransition,
  currentAccountEpoch,
  isAccountTransitionPending,
  noteResolvedOwner,
  shouldReleaseAccountTransition,
} from "@/lib/auth/account-epoch";
import { deadRendererSpans } from "@/lib/legal/dead-renderer-spans";
import { shadowedScreens } from "@/lib/legal/shadow-screens";

import {
  HOME_HREF,
  RedirectHome,
  findHomeStack,
  goHome,
  isGoHomeStop,
  planGoHome,
  registerGoHomeStop,
  useGoHomeStop,
  type GoHomeNavState,
} from "../go-home";

const mockDismissTo = jest.fn();
const mockDispatch = jest.fn();
const mockRoute = { key: "unset" };
const mockRootState: { current: unknown } = { current: undefined };
const mockCleanups: (() => void)[] = [];
jest.mock("expo-router", () => ({
  router: { dismissTo: (...args: unknown[]) => mockDismissTo(...args) },
  // 포커스를 얻은 것으로 치고 효과를 바로 돌린다.
  useFocusEffect: (effect: () => void) => effect(),
  useRoute: () => mockRoute,
  useNavigationContainerRef: () => ({
    isReady: () => true,
    getRootState: () => mockRootState.current,
    dispatch: (...args: unknown[]) => mockDispatch(...args),
  }),
}));
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  // 훅을 렌더 없이 함수로 부르기 위해 메모이즈와 효과 예약만 걷어낸다.
  useCallback: <T>(fn: T) => fn,
  useRef: <T>(value: T) => ({ current: value }),
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (typeof cleanup === "function") mockCleanups.push(cleanup);
  },
}));

const { StackRouter } = require("expo-router/build/react-navigation/routers/StackRouter") as {
  StackRouter: (options: object) => {
    getStateForAction: (
      state: StackState,
      action: object,
      options: { routeNames: string[]; routeParamList: object; routeGetIdList: object },
    ) => StackState | null;
  };
};

interface StackRoute {
  key: string;
  name: string;
  params?: object;
  state?: StackState;
}
interface StackState {
  key: string;
  type: "stack";
  stale: false;
  routeNames: string[];
  routes: StackRoute[];
  index: number;
  preloadedRoutes: StackRoute[];
}

const ROOT = process.cwd();
const ROUTE_NAMES = ["index", "canon", "settings", "account", "audit", "esm", "result", "(auth)"];
const AUTH_NAMES = ["sign-in", "reset-password"];
const OPTIONS = { routeNames: ROUTE_NAMES, routeParamList: {}, routeGetIdList: {} };

function stack(...routes: StackRoute[]): StackState {
  return {
    key: "root",
    type: "stack",
    stale: false,
    routeNames: ROUTE_NAMES,
    routes,
    index: routes.length - 1,
    preloadedRoutes: [],
  };
}

function authStack(...routes: StackRoute[]): StackState {
  return { ...stack(...routes), key: "auth-stack", routeNames: AUTH_NAMES };
}

const HOME: StackRoute = { key: "index-k0", name: "index" };
/** goHome 이 보내는 것. expo-router 의 getNavigateAction 이 dismissTo 를 이렇게 만든다. */
const POP_TO_HOME = { type: "POP_TO", target: "root", payload: { name: "index", params: {} } };
/** 고치기 전 `router.replace("/")` / `<Redirect href="/">` 가 보내던 것. */
const REPLACE_HOME = { type: "REPLACE", target: "root", payload: { name: "index", params: {} } };

const router = StackRouter({});
const keysOf = (state: StackState | null | undefined) => state?.routes.map((r) => r.key);

afterEach(() => {
  while (mockCleanups.length) mockCleanups.pop()!();
  mockDismissTo.mockReset();
  mockDispatch.mockReset();
  mockRootState.current = undefined;
});

describe("POP_TO 는 홈을 하나로 남긴다 (expo-router 56 StackRouter)", () => {
  it("아래에 홈이 있으면 그 홈으로 돌아간다 - 같은 key, 칸 하나", () => {
    const next = router.getStateForAction(stack(HOME, { key: "canon-k1", name: "canon" }), POP_TO_HOME, OPTIONS);
    expect(keysOf(next)).toEqual(["index-k0"]);
  });

  it("홈 위에 여러 칸이 쌓여 있어도 홈 하나로 접힌다 (D-12: 설정 → 계정 → 설정)", () => {
    const next = router.getStateForAction(
      stack(
        HOME,
        { key: "settings-k1", name: "settings" },
        { key: "account-k2", name: "account" },
        { key: "settings-k3", name: "settings" },
      ),
      POP_TO_HOME,
      OPTIONS,
    );
    expect(keysOf(next)).toEqual(["index-k0"]);
  });

  it("홈이 없으면(딥링크 · 웹 새로고침) 지금 칸을 홈으로 바꾼다 - 예전 replace 와 같은 결과", () => {
    const next = router.getStateForAction(stack({ key: "settings-k0", name: "settings" }), POP_TO_HOME, OPTIONS);
    expect(next?.routes.map((r) => r.name)).toEqual(["index"]);
  });

  it("대조군: 같은 자리의 REPLACE 는 홈을 둘로 만든다 (고치기 전의 결함)", () => {
    const next = router.getStateForAction(stack(HOME, { key: "canon-k1", name: "canon" }), REPLACE_HOME, OPTIONS);
    expect(next?.routes.map((r) => r.name)).toEqual(["index", "index"]);
    expect(next?.routes[0].key).toBe("index-k0");
    expect(next?.routes[1].key).not.toBe("index-k0");
  });

  // 게이트 NS-04 r2: `/` → `/audit` → 화면 안의 '뒤로'(예전 push("/")) 를 되풀이하면
  // [홈, audit, 홈, audit, 홈 …] 이 되어 D-01 의 OOM 경로가 그대로 돌아온다. /esm 도 같다.
  it("audit · esm 왕복을 열 번 되풀이해도 홈은 하나다 - 대조군 PUSH 는 왕복마다 홈이 하나씩 쌓인다", () => {
    const pushTo = (name: string) => ({ type: "PUSH", target: "root", payload: { name, params: {} } });
    const homes = (state: StackState | null) => state?.routes.filter((r) => r.name === "index").length;
    let fixed: StackState | null = stack(HOME);
    let before: StackState | null = stack(HOME);
    for (let round = 0; round < 10; round++) {
      const screen = round % 2 === 0 ? "audit" : "esm";
      fixed = router.getStateForAction(router.getStateForAction(fixed!, pushTo(screen), OPTIONS)!, POP_TO_HOME, OPTIONS);
      before = router.getStateForAction(router.getStateForAction(before!, pushTo(screen), OPTIONS)!, pushTo("index"), OPTIONS);
    }
    expect(keysOf(fixed)).toEqual(["index-k0"]);
    expect(homes(before)).toBe(11);
    expect(before?.routes).toHaveLength(21);
  });

  it("이미 홈이 둘인 스택에서도 goHome 은 홈을 늘리지 않는다 - 가장 가까운 홈으로 돌아갈 뿐이다", () => {
    // POP_TO 는 가장 가까운 홈만 찾으므로 그 아래의 홈을 걷지는 않는다(지적 그대로).
    // 그래서 지키는 것은 '중복을 만드는 길이 배송 코드에 없다' 쪽이다 - 아래
    // "배송 코드에서 홈으로 가는 길" 이 push 0 · replace 는 칸 하나일 때만으로 묶는다.
    const dup = stack(HOME, AUDIT, { key: "index-k2", name: "index" }, { key: "esm-k3", name: "esm" });
    const next = router.getStateForAction(dup, POP_TO_HOME, OPTIONS);
    expect(keysOf(next)).toEqual(["index-k0", "audit-k1", "index-k2"]);
    expect(next?.routes.filter((r) => r.name === "index")).toHaveLength(2);
  });
});

describe("goHome / RedirectHome", () => {
  it("goHome 은 dismissTo(\"/\") 다", () => {
    goHome();
    expect(HOME_HREF).toBe("/");
    expect(mockDismissTo).toHaveBeenCalledTimes(1);
    expect(mockDismissTo).toHaveBeenCalledWith("/");
  });

  it("RedirectHome 은 포커스를 얻으면 goHome 을 부르고 아무것도 그리지 않는다", () => {
    expect(RedirectHome()).toBeNull();
    expect(mockDismissTo).toHaveBeenCalledWith("/");
  });
});

// ── 막는 화면 (게이트 NS-02) ───────────────────────────────────────────────
//
// 고치기 전: POP_TO 는 지금 칸과 홈 사이를 전부 걷어내므로 그 사이에 묻힌 화면의
// beforeRemove / usePreventRemove 가 불리고, 하나라도 막으면 동작 전체가
// 취소된다. 확인창은 안 보이는 화면에서 열리거나(아바타 팔레트) 아무 표시 없이
// 막히고(재설정 잠금 · 계정 삭제 중), RedirectHome 은 빈 화면으로 남았다.

const AUDIT: StackRoute = { key: "audit-k1", name: "audit" };
const RESULT: StackRoute = { key: "result-k2", name: "result" };

/** 실제 라우터에 계획을 적용한다. stop 은 겨눈 스택(중첩이면 그 칸 안)에 POP. */
function apply(state: StackState, plan: ReturnType<typeof planGoHome>): StackState | null {
  if (plan.kind === "home") return router.getStateForAction(state, POP_TO_HOME, OPTIONS);
  const action = { type: "POP", payload: { count: plan.count }, target: plan.target };
  if (plan.target === state.key) return router.getStateForAction(state, action, OPTIONS);
  // 중첩 스택을 겨눈 POP: 그 칸의 state 만 바꾼다.
  const routes = state.routes.map((route) =>
    route.state && route.state.key === plan.target
      ? { ...route, state: router.getStateForAction(route.state, action, { ...OPTIONS, routeNames: AUTH_NAMES })! }
      : route,
  );
  return { ...state, routes };
}

describe("goHome 은 지금 막고 있는 화면 앞에서 멈춘다 (게이트 NS-02)", () => {
  const stopOnly = (...keys: string[]) => (key: string) => keys.includes(key);

  it("대조군: 막는 화면이 사이에 있어도 POP_TO 는 그 화면까지 걷어낸다 - 그래서 가드가 끼어들었다", () => {
    const next = router.getStateForAction(stack(HOME, AUDIT, RESULT), POP_TO_HOME, OPTIONS);
    expect(keysOf(next)).toEqual(["index-k0"]);
  });

  it("홈과 지금 칸 사이에 막는 화면이 있으면 그 화면 바로 위까지만 걷어낸다", () => {
    const state = stack(HOME, AUDIT, RESULT);
    const plan = planGoHome(state, stopOnly("audit-k1"));
    expect(plan).toEqual({ kind: "stop", target: "root", count: 1 });
    expect(keysOf(apply(state, plan))).toEqual(["index-k0", "audit-k1"]);
  });

  it("막는 화면이 여럿이면 지금 칸에서 가장 가까운 것에서 멈춘다", () => {
    const state = stack(HOME, AUDIT, { key: "audit-k3", name: "audit" }, { key: "canon-k4", name: "canon" }, RESULT);
    const plan = planGoHome(state, stopOnly("audit-k1", "audit-k3"));
    expect(keysOf(apply(state, plan))).toEqual(["index-k0", "audit-k1", "audit-k3"]);
  });

  it("React Navigation 의 실제 판정(shouldPreventRemove)으로: POP_TO 는 막히고, 계획한 POP 은 막히지 않는다", () => {
    // 고치기 전의 결함을 라우터 다음 단계까지 재현한다. 묻힌 감사 화면이 막으면
    // 동작 전체가 취소된다 - 부른 쪽은 모르고, RedirectHome 이면 빈 화면이 남는다.
    const { shouldPreventRemove } = require("expo-router/build/react-navigation/core/useOnPreventRemove") as {
      shouldPreventRemove: (
        emitter: { emit: (e: { target: string }) => { defaultPrevented: boolean } },
        listeners: Record<string, unknown>,
        current: StackRoute[],
        next: StackRoute[],
        action: object,
      ) => boolean;
    };
    const asked: string[] = [];
    const emitter = {
      emit: (event: { target: string }) => {
        asked.push(event.target);
        return { defaultPrevented: event.target === "audit-k1" }; // 저장 안 한 응답
      },
    };
    const state = stack(HOME, AUDIT, RESULT);

    const popTo = router.getStateForAction(state, POP_TO_HOME, OPTIONS)!;
    expect(shouldPreventRemove(emitter, {}, state.routes, popTo.routes, POP_TO_HOME)).toBe(true);
    expect(asked).toEqual(["result-k2", "audit-k1"]); // 묻힌 화면의 가드가 불렸다

    asked.length = 0;
    const plan = planGoHome(state, stopOnly("audit-k1"));
    const action = { type: "POP", payload: { count: (plan as { count: number }).count }, target: "root" };
    const popped = router.getStateForAction(state, action, OPTIONS)!;
    expect(shouldPreventRemove(emitter, {}, state.routes, popped.routes, action)).toBe(false);
    expect(asked).toEqual(["result-k2"]); // 지금 칸만 - 묻힌 가드는 불리지 않는다
  });

  it("막는 조건이 거짓이면 그대로 홈까지 간다", () => {
    expect(planGoHome(stack(HOME, AUDIT, RESULT), stopOnly())).toEqual({ kind: "home" });
  });

  it("지금 칸 자신의 가드는 건너뛴다 - 포커스된 화면이라 그 자리에서 보인다", () => {
    expect(planGoHome(stack(HOME, RESULT, AUDIT), stopOnly("audit-k1"))).toEqual({ kind: "home" });
  });

  it("홈 아래의 칸과, 홈이 없을 때의 묻힌 칸은 POP_TO 가 걷지 않으므로 보지 않는다", () => {
    expect(planGoHome(stack(AUDIT, HOME, RESULT), stopOnly("audit-k1"))).toEqual({ kind: "home" });
    const noHome = stack(AUDIT, RESULT);
    expect(planGoHome(noHome, stopOnly("audit-k1"))).toEqual({ kind: "home" });
    // 확인: 홈이 없을 때 POP_TO 는 지금 칸만 바꾸고 묻힌 칸은 남긴다.
    expect(keysOf(router.getStateForAction(noHome, POP_TO_HOME, OPTIONS))?.[0]).toBe("audit-k1");
  });

  it("사이 칸 안에 중첩된 가드(재설정 잠금)도 찾는다", () => {
    const auth: StackRoute = { key: "auth-k1", name: "(auth)", state: authStack({ key: "reset-k5", name: "reset-password" }) };
    const state = stack(HOME, auth, RESULT);
    const plan = planGoHome(state, stopOnly("reset-k5"));
    expect(plan).toEqual({ kind: "stop", target: "root", count: 1 });
    expect(keysOf(apply(state, plan))).toEqual(["index-k0", "auth-k1"]);
  });

  it("지금 칸 안의 중첩 스택에서 지금 화면 아래에 묻힌 가드는 그 스택 안에서 멈춘다", () => {
    const inner = authStack({ key: "reset-k5", name: "reset-password" }, { key: "signin-k6", name: "sign-in" });
    const state = stack(HOME, { key: "auth-k1", name: "(auth)", state: inner });
    const plan = planGoHome(state, stopOnly("reset-k5"));
    expect(plan).toEqual({ kind: "stop", target: "auth-stack", count: 1 });
    const next = apply(state, plan);
    expect(keysOf(next)).toEqual(["index-k0", "auth-k1"]);
    expect(keysOf(next?.routes[1].state)).toEqual(["reset-k5"]);
  });

  it("findHomeStack 은 expo-router 의 __root 칸 아래 스택을 찾는다", () => {
    const inner = stack(HOME, AUDIT);
    const root = { key: "container", type: "stack", index: 0, routeNames: ["__root"], routes: [{ key: "__root-0", name: "__root", state: inner }] };
    expect(findHomeStack(root as GoHomeNavState)).toBe(inner);
    expect(findHomeStack(undefined)).toBeUndefined();
  });

  it("판정이 던지면 막는 쪽으로 본다 - 모르는 채로 저장 안 한 화면을 걷지 않는다", () => {
    const release = registerGoHomeStop("throws-k9", () => {
      throw new Error("probe");
    });
    try {
      expect(isGoHomeStop("throws-k9")).toBe(true);
    } finally {
      release();
    }
    expect(isGoHomeStop("throws-k9")).toBe(false);
  });

  it("useGoHomeStop 으로 이름을 올린 화면 앞에서 goHome 이 실제로 멈춘다 (POP, 그 스택을 겨눔)", () => {
    const state = stack(HOME, AUDIT, RESULT);
    mockRootState.current = { key: "container", index: 0, routeNames: ["__root"], routes: [{ key: "__root-0", name: "__root", state }] };
    mockRoute.key = "audit-k1";
    let unsaved = true;
    useGoHomeStop(() => unsaved);

    goHome();
    expect(mockDismissTo).not.toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith({ type: "POP", payload: { count: 1 }, target: "root" });
    expect(keysOf(router.getStateForAction(state, mockDispatch.mock.calls[0][0], OPTIONS))).toEqual(["index-k0", "audit-k1"]);

    // 저장했거나 버렸으면(가드가 풀리면) 다시 홈까지 간다.
    unsaved = false;
    mockDispatch.mockReset();
    goHome();
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockDismissTo).toHaveBeenCalledWith("/");
  });

  it("RedirectHome 도 같은 계획을 쓴다 - 막히면 빈 화면이 아니라 막는 화면이 포커스를 얻는다", () => {
    const state = stack(HOME, AUDIT, { key: "canon-k7", name: "canon" });
    mockRootState.current = { key: "container", index: 0, routeNames: ["__root"], routes: [{ key: "__root-0", name: "__root", state }] };
    mockRoute.key = "audit-k1";
    useGoHomeStop(() => true);
    expect(RedirectHome()).toBeNull();
    expect(mockDispatch).toHaveBeenCalledWith({ type: "POP", payload: { count: 1 }, target: "root" });
    expect(mockDismissTo).not.toHaveBeenCalled();
  });
});

// ── 계정이 바뀐 뒤 다시 쓰는 홈 (게이트 NS-01 반박) ──────────────────────────
//
// 지적: A 의 홈이 스택 아래 남아 있다가 B 로그인 뒤 RedirectHome 이 그 홈을
// 다시 써서 A 의 별 밝기가 보인다. 칸(route key)을 다시 쓰는 것은 맞다(위
// POP_TO 테스트). 그러나 그 칸의 화면은 루트 스택의 screenLayout 이 감싼
// AccountScope 안에 있고, AccountScope 는 계정 epoch 를 key 로 쓰며 다른
// 계정으로 넘어가는 동안은 아무것도 그리지 않는다(src/app/_layout.tsx).
// 그 전제 셋을 여기서 다시 확인한다. 배선 자체는 account-scope.test.ts 가 지킨다.

describe("계정이 바뀌면 다시 쓰는 홈 칸의 화면은 새로 마운트된다 (게이트 NS-01)", () => {
  beforeEach(() => __resetAccountEpochForTests());
  afterAll(() => __resetAccountEpochForTests());

  it("A → 로그아웃 → B 에서 epoch 가 매번 바뀌고, 홈 하나만 남을 때까지 제품 화면을 붙든다", () => {
    noteResolvedOwner("owner-a");
    const a = currentAccountEpoch();
    noteResolvedOwner(null);
    const out = currentAccountEpoch();
    noteResolvedOwner("owner-b");
    const b = currentAccountEpoch();
    expect(new Set([a, out, b]).size).toBe(3); // AccountScope 의 key={epoch} 가 세 번 다르다
    expect(isAccountTransitionPending()).toBe(true); // 그동안 AccountScope 는 null

    // RedirectHome 의 POP_TO 가 남긴 모양: 홈 칸 하나. 이때만 풀린다.
    const popped = router.getStateForAction(stack(HOME, { key: "auth-k1", name: "(auth)" }), POP_TO_HOME, OPTIONS);
    expect(keysOf(popped)).toEqual(["index-k0"]);
    expect(shouldReleaseAccountTransition([], popped!)).toBe(true);
    expect(shouldReleaseAccountTransition([], stack(HOME, HOME))).toBe(false);
    expect(clearAccountTransition(accountEpochFromSnapshot(accountTransitionSnapshot()))).toBe(true);
    expect(isAccountTransitionPending()).toBe(false);
  });

  it("홈 라우트는 AccountScope 를 벗어나지 않는다 - (auth) 만 예외", () => {
    const layout = readFileSync(join(ROOT, "src/app/_layout.tsx"), "utf8").replace(/\r\n/g, "\n");
    expect(layout).toContain("<AccountScope routeName={route.name}>{screen}</AccountScope>");
    expect(layout).toContain('if (routeName === "(auth)") return <>{children}</>;');
    expect(layout).toContain("return <Fragment key={epoch}>{children}</Fragment>;");
    expect(layout).toMatch(/<Stack\.Screen name="index" \/>/);
  });
});

// ── 배송 코드 ───────────────────────────────────────────────────────────

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "__mocks__") continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
      out.push(relative(ROOT, full).split(sep).join("/"));
    }
  }
  return out;
}

let unrenderedSpans: { file: string; from: number; to: number }[] | null = null;

/** 이 줄이 아무 빌드도 그리지 않는 반쪽(레거시 위임 스팬 · 그림자 사본) 안인가. */
function unrenderedLine(): (file: string, line: number) => boolean {
  unrenderedSpans ??= [
    ...deadRendererSpans(ROOT),
    ...shadowedScreens(ROOT).flatMap((s) => (s.span ? [{ file: s.shadow, ...s.span }] : [])),
  ];
  const spans = unrenderedSpans;
  return (file, line) => spans.some((s) => s.file === file && line >= s.from && line <= s.to);
}

type HomeNavKind = "Redirect" | "Link" | "push" | "replace" | "navigate";
interface HomeNav {
  line: number;
  kind: HomeNavKind;
  /** 가장 바깥 함수(컴포넌트 · 훅)의 이름. 모듈 최상위면 "(module)". */
  owner: string;
  /** 이 이동을 감싼 가장 가까운 조건: `then:<조건>` · `else:<조건>` · `and:<조건>`. 없으면 "". */
  guard: string;
  /** 같은 블록에서 바로 앞 문장(공백 정규화). 없으면 "". */
  before: string;
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim();

/** 가장 바깥의 함수 노드와 그 이름(아래 NS-02 판정기와 같은 규칙). */
function outermostOwner(node: ts.Node, sf: ts.SourceFile): string {
  let found: ts.Node | null = null;
  for (let current: ts.Node | undefined = node.parent; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current) || ts.isArrowFunction(current) || ts.isFunctionExpression(current)) found = current;
  }
  if (!found) return "(module)";
  if (ts.isFunctionDeclaration(found) && found.name) return found.name.text;
  if (found.parent && ts.isVariableDeclaration(found.parent)) return found.parent.name.getText(sf);
  return "(anonymous)";
}

/** 이 노드를 가지 하나에 담은 가장 가까운 조건. canGoBack() 가지에서 꺼내면 바뀐다. */
function nearestGuard(node: ts.Node, sf: ts.SourceFile): string {
  let child: ts.Node = node;
  for (let current = node.parent; current && !ts.isSourceFile(current); child = current, current = current.parent) {
    if (ts.isIfStatement(current) && child !== current.expression) {
      return `${child === current.thenStatement ? "then" : "else"}:${squash(current.expression.getText(sf))}`;
    }
    if (ts.isConditionalExpression(current) && child !== current.condition) {
      return `${child === current.whenTrue ? "then" : "else"}:${squash(current.condition.getText(sf))}`;
    }
    if (
      ts.isBinaryExpression(current) &&
      current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      child === current.right
    ) {
      return `and:${squash(current.left.getText(sf))}`;
    }
  }
  return "";
}

/** 이동이 문장 하나로 블록 안에 있으면 바로 앞 문장(예: 계정 전환의 dismissAll()). */
function statementBefore(node: ts.Node, sf: ts.SourceFile): string {
  const statement = node.parent;
  if (!statement || !ts.isExpressionStatement(statement)) return "";
  const block = statement.parent;
  if (!block || !(ts.isBlock(block) || ts.isSourceFile(block))) return "";
  const at = block.statements.indexOf(statement);
  return at > 0 ? squash(block.statements[at - 1].getText(sf)) : "";
}

function unwrap(node: ts.Expression): ts.Expression {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

/**
 * 홈을 가리키는 목적지인가. "/" 문자열 · 같은 파일의 `const X = "/"` ·
 * go-home 의 HOME_HREF(별칭 포함) · `{ pathname: <그것> }` · 조건식의 어느 한 가지.
 */
function homeTarget(node: ts.Expression | undefined, homeNames: ReadonlySet<string>): boolean {
  if (!node) return false;
  const expr = unwrap(node);
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text === HOME_HREF;
  if (ts.isIdentifier(expr)) return homeNames.has(expr.text);
  if (ts.isConditionalExpression(expr)) return homeTarget(expr.whenTrue, homeNames) || homeTarget(expr.whenFalse, homeNames);
  if (
    ts.isBinaryExpression(expr) &&
    [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(
      expr.operatorToken.kind,
    )
  ) {
    return homeTarget(expr.left, homeNames) || homeTarget(expr.right, homeNames);
  }
  if (ts.isObjectLiteralExpression(expr)) {
    return expr.properties.some(
      (p) => ts.isPropertyAssignment(p) && p.name.getText() === "pathname" && homeTarget(p.initializer, homeNames),
    );
  }
  return false;
}

/**
 * 홈으로 가는 이동을 import 심볼 기준으로 찾는다.
 *
 * - `<Redirect>` · `<Link>`: expo-router 에서 가져온 이름(별칭 포함)과 맨 이름.
 * - `X.push / replace / navigate(홈)`: X 가 expo-router 의 `router`(별칭 포함),
 *   `use…Router()` 의 결과(훅을 별칭으로 가져와도 - 가져온 이름으로 본다), 또는
 *   이름이 `router` 인 값일 때. 문자열의 `.replace("/", …)` 는 받는 쪽이 라우터가
 *   아니라 잡지 않는다.
 * - `dismissTo` 는 홈을 쌓지 않으므로 세지 않는다(goHome 의 정체다).
 */
function homeNavigations(source: string, file: string): HomeNav[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const tags = new Map<string, HomeNavKind>([["Redirect", "Redirect"], ["Link", "Link"]]);
  const routers = new Set<string>(["router"]);
  const routerHooks = new Set<string>();
  const homeNames = new Set<string>();
  const isRouterHook = (name: string) => routerHooks.has(name) || /^use\w*Router$/.test(name);

  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const from = statement.moduleSpecifier.text;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const imported = (element.propertyName ?? element.name).text;
      const local = element.name.text;
      if (from === "expo-router") {
        if (imported === "Redirect" || imported === "Link") tags.set(local, imported);
        if (imported === "router") routers.add(local);
      }
      // useRouter · useAppRouter 를 어떤 이름으로 가져와도 그 결과는 라우터다.
      if (/^use\w*Router$/.test(imported)) routerHooks.add(local);
      if (/(^|\/)go-home$/.test(from) && imported === "HOME_HREF") homeNames.add(local);
    }
  }
  const collect = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = unwrap(node.initializer);
      if (homeTarget(init, new Set())) homeNames.add(node.name.text);
      if (ts.isCallExpression(init) && ts.isIdentifier(init.expression) && isRouterHook(init.expression.text)) {
        routers.add(node.name.text);
      }
    }
    ts.forEachChild(node, collect);
  };
  collect(sf);

  const hits: HomeNav[] = [];
  const hit = (node: ts.Node, kind: HomeNavKind): HomeNav => ({
    line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
    kind,
    owner: outermostOwner(node, sf),
    guard: nearestGuard(node, sf),
    before: statementBefore(node, sf),
  });
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const kind = tags.get(node.tagName.getText(sf));
      const href = node.attributes.properties.find(
        (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(sf) === "href",
      );
      const init = href?.initializer;
      const expr = init && ts.isJsxExpression(init) ? init.expression : init && ts.isStringLiteral(init) ? init : undefined;
      if (kind && homeTarget(expr, homeNames)) hits.push(hit(node, kind));
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      routers.has(node.expression.expression.text)
    ) {
      const method = node.expression.name.text;
      if ((method === "push" || method === "replace" || method === "navigate") && homeTarget(node.arguments[0], homeNames)) {
        hits.push(hit(node, method));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

interface HomeNavOccurrence {
  file: string;
  kind: HomeNavKind;
  owner: string;
  guard: string;
  before: string;
}

const occurrenceId = (o: HomeNavOccurrence) => `${o.file} | ${o.kind} | ${o.owner} | ${o.guard} | ${o.before}`;

/** 배송 코드(src, 테스트 · 안 그려지는 반쪽 제외)의 홈 이동 하나하나. 줄 번호는 빼고 자리로 적는다. */
function shippedHomeNavigations(): string[] {
  const hidden = unrenderedLine();
  const out: string[] = [];
  for (const file of sourceFiles(join(ROOT, "src"))) {
    for (const { line, ...rest } of homeNavigations(readFileSync(join(ROOT, file), "utf8"), file)) {
      if (hidden(file, line)) continue;
      out.push(occurrenceId({ file, ...rest }));
    }
  }
  return out.sort();
}

const CAN_GO_BACK_ELSE = "else:router.canGoBack()";

/**
 * 아직 남은, 홈을 쌓을 수 있는 이동. **개수가 아니라 자리로** 묶는다 - 파일 ·
 * 종류 · 그 이동이 사는 컴포넌트(가장 바깥 함수) · 감싼 조건 · 바로 앞 문장.
 * 같은 파일 안에서 안전한 자리(canGoBack() 이 거짓일 때만)를 지우고 조건 없는
 * 자리를 하나 넣으면 개수는 같아도 자리가 달라서 빨개진다. 줄면 여기서 같이 지운다.
 *
 * 남은 것은 두 부류다. push 는 하나도 없다(2026-10-05 게이트 r2 에서 다섯을 전부
 * goHome / useGoHome 으로 옮겼다).
 * - 뒤로 갈 곳이 없을 때만 부르는 `canGoBack() ? back() : replace("/")` 꼴.
 *   스택에 칸이 하나뿐이라 replace 가 만드는 홈은 정확히 하나다.
 * - 스택에 칸이 하나뿐인 것이 구조로 정해진 자리(계정 전환 해소 · 웹 전용
 *   외부 리디렉트 착지)와 런타임에 고르지 않는 레거시 반쪽.
 */
const KNOWN_HOME_NAVIGATIONS: readonly (HomeNavOccurrence & { why: string })[] = [
  {
    file: "src/app/(auth)/oauth-callback.tsx",
    kind: "replace",
    owner: "OAuthCallback",
    guard: "then:!cancelled",
    before: "",
    why: "네이버 OAuth 착지. 파일 머리가 밝히듯 웹 전용이고, 외부 리디렉트로 앱을 새로 띄운 자리라 칸이 하나다.",
  },
  {
    file: "src/app/(auth)/reset-password.tsx",
    kind: "replace",
    owner: "ResetPasswordLegacy",
    guard: "then:complete",
    before: "",
    why: "ResetPasswordLegacy 안. 기본 export 가 recoverySafetyPinsPixelClay=true 로 런타임에 고르지 않는다(판정기 밖의 꼴).",
  },
  {
    file: "src/app/_layout.tsx",
    kind: "replace",
    owner: "PendingAccountTransitionResolver",
    guard: "then:shouldDispatch",
    before: "router.dismissAll();",
    why: "계정 전환 해소: 바로 앞의 dismissAll() 로 칸이 하나뿐일 때만 replace.",
  },
  {
    file: "src/components/deep-space/PolarisCardOverlay.tsx",
    kind: "replace",
    owner: "PolarisCardOverlay",
    guard: CAN_GO_BACK_ELSE,
    before: "",
    why: "canGoBack() 이 거짓일 때만 - 칸 하나.",
  },
  {
    file: "src/components/deep-space/ProfileProbeRetry.tsx",
    kind: "replace",
    owner: "useBackOrHome",
    guard: CAN_GO_BACK_ELSE,
    before: "",
    why: "canGoBack() 이 거짓일 때만 - 칸 하나.",
  },
  {
    file: "src/screens/deepspace/dds-consent-notice-screen.tsx",
    kind: "replace",
    owner: "DeepSpaceConsentNoticeScreen",
    guard: CAN_GO_BACK_ELSE,
    before: "",
    why: "canGoBack() 이 거짓일 때만 - 칸 하나.",
  },
  {
    file: "src/screens/deepspace/dds-legal-doc-screen.tsx",
    kind: "replace",
    owner: "DeepSpaceLegalDocScreen",
    guard: CAN_GO_BACK_ELSE,
    before: "",
    why: "canGoBack() 이 거짓일 때만 - 칸 하나.",
  },
  {
    file: "src/screens/deepspace/dds-manual-screen.tsx",
    kind: "replace",
    owner: "DeepSpaceManualScreen",
    guard: CAN_GO_BACK_ELSE,
    before: "",
    why: "상단 뒤로: canGoBack() 이 거짓일 때만 - 칸 하나.",
  },
  {
    file: "src/screens/deepspace/dds-profile-screen.tsx",
    kind: "replace",
    owner: "DeepSpaceProfileScreen",
    guard: CAN_GO_BACK_ELSE,
    before: "",
    why: "canGoBack() 이 거짓일 때만 - 칸 하나.",
  },
];

describe("배송 코드에서 홈으로 가는 길", () => {
  it("판정기는 별칭 · 상수 · 객체 · 조건식 가지를 따라가고, 다른 목적지와 문자열 replace 는 잡지 않는다", () => {
    const fixture = [
      'import { Redirect as Go, Link, router as nav } from "expo-router";', // 1
      'import { HOME_HREF as H } from "@/lib/nav/go-home";', // 2
      'const HOME = "/";', // 3
      "function A() { return <Go href={H} />; }", // 4  Redirect (별칭 + HOME_HREF 별칭)
      "function B() { nav.replace(HOME); }", // 5  replace (별칭 router + 같은 파일 상수)
      'function C() { const r = useAppRouter(); r.navigate({ pathname: "/" }); }', // 6 navigate (훅 결과)
      'function D() { "a/b".replace("/", "-"); path.replace("/", ""); }', // 7 문자열 replace: 아님
      'function E() { router.push(x ? "/" : "/sign-in"); }', // 8  push (조건식 한 가지)
      'function F() { router.replace("/sign-in"); router.dismissTo("/"); }', // 9 다른 목적지 · dismissTo: 아님
      'function G() { return <Redirect href="/" />; }', // 10 Redirect (맨 이름)
      'function I() { return <Link href={{ pathname: HOME }} />; }', // 11 Link
      "function J() { return <RedirectHome />; }", // 12 아님
    ].join("\n");
    expect(homeNavigations(fixture, "fixture.tsx").map(({ line, kind }) => ({ line, kind }))).toEqual([
      { line: 4, kind: "Redirect" },
      { line: 5, kind: "replace" },
      { line: 6, kind: "navigate" },
      { line: 8, kind: "push" },
      { line: 10, kind: "Redirect" },
      { line: 11, kind: "Link" },
    ]);
  });

  it("판정기는 별칭으로 가져온 라우터 훅의 결과도 라우터로 보고, 이동마다 자리(컴포넌트 · 조건 · 앞 문장)를 적는다", () => {
    const fixture = [
      'import { useAppRouter as useNav } from "@/lib/nav/phone-embed";', // 1
      'import { useRouter as useR } from "expo-router";', // 2
      'function K() { const n = useNav(); n.push("/"); }', // 3  push (별칭 훅)
      'function L() { const r = useR(); r.replace("/"); }', // 4  replace (별칭 훅)
      'function M() { const back = () => { if (router.canGoBack()) router.back(); else router.replace("/"); }; }', // 5
      'function N() { if (go) { router.dismissAll(); router.replace("/"); } }', // 6
      'function O() { return ok && <Link href="/" />; }', // 7
      'function P() { const x = useNavHelper(); x.push("/"); }', // 8 아님: 라우터 훅이 아니다
    ].join("\n");
    expect(homeNavigations(fixture, "fixture.tsx")).toEqual([
      { line: 3, kind: "push", owner: "K", guard: "", before: "const n = useNav();" },
      { line: 4, kind: "replace", owner: "L", guard: "", before: "const r = useR();" },
      { line: 5, kind: "replace", owner: "M", guard: "else:router.canGoBack()", before: "" },
      { line: 6, kind: "replace", owner: "N", guard: "then:go", before: "router.dismissAll();" },
      { line: 7, kind: "Link", owner: "O", guard: "and:ok", before: "" },
    ]);
  });

  it("시야 대조: 그림자 사본의 홈 리다이렉트는 날것의 스캔에 보이고, 안 그려지는 줄이라 빠진다", () => {
    // 이 대조가 없으면 '0건'이 스캔이 파일을 못 읽어서인지 진짜 0인지 모른다.
    const shadow = "src/screens/deepspace/dds-auth-screens.tsx";
    const raw = homeNavigations(readFileSync(join(ROOT, shadow), "utf8"), shadow).filter((h) => h.kind === "Redirect");
    expect(raw.length).toBeGreaterThan(0);
    const hidden = unrenderedLine();
    expect(raw.every((hit) => hidden(shadow, hit.line))).toBe(true);
  });

  it("홈을 쌓을 수 있는 이동은 자리까지 고정한 명단 밖으로 늘지 않는다 - 나머지는 goHome / RedirectHome", () => {
    const expected = KNOWN_HOME_NAVIGATIONS.map(({ why: _why, ...occurrence }) => occurrenceId(occurrence)).sort();
    expect(shippedHomeNavigations()).toEqual(expected);
  });

  it("홈 push 는 하나도 남지 않는다 (게이트 NS-04 r2: audit · esm · 인증 셋)", () => {
    expect(shippedHomeNavigations().filter((id) => id.includes(" | push | "))).toEqual([]);
    const read = (file: string) => readFileSync(join(ROOT, file), "utf8");
    // 폰 안에서는 useGoHome 이 폰을 닫고(예전 push("/") 와 같은 자리), 폰 밖에서는 goHome.
    for (const file of ["src/app/audit.tsx", "src/app/esm.tsx"]) {
      expect({ file, hook: read(file).includes("const goHome = useGoHome();") }).toEqual({ file, hook: true });
    }
    expect(read("src/app/audit.tsx")).toContain("onPress={goHome}");
    expect(read("src/app/esm.tsx")).toContain("onPress={goHome}");
    expect(read("src/screens/deepspace/dds-sign-up-screen.tsx")).toContain("if (canLeaveGate()) goHome();");
  });

  it("D-01 이 지목한 자리들은 헬퍼로 간다", () => {
    const read = (file: string) => readFileSync(join(ROOT, file), "utf8");
    for (const file of [
      "src/components/ui/DevOnlyRoute.tsx",
      "src/screens/deepspace/dds-sign-in-screen.tsx",
      "src/screens/deepspace/dds-sign-up-screen.tsx",
      "src/app/onboarding.tsx",
      "src/app/(auth)/complete-profile.tsx",
      "src/app/me/[star].tsx",
      "src/app/star/[domain].tsx",
    ]) {
      expect({ file, uses: read(file).includes("<RedirectHome />") }).toEqual({ file, uses: true });
    }
    expect(read("src/app/onboarding.tsx")).toMatch(/if \(destination === "\/"\) \{\s*goHome\(\);/);
    expect(read("src/components/ui/BackArrow.tsx")).toContain("onPress={() => goHome()}");
  });

  it("D-12: 탭 루트의 하드웨어 뒤로와 독의 홈은 goHome 이다", () => {
    const screen = readFileSync(join(ROOT, "src/components/deep-space/DeepSpaceScreen.tsx"), "utf8");
    const back = screen.slice(screen.indexOf('addEventListener("hardwareBackPress"'), screen.indexOf("return () => sub.remove();"));
    expect(back).toContain("goHome();");
    expect(back).not.toContain('router.replace("/")');
    // 핸들러는 정리된다(ANDROID_QA_GUIDELINES: BackHandler 누수).
    expect(screen).toContain("return () => sub.remove();");
    const dock = screen.slice(screen.indexOf("onSelect={(tab) => {"), screen.indexOf("</SafeAreaView>"));
    expect(dock).toContain('if (target === "/") goHome();');
    expect(dock).toContain("else router.replace(target);");
  });
});

// ── 칸을 막는 가드는 goHome 에 이름을 올린다 (게이트 NS-02) ────────────────

interface RemovalGuard {
  file: string;
  line: number;
  owner: string;
  registersStop: boolean;
}

/** 가장 바깥의 함수(컴포넌트) 노드와 그 이름. */
function outermostFunction(node: ts.Node, sf: ts.SourceFile): { fn: ts.Node; name: string } | null {
  let found: ts.Node | null = null;
  for (let current: ts.Node | undefined = node.parent; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current) || ts.isArrowFunction(current) || ts.isFunctionExpression(current)) found = current;
  }
  if (!found) return null;
  let name = "(anonymous)";
  if (ts.isFunctionDeclaration(found) && found.name) name = found.name.text;
  else if (found.parent && ts.isVariableDeclaration(found.parent)) name = found.parent.name.getText(sf);
  return { fn: found, name };
}

function callsNamed(root: ts.Node, names: ReadonlySet<string>): boolean {
  let hit = false;
  const visit = (node: ts.Node) => {
    if (hit) return;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && names.has(node.expression.text)) {
      hit = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return hit;
}

/** `usePreventRemove(…)`(별칭 포함)와 `x.addListener("beforeRemove", …)`. */
function removalGuards(source: string, file: string): RemovalGuard[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const prevent = new Set<string>(["usePreventRemove"]);
  const stop = new Set<string>(["useGoHomeStop"]);
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const imported = (element.propertyName ?? element.name).text;
      if (imported === "usePreventRemove") prevent.add(element.name.text);
      if (imported === "useGoHomeStop") stop.add(element.name.text);
    }
  }
  const guards: RemovalGuard[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isPrevent = ts.isIdentifier(callee) && prevent.has(callee.text);
      const first = node.arguments[0];
      const isListener =
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === "addListener" &&
        first !== undefined &&
        ts.isStringLiteralLike(first) &&
        first.text === "beforeRemove";
      if (isPrevent || isListener) {
        const owner = outermostFunction(node, sf);
        guards.push({
          file,
          line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
          owner: owner?.name ?? "(module)",
          registersStop: owner ? callsNamed(owner.fn, stop) : false,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return guards;
}

describe("칸을 막는 가드는 goHome 에 이름을 올린다 (게이트 NS-02)", () => {
  it("판정기: 가드가 있는 컴포넌트가 useGoHomeStop 을 부르는지 본다(별칭 포함)", () => {
    const fixture = [
      'import { usePreventRemove as keep } from "expo-router/react-navigation";',
      'import { useGoHomeStop as stopHere } from "@/lib/nav/go-home";',
      "function A() { keep(dirty, cb); stopHere(() => dirty); }",
      'function B() { useEffect(() => navigation.addListener("beforeRemove", (e) => e.preventDefault()), []); }',
      'function C() { navigation.addListener("focus", f); }',
    ].join("\n");
    expect(removalGuards(fixture, "f.tsx").map(({ owner, registersStop }) => [owner, registersStop])).toEqual([
      ["A", true],
      ["B", false],
    ]);
  });

  it("src 의 모든 removal 가드가 같은 컴포넌트에서 useGoHomeStop 을 부른다", () => {
    const guards = sourceFiles(join(ROOT, "src")).flatMap((file) => removalGuards(readFileSync(join(ROOT, file), "utf8"), file));
    // 시야 대조: 스캔이 아무것도 못 읽어서 통과하는 것이 아니다.
    expect([...new Set(guards.map((g) => g.file))].sort()).toEqual([
      "src/app/audit.tsx",
      "src/app/avatar-palette.tsx",
      "src/screens/deepspace/DeepSpaceDesignScreens.tsx",
      "src/screens/deepspace/dds-auth-screens.tsx",
    ]);
    expect(guards.filter((g) => !g.registersStop).map(({ file, line, owner }) => `${file}:${line} ${owner}`)).toEqual([]);
  });
});

// ── 인증 화면의 하드웨어 뒤로는 포커스된 동안만 (게이트 NS-04 r2) ─────────────
//
// 고치기 전: useSignInForm / useSignUpForm 이 BackHandler 를 그냥 useEffect 로 달았다.
// 그래서 화면이 묻혀도(가입 화면 위에 /manual, 로그인 위에 /sign-up 이 열려도) 계속
// 들었다. BackHandler 는 나중에 단 리스너부터 묻고, 내비게이션 컨테이너의 기본
// 뒤로(expo-router 의 useBackButton)는 그보다 먼저 달려 있다. 위 화면에 자기 뒤로가
// 없으면 묻힌 인증 화면이 가로채 push("/") 했다 - 한 칸 뒤가 아니라 새 홈(게스트는
// 다시 /sign-in)으로 가고, 누를 때마다 칸이 하나씩 쌓였다.

interface BackListener {
  line: number;
  /** useFocusEffect(…) 의 콜백 안에서 달았는가. 화면이 포커스를 잃으면 떨어진다. */
  focusScoped: boolean;
  /** 핸들러가 goHome() 을 부르는가. */
  callsGoHome: boolean;
}

function hardwareBackListeners(source: string, file: string): BackListener[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const focusNames = new Set<string>(["useFocusEffect"]);
  const goHomeNames = new Set<string>(["goHome"]);
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const imported = (element.propertyName ?? element.name).text;
      if (imported === "useFocusEffect") focusNames.add(element.name.text);
      if (imported === "goHome") goHomeNames.add(element.name.text);
    }
  }
  /** 이름으로 넘긴 핸들러는 같은 함수 안의 선언을 찾아 본문을 읽는다. */
  const handlerBody = (call: ts.CallExpression): ts.Node | undefined => {
    const handler = call.arguments[1];
    if (!handler || !ts.isIdentifier(handler)) return handler;
    let found: ts.Node | undefined;
    let scope: ts.Node = sf;
    for (let current = call.parent; current; current = current.parent) {
      if (ts.isFunctionDeclaration(current) || ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
        scope = current;
        break;
      }
    }
    const seek = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === handler.text) found = node.initializer;
      if (!found) ts.forEachChild(node, seek);
    };
    seek(scope);
    return found;
  };
  const listeners: BackListener[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "addEventListener" &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      node.arguments[0].text === "hardwareBackPress"
    ) {
      let focusScoped = false;
      for (let current = node.parent; current; current = current.parent) {
        if (ts.isCallExpression(current) && ts.isIdentifier(current.expression) && focusNames.has(current.expression.text)) {
          focusScoped = true;
          break;
        }
      }
      const body = handlerBody(node);
      listeners.push({
        line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
        focusScoped,
        callsGoHome: body ? callsNamed(body, goHomeNames) : false,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return listeners;
}

describe("인증 화면의 하드웨어 뒤로는 포커스된 동안만 듣고 goHome 으로 간다 (게이트 NS-04 r2)", () => {
  it("판정기: useEffect 로 단 리스너는 포커스 밖, useFocusEffect 안은 포커스 안 - 이름으로 넘긴 핸들러도 읽는다", () => {
    const fixture = [
      'import { useFocusEffect as onFocus } from "expo-router";',
      'import { goHome as home } from "@/lib/nav/go-home";',
      'function A() { useEffect(() => { const s = BackHandler.addEventListener("hardwareBackPress", () => { router.push("/"); return true; }); return () => s.remove(); }, []); }',
      'function B() { onFocus(useCallback(() => { const go = () => { home(); return true; }; const s = BackHandler.addEventListener("hardwareBackPress", go); return () => s.remove(); }, [])); }',
    ].join("\n");
    expect(hardwareBackListeners(fixture, "f.tsx").map(({ focusScoped, callsGoHome }) => [focusScoped, callsGoHome])).toEqual([
      [false, false],
      [true, true],
    ]);
  });

  it.each(["src/lib/auth/useSignInForm.ts", "src/lib/auth/useSignUpForm.ts"])("%s", (file) => {
    const listeners = hardwareBackListeners(readFileSync(join(ROOT, file), "utf8"), file);
    expect(listeners.map(({ focusScoped, callsGoHome }) => ({ focusScoped, callsGoHome }))).toEqual([
      { focusScoped: true, callsGoHome: true },
    ]);
  });
});
