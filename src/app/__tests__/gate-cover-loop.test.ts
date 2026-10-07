// R2A-01 (QA 2026-10-05): a root gate's hold must not feed back into its own input.
//
// 증상: 로그아웃 상태에서 앱이 켜진 채 외부 링크로 /sign-in(또는 /avatar-studio)을 연 뒤
// 로그인하면, 약 3초 뒤 "Maximum update depth exceeded" 로 앱 전체가 흰 화면에서 멈췄다
// (1단계 재현 4/4, logcat "at Content … ExpoRoot"). 검증 단계가 원인을 순수 시뮬레이션으로
// 짚었다(E:/Coding Infra/reports/qa-legacy-261004/round2/verify-R2A-01/tools/simulate.mjs,
// 1단계 실측 12건과 12/12 일치). 이 파일은 그 시뮬레이션을 옮긴 것이다.
//
// 고리는 이렇게 돈다.
//   1. 게이트가 붙들 때 자식 대신 로더를 돌려주면 루트 Stack 이 언마운트되고, 루트 슬롯
//      (__root) 의 state 가 지워진다.
//   2. state 가 없으면 expo-router 의 getRouteInfoFromState 는 __root.params.screen 에서
//      segments 를 만든다. 거기에는 이미 소비된 마지막 딥링크가 그대로 남아 있다.
//   3. 그 링크가 게이트 예외((auth) · onboarding · avatar-studio)면 판정이 풀리고, Stack 이
//      초기 경로("/")로 다시 마운트되고, 다시 붙들고, … 렌더마다 판정이 뒤집힌다.
//
// 그래서 고친 방향은 예외 목록이 아니라 구조다: 붙들기는 라우트 트리를 덮을 뿐 내리지 않는다
// (components/ui/GateCover.tsx). 트리가 마운트돼 있으면 segments 는 늘 살아 있는 네비게이터에서
// 오고, 같은 입력은 같은 판정을 낸다.
//
// (auth) 그룹의 다른 화면(oauth-callback · reset-password · sign-up · complete-profile)도 예외라
// 같은 조건이다. 네이티브 비밀번호 재설정 메일은 브리지를 거쳐 secondbrain:///reset-password 로
// 들어온다(lib/supabase/auth.ts NATIVE_AUTH_BRIDGE_TARGETS). 네이티브 OAuth 의 앱 복귀 주소는
// "/"(예외 아님)지만, 그 주소가 라우터에 딥링크로 전달되지 않으면 앞선 /sign-in 링크가 남는다.
// 구조로 고쳤으므로 어느 링크로 들어왔는지와 무관하다. 아래 LINKS 가 그 경우들을 다 돈다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";

import { avatarFirstRunDecision, type AvatarFirstRunSnapshot } from "@/lib/avatar/first-run-store";
import { profileRouteHold, type ProfileGateSnapshot } from "@/lib/auth/profile-probe";

// expo-router 의 경로 계산은 react-native 의 Platform 하나만 쓴다(Flow 소스는 node 에서 못 읽는다).
jest.mock("react-native", () => ({
  Platform: { OS: "android", select: (o: Record<string, unknown>) => o.android ?? o.native ?? o.default },
}));

const { getRouteInfoFromState } = require("expo-router/build/global-state/getRouteInfoFromState") as {
  getRouteInfoFromState: (state: unknown) => { segments: string[] };
};

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");

// ── 모델: 루트 슬롯에 남은 딥링크 params ──────────────────────────────────────

/**
 * 네이티브 딥링크가 루트에 보내는 NAVIGATE 의 params (vendored getActionFromState 출력,
 * verify-R2A-01/logs/action-shape.txt). StackRouter 는 같은 이름의 __root 를 재사용하며
 * params 를 통째로 바꾸므로, 링크가 소비된 뒤에도 이 값이 __root 에 남는다.
 */
const LINKS: Record<string, Record<string, unknown> | undefined> = {
  "/sign-in": { initial: true, screen: "(auth)", params: { initial: true, screen: "sign-in", path: "/sign-in" }, pop: true },
  "/sign-up": { initial: true, screen: "(auth)", params: { initial: true, screen: "sign-up", path: "/sign-up" }, pop: true },
  "/reset-password": {
    initial: true,
    screen: "(auth)",
    params: { initial: true, screen: "reset-password", path: "/reset-password" },
    pop: true,
  },
  "/oauth-callback": {
    initial: true,
    screen: "(auth)",
    params: { initial: true, screen: "oauth-callback", path: "/oauth-callback" },
    pop: true,
  },
  "/onboarding": { initial: true, screen: "onboarding", path: "/onboarding" },
  "/avatar-studio": { initial: true, screen: "avatar-studio", path: "/avatar-studio" },
  "/ledger": { initial: true, screen: "ledger", path: "/ledger" },
  "/star/career": { initial: true, screen: "star/[domain]", path: "/star/career", params: { domain: "career" } },
  "(링크 없음)": undefined,
};
/** 두 게이트가 다 예외로 두는 화면의 링크: (auth) 그룹 넷과 onboarding. */
const PROFILE_EXEMPT_LINKS = ["/sign-in", "/sign-up", "/reset-password", "/oauth-callback", "/onboarding"];
/** 1단계에서 앱이 멈춘 링크(크래시 a · rp2 · rp5 = sign-in, rp6 = avatar-studio) 와 같은 갈래. */
const AVATAR_EXEMPT_LINKS = [...PROFILE_EXEMPT_LINKS, "/avatar-studio"];

/** 로그인 화면의 Redirect "/" 뒤. 마운트돼 있으면 Stack 은 index 에 있다. */
function rootState(params: Record<string, unknown> | undefined, routesMounted: boolean) {
  return routesMounted
    ? { index: 0, routes: [{ name: "__root", key: "r", params, state: { index: 0, routes: [{ name: "index", key: "i" }] } }] }
    : { index: 0, routes: [{ name: "__root", key: "r", params }] };
}

const segmentOf = (params: Record<string, unknown> | undefined, routesMounted: boolean): string | undefined =>
  getRouteInfoFromState(rootState(params, routesMounted)).segments[0];

type Hold = "hold" | "pass";

/**
 * 게이트를 다시 그리기를 되풀이한다. 매 렌더의 판정이 다음 렌더에서 라우트가 마운트돼 있는지를
 * 정하고(mountsRoutes), 그게 다시 segments 를 정한다. 같은 상태로 돌아오면 멈춘 것이다.
 */
function settle(
  params: Record<string, unknown> | undefined,
  decide: (segment: string | undefined) => Hold,
  mountsRoutes: (hold: Hold) => boolean,
): { settled: boolean; trail: string[] } {
  let mounted = true;
  const trail: string[] = [];
  for (let render = 0; render < 8; render += 1) {
    const segment = segmentOf(params, mounted);
    const hold = decide(segment);
    trail.push(`${mounted ? "mounted" : "unmounted"}:${segment ?? "/"}:${hold}`);
    const next = mountsRoutes(hold);
    if (next === mounted) return { settled: true, trail };
    mounted = next;
  }
  return { settled: false, trail };
}

/** 고치기 전 구조: 붙들면 자식 대신 로더를 돌려줘 라우트가 내려간다. */
const UNMOUNT_ON_HOLD = (hold: Hold) => hold === "pass";
/** 고친 구조: 붙들기는 덮개다. 라우트는 늘 마운트돼 있다. */
const COVER_ON_HOLD = () => true;

const AVATAR_LOADING: AvatarFirstRunSnapshot = { userId: "u1", status: "loading" };
const avatarGate = (segment: string | undefined): Hold =>
  avatarFirstRunDecision("u1", true, segment, AVATAR_LOADING) === "allow" ? "pass" : "hold";

const PROFILE_FAILED: ProfileGateSnapshot = { loading: false, userId: "u1", hasProfile: false, profileProbeFailed: true };
const PROFILE_LOADING: ProfileGateSnapshot = { loading: true, userId: "u1", hasProfile: null, profileProbeFailed: false };
const profileGate = (snapshot: ProfileGateSnapshot) => (segment: string | undefined): Hold =>
  profileRouteHold(snapshot, segment) === "none" ? "pass" : "hold";

const GATES: { label: string; decide: (segment: string | undefined) => Hold; exemptLinks: string[] }[] = [
  { label: "AvatarSetupGate · 아바타 첫 조회 중", decide: avatarGate, exemptLinks: AVATAR_EXEMPT_LINKS },
  { label: "IntroGate · 첫 프로필 프로브 실패(retry)", decide: profileGate(PROFILE_FAILED), exemptLinks: PROFILE_EXEMPT_LINKS },
  { label: "IntroGate · 프로필 답 대기(loading)", decide: profileGate(PROFILE_LOADING), exemptLinks: PROFILE_EXEMPT_LINKS },
];

describe("R2A-01 모델: 붙들기가 라우트를 내리면 판정이 렌더마다 뒤집힌다", () => {
  test("전제(expo-router 56): 라우트가 내려가면 segments 는 남은 딥링크에서 온다", () => {
    expect(segmentOf(LINKS["/sign-in"], true)).toBeUndefined();
    expect(segmentOf(LINKS["/sign-in"], false)).toBe("(auth)");
    expect(segmentOf(LINKS["/avatar-studio"], false)).toBe("avatar-studio");
    expect(segmentOf(LINKS["/ledger"], false)).toBe("ledger");
  });

  test.each(GATES)("$label: 예외 화면 링크 뒤 고치기 전 구조는 멈추지 않는다 (대조군)", ({ decide, exemptLinks }) => {
    for (const link of exemptLinks) {
      const run = settle(LINKS[link], decide, UNMOUNT_ON_HOLD);
      expect({ link, settled: run.settled }).toEqual({ link, settled: false });
      expect(run.trail.slice(0, 2)).toEqual(["mounted:/:hold", `unmounted:${segmentOf(LINKS[link], false)}:pass`]);
    }
  });

  test.each(GATES)("$label: 덮개 구조는 모든 링크에서 첫 렌더에 멈추고 붙든 채로 있다", ({ decide }) => {
    for (const [link, params] of Object.entries(LINKS)) {
      const run = settle(params, decide, COVER_ON_HOLD);
      expect({ link, ...run }).toEqual({ link, settled: true, trail: ["mounted:/:hold"] });
    }
  });

  test.each(GATES)("$label: 예외가 아닌 링크(1단계 정상 사례와 같은 갈래)는 고치기 전에도 멈췄다", ({ decide, exemptLinks }) => {
    for (const link of Object.keys(LINKS).filter((key) => !exemptLinks.includes(key))) {
      expect({ link, settled: settle(LINKS[link], decide, UNMOUNT_ON_HOLD).settled }).toEqual({ link, settled: true });
    }
  });
});

// ── 소스 계약: 실제 게이트가 덮개 구조인가 ─────────────────────────────────────

function parse(rel: string): ts.SourceFile {
  return ts.createSourceFile(rel, read(rel), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function functionNamed(sf: ts.SourceFile, name: string): ts.FunctionDeclaration {
  let found: ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!found) throw new Error(`${sf.fileName}: function ${name} not found`);
  return found;
}

/** 함수 본문(중첩 함수 제외)의 return 문들. */
function returnsOf(fn: ts.FunctionDeclaration): ts.ReturnStatement[] {
  const out: ts.ReturnStatement[] = [];
  const visit = (node: ts.Node): void => {
    if (node !== fn && (ts.isFunctionLike(node) || ts.isClassLike(node))) return;
    if (ts.isReturnStatement(node)) out.push(node);
    ts.forEachChild(node, visit);
  };
  visit(fn);
  return out;
}

/** 이 return 이 `{children}` 을 그리는가. */
const rendersChildren = (ret: ts.ReturnStatement): boolean => /\{children\}/.test(ret.getText());

/** 이 return 을 감싼 if 조건(바로 위 하나). 없으면 "". */
function guardOf(ret: ts.ReturnStatement): string {
  let node: ts.Node = ret;
  while (node.parent) {
    if (ts.isIfStatement(node.parent)) return node.parent.expression.getText();
    if (ts.isFunctionLike(node.parent)) return "";
    node = node.parent;
  }
  return "";
}

describe("R2A-01 소스 계약: 경로 조각으로 정하는 붙들기는 라우트를 내리지 않는다", () => {
  test("AvatarSetupGate: 모든 갈래가 같은 GateCover 안에 자식을 그린다 (hold · setup 도)", () => {
    const fn = functionNamed(parse("src/components/avatar/AvatarSetupGate.tsx"), "AvatarSetupGate");
    const returns = returnsOf(fn);
    expect(returns.length).toBeGreaterThan(0);
    for (const ret of returns) {
      expect({ ret: ret.getText(), children: rendersChildren(ret) }).toEqual({ ret: ret.getText(), children: true });
      expect(ret.getText()).toContain("<GateCover cover={");
    }
    const text = fn.getText();
    // 덮개는 판정이 allow 가 아닐 때만, setup 은 마운트된 Stack 안에서 바꿔 끼운다.
    expect(text).toContain('<GateCover cover={decision === "allow" ? null : <InlineLoader />}>{children}</GateCover>');
    // 바꿔 끼우는 목적지는 그대로다. 공유 표식이 붙은 /capture 에서 왔을 때만 같은 목적지에
    // 안내 매개변수 하나가 붙는다(Simon 2026-10-07 12:04).
    expect(text).toMatch(/\{decision === "setup" \? \(\s*<Redirect\s/);
    expect(text).toContain('{ pathname: "/avatar-studio", params: { setup: "1", ...SHARE_REFUSED_PARAMS } }');
    expect(text).toContain(': "/avatar-studio?setup=1"');
  });

  test("IntroGate: 경로 조각을 읽는 갈래(profileHold)는 덮고, 자식을 내리는 갈래는 경로 조각과 무관하다", () => {
    const fn = functionNamed(parse("src/app/_layout.tsx"), "IntroGate");
    const holds = returnsOf(fn).filter((ret) => /\bprofileHold\b/.test(guardOf(ret)));
    expect(holds.map(guardOf)).toEqual(['profileHold === "retry"', 'profileHold === "loading"']);
    for (const ret of holds) {
      expect(rendersChildren(ret)).toBe(true);
      expect(ret.getText()).toMatch(/^return <GateCover cover=\{<(ProfileProbeRetryScreen|InlineLoader) \/>\}>\{children\}<\/GateCover>;$/);
    }
    // 자식을 그리지 않는 갈래 중 Redirect 가 아닌 것(인트로 · 글꼴 · 저장소 복구 · 복구 준비)은
    // 경로를 읽지 않는다. Redirect 셋(저장소 복구 중 공유 · 복구 · C10)은 경로를 읽지만, 바꿔
    // 끼우기가 루트 params 를 자기 목적지로 새로 써서 다음 렌더의 segments 가 남은 딥링크가 아니라
    // 그 목적지가 된다. 첫째(SG-R3-01, Simon 2026-10-07 13:33)는 같은 /capture 에 안내 매개변수만
    // 남기므로 다음 렌더의 표식 판정이 거짓이 되어 저장소 복구 화면으로 간다.
    const redirects = returnsOf(fn).filter((ret) => /<Redirect /.test(ret.getText()));
    const unmounting = returnsOf(fn).filter((ret) => !rendersChildren(ret) && !redirects.includes(ret));
    expect(unmounting.length).toBeGreaterThan(0);
    for (const ret of unmounting) {
      expect({ ret: ret.getText(), guard: guardOf(ret) }).not.toEqual({
        ret: ret.getText(),
        guard: expect.stringMatching(/\bsegments\b|\bprofileHold\b|\bpathname\b/),
      });
    }
    expect(redirects.map((ret) => ret.getText())).toEqual([
      'return <Redirect href={shareRefusedHref("/capture", true)} />;',
      'return <Redirect href={shareRefusedHref("/reset-password", shareTurnedAway)} />;',
      'return <Redirect href={shareRefusedHref("/complete-profile", shareTurnedAway)} />;',
    ]);
    expect(guardOf(redirects[0])).toBe("storageRecoveryRequired && shareTurnedAway");
    // 통과 갈래도 같은 GateCover 다. 덮개를 걷을 때 라우트가 다시 마운트되지 않는다.
    expect(returnsOf(fn).at(-1)?.getText()).toBe("return <GateCover cover={null}>{children}</GateCover>;");
  });

  test("장면 하나하나의 붙들기는 그대로다: 덮개 아래 장면도 그리지 않는다", () => {
    const layout = read("src/app/_layout.tsx");
    expect(layout).toContain("<ProfileProbeScope routeName={route.name}>");
    expect(layout).toContain("<AvatarSetupSceneGuard routeName={route.name}>");
    const guard = read("src/components/avatar/AvatarSetupGate.tsx");
    expect(guard).toContain('return decision === "allow" ? <>{children}</> : <InlineLoader />;');
  });
});

describe("GateCover 계약", () => {
  const source = read("src/components/ui/GateCover.tsx");
  const fn = functionNamed(parse("src/components/ui/GateCover.tsx"), "GateCover");

  test("자식은 덮였든 아니든 같은 자리에 늘 그린다 (return 하나, 조건 없이)", () => {
    const returns = returnsOf(fn);
    expect(returns).toHaveLength(1);
    const body = returns[0].getText();
    expect(body).toMatch(/>\s*\{children\}\s*<\/View>/);
    expect(body).not.toMatch(/covered\s*\?\s*[^:]*\{children\}/);
  });

  test("덮였을 때 아래 트리는 터치와 화면 낭독에서 빠지고, 덮개는 그 뒤(위)에 전면으로 그린다", () => {
    expect(source).toContain('pointerEvents={covered ? "none" : "auto"}');
    expect(source).toContain("accessibilityElementsHidden={covered}");
    expect(source).toContain('importantForAccessibility={covered ? "no-hide-descendants" : "auto"}');
    expect(source).toContain("{covered ? <View style={StyleSheet.absoluteFill}>{cover}</View> : null}");
    expect(source.indexOf("{children}")).toBeLessThan(source.indexOf("{cover}"));
  });
});
