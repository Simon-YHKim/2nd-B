// Read targetSdkVersion out of a built APK and refuse to publish one that
// Play would block.
//
// Why read the artifact instead of the config: nothing in this repo states the
// target SDK. app.json's expo-build-properties sets only minSdkVersion, so the
// target comes from whatever the Expo SDK's prebuild template picks. That is a
// value we depend on for Play compliance and do not control, do not pin, and
// cannot see from any file here. The only place the truth exists is the built
// binary.
//
// It came up on 2026-08-24: Play flagged the app for not targeting Android 16
// (API 36) by 8/31, penalty being that updates stop being accepted. The obvious
// move was to pin targetSdkVersion in app.json — which would have been wrong
// twice over. First, the current tree already targets 36; only the PUBLISHED
// alpha build (v20, cut 7/28 on an older SDK) was behind, so the fix was to
// publish a current build, not to change code. Second, app.json is a
// fingerprint source, so editing it would have stranded the two builds just cut
// to carry the vendor fix, exactly the trap check-ota-reach.js documents.
//
// So this does not pin anything. It verifies the artifact at the one moment the
// answer is knowable, and fails the release if a future SDK bump silently walks
// the target backwards.

// Play's floor, and the date it starts being enforced for updates. Both are
// here so the next person reading a failure knows whether the rule moved or the
// build did.
const REQUIRED_TARGET_SDK = 36;
const ENFORCED_FROM = "2026-08-31";
// fast-xml-parser 5.7.0's CJS declaration has an upstream `devlare` typo.
// `module.require` keeps this plain Node release script on the working runtime
// entry without making this repo's older TypeScript parser ingest fxp.d.cts.
const { XMLValidator } = module.require("fast-xml-parser");

// Play's second notice on the same app was the Billing Library floor. The APK
// records the resolved version in billing.properties, so it is readable from
// the same artifact - and like the target SDK, we do not pin it: it arrives
// through react-native-purchases.
// Billing Library 7 stops being accepted for new apps and updates on
// 2026-08-31.  A release produced by this branch therefore has to carry 8+;
// accepting 7 here would make a green gate expire four days after this change.
const REQUIRED_BILLING_MAJOR = 8;
const BILLING_ENFORCED_FROM = "2026-08-31";

// android:minSdkVersion / targetSdkVersion / compileSdkVersion, by resource id.
// Attribute NAMES are empty strings in a compiled manifest — the android
// namespace attributes are addressed by id through the resource map, so
// matching on names finds nothing and reports a clean "not present".
const ATTR = {
  0x0101020c: "minSdkVersion",
  0x01010270: "targetSdkVersion",
  0x01010572: "compileSdkVersion",
  0x0101021b: "versionCode",
  0x0101021c: "versionName",
};

// android:name — the attribute that carries a <uses-permission> value. Not in
// ATTR because it is not a manifest-wide scalar: it means something different
// on every element, so it is read positionally where the element is
// uses-permission and nowhere else.
const ANDROID_NAME_ATTR = 0x01010003;
const ANDROID_FOREGROUND_SERVICE_TYPE_ATTR = 0x01010599;
const MEDIA_PLAYBACK_SERVICE_TYPE = 0x02;
const FOREGROUND_SERVICE_TYPE_VALUES = new Map([
  ["dataSync", 0x01],
  ["mediaPlayback", 0x02],
  ["phoneCall", 0x04],
  ["location", 0x08],
  ["connectedDevice", 0x10],
  ["mediaProjection", 0x20],
  ["camera", 0x40],
  ["microphone", 0x80],
  ["health", 0x100],
  ["remoteMessaging", 0x200],
  ["systemExempted", 0x400],
  ["shortService", 0x800],
  ["fileManagement", 0x1000],
  ["mediaProcessing", 0x2000],
  ["specialUse", 0x40000000],
]);

// This app always records audio. Seeing RECORD_AUDIO in the built manifest is
// therefore a stable canary that the permission extractor read the real list,
// rather than returning an empty or partial result that only looks clean.
const REQUIRED_PERMISSION_EVIDENCE = ["android.permission.RECORD_AUDIO"];

// Permissions that must never reach a published artifact, with the reason a
// reader needs to judge whether the entry is still right.
//
// FOREGROUND_SERVICE_MEDIA_PLAYBACK: Play flagged it on vc 38 (2026-09-01) and
// demanded a "media playback" declaration. We cannot make that declaration —
// expo-audio is used for RECORDING only (useAudioRecorder in
// call-reflection/capture/secondb; zero uses of useAudioPlayer or
// createAudioPlayer), so it would be false.
//
// ⚠ The first version of this comment said the permission arrived transitively
// from the androidx.media3 AAR. That was wrong, and the error mattered: it
// argued for stripping the permission out of the built manifest instead of
// removing it at its source. The real source is expo-audio's own config
// plugin — node_modules/expo-audio/plugin/build/withAudio.js defaults
// `enableBackgroundPlayback = true`, and that default BOTH pushes this
// permission AND declares AudioControlsService with
// android:foregroundServiceType="mediaPlayback". Blocking only the permission
// would have left the service standing, which is the thing Play actually
// scans for. app.json now sets enableBackgroundPlayback:false, which drops
// both; blockedPermissions stays as a second net, and this check is the proof
// that the binary really came out clean.
const FORBIDDEN_PERMISSIONS = [
  {
    name: "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
    why: "added by expo-audio's config plugin when enableBackgroundPlayback is left at its default true, together with a mediaPlayback foreground service; this app records audio but never plays media, so Play's media-playback declaration would be false. app.json turns the plugin option off and also lists it in android.blockedPermissions.",
  },
];

function mediaPlaybackFlagFor(value) {
  if (Number.isInteger(value) && value >= 0 && value <= 0xffffffff) {
    return {
      confirmed: true,
      present: (value & MEDIA_PLAYBACK_SERVICE_TYPE) !== 0,
      mask: value,
    };
  }

  const raw = value === null || value === undefined ? "" : String(value).trim();
  if (!raw) return { confirmed: false, present: false };

  let numeric;
  if (/^0x[0-9a-f]+$/i.test(raw)) numeric = Number.parseInt(raw.slice(2), 16);
  else if (/^[0-9]+$/.test(raw)) numeric = Number.parseInt(raw, 10);
  if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 0xffffffff) {
    return {
      confirmed: true,
      present: (numeric & MEDIA_PLAYBACK_SERVICE_TYPE) !== 0,
      mask: numeric,
    };
  }

  const names = raw.split("|").map((name) => name.trim());
  if (names.length > 0 && names.every((name) => FOREGROUND_SERVICE_TYPE_VALUES.has(name))) {
    const mask = names.reduce(
      (combined, name) => (combined | FOREGROUND_SERVICE_TYPE_VALUES.get(name)) >>> 0,
      0,
    );
    return {
      confirmed: true,
      present: (mask & MEDIA_PLAYBACK_SERVICE_TYPE) !== 0,
      mask,
    };
  }
  return { confirmed: false, present: false };
}

function serviceTypeEvidenceFor(raw, dataType, typedData, stringAt) {
  const rawEvidence = raw === null ? null : mediaPlaybackFlagFor(raw);
  let typedEvidence;
  if (dataType === 0x03) typedEvidence = mediaPlaybackFlagFor(stringAt(typedData));
  else if (dataType >= 0x10 && dataType <= 0x1f) {
    typedEvidence = mediaPlaybackFlagFor(typedData);
  } else typedEvidence = { confirmed: false, present: false };

  const evidence = [rawEvidence, typedEvidence].filter(Boolean);
  // Either representation naming mediaPlayback is sufficient to block. A
  // contradictory "clean" representation must never override a violation.
  if (evidence.some((item) => item.present)) return { confirmed: true, present: true };
  if (evidence.some((item) => !item.confirmed)) return { confirmed: false, present: false };
  if (
    rawEvidence &&
    typedEvidence &&
    rawEvidence.mask !== typedEvidence.mask
  ) {
    return { confirmed: false, present: false };
  }
  return evidence.length > 0
    ? { confirmed: true, present: false }
    : { confirmed: false, present: false };
}

function parseManifest(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 8) {
    throw new Error("compiled AndroidManifest is truncated");
  }
  const u16 = (o) => buf.readUInt16LE(o);
  const u32 = (o) => buf.readUInt32LE(o);

  if (u16(0) !== 3 || u16(2) !== 8) throw new Error("not a compiled AndroidManifest");
  if (u32(4) !== buf.length) {
    throw new Error("compiled AndroidManifest declared size does not match its length");
  }

  const poolAt = 8;
  if (poolAt + 28 > buf.length || u16(poolAt) !== 0x0001 || u16(poolAt + 2) < 28) {
    throw new Error("compiled AndroidManifest has no valid string pool");
  }
  const poolHeaderSize = u16(poolAt + 2);
  const poolSize = u32(poolAt + 4);
  const count = u32(poolAt + 8);
  const styleCount = u32(poolAt + 12);
  const isUtf8 = Boolean(u32(poolAt + 16) & (1 << 8));
  const stringsStart = u32(poolAt + 20);
  const stylesStart = u32(poolAt + 24);
  const poolEnd = poolAt + poolSize;
  const stringIndexStart = poolAt + poolHeaderSize;
  const stringAndStyleIndexEnd = stringIndexStart + 4 * count + 4 * styleCount;
  const stringDataEnd = stylesStart === 0 ? poolEnd : poolAt + stylesStart;
  if (
    poolSize < poolHeaderSize ||
    poolEnd > buf.length ||
    stringAndStyleIndexEnd > poolEnd ||
    poolAt + stringsStart < stringAndStyleIndexEnd ||
    poolAt + stringsStart > stringDataEnd ||
    stringDataEnd > poolEnd ||
    (styleCount > 0 && stylesStart === 0)
  ) {
    throw new Error("compiled AndroidManifest string-pool bounds are invalid");
  }
  const offsets = [];
  for (let i = 0; i < count; i++) offsets.push(u32(stringIndexStart + 4 * i));

  const readUtf8Length = (offset) => {
    if (offset >= stringDataEnd) {
      throw new Error("compiled AndroidManifest UTF-8 length exceeds its pool");
    }
    const first = buf[offset];
    if ((first & 0x80) === 0) return { value: first, next: offset + 1 };
    if (offset + 1 >= stringDataEnd) {
      throw new Error("compiled AndroidManifest UTF-8 length is truncated");
    }
    return { value: ((first & 0x7f) << 8) | buf[offset + 1], next: offset + 2 };
  };

  const readUtf16Length = (offset) => {
    if (offset + 2 > stringDataEnd) {
      throw new Error("compiled AndroidManifest UTF-16 length exceeds its pool");
    }
    const first = u16(offset);
    if ((first & 0x8000) === 0) return { value: first, next: offset + 2 };
    if (offset + 4 > stringDataEnd) {
      throw new Error("compiled AndroidManifest UTF-16 length is truncated");
    }
    return {
      value: ((first & 0x7fff) << 16) | u16(offset + 2),
      next: offset + 4,
    };
  };

  const str = (i) => {
    if (i === 0xffffffff) return null;
    if (i >= count) {
      throw new Error(`compiled AndroidManifest string index ${i} is out of bounds`);
    }
    let p = poolAt + stringsStart + offsets[i];
    if (p < poolAt + stringsStart || p >= stringDataEnd) {
      throw new Error("compiled AndroidManifest string offset exceeds its pool");
    }
    if (isUtf8) {
      const characterLength = readUtf8Length(p);
      const byteLength = readUtf8Length(characterLength.next);
      p = byteLength.next;
      if (p + byteLength.value + 1 > stringDataEnd) {
        throw new Error("compiled AndroidManifest UTF-8 string exceeds its pool");
      }
      if (buf[p + byteLength.value] !== 0) {
        throw new Error("compiled AndroidManifest UTF-8 string has no terminator");
      }
      return buf.toString("utf8", p, p + byteLength.value);
    }
    const length = readUtf16Length(p);
    p = length.next;
    if (p + length.value * 2 + 2 > stringDataEnd) {
      throw new Error("compiled AndroidManifest UTF-16 string exceeds its pool");
    }
    if (u16(p + length.value * 2) !== 0) {
      throw new Error("compiled AndroidManifest UTF-16 string has no terminator");
    }
    return buf.toString("utf16le", p, p + length.value * 2);
  };

  const walkChunks = (visit) => {
    let pos = poolEnd;
    while (pos < buf.length) {
      if (pos + 8 > buf.length) {
        throw new Error("compiled AndroidManifest contains a truncated chunk header");
      }
      const type = u16(pos);
      const headerSize = u16(pos + 2);
      const size = u32(pos + 4);
      if (headerSize < 8 || size < headerSize || pos + size > buf.length) {
        throw new Error("compiled AndroidManifest chunk bounds are invalid");
      }
      visit({ pos, type, headerSize, size });
      pos += size;
    }
    if (pos !== buf.length) {
      throw new Error("compiled AndroidManifest traversal did not reach the document end");
    }
  };

  // Pass one: the resource map, so attribute ids can be resolved.
  const resIds = new Map();
  walkChunks(({ pos, type, size }) => {
    if (type === 0x0180) {
      if ((size - 8) % 4 !== 0) {
        throw new Error("compiled AndroidManifest resource map is malformed");
      }
      for (let i = 0; i < (size - 8) / 4; i++) resIds.set(i, u32(pos + 8 + 4 * i));
    }
  });

  // Pass two: the elements. Attribute offsets are relative to the node header,
  // not the chunk — attributeStart lives at +24 and counts from +16.
  const found = {};
  const permissions = new Set();
  const mediaPlaybackServices = new Set();
  const unresolvedServiceTypes = [];
  let sawManifest = false;
  let sawApplication = false;
  let rootClosed = false;
  const elementStack = [];
  walkChunks(({ pos, type, size }) => {
    if (type === 0x0102) {
      // START_ELEMENT: 16-byte chunk header, then lineNumber + comment (8),
      // then ns and name string indices. The element name decides whether the
      // android:name attribute below is a permission or something unrelated.
      if (size < 36) throw new Error("compiled AndroidManifest start element is truncated");
      const elementName = str(u32(pos + 20));
      if (!elementName) throw new Error("compiled AndroidManifest element name is missing");
      if (rootClosed) {
        throw new Error("compiled AndroidManifest contains an element after the root closed");
      }
      if (elementStack.length === 0) {
        if (sawManifest || elementName !== "manifest") {
          throw new Error("compiled AndroidManifest root element is not exactly one manifest");
        }
        sawManifest = true;
      } else if (elementName === "manifest") {
        throw new Error("compiled AndroidManifest contains a nested manifest element");
      }
      if (elementName === "application") {
        if (sawApplication || elementStack.at(-1) !== "manifest") {
          throw new Error("compiled AndroidManifest application structure is invalid");
        }
        sawApplication = true;
      }
      if (
        (elementName === "uses-permission" || elementName === "uses-permission-sdk-23") &&
        elementStack.at(-1) !== "manifest"
      ) {
        throw new Error("compiled AndroidManifest permission element is outside manifest");
      }
      if (elementName === "service" && elementStack.at(-1) !== "application") {
        throw new Error("compiled AndroidManifest service element is outside application");
      }
      elementStack.push(elementName);
      const attrCount = u16(pos + 28);
      const attrSize = u16(pos + 26);
      const attrStart = pos + 16 + u16(pos + 24);
      if (attrSize < 20 || attrStart < pos + 36 || attrStart + attrCount * attrSize > pos + size) {
        throw new Error("compiled AndroidManifest attribute bounds are invalid");
      }
      let serviceName = "(unnamed service)";
      let serviceTypeSeen = false;
      let serviceType = { confirmed: true, present: false };
      for (let i = 0; i < attrCount; i++) {
        const a = attrStart + i * attrSize;
        const attrNameIndex = u32(a + 4);
        const attrName = str(attrNameIndex);
        const id = resIds.get(attrNameIndex);
        const raw = str(u32(a + 8));
        const dataType = buf[a + 15];
        const typedData = u32(a + 16);
        const stringValue = raw ?? (dataType === 0x03 ? str(typedData) : null);
        // uses-permission-sdk-23 declares a permission just as much as
        // uses-permission does; the text regexes below match both, and a
        // parser that disagreed with them would make the APK and the AAB
        // contradict each other about the same artifact.
        if (
          (elementName === "uses-permission" || elementName === "uses-permission-sdk-23") &&
          id === ANDROID_NAME_ATTR
        ) {
          // rawValue can be absent (0xFFFFFFFF) with the string living in the
          // typed value instead — the ATTR branch below already knows this.
          // Without the same fallback a permission reads as "not there", and
          // missing evidence would otherwise look like a clean list.
          if (stringValue) permissions.add(stringValue);
        }
        if (elementName === "service" && id === ANDROID_NAME_ATTR && stringValue) {
          serviceName = stringValue;
        }
        if (
          elementName === "service" &&
          (id === ANDROID_FOREGROUND_SERVICE_TYPE_ATTR || attrName === "foregroundServiceType")
        ) {
          if (serviceTypeSeen) {
            throw new Error("compiled AndroidManifest service repeats foregroundServiceType");
          }
          serviceTypeSeen = true;
          if (id !== ANDROID_FOREGROUND_SERVICE_TYPE_ATTR) {
            serviceType = { confirmed: false, present: false };
          } else serviceType = serviceTypeEvidenceFor(raw, dataType, typedData, str);
        }
        const key = ATTR[id];
        if (!key) continue;
        found[key] = raw === null ? typedData : raw;
      }
      if (elementName === "service" && serviceTypeSeen) {
        if (!serviceType.confirmed) unresolvedServiceTypes.push(serviceName);
        else if (serviceType.present) mediaPlaybackServices.add(serviceName);
      }
    } else if (type === 0x0103) {
      if (size < 24) throw new Error("compiled AndroidManifest end element is truncated");
      const elementName = str(u32(pos + 20));
      const expected = elementStack.pop();
      if (!expected || elementName !== expected) {
        throw new Error(
          `compiled AndroidManifest element nesting is unbalanced (expected ${expected || "none"}, read ${elementName || "none"})`,
        );
      }
      if (elementStack.length === 0) rootClosed = true;
    }
  });
  if (elementStack.length > 0 || !rootClosed) {
    throw new Error("compiled AndroidManifest root element is not closed");
  }
  found.permissions = [...permissions].sort();
  found.mediaPlaybackServices = [...mediaPlaybackServices].sort();
  found.policyScanConfirmed = sawManifest && sawApplication && unresolvedServiceTypes.length === 0;
  if (!found.policyScanConfirmed) {
    found.policyScanIssue = unresolvedServiceTypes.length
      ? `foregroundServiceType could not be read for: ${unresolvedServiceTypes.join(", ")}`
      : "compiled manifest did not contain both manifest and application elements";
  }
  return found;
}

function verdictFor(manifest) {
  const rawTarget = manifest.targetSdkVersion;
  // Number(null) and Number("") are both 0, which is an integer, so coercing
  // first turns "we read nothing" into the confident-sounding "targets API 0".
  // Absence has to be caught before the arithmetic starts.
  const blank = rawTarget === null || rawTarget === undefined || String(rawTarget).trim() === "";
  const target = blank ? Number.NaN : Number(rawTarget);

  // An unreadable target is a failure, not a pass. "We could not tell" must
  // never travel as "it is fine" — that is the whole shape of the bug this
  // release week was made of.
  if (!Number.isInteger(target)) {
    return {
      ok: false,
      reason: `targetSdkVersion is not present in the manifest (read: ${JSON.stringify(manifest.targetSdkVersion)}). Refusing to publish a build whose target cannot be confirmed.`,
    };
  }
  if (target < REQUIRED_TARGET_SDK) {
    return {
      ok: false,
      reason: `targets API ${target}; Play requires API ${REQUIRED_TARGET_SDK} (Android 16) for updates from ${ENFORCED_FROM}. Nothing in this repo pins the target — it comes from the Expo SDK's prebuild template, so this most likely means the SDK moved.`,
    };
  }
  return { ok: true, reason: `targets API ${target} (Play floor ${REQUIRED_TARGET_SDK})` };
}

function artifactMetadataVerdictFor(manifest) {
  const fields = ["minSdkVersion", "compileSdkVersion", "versionCode", "versionName"];
  for (const field of fields) {
    if (
      manifest[field] === null ||
      manifest[field] === undefined ||
      String(manifest[field]).trim() === ""
    ) {
      return { ok: false, reason: `${field} is not present in the built manifest` };
    }
  }

  const compile = Number(manifest.compileSdkVersion);
  const target = Number(manifest.targetSdkVersion);
  const versionCode = Number(manifest.versionCode);
  if (!Number.isInteger(compile) || compile < target) {
    return {
      ok: false,
      reason: `compileSdkVersion ${JSON.stringify(manifest.compileSdkVersion)} is invalid or lower than targetSdkVersion ${manifest.targetSdkVersion}`,
    };
  }
  if (!Number.isInteger(versionCode) || versionCode <= 0) {
    return {
      ok: false,
      reason: `versionCode ${JSON.stringify(manifest.versionCode)} is not a positive integer`,
    };
  }
  return { ok: true, reason: `compile API ${compile} · versionCode ${versionCode}` };
}

// billing.properties is a plain key=value file the Play Billing Library writes
// into the APK. Absent means the library is not in this build, which is not a
// violation - only a present-and-too-old version is.
function billingVerdictFor(properties, { required = false } = {}) {
  if (properties === null || properties === undefined) {
    if (required) {
      return {
        ok: false,
        reason:
          "billing.properties is absent even though this release includes react-native-purchases; the resolved Billing Library version cannot be confirmed",
      };
    }
    return { ok: true, reason: "no Play Billing Library in this build" };
  }
  const m = /(?:^|[\r\n])[ \t]*billing_client[ \t]*=[ \t]*([0-9]+)\.([0-9]+)\.([0-9]+)/.exec(
    String(properties),
  );
  if (!m) {
    return {
      ok: false,
      reason: "billing.properties is present but no billing_client version could be read from it",
    };
  }
  const version = `${m[1]}.${m[2]}.${m[3]}`;
  if (Number(m[1]) < REQUIRED_BILLING_MAJOR) {
    return {
      ok: false,
      reason: `Play Billing Library ${version}; Play requires ${REQUIRED_BILLING_MAJOR}.x or newer for updates from ${BILLING_ENFORCED_FROM}. It comes from react-native-purchases, so upgrade that rather than looking for a pin here.`,
    };
  }
  return { ok: true, reason: `Play Billing Library ${version}` };
}

function manifestFromText(text) {
  const source = String(text);
  const first = (...patterns) => {
    for (const pattern of patterns) {
      const match = pattern.exec(source);
      if (match?.[1]) return match[1];
    }
    return undefined;
  };
  const permissions = [
    ...new Set([
      ...[...source.matchAll(/uses-permission[^\n]*?name=['"]([A-Za-z0-9_.]+)['"]/g)].map(
        (match) => match[1],
      ),
      ...[...source.matchAll(/<uses-permission[^>]*android:name=["']([^"']+)["']/g)].map(
        (match) => match[1],
      ),
    ]),
  ].sort();
  const mediaPlaybackServices = new Set();
  const unresolvedServiceTypes = [];
  for (const match of source.matchAll(/<service\b[^>]*>/gi)) {
    const tag = match[0];
    const name = /android:name=["']([^"']+)["']/i.exec(tag)?.[1] ?? "(unnamed service)";
    const rawType = /android:foregroundServiceType=["']([^"']+)["']/i.exec(tag)?.[1];
    if (rawType === undefined) continue;
    const serviceType = mediaPlaybackFlagFor(rawType);
    if (!serviceType.confirmed) unresolvedServiceTypes.push(name);
    else if (serviceType.present) mediaPlaybackServices.add(name);
  }
  // `aapt dump badging` can expose permissions but never service declarations.
  // Only a well-formed, complete manifest document can prove that no
  // mediaPlayback service is present. bundletool/apkanalyzer produce this
  // shape; XMLValidator rejects regex-lookalikes with missing close tags.
  const xmlValidation = /<manifest\b/i.test(source) ? XMLValidator.validate(source) : null;
  const rootElement = /^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<([A-Za-z_][\w:.-]*)\b/.exec(
    source,
  )?.[1];
  const hasFullManifest =
    xmlValidation === true &&
    rootElement === "manifest" &&
    /<application(?:\s|\/|>)/i.test(source);
  const policyScanConfirmed = hasFullManifest && unresolvedServiceTypes.length === 0;
  return {
    minSdkVersion: first(
      /android:minSdkVersion=["']([0-9]+)["']/,
      /(?:^|\n)sdkVersion:'([0-9]+)'/,
      /minSdkVersion[^0-9]*([0-9]+)/,
    ),
    targetSdkVersion: first(
      /android:targetSdkVersion=["']([0-9]+)["']/,
      /(?:^|\n)targetSdkVersion:'([0-9]+)'/,
      /targetSdkVersion[^0-9]*([0-9]+)/,
    ),
    compileSdkVersion: first(
      /android:compileSdkVersion=["']([0-9]+)["']/,
      /(?:^|\n)compileSdkVersion:'([0-9]+)'/,
      /compileSdkVersion[^0-9]*([0-9]+)/,
    ),
    versionCode: first(
      /android:versionCode=["']([0-9]+)["']/,
      /(?:^|\n)package:.*?versionCode='([0-9]+)'/,
      /versionCode[^0-9]*([0-9]+)/,
    ),
    versionName: first(
      /android:versionName=["']([^"']+)["']/,
      /(?:^|\n)package:.*?versionName='([^']+)'/,
      /versionName[^A-Za-z0-9]*([A-Za-z0-9._+-]+)/,
    ),
    billingLibrary: first(
      /android:name=["']com\.google\.android\.play\.billingclient\.version["'][^>]*android:value=["']([0-9]+\.[0-9]+\.[0-9]+)["']/,
      /android:value=["']([0-9]+\.[0-9]+\.[0-9]+)["'][^>]*android:name=["']com\.google\.android\.play\.billingclient\.version["']/,
    ),
    permissions,
    mediaPlaybackServices: [...mediaPlaybackServices].sort(),
    policyScanConfirmed,
    ...(policyScanConfirmed
      ? {}
      : {
          policyScanIssue: unresolvedServiceTypes.length
            ? `foregroundServiceType could not be read for: ${unresolvedServiceTypes.join(", ")}`
            : xmlValidation && xmlValidation !== true
              ? `manifest tool returned malformed XML: ${xmlValidation.err?.msg || "validation failed"}`
              : "manifest tool did not return a complete XML manifest with an application element",
        }),
  };
}

/**
 * Refuse an artifact that carries a permission we have decided never to ship.
 * Missing evidence is a failure: RECORD_AUDIO is the stable canary expected in
 * every supported build, so a list without it is empty/partial, not clean.
 */
function forbiddenPermissionVerdictFor(manifest) {
  if (manifest?.policyScanConfirmed !== true) {
    return {
      ok: false,
      reason: `the built permission list cannot be confirmed: ${manifest?.policyScanIssue || "full manifest scan is incomplete"}`,
    };
  }
  if (!Array.isArray(manifest?.permissions)) {
    return {
      ok: false,
      reason:
        "the built permission list cannot be confirmed because the manifest parser returned no array",
    };
  }
  const list = manifest.permissions;
  const missingEvidence = REQUIRED_PERMISSION_EVIDENCE.filter((name) => !list.includes(name));
  if (missingEvidence.length > 0) {
    return {
      ok: false,
      reason: `the built permission list cannot be confirmed because required evidence is missing: ${missingEvidence.join(", ")}`,
    };
  }
  const hits = FORBIDDEN_PERMISSIONS.filter((p) => list.includes(p.name));
  if (hits.length > 0) {
    return {
      ok: false,
      reason: hits
        .map((p) => `${p.name} is present in the built manifest — ${p.why}`)
        .join(" · "),
    };
  }
  return {
    ok: true,
    reason: `none of the ${FORBIDDEN_PERMISSIONS.length} forbidden permission(s) present (read ${list.length} from the artifact)`,
  };
}

function forbiddenServiceVerdictFor(manifest) {
  if (manifest?.policyScanConfirmed !== true || !Array.isArray(manifest?.mediaPlaybackServices)) {
    return {
      ok: false,
      reason: `foreground-service policy cannot be confirmed: ${manifest?.policyScanIssue || "manifest scan is incomplete"}`,
    };
  }
  if (manifest.mediaPlaybackServices.length > 0) {
    return {
      ok: false,
      reason: `mediaPlayback foreground service type is present in the built manifest: ${manifest.mediaPlaybackServices.join(", ")}. This app records audio but never plays media, so the Play declaration would be false.`,
    };
  }
  return {
    ok: true,
    reason: "no mediaPlayback foreground service type is present in the built manifest",
  };
}

function runManifestTool(command, args) {
  const { spawnSync } = require("node:child_process");
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error?.code === "ENOENT") return { available: false };
  if (result.status !== 0 || !String(result.stdout || "").trim()) {
    return {
      available: true,
      error: String(result.stderr || result.error?.message || `exit ${result.status}`).slice(
        0,
        500,
      ),
    };
  }
  return { available: true, output: result.stdout };
}

function parseAabManifest(
  file,
  { runTool = runManifestTool, bundletoolJar = process.env.BUNDLETOOL_JAR } = {},
) {
  const fs = require("node:fs");
  const attempts = [];
  const candidates = [];

  if (bundletoolJar) {
    if (!fs.existsSync(bundletoolJar) || !fs.statSync(bundletoolJar).isFile()) {
      throw new Error("BUNDLETOOL_JAR does not name a readable regular file");
    }
    candidates.push({
      label: "bundletool jar",
      command: "java",
      args: ["-jar", bundletoolJar, "dump", "manifest", `--bundle=${file}`],
    });
  } else {
    candidates.push({
      label: "bundletool",
      command: "bundletool",
      args: ["dump", "manifest", `--bundle=${file}`],
    });
    candidates.push(
      {
        label: "apkanalyzer",
        command: "apkanalyzer",
        args: ["manifest", "print", file],
      },
    );
  }

  for (const candidate of candidates) {
    const result = runTool(candidate.command, candidate.args);
    if (!result.available) {
      attempts.push(`${candidate.label}: unavailable`);
      continue;
    }
    if (result.error) {
      attempts.push(`${candidate.label}: ${result.error}`);
      continue;
    }
    const manifest = manifestFromText(result.output);
    const missingFields = ["targetSdkVersion", "compileSdkVersion", "versionCode"].filter(
      (field) => !manifest[field],
    );
    const missingPermissionEvidence = REQUIRED_PERMISSION_EVIDENCE.filter(
      (name) => !manifest.permissions.includes(name),
    );
    if (
      missingFields.length === 0 &&
      missingPermissionEvidence.length === 0 &&
      manifest.policyScanConfirmed === true
    ) {
      return { manifest, tool: candidate.label };
    }
    const gaps = [];
    if (missingFields.length > 0) gaps.push(`missing fields ${missingFields.join(", ")}`);
    if (missingPermissionEvidence.length > 0) {
      gaps.push(`missing permission evidence ${missingPermissionEvidence.join(", ")}`);
    }
    if (manifest.policyScanConfirmed !== true) {
      gaps.push(manifest.policyScanIssue || "foreground-service policy scan is incomplete");
    }
    attempts.push(`${candidate.label}: ${gaps.join("; ")}`);
  }
  throw new Error(
    `no Android App Bundle verifier produced a complete manifest and policy scan (${attempts.join("; ")}). Install a pinned bundletool jar and set BUNDLETOOL_JAR; verification is mandatory.`,
  );
}

function listArchiveEntries(file) {
  return [...readZipIndex(file).keys()];
}

function readBillingProperties(file, entries) {
  const matches = entries.filter((entry) => /(^|\/)billing\.properties$/.test(entry));
  if (matches.length === 0) return null;
  if (matches.length !== 1) {
    throw new Error(
      `artifact contains ${matches.length} billing.properties files; refusing ambiguity`,
    );
  }
  return readZipEntry(file, matches[0], 1024 * 1024).toString("utf8");
}

function artifactStructureFor(type, entries) {
  const isApk = entries.includes("AndroidManifest.xml") && !entries.includes("BundleConfig.pb");
  const isAab =
    entries.includes("BundleConfig.pb") && entries.includes("base/manifest/AndroidManifest.xml");
  if ((type === "apk" && !isApk) || (type === "aab" && !isAab)) {
    throw new Error(`archive structure does not match the .${type} extension`);
  }
  if (type === "aab") {
    const extraModuleManifests = entries.filter(
      (entry) =>
        /^[^/]+\/manifest\/AndroidManifest\.xml$/.test(entry) &&
        entry !== "base/manifest/AndroidManifest.xml",
    );
    if (extraModuleManifests.length > 0) {
      throw new Error(
        `AAB contains unsupported extra module manifest(s) that the policy scan cannot prove clean: ${extraModuleManifests.join(", ")}`,
      );
    }
  }
  return { isApk, isAab };
}

// Read only the ZIP central directory and requested entry. This keeps an
// 80-150 MB release artifact out of memory and avoids silently depending on a
// host-specific `unzip` executable. ZIP64 is rejected rather than guessed.
function readZipIndex(file) {
  const fs = require("node:fs");
  const fd = fs.openSync(file, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const tailSize = Math.min(size, 65557);
    const tail = Buffer.alloc(tailSize);
    fs.readSync(fd, tail, 0, tailSize, size - tailSize);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error("ZIP end-of-central-directory record not found");
    const entryCount = tail.readUInt16LE(eocd + 10);
    const centralSize = tail.readUInt32LE(eocd + 12);
    const centralOffset = tail.readUInt32LE(eocd + 16);
    if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
      throw new Error("ZIP64 artifact is unsupported by the deterministic verifier");
    }
    if (centralOffset + centralSize > size || centralSize > 64 * 1024 * 1024) {
      throw new Error("ZIP central directory bounds are invalid");
    }
    const central = Buffer.alloc(centralSize);
    fs.readSync(fd, central, 0, centralSize, centralOffset);
    const index = new Map();
    let offset = 0;
    for (let count = 0; count < entryCount; count++) {
      if (offset + 46 > central.length || central.readUInt32LE(offset) !== 0x02014b50) {
        throw new Error("malformed ZIP central directory entry");
      }
      const compression = central.readUInt16LE(offset + 10);
      const compressedSize = central.readUInt32LE(offset + 20);
      const uncompressedSize = central.readUInt32LE(offset + 24);
      const nameLength = central.readUInt16LE(offset + 28);
      const extraLength = central.readUInt16LE(offset + 30);
      const commentLength = central.readUInt16LE(offset + 32);
      const localOffset = central.readUInt32LE(offset + 42);
      const end = offset + 46 + nameLength + extraLength + commentLength;
      if (end > central.length) throw new Error("ZIP central directory name exceeds bounds");
      const name = central.toString("utf8", offset + 46, offset + 46 + nameLength);
      if (index.has(name)) throw new Error(`duplicate ZIP entry: ${name}`);
      index.set(name, { compression, compressedSize, uncompressedSize, localOffset });
      offset = end;
    }
    return index;
  } finally {
    fs.closeSync(fd);
  }
}

function readZipEntry(file, name, maxUncompressedSize) {
  const fs = require("node:fs");
  const zlib = require("node:zlib");
  const entry = readZipIndex(file).get(name);
  if (!entry) throw new Error(`ZIP entry is missing: ${name}`);
  if (entry.uncompressedSize > maxUncompressedSize) {
    throw new Error(`ZIP entry ${name} exceeds the ${maxUncompressedSize}-byte verification limit`);
  }
  const fd = fs.openSync(file, "r");
  try {
    const header = Buffer.alloc(30);
    fs.readSync(fd, header, 0, header.length, entry.localOffset);
    if (header.readUInt32LE(0) !== 0x04034b50)
      throw new Error(`invalid local ZIP header for ${name}`);
    const nameLength = header.readUInt16LE(26);
    const extraLength = header.readUInt16LE(28);
    const dataOffset = entry.localOffset + 30 + nameLength + extraLength;
    const compressed = Buffer.alloc(entry.compressedSize);
    fs.readSync(fd, compressed, 0, compressed.length, dataOffset);
    let value;
    if (entry.compression === 0) value = compressed;
    else if (entry.compression === 8)
      value = zlib.inflateRawSync(compressed, { maxOutputLength: maxUncompressedSize });
    else throw new Error(`unsupported ZIP compression method ${entry.compression} for ${name}`);
    if (value.length !== entry.uncompressedSize)
      throw new Error(`ZIP entry size mismatch for ${name}`);
    return value;
  } finally {
    fs.closeSync(fd);
  }
}

function runSelfTest() {
  const assert = require("node:assert/strict");
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const validManifest = {
    minSdkVersion: 26,
    targetSdkVersion: REQUIRED_TARGET_SDK,
    compileSdkVersion: REQUIRED_TARGET_SDK,
    versionCode: 42,
    versionName: "1.2.3",
  };

  assert.equal(verdictFor(validManifest).ok, true);
  assert.equal(
    verdictFor({ ...validManifest, targetSdkVersion: REQUIRED_TARGET_SDK - 1 }).ok,
    false,
  );
  assert.equal(artifactMetadataVerdictFor(validManifest).ok, true);
  assert.equal(
    artifactMetadataVerdictFor({ ...validManifest, compileSdkVersion: REQUIRED_TARGET_SDK - 1 }).ok,
    false,
  );
  assert.equal(billingVerdictFor("billing_client=8.3.0", { required: true }).ok, true);
  assert.equal(billingVerdictFor(null, { required: true }).ok, false);

  // Forbidden permissions and services: a proven-clean artifact passes;
  // violations and missing evidence fail closed.
  const forbidden = FORBIDDEN_PERMISSIONS[0].name;
  assert.equal(
    forbiddenPermissionVerdictFor({
      policyScanConfirmed: true,
      permissions: ["android.permission.RECORD_AUDIO"],
    }).ok,
    true,
  );
  assert.equal(
    forbiddenPermissionVerdictFor({
      policyScanConfirmed: true,
      permissions: ["android.permission.RECORD_AUDIO", forbidden],
    }).ok,
    false,
  );
  assert.equal(forbiddenPermissionVerdictFor({ permissions: [] }).ok, false);
  assert.equal(forbiddenPermissionVerdictFor({}).ok, false);
  assert.equal(
    forbiddenServiceVerdictFor({ policyScanConfirmed: true, mediaPlaybackServices: [] }).ok,
    true,
  );
  assert.equal(
    forbiddenServiceVerdictFor({
      policyScanConfirmed: true,
      mediaPlaybackServices: ["com.example.Player"],
    }).ok,
    false,
  );
  assert.equal(forbiddenServiceVerdictFor({ policyScanConfirmed: false }).ok, false);
  // Both manifest-tool output shapes must yield the permission list.
  assert.deepEqual(
    manifestFromText("uses-permission: name='android.permission.CAMERA'").permissions,
    ["android.permission.CAMERA"],
  );
  assert.deepEqual(
    manifestFromText('<uses-permission android:name="android.permission.CAMERA"/>').permissions,
    ["android.permission.CAMERA"],
  );

  const parsed =
    manifestFromText(`package: name='com.example.app' versionCode='42' versionName='1.2.3'
sdkVersion:'26'
targetSdkVersion:'36'
compileSdkVersion:'36'`);
  assert.deepEqual(parsed, {
    minSdkVersion: "26",
    targetSdkVersion: "36",
    compileSdkVersion: "36",
    versionCode: "42",
    versionName: "1.2.3",
    billingLibrary: undefined,
    // deepEqual here is STRICT, so every field manifestFromText returns has to
    // be listed. Forgetting this one broke --self-test (and with it the
    // release workflow's first step) while `npm run verify` stayed green,
    // because nothing ran the self-test — apk-target-sdk.test.ts now does.
    permissions: [],
    mediaPlaybackServices: [],
    policyScanConfirmed: false,
    policyScanIssue:
      "manifest tool did not return a complete XML manifest with an application element",
  });

  assert.equal(REQUIRED_BILLING_MAJOR, 8);

  const makeStoredZip = (files) => {
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;
    for (const [name, raw] of files) {
      const nameBytes = Buffer.from(name, "utf8");
      const data = Buffer.from(raw);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt32LE(data.length, 18);
      local.writeUInt32LE(data.length, 22);
      local.writeUInt16LE(nameBytes.length, 26);
      const localPart = Buffer.concat([local, nameBytes, data]);
      localParts.push(localPart);

      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(20, 4);
      central.writeUInt16LE(20, 6);
      central.writeUInt32LE(data.length, 20);
      central.writeUInt32LE(data.length, 24);
      central.writeUInt16LE(nameBytes.length, 28);
      central.writeUInt32LE(localOffset, 42);
      centralParts.push(Buffer.concat([central, nameBytes]));
      localOffset += localPart.length;
    }
    const centralDirectory = Buffer.concat(centralParts);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(centralDirectory.length, 12);
    end.writeUInt32LE(localOffset, 16);
    return Buffer.concat([...localParts, centralDirectory, end]);
  };

  const archive = path.join(
    os.tmpdir(),
    `apk-target-sdk-self-test-${process.pid}-${Date.now()}.apk`,
  );
  try {
    fs.writeFileSync(
      archive,
      makeStoredZip([
        ["AndroidManifest.xml", "compiled-manifest-placeholder"],
        ["META-INF/com.android.billingclient/billing.properties", "billing_client=8.3.0\n"],
      ]),
    );
    const entries = listArchiveEntries(archive);
    assert.deepEqual(artifactStructureFor("apk", entries), { isApk: true, isAab: false });
    assert.equal(
      readZipEntry(archive, "AndroidManifest.xml", 1024).toString("utf8"),
      "compiled-manifest-placeholder",
    );
    assert.equal(readBillingProperties(archive, entries), "billing_client=8.3.0\n");
    assert.throws(() => artifactStructureFor("aab", entries), /archive structure/);
  } finally {
    if (fs.existsSync(archive)) fs.unlinkSync(archive);
  }

  // A deterministic mock bundletool response exercises the AAB tool-selection
  // and text-manifest path without downloading or executing an external binary.
  const mockBundletool = () => ({
    available: true,
    output:
      '<manifest android:versionCode="42" android:versionName="1.2.3"><uses-sdk android:minSdkVersion="26" android:targetSdkVersion="36" android:compileSdkVersion="36"/><uses-permission android:name="android.permission.RECORD_AUDIO"/><application/></manifest>',
  });
  const aab = parseAabManifest("fixture.aab", {
    runTool: mockBundletool,
    bundletoolJar: null,
  });
  assert.equal(aab.manifest.targetSdkVersion, "36");
  assert.equal(aab.tool, "bundletool");
  assert.throws(
    () =>
      parseAabManifest("fixture.aab", {
        runTool: () => ({ available: true, output: "incomplete" }),
        bundletoolJar: null,
      }),
    /no Android App Bundle verifier produced a complete manifest/,
  );
  return 29;
}

module.exports = {
  parseManifest,
  verdictFor,
  billingVerdictFor,
  artifactMetadataVerdictFor,
  forbiddenPermissionVerdictFor,
  forbiddenServiceVerdictFor,
  FORBIDDEN_PERMISSIONS,
  manifestFromText,
  parseAabManifest,
  artifactStructureFor,
  readZipIndex,
  readZipEntry,
  runSelfTest,
  REQUIRED_TARGET_SDK,
  REQUIRED_BILLING_MAJOR,
  ENFORCED_FROM,
  BILLING_ENFORCED_FROM,
};

if (require.main === module) {
  if (process.argv[2] === "--self-test") {
    try {
      const checks = runSelfTest();
      console.log(`self-test: PASS (${checks} checks)`);
    } catch (error) {
      console.error(`self-test: FAIL (${error.message})`);
      process.exitCode = 1;
    }
  } else {
    const json = process.argv[2] === "--json";
    const file = process.argv[json ? 3 : 2];
    if (!file) {
      console.error("usage: check-apk-target-sdk.js [--json] <path-to.apk|path-to.aab>");
      process.exit(2);
    }
    const fs = require("node:fs");
    const path = require("node:path");
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      console.error(`::error::artifact does not exist or is not a regular file: ${file}`);
      process.exit(1);
    }
    const type = path.extname(file).toLowerCase().slice(1);
    if (type !== "apk" && type !== "aab") {
      console.error(
        `::error::unsupported Android artifact type '.${type || "?"}'; expected .apk or .aab`,
      );
      process.exit(1);
    }

    let manifest;
    let manifestTool;
    let manifestBillingLibrary;
    let entries;
    try {
      entries = listArchiveEntries(file);
      artifactStructureFor(type, entries);
      if (type === "apk") {
        // Read only the manifest entry; release APKs are too large to buffer whole.
        const raw = readZipEntry(file, "AndroidManifest.xml", 32 * 1024 * 1024);
        manifest = parseManifest(raw);
        manifestTool = "compiled AndroidManifest parser";
      } else {
        ({ manifest, tool: manifestTool } = parseAabManifest(file));
        manifestBillingLibrary = manifest.billingLibrary;
      }
    } catch (e) {
      console.error(`::error::could not verify Android manifest from ${file}: ${e.message}`);
      process.exit(1);
    }

    let billingProps = null;
    try {
      billingProps = readBillingProperties(file, entries);
      if (!billingProps && manifestBillingLibrary) {
        billingProps = `billing_client=${manifestBillingLibrary}`;
      }
    } catch (e) {
      console.error(`::error::could not verify Play Billing metadata from ${file}: ${e.message}`);
      process.exit(1);
    }

    const v = verdictFor(manifest);
    const m = artifactMetadataVerdictFor(manifest);
    const b = billingVerdictFor(billingProps, { required: true });
    const fp = forbiddenPermissionVerdictFor(manifest);
    const fsvc = forbiddenServiceVerdictFor(manifest);
    const metadata = {
      type,
      minSdkVersion: Number(manifest.minSdkVersion),
      targetSdkVersion: Number(manifest.targetSdkVersion),
      compileSdkVersion: Number(manifest.compileSdkVersion),
      versionCode: Number(manifest.versionCode),
      versionName: String(manifest.versionName || ""),
      billingLibrary: /billing_client\s*=\s*([0-9]+\.[0-9]+\.[0-9]+)/.exec(
        String(billingProps || ""),
      )?.[1],
      manifestTool,
      policyScanConfirmed: manifest.policyScanConfirmed === true,
    };
    if (!json) {
      console.log(
        `${type.toUpperCase()} · min ${manifest.minSdkVersion} · target ${manifest.targetSdkVersion} · compile ${manifest.compileSdkVersion} · versionCode ${manifest.versionCode} · ${manifest.versionName} · ${manifestTool}`,
      );
    }
    let failed = false;
    if (!v.ok) {
      console.error(`::error title=APK target SDK::${v.reason}`);
      failed = true;
    } else {
      if (!json) console.log(`OK: ${v.reason}`);
    }
    if (!m.ok) {
      console.error(`::error title=Android artifact metadata::${m.reason}`);
      failed = true;
    } else {
      if (!json) console.log(`OK: ${m.reason}`);
    }
    if (!b.ok) {
      console.error(`::error title=Play Billing Library::${b.reason}`);
      failed = true;
    } else {
      if (!json) console.log(`OK: ${b.reason}`);
    }
    if (!fp.ok) {
      console.error(`::error title=Forbidden Android permission::${fp.reason}`);
      failed = true;
    } else {
      if (!json) console.log(`OK: ${fp.reason}`);
    }
    if (!fsvc.ok) {
      console.error(`::error title=Forbidden Android foreground service::${fsvc.reason}`);
      failed = true;
    } else {
      if (!json) console.log(`OK: ${fsvc.reason}`);
    }
    // Both are reported before exiting. Bailing on the first would hide the
    // second finding until someone fixed the first and ran again.
    if (failed) process.exit(1);
    if (json) process.stdout.write(`${JSON.stringify(metadata)}\n`);
  }
}
