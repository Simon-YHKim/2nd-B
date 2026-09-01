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
  forbiddenServiceVerdictFor,
  manifestFromText,
  parseAabManifest,
  parseManifest,
  artifactStructureFor,
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
      policyScanConfirmed: true,
      permissions: ["android.permission.CAMERA", "android.permission.RECORD_AUDIO"],
    });
    expect(v.ok).toBe(true);
  });

  test("the forbidden permission fails, and the reason names it", () => {
    const v = forbiddenPermissionVerdictFor({
      policyScanConfirmed: true,
      permissions: ["android.permission.RECORD_AUDIO", forbidden],
    });
    expect(v.ok).toBe(false);
    expect(v.reason).toContain(forbidden);
    // The reason has to carry WHY, or the next person just re-derives it.
    expect(v.reason).toMatch(/expo-audio|media3/);
  });

  test("missing or partial permission evidence fails closed", () => {
    // RECORD_AUDIO is deliberately present in every supported build. It is the
    // canary that distinguishes a real clean list from a parser/tool that saw
    // none (or only part) of the manifest.
    for (const manifest of [
      { policyScanConfirmed: true, permissions: [] },
      {},
      { policyScanConfirmed: true, permissions: null },
      { policyScanConfirmed: true, permissions: "android.permission.RECORD_AUDIO" },
      { policyScanConfirmed: true, permissions: ["android.permission.CAMERA"] },
      { permissions: ["android.permission.RECORD_AUDIO"] },
    ]) {
      const v = forbiddenPermissionVerdictFor(manifest as never);
      expect(v.ok).toBe(false);
      expect(v.reason).toMatch(/cannot be confirmed|RECORD_AUDIO/);
    }
  });
});

describe("forbidden foreground-service types in the built artifact", () => {
  test("a confirmed scan with no media-playback service passes", () => {
    expect(
      forbiddenServiceVerdictFor({ policyScanConfirmed: true, mediaPlaybackServices: [] }),
    ).toEqual(expect.objectContaining({ ok: true }));
  });

  test("missing or incomplete service evidence fails closed", () => {
    for (const manifest of [{}, { policyScanConfirmed: false }, { policyScanConfirmed: true }]) {
      const v = forbiddenServiceVerdictFor(manifest as never);
      expect(v.ok).toBe(false);
      expect(v.reason).toMatch(/cannot be confirmed|incomplete/);
    }
  });

  test("any mediaPlayback service fails regardless of its class name", () => {
    const v = forbiddenServiceVerdictFor({
      policyScanConfirmed: true,
      mediaPlaybackServices: ["com.example.NotTheExpoService"],
    });
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("com.example.NotTheExpoService");
    expect(v.reason).toContain("mediaPlayback");
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
    expect(manifestFromText(text).policyScanConfirmed).toBe(false);
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
      "  <application />",
      "</manifest>",
    ].join("\n");
    expect(manifestFromText(xml).permissions).toEqual([
      "android.permission.CAMERA",
      "android.permission.RECORD_AUDIO",
    ]);
    expect(manifestFromText(xml).policyScanConfirmed).toBe(true);
    expect(manifestFromText(xml).mediaPlaybackServices).toEqual([]);
  });

  test("a manifest with no permissions yields an empty list, not undefined", () => {
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

  test.each([
    ["symbolic", "mediaPlayback"],
    ["symbolic flags", "microphone | mediaPlayback"],
    ["hex", "0x2"],
    ["mixed hex bitmask", "0x82"],
    ["decimal", "2"],
  ])("detects a %s media-playback service", (_label, serviceType) => {
    const xml = [
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android" android:versionCode="42">',
      '  <uses-permission android:name="android.permission.RECORD_AUDIO" />',
      "  <application>",
      "    <service",
      `      android:foregroundServiceType="${serviceType}"`,
      '      android:name="com.example.Player" />',
      "  </application>",
      "</manifest>",
    ].join("\n");
    const parsed = manifestFromText(xml);
    expect(parsed.policyScanConfirmed).toBe(true);
    expect(parsed.mediaPlaybackServices).toEqual(["com.example.Player"]);
    expect(forbiddenServiceVerdictFor(parsed).ok).toBe(false);
  });

  test("a non-playback service stays clean while unreadable types fail confirmation", () => {
    const clean = manifestFromText(
      '<manifest><application><service android:name="rec" android:foregroundServiceType="0x80" /></application></manifest>',
    );
    expect(clean.policyScanConfirmed).toBe(true);
    expect(clean.mediaPlaybackServices).toEqual([]);

    const unreadable = manifestFromText(
      '<manifest><application><service android:name="mystery" android:foregroundServiceType="@string/type" /></application></manifest>',
    );
    expect(unreadable.policyScanConfirmed).toBe(false);
    expect(forbiddenServiceVerdictFor(unreadable).ok).toBe(false);

    const unknownAlias = manifestFromText(
      '<manifest><application><service android:name="future" android:foregroundServiceType="futureAlias" /></application></manifest>',
    );
    expect(unknownAlias.policyScanConfirmed).toBe(false);
    expect(forbiddenServiceVerdictFor(unknownAlias).ok).toBe(false);
  });

  test("malformed XML cannot masquerade as a complete manifest", () => {
    const malformed = manifestFromText(
      '<manifest><uses-permission android:name="android.permission.RECORD_AUDIO"/><application><service android:name="rec" android:foregroundServiceType="microphone"></manifest>',
    );
    expect(malformed.policyScanConfirmed).toBe(false);
    expect(malformed.policyScanIssue).toMatch(/malformed XML|closing tag/);
    expect(forbiddenPermissionVerdictFor(malformed).ok).toBe(false);
    expect(forbiddenServiceVerdictFor(malformed).ok).toBe(false);
  });
});

// The compiled-manifest parser is the path that actually judges the preview
// APK. Its failure mode must be red, so these fixtures exercise the actual
// binary string pool, balanced element chunks, attributes, and typed values.
describe("parseManifest reads permissions out of a compiled manifest", () => {
  const NAME_ATTR_RES_ID = 0x01010003;
  const FOREGROUND_SERVICE_TYPE_ATTR_RES_ID = 0x01010599;

  type ServiceFixture = {
    name: string;
    type: number | string;
    rawType?: string | null;
    typedType?: number | string;
  };

  type ElementFixture = {
    name: string;
    attrs: Array<{
      name: "name" | "foregroundServiceType";
      value: string | number;
      viaTypedValue?: boolean;
      rawValue?: string | null;
      typedValue?: string | number;
    }>;
  };

  /** Minimal binary AndroidManifest: string pool + resource map + elements. */
  function buildAxml({
    permissions = [],
    sdk23Permissions = [],
    services = [],
    extraElements = [],
  }: {
    permissions?: Array<{ value: string; viaTypedValue?: boolean }>;
    sdk23Permissions?: string[];
    services?: ServiceFixture[];
    extraElements?: ElementFixture[];
  } = {}): Buffer {
    const pool = ["", "name", "foregroundServiceType"];
    const idx = (s: string) => {
      const at = pool.indexOf(s);
      if (at >= 0) return at;
      pool.push(s);
      return pool.length - 1;
    };

    const elements: ElementFixture[] = [
      { name: "manifest", attrs: [] },
      ...permissions.map((permission) => ({
        name: "uses-permission",
        attrs: [
          {
            name: "name" as const,
            value: permission.value,
            viaTypedValue: permission.viaTypedValue,
          },
        ],
      })),
      ...sdk23Permissions.map((permission) => ({
        name: "uses-permission-sdk-23",
        attrs: [{ name: "name" as const, value: permission }],
      })),
      { name: "application", attrs: [] },
      ...services.map((service) => ({
        name: "service",
        attrs: [
          { name: "name" as const, value: service.name },
          {
            name: "foregroundServiceType" as const,
            value: service.type,
            rawValue: service.rawType,
            typedValue: service.typedType,
          },
        ],
      })),
      ...extraElements,
    ];

    const plan = elements.map((element) => ({
      nameIdx: idx(element.name),
      attrs: element.attrs.map((attr) => {
        const rawValue = attr.viaTypedValue
          ? null
          : attr.rawValue !== undefined
            ? attr.rawValue
            : typeof attr.value === "string"
              ? attr.value
              : null;
        const typedValue = attr.typedValue === undefined ? attr.value : attr.typedValue;
        return {
          nameIdx: idx(attr.name),
          rawValueIdx: rawValue === null ? null : idx(rawValue),
          typedStringIdx: typeof typedValue === "string" ? idx(typedValue) : null,
          numericValue: typeof typedValue === "number" ? typedValue : null,
        };
      }),
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
    poolChunk.writeUInt16LE(0x0001, 0); // RES_STRING_POOL_TYPE
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
    mapChunk.writeUInt32LE(
      FOREGROUND_SERVICE_TYPE_ATTR_RES_ID,
      8 + 4 * pool.indexOf("foregroundServiceType"),
    );

    const startElement = (element: (typeof plan)[number]) => {
      const size = 36 + 20 * element.attrs.length;
      const b = Buffer.alloc(size);
      b.writeUInt16LE(0x0102, 0); // RES_XML_START_ELEMENT_TYPE
      b.writeUInt16LE(16, 2);
      b.writeUInt32LE(size, 4);
      b.writeUInt32LE(1, 8); // lineNumber
      b.writeUInt32LE(0xffffffff, 12); // comment
      b.writeUInt32LE(0xffffffff, 16); // ns
      b.writeUInt32LE(element.nameIdx, 20); // element name
      b.writeUInt16LE(20, 24); // attributeStart, from +16
      b.writeUInt16LE(20, 26); // attributeSize
      b.writeUInt16LE(element.attrs.length, 28); // attributeCount
      element.attrs.forEach((attr, index) => {
        const a = 36 + index * 20;
        b.writeUInt32LE(0xffffffff, a); // attr ns
        b.writeUInt32LE(attr.nameIdx, a + 4); // attr name -> resource id
        const numeric = attr.numericValue !== null;
        b.writeUInt32LE(attr.rawValueIdx === null ? 0xffffffff : attr.rawValueIdx, a + 8);
        b.writeUInt16LE(8, a + 12); // typedValue size
        b.writeUInt8(0, a + 14); // res0
        b.writeUInt8(numeric ? 0x11 : 0x03, a + 15); // TYPE_INT_HEX or TYPE_STRING
        b.writeUInt32LE(numeric ? attr.numericValue! : attr.typedStringIdx!, a + 16);
      });
      return b;
    };

    const endElement = (element: (typeof plan)[number]) => {
      const b = Buffer.alloc(24);
      b.writeUInt16LE(0x0103, 0); // RES_XML_END_ELEMENT_TYPE
      b.writeUInt16LE(16, 2);
      b.writeUInt32LE(24, 4);
      b.writeUInt32LE(1, 8); // lineNumber
      b.writeUInt32LE(0xffffffff, 12); // comment
      b.writeUInt32LE(0xffffffff, 16); // ns
      b.writeUInt32LE(element.nameIdx, 20);
      return b;
    };

    let planIndex = 0;
    const manifestElement = plan[planIndex++];
    const permissionElements = plan.slice(planIndex, (planIndex += permissions.length));
    const sdk23Elements = plan.slice(planIndex, (planIndex += sdk23Permissions.length));
    const applicationElement = plan[planIndex++];
    const childElements = plan.slice(planIndex);
    const leafChunks = (element: (typeof plan)[number]) => [
      startElement(element),
      endElement(element),
    ];
    const elementChunks = [
      startElement(manifestElement),
      ...permissionElements.flatMap(leafChunks),
      ...sdk23Elements.flatMap(leafChunks),
      startElement(applicationElement),
      ...childElements.flatMap(leafChunks),
      endElement(applicationElement),
      endElement(manifestElement),
    ];

    const body = Buffer.concat([poolChunk, stringData, mapChunk, ...elementChunks]);
    const header = Buffer.alloc(8);
    header.writeUInt16LE(0x0003, 0); // RES_XML_TYPE
    header.writeUInt16LE(8, 2);
    header.writeUInt32LE(8 + body.length, 4);
    return Buffer.concat([header, body]);
  }

  test("a plain uses-permission is read", () => {
    const buf = buildAxml({
      permissions: [{ value: "android.permission.CAMERA" }],
    });
    expect(parseManifest(buf).permissions).toEqual(["android.permission.CAMERA"]);
    expect(parseManifest(buf).policyScanConfirmed).toBe(true);
  });

  test("the forbidden permission is caught end to end", () => {
    const buf = buildAxml({
      permissions: [
        { value: "android.permission.RECORD_AUDIO" },
        { value: FORBIDDEN_PERMISSIONS[0].name },
      ],
    });
    const manifest = parseManifest(buf);
    expect(manifest.permissions).toContain(FORBIDDEN_PERMISSIONS[0].name);
    expect(forbiddenPermissionVerdictFor(manifest).ok).toBe(false);
  });

  test("a name stored in the typed value is not dropped", () => {
    // rawValue = 0xFFFFFFFF with the string in typedValue. Without the
    // fallback this returned [], which the verdict calls "proved nothing" —
    // i.e. the guard would have failed open on the artifact it exists to check.
    const buf = buildAxml({
      permissions: [{ value: FORBIDDEN_PERMISSIONS[0].name, viaTypedValue: true }],
    });
    expect(parseManifest(buf).permissions).toEqual([FORBIDDEN_PERMISSIONS[0].name]);
  });

  test("uses-permission-sdk-23 counts too, matching the text parser", () => {
    // Otherwise the APK path and the AAB path could disagree about the same
    // permission in the same release.
    const buf = buildAxml({ sdk23Permissions: [FORBIDDEN_PERMISSIONS[0].name] });
    expect(parseManifest(buf).permissions).toEqual([FORBIDDEN_PERMISSIONS[0].name]);
  });

  test("a manifest with no permission elements yields an empty list", () => {
    expect(parseManifest(buildAxml()).permissions).toEqual([]);
  });

  test.each([
    ["exact bit", 0x02],
    ["combined with dataSync", 0x03],
    ["combined with microphone", 0x82],
  ])("detects mediaPlayback from the typed %s", (_label, type) => {
    const manifest = parseManifest(
      buildAxml({ services: [{ name: "com.example.Player", type }] }),
    );
    expect(manifest.mediaPlaybackServices).toEqual(["com.example.Player"]);
    expect(forbiddenServiceVerdictFor(manifest).ok).toBe(false);
  });

  test("a microphone-only service is clean", () => {
    const manifest = parseManifest(
      buildAxml({ services: [{ name: "com.example.Recorder", type: 0x80 }] }),
    );
    expect(manifest.policyScanConfirmed).toBe(true);
    expect(manifest.mediaPlaybackServices).toEqual([]);
    expect(forbiddenServiceVerdictFor(manifest).ok).toBe(true);
  });

  test("raw and typed service types cannot contradict their way to a clean verdict", () => {
    const typedViolation = parseManifest(
      buildAxml({
        services: [
          {
            name: "com.example.TypedPlayer",
            type: "microphone",
            typedType: 0x02,
          },
        ],
      }),
    );
    expect(typedViolation.mediaPlaybackServices).toEqual(["com.example.TypedPlayer"]);
    expect(forbiddenServiceVerdictFor(typedViolation).ok).toBe(false);

    const rawViolation = parseManifest(
      buildAxml({
        services: [
          {
            name: "com.example.RawPlayer",
            type: "mediaPlayback",
            typedType: 0x80,
          },
        ],
      }),
    );
    expect(rawViolation.mediaPlaybackServices).toEqual(["com.example.RawPlayer"]);
    expect(forbiddenServiceVerdictFor(rawViolation).ok).toBe(false);

    const conflictingCleanValues = parseManifest(
      buildAxml({
        services: [
          {
            name: "com.example.Conflicting",
            type: "microphone",
            typedType: 0x01,
          },
        ],
      }),
    );
    expect(conflictingCleanValues.policyScanConfirmed).toBe(false);
    expect(forbiddenServiceVerdictFor(conflictingCleanValues).ok).toBe(false);
  });

  test("the same resource attribute on a non-service element is ignored", () => {
    const manifest = parseManifest(
      buildAxml({
        extraElements: [
          {
            name: "receiver",
            attrs: [{ name: "foregroundServiceType", value: 0x02 }],
          },
        ],
      }),
    );
    expect(manifest.mediaPlaybackServices).toEqual([]);
  });

  test("an unreadable service type and a truncated document fail closed", () => {
    const unreadable = parseManifest(
      buildAxml({ services: [{ name: "com.example.Unknown", type: "@string/type" }] }),
    );
    expect(unreadable.policyScanConfirmed).toBe(false);
    expect(forbiddenServiceVerdictFor(unreadable).ok).toBe(false);

    const valid = buildAxml();
    expect(() => parseManifest(valid.subarray(0, valid.length - 1))).toThrow(
      /bounds|size|truncated|length/,
    );

    // A coherent truncation rewrites the outer length, so byte-count checks
    // alone pass. Missing the final END_ELEMENT must still be rejected.
    const missingRootClose = Buffer.from(valid.subarray(0, valid.length - 24));
    missingRootClose.writeUInt32LE(missingRootClose.length, 4);
    expect(() => parseManifest(missingRootClose)).toThrow(/not closed|unbalanced/);
  });

  test("out-of-range string references and overlapping string tables are rejected", () => {
    const invalidIndex = buildAxml();
    const poolSize = invalidIndex.readUInt32LE(12);
    const resourceMapAt = 8 + poolSize;
    const resourceMapSize = invalidIndex.readUInt32LE(resourceMapAt + 4);
    const manifestStartAt = resourceMapAt + resourceMapSize;
    const stringCount = invalidIndex.readUInt32LE(16);
    invalidIndex.writeUInt32LE(stringCount, manifestStartAt + 20);
    expect(() => parseManifest(invalidIndex)).toThrow(/string index.*out of bounds/);

    const overlappingStrings = buildAxml();
    overlappingStrings.writeUInt32LE(28, 28); // pool stringsStart
    expect(() => parseManifest(overlappingStrings)).toThrow(/string-pool bounds/);
  });
});

describe("AAB manifest-tool evidence", () => {
  const badging = [
    "package: name='com.example.app' versionCode='42' versionName='1.2.3'",
    "sdkVersion:'26'",
    "targetSdkVersion:'36'",
    "compileSdkVersion:'36'",
    "uses-permission: name='android.permission.RECORD_AUDIO'",
  ].join("\n");

  const cleanXml = [
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android" android:versionCode="42" android:versionName="1.2.3">',
    '  <uses-sdk android:minSdkVersion="26" android:targetSdkVersion="36" android:compileSdkVersion="36" />',
    '  <uses-permission android:name="android.permission.RECORD_AUDIO" />',
    "  <application />",
    "</manifest>",
  ].join("\n");

  test("metadata-complete badging is skipped for a later full manifest", () => {
    let calls = 0;
    const parsed = parseAabManifest("fixture.aab", {
      bundletoolJar: null as never,
      runTool: () => ({ available: true, output: calls++ === 0 ? badging : cleanXml }),
    });
    expect(parsed.tool).toBe("apkanalyzer");
    expect(parsed.manifest.policyScanConfirmed).toBe(true);
  });

  test("every metadata-complete but policy-incomplete candidate still fails", () => {
    expect(() =>
      parseAabManifest("fixture.aab", {
        bundletoolJar: null as never,
        runTool: () => ({ available: true, output: badging }),
      }),
    ).toThrow(/policy|complete manifest|permission/i);
  });

  test("a complete manifest with a violation is accepted as evidence, then fails policy", () => {
    const violatingXml = cleanXml.replace(
      "  <application />",
      '  <application><service android:name="bad" android:foregroundServiceType="0x2" /></application>',
    );
    const parsed = parseAabManifest("fixture.aab", {
      bundletoolJar: null as never,
      runTool: () => ({ available: true, output: violatingXml }),
    });
    expect(parsed.tool).toBe("bundletool");
    expect(forbiddenServiceVerdictFor(parsed.manifest).ok).toBe(false);
  });
});

describe("AAB module coverage", () => {
  const baseEntries = ["BundleConfig.pb", "base/manifest/AndroidManifest.xml"];

  test("a base-only AAB is supported", () => {
    expect(artifactStructureFor("aab", baseEntries)).toEqual({ isApk: false, isAab: true });
  });

  test("an extra module manifest fails until every module can be inspected", () => {
    expect(() =>
      artifactStructureFor("aab", [
        ...baseEntries,
        "feature/manifest/AndroidManifest.xml",
      ]),
    ).toThrow(/module|manifest|unsupported/i);
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
