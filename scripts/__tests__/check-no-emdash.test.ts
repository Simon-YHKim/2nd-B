import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// The guard now covers src/, not just locales/. A guard that only ever passes is
// indistinguishable from no guard, so prove it fails on the things it exists to
// catch - and that comments, which are prose the DESIGN rule does not govern, do
// not trip it.
const ROOT = resolve(__dirname, "../..");
const SCRIPT = "scripts/check-no-emdash.ts";
const EM = String.fromCharCode(0x2014);

function run(): { code: number; output: string } {
  try {
    const output = execFileSync("npx", ["tsx", SCRIPT], { cwd: ROOT, encoding: "utf8", shell: true });
    return { code: 0, output };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { code: failure.status ?? 1, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
  }
}

describe("check-no-emdash", () => {
  const probe = join(ROOT, "src", "lib", "emdash-guard-probe.generated.ts");
  afterEach(() => {
    rmSync(probe, { force: true });
  });

  test("passes on the tree as it stands, and says what it covered", () => {
    const { code, output } = run();
    expect(code).toBe(0);
    expect(output).toMatch(/DESIGN PASS/);
    expect(output).toMatch(/scanned source files/);
  });

  test("fails on an em dash in a rendered string in a new source file", () => {
    writeFileSync(probe, `export const copy = "Reference only ${EM} not advice.";\n`);
    const { code, output } = run();
    expect(code).toBe(1);
    expect(output).toContain("emdash-guard-probe.generated.ts");
  });

  test("an em dash in a comment does not trip it", () => {
    writeFileSync(probe, `// prose ${EM} with a dash in it\nexport const copy = "Reference only, not advice.";\n`);
    const { code } = run();
    expect(code).toBe(0);
  });

  test("a new file is covered by default - the list is exclusions, not an allowlist", () => {
    // The same probe file is not named anywhere in the guard, and it is still
    // scanned. That is the property that keeps the guard from rotting.
    const source = execFileSync("node", ["-e", `process.stdout.write(require('fs').readFileSync(${JSON.stringify(join(ROOT, SCRIPT))}, 'utf8'))`], { encoding: "utf8" });
    expect(source).not.toContain("emdash-guard-probe");
    writeFileSync(probe, `export const copy = "a ${EM} b";\n`);
    expect(run().code).toBe(1);
  });
});
