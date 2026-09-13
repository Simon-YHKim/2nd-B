import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SETTINGS_PATH = path.join(ROOT, ".claude", "settings.json");
const HOOK_PATH = path.join(ROOT, ".claude", "hooks", "session-start.sh");
const REFRESH_HOOK_PATH = path.join(ROOT, ".claude", "hooks", "refresh-shared-checkout.sh");
const PINNED_SHA = "8fc4f42fef463228945b1871c3eca2b195a55b09";

const readHookRaw = (): string => readFileSync(HOOK_PATH, "utf8");
const readHook = (): string => readHookRaw().replace(/\r\n?/g, "\n");

describe("Claude session bootstrap security", () => {
  test("does not execute repository or user-home code on SessionStart", () => {
    const settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf8")) as {
      hooks?: { SessionStart?: unknown };
      permissions?: { allow?: string[] };
    };

    expect(settings).not.toHaveProperty("hooks.SessionStart");
    expect(settings.permissions?.allow).toContain("Skill");
  });

  test("pins the manual bootstrap to the already installed immutable commit", () => {
    const hook = readHook();

    expect(hook).toContain(
      'readonly SIMON_STACK_REPO="https://github.com/Simon-YHKim/SimonK-stack"',
    );
    expect(hook).toContain(`DEFAULT_SIMON_STACK_REF="${PINNED_SHA}"`);
    expect(hook).toContain('SIMON_STACK_REF="${SIMON_STACK_REF:-$DEFAULT_SIMON_STACK_REF}"');
    expect(hook).toContain('[[ ! "$SIMON_STACK_REF" =~ ^[0-9a-f]{40}$ ]]');
    expect(hook).toContain('if [[ "$FETCHED_SHA" != "$SIMON_STACK_REF" ]]');
    expect(hook).toMatch(/checkout\s+--detach\b/);
    expect(hook).not.toMatch(/SIMON_STACK_REF:-main|--branch|origin\/\$?\{?SIMON_STACK_REF/);
    expect(hook).not.toContain('SIMON_STACK_REPO="${SIMON_STACK_REPO:-');
  });

  test("requires explicit intent before fetching or running external code", () => {
    const hook = readHook();
    const manualGate = hook.indexOf('"$1" != "--run"');
    const shaGate = hook.indexOf('[[ ! "$SIMON_STACK_REF" =~ ^[0-9a-f]{40}$ ]]');
    const externalBoundary = hook.indexOf("# External commands are forbidden above this line.");
    const firstExternalCommand = hook.indexOf("safe_git init");

    expect(manualGate).toBeGreaterThan(-1);
    expect(shaGate).toBeGreaterThan(manualGate);
    expect(externalBoundary).toBeGreaterThan(shaGate);
    expect(firstExternalCommand).toBeGreaterThan(externalBoundary);

    const preBoundaryCommands = hook
      .slice(0, externalBoundary)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    // Intentionally exact. A deny-list can be bypassed with `if curl`, an
    // assignment prefix, `command`, `&&`, or backtick substitution. Before the
    // marker only these shell builtins and inert assignments are allowed.
    expect(preBoundaryCommands).toEqual([
      "set -euo pipefail",
      "umask 077",
      `readonly DEFAULT_SIMON_STACK_REF="${PINNED_SHA}"`,
      'readonly SIMON_STACK_REPO="https://github.com/Simon-YHKim/SimonK-stack"',
      'SIMON_STACK_REF="${SIMON_STACK_REF:-$DEFAULT_SIMON_STACK_REF}"',
      'TMP_ROOT="${TMPDIR:-${TMP:-/tmp}}"',
      'STAGING_DIR=""',
      'if [[ $# -ne 1 || "$1" != "--run" ]]; then',
      "printf '%s\\n' \"[simon-stack-bootstrap] Manual action required. Re-run with --run to install the pinned SimonK Stack.\"",
      "exit 2",
      "fi",
      'if [[ ! "$SIMON_STACK_REF" =~ ^[0-9a-f]{40}$ ]]; then',
      "printf '%s\\n' \"[simon-stack-bootstrap] ERROR: SIMON_STACK_REF must be a lowercase 40-character commit SHA\"",
      "exit 2",
      "fi",
    ]);
  });

  test("uses a fresh bounded checkout and rejects symlinked delegation", () => {
    const hook = readHook();

    expect(hook).toMatch(/mktemp\s+-d\s+"\$\{TMP_ROOT%\/\}\/simon-stack-bootstrap\.XXXXXXXX"/);
    expect(hook).toContain("trap cleanup EXIT");
    expect(hook).toContain('rm -rf -- "$STAGING_DIR"');
    expect(hook).toContain('[[ ! -f "$UPSTREAM_HOOK" || -L "$UPSTREAM_HOOK" ]]');
    expect(hook).toContain("core.hooksPath=/dev/null");
    expect(hook).not.toMatch(/\.simon-stack-src|SIMON_STACK_DIR|using cached|cached code/i);
    expect(hook).not.toMatch(/git\s+clone|git\s+reset\s+--hard/);
  });

  test("isolates every Git command from local hooks, templates, and maintenance", () => {
    const hook = readHook();

    expect(hook).toContain("GIT_CONFIG_NOSYSTEM=1");
    expect(hook).toContain("GIT_CONFIG_GLOBAL=/dev/null");
    expect(hook).toContain("core.hooksPath=/dev/null");
    expect(hook).toContain("maintenance.auto=false");
    expect(hook).toContain("fetch.autoMaintenance=false");
    expect(hook).toContain("protocol.allow=never");
    expect(hook).toContain("protocol.https.allow=always");
    expect(hook).toContain("fetch.fsckObjects=true");
    expect(hook).toContain('init --quiet --template="$EMPTY_TEMPLATE_DIR"');
    expect(hook).toContain("--no-recurse-submodules");
    expect(hook).toMatch(/unset\s+GIT_DIR[\s\S]*GIT_CONFIG_COUNT/);

    const executableGitLines = hook
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /(^|\s)git(\s|$)/.test(line) && !line.startsWith("#"));
    expect(executableGitLines).toEqual([
      "command git -c core.hooksPath=/dev/null \\",
    ]);
  });

  test("keeps manual Bash helpers LF-only for Windows worktrees", () => {
    expect(readHookRaw()).not.toContain("\r\n");
    expect(readFileSync(REFRESH_HOOK_PATH, "utf8")).not.toContain("\r\n");
  });

  test("checks fetched identity before checkout and delegation", () => {
    const hook = readHook();
    const mismatchGate = hook.indexOf('if [[ "$FETCHED_SHA" != "$SIMON_STACK_REF" ]]');
    const checkout = hook.indexOf("checkout --detach");
    const delegation = hook.indexOf('bash "$UPSTREAM_HOOK"');

    expect(mismatchGate).toBeGreaterThan(-1);
    expect(checkout).toBeGreaterThan(mismatchGate);
    expect(delegation).toBeGreaterThan(checkout);
  });
});
