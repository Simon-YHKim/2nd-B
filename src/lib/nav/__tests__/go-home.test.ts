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
//      navigate)이 자리(파일 · 컴포넌트 · 감싼 조건 · 앞 문장)까지 고정한 두 명단
//      (칸 하나뿐인 자리 · 사람이 누르는 홈 동작) 밖으로 늘지 않고, 저절로 넘기는
//      `<Redirect href="/">` 는 0 이며, goHome · RedirectHome 을 쓰는 자리는
//      저절로 넘기는 곳과 탭 루트 하드웨어 뒤로뿐이고(PR #2044 8회차), 칸을 막는
//      가드는 전부 goHome 에 이름을 올린다. 가드 없이 이름을 올리는 여섯 화면(/esm ·
//      /formats · /peer/[token] · /service-consent · /subscription · /interview)까지
//      부르는 자리 전부를 명단으로 고정하고, 각 판정을 값 표에 대고 돌린다(게이트
//      NAV-S7-01).
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
const ROUTE_NAMES = [
  "index",
  "canon",
  "settings",
  "account",
  "audit",
  "esm",
  "result",
  "(auth)",
  "formats",
  "peer/[token]",
  "service-consent",
  "subscription",
  "interview",
];
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

  // 라우터 사실: `/` → `/audit` → 화면 안의 '뒤로'(push("/")) 를 되풀이하면 [홈, audit,
  // 홈, audit, 홈 …] 이 된다. /esm 도 같다. 게이트 NS-04 r2 는 그 버튼들을 goHome 으로
  // 옮겼지만, 8회차에 사람이 누르는 홈 동작은 PR 이전의 push 로 되돌렸다(아래
  // USER_HOME_NAVIGATIONS) - 이 대조군이 그 잔여의 크기를 보여 준다.
  it("POP_TO 로 왕복을 열 번 되풀이하면 홈은 하나다 - 대조군 PUSH(지금 /audit · /esm 의 버튼)는 왕복마다 홈이 하나씩 쌓인다", () => {
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
 * 같은 파일 안에서 한 자리를 지우고 다른 자리를 하나 넣으면 개수는 같아도 자리가
 * 달라서 빨개진다. 줄면 여기서 같이 지운다.
 *
 * 두 명단으로 나눈다.
 * - KNOWN_HOME_NAVIGATIONS: 칸이 하나뿐일 때만 도는 자리. 뒤로 갈 곳이 없을 때만
 *   부르는 `canGoBack() ? back() : replace("/")` 꼴, 스택에 칸이 하나뿐인 것이
 *   구조로 정해진 자리(계정 전환 해소 · 웹 전용 외부 리디렉트 착지), 런타임에
 *   고르지 않는 레거시 반쪽.
 * - USER_HOME_NAVIGATIONS: 사람이 누르는 홈 동작(PR #2044 8회차, 2026-10-05).
 *   4~7회차에 이것들까지 goHome(POP_TO)으로 바꿨다가 저장 중인 화면 · 요청을
 *   기다리는 로그인 화면을 걷어내는 새 경로가 회차마다 나와서, PR 이전의
 *   push/replace 로 되돌렸다. 홈이 쌓인 원인은 자동 리다이렉트 · 반복 딥링크 ·
 *   탭 루트 하드웨어 뒤로였고(1단계 안드로이드 실측: 탭 바로 홈 ↔ 설정은 Views
 *   1,949 ↔ 1,725 로 누적 없음), 그 셋은 아래 GO_HOME_USES 가 지킨다. push 인
 *   자리(BackArrow · /audit · /esm · 인증 화면 뒤로)는 왕복을 되풀이하면 홈을
 *   하나씩 얹는다 - 위 PUSH 대조군 그대로이고, 받아들인 잔여다.
 *
 * 새 자리가 생기면 어느 명단인지, 저절로 넘기는 자리라면 RedirectHome 으로 가야
 * 하는지부터 본다.
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

/** 사람이 누르는 홈 동작 - PR 이전의 push/replace 그대로(8회차). 위 설명 참고. */
const USER_HOME_NAVIGATIONS: readonly (HomeNavOccurrence & { why: string })[] = [
  {
    file: "src/app/(auth)/complete-profile.tsx",
    kind: "replace",
    owner: "CompleteProfileBody",
    guard: "then:result.judgeMode",
    before: "",
    why: "사람이 누른 프로필 완성 제출 뒤의 이동(심사 계정 안내 뒤). 마운트 즉시 넘기는 가드는 RedirectHome 이다.",
  },
  {
    file: "src/app/(auth)/complete-profile.tsx",
    kind: "replace",
    owner: "CompleteProfileBody",
    guard: "then:result.kind === \"entered\"",
    before: "if (result.judgeMode) { setJudgeWelcome(true); // hold the redirect guard open for the toast setToast({ tone: \"success\", message: t(\"judge.welcome\") }); setTimeout(() => router.replace(nextRoute), 900); return; }",
    why: "사람이 누른 프로필 완성 제출 뒤의 이동. 마운트 즉시 넘기는 가드는 RedirectHome 이다.",
  },
  {
    file: "src/app/+not-found.tsx",
    kind: "replace",
    owner: "NotFound",
    guard: "",
    before: "",
    why: "모르는 주소 화면의 '홈으로' 버튼과 하드웨어 뒤로가 같이 쓰는 함수(사람이 누른다).",
  },
  {
    file: "src/app/audit.tsx",
    kind: "push",
    owner: "AuditLegacy",
    guard: "then:period === null",
    before: "",
    why: "기간 선택 화면의 '뒤로' 버튼(사람이 누른다). push 라 /audit 왕복을 되풀이하면 홈이 쌓인다(위 PUSH 대조군) - 8회차에 받아들인 잔여.",
  },
  {
    file: "src/app/avatar-studio.tsx",
    kind: "replace",
    owner: "AvatarStudioScreen",
    guard: "then:setupMode",
    before: "",
    why: "아바타 설정 모드에서 나가기 · 저장 뒤 이동(사람이 누른다).",
  },
  {
    file: "src/app/avatar-studio.tsx",
    kind: "replace",
    owner: "AvatarStudioScreen",
    guard: "then:setupMode",
    before: "if (userId) markAvatarSetupDeferredForSession(userId);",
    why: "아바타 설정 모드에서 나가기 · 저장 뒤 이동(사람이 누른다).",
  },
  {
    file: "src/app/esm.tsx",
    kind: "push",
    owner: "EsmCheckInScreen",
    guard: "",
    before: "",
    why: "ESM 화면의 '홈으로' 버튼(사람이 누른다). push 라 왕복을 되풀이하면 홈이 쌓인다 - 8회차에 받아들인 잔여.",
  },
  {
    file: "src/app/onboarding.tsx",
    kind: "replace",
    owner: "Onboarding",
    guard: "then:destination === \"/\"",
    before: "",
    why: "온보딩 마지막의 '홈으로' 선택(사람이 누른다). 이미 끝낸 온보딩의 자동 리다이렉트는 RedirectHome 이다.",
  },
  {
    file: "src/app/settings.tsx",
    kind: "replace",
    owner: "Settings",
    guard: "else:isDeepSpaceUI()",
    before: "resetCoachmarks(userId);",
    why: "설정의 '안내 다시 보기'(사람이 누른다).",
  },
  {
    file: "src/app/settings.tsx",
    kind: "replace",
    owner: "Settings",
    guard: "then:isDeepSpaceUI()",
    before: "resetCoachmarks(userId);",
    why: "설정의 '안내 다시 보기'(사람이 누른다).",
  },
  {
    file: "src/components/dashboard/DashboardPhone.tsx",
    kind: "replace",
    owner: "DashboardPhone",
    guard: "else:transparentBackdrop",
    before: "",
    why: "대시보드 폰 닫기(사람이 누른다). 홈이 연 폰이면 back() 이다.",
  },
  {
    file: "src/components/deep-space/DeepSpaceViews.tsx",
    kind: "replace",
    owner: "CaptureView",
    guard: "then:coachStep === \"done\"",
    before: "",
    why: "첫 기록 안내의 마지막 '홈으로'(사람이 누른다).",
  },
  {
    file: "src/components/deep-space/DeepSpaceViews.tsx",
    kind: "replace",
    owner: "MeSynthView",
    guard: "",
    before: "",
    why: "나 요약의 '별자리로' 링크(사람이 누른다).",
  },
  {
    file: "src/components/ui/BackArrow.tsx",
    kind: "push",
    owner: "BackArrow",
    guard: "",
    before: "",
    why: "떠 있는 BackArrow 칩(사람이 누른다). push 라 누를 때마다 홈을 하나 얹는다 - 8회차에 받아들인 잔여.",
  },
  {
    file: "src/lib/auth/useSignInForm.ts",
    kind: "push",
    owner: "useSignInForm",
    guard: "",
    before: "",
    why: "로그인 화면의 하드웨어 뒤로(사람이 누른다). 8회차: PR 이전 그대로.",
  },
  {
    file: "src/lib/auth/useSignInForm.ts",
    kind: "replace",
    owner: "useSignInForm",
    guard: "",
    before: "void observeAuthConversion(result.userId, \"login\", \"email\");",
    why: "사람이 누른 로그인 제출이 성공한 뒤의 이동. 로그인 상태의 로그인 화면 가드는 RedirectHome 이다.",
  },
  {
    file: "src/lib/auth/useSignUpForm.ts",
    kind: "push",
    owner: "useSignUpForm",
    guard: "",
    before: "if (actionLockRef.current.active !== null) return true;",
    why: "가입 화면의 하드웨어 뒤로(사람이 누른다). 인증 쓰기 중에는 먼저 소비된다.",
  },
  {
    file: "src/lib/auth/useSignUpForm.ts",
    kind: "replace",
    owner: "useSignUpForm",
    guard: "then:mountedRef.current",
    before: "",
    why: "사람이 누른 가입 제출 뒤의 이동(심사 계정 안내 뒤).",
  },
  {
    file: "src/lib/auth/useSignUpForm.ts",
    kind: "replace",
    owner: "useSignUpForm",
    guard: "then:result.kind === \"entered\"",
    before: "if (result.judgeMode) { setJudgeWelcome(true); // hold the guest guard open for the toast setToast({ tone: \"success\", message: t(\"judge.welcome\") }); judgeRouteTimerRef.current = setTimeout(() => { if (mountedRef.current) router.replace(nextRoute); }, 900); return; }",
    why: "사람이 누른 가입 제출 뒤의 이동.",
  },
  {
    file: "src/screens/deepspace/dds-auth-screens.tsx",
    kind: "replace",
    owner: "DeepSpaceResetPasswordDesignScreen",
    guard: "",
    before: "if (exitLocked) return true;",
    why: "비밀번호 재설정 화면의 하드웨어 뒤로(사람이 누른다). 잠금 중에는 먼저 소비된다.",
  },
  {
    file: "src/screens/deepspace/dds-auth-screens.tsx",
    kind: "replace",
    owner: "DeepSpaceResetPasswordDesignScreen",
    guard: "then:(step === \"request\" || step === \"verify\") && !exitLocked",
    before: "",
    why: "비밀번호 재설정 화면의 나가기 링크(사람이 누른다).",
  },
  {
    file: "src/screens/deepspace/dds-auth-screens.tsx",
    kind: "replace",
    owner: "DeepSpaceResetPasswordDesignScreen",
    guard: "then:step === \"done\"",
    before: "",
    why: "비밀번호 재설정 완료 화면의 '계속'(사람이 누른다).",
  },
  {
    file: "src/screens/deepspace/dds-manual-screen.tsx",
    kind: "replace",
    owner: "DeepSpaceManualScreen",
    guard: "",
    before: "if (userId) resetCoachmarks(userId);",
    why: "안내서의 '안내 다시 보기'(사람이 누른다).",
  },
  {
    file: "src/screens/deepspace/dds-sign-up-screen.tsx",
    kind: "push",
    owner: "DeepSpaceSignUpDesignScreen",
    guard: "then:canLeaveGate()",
    before: "",
    why: "가입 화면 상단 뒤로(게스트, 사람이 누른다). 같은 동기 가드 뒤에 있다.",
  },
  {
    file: "src/screens/deepspace/museum/MuseumTimelineScreen.tsx",
    kind: "replace",
    owner: "MuseumTimelineScreen",
    guard: "then:selected.here",
    before: "",
    why: "뮤지엄의 '별자리로 돌아가기'(사람이 누른다). 폰 안에서는 폰의 뒤로다.",
  },
  {
    file: "src/screens/deepspace/onboarding/TTFVScreen.tsx",
    kind: "replace",
    owner: "TTFVScreen",
    guard: "then:save.status === \"saved\"",
    before: "",
    why: "첫 가치 화면 저장 뒤의 '홈으로'(사람이 누른다).",
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

  it("홈을 쌓을 수 있는 이동은 자리까지 고정한 두 명단 밖으로 늘지 않는다", () => {
    const expected = [...KNOWN_HOME_NAVIGATIONS, ...USER_HOME_NAVIGATIONS]
      .map(({ why: _why, ...occurrence }) => occurrenceId(occurrence))
      .sort();
    expect(shippedHomeNavigations()).toEqual(expected);
  });

  it("저절로 넘기는 <Redirect href=\"/\"> 와 <Link href=\"/\"> 는 배송 코드에 하나도 없다 (D-01)", () => {
    // 화면이 마운트되자마자 넘기는 자리는 사람이 누르지 않아도 열릴 때마다 돈다.
    // 딥링크를 되풀이하면 그때마다 홈이 하나씩 쌓였다(D-01, 2/2 OOM). 그 자리는
    // RedirectHome 이다. 이 검사는 두 명단과 따로 선다 - 명단에 Redirect 를 적어
    // 넣어도 여기서 빨개진다.
    expect(shippedHomeNavigations().filter((id) => / \| (Redirect|Link) \| /.test(id))).toEqual([]);
  });

  it("D-12: 탭 루트의 하드웨어 뒤로는 goHome 이고, 독은 PR 이전 그대로 지금 칸을 바꾼다", () => {
    const screen = readFileSync(join(ROOT, "src/components/deep-space/DeepSpaceScreen.tsx"), "utf8");
    const back = screen.slice(screen.indexOf('addEventListener("hardwareBackPress"'), screen.indexOf("return () => sub.remove();"));
    expect(back).toContain("goHome();");
    expect(back).not.toContain('router.replace("/")');
    // 핸들러는 정리된다(ANDROID_QA_GUIDELINES: BackHandler 누수).
    expect(screen).toContain("return () => sub.remove();");
    // 독의 홈은 사람이 누르는 동작이다(8회차). 지금 칸을 바꾸므로 탭 사이를 오가도
    // 칸은 늘지 않는다 - 1단계 안드로이드 실측 그대로.
    const dock = screen.slice(screen.indexOf("onSelect={(tab) => {"), screen.indexOf("</SafeAreaView>"));
    expect(dock).toContain("if (tab !== active || pathname !== target) router.replace(target);");
    expect(dock).not.toContain("goHome");
  });
});

// ── goHome 을 쓰는 자리는 저절로 넘기는 곳과 탭 루트 뒤로뿐이다 (8회차) ─────────
//
// 4~7회차에는 사람이 누르는 홈 동작(독 · BackArrow 칩 · 화면 안 홈 버튼 · 로그인
// 화면 하드웨어 뒤로)도 goHome 이었다. POP_TO 는 지금 칸을 걷어내서, 저장 중인
// /esm 이나 요청을 기다리는 로그인 화면을 걷는 새 경로가 회차마다 나왔고, 그걸 막는
// 장치(저장 중 카운터 · 로그인 Back 소비)가 또 다른 빈 화면을 만들었다. 그래서
// 쓰는 자리를 둘로 좁혔다. goHome 을 부르거나 넘기는(onPress={goHome}) 자리 하나
// 하나와 <RedirectHome /> 하나하나를 자리까지 적는다.

type GoHomeUseKind = "RedirectHome" | "goHome";
interface GoHomeUse {
  line: number;
  kind: GoHomeUseKind;
  owner: string;
  guard: string;
  /** 가장 가까운 JSX 속성(`jsx:onPress`) 또는 이벤트 리스너(`listener:hardwareBackPress`). 없으면 "". */
  handler: string;
}

/** 이 노드를 담은 가장 가까운 JSX 속성 또는 addEventListener 의 이벤트 이름. */
function nearestHandler(node: ts.Node): string {
  for (let current = node.parent; current && !ts.isSourceFile(current); current = current.parent) {
    if (ts.isJsxAttribute(current)) return `jsx:${current.name.getText()}`;
    if (
      ts.isCallExpression(current) &&
      ts.isPropertyAccessExpression(current.expression) &&
      current.expression.name.text === "addEventListener" &&
      current.arguments[0] !== undefined &&
      ts.isStringLiteralLike(current.arguments[0])
    ) {
      return `listener:${current.arguments[0].text}`;
    }
  }
  return "";
}

/** go-home 에서 가져온 이름 전부와, goHome · RedirectHome 을 쓰는 자리(별칭 포함). */
function goHomeUses(source: string, file: string): { imported: string[]; uses: GoHomeUse[] } {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const locals = new Map<string, GoHomeUseKind>();
  const imported: string[] = [];
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!/(^|\/)go-home$/.test(statement.moduleSpecifier.text)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const name = (element.propertyName ?? element.name).text;
      imported.push(name);
      if (name === "goHome" || name === "RedirectHome") locals.set(element.name.text, name);
    }
  }
  const uses: GoHomeUse[] = [];
  const hit = (node: ts.Node, kind: GoHomeUseKind) =>
    uses.push({
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      kind,
      owner: outermostOwner(node, sf),
      guard: nearestGuard(node, sf),
      handler: nearestHandler(node),
    });
  const visit = (node: ts.Node) => {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && locals.get(node.tagName.getText(sf)) === "RedirectHome") {
      hit(node, "RedirectHome");
    } else if (
      ts.isIdentifier(node) &&
      locals.get(node.text) === "goHome" &&
      !ts.isImportSpecifier(node.parent) &&
      !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
    ) {
      hit(node, "goHome"); // 부르든(goHome()) 넘기든(onPress={goHome}) 자리 하나
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { imported, uses };
}

const goHomeUseId = (file: string, u: Omit<GoHomeUse, "line">) => `${file} | ${u.kind} | ${u.owner} | ${u.guard} | ${u.handler}`;

/** go-home 을 쓰는 자리 전부. 정의하는 파일 자신과 테스트는 빼고, 안 그려지는 반쪽도 뺀다. */
const GO_HOME_USES: readonly { file: string; use: Omit<GoHomeUse, "line">; why: string }[] = [
  {
    file: "src/app/(auth)/complete-profile.tsx",
    use: { kind: "RedirectHome", owner: "CompleteProfileBody", guard: 'then:postEntryRoute === "/"', handler: "" },
    why: "프로필이 이미 있는 로그인 사람이 이 화면을 열면 마운트 즉시 홈으로.",
  },
  {
    file: "src/app/me/[star].tsx",
    use: { kind: "RedirectHome", owner: "StarSummaryRoute", guard: "then:!id || !meta", handler: "" },
    why: "모르는 별 id(옛 링크) - 마운트 즉시 홈으로.",
  },
  {
    file: "src/app/onboarding.tsx",
    use: { kind: "RedirectHome", owner: "Onboarding", guard: "then:onboardingComplete === true", handler: "" },
    why: "이미 끝낸 온보딩 - 마운트 즉시 홈으로.",
  },
  {
    file: "src/app/star/[domain].tsx",
    use: { kind: "RedirectHome", owner: "DomainStarScreen", guard: "then:!domainId", handler: "" },
    why: "모르는 영역 id - 마운트 즉시 홈으로.",
  },
  {
    file: "src/components/deep-space/DeepSpaceScreen.tsx",
    use: { kind: "goHome", owner: "DeepSpaceScreen", guard: "", handler: "listener:hardwareBackPress" },
    why: "D-12: 탭 루트의 하드웨어 뒤로. replace(\"/\") 는 탭 루트가 홈 위에 있을 때 홈을 하나 더 얹었다.",
  },
  {
    file: "src/components/ui/DevOnlyRoute.tsx",
    use: { kind: "RedirectHome", owner: "DevOnlyRoute", guard: "then:!isDevSurfaceEnabled()", handler: "" },
    why: "프로덕션에서 dev 전용 라우트 - 마운트 즉시 홈으로. dev 딥링크를 되풀이하면 OOM 까지 쌓였다(D-01).",
  },
  {
    file: "src/screens/deepspace/dds-sign-in-screen.tsx",
    use: { kind: "RedirectHome", owner: "DeepSpaceSignInDesignScreen", guard: "then:userId", handler: "" },
    why: "로그인한 사람이 연 로그인 화면 - 마운트 즉시 홈으로.",
  },
  {
    file: "src/screens/deepspace/dds-sign-up-screen.tsx",
    use: { kind: "RedirectHome", owner: "DeepSpaceSignUpDesignScreen", guard: "else:avatarSetupAfterConfirmation", handler: "" },
    why: "로그인한 사람이 연 가입 화면 - 마운트 즉시 홈으로(아바타 설정이 남았으면 그쪽).",
  },
];

function shippedGoHomeUses(): { imported: Set<string>; uses: string[] } {
  const hidden = unrenderedLine();
  const imported = new Set<string>();
  const uses: string[] = [];
  for (const file of sourceFiles(join(ROOT, "src"))) {
    if (file === "src/lib/nav/go-home.ts") continue;
    const found = goHomeUses(readFileSync(join(ROOT, file), "utf8"), file);
    found.imported.forEach((name) => imported.add(name));
    for (const { line, ...use } of found.uses) {
      if (hidden(file, line)) continue;
      uses.push(goHomeUseId(file, use));
    }
  }
  return { imported, uses: uses.sort() };
}

describe("goHome 을 쓰는 자리는 저절로 넘기는 곳과 탭 루트 뒤로뿐이다 (PR #2044 8회차)", () => {
  it("판정기: 별칭 · 넘긴 참조 · JSX 를 자리(컴포넌트 · 조건 · 핸들러)까지 적고, 가져온 이름을 모은다", () => {
    const fixture = [
      'import { goHome as home, RedirectHome as Back, useGoHomeStop } from "@/lib/nav/go-home";', // 1
      "function A() { if (!ok) return <Back />; return null; }", // 2  RedirectHome
      'function B() { useEffect(() => { const s = BackHandler.addEventListener("hardwareBackPress", () => { home(); return true; }); return () => s.remove(); }, []); }', // 3
      "function C() { return <Button onPress={home} />; }", // 4  넘긴 참조
      "function D() { return <Button onPress={() => x.home()} />; }", // 5  아님: 다른 객체의 속성
      "function E() { useGoHomeStop(() => dirty); }", // 6  아님: 쓰는 자리가 아니다
    ].join("\n");
    const { imported, uses } = goHomeUses(fixture, "f.tsx");
    expect(imported).toEqual(["goHome", "RedirectHome", "useGoHomeStop"]);
    expect(uses).toEqual([
      { line: 2, kind: "RedirectHome", owner: "A", guard: "then:!ok", handler: "" },
      { line: 3, kind: "goHome", owner: "B", guard: "", handler: "listener:hardwareBackPress" },
      { line: 4, kind: "goHome", owner: "C", guard: "", handler: "jsx:onPress" },
    ]);
  });

  it("배송 코드에서 goHome · RedirectHome 을 쓰는 자리는 명단과 정확히 같다", () => {
    const expected = GO_HOME_USES.map(({ file, use }) => goHomeUseId(file, use)).sort();
    expect(shippedGoHomeUses().uses).toEqual(expected);
  });

  it("go-home 에서 가져오는 이름은 RedirectHome · goHome · useGoHomeStop · HOME_HREF 뿐이다", () => {
    // 4~7회차의 useGoHome(폰 밖 홈 버튼) · replaceOrGoHome(제출 뒤 이동)은 사람이
    // 누르는 동작을 걷어내는 길이라 없앴다. 되살아나면 여기서 빨개진다.
    const allowed = new Set(["RedirectHome", "goHome", "useGoHomeStop", "HOME_HREF"]);
    expect([...shippedGoHomeUses().imported].filter((name) => !allowed.has(name))).toEqual([]);
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

// ── 가드 없이 이름을 올리는 화면: /esm (게이트 NAV-S7-01) ─────────────────────
//
// 위 검사는 가드(beforeRemove · usePreventRemove)가 있는 화면만 본다. /esm 에는 가드가
// 없는데도 걷히면 잃는 것이 있다: 저장 요청이 돌아왔을 때 실패 안내를 띄울 자리가 그
// 화면뿐이고, 고른 값은 그 화면의 상태다. 그 위에 딥링크로 열린 라우트의 RedirectHome
// 이나 탭 루트의 하드웨어 뒤로가 POP_TO 로 /esm 까지 걷어냈다 - PR 이전의 replace 는
// 새 홈 아래에 묻어 둘 뿐이었다. 그래서 /esm 은 가드 없이 이름을 올리고, 부르는 자리
// 전부를 정확한 명단으로 고정한다. 등록이 빠지거나 판정이 저장 중 ref 를 놓치면 빨개진다.

interface GoHomeStopUse {
  file: string;
  owner: string;
  /** useGoHomeStop 에 넘긴 판정(공백 정규화). */
  probe: string;
}

/** useGoHomeStop(별칭 포함)을 부르는 자리. */
function goHomeStopUses(source: string, file: string): GoHomeStopUse[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = new Set<string>();
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!/(^|\/)go-home$/.test(statement.moduleSpecifier.text)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if ((element.propertyName ?? element.name).text === "useGoHomeStop") names.add(element.name.text);
    }
  }
  const uses: GoHomeStopUse[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && names.has(node.expression.text)) {
      uses.push({ file, owner: outermostOwner(node, sf), probe: squash(node.arguments[0]?.getText(sf) ?? "") });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return uses;
}

/** 이 노드 아래의 모든 노드(자신 포함). */
function descendants(root: ts.Node): ts.Node[] {
  const out: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    out.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return out;
}

/**
 * /esm 의 handleSubmit 에서 저장 중 ref 의 규율: 올리는 문장(`savingRef.current = true`)이
 * 첫 await 보다 앞이고, 내리는 문장(`= false`)이 그 await 를 감싼 try 의 finally 안이다.
 * 앞이 아니면 요청이 나간 사이에 판정이 거짓이고, finally 가 아니면 던진 요청이 ref 를
 * 올린 채로 남긴다.
 */
function esmSaveHold(source: string): { raisedBeforeAwait: boolean; clearedInFinally: boolean } {
  const sf = ts.createSourceFile("esm.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const submit = descendants(sf).find(
    (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "handleSubmit",
  );
  if (!submit?.body) return { raisedBeforeAwait: false, clearedInFinally: false };
  const isSet = (node: ts.Node, value: ts.SyntaxKind) =>
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    node.left.getText(sf) === "savingRef.current" &&
    node.right.kind === value;
  const body = descendants(submit.body);
  const firstAwait = body.find(ts.isAwaitExpression);
  const raise = body.find((node) => isSet(node, ts.SyntaxKind.TrueKeyword));
  if (!firstAwait) return { raisedBeforeAwait: false, clearedInFinally: false };
  const inside = (outer: ts.Node, inner: ts.Node) => inner.getStart(sf) >= outer.getStart(sf) && inner.getEnd() <= outer.getEnd();
  return {
    raisedBeforeAwait: !!raise && raise.getEnd() <= firstAwait.getStart(sf),
    clearedInFinally: body.some(
      (node) =>
        ts.isTryStatement(node) &&
        !!node.finallyBlock &&
        inside(node.tryBlock, firstAwait) &&
        descendants(node.finallyBlock).some((inner) => isSet(inner, ts.SyntaxKind.FalseKeyword)),
    ),
  };
}

/** useGoHomeStop 을 부르는 자리 전부. 가드가 있는 넷과 가드 없는 여섯. */
const GO_HOME_STOP_USES: readonly { file: string; owner: string; why: string }[] = [
  { file: "src/app/audit.tsx", owner: "AuditLegacy", why: "저장 안 한 감사 답 - beforeRemove 확인창." },
  { file: "src/app/avatar-palette.tsx", owner: "AvatarPaletteScreen", why: "고친 아바타 - 나가기 확인창." },
  { file: "src/app/esm.tsx", owner: "EsmCheckInScreen", why: "가드 없음 - 저장 요청 중 · 저장 안 한 고른 값(NAV-S7-01)." },
  { file: "src/app/formats.tsx", owner: "FormatsLegacy", why: "가드 없음 - 편집 · 추가 중 · 쓰기 요청 · 결과 토스트(NAV-S7-01 재확인)." },
  { file: "src/app/interview.tsx", owner: "InterviewSession", why: "가드 없음 - 담기 전 대화 · 쓰던 답 · 요청 중 · 안전 안내 창(NAV-S7-01 재확인)." },
  { file: "src/app/peer/[token].tsx", owner: "PeerInformant", why: "가드 없음 - 적은 답 · 제출 · 철회 중 · 실패 안내(NAV-S7-01 재확인)." },
  { file: "src/app/service-consent.tsx", owner: "ConsentForm", why: "가드 없음 - 검토 중 · 저장 중(언마운트가 abort) · 결과 안내(NAV-S7-01 재확인)." },
  { file: "src/app/subscription.tsx", owner: "SubscriptionScreen", why: "가드 없음 - 해지 · 환불 시트 · 요청 중 · 결과 안내(NAV-S7-01 재확인)." },
  { file: "src/screens/deepspace/DeepSpaceDesignScreens.tsx", owner: "DeepSpacePrivacyDesignScreen", why: "계정 삭제 요청 중." },
  { file: "src/screens/deepspace/dds-auth-screens.tsx", owner: "DeepSpaceResetPasswordDesignScreen", why: "비밀번호 재설정 잠금." },
];

describe("가드 없이 이름을 올리는 화면 /esm (게이트 NAV-S7-01)", () => {
  const ESM: StackRoute = { key: "esm-k1", name: "esm" };

  it.each([
    ["dev 전용 라우트의 RedirectHome", { key: "canon-k2", name: "canon" }],
    ["탭 루트(설정)의 하드웨어 뒤로", { key: "settings-k3", name: "settings" }],
  ])("[홈, /esm(저장 중), 위 칸] · %s: /esm 앞에서 멈춘다 - 대조군: 이름이 없으면 POP_TO 가 /esm 까지 걷는다", (_label, top) => {
    const state = stack(HOME, ESM, top);
    expect(keysOf(router.getStateForAction(state, POP_TO_HOME, OPTIONS))).toEqual(["index-k0"]); // 대조군

    mockRootState.current = { key: "container", index: 0, routeNames: ["__root"], routes: [{ key: "__root-0", name: "__root", state }] };
    mockRoute.key = "esm-k1";
    useGoHomeStop(() => true);
    goHome();
    expect(mockDismissTo).not.toHaveBeenCalled();
    expect(keysOf(router.getStateForAction(state, mockDispatch.mock.calls[0][0], OPTIONS))).toEqual(["index-k0", "esm-k1"]);
  });

  it("판정기: useGoHomeStop(별칭 포함)을 부르는 자리를 적고, 저장 중 ref 의 앞 · finally 를 가린다", () => {
    const head = 'import { useGoHomeStop as hold } from "@/lib/nav/go-home";\n';
    expect(goHomeStopUses(`${head}function S() { hold(() => a ||\n b); other(() => c); }`, "f.tsx")).toEqual([
      { file: "f.tsx", owner: "S", probe: "() => a || b" },
    ]);
    const good = "async function handleSubmit() { savingRef.current = true; try { await save(); } finally { savingRef.current = false; } }";
    const late = "async function handleSubmit() { try { await save(); savingRef.current = true; } finally { savingRef.current = false; } }";
    const noFinally = "async function handleSubmit() { savingRef.current = true; try { await save(); } catch {} savingRef.current = false; }";
    const outsideTry = "async function handleSubmit() { savingRef.current = true; await save(); try { x(); } finally { savingRef.current = false; } }";
    expect(esmSaveHold(good)).toEqual({ raisedBeforeAwait: true, clearedInFinally: true });
    expect(esmSaveHold(late)).toEqual({ raisedBeforeAwait: false, clearedInFinally: true });
    expect(esmSaveHold(noFinally)).toEqual({ raisedBeforeAwait: true, clearedInFinally: false });
    expect(esmSaveHold(outsideTry)).toEqual({ raisedBeforeAwait: true, clearedInFinally: false });
  });

  it("배송 코드에서 useGoHomeStop 을 부르는 자리는 명단과 정확히 같다", () => {
    const found = sourceFiles(join(ROOT, "src"))
      .filter((file) => file !== "src/lib/nav/go-home.ts")
      .flatMap((file) => goHomeStopUses(readFileSync(join(ROOT, file), "utf8"), file))
      .map(({ file, owner }) => `${file} | ${owner}`)
      .sort();
    expect(found).toEqual(GO_HOME_STOP_USES.map(({ file, owner }) => `${file} | ${owner}`).sort());
  });

  it("/esm 의 판정은 저장 중 ref 와 고른 값을 읽고, ref 는 첫 await 앞에서 올라가 finally 에서 내려온다", () => {
    const source = readFileSync(join(ROOT, "src/app/esm.tsx"), "utf8");
    expect(goHomeStopUses(source, "src/app/esm.tsx").map((use) => use.probe)).toEqual([
      "() => savingRef.current || scaleValue !== null || selectedTags.length > 0",
    ]);
    expect(esmSaveHold(source)).toEqual({ raisedBeforeAwait: true, clearedInFinally: true });
  });
});

// ── 가드 없는 여섯 화면의 판정 (게이트 NAV-S7-01 재확인, 2026-10-05) ─────────────
//
// /esm 하나만 올리자 게이트가 같은 모양을 다섯 화면에서 더 찾았다: [홈, 상태를 가진
// 화면 X, 위 칸] 에서 위 칸의 RedirectHome 이나 탭 루트 하드웨어 뒤로가 POP_TO 로 X 까지
// 걷어낸다. PR 이전의 replace 는 X 를 새 홈 아래에 묻어 둘 뿐이었다.
//
// 각 화면의 판정을 소스에서 꺼내(위 goHomeStopUses) 값 표에 대고 돌린다. 깨끗한 상태는
// 거짓이고(그대로 홈까지 간다), 잃을 것 하나만 있어도 참이다. 판정에서 항 하나를 빼면
// 그 항의 줄이 빨개지고, 판정이 표에 없는 이름을 읽기 시작하면 던져서 빨개진다.

/** 판정 글(화살표 함수)을 값 표에 대고 돌린다. 표에 없는 이름을 읽으면 던진다. */
function runProbe(probe: string, scope: Readonly<Record<string, unknown>>): boolean {
  // transpile 은 머리에 "use strict"; 를 붙인다 - 떼야 return 이 화살표 함수를 돌려준다.
  const js = ts
    .transpile(`(${probe})`, { target: ts.ScriptTarget.ES2020 })
    .replace(/^\s*"use strict";\s*/, "")
    .trim()
    .replace(/;$/, "");
  const make = new Function(...Object.keys(scope), `"use strict"; return ${js};`) as (...values: unknown[]) => () => unknown;
  return !!make(...Object.values(scope))();
}

interface NoGuardScreen {
  file: string;
  route: string;
  /** 잃을 것이 없는 상태. 판정이 읽는 이름 전부. */
  clean: Readonly<Record<string, unknown>>;
  /** 하나씩 clean 위에 얹는다. 하나만 있어도 멈춰야 한다. */
  holds: readonly [string, Readonly<Record<string, unknown>>][];
  /** 바뀌어도 잃을 것이 없다 - 홈까지 가야 한다. */
  free: readonly [string, Readonly<Record<string, unknown>>][];
}

const NO_GUARD_SCREENS: readonly NoGuardScreen[] = [
  {
    file: "src/app/esm.tsx",
    route: "esm",
    clean: { savingRef: { current: false }, scaleValue: null, selectedTags: [] },
    holds: [
      ["저장 요청 중", { savingRef: { current: true } }],
      ["고른 척도", { scaleValue: 3 }],
      ["고른 태그", { selectedTags: ["calm"] }],
    ],
    free: [],
  },
  {
    file: "src/app/formats.tsx",
    route: "formats",
    clean: {
      editing: null,
      adding: false,
      saving: false,
      confirmDelete: null,
      busyId: null,
      moderating: null,
      modBusy: false,
      pendingShareIds: new Set<string>(),
      toast: null,
    },
    holds: [
      ["편집 중", { editing: { id: "t1" } }],
      ["추가 중", { adding: true }],
      ["저장 요청 중", { saving: true }],
      ["삭제 확인", { confirmDelete: { id: "t1" } }],
      ["삭제 요청 중", { busyId: "t1" }],
      ["신고 · 차단 시트", { moderating: { id: "t2" } }],
      ["신고 · 차단 요청 중", { modBusy: true }],
      ["공유 요청 중", { pendingShareIds: new Set(["t1"]) }],
      ["결과 토스트", { toast: { message: "saved", tone: "success" } }],
    ],
    free: [],
  },
  {
    file: "src/app/peer/[token].tsx",
    route: "peer/[token]",
    clean: {
      busy: false,
      error: null,
      phase: "form",
      ratings: {},
      ackLlm: false,
      ackOverseas: false,
      minor: false,
      guardian: false,
      birthYear: "",
    },
    holds: [
      ["제출 · 철회 요청 중", { busy: true }],
      ["실패 안내", { error: "submitError" }],
      ["매긴 점수", { ratings: { openness: 3 } }],
      ["처리 고지 확인", { ackLlm: true }],
      ["국외 이전 확인", { ackOverseas: true }],
      ["미성년 표시", { minor: true }],
      ["보호자 동의", { guardian: true }],
      ["출생 연도", { birthYear: "1990" }],
    ],
    // 제출이 끝난 뒤의 점수는 서버에 있다. 잃을 것이 없다.
    free: [["제출 완료", { phase: "done", ratings: { openness: 3 }, ackLlm: true }]],
  },
  {
    file: "src/app/service-consent.tsx",
    route: "service-consent",
    clean: { inFlight: { current: false }, busy: false, reviewing: false, notice: null },
    holds: [
      ["저장 요청 중(ref)", { inFlight: { current: true } }],
      ["저장 요청 중", { busy: true }],
      ["검토 중", { reviewing: true }],
      ["저장 안내", { notice: "saved" }],
      ["철회 안내", { notice: "withdrawn" }],
      ["저장 실패 안내", { notice: "saveError" }],
      ["충돌 안내", { notice: "conflict" }],
    ],
    // 불러오기 실패는 '다시 불러오기' 가 되살린다.
    free: [["불러오기 실패", { notice: "loadError" }]],
  },
  {
    file: "src/app/subscription.tsx",
    route: "subscription",
    clean: { busy: false, sheet: null, notice: null },
    holds: [
      ["요청 중", { busy: true }],
      ["해지 시트", { sheet: "cancel" }],
      ["환불 시트", { sheet: "refund" }],
      ["결과 안내", { notice: { kind: "ok", key: "refundRequested" } }],
    ],
    free: [],
  },
  {
    file: "src/app/interview.tsx",
    route: "interview",
    clean: {
      busy: false,
      saving: false,
      crisis: { visible: false, hotline: "KR_109" },
      draft: "",
      turns: [{ role: "interviewer", text: "q" }],
    },
    holds: [
      ["질문 요청 중", { busy: true }],
      ["저장 요청 중", { saving: true }],
      ["안전 안내 창", { crisis: { visible: true, hotline: "KR_109" } }],
      ["쓰던 답", { draft: "그때" }],
      ["담기 전 대화", { turns: [{ role: "interviewer", text: "q" }, { role: "user", text: "a" }] }],
    ],
    // 질문만 받고 아무 답도 안 한 대화, 공백뿐인 입력은 잃을 것이 없다.
    free: [["공백 입력", { draft: "   " }]],
  },
];

/** 그 파일에서 useGoHomeStop 에 넘긴 판정. 명단의 주인이 부른 것 하나여야 한다. */
function probeOf(file: string): string {
  const uses = goHomeStopUses(readFileSync(join(ROOT, file), "utf8"), file);
  const owner = GO_HOME_STOP_USES.find((use) => use.file === file)?.owner;
  expect(uses.map((use) => use.owner)).toEqual([owner]);
  return uses[0].probe;
}

describe("가드 없는 여섯 화면은 잃을 것이 있는 동안만 홈 이동을 멈춘다 (게이트 NAV-S7-01 재확인)", () => {
  it("판정기 시야 대조: runProbe 는 표에 없는 이름을 읽으면 던진다", () => {
    expect(runProbe("() => a || b.length > 0", { a: false, b: [1] })).toBe(true);
    expect(() => runProbe("() => a || missing", { a: false })).toThrow();
  });

  it.each(NO_GUARD_SCREENS.map((screen) => [screen.file, screen] as const))(
    "%s: 깨끗하면 거짓, 잃을 것이 하나라도 있으면 참",
    (_file, screen) => {
      const probe = probeOf(screen.file);
      expect(runProbe(probe, screen.clean)).toBe(false);
      for (const [label, patch] of screen.holds) {
        expect([label, runProbe(probe, { ...screen.clean, ...patch })]).toEqual([label, true]);
      }
      for (const [label, patch] of screen.free) {
        expect([label, runProbe(probe, { ...screen.clean, ...patch })]).toEqual([label, false]);
      }
    },
  );

  const tops: readonly [string, StackRoute][] = [
    ["dev 전용 라우트의 RedirectHome", { key: "canon-k2", name: "canon" }],
    ["탭 루트(설정)의 하드웨어 뒤로", { key: "settings-k3", name: "settings" }],
  ];
  it.each(NO_GUARD_SCREENS.flatMap((screen) => tops.map(([label, top]) => [screen.route, label, screen, top] as const)))(
    "[홈, /%s, 위 칸] · %s: 실제 StackRouter 에서 잃을 것이 있으면 그 화면 앞에서 멈추고, 없으면 홈까지 간다",
    (_route, _label, screen, top) => {
      const buried: StackRoute = { key: `${screen.route}-k1`, name: screen.route };
      const state = stack(HOME, buried, top);
      // 대조군: 이름이 없으면 POP_TO 가 그 화면까지 걷는다.
      expect(keysOf(router.getStateForAction(state, POP_TO_HOME, OPTIONS))).toEqual(["index-k0"]);

      mockRootState.current = { key: "container", index: 0, routeNames: ["__root"], routes: [{ key: "__root-0", name: "__root", state }] };
      mockRoute.key = buried.key;
      const probe = probeOf(screen.file);
      let scope: Readonly<Record<string, unknown>> = { ...screen.clean, ...screen.holds[0][1] };
      useGoHomeStop(() => runProbe(probe, scope));

      goHome();
      expect(mockDismissTo).not.toHaveBeenCalled();
      expect(mockDispatch).toHaveBeenCalledTimes(1);
      expect(keysOf(router.getStateForAction(state, mockDispatch.mock.calls[0][0], OPTIONS))).toEqual(["index-k0", buried.key]);

      // 잃을 것이 없어지면 다시 홈까지 간다.
      scope = screen.clean;
      mockDispatch.mockReset();
      goHome();
      expect(mockDispatch).not.toHaveBeenCalled();
      expect(mockDismissTo).toHaveBeenCalledWith("/");
    },
  );
});

// ── 은퇴한 검사 (PR #2044 8회차, 2026-10-05) ─────────────────────────────────
//
// - "인증 화면의 하드웨어 뒤로는 포커스된 동안만 듣고 goHome 으로 간다"(게이트 NS-04 r2):
//   로그인 · 가입 화면의 하드웨어 뒤로는 사람이 누르는 홈 동작이라 PR 이전 코드(useEffect +
//   push("/"))로 되돌렸다. 지킬 성질이 없어졌다. 그 자리는 USER_HOME_NAVIGATIONS 에 있고,
//   goHome 을 다시 부르면 GO_HOME_USES 에서 빨개진다.
// - "홈 push 는 하나도 남지 않는다": 같은 이유로 push 다섯 자리(BackArrow · /audit ·
//   /esm · 인증 화면 뒤로 둘 · 가입 상단 뒤로)가 돌아왔다. 자리는 위 명단이 고정한다.
// - "D-01 이 지목한 자리들은 헬퍼로 간다": RedirectHome 자리는 GO_HOME_USES 의 정확한
//   명단으로 옮겼다. 온보딩 '홈으로' · BackArrow 는 사람이 누르는 동작이라 빠졌다.
