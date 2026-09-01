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
  parseManifest,
  runSelfTest,
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

// Play flagged FOREGROUND_SERVICE_MEDIA_PLAYBACK on vc 38 (2026-09-01). Its
// source is expo-audio's config plugin: enableBackgroundPlayback defaults to
// true and that default adds both this permission and a mediaPlayback
// foreground service. app.json turns the option off (and lists the permission
// in blockedPermissions as a second net) — this proves the result in the
// binary rather than trusting either piece of config.
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

  test("apkanalyzer/bundletool XML, including the attribute-per-line shape", () => {
    // One element is split across lines on purpose: that is what these tools
    // actually print, and it is the only shape the badging regex cannot match,
    // so deleting the XML alternative has to turn this red.
    const xml = [
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
      "  <uses-permission",
      '      android:name="android.permission.RECORD_AUDIO" />',
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

// The compiled-manifest parser is the path that actually judges the preview
// APK, and it had no test at all: a silent break there produces an empty
// permission list, which the verdict defines as "proved nothing" — a PASS. So
// the one code path whose failure mode is a green release was the one nobody
// exercised. This builds a real AXML buffer and reads it back.
describe("parseManifest reads permissions out of a compiled manifest", () => {
  const NAME_ATTR_RES_ID = 0x01010003;

  /** Minimal binary AndroidManifest: string pool + resource map + elements. */
  function buildAxml(
    elements: { name: string; permission: string; viaTypedValue?: boolean }[],
  ): Buffer {
    const pool = ["", "name"];
    const idx = (s: string) => {
      const at = pool.indexOf(s);
      if (at >= 0) return at;
      pool.push(s);
      return pool.length - 1;
    };
    const plan = elements.map((e) => ({
      nameIdx: idx(e.name),
      valueIdx: idx(e.permission),
      viaTypedValue: e.viaTypedValue === true,
    }));

    // UTF-8 string pool: [charLen][byteLen][bytes][NUL] per entry.
    const encoded = pool.map((s) => {
      const bytes = Buffer.from(s, "utf8");
      return Buffer.concat([Buffer.from([bytes.length, bytes.length]), bytes, Buffer.from([0])]);
    });
    const offsets: number[] = [];
    let cursor = 0;
    for (const e of encoded) {
      offsets.push(cursor);
      cursor += e.length;
    }
    let stringData = Buffer.concat(encoded);
    while (stringData.length % 4 !== 0) stringData = Buffer.concat([stringData, Buffer.from([0])]);

    const poolHeaderSize = 28 + 4 * pool.length;
    const poolSize = poolHeaderSize + stringData.length;
    const poolChunk = Buffer.alloc(poolHeaderSize);
    poolChunk.writeUInt16LE(0x001c, 0); // RES_STRING_POOL_TYPE
    poolChunk.writeUInt16LE(28, 2);
    poolChunk.writeUInt32LE(poolSize, 4);
    poolChunk.writeUInt32LE(pool.length, 8);
    poolChunk.writeUInt32LE(0, 12);
    poolChunk.writeUInt32LE(1 << 8, 16); // UTF8_FLAG
    poolChunk.writeUInt32LE(poolHeaderSize, 20); // stringsStart, from pool start
    poolChunk.writeUInt32LE(0, 24);
    offsets.forEach((o, i) => poolChunk.writeUInt32LE(o, 28 + 4 * i));

    // Resource map: index i carries the attribute id for pool string i.
    const mapSize = 8 + 4 * pool.length;
    const mapChunk = Buffer.alloc(mapSize);
    mapChunk.writeUInt16LE(0x0180, 0);
    mapChunk.writeUInt16LE(8, 2);
    mapChunk.writeUInt32LE(mapSize, 4);
    mapChunk.writeUInt32LE(NAME_ATTR_RES_ID, 8 + 4 * pool.indexOf("name"));

    const elementChunks = plan.map((p) => {
      const size = 36 + 20;
      const b = Buffer.alloc(size);
      b.writeUInt16LE(0x0102, 0); // RES_XML_START_ELEMENT_TYPE
      b.writeUInt16LE(16, 2);
      b.writeUInt32LE(size, 4);
      b.writeUInt32LE(1, 8); // lineNumber
      b.writeUInt32LE(0xffffffff, 12); // comment
      b.writeUInt32LE(0xffffffff, 16); // ns
      b.writeUInt32LE(p.nameIdx, 20); // element name
      b.writeUInt16LE(20, 24); // attributeStart, from +16
      b.writeUInt16LE(20, 26); // attributeSize
      b.writeUInt16LE(1, 28); // attributeCount
      const a = 36;
      b.writeUInt32LE(0xffffffff, a); // attr ns
      b.writeUInt32LE(pool.indexOf("name"), a + 4); // attr name -> resource id
      // The two ways AXML stores the value. viaTypedValue is the shape that
      // used to be dropped silently.
      b.writeUInt32LE(p.viaTypedValue ? 0xffffffff : p.valueIdx, a + 8);
      b.writeUInt16LE(8, a + 12); // typedValue size
      b.writeUInt8(0, a + 14); // res0
      b.writeUInt8(0x03, a + 15); // TYPE_STRING
      b.writeUInt32LE(p.valueIdx, a + 16);
      return b;
    });

    const body = Buffer.concat([poolChunk, stringData, mapChunk, ...elementChunks]);
    const header = Buffer.alloc(8);
    header.writeUInt16LE(0x0003, 0); // RES_XML_TYPE
    header.writeUInt16LE(8, 2);
    header.writeUInt32LE(8 + body.length, 4);
    return Buffer.concat([header, body]);
  }

  test("a plain uses-permission is read", () => {
    const buf = buildAxml([
      { name: "uses-permission", permission: "android.permission.CAMERA" },
    ]);
    expect(parseManifest(buf).permissions).toEqual(["android.permission.CAMERA"]);
  });

  test("the forbidden permission is caught end to end", () => {
    const buf = buildAxml([
      { name: "uses-permission", permission: "android.permission.RECORD_AUDIO" },
      { name: "uses-permission", permission: FORBIDDEN_PERMISSIONS[0].name },
    ]);
    const manifest = parseManifest(buf);
    expect(manifest.permissions).toContain(FORBIDDEN_PERMISSIONS[0].name);
    expect(forbiddenPermissionVerdictFor(manifest).ok).toBe(false);
  });

  test("a name stored in the typed value is not dropped", () => {
    // rawValue = 0xFFFFFFFF with the string in typedValue. Without the
    // fallback this returned [], which the verdict calls "proved nothing" —
    // i.e. the guard would have failed open on the artifact it exists to check.
    const buf = buildAxml([
      { name: "uses-permission", permission: FORBIDDEN_PERMISSIONS[0].name, viaTypedValue: true },
    ]);
    expect(parseManifest(buf).permissions).toEqual([FORBIDDEN_PERMISSIONS[0].name]);
  });

  test("uses-permission-sdk-23 counts too, matching the text parser", () => {
    // Otherwise the APK path and the AAB path could disagree about the same
    // permission in the same release.
    const buf = buildAxml([
      { name: "uses-permission-sdk-23", permission: FORBIDDEN_PERMISSIONS[0].name },
    ]);
    expect(parseManifest(buf).permissions).toEqual([FORBIDDEN_PERMISSIONS[0].name]);
  });

  test("a manifest with no permission elements yields an empty list", () => {
    expect(parseManifest(buildAxml([])).permissions).toEqual([]);
  });
});

// The self-test is the release workflow's first gate (github-release.yml runs
// `--self-test` before it downloads anything). Adding a field to the parser
// broke it while `npm run verify` stayed green, because nothing here ran it.
// Now something does.
describe("the artifact verifier's own self-test", () => {
  test("passes, and reports the number of checks it ran", () => {
    const checks = runSelfTest();
    expect(typeof checks).toBe("number");
    expect(checks).toBeGreaterThan(0);
  });
});
