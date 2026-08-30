import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const CR = String.fromCharCode(13);
const RAW = readFileSync(join(ROOT, ".github/workflows/eas-update.yml"), "utf8")
  .split(CR)
  .join("");
const STEP_HEADERS = [...RAW.matchAll(/^ {6}- name: (.+)$/gm)];

function stepOf(fragment: string): string {
  const index = STEP_HEADERS.findIndex((match) => match[1].includes(fragment));
  if (index < 0) throw new Error(`step not found: ${fragment}`);
  const start = STEP_HEADERS[index].index ?? 0;
  const end = index + 1 < STEP_HEADERS.length ? (STEP_HEADERS[index + 1].index ?? RAW.length) : RAW.length;
  return RAW.slice(start, end);
}

describe("EAS Update public environment contract", () => {
  test("missing or drifted profile values are synchronized without deleting server-only names", () => {
    const sync = stepOf("Synchronize build-profile public values");
    expect(sync).toContain('eas-cli@$EAS_CLI_VERSION" env:exec "$CHANNEL"');
    expect(sync).toContain("EAS_ENV_SYNC_PLAN");
    expect(sync).toContain('eas-cli@$EAS_CLI_VERSION" env:set "$CHANNEL"');
    expect(sync).toContain('--name "$KEY"');
    expect(sync).toContain('--value "$VALUE"');
    expect(sync).toContain("--visibility plaintext");
    expect(sync).toContain("--non-interactive");
    expect(sync).toContain("response details were withheld");
    expect(sync).not.toMatch(/env:(?:delete|unset)/);
    expect(sync).not.toMatch(/(?:echo|printf|console\.log).*\$VALUE/);
  });

  test("the current main commit is rechecked immediately around every EAS environment mutation", () => {
    const sync = stepOf("Synchronize build-profile public values");
    expect(sync).toContain("require_current_main");
    expect(sync).toContain("git fetch --no-tags origin '+refs/heads/main:refs/remotes/origin/main'");
    expect(sync).toContain('[ "$(git rev-parse HEAD)" != "$GITHUB_SHA" ]');
    expect(sync).toContain('[ "$(git rev-parse origin/main)" != "$GITHUB_SHA" ]');
    expect(sync).toMatch(/require_current_main\s+while[\s\S]*require_current_main\s+if ! npx --yes "eas-cli@\$EAS_CLI_VERSION" env:set/);
    expect(sync).toMatch(/done < <\([\s\S]*\)\s+require_current_main/);
  });

  test("the named EAS server environment supplies every build-profile public value", () => {
    expect(RAW).toContain("Object.entries(profile.env ?? {})");
    expect(RAW).toContain('process.env[key] !== String(value)');
    expect(RAW).toContain('eas-cli@$EAS_CLI_VERSION" env:exec "$CHANNEL"');
    expect(RAW).toContain('--environment "$CHANNEL"');
  });

  test("only reviewed server-only public names are allowed per channel", () => {
    expect(RAW).toContain("allowedServerOnlyByChannel");
    for (const name of [
      "EXPO_PUBLIC_CLARITY_PROJECT_ID",
      "EXPO_PUBLIC_EXIM_FX_KEY",
      "EXPO_PUBLIC_GA4_MEASUREMENT_ID",
      "EXPO_PUBLIC_MFDS_FOOD_KEY",
      "EXPO_PUBLIC_SENTRY_DSN",
    ]) {
      expect(RAW).toContain(name);
    }
    expect(RAW).toContain("unapprovedServerOnlyKeys");
    expect(RAW).not.toContain("unexpectedKeys");
  });

  test("the verifier reports names/counts without printing values", () => {
    expect(RAW).toContain("public environment names without printing values");
    expect(RAW).toContain("values were withheld");
    expect(RAW).not.toMatch(/console\.(?:log|error)\([^\n]*(?:process\.env\[key\]|value)/);
  });
});
