import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// `npm run lint` used to be a bare `eslint .`. A warning never changed the exit
// code, so `npm run verify` and CI stayed green while unused imports piled up:
// 57 warnings (2026-07-19), 72 (09-25), 69 when QA 261004 counted them (S-06).
// docs/handoff/HANDOFF-2026-09-p2.md also names that "warn, so CI never stops"
// gap as one of the layers that hid a Phase 1 caller-less defect.
//
// The fix is a gate, not a promise: lint fails on any warning. This file keeps
// the gate from quietly coming off.
const ROOT = resolve(__dirname, "../..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const scripts = (): Record<string, string> =>
  (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;

describe("lint warnings fail the gate", () => {
  // BL-02 (PR #2045 gate): a prefix match let `eslint . --max-warnings 0 || exit 0`
  // through, which hides the failing exit code. The whole command is pinned.
  test("the lint script is exactly the gate, with nothing after it", () => {
    expect(scripts().lint).toBe("eslint . --max-warnings 0");
  });

  test("verify (what CI runs) still starts with that lint", () => {
    expect(scripts().verify.split(" && ")[0]).toBe("npm run lint");
  });

  // The first version of this gate let DeepSpaceDesignScreens.tsx keep one unused
  // name (HERO_C) through a per-file block, and guarded that block by matching
  // config text. Gate findings GATE-05 / BL-01 showed the text match could not see
  // a wider `files` selector or a later `"off"`. HERO_C is gone now (S-01, the
  // tools-reachable digest re-pinned with it), and so is the block. This loads the
  // flat config itself, so a spread, a computed key or a string setting counts too:
  // the only block that configures unused-variable checking is the repo-wide one.
  test("no config block loosens unused-variable checking", () => {
    const configUrl = pathToFileURL(join(ROOT, "eslint.config.mjs")).href;
    const loader = [
      `const { default: config } = await import(${JSON.stringify(configUrl)});`,
      "const rows = [];",
      "for (const block of config) {",
      "  const rules = block.rules ?? {};",
      '  for (const rule of ["@typescript-eslint/no-unused-vars", "no-unused-vars"]) {',
      "    if (Object.prototype.hasOwnProperty.call(rules, rule)) {",
      "      rows.push({ rule, files: block.files ?? null, setting: rules[rule] });",
      "    }",
      "  }",
      "}",
      "process.stdout.write(JSON.stringify(rows));",
    ].join("\n");
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", loader], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(JSON.parse(out)).toEqual([
      {
        rule: "@typescript-eslint/no-unused-vars",
        files: ["**/*.{ts,tsx}"],
        setting: ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      },
    ]);
  });
});
