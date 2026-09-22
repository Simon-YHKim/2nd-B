// Two ANDROID_QA_GUIDELINES rules that a scan alone keeps getting wrong.
//
// R47's bug inventory read both by grep and reported both backwards:
//
//   §3 "이미지는 expo-image"   listed ShareCard + PixelDither as the violations.
//                             PixelDither is the one file in the repo that
//                             CANNOT move to expo-image, and the scan missed a
//                             third RN <Image> entirely (multi-line import).
//   §4 "READ_MEDIA_IMAGES"     read the permission's absence as an oversight.
//                             It was removed on purpose after Play rejected
//                             vc19 over it (#1137, commit 9c674f4d).
//
// Neither rule can be checked by counting occurrences, so this file pins the
// two FACTS a future scan has to know before it proposes a change. Source
// assertions: react-test-renderer is blocked on RN 0.85 here, and the §4 half
// is about a manifest, which no unit render would reach anyway.
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = join(__dirname, "..", "..", "..", "..");

// CRLF-normalised: this repo checks out CRLF on Windows and a scanner that
// silently matches nothing still reports PASS.
const read = (rel: string): string =>
  readFileSync(join(ROOT, rel), "utf8").split("\r\n").join("\n");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__" || entry === "__mocks__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Files that take `Image` (or `ImageBackground`) as a VALUE from react-native.
 *  Matches multi-line import blocks too - the single-line-only grep is exactly
 *  what made R47 report two files when there are three. */
function reactNativeImageImporters(): string[] {
  const hits: string[] = [];
  for (const file of sourceFiles(join(ROOT, "src"))) {
    const src = readFileSync(file, "utf8").split("\r\n").join("\n");
    for (const [, specifiers] of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"react-native";/g)) {
      const names = specifiers
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith("type "));
      if (names.includes("Image") || names.includes("ImageBackground")) {
        hits.push(relative(ROOT, file).split("\\").join("/"));
        break;
      }
    }
  }
  return hits.sort();
}

describe("§3 images: expo-image, and the one place it cannot go", () => {
  test("the react-native <Image> roster is exactly these three files", () => {
    // Not a ban: a roster. Each entry below has a reason recorded next to it,
    // and a NEW entry should have to be argued for rather than appear.
    expect(reactNativeImageImporters()).toEqual([
      // Pinned off at runtime: reset-password.tsx's own component picks the
      // deep-space screen unconditionally ("never select it at runtime"), so
      // this <Image> is not on any user's path. Porting it would change no
      // pixel anyone sees.
      "src/app/(auth)/reset-password.tsx",
      // Live (/share-card). One static bundled PNG, at most two mounts sharing
      // the same source. Held, not exempt - see the hold recorded in the R48
      // report: the view is a react-native-view-shot capture target and the
      // port cannot be checked without a device.
      "src/components/deepspace/ShareCard.tsx",
      // Live and CORRECT as-is. See below.
      "src/components/pixel/PixelDither.tsx",
    ]);
  });

  test("PixelDither stays on react-native because expo-image has no repeat", () => {
    // This component IS the tiling: it fakes translucency with a repeated
    // hard-edge checker because PIXEL-CLAY rule 4 forbids static opacity.
    // expo-image keeps a deprecated `resizeMode` prop whose type still ACCEPTS
    // "repeat" while its own docs say the option "is not supported at all", and
    // contentFit has no equivalent value. So swapping the import would pass
    // type-check, pass every existing anchor, and silently stop tiling - the
    // worst possible way for this to break.
    const src = read("src/components/pixel/PixelDither.tsx");
    expect(src).not.toContain('from "expo-image"');
    expect(src).toContain('resizeMode="repeat"');

    const expoImageTypes = readFileSync(
      join(ROOT, "node_modules/expo-image/build/Image.types.d.ts"),
      "utf8",
    );
    expect(expoImageTypes).toContain("Note that `\"repeat\"` option is not supported at all.");
    expect(expoImageTypes).toContain(
      "export type ImageContentFit = 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';",
    );
  });
});

describe("§4 media permissions: the absence is the decision", () => {
  const appJson = JSON.parse(read("app.json")) as {
    expo: { android?: { permissions?: string[] } };
  };
  const permissions = appJson.expo.android?.permissions ?? [];

  test("the reader found the real permission list", () => {
    expect(permissions.length).toBeGreaterThan(0);
    expect(permissions).toContain("android.permission.CAMERA");
  });

  test("no photo/video permission is requested, and that is deliberate", () => {
    // Removed by #1137 / 9c674f4d after Play blocked v0.1.0 (AAB vc19). Adding
    // either back declares to Play that broad photo access is a core feature,
    // which for this app is simply untrue: the gallery path never asks for a
    // media permission at all.
    expect(permissions).not.toContain("android.permission.READ_MEDIA_IMAGES");
    expect(permissions).not.toContain("android.permission.READ_MEDIA_VIDEO");
    expect(permissions).not.toContain("android.permission.READ_MEDIA_VISUAL_USER_SELECTED");
  });

  test("nothing in the app asks for media-library permission either", () => {
    // The reason the permission is unnecessary, stated as code rather than as a
    // claim: expo-image-picker's gallery path goes through the Android Photo
    // Picker, which grants per-pick access with no permission. If a call to
    // request media-library permission ever appears, that premise has changed
    // and this decision has to be revisited before the permission is added.
    const offenders = sourceFiles(join(ROOT, "src"))
      .filter((f) => /(request|get)MediaLibraryPermissionsAsync/.test(readFileSync(f, "utf8")))
      .map((f) => relative(ROOT, f).split("\\").join("/"));
    expect(offenders).toEqual([]);
  });

  test("the guideline no longer tells the next session to add it", () => {
    // The sentence that produced the misdiagnosis. Kept as a corrected rule
    // rather than deleted, so the reasoning survives with it.
    const doc = read("ANDROID_QA_GUIDELINES.md");
    expect(doc).toContain("READ_MEDIA_IMAGES");
    expect(doc).toContain("9c674f4d");
  });
});

// ---------------------------------------------------------------------------
// §4 permissions, part two: WHICH plugin option actually reaches Android.
//
// This paragraph has now been wrong twice, and both times a reader corrected it
// from the prose alone:
//
//   original  "설명 문구가 비어 있으면 Android 13+ 에서 튕김"   - the string never
//             reaches Android at all.
//   1st fix   "이 키들의 명시적 false 가 Android 차단 지시"      - true of two of
//             the three keys. photosPermission is iOS-only, false included.
//
// So the third statement is not written down as prose and pinned by a substring
// match. It is EXECUTED: the block below calls the installed plugin and runs its
// android manifest mod, and the assertions are the table the doc prints. If a
// future expo bump changes the contract, this goes red before the doc does.
// ---------------------------------------------------------------------------

interface ManifestEntry {
  $: Record<string, string>;
}
interface AndroidManifestLike {
  manifest: { "uses-permission"?: ManifestEntry[] };
}
interface ExpoConfigLike {
  android?: { permissions?: string[] };
  mods?: {
    android?: {
      manifest?: (config: unknown) => Promise<{ modResults: AndroidManifestLike }>;
    };
  };
}
type PluginProps = Record<string, unknown>;

const imagePickerPlugin = require(
  join(ROOT, "node_modules/expo-image-picker/plugin/build/withImagePicker.js"),
) as { withAndroidImagePickerPermissions: (c: unknown, p: PluginProps) => ExpoConfigLike };

const audioPlugin = require(join(ROOT, "node_modules/expo-audio/plugin/build/withAudio.js")) as {
  default: (c: unknown, p: PluginProps) => ExpoConfigLike;
};

const blankManifest = (): AndroidManifestLike => ({
  manifest: {
    $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
    "uses-permission": [],
    application: [{ $: {} }],
  } as AndroidManifestLike["manifest"],
});

/** THIS repo's real `expo.android`, which is the only base worth measuring on.
 *
 *  The first R50 measurement used an empty `android: {}` and produced a wrong
 *  doc line, because `withBlockedPermissions` filters `config.android.permissions`
 *  only when that array already exists (@expo/config-plugins Permissions.js). On
 *  an empty base a blocked permission is invisible in the array and shows up only
 *  in the manifest; on ours it is removed from the array as well. Same plugin,
 *  opposite conclusion - so the base is part of the measurement. */
const realAndroidBase = (): Record<string, unknown> =>
  JSON.parse(
    JSON.stringify(
      (JSON.parse(read("app.json")) as { expo: { android: Record<string, unknown> } }).expo.android,
    ),
  ) as Record<string, unknown>;

/** The whole Android-visible result of one set of plugin options.
 *
 *  BOTH halves are returned: the permission array is what ships, and the manifest
 *  mod is where a block is spelled `tools:node="remove"`. */
async function androidEffectOf(
  props: PluginProps,
  base: Record<string, unknown> = realAndroidBase(),
): Promise<{ permissions: string[]; manifest: string[] }> {
  const config = imagePickerPlugin.withAndroidImagePickerPermissions(
    { name: "qa", slug: "qa", android: base },
    props,
  );
  const mod = config.mods?.android?.manifest;
  // Not an `if (!mod) return` - a silently skipped mod would make every
  // manifest expectation below compare [] to [] and pass.
  if (!mod) throw new Error("the installed image-picker plugin installs no android manifest mod");
  const applied = await mod({
    ...config,
    modRequest: { platform: "android", projectRoot: ROOT, modName: "manifest" },
    modResults: blankManifest(),
  });
  const entries = applied.modResults.manifest["uses-permission"] ?? [];
  return {
    permissions: config.android?.permissions ?? [],
    manifest: entries.map((e) => {
      const node = e.$["tools:node"];
      return node ? `${e.$["android:name"]} [tools:node=${node}]` : e.$["android:name"];
    }),
  };
}

const RECORD_AUDIO = "android.permission.RECORD_AUDIO";
const CAMERA = "android.permission.CAMERA";

describe("§4 permissions: photosPermission is iOS-only, false included", () => {
  test("omitted, false, and a string all produce the SAME Android result", async () => {
    // The claim, executed. If any of the three diverged, `photosPermission`
    // would have an Android meaning and the doc sentence would be wrong again.
    const omitted = await androidEffectOf({});
    const asFalse = await androidEffectOf({ photosPermission: false });
    const asString = await androidEffectOf({
      photosPermission: "photos",
      cameraPermission: "camera",
      microphonePermission: "microphone",
    });

    // Measured on the shipped base, so this is the app's real permission set -
    // not a synthetic [RECORD_AUDIO].
    expect(omitted.permissions).toEqual(
      (JSON.parse(read("app.json")) as { expo: { android: { permissions: string[] } } }).expo.android
        .permissions,
    );
    expect(omitted.permissions).toContain(CAMERA);
    expect(omitted.manifest).toEqual(omitted.permissions);
    expect(asFalse).toEqual(omitted);
    expect(asString).toEqual(omitted);
  });

  test("only camera and microphone are destructured by the Android half", () => {
    // The reason, read from the source the call above executed. Two names, and
    // the blocked list is built from the same two.
    const src = read("node_modules/expo-image-picker/plugin/src/withImagePicker.ts");
    const android = src.slice(
      src.indexOf("export const withAndroidImagePickerPermissions"),
      src.indexOf("Sets image picker colors"),
    );
    expect(android).toContain("{ cameraPermission, microphonePermission } = {}");
    expect(android).not.toContain("photosPermission");
    // ...and photosPermission exists, on the iOS side, so the assertion above is
    // "not used here" rather than "the option was renamed and I matched nothing".
    expect(src).toContain("NSPhotoLibraryUsageDescription");
  });
});

describe("§4 permissions: camera and microphone false each remove one", () => {
  test("on the shipped base, each false drops exactly its own permission", async () => {
    const base = await androidEffectOf({});
    const camera = await androidEffectOf({ cameraPermission: false });
    const mic = await androidEffectOf({ microphonePermission: false });

    // Each removes ONE permission from what ships, and blocks it in the manifest.
    expect(camera.permissions).toEqual(base.permissions.filter((p) => p !== CAMERA));
    expect(camera.manifest).toContain(`${CAMERA} [tools:node=remove]`);

    expect(mic.permissions).toEqual(base.permissions.filter((p) => p !== RECORD_AUDIO));
    expect(mic.manifest).toContain(`${RECORD_AUDIO} [tools:node=remove]`);

    // Neither touches the other's permission - the options are independent.
    expect(camera.permissions).toContain(RECORD_AUDIO);
    expect(mic.permissions).toContain(CAMERA);
  });

  test("an empty android base gives a DIFFERENT, misleading answer", async () => {
    // Pinned because this is what produced R50's own wrong line, and the doc now
    // warns about it. On an empty base `withBlockedPermissions` has no array to
    // filter, so camera:false looks like it changes nothing and mic:false yields
    // `undefined` rather than a list. If a future expo makes the two bases agree,
    // this goes red and the doc's warning can be retired.
    const empty = await androidEffectOf({}, {});
    const emptyCamera = await androidEffectOf({ cameraPermission: false }, {});

    expect(empty.permissions).toEqual([RECORD_AUDIO]);
    // The trap: identical arrays, even though the manifest IS blocking camera.
    expect(emptyCamera.permissions).toEqual(empty.permissions);
    expect(emptyCamera.manifest).toContain(`${CAMERA} [tools:node=remove]`);

    // ...and the real base does NOT behave that way, which is the whole point.
    const realCamera = await androidEffectOf({ cameraPermission: false });
    expect(realCamera.permissions).not.toContain(CAMERA);
  });
});

describe("§4 permissions: an Android declaration is not unconditional", () => {
  const audioAndroid = (props: PluginProps): string[] =>
    audioPlugin.default({ name: "qa", slug: "qa", android: {} }, props).android?.permissions ?? [];

  test("expo-audio declares by option, and ours declares exactly two", () => {
    const short = (p: string[]): string[] => p.map((x) => x.replace("android.permission.", ""));

    expect(short(audioAndroid({}))).toEqual([
      "RECORD_AUDIO",
      "MODIFY_AUDIO_SETTINGS",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_MEDIA_PLAYBACK",
    ]);
    // Options remove...
    expect(short(audioAndroid({ recordAudioAndroid: false }))).not.toContain("RECORD_AUDIO");
    // ...and options add.
    expect(short(audioAndroid({ enableBackgroundRecording: true }))).toEqual(
      expect.arrayContaining(["POST_NOTIFICATIONS", "FOREGROUND_SERVICE_MICROPHONE"]),
    );

    // What THIS app actually ships, read from app.json rather than assumed.
    const entry = (JSON.parse(read("app.json")) as { expo: { plugins: unknown[] } }).expo.plugins
      .filter((p): p is [string, PluginProps] => Array.isArray(p) && p[0] === "expo-audio")
      .map((p) => p[1])[0];
    expect(entry).toBeDefined();
    expect(short(audioAndroid(entry))).toEqual(["RECORD_AUDIO", "MODIFY_AUDIO_SETTINGS"]);
  });
});

describe("§4 permissions: the guideline states the narrow contract", () => {
  test("the doc carries the corrected rule and not the three retired ones", () => {
    const doc = read("ANDROID_QA_GUIDELINES.md");
    // Present: the narrowed claims the executable tests above hold.
    expect(doc).toContain("정정 C");
    expect(doc).toContain("`false` 를 포함해 iOS 전용");
    expect(doc).toContain("cameraPermission:false");
    // Retired: each of these sentences produced a wrong diagnosis, the third one
    // inside R50 itself. Asserting their ABSENCE is only meaningful next to the
    // presence checks above, which prove this is reading the right file.
    expect(doc).not.toContain("Android 에서 이 키들이 의미를 갖는 경우는");
    expect(doc).not.toContain("각 플러그인의 무조건 선언과");
    expect(doc).not.toContain("`android.permissions` 배열을 바꾸지 않습니다");
  });

  test("the doc's numbers are the measured ones, cell by cell", async () => {
    // Without this the doc could print any number and stay green, which is how
    // the first R50 table shipped two wrong cells. The doc claims these tests
    // guard both tables, so the tables have to actually be read.
    const doc = read("ANDROID_QA_GUIDELINES.md");
    const base = await androidEffectOf({});
    const camera = await androidEffectOf({ cameraPermission: false });

    // Table 1 says the shipped base has 9 permissions and that each `false`
    // leaves 8.
    expect(base.permissions).toHaveLength(9);
    expect(camera.permissions).toHaveLength(8);
    expect(doc).toContain("권한 **9개**");
    expect(doc).toContain("| 9개 그대로 |");
    expect(doc).toContain("`CAMERA` 가 빠진 8개");
    expect(doc).toContain("`RECORD_AUDIO` 가 빠진 8개");

    // Table 2: expo-audio's default four, and this app's two.
    const audioAndroid = (props: PluginProps): string[] =>
      audioPlugin.default({ name: "qa", slug: "qa", android: {} }, props).android?.permissions ?? [];
    const ours = (JSON.parse(read("app.json")) as { expo: { plugins: unknown[] } }).expo.plugins
      .filter((p): p is [string, PluginProps] => Array.isArray(p) && p[0] === "expo-audio")
      .map((p) => p[1])[0];
    expect(audioAndroid({})).toHaveLength(4);
    expect(audioAndroid(ours)).toHaveLength(2);
    expect(doc).toContain("기본값의 넷이 아니라 **둘**");
  });
});
