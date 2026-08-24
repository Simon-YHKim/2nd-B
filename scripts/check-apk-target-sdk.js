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

// Play's second notice on the same app was the Billing Library floor. The APK
// records the resolved version in billing.properties, so it is readable from
// the same artifact - and like the target SDK, we do not pin it: it arrives
// through react-native-purchases.
const REQUIRED_BILLING_MAJOR = 7;

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

function parseManifest(buf) {
  const u16 = (o) => buf.readUInt16LE(o);
  const u32 = (o) => buf.readUInt32LE(o);

  if (u16(0) !== 3) throw new Error("not a compiled AndroidManifest");

  const poolAt = 8;
  const poolSize = u32(poolAt + 4);
  const count = u32(poolAt + 8);
  const isUtf8 = Boolean(u32(poolAt + 16) & (1 << 8));
  const stringsStart = u32(poolAt + 20);
  const offsets = [];
  for (let i = 0; i < count; i++) offsets.push(u32(poolAt + 28 + 4 * i));

  const str = (i) => {
    if (i === 0xffffffff || i >= count) return null;
    let p = poolAt + stringsStart + offsets[i];
    if (isUtf8) {
      if (buf[p] & 0x80) p += 1; // 2-byte character count
      let len = buf[p + 1];
      if (len & 0x80) {
        len = ((len & 0x7f) << 8) | buf[p + 2];
        p += 1;
      }
      return buf.toString("utf8", p + 2, p + 2 + len);
    }
    const len = u16(p);
    return buf.toString("utf16le", p + 2, p + 2 + len * 2);
  };

  // Pass one: the resource map, so attribute ids can be resolved.
  const resIds = new Map();
  for (let pos = poolAt + poolSize; pos < buf.length - 8; ) {
    const type = u16(pos);
    const size = u32(pos + 4);
    if (size <= 0) break;
    if (type === 0x0180) {
      for (let i = 0; i < (size - 8) / 4; i++) resIds.set(i, u32(pos + 8 + 4 * i));
    }
    pos += size;
  }

  // Pass two: the elements. Attribute offsets are relative to the node header,
  // not the chunk — attributeStart lives at +24 and counts from +16.
  const found = {};
  for (let pos = poolAt + poolSize; pos < buf.length - 8; ) {
    const type = u16(pos);
    const size = u32(pos + 4);
    if (size <= 0) break;
    if (type === 0x0102) {
      const attrCount = u16(pos + 28);
      const attrStart = pos + 16 + u16(pos + 24);
      for (let i = 0; i < attrCount; i++) {
        const a = attrStart + i * 20;
        const key = ATTR[resIds.get(u32(a + 4))];
        if (!key) continue;
        const raw = str(u32(a + 8));
        found[key] = raw === null ? u32(a + 16) : raw;
      }
    }
    pos += size;
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

// billing.properties is a plain key=value file the Play Billing Library writes
// into the APK. Absent means the library is not in this build, which is not a
// violation - only a present-and-too-old version is.
function billingVerdictFor(properties) {
  if (properties === null || properties === undefined) {
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
      reason: `Play Billing Library ${version}; Play requires ${REQUIRED_BILLING_MAJOR}.x or newer. It comes from react-native-purchases, so upgrade that rather than looking for a pin here.`,
    };
  }
  return { ok: true, reason: `Play Billing Library ${version}` };
}

module.exports = {
  parseManifest,
  verdictFor,
  billingVerdictFor,
  REQUIRED_TARGET_SDK,
  REQUIRED_BILLING_MAJOR,
  ENFORCED_FROM,
};

if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: check-apk-target-sdk.js <path-to.apk>");
    process.exit(2);
  }
  // Only an APK is a plain zip with a compiled manifest at a known path. An AAB
  // stores a protobuf manifest under base/, so it is skipped rather than
  // guessed at.
  if (!file.endsWith(".apk")) {
    console.log(`skip: ${file} is not an .apk (an .aab stores its manifest as protobuf).`);
    process.exit(0);
  }

  const { execFileSync } = require("node:child_process");
  let manifest;
  try {
    // unzip -p keeps the whole APK out of memory; these are ~80 MB.
    const raw = execFileSync("unzip", ["-p", file, "AndroidManifest.xml"], {
      maxBuffer: 32 * 1024 * 1024,
      encoding: "buffer",
    });
    manifest = parseManifest(raw);
  } catch (e) {
    console.error(`::error::could not read AndroidManifest.xml from ${file}: ${e.message}`);
    process.exit(1);
  }

  let billingProps = null;
  try {
    billingProps = execFileSync("unzip", ["-p", file, "billing.properties"], {
      maxBuffer: 1024 * 1024,
      encoding: "utf8",
    });
  } catch {
    // Not in the APK. billingVerdictFor treats that as fine.
  }

  const v = verdictFor(manifest);
  const b = billingVerdictFor(billingProps);
  console.log(
    `min ${manifest.minSdkVersion} · target ${manifest.targetSdkVersion} · compile ${manifest.compileSdkVersion} · versionCode ${manifest.versionCode} · ${manifest.versionName}`,
  );
  let failed = false;
  if (!v.ok) {
    console.error(`::error title=APK target SDK::${v.reason}`);
    failed = true;
  } else {
    console.log(`OK: ${v.reason}`);
  }
  if (!b.ok) {
    console.error(`::error title=Play Billing Library::${b.reason}`);
    failed = true;
  } else {
    console.log(`OK: ${b.reason}`);
  }
  // Both are reported before exiting. Bailing on the first would hide the
  // second finding until someone fixed the first and ran again.
  if (failed) process.exit(1);
}
