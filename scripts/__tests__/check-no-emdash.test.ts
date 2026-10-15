import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as ts from "typescript";

// The guard now covers src/, not just locales/. A guard that only ever passes is
// indistinguishable from no guard, so prove it fails on the things it exists to
// catch - and that comments, which are prose the DESIGN rule does not govern, do
// not trip it.
//
// ⚠ The planted probe used to live in the repo's own `src/lib/`, and that raced
// with the rest of the jest run. 86 suites enumerate `src/**`; one that listed
// the probe and then read it after this file's `afterEach` deleted it died on
// ENOENT. Measured 2026-09-21: two consecutive `npm run verify` runs went red on
// two DIFFERENT suites for exactly that reason, and `--runInBand` was green both
// times. `src/lib/persona/__tests__/one-seven.test.ts:68` had already excluded
// the probe by name, which fixed that one consumer and left the other 85.
//
// So the probe now lives in a temp tree and the guard is pointed at it with
// EMDASH_GUARD_SCAN_ROOT. **Nothing here writes inside the repo.**
const ROOT = resolve(__dirname, "../..");
const SCRIPT = "scripts/check-no-emdash.ts";
const TSX_CLI = require.resolve("tsx/cli");
const EM = String.fromCharCode(0x2014);

function run(scanRoot?: string): { code: number; output: string } {
  const env = scanRoot ? { ...process.env, EMDASH_GUARD_SCAN_ROOT: scanRoot } : process.env;
  try {
    const output = execFileSync(process.execPath, [TSX_CLI, SCRIPT], { cwd: ROOT, encoding: "utf8", env });
    return { code: 0, output };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { code: failure.status ?? 1, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
  }
}

describe("check-no-emdash", () => {
  let tree = "";
  let probe = "";

  beforeEach(() => {
    tree = mkdtempSync(join(tmpdir(), "emdash-guard-"));
    // The guard reads both trees, so both have to exist. `locales/` stays empty:
    // these cases are about the source half.
    mkdirSync(join(tree, "locales"), { recursive: true });
    mkdirSync(join(tree, "src", "lib"), { recursive: true });
    probe = join(tree, "src", "lib", "emdash-guard-probe.generated.ts");
  });

  afterEach(() => {
    rmSync(tree, { recursive: true, force: true });
  });

  test("passes on the tree as it stands, and says what it covered", () => {
    // No override: this is the real repo, the run CI actually makes.
    const { code, output } = run();
    expect(code).toBe(0);
    expect(output).toMatch(/DESIGN PASS/);
    expect(output).toMatch(/scanned source files/);
    // A real run must not claim to be an overridden one, or the two become
    // indistinguishable in a log.
    expect(output).not.toContain("scan root overridden");
  });

  test("an overridden run says so - a green line from another tree is not this tree", () => {
    const { code, output } = run(tree);
    expect(code).toBe(0);
    expect(output).toContain("scan root overridden");
    expect(output).toContain(tree);
  });

  test("fails on an em dash in a rendered string in a new source file", () => {
    writeFileSync(probe, `export const copy = "Reference only ${EM} not advice.";\n`);
    const { code, output } = run(tree);
    expect(code).toBe(1);
    expect(output).toContain("emdash-guard-probe.generated.ts");
  });

  test("an em dash in a comment does not trip it", () => {
    writeFileSync(probe, `// prose ${EM} with a dash in it\nexport const copy = "Reference only, not advice.";\n`);
    const { code } = run(tree);
    expect(code).toBe(0);
  });

  test("a new file is covered by default - the list is exclusions, not an allowlist", () => {
    // The same probe file is not named anywhere in the guard, and it is still
    // scanned. That is the property that keeps the guard from rotting.
    const source = readFileSync(join(ROOT, SCRIPT), "utf8");
    expect(source).not.toContain("emdash-guard-probe");
    writeFileSync(probe, `export const copy = "a ${EM} b";\n`);
    expect(run(tree).code).toBe(1);
  });

  test("the exclusion list is judged against the repo, not against the scanned tree", () => {
    // Otherwise every overridden run would report all 13 exemptions as stale,
    // and a real staleness would be lost in that noise.
    const { code, output } = run(tree);
    expect(code).toBe(0);
    expect(output).not.toContain("Stale entries");
  });
});

describe("how the guard is launched", () => {
  test("straight through node, with no shell in between", () => {
    // An argument array plus the shell option is Node's DEP0190: it printed a
    // deprecation warning on every verify run, and a shell joins the arguments
    // without escaping them. process.execPath + tsx/cli needs no shell
    // (scripts/__tests__/definer-grants.test.ts launches its checker the same way).
    //
    // GATE-04 (PR #2045 gate): this used to ban only the text `shell:`, so moving
    // to a string-command API (execSync, exec), which always goes through a shell,
    // still passed. It now reads this file's syntax tree: child_process gives
    // exactly execFileSync, called once, as node + [tsx cli, script] with a plain
    // options object that has no shell key, no computed key and no spread.
    const self = ts.createSourceFile(__filename, readFileSync(__filename, "utf8"), ts.ScriptTarget.Latest, true);
    const childProcess = /^(?:node:)?child_process$/;
    const fromChildProcess: string[] = [];
    const launches: ts.CallExpression[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && childProcess.test(node.moduleSpecifier.text)) {
        const clause = node.importClause;
        if (clause?.name) fromChildProcess.push(`default as ${clause.name.text}`);
        const bindings = clause?.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) fromChildProcess.push(`* as ${bindings.name.text}`);
        if (bindings && ts.isNamedImports(bindings)) {
          for (const e of bindings.elements) fromChildProcess.push(e.getText(self));
        }
      }
      if (ts.isCallExpression(node)) {
        const [first] = node.arguments;
        const loads =
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
          first !== undefined &&
          ts.isStringLiteral(first) &&
          childProcess.test(first.text);
        if (loads) fromChildProcess.push(node.getText(self));
        if (ts.isIdentifier(node.expression) && node.expression.text === "execFileSync") launches.push(node);
      }
      node.forEachChild(visit);
    };
    visit(self);

    expect(fromChildProcess).toEqual(["execFileSync"]);
    expect(launches).toHaveLength(1);
    const [command, args, options] = launches[0].arguments;
    expect(command?.getText(self)).toBe("process.execPath");
    expect(args?.getText(self)).toBe("[TSX_CLI, SCRIPT]");
    expect(options !== undefined && ts.isObjectLiteralExpression(options)).toBe(true);
    const keys = (options as ts.ObjectLiteralExpression).properties.map((p) =>
      ts.isSpreadAssignment(p)
        ? "<spread>"
        : p.name !== undefined && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))
          ? p.name.text
          : "<computed>",
    );
    expect(keys).toEqual(["cwd", "encoding", "env"]);
  });
});
