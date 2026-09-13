import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");
const read = (path: string): string =>
  readFileSync(resolve(ROOT, path), "utf8").replace(/\r\n/g, "\n");

describe("encrypted native storage runtime wiring", () => {
  test.each([
    "src/lib/capture/draft.ts",
    "src/lib/capture/preauth-pending.ts",
    "src/lib/projects/github-link.ts",
  ])("%s never selects raw AsyncStorage on native", (path) => {
    const source = read(path);
    expect(source).toContain("getEncryptedNativeStorage");
    expect(source).not.toContain("@react-native-async-storage/async-storage");
  });

  test("import history keeps its existing non-native adapter but selects encryption on RN", () => {
    const source = read("src/lib/import/history.ts");
    expect(source).toContain("getEncryptedNativeStorage()");
    expect(source).toMatch(
      /if \(isReactNativeRuntime\(\)\)[\s\S]*?getEncryptedNativeStorage\(\)[\s\S]*?AsyncStorage/,
    );
  });

  test("native capture reads propagate encrypted-storage faults instead of manufacturing empty data", () => {
    const pending = read("src/lib/capture/preauth-pending.ts");
    expect(pending).toContain("return parseList(await native.getItem(STATE_KEY));");
    expect(pending).toContain("await native.setItem(STATE_KEY, raw);");
    expect(pending).toContain("await native.removeItem(STATE_KEY);");
  });

  test("GitHub storage failures stop before fetch and expose retry", () => {
    const source = read("src/screens/deepspace/ops/screens.tsx");
    const start = source.indexOf("export function SideProjectScreen");
    const end = source.indexOf("export function MealsScreen", start);
    const screen = source.slice(start, end);
    expect(screen).toContain('type GithubError = "rate" | "storage-read" | "storage-write" | null;');
    expect(screen).toContain('setGithubError("storage-read")');
    expect(screen).toMatch(
      /await setGithubUsername\(userId, username\);[\s\S]*?catch \{[\s\S]*?setGithubError\("storage-write"\);[\s\S]*?return;/,
    );
  });

  test("auth startup orders the global plaintext scan before auth v2 and exposes client retirement", () => {
    const mutation = read("src/lib/auth/session-mutation.ts");
    const client = read("src/lib/supabase/client.ts");
    expect(mutation).toContain("migrateLegacyNativePlaintextAtStartup");
    expect(mutation).toContain("startupMigration: migrateLegacyNativePlaintextAtStartup");
    expect(client).toContain("export async function resetSupabaseClient");
    expect(client).toContain("resetAuthStorageRuntime()");
  });

  test("the current callback quarantine participates in encryption and consented recovery", () => {
    const source = read("src/lib/storage/encrypted-native-storage.ts");
    expect(source).toContain('"secondbrain.auth.callback-quarantine.v1"');
  });
});
