// Every persona build carries the user's resolved age (C10, DPIA 5A-R7).
//
// buildPersona() calls callLlm({ purpose: "persona_narrative", minor }) and the boundary
// picks the crisis hotline from that `minor`: a minor gets the youth line (KO 1388 + 109),
// an adult the adult line. buildPersona used to default `minor` to false, so a caller that
// left it out did not fail - it quietly routed a minor as an adult.
//
// That is what the shipped /formats?view=export screen did until 2026-10-04 (QA 261004,
// L1-07). DeepSpaceFormatsScreen called exportIden(userId, { locale }) and
// buildIdenDoc(userId, { locale }) without the age, and buildIdenDoc filled the gap with
// `opts.minor ?? false`. /review had the right shape all along: return while isMinor is
// still null, then pass `isMinor === true`. DPIA 5A-R7 claims that shape for *every*
// crisis-capable persona build, so this suite checks it at every call site it can find
// under src/, not only at the screens that exist today. (legacy/ is not scanned: Metro
// blocks it from the bundle, metro.config.js, and tsconfig and jest exclude it.)
//
// The rules, per call of buildPersona / buildIdenDoc / exportIden:
//   0. the builder is only ever called by its own name, either `buildPersona(...)` or
//      `ns.buildPersona(...)`. An alias (`import { buildPersona as bp }`, `const bp =
//      buildPersona`, `{ buildPersona: bp } = ...`), `.call` / `.apply`, or a string key
//      (`ns["buildPersona"]`) would hide a call from rules 1-4, so it is reported;
//   1. the age argument is present (buildPersona's 3rd argument, or `minor` in the opts
//      object of the other two) and nothing after it in that object can override it (a
//      later spread, a later computed key, an accessor);
//   2. it is never an adult default - no adult constant and no fallback to one ("Adult"
//      below: `false`, `isMinor ?? false`, `known ? isMinor : false`, ...);
//   3. a screen (.tsx) passes `isMinor === true`, and the function that makes the call
//      (the nearest function around it, not one further out) has an unconditional
//      `if (... || isMinor === null) return;` as a top-level statement of its body, ahead
//      of the statement that holds the call (fail-closed while the age is unknown, the
//      /review pattern). A guard nested inside another `if`, or a guard in an outer
//      function, does not count: a helper can be called before the outer guard however
//      late it is written (QA 261004 gate r4). The guard is a bare `return;`. The
//      `isMinor` the call passes is the binding the guard checked, that binding is the
//      resolved age, and nothing assigns to it. The resolved age is
//      `const { isMinor } = useAuth()` with `useAuth` imported from the auth context, or a
//      verified prop: the props of a component that is not exported, whose name is only
//      ever a JSX tag in its file, and whose every render passes `isMinor={x}` with no
//      spread and `x` resolved the same way (/review's keyed session). A plain parameter
//      or a value from anywhere else is not: a helper that takes the age as an argument
//      has no resolved age behind it (gate r4). `cloneElement` re-propping a rendered
//      element is outside this syntactic check, as are dynamic keys and `eval`;
//   4. outside a screen (.ts) the only calls are the listed library chain
//      exportIden -> buildIdenDoc -> buildPersona. Each one passes on the age its own
//      caller gave it, read from its own required `opts` parameter, and nothing in that
//      function writes to `opts`, aliases it, or hands it to a call before the build. A
//      hand-off inside a nested function counts as before the build wherever it is
//      written, since a hoisted helper can run first (gate r4).
//      Any other .ts call is a wrapper (QA 261004 gate r3): a wrapper's age has no screen
//      guard behind it, so `wrap(u, minor = false)` would pass rules 1-2 on `minor`.
// And over every source file under src/, persona chain or not:
//   5. no parameter, binding, variable, or class field named `minor` / `isMinor` defaults
//      to adult (`= false`, `= x ?? false`, `{ minor: m = false }`, `({ minor = false } = o)`);
//   6. no `minor` / `isMinor` property, variable, JSX attribute, or positional argument is
//      written an adult value (`{ minor: false }`, `x.minor = false`, `<P minor={false} />`,
//      and `f(x, false)` where some function `f` in src takes `minor` at that position).
//   "Adult" is any constant that is falsy whatever runs (`false`, `!true`, `0`, `""`), or
//   an expression that falls back to one (`?? F`, `|| F`, `&& F`, a `?:` branch). `null`
//   and `undefined` are not: `isMinor` is null while the age is unknown, and rule 3
//   handles that state. Names other than `minor` / `isMinor` are out of reach here; for
//   the persona chain, rules 1-4 hold the age whatever it is called.
//   Rules 5 and 6 are ratchets: the sites that predate them (2026-10-05) are frozen in
//   KNOWN_AGE_DEFAULTS / KNOWN_AGE_WRITES, one entry per site (gate r4: an entry is the
//   site's function, name, shape, text, and the calls around it, not the function
//   alone). A new site anywhere fails, a second site in a frozen function fails, and an
//   entry whose site is gone fails until it is deleted, so the lists only shrink. Some
//   frozen functions sit under the persona build (callLlm -> routeCrisis ->
//   crisisHotlines), but that path hands them the age explicitly, so their defaults do
//   not fire there. Removing the defaults changes callLlm and the crisis classifier for
//   every other caller, which is its own decision.
//
// The bottom blocks feed the checker one small source per bypass form, so a rule that
// stops seeing its case turns this suite red instead of passing on a tree that happens
// to be clean (QA 261004 gates r2 and r3, GATE-TEST-001).

import { readdirSync, readFileSync } from "node:fs";
import { join, posix as posixPath, relative, sep } from "node:path";
import * as ts from "typescript";

const ROOT = join(__dirname, "..", "..", "..", "..");
const SRC = join(ROOT, "src");
const BUILDERS = ["buildPersona", "buildIdenDoc", "exportIden"] as const;
type Builder = (typeof BUILDERS)[number];
const isBuilder = (name: string): name is Builder => (BUILDERS as readonly string[]).includes(name);

/**
 * Rule 4: the only builder calls allowed outside a screen. `fn` holds the call and takes
 * the age in its own required `opts` parameter; `age` is how it passes it on.
 */
const LIBRARY_SITES: ReadonlyArray<{ file: string; fn: string; callee: Builder; age: "forward" | "opts.minor" }> = [
  { file: "src/lib/iden/build-iden.ts", fn: "buildIdenDoc", callee: "buildPersona", age: "opts.minor" },
  { file: "src/lib/iden/iden-export.ts", fn: "exportIden", callee: "buildIdenDoc", age: "forward" },
];
const OPTS = "opts";
/** Rule 3: the only source of a screen's `isMinor` (`useAuth`, imported from here). */
const AUTH_MODULE = "src/lib/auth/AuthContext";

// Rules 5-6 ratchets, one entry per site that existed on 2026-10-05:
//   `<file> <function> <name> | <shape> | <text>[ | in <calls and closures around it>]`
// The same entry twice would allow two sites; each list is the whole allowance.

/** Rule 5 ratchet: every adult age default. */
const KNOWN_AGE_DEFAULTS: readonly string[] = [
  "src/lib/interview/probe.ts nextProbe minor | param | minor = false",
  "src/lib/llm/boundary.ts proxyCrisisSafetyResult minor | param | minor = false",
  "src/lib/llm/boundary.ts classifyRecordTextForCrisis minor | param | minor = false",
  "src/lib/llm/boundary.ts classifyInterviewTextForCrisis minor | param | minor = false",
  "src/lib/llm/boundary.ts routeCrisis minor | param | minor = false",
  "src/lib/llm/safety.ts fixedCrisisResponse minor | param | minor = false",
  "src/lib/persona/persona-synthesis.ts synthesizePersonas minor | param | minor = false",
  "src/lib/persona/propose-self-model.ts proposeSelfModelChange minor | param | minor = false",
  "src/lib/persona/role-cards.ts proposeRoleCards minor | param | minor = false",
  "src/lib/records/records-embeddings.ts embedAndStoreRecord minor | param | minor = false",
  "src/lib/safety/classifier.ts crisisHotlines minor | param | minor = false",
  "src/lib/safety/classifier.ts pickCrisisHotline minor | param | minor = false",
  "src/lib/wiki/capture-image.ts ocrImageAsset minor | param | minor = false",
  "src/lib/wiki/classify-clipper.ts classifyClipper minor | param | minor = false",
  "src/lib/wiki/embeddings.ts embedAndStorePage minor | param | minor = false",
  "src/lib/wiki/propose-template.ts proposeClipperTemplate minor | param | minor = false",
];

/** Rule 6 ratchet: every adult age write. */
const KNOWN_AGE_WRITES: readonly string[] = [
  "src/lib/chat/rag.ts retrieveChatContext minor | prop | minor: opts.minor ?? false | in embedTexts()",
  "src/lib/records/records-embeddings.ts backfillRecordEmbeddings minor | prop | minor: opts.minor ?? false | in embedTexts()",
  "src/lib/wiki/embeddings.ts backfillEmbeddings minor | prop | minor: opts.minor ?? false | in embedTexts()",
  // Positional ones, frozen when rule 6 began reading call arguments (gate r4). The two in
  // create.ts sit behind `if (args.minor === true ...) return;`, so they are adult only
  // when the caller left the age out.
  "src/lib/records/create.ts embedRecordDetached isMinor | arg | false | in recordsEmbeddingAllowed() < => < <expr>()",
  "src/lib/records/create.ts embedRecordDetached minor | arg | false | in embedAndStoreRecord() < => < <expr>()",
  "src/lib/records/records-embeddings.ts backfillRecordEmbeddings minor | arg | opts.minor ?? false | in embedAndStoreRecord()",
  "src/lib/wiki/embeddings.ts backfillEmbeddings minor | arg | opts.minor ?? false | in embedAndStorePage()",
];

const AGE_NAME = /^(minor|isMinor)$/;
const posix = (p: string): string => p.split(sep).join("/");
const norm = (node: ts.Node, sf: ts.SourceFile): string => node.getText(sf).replace(/\s+/g, " ");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__" || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

function parse(file: string, text: string = readFileSync(file, "utf8")): ts.SourceFile {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
}

interface CallSite {
  file: string;
  line: number;
  callee: Builder;
  call: ts.CallExpression;
  sf: ts.SourceFile;
}

interface Scan {
  sites: CallSite[];
  /** References that are not a direct call by name, so rules 1-4 cannot see the call. */
  indirect: string[];
}

const lineOf = (sf: ts.SourceFile, node: ts.Node): number =>
  sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

/** `(x)`, `x as T`, `x satisfies T`, `x!`, `<T>x` all evaluate to x. */
function unwrap(expr: ts.Expression): ts.Expression {
  let e = expr;
  while (
    ts.isParenthesizedExpression(e) ||
    ts.isAsExpression(e) ||
    ts.isSatisfiesExpression(e) ||
    ts.isNonNullExpression(e) ||
    ts.isTypeAssertionExpression(e)
  ) {
    e = e.expression;
  }
  return e;
}

const isAssignment = (kind: ts.SyntaxKind): boolean =>
  kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;

/** `buildPersona(...)` or `ns.buildPersona(...)`: the call whose callee is this name. */
function directCall(id: ts.Identifier): ts.CallExpression | undefined {
  const p = id.parent;
  if (ts.isCallExpression(p) && p.expression === id) return p;
  if (ts.isPropertyAccessExpression(p) && p.name === id && ts.isCallExpression(p.parent) && p.parent.expression === p) {
    return p.parent;
  }
  return undefined;
}

/** A position that names the builder without calling it, and cannot hide a call. */
function harmlessReference(id: ts.Identifier): boolean {
  const p = id.parent;
  // `typeof buildPersona` is erased at compile time.
  if (ts.isTypeQueryNode(p)) return true;
  // The declaration itself, `import { buildPersona }`, `export { buildPersona }`,
  // `const { buildPersona } = ...`: the local name stays the builder's name, so every
  // call through it is still found by name. The aliased forms put the builder's name in
  // `propertyName`, not `name`, and fall through to "indirect".
  const named = p as ts.Node & { name?: ts.Node };
  if (named.name === id && (ts.isFunctionDeclaration(p) || ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isBindingElement(p))) {
    return true;
  }
  return false;
}

function scanSource(file: string, text: string): Scan {
  const sf = parse(file, text);
  const sites: CallSite[] = [];
  const indirect: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && isBuilder(node.text)) {
      const call = directCall(node);
      if (call) {
        sites.push({ file, line: lineOf(sf, call), callee: node.text, call, sf });
      } else if (!harmlessReference(node)) {
        indirect.push(`${file}:${lineOf(sf, node)} ${node.text}: referenced as \`${norm(node.parent, sf).slice(0, 80)}\`, not called by name`);
      }
    } else if (ts.isStringLiteralLike(node) && isBuilder(node.text) && !ts.isImportDeclaration(node.parent)) {
      indirect.push(`${file}:${lineOf(sf, node)} ${node.text}: named by a string, so a call through it is not seen`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { sites, indirect };
}

let treeScan: Scan | undefined;
function scanTree(): Scan {
  if (treeScan) return treeScan;
  const sites: CallSite[] = [];
  const indirect: string[] = [];
  for (const full of sourceFiles(SRC)) {
    const text = readFileSync(full, "utf8");
    if (!BUILDERS.some((b) => text.includes(b))) continue;
    const scan = scanSource(posix(relative(ROOT, full)), text);
    sites.push(...scan.sites);
    indirect.push(...scan.indirect);
  }
  treeScan = { sites, indirect };
  return treeScan;
}

// ---- Lexical scope (name-based; enough to tell a shadowing binding from the guarded one)

/** Every identifier a binding name declares: a plain name, or each leaf of a pattern. */
function boundNames(name: ts.BindingName): ts.Identifier[] {
  if (ts.isIdentifier(name)) return [name];
  const out: ts.Identifier[] = [];
  for (const el of name.elements) if (!ts.isOmittedExpression(el)) out.push(...boundNames(el.name));
  return out;
}

/** The identifier a statement declares under `name`, if it declares it. */
function declaredBy(stmt: ts.Node, name: string): ts.Identifier | undefined {
  if (ts.isVariableStatement(stmt)) {
    for (const d of stmt.declarationList.declarations) {
      const hit = boundNames(d.name).find((n) => n.text === name);
      if (hit) return hit;
    }
  } else if ((ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt) || ts.isEnumDeclaration(stmt)) && stmt.name?.text === name) {
    return stmt.name;
  } else if (ts.isImportDeclaration(stmt) && stmt.importClause) {
    const c = stmt.importClause;
    if (c.name?.text === name) return c.name;
    const b = c.namedBindings;
    if (b && ts.isNamespaceImport(b) && b.name.text === name) return b.name;
    if (b && ts.isNamedImports(b)) return b.elements.find((e) => e.name.text === name)?.name;
  }
  return undefined;
}

/** A `var` anywhere in a function body (not in nested functions) is hoisted to it. */
function hoistedVar(body: ts.Node, name: string): ts.Identifier | undefined {
  let hit: ts.Identifier | undefined;
  const visit = (n: ts.Node): void => {
    if (hit || (n !== body && ts.isFunctionLike(n))) return;
    if (ts.isVariableDeclarationList(n) && !(n.flags & ts.NodeFlags.BlockScoped)) {
      for (const d of n.declarations) hit ??= boundNames(d.name).find((x) => x.text === name);
      if (hit) return;
    }
    ts.forEachChild(n, visit);
  };
  visit(body);
  return hit;
}

/** The declaring identifier that a reference resolves to, walking out scope by scope. */
function declarationOf(id: ts.Identifier): ts.Identifier | undefined {
  const name = id.text;
  for (let s: ts.Node | undefined = id.parent; s; s = s.parent) {
    if (ts.isBlock(s) || ts.isSourceFile(s) || ts.isModuleBlock(s) || ts.isCaseClause(s) || ts.isDefaultClause(s)) {
      for (const st of s.statements) {
        const hit = declaredBy(st, name);
        if (hit) return hit;
      }
    }
    if ((ts.isForStatement(s) || ts.isForOfStatement(s) || ts.isForInStatement(s)) && s.initializer && ts.isVariableDeclarationList(s.initializer)) {
      for (const d of s.initializer.declarations) {
        const hit = boundNames(d.name).find((n) => n.text === name);
        if (hit) return hit;
      }
    }
    if (ts.isCatchClause(s) && s.variableDeclaration) {
      const hit = boundNames(s.variableDeclaration.name).find((n) => n.text === name);
      if (hit) return hit;
    }
    if (ts.isFunctionLike(s)) {
      for (const p of s.parameters) {
        const hit = boundNames(p.name).find((n) => n.text === name);
        if (hit) return hit;
      }
      if (ts.isFunctionExpression(s) && s.name?.text === name) return s.name;
      const body = (s as ts.FunctionLikeDeclaration).body;
      const hit = body ? hoistedVar(body, name) : undefined;
      if (hit) return hit;
    }
  }
  return undefined;
}

/** True when the identifier is only a name here (a key, a member, a declaration), not a read of a binding. */
function isNameOnly(id: ts.Identifier): boolean {
  const p = id.parent as ts.Node & { name?: ts.Node; propertyName?: ts.Node };
  if (ts.isPropertyAccessExpression(p)) return p.name === id;
  if (ts.isShorthandPropertyAssignment(p)) return false;
  return p.name === id || p.propertyName === id;
}

/** True when this expression is written: assigned (also through a destructuring target), deleted, or stepped. */
function isWritten(expr: ts.Node): boolean {
  let n = expr;
  while (
    ts.isParenthesizedExpression(n.parent) ||
    ts.isNonNullExpression(n.parent) ||
    (ts.isPropertyAssignment(n.parent) && n.parent.initializer === n) ||
    ts.isShorthandPropertyAssignment(n.parent) ||
    ts.isSpreadAssignment(n.parent) ||
    ts.isSpreadElement(n.parent) ||
    ts.isObjectLiteralExpression(n.parent) ||
    ts.isArrayLiteralExpression(n.parent)
  ) {
    n = n.parent;
  }
  const p = n.parent;
  if (ts.isBinaryExpression(p) && p.left === n && isAssignment(p.operatorToken.kind)) return true;
  if (ts.isDeleteExpression(p)) return true;
  if (
    (ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) &&
    (p.operator === ts.SyntaxKind.PlusPlusToken || p.operator === ts.SyntaxKind.MinusMinusToken)
  ) {
    return true;
  }
  return (ts.isForOfStatement(p) || ts.isForInStatement(p)) && p.initializer === n;
}

/** The line of the first write to this binding anywhere in the file. */
function writesTo(decl: ts.Identifier, sf: ts.SourceFile): number | undefined {
  let line: number | undefined;
  const visit = (n: ts.Node): void => {
    if (line !== undefined) return;
    if (ts.isIdentifier(n) && n !== decl && n.text === decl.text && !isNameOnly(n) && isWritten(n) && declarationOf(n) === decl) {
      line = lineOf(sf, n);
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return line;
}

// ---- Rules 1-4, per call site

type AgeArg =
  | { kind: "expr"; expr: ts.Expression }
  | { kind: "forward"; name: string }
  | { kind: "missing"; why: string };

/** The key a property is written under, or undefined when it is computed at run time. */
function keyOf(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) return name.expression.text;
  return undefined;
}

function ageArgument(site: CallSite): AgeArg {
  const args = site.call.arguments;
  if (site.callee === "buildPersona") {
    const spreadAt = args.findIndex((a) => ts.isSpreadElement(a));
    if (spreadAt !== -1 && spreadAt <= 2) return { kind: "missing", why: "a spread argument hides which value is the age" };
    return args[2] ? { kind: "expr", expr: args[2] } : { kind: "missing", why: "no 3rd argument" };
  }
  if (args.slice(0, 2).some((a) => ts.isSpreadElement(a))) {
    return { kind: "missing", why: "a spread argument hides which value is the opts" };
  }
  const opts = args[1];
  if (!opts) return { kind: "missing", why: "no opts argument" };
  if (ts.isIdentifier(opts)) return { kind: "forward", name: opts.text };
  if (!ts.isObjectLiteralExpression(opts)) return { kind: "missing", why: "opts is not an object literal" };

  // Object literals evaluate left to right and the last write wins, so the value that
  // reaches the builder is the LAST `minor`, and only if nothing after it can rewrite it.
  let age: ts.Expression | undefined;
  let overriddenBy: string | undefined;
  for (const prop of opts.properties) {
    if (ts.isSpreadAssignment(prop)) {
      if (age) overriddenBy = `the spread \`${norm(prop, site.sf)}\``;
      continue;
    }
    const key = prop.name ? keyOf(prop.name) : undefined;
    if (key === undefined) {
      if (age) overriddenBy = `the computed key \`${norm(prop.name!, site.sf)}\``;
      continue;
    }
    if (key !== "minor") continue;
    overriddenBy = undefined;
    if (ts.isPropertyAssignment(prop)) age = prop.initializer;
    else if (ts.isShorthandPropertyAssignment(prop)) age = prop.name;
    else return { kind: "missing", why: "`minor` is an accessor or method, not a value" };
  }
  if (!age) return { kind: "missing", why: "opts object has no `minor`" };
  if (overriddenBy) return { kind: "missing", why: `${overriddenBy} comes after \`minor\` and can override it` };
  return { kind: "expr", expr: age };
}

/**
 * A constant that is falsy whatever runs: `false`, `0`, `""`, `!true`, `!1`, `!!0`. Not
 * `null` / `undefined`: `isMinor` is null while the age is unknown (rule 3's state).
 */
function staticFalsy(expr: ts.Expression): boolean {
  const e = unwrap(expr);
  if (e.kind === ts.SyntaxKind.FalseKeyword) return true;
  if (ts.isNumericLiteral(e)) return Number(e.text) === 0;
  if (ts.isStringLiteralLike(e)) return e.text === "";
  return ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken && staticTruthy(e.operand);
}

function staticTruthy(expr: ts.Expression): boolean {
  const e = unwrap(expr);
  if (e.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (ts.isNumericLiteral(e)) return Number(e.text) !== 0;
  if (ts.isStringLiteralLike(e)) return e.text !== "";
  if (ts.isObjectLiteralExpression(e) || ts.isArrayLiteralExpression(e) || ts.isArrowFunction(e) || ts.isFunctionExpression(e)) {
    return true;
  }
  return ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken && staticFalsy(e.operand);
}

const FALLBACK_OPS = [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken];

/**
 * True when the expression is an adult constant, has one as a `?:` branch, or contains a
 * fallback to one (`x ?? F`, `x || F`, `x && F`).
 */
function defaultsToAdult(expr: ts.Expression): boolean {
  const e = unwrap(expr);
  if (staticFalsy(e)) return true;
  if (ts.isConditionalExpression(e) && (defaultsToAdult(e.whenTrue) || defaultsToAdult(e.whenFalse))) return true;
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isBinaryExpression(node) && FALLBACK_OPS.includes(node.operatorToken.kind) && staticFalsy(node.right)) found = true;
    else ts.forEachChild(node, visit);
  };
  visit(e);
  return found;
}

/** Flatten an `a || b || c` chain into its disjuncts. */
function disjuncts(expr: ts.Expression): ts.Expression[] {
  const e = ts.isParenthesizedExpression(expr) ? expr.expression : expr;
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
    return [...disjuncts(e.left), ...disjuncts(e.right)];
  }
  return [e];
}

/** A bare `return;`. A returned expression would run code while the age is unknown. */
function bareReturn(stmt: ts.Statement): boolean {
  if (ts.isReturnStatement(stmt)) return stmt.expression === undefined;
  return ts.isBlock(stmt) && stmt.statements.length === 1 && bareReturn(stmt.statements[0]);
}

/** `if (... || isMinor === null || ...) return;`: the `isMinor` it checks, or undefined. */
function unknownAgeGuard(stmt: ts.Statement, sf: ts.SourceFile): ts.Identifier | undefined {
  if (!ts.isIfStatement(stmt) || !bareReturn(stmt.thenStatement)) return undefined;
  const d = disjuncts(stmt.expression).find((x) => norm(x, sf) === "isMinor === null");
  return d && ts.isBinaryExpression(d) && ts.isIdentifier(d.left) ? d.left : undefined;
}

function contains(outer: ts.Node, inner: ts.Node): boolean {
  for (let n: ts.Node | undefined = inner; n; n = n.parent) if (n === outer) return true;
  return false;
}

/** The function whose own body runs this node: the nearest function-like around it. */
function nearestFunction(node: ts.Node): ts.SignatureDeclaration | undefined {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) if (ts.isFunctionLike(n)) return n;
  return undefined;
}

/**
 * The unconditional unknown-age guards that have run before the call: the `isMinor` of each.
 *
 * A guard has to be a top-level statement of the body of the function that makes the
 * call. Statements of one block run in order, so a guard there has always run (and
 * returned on a null age) by the time any later statement of the same call starts - which
 * is not true of a guard inside some other `if` or `try`. The statement holding the call
 * has to come after the guard, so a guard cannot run the build from its own condition.
 *
 * A guard in a function further out never counts (QA 261004 gate r4). Where a helper is
 * written says nothing about when it runs: a hoisted `function` declared after the guard
 * can be called before it, directly or through another helper, so the only order this
 * check can trust is the one inside a single body. A helper that builds guards itself.
 * "Unconditional" also means `isMinor === null` is one disjunct of the `||` chain:
 * `x && isMinor === null` lets the build run when x is false.
 */
function unknownAgeGuards(site: CallSite): ts.Identifier[] {
  const fn = nearestFunction(site.call);
  const body = fn && (fn as ts.FunctionLikeDeclaration).body;
  if (!body || !ts.isBlock(body)) return [];
  const stmts = body.statements;
  // -1 when the call is not in the body at all (a parameter default): no guard has run.
  const holderAt = stmts.findIndex((s) => contains(s, site.call));
  const found: ts.Identifier[] = [];
  for (let i = 0; i < holderAt; i++) {
    const guard = unknownAgeGuard(stmts[i], site.sf);
    if (guard) found.push(guard);
  }
  return found;
}

/** Where a module specifier points, as a repo path with no extension, for `@/` and relative specifiers. */
function importTarget(file: string, spec: string): string | undefined {
  if (spec.startsWith("@/")) return `src/${spec.slice(2)}`;
  if (spec.startsWith(".")) return posixPath.normalize(posixPath.join(posixPath.dirname(file), spec));
  return undefined;
}

/** The name a function is declared or assigned under, and the node its export flags sit on. */
function componentName(fn: ts.SignatureDeclaration): { name: ts.Identifier; decl: ts.Declaration } | undefined {
  if (ts.isFunctionDeclaration(fn) && fn.name) return { name: fn.name, decl: fn };
  if ((ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name)) {
    return { name: fn.parent.name, decl: fn.parent };
  }
  return undefined;
}

/**
 * Why an `isMinor` that is a component's prop is not the resolved age, or undefined when it
 * is. The /review session takes the age as a prop: its screen reads `useAuth()` and keys a
 * session on the age, so a switch of user or age remounts it. That is a verified prop when
 * the component cannot be given the age by anyone else: it is not exported, every use of
 * its name in the file is a JSX tag, and every render passes `isMinor={x}` once, with no
 * spread, where `x` is itself the resolved age (from `useAuth()`, or such a prop again).
 */
function propSourceProblem(param: ts.ParameterDeclaration, file: string, sf: ts.SourceFile, seen: Set<ts.Node>): string | undefined {
  const fn = param.parent;
  if (fn.parameters[0] !== param) return "is not taken from a component's props (its first parameter)";
  const component = componentName(fn);
  if (!component) return "is a prop of an anonymous component, whose renders cannot be found";
  const { name } = component;
  if (ts.getCombinedModifierFlags(component.decl) & (ts.ModifierFlags.Export | ts.ModifierFlags.Default)) {
    return `is a prop of \`${name.text}\`, which is exported, so other files can render it with any age`;
  }
  let renders = 0;
  let problem: string | undefined;
  const visit = (n: ts.Node): void => {
    if (problem) return;
    if (ts.isIdentifier(n) && n !== name && n.text === name.text && declarationOf(n) === name) {
      const p = n.parent;
      const line = lineOf(sf, n);
      if (ts.isJsxClosingElement(p) && p.tagName === n) return;
      if (!(ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p)) || p.tagName !== n) {
        problem = `is a prop of \`${name.text}\`, which line ${line} uses as a value, not only renders`;
        return;
      }
      renders++;
      const attrs = p.attributes.properties;
      if (attrs.some((a) => ts.isJsxSpreadAttribute(a))) {
        problem = `is a prop of \`${name.text}\`, rendered at line ${line} with a spread, which can carry any \`isMinor\``;
        return;
      }
      const given = attrs.filter((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText(sf) === "isMinor");
      const init = given.length === 1 ? given[0].initializer : undefined;
      const value = init && ts.isJsxExpression(init) && init.expression ? unwrap(init.expression) : undefined;
      if (!value || !ts.isIdentifier(value)) {
        problem = `is a prop of \`${name.text}\`, rendered at line ${line} without one plain \`isMinor={name}\``;
        return;
      }
      const from = declarationOf(value);
      const why = from ? ageSourceProblem(from, file, sf, seen) : "is not declared in this file";
      const written = from && !why ? writesTo(from, sf) : undefined;
      if (why) problem = `is a prop of \`${name.text}\`, rendered at line ${line} with an \`isMinor\` that ${why}`;
      else if (written !== undefined) problem = `is a prop of \`${name.text}\`, rendered at line ${line} with an \`isMinor\` assigned at line ${written}`;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (problem) return problem;
  return renders === 0 ? `is a prop of \`${name.text}\`, which this file never renders` : undefined;
}

/**
 * Why this `isMinor` binding is not the resolved age from the auth context, or undefined
 * when it is: `const { isMinor } = useAuth()` (or `{ isMinor: isMinor }`), no default, with
 * `useAuth` the name imported from AUTH_MODULE, or a verified prop (propSourceProblem). A
 * plain parameter, a renamed field, or a local `useAuth` all fail: their value is whatever
 * a caller chose (QA 261004 gate r4).
 */
function ageSourceProblem(decl: ts.Identifier, file: string, sf: ts.SourceFile, seen: Set<ts.Node> = new Set()): string | undefined {
  if (seen.has(decl)) return "is passed back to itself";
  seen.add(decl);
  const el = decl.parent;
  if (!ts.isBindingElement(el) || el.name !== decl || !ts.isObjectBindingPattern(el.parent)) {
    return "is not destructured from an object (a parameter, a plain variable, or an import)";
  }
  if (el.initializer || el.dotDotDotToken) return "has a default or is a rest element";
  if ((el.propertyName ? keyOf(el.propertyName) : decl.text) !== "isMinor") return "is another field renamed to `isMinor`";
  const v = el.parent.parent;
  if (ts.isParameter(v)) return propSourceProblem(v, file, sf, seen);
  if (!ts.isVariableDeclaration(v) || !v.initializer || !(v.parent.flags & ts.NodeFlags.Const)) {
    return "is not a `const` declaration with a value (a parameter or a `let`)";
  }
  const init = unwrap(v.initializer);
  if (!ts.isCallExpression(init) || init.arguments.length > 0 || !ts.isIdentifier(init.expression) || init.expression.text !== "useAuth") {
    return "is not read from `useAuth()`";
  }
  const hook = declarationOf(init.expression);
  const spec = hook?.parent;
  if (!spec || !ts.isImportSpecifier(spec) || spec.isTypeOnly || (spec.propertyName && spec.propertyName.text !== "useAuth")) {
    return "reads a `useAuth` that is not the imported hook";
  }
  const importDecl = spec.parent.parent.parent;
  const from = ts.isStringLiteral(importDecl.moduleSpecifier) ? importTarget(file, importDecl.moduleSpecifier.text) : undefined;
  return from === AUTH_MODULE ? undefined : `reads \`useAuth\` from somewhere other than ${AUTH_MODULE}`;
}

const where = (s: CallSite): string => `${s.file}:${s.line} ${s.callee}`;

/** Rules 1-2 for every site. */
function ageViolations(site: CallSite): string[] {
  const age = ageArgument(site);
  if (age.kind === "missing") return [`${where(site)}: ${age.why}`];
  if (age.kind === "forward") {
    const ok = LIBRARY_SITES.some((l) => l.file === site.file && l.callee === site.callee && l.age === "forward" && age.name === OPTS);
    return ok ? [] : [`${where(site)}: forwards \`${age.name}\` but is not a listed forwarder`];
  }
  return defaultsToAdult(age.expr) ? [`${where(site)}: adult default \`${age.expr.getText(site.sf)}\``] : [];
}

/** Rule 3 for a screen (.tsx) site. */
function screenViolations(site: CallSite): string[] {
  if (!site.file.endsWith(".tsx")) return [];
  const bad: string[] = [];
  const age = ageArgument(site);
  const text = age.kind === "expr" ? norm(age.expr, site.sf) : "";
  if (text !== "isMinor === true") bad.push(`${where(site)}: age is \`${text || age.kind}\`, not \`isMinor === true\``);
  const guards = unknownAgeGuards(site);
  if (guards.length === 0) {
    bad.push(`${where(site)}: no \`if (... || isMinor === null) return;\` before the build, in the function that makes it`);
    return bad;
  }
  if (age.kind !== "expr" || text !== "isMinor === true") return bad;
  const passed = declarationOf((age.expr as ts.BinaryExpression).left as ts.Identifier);
  if (!passed || !guards.some((g) => declarationOf(g) === passed)) {
    bad.push(`${where(site)}: the \`isMinor\` it passes is not the one a guard checked (a nearer binding shadows it)`);
    return bad;
  }
  const source = ageSourceProblem(passed, site.file, site.sf);
  if (source) {
    bad.push(`${where(site)}: the \`isMinor\` it passes is not the resolved age from \`useAuth()\`: it ${source}`);
    return bad;
  }
  const written = writesTo(passed, site.sf);
  if (written !== undefined) bad.push(`${where(site)}: \`isMinor\` is assigned at line ${written}, so the guarded value may not be the one passed`);
  return bad;
}

/** What is wrong with one use of the library function's own `opts`, if anything. */
function optsUseProblem(id: ts.Identifier, fn: ts.FunctionDeclaration, stmts: ts.NodeArray<ts.Statement>, buildAt: number): string | undefined {
  const p = id.parent;
  if (ts.isPropertyAccessExpression(p) && p.expression === id) {
    // `opts.x` is a read, unless the access chain is written, deleted, or called as a method.
    let top: ts.Node = p;
    while (
      (ts.isPropertyAccessExpression(top.parent) && top.parent.expression === top) ||
      (ts.isElementAccessExpression(top.parent) && top.parent.expression === top) ||
      ts.isNonNullExpression(top.parent) ||
      ts.isParenthesizedExpression(top.parent)
    ) {
      top = top.parent;
    }
    if (isWritten(top)) return "writes to it, so the age it passes on can change";
    if (ts.isCallExpression(top.parent) && top.parent.expression === top) return "calls a method on it, which can change it";
    return undefined;
  }
  if (ts.isCallExpression(p) && p.arguments.includes(id)) {
    // Inside a nested function, where the hand-off is written says nothing about when it
    // runs: a hoisted helper declared after the build can be called before it (QA 261004
    // gate r4). Only the function's own statements run in the order they are written.
    if (nearestFunction(p) !== fn) return "hands it to a call inside a nested function, which can run before the build";
    // Handed on after the build has the age it was given: nothing it does reaches that build.
    const at = stmts.findIndex((s) => contains(s, p));
    return buildAt !== -1 && at > buildAt ? undefined : "hands it to a call before the build, which can change it";
  }
  if (isWritten(id)) return "reassigns it";
  return "uses it in a way this check cannot follow (an alias, a spread, an element access)";
}

/** Rule 4 for a library (.ts) site. */
function libraryViolations(site: CallSite): string[] {
  if (site.file.endsWith(".tsx")) return [];
  const entry = LIBRARY_SITES.find((l) => l.file === site.file && l.callee === site.callee);
  if (!entry) {
    return [`${where(site)}: called outside a screen and not a listed library site, so it is a wrapper whose age no screen guard checks`];
  }
  let fn: ts.Node | undefined = site.call.parent;
  while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
  if (!fn || !ts.isFunctionDeclaration(fn) || fn.name?.text !== entry.fn || !fn.body) {
    return [`${where(site)}: not directly inside \`${entry.fn}\``];
  }
  const param = fn.parameters.find((p) => ts.isIdentifier(p.name) && p.name.text === OPTS);
  if (!param || param.initializer || param.questionToken || param.dotDotDotToken) {
    return [`${where(site)}: \`${entry.fn}\` has no required \`${OPTS}\` parameter to take the age from`];
  }
  const declared = param.name as ts.Identifier;

  const age = ageArgument(site);
  let ref: ts.Identifier | undefined;
  if (entry.age === "forward" && age.kind === "forward" && ts.isIdentifier(site.call.arguments[1])) {
    ref = site.call.arguments[1];
  }
  if (entry.age === "opts.minor" && age.kind === "expr") {
    const e = age.expr;
    if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.name.text === "minor") ref = e.expression;
  }
  const want = entry.age === "forward" ? OPTS : `${OPTS}.minor`;
  if (!ref || ref.text !== OPTS) return [`${where(site)}: passes the age as something other than \`${want}\``];
  if (declarationOf(ref) !== declared) return [`${where(site)}: \`${OPTS}\` here is not \`${entry.fn}\`'s parameter (shadowed)`];

  const fnDecl = fn;
  const stmts = fn.body.statements;
  const buildAt = stmts.findIndex((s) => contains(s, site.call));
  const bad: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n) && n.text === OPTS && n !== ref && !isNameOnly(n) && declarationOf(n) === declared) {
      const why = optsUseProblem(n, fnDecl, stmts, buildAt);
      if (why) bad.push(`${site.file}:${lineOf(site.sf, n)} ${entry.fn}: \`${norm(n.parent, site.sf).slice(0, 60)}\` ${why}`);
    }
    ts.forEachChild(n, visit);
  };
  visit(fn.body);
  return bad;
}

// ---- Rules 5-6, per file

interface AgeWrite {
  /** `<file> <function> <name>`: where, for a reader. */
  key: string;
  /** The ratchet's identity of one site: key, shape, text, and the calls and closures around it. */
  id: string;
  at: string;
  text: string;
}

type AgeShape = "param" | "binding" | "var" | "field" | "assign-default" | "prop" | "assign" | "jsx" | "arg";

/** A function's own name, or the const / key it is assigned to; undefined when anonymous. */
function functionName(fn: ts.Node): string | undefined {
  const named = (fn as ts.Node & { name?: ts.Node }).name;
  if (named && (ts.isIdentifier(named) || ts.isStringLiteral(named))) return named.text;
  const host = fn.parent;
  if (host && ts.isVariableDeclaration(host) && ts.isIdentifier(host.name)) return host.name.text;
  if (host && ts.isPropertyAssignment(host)) return keyOf(host.name);
  return undefined;
}

/** The name a call is made by: `f(...)` and `x.f(...)` give f. */
function calleeName(expr: ts.Expression): string {
  const e = unwrap(expr);
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  if (ts.isElementAccessExpression(e) && ts.isStringLiteralLike(e.argumentExpression)) return e.argumentExpression.text;
  return "<expr>";
}

/**
 * The nearest named function around a node (the owner), and what lies between them: each
 * call or JSX element the node sits in, and `=>` for each anonymous function. Siblings do
 * not enter it, so an edit elsewhere in the function leaves a frozen site's identity alone,
 * while moving the site into another call, closure, or element changes it.
 */
function siteOf(node: ts.Node, sf: ts.SourceFile): { owner: string; path: string[] } {
  const path: string[] = [];
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isCallExpression(n)) path.push(`${calleeName(n.expression)}()`);
    else if (ts.isNewExpression(n)) path.push(`new ${calleeName(n.expression)}()`);
    else if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) path.push(`<${norm(n.tagName, sf)}>`);
    else if ((ts.isClassDeclaration(n) || ts.isClassExpression(n)) && n.name) return { owner: n.name.text, path };
    else if (ts.isFunctionLike(n)) {
      const name = functionName(n);
      if (name) return { owner: name, path };
      path.push("=>");
    }
  }
  return { owner: "<module>", path };
}

/** The age name a parameter, binding, or variable declares (or reads, for `{ minor: m }`). */
function ageBindingName(n: ts.ParameterDeclaration | ts.BindingElement | ts.VariableDeclaration): string | undefined {
  if (ts.isIdentifier(n.name) && AGE_NAME.test(n.name.text)) return n.name.text;
  if (ts.isBindingElement(n) && n.propertyName) {
    const key = keyOf(n.propertyName);
    if (key && AGE_NAME.test(key)) return key;
  }
  return undefined;
}

/** The age name an assignment target writes: `minor`, `x.minor`, `x["minor"]`. */
function ageTargetName(target: ts.Expression): string | undefined {
  const t = unwrap(target);
  if (ts.isIdentifier(t)) return AGE_NAME.test(t.text) ? t.text : undefined;
  if (ts.isPropertyAccessExpression(t)) return AGE_NAME.test(t.name.text) ? t.name.text : undefined;
  if (ts.isElementAccessExpression(t) && ts.isStringLiteralLike(t.argumentExpression)) {
    return AGE_NAME.test(t.argumentExpression.text) ? t.argumentExpression.text : undefined;
  }
  return undefined;
}

/**
 * Every function in a file that takes an age as a plain positional parameter, by the name
 * it is called by: parameter index -> parameter name. Rule 6 then reads that position of
 * every call by that name. Names are not resolved through imports, so two functions of the
 * same name share an entry; that can only add a report, never hide one.
 */
type AgeParams = Map<string, Map<number, string>>;
function collectAgeParams(sf: ts.SourceFile, into: AgeParams): void {
  const visit = (n: ts.Node): void => {
    if (ts.isFunctionLike(n)) {
      const name = functionName(n);
      n.parameters.forEach((p, i) => {
        if (!name || !ts.isIdentifier(p.name) || !AGE_NAME.test(p.name.text)) return;
        const at = into.get(name) ?? new Map<number, string>();
        at.set(i, p.name.text);
        into.set(name, at);
      });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

/** Rules 5 and 6 over one file. */
function ageWrites(file: string, sf: ts.SourceFile, ageParams: AgeParams): { defaults: AgeWrite[]; writes: AgeWrite[] } {
  const defaults: AgeWrite[] = [];
  const writes: AgeWrite[] = [];
  const add = (list: AgeWrite[], node: ts.Node, name: string, shape: AgeShape): void => {
    const { owner, path } = siteOf(node, sf);
    const key = `${file} ${owner} ${name}`;
    const text = norm(node, sf);
    const id = `${key} | ${shape} | ${text}${path.length > 0 ? ` | in ${path.join(" < ")}` : ""}`;
    list.push({ key, id, at: `${file}:${lineOf(sf, node)}`, text: text.slice(0, 80) });
  };
  const visit = (n: ts.Node): void => {
    // Rule 5: defaults.
    if ((ts.isParameter(n) || ts.isBindingElement(n) || ts.isVariableDeclaration(n)) && n.initializer) {
      const name = ageBindingName(n);
      const shape = ts.isParameter(n) ? "param" : ts.isBindingElement(n) ? "binding" : "var";
      if (name && defaultsToAdult(n.initializer)) add(defaults, n, name, shape);
    }
    if (ts.isPropertyDeclaration(n) && n.initializer) {
      const key = keyOf(n.name);
      if (key && AGE_NAME.test(key) && defaultsToAdult(n.initializer)) add(defaults, n, key, "field");
    }
    // `({ minor = false } = opts)`: a destructuring assignment's default.
    if (ts.isShorthandPropertyAssignment(n) && n.objectAssignmentInitializer && AGE_NAME.test(n.name.text)) {
      if (defaultsToAdult(n.objectAssignmentInitializer)) add(defaults, n, n.name.text, "assign-default");
    }
    // Rule 6: writes.
    if (ts.isPropertyAssignment(n)) {
      const key = keyOf(n.name);
      if (key && AGE_NAME.test(key) && defaultsToAdult(n.initializer)) add(writes, n, key, "prop");
    }
    if (ts.isBinaryExpression(n) && isAssignment(n.operatorToken.kind)) {
      const name = ageTargetName(n.left);
      if (name && defaultsToAdult(n.right)) add(writes, n, name, "assign");
    }
    if (ts.isJsxAttribute(n) && AGE_NAME.test(n.name.getText(sf)) && n.initializer && ts.isJsxExpression(n.initializer)) {
      const value = n.initializer.expression;
      if (value && defaultsToAdult(value)) add(writes, n, n.name.getText(sf), "jsx");
    }
    if (ts.isCallExpression(n)) {
      const at = ageParams.get(calleeName(n.expression));
      const spreadAt = n.arguments.findIndex((a) => ts.isSpreadElement(a));
      for (const [i, name] of at ?? []) {
        const arg = n.arguments[i];
        // After a spread argument the positions are not known; rule 1 already refuses a
        // spread in a builder call, and elsewhere this rule does not reach it.
        if (arg && (spreadAt === -1 || i < spreadAt) && defaultsToAdult(arg)) add(writes, arg, name, "arg");
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { defaults, writes };
}

let treeAgeWrites: { defaults: AgeWrite[]; writes: AgeWrite[] } | undefined;
function scanTreeAgeWrites(): { defaults: AgeWrite[]; writes: AgeWrite[] } {
  if (treeAgeWrites) return treeAgeWrites;
  const files = sourceFiles(SRC).map((full) => ({ full, text: readFileSync(full, "utf8") }));
  // Every name rules 5-6 look for contains "minor" in some case, and so does every age parameter.
  const ageParams: AgeParams = new Map();
  for (const f of files) if (/minor/i.test(f.text)) collectAgeParams(parse(f.full, f.text), ageParams);
  const callees = [...ageParams.keys()];
  const defaults: AgeWrite[] = [];
  const writes: AgeWrite[] = [];
  for (const f of files) {
    // A file that names no age and calls no function taking one has nothing for rules 5-6.
    if (!/minor/i.test(f.text) && !callees.some((c) => f.text.includes(c))) continue;
    const found = ageWrites(posix(relative(ROOT, f.full)), parse(f.full, f.text), ageParams);
    defaults.push(...found.defaults);
    writes.push(...found.writes);
  }
  treeAgeWrites = { defaults, writes };
  return treeAgeWrites;
}

/**
 * Rules 5-6 ratchet. Each frozen entry stands for one site: a found site uses up one
 * matching entry, so a second site with the same identity is `added` (QA 261004 gate r4,
 * GATE-RATCHET-001), and an entry nothing used up is `gone`.
 */
function ratchet(frozen: readonly string[], found: readonly AgeWrite[]): { added: AgeWrite[]; gone: string[] } {
  const left = new Map<string, number>();
  for (const id of frozen) left.set(id, (left.get(id) ?? 0) + 1);
  const added: AgeWrite[] = [];
  for (const w of found) {
    const n = left.get(w.id) ?? 0;
    if (n > 0) left.set(w.id, n - 1);
    else added.push(w);
  }
  const gone = [...left].flatMap(([id, n]) => Array.from({ length: n }, () => id));
  return { added, gone };
}

const show = (w: AgeWrite): string => `${w.at} ${w.key}: \`${w.text}\``;

/** Rules 5-6 over one source text, with the age parameters it declares itself. */
function fileAgeWrites(file: string, text: string): { defaults: AgeWrite[]; writes: AgeWrite[] } {
  const sf = parse(file, text);
  const ageParams: AgeParams = new Map();
  collectAgeParams(sf, ageParams);
  return ageWrites(file, sf, ageParams);
}

/** Every rule against one source text (no ratchet: a fixture is never on a frozen list). */
function violations(file: string, text: string): string[] {
  const scan = scanSource(file, text);
  const found = fileAgeWrites(file, text);
  return [
    ...scan.indirect,
    ...scan.sites.flatMap((s) => [...ageViolations(s), ...screenViolations(s), ...libraryViolations(s)]),
    ...found.defaults.map((w) => `${show(w)} defaults the age to adult`),
    ...found.writes.map((w) => `${show(w)} writes an adult age`),
  ];
}

/** The parameter list of a top-level `function name(...)` in a source file. */
function paramsOf(file: ts.SourceFile, fn: string): ts.NodeArray<ts.ParameterDeclaration> | undefined {
  let found: ts.NodeArray<ts.ParameterDeclaration> | undefined;
  file.forEachChild((n) => {
    if (ts.isFunctionDeclaration(n) && n.name?.text === fn) found = n.parameters;
  });
  return found;
}

describe("every persona build carries the resolved age (C10 / DPIA 5A-R7)", () => {
  const { sites, indirect } = scanTree();

  test("the walker sees the shipped call sites (not a vacuous pass)", () => {
    const count = (file: string, callee: Builder) =>
      sites.filter((s) => s.file === file && s.callee === callee).length;
    const SCREENS = "src/screens/deepspace/DeepSpaceDesignScreens.tsx";
    // /review (DeepSpaceReviewSession) builds the persona for a proposal.
    expect(count(SCREENS, "buildPersona")).toBeGreaterThanOrEqual(1);
    // /formats?view=export (DeepSpaceFormatsScreen): .iden and HTML via exportIden, JSON via buildIdenDoc.
    expect(count(SCREENS, "exportIden")).toBeGreaterThanOrEqual(2);
    expect(count(SCREENS, "buildIdenDoc")).toBeGreaterThanOrEqual(1);
    // The library chain: exportIden -> buildIdenDoc -> buildPersona, one call per listed site.
    for (const l of LIBRARY_SITES) expect(count(l.file, l.callee)).toBe(1);
  });

  test("no builder is reached through an alias, `.call`, or a string key", () => {
    expect(indirect).toEqual([]);
  });

  test("no call leaves the age out or defaults it to adult", () => {
    expect(sites.flatMap(ageViolations)).toEqual([]);
  });

  test("a screen passes the guarded `isMinor === true` and never builds while the age is unknown", () => {
    expect(sites.flatMap(screenViolations)).toEqual([]);
  });

  test("outside a screen only the listed library chain builds, and it passes on its caller's age untouched", () => {
    expect(sites.flatMap(libraryViolations)).toEqual([]);
  });

  test("the library chain has no adult fallback to fall into", () => {
    const sf = parse(join(ROOT, "src", "lib", "iden", "build-iden.ts"));
    const exp = parse(join(ROOT, "src", "lib", "iden", "iden-export.ts"));
    const build = parse(join(ROOT, "src", "lib", "persona", "build.ts"));

    // buildPersona's own `minor` is required, with no `= false` (QA 261004 gate r2,
    // C10-001). It used to read `minor = false`, so a caller that dropped the argument
    // compiled and routed a minor as an adult.
    const personaParams = paramsOf(build, "buildPersona");
    expect(personaParams?.map((p) => p.name.getText(build))).toEqual(["userId", "locale", "minor"]);
    const minorParam = personaParams![2];
    expect(minorParam.initializer?.getText(build)).toBeUndefined();
    expect(minorParam.questionToken !== undefined).toBe(false);
    expect(minorParam.type?.getText(build)).toBe("boolean");

    // BuildIdenOpts.minor is required: a caller that forgets it is a type error, not adult routing.
    let minorMember: ts.PropertySignature | undefined;
    sf.forEachChild((n) => {
      if (ts.isInterfaceDeclaration(n) && n.name.text === "BuildIdenOpts") {
        for (const m of n.members) {
          if (ts.isPropertySignature(m) && m.name.getText(sf) === "minor") minorMember = m;
        }
      }
    });
    expect(minorMember).toBeDefined();
    // `minor?:` would put the adult default back in the type.
    expect(minorMember!.questionToken !== undefined).toBe(false);
    expect(minorMember!.type?.getText(sf)).toBe("boolean");

    // ...and neither entry point re-opens the gap with an empty-opts default.
    for (const [file, fn] of [[sf, "buildIdenDoc"], [exp, "exportIden"]] as const) {
      const p = paramsOf(file, fn)?.[1];
      expect(p).toBeDefined();
      expect(p!.initializer?.getText(file)).toBeUndefined();
      expect(p!.questionToken !== undefined).toBe(false);
    }

    // buildIdenDoc hands buildPersona exactly what it was given.
    const inner = sites.find((s) => s.file === "src/lib/iden/build-iden.ts" && s.callee === "buildPersona");
    expect(inner).toBeDefined();
    const age = ageArgument(inner!);
    expect(age.kind === "expr" ? age.expr.getText(inner!.sf) : age.kind).toBe("opts.minor");
  });

  test("no age parameter or binding anywhere in src defaults to adult beyond the frozen sites (rule 5)", () => {
    const { defaults } = scanTreeAgeWrites();
    expect(ratchet(KNOWN_AGE_DEFAULTS, defaults).added.map((w) => `${w.at} ${w.id}`)).toEqual([]);
  });

  test("no `minor` anywhere in src is written an adult value beyond the frozen sites (rule 6)", () => {
    const { writes } = scanTreeAgeWrites();
    expect(ratchet(KNOWN_AGE_WRITES, writes).added.map((w) => `${w.at} ${w.id}`)).toEqual([]);
  });

  test("the frozen lists only shrink: every entry still stands for a site in the tree", () => {
    const { defaults, writes } = scanTreeAgeWrites();
    expect(ratchet(KNOWN_AGE_DEFAULTS, defaults).gone).toEqual([]);
    expect(ratchet(KNOWN_AGE_WRITES, writes).gone).toEqual([]);
  });
});

// One screen per case. `body` is the inside of the async handler; the real screens put
// the guard first and the build inside `try`, which is the clean control below.
const IMPORTS = [
  'import { useAuth } from "@/lib/auth/AuthContext";',
  'import { buildPersona } from "@/lib/persona/build";',
  'import * as persona from "@/lib/persona/build";',
  'import { exportIden } from "@/lib/iden/iden-export";',
].join("\n");
function screen(body: string, imports: string = IMPORTS): string {
  return [
    imports,
    "export function Screen() {",
    "  const { userId, isMinor } = useAuth();",
    "  async function run(enabled: boolean, overrideOpts: object, k: string) {",
    body,
    "  }",
    "}",
  ].join("\n");
}
const GUARD = "if (!userId || isMinor === null) return;";
const FIXTURE = "src/screens/__fixture__/Screen.tsx";

describe("the checker sees each way around it (GATE-TEST-001)", () => {
  const check = (text: string): string[] => violations(FIXTURE, text);

  test("clean controls stay clean: the /review shape, a spread before `minor`, a helper that guards itself", () => {
    expect(check(screen(`${GUARD}\ntry { await buildPersona(userId, "en", isMinor === true); } catch {}`))).toEqual([]);
    expect(check(screen(`${GUARD}\nawait exportIden(userId, { ...overrideOpts, locale: "en", minor: isMinor === true });`))).toEqual([]);
    expect(check(screen(`${GUARD}\nawait persona.buildPersona(userId, "en", isMinor === true);`))).toEqual([]);
    // persona.tsx's shape: a function declaration that checks the age itself, then its call.
    expect(check(screen(`${GUARD}\nfunction go() { ${GUARD} void buildPersona(userId, "en", isMinor === true); }\ngo();`))).toEqual([]);
  });

  test("an aliased import is reported", () => {
    const text = screen(
      `${GUARD}\nawait bp(userId, "en", false);`,
      'import { buildPersona as bp } from "@/lib/persona/build";',
    );
    expect(check(text).join("\n")).toMatch(/buildPersona: referenced as .*not called by name/);
  });

  test("a value alias, `.call`, and a destructured alias are reported", () => {
    expect(check(screen(`${GUARD}\nconst bp = buildPersona;\nawait bp(userId, "en", false);`)).join("\n"))
      .toMatch(/not called by name/);
    expect(check(screen(`${GUARD}\nawait buildPersona.call(null, userId, "en", false);`)).join("\n"))
      .toMatch(/not called by name/);
    expect(check(screen(`${GUARD}\nconst { buildPersona: bp } = await import("@/lib/persona/build");\nawait bp(userId, "en", false);`)).join("\n"))
      .toMatch(/not called by name/);
  });

  test("a string key is reported", () => {
    expect(check(screen(`${GUARD}\nawait persona["buildPersona"](userId, "en", false);`)).join("\n"))
      .toMatch(/named by a string/);
  });

  test("a method call is a call site, so a missing age on it is reported", () => {
    expect(check(screen(`${GUARD}\nawait persona.buildPersona(userId, "en");`)).join("\n"))
      .toMatch(/buildPersona: no 3rd argument/);
  });

  test("a guard that may not run is not credited", () => {
    // Nested in another `if`: with enabled === false the guard is skipped and the build runs.
    expect(check(screen(`if (enabled) { if (isMinor === null) return; }\nawait buildPersona(userId!, "en", isMinor === true);`)).join("\n"))
      .toMatch(/no `if \(\.\.\. \|\| isMinor === null\) return;` before the build/);
    // Inside a `try`: a throw ahead of it skips it.
    expect(check(screen(`try { await enabledCheck(); if (isMinor === null) return; } catch {}\nawait buildPersona(userId!, "en", isMinor === true);`)).join("\n"))
      .toMatch(/before the build/);
    // `x && isMinor === null` lets the build run when x is false.
    expect(check(screen(`if (enabled && isMinor === null) return;\nawait buildPersona(userId!, "en", isMinor === true);`)).join("\n"))
      .toMatch(/before the build/);
  });

  test("a closure built before the guard does not borrow it", () => {
    expect(check(screen(`const go = () => buildPersona(userId!, "en", isMinor === true);\n${GUARD}\nawait go();`)).join("\n"))
      .toMatch(/before the build/);
    // A hoisted helper called ahead of the guard runs before it, however late it is written.
    expect(check(screen(`go();\n${GUARD}\nfunction go() { void buildPersona(userId!, "en", isMinor === true); }`)).join("\n"))
      .toMatch(/before the build/);
  });

  test("anything after `minor` that can override it is reported", () => {
    expect(check(screen(`${GUARD}\nawait exportIden(userId, { minor: isMinor === true, ...overrideOpts });`)).join("\n"))
      .toMatch(/the spread `\.\.\.overrideOpts` comes after `minor`/);
    expect(check(screen(`${GUARD}\nawait exportIden(userId, { minor: isMinor === true, [k]: false });`)).join("\n"))
      .toMatch(/the computed key `\[k\]` comes after `minor`/);
    expect(check(screen(`${GUARD}\nawait exportIden(userId, { locale: "en", get minor() { return false; } });`)).join("\n"))
      .toMatch(/accessor or method/);
    // Two `minor` keys: the last one is what arrives, and here it is the adult default.
    expect(check(screen(`${GUARD}\nawait exportIden(userId, { minor: isMinor === true, "minor": false });`)).join("\n"))
      .toMatch(/adult default `false`/);
  });

  test("adult defaults, spread arguments, and unlisted forwarders are reported", () => {
    expect(check(screen(`${GUARD}\nawait exportIden(userId, { minor: isMinor ?? false });`)).join("\n"))
      .toMatch(/adult default `isMinor \?\? false`/);
    expect(check(screen(`${GUARD}\nawait buildPersona(...([userId, "en", false] as const));`)).join("\n"))
      .toMatch(/spread argument/);
    expect(violations("src/lib/fixture.ts", 'import { exportIden } from "./x";\nexport async function f(u: string, opts: never) { return exportIden(u, opts); }').join("\n"))
      .toMatch(/forwards `opts` but is not a listed forwarder/);
  });
});

// The listed library chain, one function at a time, in the shape it has in the tree.
const FORWARDER = "src/lib/iden/iden-export.ts";
function forwarder(body: string, params = "userId: string, opts: ExportIdenOpts"): string {
  return [
    'import { buildIdenDoc } from "./build-iden";',
    `export async function exportIden(${params}): Promise<IdenExport> {`,
    body,
    "}",
  ].join("\n");
}
const FORWARD = "const doc = await buildIdenDoc(userId, opts);\nreturn buildIdenExport(doc, opts);";
const BUILD_IDEN = "src/lib/iden/build-iden.ts";
function buildIden(body: string): string {
  return [
    'import { buildPersona } from "@/lib/persona/build";',
    "export async function buildIdenDoc(userId: string, opts: BuildIdenOpts): Promise<IdenDoc> {",
    body,
    "}",
  ].join("\n");
}
const BUILD = [
  'const locale: Locale = opts.locale ?? "en";',
  "const [persona, n] = await Promise.all([buildPersona(userId, locale, opts.minor), countRows(userId)]);",
  "return compose(persona, { name: opts.name ?? null, n });",
].join("\n");

describe("the checker sees each way around it (QA 261004 gate r3, GATE-TEST-001)", () => {
  const lib = (text: string, file = "src/lib/fixture.ts"): string => violations(file, text).join("\n");
  const check = (text: string): string[] => violations(FIXTURE, text);

  test("clean controls stay clean: the two listed library functions as they are", () => {
    expect(violations(FORWARDER, forwarder(FORWARD))).toEqual([]);
    expect(violations(BUILD_IDEN, buildIden(BUILD))).toEqual([]);
  });

  test("a .ts wrapper with an adult default is reported, as a wrapper and as a default (rules 4, 5)", () => {
    const text = [
      'import { buildPersona } from "@/lib/persona/build";',
      'export async function wrap(u: string, minor = false) { return buildPersona(u, "en", minor); }',
    ].join("\n");
    expect(lib(text)).toMatch(/buildPersona: called outside a screen and not a listed library site/);
    expect(lib(text)).toMatch(/src\/lib\/fixture\.ts wrap minor: `minor = false` defaults the age to adult/);
  });

  test("a .ts wrapper is reported however it names or computes the age (rule 4)", () => {
    expect(lib('import { buildPersona } from "@/lib/persona/build";\nexport const wrap = (u: string, young: boolean) => buildPersona(u, "en", young);'))
      .toMatch(/called outside a screen and not a listed library site/);
    // The listed file, but a different function in it: still a wrapper.
    expect(violations(BUILD_IDEN, buildIden(BUILD).replace("function buildIdenDoc", "function buildIdenDocForAdults")).join("\n"))
      .toMatch(/not directly inside `buildIdenDoc`/);
  });

  test("the forwarder cannot change `opts` before it forwards it (rule 4)", () => {
    // A write to the age, plain or by key.
    expect(violations(FORWARDER, forwarder(`opts.minor = !opts.minor;\n${FORWARD}`)).join("\n"))
      .toMatch(/`opts.minor` writes to it/);
    expect(violations(FORWARDER, forwarder(`opts["minor"] = !opts.minor;\n${FORWARD}`)).join("\n"))
      .toMatch(/uses it in a way this check cannot follow/);
    // Handing it to anything before the build.
    expect(violations(FORWARDER, forwarder(`Object.assign(opts, { locale: "en" });\n${FORWARD}`)).join("\n"))
      .toMatch(/hands it to a call before the build/);
    expect(violations(FORWARDER, forwarder(`opts.reset();\n${FORWARD}`)).join("\n"))
      .toMatch(/calls a method on it/);
    // An alias, and a reassignment.
    expect(violations(FORWARDER, forwarder(`const o = opts;\no.minor = !o.minor;\n${FORWARD}`)).join("\n"))
      .toMatch(/uses it in a way this check cannot follow/);
    expect(violations(FORWARDER, forwarder(`opts = { ...opts, minor: !opts.minor };\n${FORWARD}`)).join("\n"))
      .toMatch(/reassigns it/);
  });

  test("the forwarder forwards its own required parameter, not a shadow (rule 4)", () => {
    expect(violations(FORWARDER, forwarder(`{ const opts = { locale: "en", minor: !true }; const doc = await buildIdenDoc(userId, opts); return buildIdenExport(doc, opts); }`)).join("\n"))
      .toMatch(/`opts` here is not `exportIden`'s parameter \(shadowed\)/);
    expect(violations(FORWARDER, forwarder(FORWARD, "userId: string, opts: ExportIdenOpts = { minor: !true }")).join("\n"))
      .toMatch(/has no required `opts` parameter/);
    expect(violations(FORWARDER, forwarder(FORWARD, "userId: string, opts?: ExportIdenOpts")).join("\n"))
      .toMatch(/has no required `opts` parameter/);
  });

  test("buildIdenDoc passes `opts.minor` itself, unchanged (rule 4)", () => {
    expect(violations(BUILD_IDEN, buildIden(`opts.minor = !opts.minor;\n${BUILD}`)).join("\n"))
      .toMatch(/writes to it/);
    expect(violations(BUILD_IDEN, buildIden(BUILD.replace("opts.minor)", "!opts.minor)"))).join("\n"))
      .toMatch(/passes the age as something other than `opts.minor`/);
  });

  test("an age default in any shape is reported, anywhere in src (rule 5)", () => {
    for (const [text, shape] of [
      ["export function f(isMinor = false) {}", "isMinor = false"],
      ["export const g = ({ minor = false }: { minor?: boolean }) => minor;", "minor = false"],
      ["export function h({ minor: young = false }: { minor?: boolean }) { return young; }", "minor: young = false"],
      ["export function k(o: { minor?: boolean }, minor = o.minor ?? false) {}", "minor = o.minor \\?\\? false"],
      ["export function m(minor = (false as boolean)) {}", "minor = \\(false as boolean\\)"],
      ["export function n() { const minor = false; return minor; }", "minor = false"],
    ] as const) {
      expect(lib(text)).toMatch(new RegExp(`\`${shape}\` defaults the age to adult`));
    }
  });

  test("an adult value written to an age property is reported, anywhere in src (rule 6)", () => {
    for (const [text, shape] of [
      ['callLlm({ purpose: "x", minor: false });', "minor: false"],
      ["const r = { isMinor: false as boolean };", "isMinor: false as boolean"],
      ["req.minor = false;", "req.minor = false"],
      ['req["minor"] = false;', 'req\\["minor"\\] = false'],
      ["req.minor ||= x ?? false;", "req.minor \\|\\|= x \\?\\? false"],
    ] as const) {
      expect(lib(text)).toMatch(new RegExp(`\`${shape}\` writes an adult age`));
    }
  });

  test("a guard is a bare `return;` and does not itself run a hoisted helper (rule 3)", () => {
    // A returned expression runs while the age is unknown.
    expect(check(screen(`if (!userId || isMinor === null) return actions.go();\nawait buildPersona(userId!, "en", isMinor === true);`)))
      .toEqual([expect.stringMatching(/no `if \(\.\.\. \|\| isMinor === null\) return;` before the build/)]);
    // The guard's own condition calls the hoisted helper first.
    expect(check(screen(`if (go() || isMinor === null) return;\nfunction go() { void buildPersona(userId!, "en", isMinor === true); return false; }`)))
      .toEqual([expect.stringMatching(/before the build/)]);
  });

  test("the `isMinor` passed has to be the one the guard checked (rule 3)", () => {
    // A parameter of the same name in a closure built after the guard: the closure has no
    // guard of its own, and with one, its parameter is not the age from useAuth().
    expect(check(screen(`${GUARD}\nconst inner = (isMinor: boolean | null) => buildPersona(userId!, "en", isMinor === true);\nawait inner(null);`)).join("\n"))
      .toMatch(/no `if \(\.\.\. \|\| isMinor === null\) return;` before the build, in the function that makes it/);
    expect(check(screen(`${GUARD}\nconst inner = (isMinor: boolean | null) => { if (isMinor === null) return; return buildPersona(userId!, "en", isMinor === true); };\nawait inner(false);`)).join("\n"))
      .toMatch(/is not the resolved age from `useAuth\(\)`: it is not destructured from an object/);
    // A block-scoped const of the same name.
    expect(check(screen(`${GUARD}\n{ const isMinor: boolean | null = null; await buildPersona(userId!, "en", isMinor === true); }`)).join("\n"))
      .toMatch(/is not the one a guard checked/);
    // The guarded binding itself, reassigned after the guard.
    expect(check(screen(`${GUARD}\nisMinor = await refetchAge();\nawait buildPersona(userId!, "en", isMinor === true);`)).join("\n"))
      .toMatch(/`isMinor` is assigned at line \d+/);
  });
});

// ---- QA 261004 gate r4: a .tsx helper's age, helper order, and the ratchet per site.

describe("the checker sees each way around it (QA 261004 gate r4, GATE-TEST-001 / GATE-RATCHET-001)", () => {
  const check = (text: string): string => violations(FIXTURE, text).join("\n");
  const NOT_FROM_AUTH = /is not the resolved age from `useAuth\(\)`/;

  test("a .tsx helper that takes the age as an argument is reported, however it guards it (rule 3)", () => {
    // The helper guards its own parameter, so rules 1-3 alone would pass it, and its
    // caller hands it `false`.
    const moduleHelper = [
      IMPORTS,
      "async function exportFor(userId: string, isMinor: boolean | null) {",
      "  if (!userId || isMinor === null) return;",
      '  await buildPersona(userId, "en", isMinor === true);',
      "}",
      "export function Screen() {",
      "  const { userId } = useAuth();",
      "  async function run() { if (!userId) return; await exportFor(userId, false); }",
      "}",
    ].join("\n");
    expect(check(moduleHelper)).toMatch(NOT_FROM_AUTH);
    // The same helper inside the component.
    expect(check(screen(`${GUARD}\nasync function inner(isMinor: boolean | null) { if (isMinor === null) return; await buildPersona(userId!, "en", isMinor === true); }\nawait inner(false);`)))
      .toMatch(NOT_FROM_AUTH);
  });

  test("the guarded `isMinor` has to be the one useAuth() resolved, nothing else of that name (rule 3)", () => {
    const local = (decl: string, imports: string = IMPORTS) =>
      check(screen(`${decl}\nif (!userId || isMinor === null) return;\nawait buildPersona(userId, "en", isMinor === true);`, imports));
    // Another hook, a renamed field, a default, a `let`.
    expect(local("const { isMinor } = useProfile();")).toMatch(/it is not read from `useAuth\(\)`/);
    expect(local("const { isAdult: isMinor } = useAuth();")).toMatch(/it is another field renamed to `isMinor`/);
    expect(local("const { isMinor = null } = useAuth();")).toMatch(/it has a default/);
    expect(local("let { isMinor } = useAuth();")).toMatch(/it is not a `const` declaration/);
    // A `useAuth` that is not the hook from the auth context.
    const fake = IMPORTS.replace('"@/lib/auth/AuthContext"', '"@/lib/auth/fake-auth"');
    expect(local("const { isMinor } = useAuth();", fake)).toMatch(/reads `useAuth` from somewhere other than src\/lib\/auth\/AuthContext/);
    expect(local("const { isMinor } = useAuth();", IMPORTS.replace("{ useAuth }", "{ useAuthStub as useAuth }")))
      .toMatch(/reads a `useAuth` that is not the imported hook/);
    expect(local("function useAuth() { return { isMinor: null }; }\nconst { isMinor } = useAuth();"))
      .toMatch(/reads a `useAuth` that is not the imported hook/);
  });

  test("clean controls: the hook's own binding, imported by a relative path, or read in a custom hook", () => {
    const relative = IMPORTS.replace('"@/lib/auth/AuthContext"', '"../../lib/auth/AuthContext"');
    expect(violations(FIXTURE, screen(`${GUARD}\nawait buildPersona(userId, "en", isMinor === true);`, relative))).toEqual([]);
    const customHook = [
      IMPORTS,
      "export function useExportIden() {",
      "  const { userId, isMinor } = useAuth();",
      "  return async () => {",
      `    ${GUARD}`,
      '    return exportIden(userId, { locale: "en", minor: isMinor === true });',
      "  };",
      "}",
    ].join("\n");
    expect(violations(FIXTURE, customHook)).toEqual([]);
  });

  // /review's shape: the screen reads useAuth() and renders a keyed session with the age.
  function session(render: string, opts: { exported?: boolean; extra?: string } = {}): string {
    return [
      IMPORTS,
      "interface P { userId: string | null; isMinor: boolean | null }",
      "export function Outer() {",
      "  const { userId, isMinor } = useAuth();",
      `  return ${render};`,
      "}",
      `${opts.exported ? "export " : ""}function Inner({ userId, isMinor }: P) {`,
      `  async function go() { ${GUARD} await buildPersona(userId, "en", isMinor === true); }`,
      "  return null;",
      "}",
      opts.extra ?? "",
    ].join("\n");
  }
  const RENDER = '<Inner key="k" userId={userId} isMinor={isMinor} />';

  test("a verified prop is the resolved age: /review's keyed session (rule 3)", () => {
    expect(violations(FIXTURE, session(RENDER))).toEqual([]);
    // Passed down twice is still the same age.
    const twice = session(RENDER.replace("<Inner", "<Middle"), {
      extra: "function Middle({ userId, isMinor }: P) { return <Inner userId={userId} isMinor={isMinor} />; }",
    });
    expect(violations(FIXTURE, twice)).toEqual([]);
  });

  test("a prop is not the resolved age when anyone else can set it (rule 3)", () => {
    expect(check(session(RENDER, { exported: true }))).toMatch(/`Inner`, which is exported/);
    expect(check(session(RENDER.replace("isMinor={isMinor}", "isMinor={false}")))).toMatch(/without one plain `isMinor=\{name\}`/);
    expect(check(session(RENDER.replace("isMinor={isMinor}", "{...{ isMinor }}")))).toMatch(/with a spread/);
    expect(check(session(RENDER.replace("isMinor={isMinor}", "isMinor={isMinor} isMinor={isMinor}")))).toMatch(/without one plain/);
    expect(check(session("null"))).toMatch(/`Inner`, which this file never renders/);
    // Not the props: React hands a component's second parameter something else entirely.
    expect(check(session(RENDER).replace("function Inner({ userId, isMinor }: P)", "function Inner({ userId }: P, { isMinor }: P)")))
      .toMatch(/is not taken from a component's props \(its first parameter\)/);
    // A second render that hands it something else.
    expect(check(session(`<>${RENDER}<Inner userId={userId} isMinor={pretend} /></>`, { extra: "const pretend = null;" })))
      .toMatch(/rendered at line \d+ with an `isMinor` that is not destructured/);
    // The component used as a value: called, aliased, or given to createElement.
    expect(check(session(RENDER, { extra: "export const Alias = Inner;" }))).toMatch(/which line \d+ uses as a value/);
    expect(check(session(RENDER, { extra: 'createElement(Inner, { userId: "u", isMinor: null });' }))).toMatch(/uses as a value/);
  });

  test("a helper does not borrow a guard from the function around it, wherever it is written (rule 3)", () => {
    // The pre-r4 persona.tsx shape: the guard is outside, the helper that builds has none.
    expect(check(screen(`${GUARD}\nfunction go() { void buildPersona(userId!, "en", isMinor === true); }\ngo();`)))
      .toMatch(/no `if \(\.\.\. \|\| isMinor === null\) return;` before the build, in the function that makes it/);
    // Declared after the guard, run before it through another hoisted helper.
    expect(check(screen(`pre();\n${GUARD}\nfunction go() { void buildPersona(userId!, "en", isMinor === true); }\nfunction pre() { go(); }`)))
      .toMatch(/before the build, in the function that makes it/);
  });

  test("a nested function cannot hand `opts` on before the build, wherever it is written (rule 4)", () => {
    // A hoisted helper declared after the build and called before it.
    expect(violations(FORWARDER, forwarder(`normalize();\n${FORWARD}\nfunction normalize() { Object.assign(opts, { locale: "en" }); }`)).join("\n"))
      .toMatch(/hands it to a call inside a nested function, which can run before the build/);
    expect(violations(BUILD_IDEN, buildIden(`tweak();\n${BUILD}\nfunction tweak() { reshape(opts); }`)).join("\n"))
      .toMatch(/hands it to a call inside a nested function, which can run before the build/);
    // A callback is a nested function too.
    expect(violations(FORWARDER, forwarder(`[0].forEach(() => reshape(opts));\n${FORWARD}`)).join("\n"))
      .toMatch(/hands it to a call inside a nested function/);
  });

  // The ratchet itself, on a small file standing in for a frozen one.
  const RFILE = "src/lib/fixture.ts";
  const FROZEN_SRC = [
    "export function route(text: string, minor = false) { return text; }",
    "export async function embed(opts: { minor?: boolean }) {",
    "  return embedTexts({ texts: [], minor: opts.minor ?? false });",
    "}",
  ].join("\n");
  const frozen = fileAgeWrites(RFILE, FROZEN_SRC);
  const frozenDefaults = frozen.defaults.map((w) => w.id);
  const frozenWrites = frozen.writes.map((w) => w.id);
  const against = (text: string) => {
    const found = fileAgeWrites(RFILE, text);
    return { defaults: ratchet(frozenDefaults, found.defaults), writes: ratchet(frozenWrites, found.writes) };
  };
  const ids = (r: { added: AgeWrite[]; gone: string[] }) => ({ added: r.added.map((w) => w.id), gone: r.gone });

  test("a frozen entry names one site: its function, shape, text, and the calls around it (GATE-RATCHET-001)", () => {
    expect(frozenDefaults).toEqual(["src/lib/fixture.ts route minor | param | minor = false"]);
    expect(frozenWrites).toEqual(["src/lib/fixture.ts embed minor | prop | minor: opts.minor ?? false | in embedTexts()"]);
    const same = against(FROZEN_SRC);
    expect([ids(same.defaults), ids(same.writes)]).toEqual([{ added: [], gone: [] }, { added: [], gone: [] }]);
  });

  test("a second site in a frozen function is reported, even one identical to the frozen site (GATE-RATCHET-001)", () => {
    // The same call twice: same identity, so only the count can tell them apart.
    const twice = against(FROZEN_SRC.replace(
      "  return embedTexts(",
      "  await embedTexts({ texts: [\"again\"], minor: opts.minor ?? false });\n  return embedTexts(",
    ));
    expect(ids(twice.writes)).toEqual({ added: [frozenWrites[0]], gone: [] });
    // A second default in the frozen function, in a closure inside it.
    const inner = against(FROZEN_SRC.replace("{ return text; }", "{ const pick = (minor = false) => minor; return pick() ? text : text; }"));
    expect(ids(inner.defaults)).toEqual({ added: ["src/lib/fixture.ts pick minor | param | minor = false"], gone: [] });
    const anon = against(FROZEN_SRC.replace("{ return text; }", "{ return [text].map((t, i, a, minor = false) => (minor ? t : t))[0]; }"));
    expect(ids(anon.defaults)).toEqual({ added: ["src/lib/fixture.ts route minor | param | minor = false | in => < map()"], gone: [] });
  });

  test("swapping a frozen site for another under the same key is reported both ways (GATE-RATCHET-001)", () => {
    // The parameter default traded for a variable of the same name and value.
    const swapped = against(FROZEN_SRC.replace("minor = false) { return text; }", "minor?: boolean) { const minor = false; return text; }"));
    expect(ids(swapped.defaults).added).toEqual(["src/lib/fixture.ts route minor | var | minor = false"]);
    expect(ids(swapped.defaults).gone).toEqual([frozenDefaults[0]]);
    // The write moved into another call in the same function.
    const moved = against(FROZEN_SRC.replace(
      "return embedTexts({ texts: [], minor: opts.minor ?? false });",
      "return embedTexts({ texts: [] }).then(() => callLlm({ minor: opts.minor ?? false }));",
    ));
    expect(ids(moved.writes)).toEqual({
      added: ["src/lib/fixture.ts embed minor | prop | minor: opts.minor ?? false | in callLlm() < => < then()"],
      gone: [frozenWrites[0]],
    });
  });

  test("an edit elsewhere in a frozen function leaves its site alone (GATE-RATCHET-001)", () => {
    const edited = against(FROZEN_SRC.replace("{ return text; }", "{\n  const trimmed = text.trim();\n  return trimmed;\n}")
      .replace("  return embedTexts(", "  const n = 1;\n  return embedTexts("));
    expect([ids(edited.defaults), ids(edited.writes)]).toEqual([{ added: [], gone: [] }, { added: [], gone: [] }]);
  });

  test("rules 5-6 see an adult constant in any spelling, a JSX attribute, a class field, and a positional argument", () => {
    const lib = (text: string, file = RFILE): string => violations(file, text).join("\n");
    for (const [text, shape] of [
      ["export function f(minor = !true) {}", "minor = !true"],
      ["export function g(isMinor = !1) {}", "isMinor = !1"],
      ["export class Req { minor = false; }", "minor = false;"],
      ["export function h(o: { minor?: boolean }) { let minor: boolean; ({ minor = false } = o); return minor; }", "minor = false"],
    ] as const) {
      expect(lib(text)).toMatch(new RegExp(`\`${shape}\` defaults the age to adult`));
    }
    for (const [text, shape] of [
      ['callLlm({ purpose: "x", minor: known ? isMinor : false });', "minor: known \\? isMinor : false"],
      ['callLlm({ purpose: "x", minor: x && 0 });', "minor: x && 0"],
      ['callLlm({ purpose: "x", isMinor: "" });', 'isMinor: ""'],
    ] as const) {
      expect(lib(text)).toMatch(new RegExp(`\`${shape}\` writes an adult age`));
    }
    expect(lib("export const P = () => <Panel minor={false} />;", "src/screens/__fixture__/P.tsx"))
      .toMatch(/`minor=\{false\}` writes an adult age/);
    // A positional `false` where a function in the tree takes the age.
    const positional = "export function routeIt(text: string, minor: boolean) { return text; }\nrouteIt(\"x\", false);\nroute.routeIt(\"x\", !true);";
    expect(lib(positional).split("\n").filter((l) => l.includes("writes an adult age"))).toEqual([
      expect.stringMatching(/:2 src\/lib\/fixture\.ts <module> minor: `false` writes/),
      expect.stringMatching(/:3 src\/lib\/fixture\.ts <module> minor: `!true` writes/),
    ]);
    // `null` is the unknown age, not an adult one, and a computed age is not a constant.
    expect(lib('callLlm({ purpose: "x", isMinor: null, minor: age < 18 });')).toBe("");
  });
});
