import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const CR = String.fromCharCode(13);
const RAW = readFileSync(join(ROOT, ".github/workflows/eas-update.yml"), "utf8")
  .split(CR)
  .join("");

describe("EAS Update public environment contract", () => {
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
