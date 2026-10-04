// 홈으로 가는 길이 홈을 하나 더 만들지 않는가 (QA 261004 D-01 · D-12).
//
// 세 층을 본다.
//
//   1. 라우터: expo-router 56 이 실제로 쓰는 StackRouter 에 POP_TO 를 넣으면
//      아래의 홈이 그대로 남고 하나뿐이다. 같은 자리에서 REPLACE 는 홈을 둘로
//      만든다 - 고치기 전의 모양을 대조군으로 같이 적는다.
//   2. 헬퍼: goHome / RedirectHome 이 정말 dismissTo("/") 를 부른다.
//   3. 배송 코드: 홈을 쌓는 `<Redirect href="/">` 가 다시 생기지 않고, 홈으로
//      push 하는 자리는 아래 명단에서 늘지 않는다.
//
// 렌더 테스트는 이 저장소에서 막혀 있어(RN 0.85) 소스는 TypeScript AST 로 읽는다.
// 주석은 AST 에 없으므로 설명문이 증거로 읽히지 않는다.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";

import { deadRendererSpans } from "@/lib/legal/dead-renderer-spans";
import { shadowedScreens } from "@/lib/legal/shadow-screens";

import { HOME_HREF, RedirectHome, goHome } from "../go-home";

const mockDismissTo = jest.fn();
jest.mock("expo-router", () => ({
  router: { dismissTo: (...args: unknown[]) => mockDismissTo(...args) },
  // 포커스를 얻은 것으로 치고 효과를 바로 돌린다.
  useFocusEffect: (effect: () => void) => effect(),
}));
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  // RedirectHome 을 렌더 없이 함수로 부르기 위해 메모이즈만 걷어낸다.
  useCallback: <T>(fn: T) => fn,
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
const ROUTE_NAMES = ["index", "canon", "settings", "account", "(auth)"];
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

const HOME: StackRoute = { key: "index-k0", name: "index" };
/** goHome 이 보내는 것. expo-router 의 getNavigateAction 이 dismissTo 를 이렇게 만든다. */
const POP_TO_HOME = { type: "POP_TO", target: "root", payload: { name: "index", params: {} } };
/** 고치기 전 `router.replace("/")` / `<Redirect href="/">` 가 보내던 것. */
const REPLACE_HOME = { type: "REPLACE", target: "root", payload: { name: "index", params: {} } };

describe("POP_TO 는 홈을 하나로 남긴다 (expo-router 56 StackRouter)", () => {
  const router = StackRouter({});

  it("아래에 홈이 있으면 그 홈으로 돌아간다 - 같은 key, 칸 하나", () => {
    const next = router.getStateForAction(stack(HOME, { key: "canon-k1", name: "canon" }), POP_TO_HOME, OPTIONS);
    expect(next?.routes.map((r) => r.key)).toEqual(["index-k0"]);
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
    expect(next?.routes.map((r) => r.key)).toEqual(["index-k0"]);
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
});

describe("goHome / RedirectHome", () => {
  beforeEach(() => mockDismissTo.mockReset());

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

function containsHomeLiteral(node: ts.Node): boolean {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text === "/";
  return ts.forEachChild(node, (child) => (containsHomeLiteral(child) ? true : undefined)) ?? false;
}

/** `<Redirect href=…>` 중 href 식 어디에든 "/" 가 있는 것. 조건식의 한쪽 가지도 잡는다. */
function homeRedirects(source: string, file: string): number[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines: number[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(sf) === "Redirect") {
      const href = node.attributes.properties.find(
        (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(sf) === "href",
      );
      if (href?.initializer && containsHomeLiteral(href.initializer)) {
        lines.push(sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return lines;
}

/** `x.push("/")` 와 `x.push({ pathname: "/" })`. */
function homePushes(source: string, file: string): number[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines: number[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "push" &&
      node.arguments.length > 0
    ) {
      const arg = node.arguments[0];
      const literal = ts.isStringLiteral(arg) && arg.text === "/";
      const object =
        ts.isObjectLiteralExpression(arg) &&
        arg.properties.some(
          (p) =>
            ts.isPropertyAssignment(p) &&
            p.name.getText(sf) === "pathname" &&
            ts.isStringLiteral(p.initializer) &&
            p.initializer.text === "/",
        );
      if (literal || object) lines.push(sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return lines;
}

function scan(find: (source: string, file: string) => number[]): { file: string; line: number }[] {
  const hidden = unrenderedLine();
  const hits: { file: string; line: number }[] = [];
  for (const file of sourceFiles(join(ROOT, "src"))) {
    const source = readFileSync(join(ROOT, file), "utf8");
    for (const line of find(source, file)) hits.push({ file, line });
  }
  return hits.filter((hit) => !hidden(hit.file, hit.line));
}

/**
 * 아직 홈으로 push 하는 자리. 하나하나가 홈을 하나 더 얹는다. D-01 판정 범위 밖이라
 * 이번에 고치지 않았고, 새로 생기지 않게 명단으로 묶어 둔다. 고치면 여기서 지운다.
 */
const KNOWN_HOME_PUSHES: Readonly<Record<string, string>> = {
  "src/app/audit.tsx": "검사 화면 안의 '뒤로' 버튼. 미저장 응답 가드(beforeRemove)와 함께 따로 볼 것.",
  "src/app/esm.tsx": "경험 표집 화면의 '홈으로' 버튼.",
  "src/lib/auth/useSignInForm.ts": "로그인 화면의 안드로이드 뒤로(게스트). 게스트 홈은 다시 /sign-in 으로 보낸다.",
  "src/lib/auth/useSignUpForm.ts": "가입 화면의 안드로이드 뒤로(게스트). 위와 같다.",
  "src/screens/deepspace/dds-sign-up-screen.tsx": "가입 화면 상단의 뒤로(게스트). signup-required-acks 가 지킨다.",
};

describe("배송 코드에서 홈으로 가는 길", () => {
  it("판정기는 조건식 가지 안의 \"/\" 도 잡고, 다른 목적지는 잡지 않는다", () => {
    const fixture = [
      "function A() { return <Redirect href=\"/\" />; }",
      "function B() { return <Redirect href={x ? \"/avatar-studio?setup=1\" : \"/\"} />; }",
      "function C() { return <Redirect href=\"/sign-in\" />; }",
      "function D() { return <RedirectHome />; }",
    ].join("\n");
    expect(homeRedirects(fixture, "fixture.tsx")).toEqual([1, 2]);
    expect(homePushes('router.push("/"); router.push({ pathname: "/" }); router.push("/sign-in");', "f.ts")).toEqual([1, 1]);
  });

  it("시야 대조: 그림자 사본의 홈 리다이렉트는 날것의 스캔에 보이고, 안 그려지는 줄이라 빠진다", () => {
    // 이 대조가 없으면 '0건'이 스캔이 파일을 못 읽어서인지 진짜 0인지 모른다.
    const shadow = "src/screens/deepspace/dds-auth-screens.tsx";
    const raw = homeRedirects(readFileSync(join(ROOT, shadow), "utf8"), shadow);
    expect(raw.length).toBeGreaterThan(0);
    const hidden = unrenderedLine();
    expect(raw.every((line) => hidden(shadow, line))).toBe(true);
  });

  it("그려지는 코드에 홈을 쌓는 <Redirect href=\"/\"> 가 0건이다 - RedirectHome 을 쓴다", () => {
    expect(scan(homeRedirects)).toEqual([]);
  });

  it("홈으로 push 하는 자리는 알려진 명단 밖으로 늘지 않는다", () => {
    const files = [...new Set(scan(homePushes).map((hit) => hit.file))].sort();
    expect(files).toEqual(Object.keys(KNOWN_HOME_PUSHES).sort());
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
