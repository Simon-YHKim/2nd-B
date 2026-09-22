import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

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
const EM = String.fromCharCode(0x2014);

function run(scanRoot?: string): { code: number; output: string } {
  const env = scanRoot ? { ...process.env, EMDASH_GUARD_SCAN_ROOT: scanRoot } : process.env;
  try {
    const output = execFileSync("npx", ["tsx", SCRIPT], { cwd: ROOT, encoding: "utf8", shell: true, env });
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
    const source = execFileSync("node", ["-e", `process.stdout.write(require('fs').readFileSync(${JSON.stringify(join(ROOT, SCRIPT))}, 'utf8'))`], { encoding: "utf8" });
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
