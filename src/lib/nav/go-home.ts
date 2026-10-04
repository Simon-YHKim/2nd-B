// 저절로 넘기는 홈은 아래의 홈으로 돌아간다 (QA 261004 D-01 · D-12).
//
// ## 왜 이 파일이 있나
//
// `router.replace("/")` · `<Redirect href="/" />` 는 홈을 하나 더 만든다.
// expo-router 56 의 REPLACE 는 현재 칸을 새 key 의 `index` 로 바꿀 뿐 스택 아래에
// 이미 있는 홈을 찾아보지 않는다(node_modules/expo-router/build/react-navigation/
// routers/StackRouter.js 의 `case 'REPLACE'`). 루트는 네이티브 스택이라 묻힌 홈도
// 마운트된 채 남는다. 홈 하나가 view 약 1,930개와 효과음 플레이어 셋을 들고 있어서,
// 안드로이드 에뮬레이터에서 리다이렉트 라우트를 열 번쯤 열자 홈이 쌓여 Java 힙
// 상한(192MB)에 닿아 앱이 죽었다(2/2 재현, 2026-10-04 QA).
//
// `router.dismissTo("/")` 는 POP_TO 다. 아래에 홈이 있으면 그 홈까지 걷어내고,
// 없으면(딥링크로 바로 들어왔거나 웹에서 새로고침한 경우) 현재 칸을 홈으로
// 바꾼다(같은 파일의 `case 'POP_TO'`).
//
// 웹: 걷어낸 칸 수만큼 브라우저 기록을 되돌린다. 되돌릴 기록이 없으면
// 앱 안에서 멈추고 replaceState 로 주소만 `/` 로 바꾼다 - 앱 밖으로 나가지
// 않는다(node_modules/expo-router/build/react-navigation/native/
// createMemoryHistory.js 의 `go()`). 새로고침·직접 진입은 스택에 칸이 하나뿐이라
// 예전 replace 와 결과가 같다.
//
// 계정이 바뀐 뒤 다시 쓰는 홈: 홈 칸(route)은 같아도 그 안의 화면은 새로
// 마운트된다. 루트 스택의 모든 제품 화면이 `AccountScope`(src/app/_layout.tsx)
// 안에 있고, 그것이 계정 epoch 를 key 로 쓰며 다른 계정으로 넘어가는 동안은
// 아예 그리지 않는다. 그래서 A 의 별 밝기가 B 에게 남지 않는다.
//
// ## 쓰는 자리는 둘뿐이다 (PR #2044 8회차, 2026-10-05)
//
// 1. 저절로 넘기는 자리: 화면이 마운트되자마자 홈으로 보내는 곳(`<RedirectHome />`).
//    DevOnlyRoute · 로그인한 사람이 연 인증 화면 · 모르는 별/영역 id · 이미 끝낸
//    온보딩. 사람이 누르지 않아도 열릴 때마다 돌기 때문에, 딥링크를 되풀이하면
//    홈이 쌓였다.
// 2. 탭 루트의 하드웨어 뒤로(D-12, DeepSpaceScreen). 예전 replace("/") 는 탭
//    루트가 홈 위에 쌓여 있을 때 홈을 하나 더 얹어서, 앱을 나가는 데 뒤로를
//    두 번 더 눌러야 했다.
//
// 사람이 누르는 홈 동작(독의 홈 · BackArrow 칩 · 화면 안 '홈으로' 버튼 · 인증
// 화면의 하드웨어 뒤로 · 저장이나 가입이 끝난 뒤의 이동)은 **일부러 쓰지 않는다** -
// PR 이전의 push/replace 그대로다. 4~7회차에 그 동작까지 걷어내는 길로 바꿨더니
// 저장 중인 화면이나 요청을 기다리는 로그인 화면을 걷어내는 새 경로가 회차마다
// 나왔다. 그리고 1단계 안드로이드 실측에서 탭 바로 홈과 설정을 오갈 때는 홈이
// 쌓이지 않았다(Views 1,949 ↔ 1,725, QA 보고 폴더 android/relaunch.md §3).
// 홈이 쌓인 원인은 자동 리다이렉트 · 반복 딥링크 · 탭 루트 하드웨어 뒤로였다.
// 쓰는 자리가 이 둘뿐인지는 go-home.test.ts 가 이름 붙인 명단으로 지킨다.
//
// ## 묻힌 화면의 가드 (게이트 NS-02, 2026-10-04)
//
// 걷어내는 길이라 사이에 묻힌 화면의 `beforeRemove` · `usePreventRemove` 가
// 끼어든다. 하나라도 막으면 동작 전체가 취소되는데 부른 쪽은 그걸 모른다:
// 확인창은 안 보이는 화면에서 열리고(아바타 팔레트), 조용히 막히고(비밀번호
// 재설정 잠금 · 계정 삭제 중), RedirectHome 은 빈 화면으로 남고, 탭 루트의
// 하드웨어 뒤로는 눌러도 아무 일이 없다. 예전 push/replace 는 묻힌 칸을 건드리지
// 않아서 이런 일이 없었다.
//
// 그래서 막을 수 있는 화면은 스스로 이름을 올린다(`useGoHomeStop`). goHome 은
// 지금 칸과 홈 사이에서 **지금 막고 있는** 가장 가까운 화면을 찾으면 홈 대신 그
// 화면까지만 걷어낸다. 그 화면이 포커스를 얻고, 다시 홈으로 가려 하면 그때 가드가
// 보이는 자리에서 묻는다. 지금 칸 자신의 가드는 예전처럼 동작한다 - 포커스된
// 화면이라 보인다. 가드를 단 화면이 이 훅을 같이 부르는지는 go-home.test.ts 가
// 지킨다.
//
// 가드가 없어도 걷히면 잃는 것이 있는 화면도 이름을 올린다(게이트 NAV-S7-01).
// /esm 은 저장 요청이 나가 있거나 고른 값이 남아 있는 동안 멈춘다 - 실패 안내를
// 띄울 자리와 고른 값이 그 화면에만 있다. 부르는 자리 전부는 같은 테스트의 명단이다.
import { useCallback, useEffect, useRef } from "react";
import { router, useFocusEffect, useNavigationContainerRef, useRoute } from "expo-router";

/** 홈 라우트. 문자열을 흩뿌리지 않으려고 하나만 둔다. */
export const HOME_HREF = "/" as const;
/** 루트 스택에서 홈 칸의 이름(src/app/index.tsx). */
export const HOME_ROUTE_NAME = "index";

// ── 내비게이션 상태의 모양 (필요한 만큼만) ─────────────────────────────────

export interface GoHomeRoute {
  key: string;
  name: string;
  state?: GoHomeNavState;
}
export interface GoHomeNavState {
  key?: string;
  type?: string;
  index?: number;
  routeNames?: readonly string[];
  routes: readonly GoHomeRoute[];
}

/** 홈으로 가는 계획: 홈까지(`home`) 또는 막는 화면 바로 위까지(`stop`). */
export type GoHomePlan =
  | { kind: "home" }
  | { kind: "stop"; target: string | undefined; count: number };

function focusedIndex(state: GoHomeNavState): number {
  return state.index ?? state.routes.length - 1;
}

/** 홈 칸이 사는 스택. expo-router 는 루트에 `__root` 칸 하나를 두고 그 아래에
 *  `_layout.tsx` 의 Stack 을 둔다. 포커스를 따라 내려가며 처음 만나는 홈 스택. */
export function findHomeStack(root: GoHomeNavState | undefined): GoHomeNavState | undefined {
  let state = root;
  while (state) {
    const hasHome = state.routeNames
      ? state.routeNames.includes(HOME_ROUTE_NAME)
      : state.routes.some((route) => route.name === HOME_ROUTE_NAME);
    if (state.type === "stack" && hasHome) return state;
    state = state.routes[focusedIndex(state)]?.state;
  }
  return undefined;
}

/** 이 칸과 그 안에 중첩된 모든 칸의 key. 중첩 스택(예: `(auth)`)의 가드도
 *  바깥 칸을 걷어낼 때 같이 불린다. */
function subtreeKeys(route: GoHomeRoute): string[] {
  const keys = [route.key];
  for (const child of route.state?.routes ?? []) keys.push(...subtreeKeys(child));
  return keys;
}

/**
 * POP_TO 홈이 걷어낼 칸 가운데 지금 막고 있는 가장 가까운 화면을 찾는다.
 *
 * 가까운 순서는 화면에 보이는 순서다: 포커스 사슬의 가장 깊은 스택에서 지금 칸
 * 바로 아래부터, 그다음 바깥 스택, 마지막으로 홈 스택의 지금 칸과 홈 사이.
 * 지금 칸(포커스 사슬) 자신은 보지 않는다 - 그 가드는 보이는 자리에서 돈다.
 * 홈이 없으면 POP_TO 는 지금 칸만 바꾸므로 홈 스택의 묻힌 칸은 걷히지 않는다.
 */
export function planGoHome(
  stack: GoHomeNavState | undefined,
  isStop: (routeKey: string) => boolean,
): GoHomePlan {
  if (!stack || stack.routes.length === 0) return { kind: "home" };
  const current = focusedIndex(stack);
  let home = -1;
  for (let i = current; i >= 0; i--) {
    if (stack.routes[i]?.name === HOME_ROUTE_NAME) {
      home = i;
      break;
    }
  }
  if (home === current) return { kind: "home" }; // 이미 홈이다. 걷어낼 것이 없다.

  // 포커스 사슬: 홈 스택 → 지금 칸 안의 중첩 스택 → … 가장 깊은 스택.
  const chain: GoHomeNavState[] = [stack];
  for (let inner = stack.routes[current]?.state; inner; inner = inner.routes[focusedIndex(inner)]?.state) {
    chain.push(inner);
  }
  for (let level = chain.length - 1; level >= 0; level--) {
    const state = chain[level];
    const top = focusedIndex(state);
    // 홈 스택은 홈 위까지만 걷힌다. 홈이 없으면 지금 칸만 바뀐다.
    const floor = level === 0 ? (home === -1 ? top : home + 1) : 0;
    for (let i = top - 1; i >= floor; i--) {
      const route = state.routes[i];
      if (route && subtreeKeys(route).some(isStop)) {
        return { kind: "stop", target: state.key, count: top - i };
      }
    }
  }
  return { kind: "home" };
}

// ── 막는 화면 명단 ──────────────────────────────────────────────────────────

type StopProbe = () => boolean;
type ContainerRef = ReturnType<typeof useNavigationContainerRef>;

const stops = new Map<string, Set<StopProbe>>();
let containerRef: ContainerRef | null = null;

/** 칸 하나를 '지금 막을 수 있는 화면' 으로 올린다. 돌려준 함수로 내린다. */
export function registerGoHomeStop(routeKey: string, probe: StopProbe): () => void {
  let set = stops.get(routeKey);
  if (!set) {
    set = new Set();
    stops.set(routeKey, set);
  }
  set.add(probe);
  return () => {
    const current = stops.get(routeKey);
    if (!current) return;
    current.delete(probe);
    if (current.size === 0) stops.delete(routeKey);
  };
}

/** 이 칸이 지금 홈으로 가는 길을 막는가. 판정이 던지면 막는 쪽으로 본다 -
 *  모르는 채로 저장 안 한 화면을 걷어내지 않는다. */
export function isGoHomeStop(routeKey: string): boolean {
  const set = stops.get(routeKey);
  if (!set) return false;
  for (const probe of set) {
    try {
      if (probe()) return true;
    } catch {
      return true;
    }
  }
  return false;
}

/**
 * 칸이 걷히는 것을 막는 화면(`beforeRemove` · `usePreventRemove`)은 같은
 * 컴포넌트에서 이것도 부른다. `isBlocking` 은 그 가드가 지금 막는 조건 그대로다
 * (ref 를 읽어도 된다 - goHome 이 부를 때 판정한다).
 */
export function useGoHomeStop(isBlocking: () => boolean): void {
  const routeKey = useRoute().key;
  // 함수 이름은 훅이지만 실제로는 모듈 하나의 ref 를 돌려줄 뿐이다
  // (node_modules/expo-router/build/hooks/useNavigationContainerRef.js).
  const ref = useNavigationContainerRef();
  const latest = useRef(isBlocking);
  useEffect(() => {
    latest.current = isBlocking;
  });
  useEffect(() => {
    containerRef = ref;
    return registerGoHomeStop(routeKey, () => latest.current());
  }, [ref, routeKey]);
}

function readRootState(ref: ContainerRef): GoHomeNavState | undefined {
  try {
    return ref.isReady() ? (ref.getRootState() as unknown as GoHomeNavState) : undefined;
  } catch {
    return undefined;
  }
}

// ── 홈으로 ─────────────────────────────────────────────────────────────────

/** 스택 아래의 홈으로 돌아간다. 홈이 없으면 지금 칸을 홈으로 바꾼다. 사이에
 *  지금 막는 화면이 있으면 그 화면까지만 돌아간다. 저절로 넘기는 자리와 탭 루트의
 *  하드웨어 뒤로만 부른다(머리 주석 "쓰는 자리는 둘뿐이다"). */
export function goHome(): void {
  const ref = containerRef;
  if (stops.size > 0 && ref) {
    const plan = planGoHome(findHomeStack(readRootState(ref)), isGoHomeStop);
    if (plan.kind === "stop") {
      // router.dismiss(n) 은 포커스된 (중첩) 스택이 먼저 받는다. 막는 화면이
      // 사는 스택을 key 로 겨눈다.
      ref.dispatch({ type: "POP", payload: { count: plan.count }, target: plan.target });
      return;
    }
  }
  router.dismissTo(HOME_HREF);
}

/**
 * `<Redirect href="/" />` 의 대체. 화면이 포커스를 얻으면 홈으로 보낸다.
 *
 * expo-router 의 `Redirect` 와 같은 자리(포커스 효과)에서 같은 방식으로
 * 실패를 삼킨다. 다른 점은 replace 대신 goHome 을 부른다는 것 하나다.
 * 링크 미리보기(iOS `Link.Preview`) 판정은 넣지 않았다 - 이 앱은 미리보기를
 * 쓰지 않고, 그 훅은 expo-router 의 공개 API 가 아니다.
 */
export function RedirectHome(): null {
  useFocusEffect(
    useCallback(() => {
      try {
        goHome();
      } catch (error) {
        console.error(error);
      }
    }, []),
  );
  return null;
}
