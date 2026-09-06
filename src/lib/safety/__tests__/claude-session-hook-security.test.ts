import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SETTINGS_PATH = path.join(ROOT, ".claude", "settings.json");
const HOOK_PATH = path.join(ROOT, ".claude", "hooks", "session-start.sh");
const PINNED_SHA = "8fc4f42fef463228945b1871c3eca2b195a55b09";

const readHook = (): string => readFileSync(HOOK_PATH, "utf8").replace(/\r\n?/g, "\n");

describe("Claude session bootstrap security", () => {
  test("does not run repository commands automatically on SessionStart", () => {
    const settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf8")) as {
      hooks?: unknown;
      permissions?: { allow?: string[] };
    };

    expect(settings).not.toHaveProperty("hooks");
    expect(settings.permissions?.allow).toContain("Skill");
  });

  test("pins the manual bootstrap to one immutable commit", () => {
    const hook = readHook();

    expect(hook).toContain(`DEFAULT_SIMON_STACK_REF="${PINNED_SHA}"`);
    expect(hook).toContain('SIMON_STACK_REF="${SIMON_STACK_REF:-$DEFAULT_SIMON_STACK_REF}"');
    expect(hook).toContain('[[ ! "$SIMON_STACK_REF" =~ ^[0-9a-f]{40}$ ]]');
    expect(hook).toContain('if [[ "$FETCHED_SHA" != "$SIMON_STACK_REF" ]]');
    expect(hook).toMatch(/checkout\s+--detach\b/);
    expect(hook).not.toMatch(/SIMON_STACK_REF:-main|--branch|origin\/\$?\{?SIMON_STACK_REF/);
  });

  test("uses a fresh bounded staging directory with no persistent fallback", () => {
    const hook = readHook();

    expect(hook).toMatch(/mktemp\s+-d\s+"\$\{TMP_ROOT%\/\}\/simon-stack-bootstrap\.XXXXXXXX"/);
    expect(hook).toContain("trap cleanup EXIT");
    expect(hook).toContain('rm -rf -- "$STAGING_DIR"');
    expect(hook).toContain('[[ ! -f "$UPSTREAM_HOOK" || -L "$UPSTREAM_HOOK" ]]');
    expect(hook).not.toMatch(/\.simon-stack-src|SIMON_STACK_DIR|using cached|cached code/i);
    expect(hook).not.toMatch(/git\s+clone|git\s+reset\s+--hard/);
  });

  test("validates explicit intent and an immutable ref before any external command", () => {
    const hook = readHook();
    const manualGate = hook.indexOf('"$1" != "--run"');
    const shaGate = hook.indexOf('[[ ! "$SIMON_STACK_REF" =~ ^[0-9a-f]{40}$ ]]');
    const firstExternalCommand = hook.indexOf("git init");

    expect(manualGate).toBeGreaterThan(-1);
    expect(shaGate).toBeGreaterThan(manualGate);
    expect(firstExternalCommand).toBeGreaterThan(shaGate);
  });

  test("checks the fetched identity before checkout and delegation", () => {
    const hook = readHook();
    const mismatchGate = hook.indexOf('if [[ "$FETCHED_SHA" != "$SIMON_STACK_REF" ]]');
    const checkout = hook.indexOf("checkout --detach");
    const delegation = hook.indexOf('bash "$UPSTREAM_HOOK"');

    expect(mismatchGate).toBeGreaterThan(-1);
    expect(checkout).toBeGreaterThan(mismatchGate);
    expect(delegation).toBeGreaterThan(checkout);
  });
});
