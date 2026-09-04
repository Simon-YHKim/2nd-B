import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";

type RouteContract = {
  file: string;
  deepComponent: string;
  legacyComponent: string;
};

const ROUTES: RouteContract[] = [
  { file: "account", deepComponent: "DeepSpaceAccountDesignScreen", legacyComponent: "AccountLegacy" },
  { file: "data", deepComponent: "DeepSpaceDataDesignScreen", legacyComponent: "DataManagementLegacy" },
  { file: "theme", deepComponent: "DeepSpaceThemeScreen", legacyComponent: "ThemeScreenLegacy" },
  { file: "support", deepComponent: "DeepSpaceSupportDesignScreen", legacyComponent: "SupportLegacy" },
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
  it.each(ROUTES)("gates /$file before delegating either renderer", (route) => {
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
    const deepSpaceIndex = statements.findIndex(
      (statement) => ts.isIfStatement(statement) && containsCall(statement.expression, "isDeepSpaceUI"),
    );
    const legacyIndex = statements.findIndex(
      (statement) => ts.isReturnStatement(statement) && containsJsxTag(statement, sourceFile, route.legacyComponent),
    );

    expect(authIndex).toBeGreaterThanOrEqual(0);
    for (const field of ["userId", "loading", "hasProfile", "profileProbeFailed"]) {
      expect(containsIdentifier(statements[authIndex], field)).toBe(true);
    }
    expect(loadingIndex).toBeGreaterThan(authIndex);
    expect(signInIndex).toBeGreaterThan(loadingIndex);
    expect(pendingProfileIndex).toBeGreaterThan(signInIndex);
    expect(completeProfileIndex).toBeGreaterThan(pendingProfileIndex);
    expect(deepSpaceIndex).toBeGreaterThan(completeProfileIndex);
    expect(legacyIndex).toBeGreaterThan(deepSpaceIndex);

    const deepSpaceBranch = statements[deepSpaceIndex];
    expect(containsJsxTag(deepSpaceBranch, sourceFile, route.deepComponent)).toBe(true);
    for (const statement of statements.slice(0, deepSpaceIndex)) {
      expect(containsJsxTag(statement, sourceFile, route.deepComponent)).toBe(false);
    }
  });
});
