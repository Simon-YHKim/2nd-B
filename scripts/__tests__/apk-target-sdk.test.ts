// Play told us on 2026-08-24 that updates stop being accepted from 8/31 unless
// the app targets Android 16 (API 36). The instinct was to pin
// targetSdkVersion in app.json. That would have been wrong twice:
//
//   1. The current tree ALREADY targets 36. Reading build 27's manifest:
//        min 26 · target 36 · compile 36 · versionCode 27 · 0.2.0
//      Only the published alpha (v20, cut 7/28 on an older SDK) was behind, so
//      the fix was to publish a current build, not to change code.
//   2. app.json is a fingerprint source. Editing it would have stranded the two
//      builds just cut to carry the vendor fix — the same trap as eas.json.
//
// So nothing is pinned. The target comes from the Expo SDK's prebuild template,
// which we depend on and do not control, and the only place its value exists is
// the built binary. This checks the binary.

import {
  verdictFor,
  billingVerdictFor,
  forbiddenPermissionVerdictFor,
  manifestFromText,
  FORBIDDEN_PERMISSIONS,
  REQUIRED_TARGET_SDK,
} from "../check-apk-target-sdk";

const manifest = (over: Record<string, unknown> = {}) => ({
  minSdkVersion: 26,
  targetSdkVersion: 36,
  compileSdkVersion: 36,
  versionCode: 27,
  versionName: "0.2.0",
  ...over,
});

describe("the artifact is what gets judged", () => {
  test("build 27's real manifest passes", () => {
    // The exact values read out of the APK that replaced the release asset.
    expect(verdictFor(manifest()).ok).toBe(true);
  });

  test("a build one level short fails, and says the SDK is the likely cause", () => {
    // API 35 is what the alpha build shipped. Nothing here pins the target, so
    // a regression means the toolchain moved, not that someone edited a number.
    const v = verdictFor(manifest({ targetSdkVersion: 35 }));
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("API 35");
    expect(v.reason).toContain("Expo SDK's prebuild template");
  });

  test("a future SDK targeting higher is fine", () => {
    // A floor, not an equality check. Pinning would turn every upgrade red.
    expect(verdictFor(manifest({ targetSdkVersion: REQUIRED_TARGET_SDK + 1 })).ok).toBe(true);
  });
});

describe("unreadable is a failure, never a pass", () => {
  // This is the shape of every bug this release week was made of: a check that
  // could not see anything and reported that as fine.
  test.each([
    ["missing", undefined],
    ["null", null],
    ["empty string", ""],
    ["not a number", "thirtysix"],
    ["a resource reference that never resolved", NaN],
  ])("%s does not pass", (_label, value) => {
    const v = verdictFor(manifest({ targetSdkVersion: value }));
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("cannot be confirmed");
  });

  test("a string of digits still reads, because that is how AXML stores it", () => {
    // The raw attribute can come back as a pooled string rather than an int.
    // Rejecting that would fail every real build.
    expect(verdictFor(manifest({ targetSdkVersion: "36" })).ok).toBe(true);
  });

  test("a float is not an SDK level", () => {
    expect(verdictFor(manifest({ targetSdkVersion: 36.5 })).ok).toBe(false);
  });
});

describe("the deadline travels with the rule", () => {
  test("the failure names the date Play starts enforcing", () => {
    // A bare "requires API 36" leaves the reader guessing whether they have a
    // week or already missed it.
    expect(verdictFor(manifest({ targetSdkVersion: 35 })).reason).toContain("2026-08-31");
  });
});

// Play sent a second notice about the same app: the Billing Library floor. The
// APK records the resolved version in billing.properties, so it is answerable
// from the same artifact. Build 27 read back 8.3.0 - current, and arriving
// through react-native-purchases 10.4.0 rather than any pin in this repo.
describe("the second Play notice, from the same file", () => {
  const props = (v: string) => `version=${v}
client=billing
billing_client=${v}
`;

  test("build 27's real value passes", () => {
    expect(billingVerdictFor(props("8.3.0")).ok).toBe(true);
    expect(billingVerdictFor(props("8.3.0")).reason).toContain("8.3.0");
  });

  test("a version below the floor fails and points at the real source", () => {
    const v = billingVerdictFor(props("6.2.1"));
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("react-native-purchases");
  });

  test("no billing library at all is not a violation", () => {
    // Absence means the feature is not in this build. Failing on it would make
    // the check fire on every build that does not sell anything.
    expect(billingVerdictFor(null).ok).toBe(true);
    expect(billingVerdictFor(undefined).ok).toBe(true);
  });

  test("present but unreadable fails, rather than passing quietly", () => {
    // Same rule as the target SDK: "could not tell" is never "fine".
    expect(billingVerdictFor("client=billing").ok).toBe(false);
    expect(billingVerdictFor("billing_client=eight").ok).toBe(false);
  });

  test("a key that merely ends in billing_client is not the key", () => {
    // `x_billing_client=1.0.0` must not satisfy the check.
    expect(billingVerdictFor("x_billing_client=1.0.0").ok).toBe(false);
  });
});

// Play flagged FOREGROUND_SERVICE_MEDIA_PLAYBACK on vc 38 (2026-09-01). It is
// not ours: expo-audio pulls androidx.media3:media3-session, and that AAR
// declares it, so it exists only in the MERGED manifest. app.json blocks it —
// and this proves the block landed in the binary rather than trusting config.
describe("forbidden permissions in the built artifact", () => {
  const forbidden = FORBIDDEN_PERMISSIONS[0].name;

  test("the entry we care about is the media-playback foreground service", () => {
    expect(forbidden).toBe("android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK");
  });

  test("a clean permission list passes", () => {
    const v = forbiddenPermissionVerdictFor({
      permissions: ["android.permission.CAMERA", "android.permission.RECORD_AUDIO"],
    });
    expect(v.ok).toBe(true);
    expect(v.unconfirmed).toBeUndefined();
  });

  test("the forbidden permission fails, and the reason names it", () => {
    const v = forbiddenPermissionVerdictFor({
      permissions: ["android.permission.RECORD_AUDIO", forbidden],
    });
    expect(v.ok).toBe(false);
    expect(v.reason).toContain(forbidden);
    // The reason has to carry WHY, or the next person just re-derives it.
    expect(v.reason).toMatch(/expo-audio|media3/);
  });

  test("an unreadable list passes but says it proved nothing", () => {
    // Empty is ambiguous — "declares none" vs "this tool prints none" — so it
    // must not fail the release, and must not read as a clean bill either.
    for (const manifest of [{ permissions: [] }, {}, { permissions: null }]) {
      const v = forbiddenPermissionVerdictFor(manifest as never);
      expect(v.ok).toBe(true);
      expect(v.unconfirmed).toBe(true);
      expect(v.reason).toMatch(/proved nothing/);
    }
  });
});

describe("permission extraction from manifest-tool text", () => {
  test("aapt badging lines", () => {
    const text = [
      "package: name='com.simonk.secondbrain' versionCode='38'",
      "uses-permission: name='android.permission.CAMERA'",
      "uses-permission: name='android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK'",
    ].join("\n");
    expect(manifestFromText(text).permissions).toEqual([
      "android.permission.CAMERA",
      "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
    ]);
  });

  test("apkanalyzer/bundletool XML", () => {
    const xml = [
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
      '  <uses-permission android:name="android.permission.RECORD_AUDIO"/>',
      '  <uses-permission android:name="android.permission.CAMERA" />',
      "</manifest>",
    ].join("\n");
    expect(manifestFromText(xml).permissions).toEqual([
      "android.permission.CAMERA",
      "android.permission.RECORD_AUDIO",
    ]);
  });

  test("a manifest with no permissions yields an empty list, not undefined", () => {
    // Which then routes to the "proved nothing" branch above rather than
    // silently skipping the check.
    expect(manifestFromText("package: name='x' versionCode='1'").permissions).toEqual([]);
  });

  test("duplicates collapse and order is stable", () => {
    const text = [
      "uses-permission: name='android.permission.CAMERA'",
      '<uses-permission android:name="android.permission.CAMERA"/>',
      "uses-permission: name='android.permission.RECORD_AUDIO'",
    ].join("\n");
    expect(manifestFromText(text).permissions).toEqual([
      "android.permission.CAMERA",
      "android.permission.RECORD_AUDIO",
    ]);
  });
});
