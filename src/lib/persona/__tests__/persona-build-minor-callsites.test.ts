// Every persona build carries the user's resolved age (C10, DPIA 5A-R7).
//
// buildPersona() calls callLlm({ purpose: "persona_narrative", minor }) and the boundary
// picks the crisis hotline from that `minor`: a minor gets the youth line (KO 1388 + 109),
// an adult the adult line. buildPersona defaults `minor` to false, so a caller that leaves
// it out does not fail - it quietly routes a minor as an adult.
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
//   1. the age argument is present (buildPersona's 3rd argument, or `minor` in the opts
//      object of the other two);
//   2. it is never an adult default - no `false` literal and no `?? false` / `|| false`;
//   3. a screen (.tsx) passes `isMinor === true` and returns earlier in an enclosing
//      function on an unconditional `isMinor === null` (fail-closed while the age is
//      unknown, the /review pattern);
//   4. the one library forwarder (exportIden -> buildIdenDoc) may pass its opts through,
//      because BuildIdenOpts.minor is required and those opts have no `{}` default.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import * as ts from "typescript";

const ROOT = join(__dirname, "..", "..", "..", "..");
const SRC = join(ROOT, "src");
const BUILDERS = ["buildPersona", "buildIdenDoc", "exportIden"] as const;
type Builder = (typeof BUILDERS)[number];

/** Library functions allowed to forward a typed opts object instead of spelling `minor`. */
const FORWARDERS: ReadonlyArray<{ file: string; callee: Builder; arg: string }> = [
  { file: "src/lib/iden/iden-export.ts", callee: "buildIdenDoc", arg: "opts" },
];

const posix = (p: string): string => p.split(sep).join("/");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__" || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

function parse(file: string): ts.SourceFile {
  const text = readFileSync(file, "utf8");
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

function callSites(): CallSite[] {
  const sites: CallSite[] = [];
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    if (!BUILDERS.some((b) => text.includes(b))) continue;
    const sf = parse(file);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const name = node.expression.text as Builder;
        if ((BUILDERS as readonly string[]).includes(name)) {
          sites.push({
            file: posix(relative(ROOT, file)),
            line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
            callee: name,
            call: node,
            sf,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return sites;
}

type AgeArg =
  | { kind: "expr"; expr: ts.Expression }
  | { kind: "forward"; name: string }
  | { kind: "missing"; why: string };

function ageArgument(site: CallSite): AgeArg {
  const args = site.call.arguments;
  if (site.callee === "buildPersona") {
    return args[2] ? { kind: "expr", expr: args[2] } : { kind: "missing", why: "no 3rd argument" };
  }
  const opts = args[1];
  if (!opts) return { kind: "missing", why: "no opts argument" };
  if (ts.isIdentifier(opts)) return { kind: "forward", name: opts.text };
  if (!ts.isObjectLiteralExpression(opts)) return { kind: "missing", why: "opts is not an object literal" };
  for (const prop of opts.properties) {
    if (ts.isPropertyAssignment(prop) && prop.name.getText(site.sf) === "minor") {
      return { kind: "expr", expr: prop.initializer };
    }
    if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === "minor") {
      return { kind: "expr", expr: prop.name };
    }
  }
  return { kind: "missing", why: "opts object has no `minor`" };
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

/**
 * Does some function enclosing the call return on an unconditional `isMinor === null`
 * BEFORE the call? "Unconditional" = `isMinor === null` is one disjunct of the `||` chain,
 * so `x && isMinor === null` (which lets the build run when x is false) does not count.
 */
function guardedOnUnknownAge(site: CallSite): boolean {
  const callAt = site.call.getStart(site.sf);
  for (let node: ts.Node | undefined = site.call.parent; node; node = node.parent) {
    if (!ts.isFunctionLike(node)) continue;
    const body = (node as ts.FunctionLikeDeclaration).body;
    if (!body || !ts.isBlock(body)) continue;
    let guarded = false;
    const visit = (n: ts.Node): void => {
      if (guarded || n.getStart(site.sf) >= callAt) return;
      // Do not credit a guard that lives inside some other nested function.
      if (n !== body && ts.isFunctionLike(n) && !isAncestor(n, site.call)) return;
      if (
        ts.isIfStatement(n) &&
        returnsOnly(n.thenStatement) &&
        disjuncts(n.expression).some((d) => d.getText(site.sf).replace(/\s+/g, " ") === "isMinor === null")
      ) {
        guarded = true;
        return;
      }
      ts.forEachChild(n, visit);
    };
    visit(body);
    if (guarded) return true;
  }
  return false;
}

function isAncestor(maybe: ts.Node, node: ts.Node): boolean {
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) if (p === maybe) return true;
  return false;
}

const where = (s: CallSite): string => `${s.file}:${s.line} ${s.callee}`;

describe("every persona build carries the resolved age (C10 / DPIA 5A-R7)", () => {
  const sites = callSites();

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

  test("no call leaves the age out or defaults it to adult", () => {
    const bad: string[] = [];
    for (const site of sites) {
      const age = ageArgument(site);
      if (age.kind === "missing") {
        bad.push(`${where(site)}: ${age.why}`);
      } else if (age.kind === "forward") {
        const ok = FORWARDERS.some((f) => f.file === site.file && f.callee === site.callee && f.arg === age.name);
        if (!ok) bad.push(`${where(site)}: forwards \`${age.name}\` but is not a listed forwarder`);
      } else if (defaultsToAdult(age.expr)) {
        bad.push(`${where(site)}: adult default \`${age.expr.getText(site.sf)}\``);
      }
    }
    expect(bad).toEqual([]);
  });

  test("a screen passes `isMinor === true` and never builds while the age is unknown", () => {
    const bad: string[] = [];
    for (const site of sites.filter((s) => s.file.endsWith(".tsx"))) {
      const age = ageArgument(site);
      const text = age.kind === "expr" ? age.expr.getText(site.sf).replace(/\s+/g, " ") : "";
      if (text !== "isMinor === true") bad.push(`${where(site)}: age is \`${text || age.kind}\`, not \`isMinor === true\``);
      if (!guardedOnUnknownAge(site)) bad.push(`${where(site)}: no \`if (... || isMinor === null) return;\` before the build`);
    }
    expect(bad).toEqual([]);
  });

  test("the library chain has no adult fallback to fall into", () => {
    const sf = parse(join(ROOT, "src", "lib", "iden", "build-iden.ts"));
    const exp = parse(join(ROOT, "src", "lib", "iden", "iden-export.ts"));

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
    const optsParam = (file: ts.SourceFile, fn: string): ts.ParameterDeclaration | undefined => {
      let found: ts.ParameterDeclaration | undefined;
      file.forEachChild((n) => {
        if (ts.isFunctionDeclaration(n) && n.name?.text === fn) found = n.parameters[1];
      });
      return found;
    };
    for (const [file, fn] of [[sf, "buildIdenDoc"], [exp, "exportIden"]] as const) {
      const p = optsParam(file, fn);
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
