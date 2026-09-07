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
    const authIndex = statements.findIndex(
      (statement) => ts.isVariableStatement(statement) && containsCall(statement, "useAuth"),
    );
    const loadingIndex = statements.findIndex(
      (statement) => ts.isIfStatement(statement) && containsIdentifier(statement.expression, "loading"),
    );
    const signInIndex = statements.findIndex((statement) => redirectHrefs(statement, sourceFile).includes("/sign-in"));
    const pendingProfileIndex = statements.findIndex(
      (statement) =>
        ts.isIfStatement(statement) &&
        containsIdentifier(statement.expression, "profileProbeFailed") &&
        containsIdentifier(statement.expression, "hasProfile"),
    );
    const completeProfileIndex = statements.findIndex((statement) =>
      redirectHrefs(statement, sourceFile).includes("/complete-profile"),
    );
    // 스킨 분기가 은퇴한 라우트는 게이트 뒤에서 화면을 곧바로 렌더하고, 아직 남은
    // 라우트는 if (isDeepSpaceUI()) 안에서 렌더한다. 지켜야 할 것은 분기의 모양이
    // 아니라 "게이트를 다 지나기 전에는 화면이 안 나온다" 이므로, 분기를 찾지 말고
    // 화면을 렌더하는 첫 문장을 찾는다.
    const renderIndex = statements.findIndex((statement) =>
      containsJsxTag(statement, sourceFile, route.deepComponent),
    );

    expect(authIndex).toBeGreaterThanOrEqual(0);
    for (const field of ["userId", "loading", "hasProfile", "profileProbeFailed"]) {
      expect(containsIdentifier(statements[authIndex], field)).toBe(true);
    }
    expect(loadingIndex).toBeGreaterThan(authIndex);
    expect(signInIndex).toBeGreaterThan(loadingIndex);
    expect(pendingProfileIndex).toBeGreaterThan(signInIndex);
    expect(completeProfileIndex).toBeGreaterThan(pendingProfileIndex);
    expect(renderIndex).toBeGreaterThan(completeProfileIndex);
    for (const statement of statements.slice(0, renderIndex)) {
      expect(containsJsxTag(statement, sourceFile, route.deepComponent)).toBe(false);
    }
  });
});
