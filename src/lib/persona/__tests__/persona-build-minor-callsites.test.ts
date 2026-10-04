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
// under src/, not only at the screens that exist today.
//
// The rules, per call of buildPersona / buildIdenDoc / exportIden:
//   0. the builder is only ever called by its own name, either `buildPersona(...)` or
//      `ns.buildPersona(...)`. An alias (`import { buildPersona as bp }`, `const bp =
//      buildPersona`, `{ buildPersona: bp } = ...`), `.call` / `.apply`, or a string key
//      (`ns["buildPersona"]`) would hide a call from rules 1-3, so it is reported;
//   1. the age argument is present (buildPersona's 3rd argument, or `minor` in the opts
//      object of the other two) and nothing after it in that object can override it (a
//      later spread, a later computed key, an accessor);
//   2. it is never an adult default - no `false` literal and no `?? false` / `|| false`;
//   3. a screen (.tsx) passes `isMinor === true`, and some function enclosing the call
//      has an unconditional `if (... || isMinor === null ...) return;` as a top-level
//      statement of its body, ahead of the statement that holds the call. A guard nested
//      inside another `if`, or a closure built before the guard, does not count
//      (fail-closed while the age is unknown, the /review pattern);
//   4. the one library forwarder (exportIden -> buildIdenDoc) may pass its opts through,
//      because BuildIdenOpts.minor is required and those opts have no `{}` default.
//
// The bottom block feeds the checker one small source per bypass form, so a rule that
// stops seeing its case turns this suite red instead of passing on a tree that happens
// to be clean (QA 261004 gate r2, GATE-TEST-001).

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import * as ts from "typescript";

const ROOT = join(__dirname, "..", "..", "..", "..");
const SRC = join(ROOT, "src");
const BUILDERS = ["buildPersona", "buildIdenDoc", "exportIden"] as const;
type Builder = (typeof BUILDERS)[number];
const isBuilder = (name: string): name is Builder => (BUILDERS as readonly string[]).includes(name);

/** Library functions allowed to forward a typed opts object instead of spelling `minor`. */
const FORWARDERS: ReadonlyArray<{ file: string; callee: Builder; arg: string }> = [
  { file: "src/lib/iden/iden-export.ts", callee: "buildIdenDoc", arg: "opts" },
];

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
  /** References that are not a direct call by name, so rules 1-3 cannot see the call. */
  indirect: string[];
}

const lineOf = (sf: ts.SourceFile, node: ts.Node): number =>
  sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

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

/** True when the expression is, or contains, an adult default. */
function defaultsToAdult(expr: ts.Expression): boolean {
  let found = expr.kind === ts.SyntaxKind.FalseKeyword;
  const visit = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken) &&
      node.right.kind === ts.SyntaxKind.FalseKeyword
    ) {
      found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(expr);
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

function returnsOnly(stmt: ts.Statement): boolean {
  if (ts.isReturnStatement(stmt)) return true;
  return ts.isBlock(stmt) && stmt.statements.length === 1 && ts.isReturnStatement(stmt.statements[0]);
}

/** `if (... || isMinor === null || ...) return;` - returns whenever the age is unknown. */
function isUnknownAgeGuard(stmt: ts.Statement, sf: ts.SourceFile): boolean {
  return (
    ts.isIfStatement(stmt) &&
    returnsOnly(stmt.thenStatement) &&
    disjuncts(stmt.expression).some((d) => norm(d, sf) === "isMinor === null")
  );
}

function contains(outer: ts.Node, inner: ts.Node): boolean {
  for (let n: ts.Node | undefined = inner; n; n = n.parent) if (n === outer) return true;
  return false;
}

function mentions(node: ts.Node, name: string): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isIdentifier(n) && n.text === name) found = true;
    else ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/**
 * Does some function enclosing the call run an unconditional unknown-age guard before it?
 *
 * The guard has to be a top-level statement of that function's body. Statements of one
 * block run in order, so a guard there has always run (and returned on a null age) by the
 * time any later statement starts - which is not true of a guard inside some other `if`
 * or `try`. The statement holding the call has to come after the guard, so a closure
 * built before the guard does not borrow it. A hoisted `function` declaration can run
 * before the guard however late it is written, so it counts only when nothing ahead of
 * the guard names it. "Unconditional" also means `isMinor === null` is one disjunct of the
 * `||` chain: `x && isMinor === null` lets the build run when x is false.
 */
function guardedOnUnknownAge(site: CallSite): boolean {
  for (let node: ts.Node | undefined = site.call.parent; node; node = node.parent) {
    if (!ts.isFunctionLike(node)) continue;
    const body = (node as ts.FunctionLikeDeclaration).body;
    if (!body || !ts.isBlock(body)) continue;
    const stmts = body.statements;
    const holderAt = stmts.findIndex((s) => contains(s, site.call));
    if (holderAt === -1) continue;
    const guardAt = stmts.findIndex((s, i) => i < holderAt && isUnknownAgeGuard(s, site.sf));
    if (guardAt === -1) continue;
    const holder = stmts[holderAt];
    if (ts.isFunctionDeclaration(holder) && holder.name) {
      const name = holder.name.text;
      if (stmts.slice(0, guardAt).some((s) => mentions(s, name))) continue;
    }
    return true;
  }
  return false;
}

const where = (s: CallSite): string => `${s.file}:${s.line} ${s.callee}`;

/** Rules 1-2 for every site. */
function ageViolations(site: CallSite): string[] {
  const age = ageArgument(site);
  if (age.kind === "missing") return [`${where(site)}: ${age.why}`];
  if (age.kind === "forward") {
    const ok = FORWARDERS.some((f) => f.file === site.file && f.callee === site.callee && f.arg === age.name);
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
  if (!guardedOnUnknownAge(site)) bad.push(`${where(site)}: no \`if (... || isMinor === null) return;\` before the build`);
  return bad;
}

/** Every rule against one source text. */
function violations(file: string, text: string): string[] {
  const scan = scanSource(file, text);
  return [...scan.indirect, ...scan.sites.flatMap((s) => [...ageViolations(s), ...screenViolations(s)])];
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
    // The library chain: exportIden -> buildIdenDoc -> buildPersona.
    expect(count("src/lib/iden/iden-export.ts", "buildIdenDoc")).toBe(1);
    expect(count("src/lib/iden/build-iden.ts", "buildPersona")).toBe(1);
  });

  test("no builder is reached through an alias, `.call`, or a string key", () => {
    expect(indirect).toEqual([]);
  });

  test("no call leaves the age out or defaults it to adult", () => {
    expect(sites.flatMap(ageViolations)).toEqual([]);
  });

  test("a screen passes `isMinor === true` and never builds while the age is unknown", () => {
    expect(sites.flatMap(screenViolations)).toEqual([]);
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
});

// One screen per case. `body` is the inside of the async handler; the real screens put
// the guard first and the build inside `try`, which is the clean control below.
const IMPORTS = [
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

  test("clean controls stay clean: the /review shape, a spread before `minor`, a late hoisted helper", () => {
    expect(check(screen(`${GUARD}\ntry { await buildPersona(userId, "en", isMinor === true); } catch {}`))).toEqual([]);
    expect(check(screen(`${GUARD}\nawait exportIden(userId, { ...overrideOpts, locale: "en", minor: isMinor === true });`))).toEqual([]);
    expect(check(screen(`${GUARD}\nawait persona.buildPersona(userId, "en", isMinor === true);`))).toEqual([]);
    // persona.tsx's shape: guard, then a function declaration, then its call.
    expect(check(screen(`${GUARD}\nfunction go() { void buildPersona(userId!, "en", isMinor === true); }\ngo();`))).toEqual([]);
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
