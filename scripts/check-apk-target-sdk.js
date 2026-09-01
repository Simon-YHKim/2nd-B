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

// Permissions that must never reach a published artifact, with the reason a
// reader needs to judge whether the entry is still right.
//
// FOREGROUND_SERVICE_MEDIA_PLAYBACK arrives transitively: expo-audio depends on
// androidx.media3:media3-session (node_modules/expo-audio/android/build.gradle),
// and that AAR declares the permission, so it appears only in the MERGED
// manifest — no JS package manifest in the tree contains the string. Play
// flagged it on vc 38 (2026-09-01) and demands a "media playback" declaration.
// This app never plays media: expo-audio is used for recording only
// (useAudioRecorder in call-reflection/capture/secondb; zero uses of
// useAudioPlayer/createAudioPlayer, no MediaSession, no background audio), so
// declaring media playback would be a false statement to Play. app.json blocks
// the permission instead; this check proves the block actually worked in the
// binary rather than trusting the config.
const FORBIDDEN_PERMISSIONS = [
  {
    name: "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
    why: "pulled in transitively by androidx.media3 via expo-audio; this app records audio but never plays media, so Play's media-playback declaration would be false. Blocked in app.json (android.blockedPermissions).",
  },
];

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
  const permissions = new Set();
  for (let pos = poolAt + poolSize; pos < buf.length - 8; ) {
    const type = u16(pos);
    const size = u32(pos + 4);
    if (size <= 0) break;
    if (type === 0x0102) {
      // START_ELEMENT: 16-byte chunk header, then lineNumber + comment (8),
      // then ns and name string indices. The element name decides whether the
      // android:name attribute below is a permission or something unrelated.
      const elementName = str(u32(pos + 20));
      const attrCount = u16(pos + 28);
      const attrStart = pos + 16 + u16(pos + 24);
      for (let i = 0; i < attrCount; i++) {
        const a = attrStart + i * 20;
        const id = resIds.get(u32(a + 4));
        if (elementName === "uses-permission" && id === ANDROID_NAME_ATTR) {
          const value = str(u32(a + 8));
          if (value) permissions.add(value);
        }
        const key = ATTR[id];
        if (!key) continue;
        const raw = str(u32(a + 8));
        found[key] = raw === null ? u32(a + 16) : raw;
      }
    }
    pos += size;
  }
  found.permissions = [...permissions].sort();
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
    // Both shapes a manifest tool emits: aapt/aapt2 badging lines and the XML
    // that apkanalyzer/bundletool print.
    permissions: [
      ...new Set([
        ...[...source.matchAll(/uses-permission[^\n]*?name=['"]([A-Za-z0-9_.]+)['"]/g)].map(
          (m) => m[1],
        ),
        ...[...source.matchAll(/<uses-permission[^>]*android:name=["']([^"']+)["']/g)].map(
          (m) => m[1],
        ),
      ]),
    ].sort(),
  };
}

/**
 * Refuse an artifact that carries a permission we have decided never to ship.
 *
 * Deliberately NOT symmetric with verdictFor's "unreadable is a failure": an
 * empty list can mean either "the artifact declares none" or "this manifest
 * tool does not print permissions", and those are indistinguishable from here.
 * Failing the release on the second would break publishing over a tooling
 * detail we have not observed, so an empty list passes and says out loud that
 * it proved nothing. Tighten once a real AAB's output has been seen.
 */
function forbiddenPermissionVerdictFor(manifest) {
  const list = Array.isArray(manifest?.permissions) ? manifest.permissions : [];
  if (list.length === 0) {
    return {
      ok: true,
      unconfirmed: true,
      reason:
        "no permission list came out of this manifest tool, so the forbidden-permission check proved nothing (not a pass on the permissions themselves)",
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
      {
        label: "aapt2",
        command: "aapt2",
        args: ["dump", "badging", file],
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
    if (manifest.targetSdkVersion && manifest.compileSdkVersion && manifest.versionCode) {
      return { manifest, tool: candidate.label };
    }
    attempts.push(`${candidate.label}: output did not contain required manifest fields`);
  }
  throw new Error(
    `no Android App Bundle verifier produced a complete manifest (${attempts.join("; ")}). Install a pinned bundletool jar and set BUNDLETOOL_JAR; verification is mandatory.`,
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

  // Forbidden permissions: present fails, absent passes, unreadable passes but
  // is flagged as having proved nothing.
  const forbidden = FORBIDDEN_PERMISSIONS[0].name;
  assert.equal(
    forbiddenPermissionVerdictFor({ permissions: ["android.permission.CAMERA"] }).ok,
    true,
  );
  assert.equal(
    forbiddenPermissionVerdictFor({ permissions: ["android.permission.CAMERA", forbidden] }).ok,
    false,
  );
  assert.equal(forbiddenPermissionVerdictFor({ permissions: [] }).unconfirmed, true);
  assert.equal(forbiddenPermissionVerdictFor({}).unconfirmed, true);
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
      '<manifest android:versionCode="42" android:versionName="1.2.3"><uses-sdk android:minSdkVersion="26" android:targetSdkVersion="36" android:compileSdkVersion="36"/></manifest>',
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
  return 15;
}

module.exports = {
  parseManifest,
  verdictFor,
  billingVerdictFor,
  artifactMetadataVerdictFor,
  forbiddenPermissionVerdictFor,
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
    } else if (fp.unconfirmed) {
      // Visible on purpose: a silent pass here would read as "checked and
      // clean" when nothing was checked at all.
      console.error(`::warning title=Forbidden Android permission::${fp.reason}`);
    } else {
      if (!json) console.log(`OK: ${fp.reason}`);
    }
    // Both are reported before exiting. Bailing on the first would hide the
    // second finding until someone fixed the first and ran again.
    if (failed) process.exit(1);
    if (json) process.stdout.write(`${JSON.stringify(metadata)}\n`);
  }
}
