// Every tool that names an Android asset resource must agree on the digit-first rule.
//
// app.json's web baseUrl "/2nd-B" leaks into native asset paths, so every bundled
// asset's Android resource name starts with "2" ("2ndb_assets_..."), which is not a
// valid resource name. #557 (2026-06-22) patched the packager and the RN runtime to
// prefix such names with "a_". expo-updates kept its own copy of the naming function
// and was missed: the embedded manifest pointed Asset.downloadAsync and expo-audio at
// "2ndb_..." resources that do not exist. On Android release the opening then failed
// to load and stopped the app at a retry button (found on an x86_64 emulator,
// 2026-10-04). This test reads the patches, so a dropped or partial patch fails here.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
const RULE = /return \/\^\[a-z\]\/\.test\(identifier\) \? identifier : (`a_\$\{identifier\}`|'a_' \+ identifier);/;
const added = (patch: string) => patch.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++")).join("\n");

describe("digit-first Android asset names get the a_ prefix everywhere", () => {
  test.each([
    ["patches/@react-native+assets-registry+0.85.3.patch", 1],
    ["patches/@react-native+community-cli-plugin+0.85.3.patch", 1],
    ["patches/@expo+cli+56.1.17.patch", 2],
    ["patches/expo-updates+56.0.20.patch", 2],
  ] as const)("%s adds the rule", (file, count) => {
    const lines = added(read(file)).split("\n").filter((line) => RULE.test(line.replace(/^\+\s*/, "")));
    expect(lines).toHaveLength(count);
  });

  test("the expo-updates patch covers the build script the Android build runs and its source", () => {
    const patch = read("patches/expo-updates+56.0.20.patch");
    expect(patch).toContain("diff --git a/node_modules/expo-updates/utils/build/createManifestForBuildAsync.js");
    expect(patch).toContain("diff --git a/node_modules/expo-updates/utils/src/createManifestForBuildAsync.ts");
    // Only these two files: a stray native build directory must never ride along.
    expect(patch.match(/^diff --git /gm)).toHaveLength(2);
  });

  test("the installed expo-updates build script carries the rule (postinstall applied it)", () => {
    const script = read("node_modules/expo-updates/utils/build/createManifestForBuildAsync.js");
    expect(script).toMatch(RULE);
  });
});

describe("the opening never blocks the app on native asset loading", () => {
  const screen = read("src/components/ui/LoadingScreen.tsx");

  test("native does not fetch its own bundled images", () => {
    expect(screen).toContain('const load = Platform.OS === "web" ? async (source: number) => {');
    expect(screen).toContain("} : async () => true;");
  });

  test("sound waits at most OPENING_SOUND_WAIT_MS, then the opening plays silently", () => {
    expect(screen).toContain("export const OPENING_SOUND_WAIT_MS = 1500;");
    expect(screen).toContain("const playbackReady = aheadLoaded && (reducedMotion || !sounds.enabled || sounds.ready || soundWaitOver);");
    expect(screen).toContain("setTimeout(() => setSoundWaitOver(true), OPENING_SOUND_WAIT_MS)");
  });

  test("an image failure hands over to the app as soon as it is ready", () => {
    expect(screen).toMatch(/if \(!assetError \|\| !ready\) return;\s*clock\.current\.pause\(\); soundRef\.current\.stop\(\);\s*deliverContinueOnce\(continued, onContinue\);/);
  });
});
