// 로그인된 사용자의 프로필 판정이 끝나기 전에는 제품 라우트가 열리지 않는가
// (vibe r260914 R3-A 게이트 발견, 두 번).
//
// 1. 실패(모름), PR #1811. 실패 화면이 DeepSpaceScreen 도크를 달고 있었고, 전역 C10
//    리다이렉트(IntroGate)는 `!profileProbeFailed` 일 때만 돌아서 실패 상태를 통과시켰다.
//    도크 목적지 /records · /settings · /import-hub 는 userId 만 본다.
// 2. 기다림, 그 후속(생성물 재게이트 r3a2, medium). #1811 은 실패만 붙들었다. 인트로를 이미 본
//    탭에서 로그인 세션을 복원하며 /records 를 열면 AuthContext 가 첫 프로브 전에
//    `{ userId, loading: true, hasProfile: null }` 을 게시하고, IntroGate 의 `introDone` 갈래가
//    그대로 자식을 그렸다. Records 의 조회 effect 는 userId 만 봐서 프로필 없음 · 연령 · 동의
//    판정 전에 본인 기록을 읽었다.
//
// 판정은 profileRouteHold 하나다. 실패는 "retry"(공용 다시 시도), 로그인된 사용자의 기다림은
// "loading"(로더)이다. 두 갈래를 합치지 않는다. 합쳤더니 다시 물을 사람이 없는 화면이 끝없이
// 기다렸다(profile-probe.ts). 세션 주인이 아직 없는 부트스트랩과 로그아웃은 붙들지 않는다.
//
// 두 자리가 부른다. IntroGate 가 트리 전체를, ThemedStack screenLayout 의 ProfileProbeScope 가
// 장면 하나하나를 붙든다. IntroGate 가 읽는 경로(useSegments)는 네비게이터가 커밋한 뒤에야
// 바뀌어서, 예외 라우트((auth) · onboarding)에서 나간 장면은 한 커밋 동안 IntroGate 의 예외를 탄다.
//
// 컴포넌트 렌더 테스트가 막혀 있어(RN 0.85 upstream) 실제 소스에서 IntroGate · ProfileProbeScope ·
// AccountScope · screenLayout 과 Records 화면의 조회 effect 를 AST 로 뽑아 대역 훅으로 실행한다.
// 대역은 반환 트리와 effect 를 관찰할 뿐이고 네이티브 네비게이터를 돌리지는 않는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as vm from "node:vm";
import * as ts from "typescript";

import * as profileProbe from "../../lib/auth/profile-probe";
import {
  PROFILE_GATE_EXEMPT_SEGMENTS,
  profileGate,
  profileRouteHold,
  type ProfileGate,
  type ProfileGateSnapshot,
  type ProfileRouteHold,
} from "../../lib/auth/profile-probe";

const ROOT = process.cwd();

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, readFileSync(join(ROOT, file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function find<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const out: T[] = [];
  const visit = (node: ts.Node): void => {
    if (predicate(node)) out.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return out;
}

function only<T>(matches: T[], what: string): T {
  if (matches.length !== 1) throw new Error(`expected exactly one ${what}, found ${matches.length}`);
  return matches[0];
}

const containsIdentifier = (node: ts.Node, name: string): boolean =>
  find(node, (candidate): candidate is ts.Identifier => ts.isIdentifier(candidate) && candidate.text === name).length > 0;

const isCallTo =
  (name: string) =>
  (node: ts.Node): node is ts.CallExpression =>
    ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name;

function functionDeclaration(sf: ts.SourceFile, name: string): ts.FunctionDeclaration {
  return only(
    find(sf, (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name),
    `${sf.fileName} function ${name}`,
  );
}

function toJs(code: string): string {
  return ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
}

// ── AuthContext 가 실제로 게시하는 스냅샷 ─────────────────────────────────────

const AUTH_CONTEXT = parse("src/lib/auth/AuthContext.tsx");

type Publication = ProfileGateSnapshot & { isMinor: boolean | null; age: number | null; sessionUnavailable: boolean };

const objectLiteralArguments = (calls: ts.CallExpression[]): ts.ObjectLiteralExpression[] =>
  calls.flatMap((call) => {
    const [argument] = call.arguments;
    return argument !== undefined && ts.isObjectLiteralExpression(argument) ? [argument] : [];
  });

function property(literal: ts.ObjectLiteralExpression, name: string): string | undefined {
  for (const entry of literal.properties) {
    if (ts.isPropertyAssignment(entry) && entry.name.getText(AUTH_CONTEXT) === name) {
      return entry.initializer.getText(AUTH_CONTEXT);
    }
    if (ts.isShorthandPropertyAssignment(entry) && entry.name.text === name) return name;
  }
  return undefined;
}

const publish = (literal: ts.ObjectLiteralExpression, scope: Record<string, unknown>): Publication =>
  vm.runInNewContext(toJs(`(${literal.getText(AUTH_CONTEXT)})`), scope) as Publication;

const resolveSession = functionDeclaration(AUTH_CONTEXT, "resolveSession");
/** 이미 확인한 같은 사용자의 갈래. 캐시를 게시하고 조용히 다시 묻는다. */
const sameUserBranch = only(
  find(
    resolveSession,
    (node): node is ts.IfStatement =>
      ts.isIfStatement(node) &&
      containsIdentifier(node.expression, "lastUserIdRef") &&
      containsIdentifier(node.expression, "lastProbe"),
  ),
  "same-user branch in resolveSession",
);
const inside = (node: ts.Node, outer: ts.Node): boolean => node.pos >= outer.pos && node.end <= outer.end;

/** 이 사용자를 처음 확인할 때 프로브 전에 게시하는 스냅샷. 게이트 보고서의 재현 상태다. */
const FIRST_PROBE = publish(
  only(
    objectLiteralArguments(find(resolveSession, isCallTo("setState"))).filter(
      (literal) => !inside(literal, sameUserBranch) && property(literal, "loading") === "true",
    ),
    "loading:true publication in resolveSession",
  ),
  { userId: "user-a" },
);

/** AuthProvider 의 첫 상태. 세션을 읽기 전이라 주인이 없다. */
const BOOTSTRAP = publish(
  only(
    objectLiteralArguments(find(functionDeclaration(AUTH_CONTEXT, "AuthProvider"), isCallTo("useState"))).filter(
      (literal) => property(literal, "loading") !== undefined,
    ),
    "AuthProvider initial auth state",
  ),
  {},
);

const CACHED_ADULT = { hasProfile: true, isMinor: false, age: 30 };
/** 같은 사용자 갈래의 캐시 게시와 재조회 게시. */
const SAME_USER = objectLiteralArguments(find(sameUserBranch.thenStatement, isCallTo("setState"))).map((literal) =>
  publish(literal, { userId: "user-a", lastProbe: CACHED_ADULT, refreshed: CACHED_ADULT }),
);
/** refresh() 가 로그인된 사용자에게 하는 게시(다시 시도 · 프로필 완료 뒤). */
const REFRESH = objectLiteralArguments(
  find(
    only(
      find(
        AUTH_CONTEXT,
        (node): node is ts.VariableDeclaration =>
          ts.isVariableDeclaration(node) && node.name.getText(AUTH_CONTEXT) === "refresh",
      ),
      "const refresh",
    ),
    isCallTo("setState"),
  ),
)
  .filter((literal) => property(literal, "userId") !== "null")
  .map((literal) => publish(literal, { uid: "user-a", probe: CACHED_ADULT }));

const PROFILE_LOADING: ProfileGateSnapshot = { loading: false, userId: "user-a", hasProfile: null, profileProbeFailed: false };
const READY_ADULT = { loading: false, userId: "user-a", hasProfile: true, profileProbeFailed: false, isMinor: false };
const FAILED: ProfileGateSnapshot = { loading: false, userId: "user-a", hasProfile: false, profileProbeFailed: true };
const NO_PROFILE: ProfileGateSnapshot = { loading: false, userId: "user-a", hasProfile: false, profileProbeFailed: false };
const SIGNED_OUT: ProfileGateSnapshot = { loading: false, userId: null, hasProfile: null, profileProbeFailed: false };

// ── 대역: JSX · 훅 ───────────────────────────────────────────────────────────

type Props = { children?: unknown; [key: string]: unknown };
interface Element {
  type: unknown;
  props: Props;
}

const FRAGMENT = { fragment: true };

/** 이 테스트가 안을 들여다보지 않는 컴포넌트. 이름과 props 만 남긴다. */
const host = (name: string) => ({ host: name });

function createElement(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): Element {
  const next: Props = { ...(props ?? {}) };
  if (children.length === 1) next.children = children[0];
  else if (children.length > 1) next.children = children;
  return { type, props: next };
}

interface AuthView extends ProfileGateSnapshot {
  recoveryReady: boolean;
  recoveryUserId: string | null;
  recoveryPendingGlobal: boolean;
  storageRecoveryRequired: boolean;
}

const SETTLED_RECOVERY = {
  recoveryReady: true,
  recoveryUserId: null,
  recoveryPendingGlobal: false,
  storageRecoveryRequired: false,
};

/** 대역 훅이 읽는 현재 상태. mount() 가 매번 채운다. */
const world: { auth: AuthView; segments: string[]; pathname: string; introDone: boolean; effects: (() => unknown)[] } = {
  auth: { ...BOOTSTRAP, ...SETTLED_RECOVERY },
  segments: [],
  pathname: "/",
  introDone: true,
  effects: [],
};

const LAYOUT = parse("src/app/_layout.tsx");

const layout = vm.createContext({
  React: { createElement, Fragment: FRAGMENT },
  Fragment: FRAGMENT,
  InlineLoader: host("InlineLoader"),
  LoadingScreen: host("LoadingScreen"),
  ProfileProbeRetryScreen: host("ProfileProbeRetryScreen"),
  EncryptedStorageRecoveryGate: host("EncryptedStorageRecoveryGate"),
  Redirect: host("Redirect"),
  ...profileProbe,
  useAuth: () => world.auth,
  useSegments: () => world.segments,
  usePathname: () => world.pathname,
  useState: (initial: unknown) => [typeof initial === "function" ? (initial as () => unknown)() : initial, () => undefined],
  useEffect: (effect: () => unknown) => {
    world.effects.push(effect);
  },
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  subscribeAccountTransition: () => () => undefined,
  accountTransitionSnapshot: () => "settled",
  accountTransitionPendingFromSnapshot: () => false,
  accountEpochFromSnapshot: () => 1,
  introAlreadyPlayed: () => world.introDone,
  introAlreadyPlayedNative: async () => world.introDone,
  markIntroPlayed: () => undefined,
});
for (const name of ["IntroGate", "ProfileProbeScope", "AccountScope"]) {
  vm.runInContext(toJs(functionDeclaration(LAYOUT, name).getText(LAYOUT)), layout);
}
const IntroGate = layout.IntroGate as (props: Props) => unknown;

/** ThemedStack 이 <Stack screenLayout> 에 넘기는 함수. 장면마다 이걸 지난다. */
const screenLayout = (() => {
  const attribute = only(
    find(LAYOUT, (node): node is ts.JsxAttribute => ts.isJsxAttribute(node) && node.name.getText(LAYOUT) === "screenLayout"),
    "<Stack screenLayout>",
  );
  const initializer = attribute.initializer;
  if (!initializer || !ts.isJsxExpression(initializer) || !initializer.expression) {
    throw new Error("screenLayout must be an inline expression");
  }
  return vm.runInContext(toJs(`(${initializer.expression.getText(LAYOUT)})`), layout) as (args: {
    children: unknown;
    route: { name: string };
  }) => Element;
})();

/** /records 가 그리는 DeepSpaceRecordsScreen 의 조회 effect. authLoading 은 안 보고 userId 만 본다. */
const RECORDS = parse("src/screens/deepspace/dds-wiki-records-screens.tsx");
const RECORDS_LOAD = toJs(
  `(${only(
    find(functionDeclaration(RECORDS, "DeepSpaceRecordsScreen"), isCallTo("useEffect")).filter(
      (call) => call.arguments.length > 0 && containsIdentifier(call.arguments[0], "listRecentRecords"),
    ),
    "records-load useEffect in DeepSpaceRecordsScreen",
  ).arguments[0].getText(RECORDS)})`,
);

interface Reads {
  records: string[];
  sources: string[];
}

function recordsScene(reads: Reads) {
  return function RecordsScene(): null {
    const { userId, loading: authLoading } = world.auth;
    const load = vm.runInNewContext(RECORDS_LOAD, {
      userId,
      authLoading,
      reloadKey: 0,
      setLoading: () => undefined,
      setLoadError: () => undefined,
      setRecords: () => undefined,
      listRecentRecords: async (id: string) => {
        reads.records.push(id);
        return [];
      },
      listSourcePieces: async (id: string) => {
        reads.sources.push(id);
        return [];
      },
    }) as () => unknown;
    world.effects.push(load);
    return null;
  };
}

/** (auth) · onboarding 자리의 장면. 조회는 없고 마운트됐는지만 본다. */
function ExemptScene(): null {
  return null;
}

interface Mounted {
  /** 실행된 함수 컴포넌트, 바깥부터. */
  components: string[];
  /** 그려진 대역 컴포넌트, 바깥부터. */
  hosts: { name: string; props: Props }[];
  reads: Reads;
}

function render(node: unknown, out: Mounted): void {
  if (node === null || node === undefined || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) render(child, out);
    return;
  }
  const element = node as Element;
  if (element.type === FRAGMENT) {
    render(element.props.children, out);
    return;
  }
  if (typeof element.type === "function") {
    const component = element.type as (props: Props) => unknown;
    out.components.push(component.name);
    render(component(element.props), out);
    return;
  }
  const name = (element.type as { host?: string }).host;
  if (name === undefined) throw new Error("unexpected element type");
  out.hosts.push({ name, props: element.props });
  render(element.props.children, out);
}

const names = (mounted: Mounted): string[] => mounted.hosts.map((entry) => entry.name);

interface Route {
  segments: string[];
  pathname: string;
  /** 네비게이터가 이 장면에 넘기는 라우트 이름. */
  name: string;
}

const RECORDS_ROUTE: Route = { segments: ["records"], pathname: "/records", name: "records" };
const SIGN_IN: Route = { segments: ["(auth)", "sign-in"], pathname: "/sign-in", name: "(auth)" };
const ONBOARDING: Route = { segments: ["onboarding"], pathname: "/onboarding", name: "onboarding" };
const RESET_PASSWORD: Route = { segments: ["(auth)", "reset-password"], pathname: "/reset-password", name: "(auth)" };
/** 로그인 화면에서 /records 로 나간 한 커밋. 네비게이터는 장면을 커밋했고 IntroGate 는 아직 (auth) 를 본다. */
const LEAVING_SIGN_IN_FOR_RECORDS: Route = { ...SIGN_IN, name: "records" };

/** RootLayout 처럼 IntroGate 안에 장면 하나와 겹층(탭 바)을 두고 마운트한 뒤 effect 를 돌린다. */
async function mount({
  auth,
  route,
  introDone = true,
  scene = "records",
}: {
  auth: ProfileGateSnapshot & Partial<AuthView>;
  route: Route;
  introDone?: boolean;
  scene?: "records" | "exempt";
}): Promise<Mounted> {
  world.auth = { ...SETTLED_RECOVERY, ...auth };
  world.segments = route.segments;
  world.pathname = route.pathname;
  world.introDone = introDone;
  world.effects = [];
  const out: Mounted = { components: [], hosts: [], reads: { records: [], sources: [] } };
  const screen = createElement(scene === "records" ? recordsScene(out.reads) : ExemptScene, null);
  render(
    createElement(
      IntroGate,
      null,
      screenLayout({ children: screen, route: { name: route.name } }),
      createElement(host("AppTabBar"), null),
    ),
    out,
  );
  for (const effect of world.effects) effect();
  await new Promise((resolve) => setTimeout(resolve, 0));
  return out;
}

const SCENE_MOUNTED = ["IntroGate", "ProfileProbeScope", "AccountScope", "RecordsScene"];

describe("profileRouteHold - 무엇을 그릴지 한 곳에서 정한다", () => {
  // 도크가 열던 목적지와 홈 · 대화 · 가져오기. undefined 는 "/"(index)다. useSegments() 가
  // 빈 배열을 준다. 장면 쪽은 라우트 이름 "index" 로 온다.
  const FEATURE_SEGMENTS: (string | undefined)[] = [
    undefined,
    "index",
    "records",
    "settings",
    "import-hub",
    "import",
    "capture",
    "secondb",
    "interview",
    "account",
    "call-reflection",
    "community",
    "+not-found",
  ];

  const TABLE: { label: string; snapshot: ProfileGateSnapshot; gate: ProfileGate; hold: ProfileRouteHold }[] = [
    { label: "첫 프로브 전 게시(AuthContext 소스)", snapshot: FIRST_PROBE, gate: "auth-loading", hold: "loading" },
    { label: "프로필 답을 기다림", snapshot: PROFILE_LOADING, gate: "profile-loading", hold: "loading" },
    { label: "프로브 실패", snapshot: FAILED, gate: "profile-error", hold: "retry" },
    { label: "확인된 프로필", snapshot: READY_ADULT, gate: "ready", hold: "none" },
    { label: "서버가 답한 프로필 없음(C10 리다이렉트 몫)", snapshot: NO_PROFILE, gate: "profile-incomplete", hold: "none" },
    { label: "부트스트랩(AuthProvider 첫 상태, 주인 없음)", snapshot: BOOTSTRAP, gate: "auth-loading", hold: "none" },
    { label: "로그아웃", snapshot: SIGNED_OUT, gate: "signed-out", hold: "none" },
  ];

  test.each(TABLE)("$label: $gate 이면 기능 라우트는 $hold, 예외 라우트는 none", ({ snapshot, gate, hold }) => {
    expect(profileGate(snapshot)).toBe(gate);
    for (const segment of FEATURE_SEGMENTS) expect(profileRouteHold(snapshot, segment)).toBe(hold);
    for (const segment of PROFILE_GATE_EXEMPT_SEGMENTS) expect(profileRouteHold(snapshot, segment)).toBe("none");
  });

  test("예외는 가입을 마치는 (auth) 와 읽기 전용 onboarding 둘뿐이다", () => {
    expect([...PROFILE_GATE_EXEMPT_SEGMENTS].sort()).toEqual(["(auth)", "onboarding"]);
  });
});

describe("로그인된 사용자의 답을 기다리는 동안 /records 는 마운트되지 않는다", () => {
  const WAITING = [
    { label: "첫 프로브 전(auth-loading)", auth: FIRST_PROBE as ProfileGateSnapshot },
    { label: "profile-loading", auth: PROFILE_LOADING },
  ];

  test.each(WAITING)("$label, 인트로를 본 탭: 트리 전체가 로더이고 Records 조회는 0회다", async ({ auth }) => {
    const mounted = await mount({ auth, route: RECORDS_ROUTE });
    expect(mounted.reads).toEqual({ records: [], sources: [] });
    expect(mounted.components).toEqual(["IntroGate"]);
    expect(names(mounted)).toEqual(["InlineLoader"]);
  });

  test.each(WAITING)("$label, 인트로 전: 인트로가 로더 자리를 맡고 자식은 없다", async ({ auth }) => {
    const mounted = await mount({ auth, route: RECORDS_ROUTE, introDone: false });
    expect(names(mounted)).toEqual(["LoadingScreen"]);
    expect(mounted.components).toEqual(["IntroGate"]);
    expect(mounted.reads.records).toEqual([]);
  });

  test.each(WAITING)("$label, 로그인 화면에서 나간 한 커밋: 장면이 스스로 로더를 그린다", async ({ auth }) => {
    const mounted = await mount({ auth, route: LEAVING_SIGN_IN_FOR_RECORDS });
    expect(mounted.reads).toEqual({ records: [], sources: [] });
    expect(mounted.components).toEqual(["IntroGate", "ProfileProbeScope"]);
    expect(names(mounted)).toEqual(["InlineLoader", "AppTabBar"]);
  });

  test("대조군: 확인된 성인은 그대로 마운트되고 Records 가 본인 기록을 읽는다", async () => {
    for (const route of [RECORDS_ROUTE, LEAVING_SIGN_IN_FOR_RECORDS]) {
      const mounted = await mount({ auth: READY_ADULT, route });
      expect(mounted.components).toEqual(SCENE_MOUNTED);
      expect(names(mounted)).toEqual(["AppTabBar"]);
      expect(mounted.reads).toEqual({ records: ["user-a"], sources: ["user-a"] });
    }
  });

  test("실패(모름)는 로더가 아니라 다시 시도다: 트리 전체와 장면 모두 (#1811)", async () => {
    const whole = await mount({ auth: FAILED, route: RECORDS_ROUTE });
    expect(names(whole)).toEqual(["ProfileProbeRetryScreen"]);
    const scene = await mount({ auth: FAILED, route: LEAVING_SIGN_IN_FOR_RECORDS });
    expect(names(scene)).toEqual(["ProfileProbeRetryScreen", "AppTabBar"]);
    expect([...whole.reads.records, ...scene.reads.records]).toEqual([]);
  });
});

describe("세션 주인이 없어도 콜드 스타트 오프닝이 먼저다", () => {
  test("오프닝 완료 상태는 영구 저장하지 않고 현재 앱 실행에만 둔다", () => {
    const source = LAYOUT.getFullText();
    expect(source).toContain("let introPlayedThisRuntime = false;");
    expect(source).not.toContain("sessionStorage");
    expect(source).not.toContain("introAlreadyPlayedNative");
  });

  test("부트스트랩, 인트로를 본 탭: 자식을 그리고 Records 는 userId 가 없어 읽지 않는다", async () => {
    const mounted = await mount({ auth: BOOTSTRAP, route: RECORDS_ROUTE });
    expect(mounted.components).toEqual(SCENE_MOUNTED);
    expect(names(mounted)).toEqual(["AppTabBar"]);
    expect(mounted.reads.records).toEqual([]);
  });

  test("부트스트랩, 인트로 전: 인트로가 준비 전(ready=false)으로 돈다", async () => {
    const mounted = await mount({ auth: BOOTSTRAP, route: RECORDS_ROUTE, introDone: false });
    expect(mounted.hosts).toEqual([{ name: "LoadingScreen", props: expect.objectContaining({ ready: false }) }]);
  });

  test("로그아웃 콜드 스타트: 로그인 화면보다 준비 완료 오프닝을 먼저 그린다", async () => {
    const mounted = await mount({ auth: SIGNED_OUT, route: SIGN_IN, introDone: false, scene: "exempt" });
    expect(mounted.hosts).toEqual([
      { name: "LoadingScreen", props: expect.objectContaining({ ready: true }) },
    ]);
    expect(mounted.components).toEqual(["IntroGate"]);
  });

  test("인증 복구가 진행 중이면 오프닝이 그 로딩 시간을 흡수한다", async () => {
    const mounted = await mount({
      auth: { ...BOOTSTRAP, recoveryReady: false },
      route: SIGN_IN,
      introDone: false,
      scene: "exempt",
    });
    expect(mounted.hosts).toEqual([
      { name: "LoadingScreen", props: expect.objectContaining({ ready: false }) },
    ]);
    expect(mounted.components).toEqual(["IntroGate"]);
  });

  test("이번 실행에서 오프닝을 마친 뒤에는 로그인 화면을 그대로 그린다", async () => {
    const mounted = await mount({ auth: SIGNED_OUT, route: SIGN_IN, introDone: true, scene: "exempt" });
    expect(mounted.components).toEqual(["IntroGate", "ProfileProbeScope", "AccountScope", "ExemptScene"]);
    expect(mounted.reads.records).toEqual([]);
  });
});

describe("예외와 우선순위는 그대로다", () => {
  const PENDING_OR_FAILED: ProfileGateSnapshot[] = [FIRST_PROBE, PROFILE_LOADING, FAILED];

  test.each([
    { label: "(auth)", route: SIGN_IN },
    { label: "onboarding", route: ONBOARDING },
  ])("$label 장면은 답을 기다리는 중에도 실패여도 그대로 그린다", async ({ route }) => {
    for (const auth of PENDING_OR_FAILED) {
      const mounted = await mount({ auth, route, scene: "exempt" });
      expect(mounted.components).toEqual(["IntroGate", "ProfileProbeScope", "AccountScope", "ExemptScene"]);
      expect(names(mounted)).toEqual(["AppTabBar"]);
    }
  });

  test("비밀번호 재설정이 붙들기보다 먼저다: 복구 세션은 로더도 다시 시도도 아닌 /reset-password 로 간다", async () => {
    const recoveries: Partial<AuthView>[] = [{ recoveryUserId: "user-a" }, { recoveryPendingGlobal: true }];
    for (const auth of PENDING_OR_FAILED) {
      for (const recovery of recoveries) {
        const away = await mount({ auth: { ...auth, ...recovery }, route: RECORDS_ROUTE });
        expect(away.hosts).toEqual([{ name: "Redirect", props: { href: "/reset-password" } }]);
        const onReset = await mount({ auth: { ...auth, ...recovery }, route: RESET_PASSWORD, scene: "exempt" });
        expect(onReset.components).toEqual(["IntroGate", "ProfileProbeScope", "AccountScope", "ExemptScene"]);
      }
    }
  });

  test("저장소 복구와 복구 준비 대기는 그보다도 먼저다", async () => {
    for (const auth of PENDING_OR_FAILED) {
      const storage = await mount({ auth: { ...auth, storageRecoveryRequired: true }, route: RECORDS_ROUTE });
      expect(names(storage)).toEqual(["EncryptedStorageRecoveryGate"]);
      const notReady = await mount({ auth: { ...auth, recoveryReady: false }, route: RECORDS_ROUTE });
      expect(names(notReady)).toEqual(["InlineLoader"]);
    }
  });
});

describe("같은 사용자 재조회는 로더로 바뀌지 않는다 (AuthContext 같은 사용자 갈래 · refresh)", () => {
  test("캐시 게시 · 조용한 재조회 · refresh 게시는 loading=false 이고 /records 가 마운트된 채다", async () => {
    const publications = [...SAME_USER, ...REFRESH];
    expect(publications).toHaveLength(3);
    for (const snapshot of publications) {
      expect(snapshot).toMatchObject({ userId: "user-a", loading: false, hasProfile: true, profileProbeFailed: false });
      const mounted = await mount({ auth: snapshot, route: RECORDS_ROUTE });
      expect(mounted.components).toEqual(SCENE_MOUNTED);
      expect(names(mounted)).toEqual(["AppTabBar"]);
    }
  });

  test("resolveSession 이 프로브 전에 게시하는 스냅샷은 게이트 보고서의 재현 상태와 같다", () => {
    expect(FIRST_PROBE).toEqual({
      userId: "user-a",
      hasProfile: null,
      isMinor: null,
      age: null,
      profileProbeFailed: false,
      sessionUnavailable: false,
      loading: true,
    });
  });
});
