import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// `npm run lint` used to be a bare `eslint .`. A warning never changed the exit
// code, so `npm run verify` and CI stayed green while unused imports piled up:
// 57 warnings (2026-07-19), 72 (09-25), 69 when QA 261004 counted them (S-06).
// docs/handoff/HANDOFF-2026-09-p2.md also names that "warn, so CI never stops"
// gap as one of the layers that hid a Phase 1 caller-less defect.
//
// The fix is a gate, not a promise: lint fails on any warning. This file keeps
// the gate from quietly coming off, and keeps its one exemption honest.
const ROOT = resolve(__dirname, "../..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

describe("lint warnings fail the gate", () => {
  test("the lint script refuses any warning", () => {
    const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;
    expect(scripts.lint).toMatch(/^eslint \. .*--max-warnings[ =]0(?:\s|$)/);
  });

  test("verify (what CI runs) still starts with that lint", () => {
    const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;
    expect(scripts.verify.split(" && ")[0]).toBe("npm run lint");
  });

  // eslint.config.mjs lets DeepSpaceDesignScreens.tsx leave one name unused:
  // HERO_C, inside the shadow DeepSpaceOpsScreen copy whose bytes are pinned by
  // sha256 in src/screens/deepspace/ops/__tests__/tools-reachable.test.ts. The
  // exemption must not outlive that binding, or the file keeps a hole nobody
  // needs. It must not go first either, or lint turns red.
  test("the single exemption exists exactly while the frozen binding does", () => {
    const config = read("eslint.config.mjs");
    const giant = read("src/screens/deepspace/DeepSpaceDesignScreens.tsx");
    const exempted = config.includes('varsIgnorePattern: "^(?:_|HERO_C$)"');
    const bindingLives = /\bconst HERO_C\b/.test(giant);
    expect({ exempted, bindingLives }).toEqual({ exempted: bindingLives, bindingLives });
  });

  test("the exemption widens nothing else", () => {
    const config = read("eslint.config.mjs");
    // Every no-unused-vars setting in the config keeps the repo-wide `^_` escape
    // hatch for args and vars; only the one file adds one exact name.
    const settings = [...config.matchAll(/"@typescript-eslint\/no-unused-vars": \[([^\]]*)\]/g)].map((m) => m[1]);
    expect(settings.length).toBeGreaterThanOrEqual(1);
    for (const s of settings) {
      expect(s).toMatch(/^"warn", \{ argsIgnorePattern: "\^_", varsIgnorePattern: "\^(?:_|\(\?:_\|HERO_C\$\))" \}$/);
    }
  });
});
