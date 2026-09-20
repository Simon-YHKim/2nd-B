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
