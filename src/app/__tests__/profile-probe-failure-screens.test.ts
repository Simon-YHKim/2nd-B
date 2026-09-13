// 프로필 프로브가 실패했을 때 배송 화면이 로더에만 머물지 않는가.
//
// T1a 에뮬레이터 검증(vibe r260913, 항목 2)이 재현했다: 첫 프로브가 실패하면
// /account · /data 가 `Loading account…` / `Loading data tools...` 만 보이고
// Retry · 오류 문구 · 도크 · 뒤로 버튼이 없었다. 서버 오류(`JWT issued at future`) ·
// DNS 실패 · 8초 타임아웃 셋 다 같았고, 네트워크를 되살려도 돌아오지 않았다.
// 같은 조건에서 /audit 만 오류 문구 + Retry 를 보였다.
//
// 원인은 한 화면의 실수가 아니라 **모양**이었다:
//
//   if (profileProbeFailed || hasProfile === null) { return <로더 /> }
//   if (hasProfile === false && profileProbeFailed) return <InlineLoader />;
//
// "실패해서 모름" 을 "기다리는 중" 과 같은 갈래에 넣으면, 다시 물을 사람이 없는
// 화면은 영원히 기다린다. 그래서 이 검사는 화면 목록을 외우지 않고 **실패 갈래의
// 모양**을 본다 — 새 화면이 같은 모양을 들여와도 잡힌다.
//
// ⚠ 레거시 반쪽(EXPO_PUBLIC_UI=legacy 에서만 그려지는 스팬)은 뺀다. 배송 안 되는
// 코드를 두고 통과·실패를 말하면 앱에 대해 아무것도 말하지 않는 것이다
// (guard-pins-not-in-dead-renderers).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import * as ts from "typescript";

import { deadRendererSpans, type DeadSpan } from "../../lib/legal/dead-renderer-spans";

const ROOT = process.cwd();
const SCAN_DIRS = ["src/app", "src/screens", "src/components"];

/** 기다림만 그리는 부품. 이것만 있고 누를 것이 없으면 갇힌 화면이다. */
const LOADER_TAGS = new Set([
  "InlineLoader",
  "PremiumLoadingState",
  "DeepSpaceLoader",
  "GateLoading",
  "LoadingSurface",
  "LoadingScreen",
]);
/** 공용 다시 시도 부품(src/components/deep-space/ProfileProbeRetry.tsx). */
const RETRY_TAGS = new Set(["ProfileProbeRetryScreen", "ProfileProbeRetryPanel"]);
/** 화면마다 제 부품으로 다시 시도를 주는 경우(/audit 의 StatePanel onRetry 등). */
const ACTION_ATTRS = new Set(["onRetry", "onAction", "onPress"]);

interface FailureBranch {
  file: string;
  line: number;
  tags: ReadonlySet<string>;
  attrs: ReadonlySet<string>;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "__mocks__") continue;
      sourceFiles(full, out);
    } else if (entry.endsWith(".tsx")) {
      out.push(relative(ROOT, full).split(sep).join("/"));
    }
  }
  return out;
}

/** `!profileProbeFailed` · `profileProbeFailed === false` 는 "실패하지 않았다" 쪽이다. */
function negated(identifier: ts.Identifier): boolean {
  let child: ts.Node = identifier;
  let parent = identifier.parent;
  while (
    parent &&
    (ts.isParenthesizedExpression(parent) ||
      (ts.isPropertyAccessExpression(parent) && parent.name === child))
  ) {
    child = parent;
    parent = parent.parent;
  }
  if (!parent) return false;
  if (ts.isPrefixUnaryExpression(parent)) {
    return parent.operator === ts.SyntaxKind.ExclamationToken;
  }
  if (ts.isBinaryExpression(parent)) {
    const other = parent.left === child ? parent.right : parent.left;
    const op = parent.operatorToken.kind;
    const equals = op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsToken;
    const differs =
      op === ts.SyntaxKind.ExclamationEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken;
    return (
      (equals && other.kind === ts.SyntaxKind.FalseKeyword) ||
      (differs && other.kind === ts.SyntaxKind.TrueKeyword)
    );
  }
  return false;
}

/** 이 조건이 참이면 "프로브가 실패했다" 인가. 게이트 함수 결과(`gate === "profile-error"`)도 같다. */
function readsProbeFailure(condition: ts.Expression): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isIdentifier(node) && node.text === "profileProbeFailed" && !negated(node)) {
      found = true;
      return;
    }
    if (
      ts.isStringLiteral(node) &&
      node.text === "profile-error" &&
      ts.isBinaryExpression(node.parent) &&
      node.parent.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(condition);
  return found;
}

function failureBranches(file: string, text: string, dead: readonly DeadSpan[]): FailureBranch[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: FailureBranch[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIfStatement(node) && readsProbeFailure(node.expression)) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      const inDeadSpan = dead.some((span) => line >= span.from && line <= span.to);
      const tags = new Set<string>();
      const attrs = new Set<string>();
      const collect = (inner: ts.Node): void => {
        if (ts.isJsxOpeningElement(inner) || ts.isJsxSelfClosingElement(inner)) {
          tags.add(inner.tagName.getText(sf));
        }
        if (ts.isJsxAttribute(inner)) attrs.add(inner.name.getText(sf));
        ts.forEachChild(inner, collect);
      };
      collect(node.thenStatement);
      // `if (...) return;` 같은 효과 안의 조기 종료는 그리는 갈래가 아니다.
      if (!inDeadSpan && tags.size > 0) out.push({ file, line, tags, attrs });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function loaderOnly(branch: FailureBranch): boolean {
  const waits = [...branch.tags].some((tag) => LOADER_TAGS.has(tag));
  const retries = [...branch.tags].some((tag) => RETRY_TAGS.has(tag));
  const acts = [...branch.attrs].some((attr) => ACTION_ATTRS.has(attr));
  return waits && !retries && !acts;
}

const DEAD = deadRendererSpans(ROOT);
const FILES = SCAN_DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir)));
const BRANCHES = FILES.flatMap((file) =>
  failureBranches(
    file,
    readFileSync(join(ROOT, file), "utf8"),
    DEAD.filter((span) => span.file === file),
  ),
);
const byFile = (file: string) => BRANCHES.filter((branch) => branch.file === file);

describe("판정기 자체", () => {
  const judge = (snippet: string) =>
    failureBranches("fixture.tsx", `function Fixture() {\n${snippet}\n  return null;\n}\n`, []);

  test("T1a 에서 멈춘 두 모양을 로더 전용으로 잡는다", () => {
    const merged = judge(
      "if (profileProbeFailed || hasProfile === null) { return <PremiumAppShell><PremiumLoadingState message={m} /></PremiumAppShell>; }",
    );
    const held = judge("if (hasProfile === false && profileProbeFailed) return <InlineLoader />;");
    expect(merged).toHaveLength(1);
    expect(held).toHaveLength(1);
    expect(loaderOnly(merged[0])).toBe(true);
    expect(loaderOnly(held[0])).toBe(true);
  });

  test("'실패하지 않았다' 쪽 조건은 실패 갈래로 세지 않는다", () => {
    expect(judge("if (hasProfile === null && !profileProbeFailed) { return <DeepSpaceLoader />; }")).toHaveLength(0);
    expect(judge("if (profileProbeFailed === false) return <InlineLoader />;")).toHaveLength(0);
  });

  test("다시 시도를 주는 갈래는 통과한다", () => {
    const shared = judge("if (gate === \"profile-error\") return <ProfileProbeRetryScreen active=\"home\" />;");
    const local = judge("if (profileProbeFailed) { return shell(<StatePanel onRetry={() => void refresh()} />); }");
    expect(shared).toHaveLength(1);
    expect(local).toHaveLength(1);
    expect(loaderOnly(shared[0])).toBe(false);
    expect(loaderOnly(local[0])).toBe(false);
  });
});

describe("프로브 실패 갈래가 배송 화면을 로더에 가두지 않는다", () => {
  test("스캐너가 실제로 읽었다 - 0건 통과를 막는다", () => {
    expect(FILES.length).toBeGreaterThan(100);
    expect(BRANCHES.length).toBeGreaterThanOrEqual(12);
    // 이미 옳게 하던 대조군이 실패 갈래로 잡혀야 판정이 뜻을 갖는다.
    expect(byFile("src/screens/deepspace/dds-audit-screen.tsx").some((b) => b.attrs.has("onRetry"))).toBe(true);
  });

  test("로더만 그리는 프로브 실패 갈래가 0건이다", () => {
    const stuck = BRANCHES.filter(loaderOnly).map((b) => `${b.file}:${b.line} [${[...b.tags].join(", ")}]`);
    expect(stuck).toEqual([]);
  });

  // 막혔던(또는 같은 모양이던) 배송 화면. 갈래를 통째로 지우면 실패가 다시
  // "프로필 없음" 으로 읽혀 가입한 사람을 /complete-profile 로 내쫓는다(F4) -
  // 그래서 "로더가 없다" 만이 아니라 "다시 시도를 그린다" 를 파일마다 확인한다.
  test.each([
    "src/app/account.tsx",
    "src/app/data.tsx",
    "src/app/support.tsx",
    "src/app/theme.tsx",
    "src/app/interview.tsx",
    "src/app/reasoning.tsx",
    "src/app/secondb.tsx",
    "src/app/(auth)/complete-profile.tsx",
    "src/components/deep-space/DeepSpaceShell.tsx",
    // /iden 은 위 모양이 아니라 **암묵적** 로더였다: 실패하면 읽기 조건(canRead)이
    // 열리지 않고 상태 본문이 로더로 떨어진다. if 갈래가 없어서 위 판정이 못 본다 -
    // 그래서 이름으로 붙잡는다.
    "src/app/iden.tsx",
  ])("%s 는 프로브 실패 갈래에서 공용 다시 시도를 그린다", (file) => {
    const branches = byFile(file);
    expect(branches.length).toBeGreaterThan(0);
    expect(branches.some((b) => [...b.tags].some((tag) => RETRY_TAGS.has(tag)))).toBe(true);
  });
});

describe("공용 다시 시도 부품", () => {
  // 테스트 안에서 읽는다 - 파일이 없을 때 이 describe 만 실패하고 위 판정은 계속 돈다.
  const retry = () => readFileSync(join(ROOT, "src/components/deep-space/ProfileProbeRetry.tsx"), "utf8");

  test("/audit 과 같은 오류 문구와 Retry 키를 쓴다", () => {
    expect(retry()).toContain('t("common:errors.network")');
    expect(retry()).toContain('t("common:actions.retry")');
  });

  test("Retry 는 AuthContext 의 refresh() 로 프로브를 다시 돌린다", () => {
    expect(retry()).toContain("useAuth()");
    expect(retry()).toMatch(/void refresh\(\)/);
  });

  // 여기서 원래 "도크가 있는 DeepSpaceScreen 안에 그린다" 를 성공 조건으로 박았다. 그 도크가
  // 프로필을 모르는 채 /records · /settings · /import-hub 로 가는 길이었다(r3a 게이트 발견).
  // 모름에서는 기능 화면을 열지 않는다(C10) - 다시 묻기, 이 계정에서 나가기, 뒤로 가기만 둔다.
  test("화면 판본에는 도크도 기능 라우트로 가는 링크도 없다 - 다시 시도 · 로그아웃 · 뒤로만", () => {
    const sf = ts.createSourceFile("ProfileProbeRetry.tsx", retry(), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const tags = new Set<string>();
    const navigations: string[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) tags.add(node.tagName.getText(sf));
      if (ts.isJsxAttribute(node)) expect(node.name.getText(sf)).not.toBe("href");
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.getText(sf) === "router"
      ) {
        navigations.push(node.getText(sf));
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    for (const navigation of ["DeepSpaceScreen", "MdNavBar", "DeepSpaceDock", "TabIcon", "Link", "Redirect"]) {
      expect(tags.has(navigation)).toBe(false);
    }
    // 이동은 뒤로 가기 한 곳뿐이다. 돌아갈 곳이 없을 때의 "/" 는 라우트 게이트가 다시 붙든다
    // (profile-probe-route-hold.test.ts).
    expect(navigations).toEqual(["router.canGoBack()", "router.back()", 'router.replace("/")']);
    expect(retry()).toMatch(/void signOut\(\)/);
  });
});
