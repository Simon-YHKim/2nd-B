import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";

type RouteContract = {
  file: string;
  deepComponent: string;
};

const ROUTES: RouteContract[] = [
  { file: "account", deepComponent: "DeepSpaceAccountScreen" },
  { file: "data", deepComponent: "DeepSpaceDataScreen" },
  { file: "theme", deepComponent: "DeepSpaceThemeScreen" },
  { file: "support", deepComponent: "DeepSpaceSupportDesignScreen" },
];

function hasDescendant(node: ts.Node, predicate: (candidate: ts.Node) => boolean): boolean {
  if (predicate(node)) return true;
  let found = false;
  ts.forEachChild(node, (child) => {
    if (!found && hasDescendant(child, predicate)) found = true;
  });
  return found;
}

function containsIdentifier(node: ts.Node, name: string): boolean {
  return hasDescendant(node, (candidate) => ts.isIdentifier(candidate) && candidate.text === name);
}

function containsCall(node: ts.Node, name: string): boolean {
  return hasDescendant(
    node,
    (candidate) =>
      ts.isCallExpression(candidate) &&
      ts.isIdentifier(candidate.expression) &&
      candidate.expression.text === name,
  );
}

function containsJsxTag(node: ts.Node, sourceFile: ts.SourceFile, name: string): boolean {
  return hasDescendant(
    node,
    (candidate) =>
      (ts.isJsxOpeningElement(candidate) || ts.isJsxSelfClosingElement(candidate)) &&
      candidate.tagName.getText(sourceFile) === name,
  );
}

function redirectHrefs(node: ts.Node, sourceFile: ts.SourceFile): string[] {
  const hrefs: string[] = [];
  const visit = (candidate: ts.Node) => {
    if (ts.isJsxSelfClosingElement(candidate) && candidate.tagName.getText(sourceFile) === "Redirect") {
      const href = candidate.attributes.properties.find(
        (property): property is ts.JsxAttribute =>
          ts.isJsxAttribute(property) && property.name.getText(sourceFile) === "href",
      );
      if (href?.initializer && ts.isStringLiteral(href.initializer)) hrefs.push(href.initializer.text);
    }
    ts.forEachChild(candidate, visit);
  };
  visit(node);
  return hrefs;
}

/** `if (gate === "signed-out")` · `if (gate !== "ready")` */
function comparesGate(statement: ts.Statement, operator: ts.SyntaxKind, state: string): boolean {
  if (!ts.isIfStatement(statement)) return false;
  const condition = statement.expression;
  return (
    ts.isBinaryExpression(condition) &&
    condition.operatorToken.kind === operator &&
    ts.isIdentifier(condition.left) &&
    condition.left.text === "gate" &&
    ts.isStringLiteral(condition.right) &&
    condition.right.text === state
  );
}

function defaultRoute(file: string): { sourceFile: ts.SourceFile; statements: readonly ts.Statement[] } {
  const sourcePath = join(process.cwd(), "src", "app", `${file}.tsx`);
  const source = readFileSync(sourcePath, "utf8");
  const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = sourceFile.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      (statement.modifiers ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword),
  );
  if (!declaration?.body) throw new Error(`${file}.tsx must export a default function declaration`);
  return { sourceFile, statements: declaration.body.statements };
}

describe("deep-space route auth parity", () => {
  it.each(ROUTES)("gates /$file before rendering the screen", (route) => {
    const { sourceFile, statements } = defaultRoute(route.file);
    const equals = ts.SyntaxKind.EqualsEqualsEqualsToken;
    const differs = ts.SyntaxKind.ExclamationEqualsEqualsToken;

    const authIndex = statements.findIndex(
      (statement) => ts.isVariableStatement(statement) && containsCall(statement, "useAuth"),
    );
    // 판정은 profileGate 한 곳이 한다(src/lib/auth/profile-probe.ts, 단위 테스트는
    // profile-probe-failure.test.ts). 라우트는 그 결과를 빠짐없이 받아야 한다 -
    // 받지 않은 상태가 화면으로 새지 않게.
    const gateIndex = statements.findIndex(
      (statement) => ts.isVariableStatement(statement) && containsCall(statement, "profileGate"),
    );
    const signInIndex = statements.findIndex(
      (statement) =>
        comparesGate(statement, equals, "signed-out") && redirectHrefs(statement, sourceFile).includes("/sign-in"),
    );
    // 실패한 프로브는 로더가 아니라 다시 시도다. 로더와 한 갈래였을 때 T1a 에뮬레이터
    // 검증(vibe r260913 항목 2)이 /account · /data 에서 끝나지 않는 로딩을 재현했다.
    const probeFailedIndex = statements.findIndex(
      (statement) =>
        comparesGate(statement, equals, "profile-error") &&
        containsJsxTag(statement, sourceFile, "ProfileProbeRetryScreen"),
    );
    const completeProfileIndex = statements.findIndex(
      (statement) =>
        comparesGate(statement, equals, "profile-incomplete") &&
        redirectHrefs(statement, sourceFile).includes("/complete-profile"),
    );
    // 남은 둘(auth-loading · profile-loading)은 답을 기다리는 중이다.
    const waitIndex = statements.findIndex(
      (statement) =>
        comparesGate(statement, differs, "ready") && containsJsxTag(statement, sourceFile, "PremiumLoadingState"),
    );
    // 스킨 분기가 은퇴한 라우트는 게이트 뒤에서 화면을 곧바로 렌더하고, 아직 남은
    // 라우트는 if (isDeepSpaceUI()) 안에서 렌더한다. 지켜야 할 것은 분기의 모양이
    // 아니라 "게이트를 다 지나기 전에는 화면이 안 나온다" 이므로, 분기를 찾지 말고
    // 화면을 렌더하는 첫 문장을 찾는다.
    const renderIndex = statements.findIndex((statement) =>
      containsJsxTag(statement, sourceFile, route.deepComponent),
    );

    expect(authIndex).toBeGreaterThanOrEqual(0);
    expect(gateIndex).toBeGreaterThan(authIndex);
    for (const field of ["userId", "loading", "hasProfile", "profileProbeFailed"]) {
      expect(containsIdentifier(statements[authIndex], field)).toBe(true);
      expect(containsIdentifier(statements[gateIndex], field)).toBe(true);
    }
    for (const gateStatement of [signInIndex, probeFailedIndex, completeProfileIndex, waitIndex]) {
      expect(gateStatement).toBeGreaterThan(gateIndex);
      expect(renderIndex).toBeGreaterThan(gateStatement);
    }
    for (const statement of statements.slice(0, renderIndex)) {
      expect(containsJsxTag(statement, sourceFile, route.deepComponent)).toBe(false);
    }
  });
});
