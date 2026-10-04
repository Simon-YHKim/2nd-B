/** Does the /manual route render the guide that C7's jargon ban reads?
 *
 * C7 bans jargon in the user guide. The files it reads are listed by hand: the
 * shipped guide screen (dds-manual-screen.tsx), its content module and the en/ko
 * bundles. That list only protects what users read while /manual renders that
 * screen. A same-name shadow copy of the screen lives in DeepSpaceDesignScreens.tsx,
 * so a route re-pointed there would leave the ban guarding a file no build draws,
 * and C7 would stay green.
 *
 * The 2026-10-04 lint cleanup (b2504550) removed C7's unused
 * `read("src/app/manual.tsx")`. That read threw when the route was missing, which
 * turned C7 red (gate finding GATE-02). This brings the effect back as a named
 * condition instead of a side effect, and checks the wiring too.
 *
 * The route is parsed with the TypeScript compiler, not searched as text. A first
 * version matched the raw source with regular expressions (gate findings GATE-06 /
 * BL-03): an import and a default export left inside a comment or a string satisfied
 * it while the real export drew the legacy screen, and a plain explanatory comment
 * inside a correct body made it fail. Comments are trivia to the parser and strings
 * are literals, so neither can stand in for an import or a statement here.
 *
 * What must hold, all of it:
 * - the source parses without a syntax error;
 * - the only declaration of `DeepSpaceManualScreen` anywhere in the file is one value
 *   import of that exact name from the shipped guide module (no alias, not
 *   type-only), so the name cannot be shadowed by a local, a parameter or a hoisted
 *   function;
 * - the file has exactly one default export, a plain (not async, not generator)
 *   function declaration with a body;
 * - that function's first statement renders `<DeepSpaceManualScreen />` with no
 *   props, either as today's skin branch
 *   (`if (isDeepSpaceUI()) return <DeepSpaceManualScreen />;`, where
 *   `isDeepSpaceUI` is likewise the only declaration of its name and is imported
 *   from the ui-mode module) or as the wrapper left once the legacy half retires
 *   (`return <DeepSpaceManualScreen />;`, the src/app/profile.tsx shape).
 *
 * Any other shape is false (for example `export default Manual;` or
 * `export { Manual as default }`): the check errs toward failing, and a new shape
 * means widening this file on purpose. */
import * as ts from "typescript";

export const MANUAL_GUIDE_MODULE = "@/screens/deepspace/dds-manual-screen";
export const UI_MODE_MODULE = "@/lib/ui-mode";

const SCREEN = "DeepSpaceManualScreen";
const SKIN_TEST = "isDeepSpaceUI";
const FILE_NAME = "manual.tsx";

function parse(route: string): ts.SourceFile | null {
  // The parser recovers from syntax errors, and a recovered tree is not a file any
  // build ships. transpileModule reports exactly the syntactic diagnostics.
  const { diagnostics } = ts.transpileModule(route, {
    fileName: FILE_NAME,
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve },
  });
  if (diagnostics && diagnostics.length > 0) return null;
  return ts.createSourceFile(FILE_NAME, route, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/** Every node in the file that declares a value binding with this name. */
function declarationsOf(file: ts.SourceFile, name: string): ts.Node[] {
  const found: ts.Node[] = [];
  const named = (id: ts.Node | undefined): boolean => id !== undefined && ts.isIdentifier(id) && id.text === name;
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportSpecifier(node) && named(node.name)) ||
      (ts.isImportClause(node) && named(node.name)) ||
      (ts.isNamespaceImport(node) && named(node.name)) ||
      (ts.isImportEqualsDeclaration(node) && named(node.name)) ||
      ((ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) && named(node.name)) ||
      ((ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isClassDeclaration(node) ||
        ts.isClassExpression(node) ||
        ts.isEnumDeclaration(node) ||
        ts.isModuleDeclaration(node)) &&
        named(node.name))
    ) {
      found.push(node);
    }
    node.forEachChild(visit);
  };
  visit(file);
  return found;
}

/** The name is declared once in the whole file, by a top-level value import of that
 * exact export from `module`. */
function soleValueImport(file: ts.SourceFile, name: string, module: string): boolean {
  const declarations = declarationsOf(file, name);
  if (declarations.length !== 1) return false;
  const specifier = declarations[0];
  if (!ts.isImportSpecifier(specifier) || specifier.isTypeOnly) return false;
  if ((specifier.propertyName ?? specifier.name).text !== name) return false;
  const clause = specifier.parent.parent;
  const declaration = clause.parent;
  return (
    !clause.isTypeOnly &&
    declaration.parent === file &&
    ts.isStringLiteral(declaration.moduleSpecifier) &&
    declaration.moduleSpecifier.text === module
  );
}

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === kind);

/** The file's one default export, when it is a function declaration. */
function defaultExportFunction(file: ts.SourceFile): ts.FunctionDeclaration | null {
  const defaults: ts.Statement[] = [];
  for (const statement of file.statements) {
    const viaClause =
      ts.isExportDeclaration(statement) &&
      statement.exportClause !== undefined &&
      ts.isNamedExports(statement.exportClause) &&
      statement.exportClause.elements.some((e) => e.name.text === "default");
    const viaModifier =
      hasModifier(statement, ts.SyntaxKind.ExportKeyword) && hasModifier(statement, ts.SyntaxKind.DefaultKeyword);
    if (ts.isExportAssignment(statement) || viaClause || viaModifier) defaults.push(statement);
  }
  if (defaults.length !== 1) return null;
  const only = defaults[0];
  return ts.isFunctionDeclaration(only) ? only : null;
}

function rendersGuide(expression: ts.Expression | undefined): boolean {
  let e = expression;
  while (e !== undefined && ts.isParenthesizedExpression(e)) e = e.expression;
  return (
    e !== undefined &&
    ts.isJsxSelfClosingElement(e) &&
    ts.isIdentifier(e.tagName) &&
    e.tagName.text === SCREEN &&
    e.typeArguments === undefined &&
    e.attributes.properties.length === 0
  );
}

function returnsGuide(statement: ts.Statement | undefined): boolean {
  const s = statement !== undefined && ts.isBlock(statement) && statement.statements.length === 1
    ? statement.statements[0]
    : statement;
  return s !== undefined && ts.isReturnStatement(s) && rendersGuide(s.expression);
}

function isSkinTest(expression: ts.Expression): boolean {
  return (
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === SKIN_TEST &&
    expression.questionDotToken === undefined &&
    expression.typeArguments === undefined &&
    expression.arguments.length === 0
  );
}

export function manualRouteRendersScannedGuide(route: string): boolean {
  const file = parse(route);
  if (file === null) return false;
  if (!soleValueImport(file, SCREEN, MANUAL_GUIDE_MODULE)) return false;

  const fn = defaultExportFunction(file);
  if (fn === null || fn.body === undefined || fn.asteriskToken !== undefined) return false;
  if (hasModifier(fn, ts.SyntaxKind.AsyncKeyword)) return false;

  const first = fn.body.statements[0];
  if (first === undefined) return false;
  if (ts.isIfStatement(first)) {
    return (
      isSkinTest(first.expression) &&
      soleValueImport(file, SKIN_TEST, UI_MODE_MODULE) &&
      returnsGuide(first.thenStatement)
    );
  }
  return returnsGuide(first);
}
