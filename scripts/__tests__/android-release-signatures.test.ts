import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import zlib from "node:zlib";

const root = path.resolve(__dirname, "../..");
const workflowPath = path.join(root, ".github/workflows/github-release.yml");

const loadChecker = () =>
  require("../check-android-release-signatures") as {
    normalizeDigest: (value: unknown, code?: string) => string;
    parseApkSignerDigests: (output: string) => string[];
    parseAabSignerDigests: (output: string) => string[];
    assertAabJarVerified: (output: string) => void;
    verifyReleaseSigners: (args: {
      apkOutput: string;
      aabVerificationOutput: string;
      aabCertificateOutput: string;
      aabFile: string;
      apkExpected: unknown;
      aabExpected: unknown;
    }) => { apkSignerCount: number; aabSignerCount: number };
  };

const APK_DIGEST = "a1".repeat(32);
const AAB_DIGEST = "b2".repeat(32);
const OTHER_DIGEST = "c3".repeat(32);
const asFingerprint = (digest: string) => digest.match(/../g)!.join(":").toUpperCase();

const apkSigner = (label: string, digest = APK_DIGEST) =>
  `${label} certificate DN: CN=Release\n${label} certificate SHA-256 digest: ${digest}\n${label} certificate SHA-1 digest: ${"d4".repeat(20)}\n`;

const aabCertificate = (number: number, digest: string) => `Certificate #${number}:
Owner: CN=Release
Issuer: CN=Release
Certificate fingerprints:
\t SHA1: ${asFingerprint("d4".repeat(20))}
\t SHA256: ${asFingerprint(digest)}
Signature algorithm name: SHA256withRSA
`;

const aabSigner = (number: number, leaf = AAB_DIGEST, chain = OTHER_DIGEST) =>
  `Signer #${number}:\n\n${aabCertificate(1, leaf)}\n${aabCertificate(2, chain)}\n`;

const CROSS_CHECK_SUMMARY =
  "This JAR file contains internal inconsistencies that may result in different contents when reading via JarFile and JarInputStream:";
const MANIFEST_PATH = "META-INF/MANIFEST.MF";
const PAYLOAD_NAMES = ["BundleConfig.pb", "base/manifest/AndroidManifest.xml"];

const manifestFor = (names: string[]) =>
  [
    "Manifest-Version: 1.0\r\n",
    ...names.map(
      (name) => `\r\nName: ${name}\r\nSHA-256-Digest: ${Buffer.from(name).toString("base64")}\r\n`,
    ),
    "\r\n",
  ].join("");

const manifestLastReport = (names = [...PAYLOAD_NAMES, MANIFEST_PATH]) =>
  [
    "jar verified.",
    CROSS_CHECK_SUMMARY,
    "- Manifest is missing when reading via JarInputStream",
    ...names.map(
      (name) => `- Entry ${name} is signed in JarFile but is not signed in JarInputStream`,
    ),
    "",
  ].join("\n");

const CRC32_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return crc >>> 0;
});
const crc32 = (buffer: Buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

type ZipEntryOptions = {
  method?: 0 | 8;
  flags?: number;
  descriptor?: boolean;
  localCrcOverride?: number | "central";
  localCompressedSizeOverride?: number | "central";
  localUncompressedSizeOverride?: number | "central";
  localExtra?: Buffer;
  centralExtra?: Buffer;
  compressedSuffix?: Buffer;
  crcOverride?: number;
  uncompressedSizeOverride?: number;
};
type ZipEntry = [string, string | Buffer, ZipEntryOptions?];

const zipExtra = (id: number, data: Buffer) => {
  const header = Buffer.alloc(4);
  header.writeUInt16LE(id, 0);
  header.writeUInt16LE(data.length, 2);
  return Buffer.concat([header, data]);
};

const extendedTimestampExtra = (flags: number, ...seconds: number[]) => {
  const data = Buffer.alloc(1 + seconds.length * 4);
  data.writeUInt8(flags, 0);
  seconds.forEach((value, index) => data.writeUInt32LE(value, 1 + index * 4));
  return zipExtra(0x5455, data);
};

const makeStoredZip = (files: ZipEntry[]) => {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;
  for (const [name, raw, options = {}] of files) {
    const nameBytes = Buffer.from(name, "utf8");
    const data = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    const method = options.method ?? 0;
    const flags = (options.flags ?? 0) | (options.descriptor ? 0x0008 : 0);
    const localExtra = options.localExtra ?? Buffer.alloc(0);
    const centralExtra = options.centralExtra ?? localExtra;
    const compressedBody = method === 8 ? zlib.deflateRawSync(data) : data;
    const compressed = Buffer.concat([compressedBody, options.compressedSuffix ?? Buffer.alloc(0)]);
    const checksum = options.crcOverride ?? crc32(data);
    const uncompressedSize = options.uncompressedSizeOverride ?? data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(
      options.localCrcOverride === "central"
        ? checksum
        : (options.localCrcOverride ?? (options.descriptor ? 0 : checksum)),
      14,
    );
    local.writeUInt32LE(
      options.localCompressedSizeOverride === "central"
        ? compressed.length
        : (options.localCompressedSizeOverride ?? (options.descriptor ? 0 : compressed.length)),
      18,
    );
    local.writeUInt32LE(
      options.localUncompressedSizeOverride === "central"
        ? uncompressedSize
        : (options.localUncompressedSizeOverride ?? (options.descriptor ? 0 : uncompressedSize)),
      22,
    );
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(localExtra.length, 28);
    const descriptor = options.descriptor
      ? (() => {
          const value = Buffer.alloc(16);
          value.writeUInt32LE(0x08074b50, 0);
          value.writeUInt32LE(checksum, 4);
          value.writeUInt32LE(compressed.length, 8);
          value.writeUInt32LE(uncompressedSize, 12);
          return value;
        })()
      : Buffer.alloc(0);
    const localPart = Buffer.concat([local, nameBytes, localExtra, compressed, descriptor]);
    localParts.push(localPart);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(uncompressedSize, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(centralExtra.length, 30);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(Buffer.concat([central, nameBytes, centralExtra]));
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

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "android-release-signatures-"));
let fixtureSequence = 0;
const writeAab = (files: ZipEntry[]) => {
  const file = path.join(fixtureRoot, `fixture-${fixtureSequence++}.aab`);
  fs.writeFileSync(file, makeStoredZip(files));
  return file;
};
const signedAabFiles = (
  payloadNames = PAYLOAD_NAMES,
  signerNames = ["RELEASE"],
): Array<[string, string | Buffer]> => [
  ...payloadNames.map((name) => [name, `payload:${name}`] as [string, string]),
  ...signerNames.flatMap(
    (name) =>
      [
        [`META-INF/${name}.SF`, `signature-file:${name}`],
        [`META-INF/${name}.RSA`, `signature-block:${name}`],
      ] as Array<[string, string]>,
  ),
  [MANIFEST_PATH, manifestFor(payloadNames)],
];

const withZipOptions = (
  files: Array<[string, string | Buffer]>,
  targetName: string,
  options: ZipEntryOptions,
): ZipEntry[] =>
  files.map(([name, data]) => (name === targetName ? [name, data, options] : [name, data]));

afterAll(() => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

describe("strict SHA-256 certificate digest boundary", () => {
  test("accepts only canonical compact or byte-colon forms", () => {
    const { normalizeDigest } = loadChecker();
    expect(normalizeDigest(APK_DIGEST.toUpperCase())).toBe(APK_DIGEST);
    expect(normalizeDigest(`  ${asFingerprint(APK_DIGEST)}\n`)).toBe(APK_DIGEST);
  });

  test.each([
    "",
    "a1".repeat(31),
    "a1".repeat(33),
    `SHA256:${APK_DIGEST}`,
    APK_DIGEST.replace("a", "z"),
    asFingerprint(APK_DIGEST).replace(":", "-"),
    `${APK_DIGEST}:00`,
  ])("rejects malformed or decorated value %#", (value) => {
    const { normalizeDigest } = loadChecker();
    expect(() => normalizeDigest(value)).toThrow("digest-invalid");
  });
});

describe("apksigner output", () => {
  test("accepts legacy and Build Tools 37 signer labels while excluding a source stamp", () => {
    const { parseApkSignerDigests } = loadChecker();
    const numbered = [apkSigner("Signer #1"), apkSigner("Signer #2")].join("");
    const legacySdkRange = [
      apkSigner("Signer (minSdkVersion=24, maxSdkVersion=32)"),
      apkSigner("Signer (minSdkVersion=33 (dev release=true), maxSdkVersion=1000000)"),
      apkSigner("Source Stamp Signer", OTHER_DIGEST),
    ].join("");
    const schemeSingle = [
      apkSigner("V2 Signer:"),
      apkSigner("Source Stamp Signer:", OTHER_DIGEST),
    ].join("");
    const schemeNumbered = [apkSigner("V2 Signer #1:"), apkSigner("V2 Signer #2:")].join("");
    const schemeSdkRange = [
      apkSigner("V3.1 Signer: (minSdkVersion=33 (dev release=true), maxSdkVersion=1000000)"),
      apkSigner("V3.0 Signer: (minSdkVersion=24, maxSdkVersion=32)"),
    ].join("");

    expect(parseApkSignerDigests(numbered)).toEqual([APK_DIGEST, APK_DIGEST]);
    expect(parseApkSignerDigests(legacySdkRange)).toEqual([APK_DIGEST, APK_DIGEST]);
    expect(parseApkSignerDigests(schemeSingle)).toEqual([APK_DIGEST]);
    expect(parseApkSignerDigests(schemeNumbered)).toEqual([APK_DIGEST, APK_DIGEST]);
    expect(parseApkSignerDigests(schemeSdkRange)).toEqual([APK_DIGEST, APK_DIGEST]);
  });

  test("rejects an unrecognized certificate signer instead of silently ignoring it", () => {
    const { parseApkSignerDigests } = loadChecker();
    const hidden = apkSigner("Unexpected Signer:", OTHER_DIGEST);
    expect(() => parseApkSignerDigests(apkSigner("Signer #1") + hidden)).toThrow(
      "apk-signer-label-invalid",
    );
  });

  test("rejects missing, duplicate, or truncated signer records", () => {
    const { parseApkSignerDigests } = loadChecker();
    expect(() => parseApkSignerDigests(apkSigner("Source Stamp Signer"))).toThrow(
      "apk-signer-missing",
    );
    expect(() => parseApkSignerDigests(apkSigner("Signer #1") + apkSigner("Signer #1"))).toThrow(
      "apk-signer-duplicate",
    );
    expect(() => parseApkSignerDigests(apkSigner("Signer #1", APK_DIGEST.slice(0, -2)))).toThrow(
      "apk-signer-digest-invalid",
    );
  });
});

describe("keytool AAB signer blocks", () => {
  test("reads only Certificate #1 from each signer and ignores chain certificates", () => {
    const { parseAabSignerDigests } = loadChecker();
    expect(parseAabSignerDigests(aabSigner(1) + aabSigner(2))).toEqual([AAB_DIGEST, AAB_DIGEST]);
  });

  test("rejects a fingerprint without a Signer header", () => {
    const { parseAabSignerDigests } = loadChecker();
    expect(() => parseAabSignerDigests(aabCertificate(1, AAB_DIGEST))).toThrow(
      "aab-digest-outside-signer",
    );
  });

  test("requires exactly one leaf Certificate #1 and one leaf SHA256", () => {
    const { parseAabSignerDigests } = loadChecker();
    const duplicateLeaf = `Signer #1:\n${aabCertificate(1, AAB_DIGEST)}${aabCertificate(
      1,
      AAB_DIGEST,
    )}`;
    const duplicateDigest = `Signer #1:\nCertificate #1:\nCertificate fingerprints:\n\t SHA256: ${asFingerprint(
      AAB_DIGEST,
    )}\n\t SHA256: ${asFingerprint(AAB_DIGEST)}\n`;
    const missingDigest = "Signer #1:\nCertificate #1:\nOwner: CN=Release\n";
    const truncatedDigest = `Signer #1:\nCertificate #1:\n\t SHA256: ${asFingerprint(
      AAB_DIGEST,
    ).slice(0, -3)}\n`;

    expect(() => parseAabSignerDigests(duplicateLeaf)).toThrow("aab-leaf-certificate-count");
    expect(() => parseAabSignerDigests(duplicateDigest)).toThrow("aab-leaf-digest-count");
    expect(() => parseAabSignerDigests(missingDigest)).toThrow("aab-leaf-digest-count");
    expect(() => parseAabSignerDigests(truncatedDigest)).toThrow("aab-leaf-digest-invalid");
  });
});

describe("release signer contract", () => {
  const validArgs = (aabFile = writeAab(signedAabFiles())) => ({
    apkOutput: apkSigner("Signer #1"),
    aabVerificationOutput: manifestLastReport(),
    aabCertificateOutput: aabSigner(1),
    aabFile,
    apkExpected: APK_DIGEST,
    aabExpected: AAB_DIGEST,
  });

  test("requires every signer to match its artifact-specific protected value", () => {
    const { verifyReleaseSigners } = loadChecker();
    expect(verifyReleaseSigners(validArgs())).toEqual({ apkSignerCount: 1, aabSignerCount: 1 });
    expect(() =>
      verifyReleaseSigners({
        ...validArgs(),
        apkOutput: apkSigner("Signer #1") + apkSigner("Signer #2", OTHER_DIGEST),
      }),
    ).toThrow("apk-signer-mismatch");
    expect(() =>
      verifyReleaseSigners({
        ...validArgs(writeAab(signedAabFiles(PAYLOAD_NAMES, ["FIRST", "SECOND"]))),
        aabCertificateOutput: aabSigner(1) + aabSigner(2, OTHER_DIGEST),
      }),
    ).toThrow("aab-signer-mismatch");
  });

  test("does not let one expected digest substitute for the other", () => {
    const { verifyReleaseSigners } = loadChecker();
    expect(() => verifyReleaseSigners({ ...validArgs(), aabExpected: undefined })).toThrow(
      "aab-expected-digest-invalid",
    );
    expect(() =>
      verifyReleaseSigners({
        ...validArgs(),
        apkExpected: AAB_DIGEST,
        aabExpected: APK_DIGEST,
      }),
    ).toThrow("apk-signer-mismatch");
  });

  test("fails closed when jarsigner reports unsigned content", () => {
    const { assertAabJarVerified, verifyReleaseSigners } = loadChecker();
    expect(() =>
      assertAabJarVerified("jar verified.\nThis jar contains unsigned entries.\n"),
    ).toThrow("aab-jar-unsigned");
    expect(() =>
      verifyReleaseSigners({ ...validArgs(), aabVerificationOutput: "Not a signed jar file" }),
    ).toThrow("aab-jar-unverified");
  });

  test("accepts the manifest-last JarInputStream warning only with exact archive evidence", () => {
    const { verifyReleaseSigners } = loadChecker();
    expect(
      verifyReleaseSigners({
        ...validArgs(),
        aabVerificationOutput: manifestLastReport(),
      }),
    ).toEqual({ apkSignerCount: 1, aabSignerCount: 1 });
  });

  test("keeps accepting a conventional manifest-first verified JAR", () => {
    const { verifyReleaseSigners } = loadChecker();
    const manifestLast = signedAabFiles();
    const manifestFirst = [manifestLast[manifestLast.length - 1], ...manifestLast.slice(0, -1)];
    expect(
      verifyReleaseSigners({
        ...validArgs(writeAab(manifestFirst)),
        aabVerificationOutput: "jar verified.\n",
      }),
    ).toEqual({ apkSignerCount: 1, aabSignerCount: 1 });
  });

  test("accepts safe explicit directory entries without treating them as signed payload", () => {
    const { verifyReleaseSigners } = loadChecker();
    const standardFiles: Array<[string, string | Buffer]> = [
      ["META-INF/", ""],
      [MANIFEST_PATH, manifestFor(PAYLOAD_NAMES)],
      ["META-INF/RELEASE.SF", "signature-file:RELEASE"],
      ["META-INF/RELEASE.RSA", "signature-block:RELEASE"],
      ["base/", ""],
      ...PAYLOAD_NAMES.map(
        (name) => [name, `payload:${name}`] as [string, string],
      ),
    ];
    expect(
      verifyReleaseSigners({
        ...validArgs(writeAab(standardFiles)),
        aabVerificationOutput: "jar verified.\n",
      }),
    ).toEqual({ apkSignerCount: 1, aabSignerCount: 1 });

    const manifestLast = signedAabFiles();
    const manifestLastWithDirectories: Array<[string, string | Buffer]> = [
      ["base/", ""],
      ...manifestLast.slice(0, PAYLOAD_NAMES.length),
      ["META-INF/", ""],
      ...manifestLast.slice(PAYLOAD_NAMES.length),
      ["empty/", ""],
    ];
    expect(
      verifyReleaseSigners({
        ...validArgs(writeAab(manifestLastWithDirectories)),
        aabVerificationOutput: manifestLastReport(),
      }),
    ).toEqual({ apkSignerCount: 1, aabSignerCount: 1 });
  });

  test.each(["META-INF/../", "base//", "base\\unsafe/"])(
    "rejects unsafe explicit directory path %s",
    (directory) => {
      const { verifyReleaseSigners } = loadChecker();
      const manifestFirst = signedAabFiles();
      const files: Array<[string, string | Buffer]> = [
        ["META-INF/", ""],
        manifestFirst[manifestFirst.length - 1],
        [directory, ""],
        ...manifestFirst.slice(0, -1),
      ];
      expect(() =>
        verifyReleaseSigners({
          ...validArgs(writeAab(files)),
          aabVerificationOutput: "jar verified.\n",
        }),
      ).toThrow("aab-archive-path-invalid");
    },
  );

  test("decodes directory entries and rejects data or a forged empty CRC", () => {
    const { verifyReleaseSigners } = loadChecker();
    const manifestFirst = signedAabFiles();
    const directoryFixture = (contents: string) =>
      writeAab([
        ["META-INF/", contents],
        manifestFirst[manifestFirst.length - 1],
        ...manifestFirst.slice(0, -1),
      ]);
    const expectRejected = (aabFile: string) =>
      expect(() =>
        verifyReleaseSigners({
          ...validArgs(aabFile),
          aabVerificationOutput: "jar verified.\n",
        }),
      ).toThrow("aab-archive-invalid");

    expectRejected(directoryFixture("not-empty"));

    const hiddenData = directoryFixture("not-empty");
    const hiddenDataBytes = fs.readFileSync(hiddenData);
    const hiddenDataCentral = hiddenDataBytes.readUInt32LE(hiddenDataBytes.length - 6);
    hiddenDataBytes.writeUInt32LE(0, 22);
    hiddenDataBytes.writeUInt32LE(0, hiddenDataCentral + 24);
    fs.writeFileSync(hiddenData, hiddenDataBytes);
    expectRejected(hiddenData);

    const forgedCrc = directoryFixture("");
    const forgedCrcBytes = fs.readFileSync(forgedCrc);
    const forgedCrcCentral = forgedCrcBytes.readUInt32LE(forgedCrcBytes.length - 6);
    forgedCrcBytes.writeUInt32LE(1, 14);
    forgedCrcBytes.writeUInt32LE(1, forgedCrcCentral + 16);
    fs.writeFileSync(forgedCrc, forgedCrcBytes);
    expectRejected(forgedCrc);
  });

  test("keeps enforcing manifest order across directory entries", () => {
    const { verifyReleaseSigners } = loadChecker();
    const manifestLast = signedAabFiles();
    const files: Array<[string, string | Buffer]> = [
      ["META-INF/", ""],
      manifestLast[0],
      manifestLast[manifestLast.length - 1],
      ...manifestLast.slice(1, -1),
    ];
    expect(() =>
      verifyReleaseSigners({
        ...validArgs(writeAab(files)),
        aabVerificationOutput: "jar verified.\n",
      }),
    ).toThrow("aab-manifest-order-invalid");
  });

  test("accepts deflate flags, a signed descriptor, and metadata-only timestamp extras", () => {
    const { verifyReleaseSigners } = loadChecker();
    const modifiedAt = 1_700_000_000;
    const aabFile = writeAab(
      withZipOptions(signedAabFiles(), PAYLOAD_NAMES[0], {
        method: 8,
        flags: 0x0806,
        descriptor: true,
        localExtra: Buffer.concat([
          zipExtra(0xcafe, Buffer.alloc(0)),
          extendedTimestampExtra(0x03, modifiedAt, modifiedAt + 1),
        ]),
        centralExtra: Buffer.concat([
          zipExtra(0xcafe, Buffer.alloc(0)),
          extendedTimestampExtra(0x03, modifiedAt),
        ]),
      }),
    );
    expect(verifyReleaseSigners(validArgs(aabFile))).toEqual({
      apkSignerCount: 1,
      aabSignerCount: 1,
    });

    const storedDescriptor = writeAab(
      withZipOptions(signedAabFiles(), PAYLOAD_NAMES[0], {
        flags: 0x0800,
        descriptor: true,
      }),
    );
    expect(verifyReleaseSigners(validArgs(storedDescriptor))).toEqual({
      apkSignerCount: 1,
      aabSignerCount: 1,
    });
  });

  test.each([
    ["a reserved flag", { flags: 0x4000 }],
    ["a STORE-only compression option", { flags: 0x0002 }],
  ] satisfies Array<[string, ZipEntryOptions]>)("rejects %s", (_name, options) => {
    const { verifyReleaseSigners } = loadChecker();
    const aabFile = writeAab(withZipOptions(signedAabFiles(), PAYLOAD_NAMES[0], options));
    expect(() => verifyReleaseSigners(validArgs(aabFile))).toThrow("aab-archive-invalid");
  });

  test("rejects trailing bytes after a complete deflate stream", () => {
    const { verifyReleaseSigners } = loadChecker();
    const aabFile = writeAab(
      withZipOptions(signedAabFiles(), MANIFEST_PATH, {
        method: 8,
        compressedSuffix: Buffer.from([0, 0]),
      }),
    );
    expect(() => verifyReleaseSigners(validArgs(aabFile))).toThrow("aab-archive-invalid");
  });

  test.each([
    ["payload", PAYLOAD_NAMES[0]],
    ["signature material", "META-INF/RELEASE.RSA"],
  ])("rejects trailing bytes in a deflated %s entry", (_kind, targetName) => {
    const { verifyReleaseSigners } = loadChecker();
    const aabFile = writeAab(
      withZipOptions(signedAabFiles(), targetName, {
        method: 8,
        compressedSuffix: Buffer.from([0, 0]),
      }),
    );
    expect(() => verifyReleaseSigners(validArgs(aabFile))).toThrow("aab-archive-invalid");
  });

  test.each([
    ["payload CRC", PAYLOAD_NAMES[0], { crcOverride: 1 }],
    [
      "signature material size",
      "META-INF/RELEASE.SF",
      { uncompressedSizeOverride: 1_000_000 },
    ],
  ] satisfies Array<[string, string, ZipEntryOptions]>)(
    "rejects a stored entry with an invalid declared %s",
    (_kind, targetName, options) => {
      const { verifyReleaseSigners } = loadChecker();
      const aabFile = writeAab(withZipOptions(signedAabFiles(), targetName, options));
      expect(() => verifyReleaseSigners(validArgs(aabFile))).toThrow("aab-archive-invalid");
    },
  );

  test.each([
    ["payload CRC", PAYLOAD_NAMES[0], { method: 8, crcOverride: 1 }],
    [
      "signature material size",
      "META-INF/RELEASE.SF",
      { method: 8, uncompressedSizeOverride: 1_000_000 },
    ],
  ] satisfies Array<[string, string, ZipEntryOptions]>) (
    "rejects a deflated entry with an invalid declared %s",
    (_kind, targetName, options) => {
      const { verifyReleaseSigners } = loadChecker();
      const aabFile = writeAab(withZipOptions(signedAabFiles(), targetName, options));
      expect(() => verifyReleaseSigners(validArgs(aabFile))).toThrow("aab-archive-invalid");
    },
  );

  test.each([
    ["stored", "CRC", { method: 0, descriptor: true, localCrcOverride: "central" }],
    [
      "stored",
      "compressed size",
      { method: 0, descriptor: true, localCompressedSizeOverride: "central" },
    ],
    [
      "stored",
      "uncompressed size",
      { method: 0, descriptor: true, localUncompressedSizeOverride: "central" },
    ],
    ["deflated", "CRC", { method: 8, descriptor: true, localCrcOverride: "central" }],
    [
      "deflated",
      "compressed size",
      { method: 8, descriptor: true, localCompressedSizeOverride: "central" },
    ],
    [
      "deflated",
      "uncompressed size",
      { method: 8, descriptor: true, localUncompressedSizeOverride: "central" },
    ],
  ] satisfies Array<[string, string, ZipEntryOptions]>)(
    "rejects a %s descriptor entry with a nonzero local %s placeholder",
    (_storage, _field, options) => {
      const { verifyReleaseSigners } = loadChecker();
      const aabFile = writeAab(withZipOptions(signedAabFiles(), PAYLOAD_NAMES[0], options));
      expect(() => verifyReleaseSigners(validArgs(aabFile))).toThrow("aab-archive-invalid");
    },
  );

  test.each([
    ["a malformed local extra", { localExtra: Buffer.from([0x55, 0x54, 0x04]) }],
    ["a malformed central extra", { centralExtra: Buffer.from([0x55, 0x54, 0x04]) }],
    ["a ZIP64 extra", { localExtra: zipExtra(0x0001, Buffer.alloc(0)) }],
    [
      "conflicting timestamp metadata",
      {
        localExtra: extendedTimestampExtra(0x01, 1_700_000_000),
        centralExtra: extendedTimestampExtra(0x01, 1_700_000_001),
      },
    ],
    [
      "a missing central modification time",
      {
        localExtra: extendedTimestampExtra(0x01, 1_700_000_000),
        centralExtra: Buffer.alloc(0),
      },
    ],
    [
      "a central-only modification timestamp",
      {
        localExtra: Buffer.alloc(0),
        centralExtra: extendedTimestampExtra(0x01, 1_700_000_000),
      },
    ],
    [
      "central-only access-time flags",
      {
        localExtra: Buffer.alloc(0),
        centralExtra: extendedTimestampExtra(0x02),
      },
    ],
    [
      "local-only access-time flags",
      {
        localExtra: extendedTimestampExtra(0x02, 1_700_000_000),
        centralExtra: Buffer.alloc(0),
      },
    ],
    [
      "incompatible timestamp flags",
      {
        localExtra: extendedTimestampExtra(0x03, 1_700_000_000, 1_700_000_001),
        centralExtra: extendedTimestampExtra(0x01, 1_700_000_000),
      },
    ],
    [
      "a Unicode-path extra",
      {
        localExtra: zipExtra(
          0x7075,
          Buffer.from([1, 0, 0, 0, 0, ...Buffer.from("renamed-entry", "utf8")]),
        ),
      },
    ],
    [
      "an AES encryption extra",
      { localExtra: zipExtra(0x9901, Buffer.from([2, 0, 0x41, 0x45, 3, 8, 0])) },
    ],
  ] satisfies Array<[string, ZipEntryOptions]>)("rejects %s", (_name, options) => {
    const { verifyReleaseSigners } = loadChecker();
    const aabFile = writeAab(withZipOptions(signedAabFiles(), PAYLOAD_NAMES[0], options));
    expect(() => verifyReleaseSigners(validArgs(aabFile))).toThrow("aab-archive-invalid");
  });

  test.each([
    ["missing warning", manifestLastReport(PAYLOAD_NAMES)],
    ["duplicate warning", manifestLastReport([...PAYLOAD_NAMES, PAYLOAD_NAMES[0], MANIFEST_PATH])],
    ["extra warning", manifestLastReport([...PAYLOAD_NAMES, "base/extra.bin", MANIFEST_PATH])],
    [
      "reverse signer direction",
      manifestLastReport().replace(
        "is signed in JarFile but is not signed in JarInputStream",
        "is signed in JarInputStream but is not signed in JarFile",
      ),
    ],
    [
      "entry presence mismatch",
      `${manifestLastReport()}- Entry base/extra.bin is present when reading via JarFile but missing via JarInputStream\n`,
    ],
    [
      "signature verification failure",
      `${manifestLastReport()}- Signature verification failed on entry BundleConfig.pb when reading via JarInputStream\n`,
    ],
    [
      "different signers",
      `${manifestLastReport()}- Code signers are different for entry BundleConfig.pb when reading from JarFile and JarInputStream\n`,
    ],
    [
      "a separated not-signed warning",
      `${manifestLastReport()}\nEntry base/extra.bin is not signed\n`,
    ],
    [
      "a separated signer-difference warning",
      `${manifestLastReport()}\n- Code signers are different for entry BundleConfig.pb when reading from JarFile and JarInputStream\n`,
    ],
  ])("rejects %s in the JarFile/JarInputStream cross-check", (_name, report) => {
    const { verifyReleaseSigners } = loadChecker();
    expect(() => verifyReleaseSigners({ ...validArgs(), aabVerificationOutput: report })).toThrow();
  });

  test("rejects malformed manifest-last archive structure and unsigned payload", () => {
    const { verifyReleaseSigners } = loadChecker();
    const assertRejected = (files: Array<[string, string | Buffer]>, code: string) => {
      expect(() =>
        verifyReleaseSigners({
          ...validArgs(writeAab(files)),
          aabVerificationOutput: manifestLastReport(),
        }),
      ).toThrow(code);
    };

    assertRejected(
      [...signedAabFiles(), [MANIFEST_PATH, manifestFor(PAYLOAD_NAMES)]],
      "aab-archive-invalid",
    );
    assertRejected(
      signedAabFiles([...PAYLOAD_NAMES, "base/unsigned.bin"]).map(([name, value]) =>
        name === MANIFEST_PATH ? [name, manifestFor(PAYLOAD_NAMES)] : [name, value],
      ),
      "aab-manifest-payload-mismatch",
    );
    assertRejected(
      [...signedAabFiles().slice(0, -1), ["META-INF/manifest.mf", manifestFor(PAYLOAD_NAMES)]],
      "aab-manifest-count",
    );
    assertRejected(
      [[MANIFEST_PATH, manifestFor(PAYLOAD_NAMES)], ...signedAabFiles().slice(0, -1)],
      "aab-manifest-order-invalid",
    );
    assertRejected(
      signedAabFiles().filter(([name]) => !name.endsWith(".RSA")),
      "aab-signature-material-invalid",
    );
    assertRejected(
      signedAabFiles().map(([name, value]) =>
        name === MANIFEST_PATH
          ? [
              name,
              `${manifestFor(PAYLOAD_NAMES)}Name: ${PAYLOAD_NAMES[0]}\r\nSHA-256-Digest: AA==\r\n\r\n`,
            ]
          : [name, value],
      ),
      "aab-manifest-invalid",
    );

    const localNameMismatch = writeAab(signedAabFiles());
    const localNameMismatchBytes = fs.readFileSync(localNameMismatch);
    localNameMismatchBytes[30] ^= 1;
    fs.writeFileSync(localNameMismatch, localNameMismatchBytes);
    expect(() =>
      verifyReleaseSigners({
        ...validArgs(localNameMismatch),
        aabVerificationOutput: manifestLastReport(),
      }),
    ).toThrow("aab-archive-invalid");
  });

  test("correlates each archive signature pair with each keytool signer block", () => {
    const { verifyReleaseSigners } = loadChecker();
    const aabFile = writeAab(signedAabFiles(PAYLOAD_NAMES, ["FIRST", "SECOND"]));
    expect(
      verifyReleaseSigners({
        ...validArgs(aabFile),
        aabVerificationOutput: manifestLastReport(),
        aabCertificateOutput: aabSigner(1) + aabSigner(2),
      }),
    ).toEqual({ apkSignerCount: 1, aabSignerCount: 2 });
    expect(() =>
      verifyReleaseSigners({
        ...validArgs(aabFile),
        aabVerificationOutput: manifestLastReport(),
      }),
    ).toThrow("aab-signer-archive-count");
  });
});

describe("GitHub Release workflow wiring", () => {
  const workflow = fs.readFileSync(workflowPath, "utf8");

  test("passes independent secrets only through the dedicated signer gate environment", () => {
    expect(workflow).toContain(
      "ANDROID_APK_SIGNER_SHA256: ${{ secrets.ANDROID_APK_SIGNER_SHA256 }}",
    );
    expect(workflow).toContain(
      "ANDROID_AAB_SIGNER_SHA256: ${{ secrets.ANDROID_AAB_SIGNER_SHA256 }}",
    );
    expect(workflow).not.toMatch(/ANDROID_(?:APK|AAB)_SIGNER_SHA256[^\n]*\$[123@*]/);
  });

  test("feeds only redirected verifier reports to the parser before release mutation", () => {
    const parserCall = workflow.indexOf("node scripts/check-android-release-signatures.js verify");
    const bundleValidation = workflow.indexOf(
      'java -jar "$BUNDLETOOL_JAR" validate --bundle="$PRODUCTION_FILE"',
    );
    const jarVerification = workflow.indexOf("if ! jarsigner");
    const releaseMutation = workflow.indexOf('ARGS=(release create "$TAG"');

    expect(workflow).toContain('> "$RUNNER_TEMP/apk-signature.txt" 2>&1');
    expect(workflow).toContain('> "$RUNNER_TEMP/aab-signature.txt" 2>&1');
    expect(workflow).toContain('> "$RUNNER_TEMP/aab-certificate.txt" 2>&1');
    expect(bundleValidation).toBeGreaterThan(-1);
    expect(jarVerification).toBeGreaterThan(bundleValidation);
    expect(parserCall).toBeGreaterThan(-1);
    const parserWiring =
      /check-android-release-signatures\.js verify[\s\S]*?aab-certificate\.txt" \\\r?\n\s+"\$\{\{ steps\.artifacts\.outputs\.production_file \}\}"/;
    expect(workflow).toMatch(parserWiring);
    expect(workflow.replace(/\r?\n/g, "\r\n")).toMatch(parserWiring);
    expect(releaseMutation).toBeGreaterThan(parserCall);
    expect(workflow).not.toContain("const normalize = (value)");
    expect(workflow).not.toContain("set -x");
  });

  test("passes the AAB itself to the CLI without disclosing protected digests", () => {
    const checker = path.join(root, "scripts/check-android-release-signatures.js");
    const aabFile = writeAab(signedAabFiles());
    const reports = [
      ["apk.txt", apkSigner("Signer #1")],
      ["jar.txt", manifestLastReport()],
      ["certificate.txt", aabSigner(1)],
    ].map(([name, contents]) => {
      const file = path.join(fixtureRoot, name);
      fs.writeFileSync(file, contents);
      return file;
    });
    const run = (aabExpected: string) =>
      spawnSync(process.execPath, [checker, "verify", ...reports, aabFile], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          ANDROID_APK_SIGNER_SHA256: APK_DIGEST,
          ANDROID_AAB_SIGNER_SHA256: aabExpected,
        },
      });

    const accepted = run(AAB_DIGEST);
    expect(accepted.status).toBe(0);
    expect(accepted.stdout).toBe("[android-release-signatures] PASS apk-signers=1 aab-signers=1\n");
    expect(`${accepted.stdout}${accepted.stderr}`).not.toContain(APK_DIGEST);
    expect(`${accepted.stdout}${accepted.stderr}`).not.toContain(AAB_DIGEST);

    const rejected = run(OTHER_DIGEST);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain("aab-signer-mismatch");
    expect(rejected.stderr).not.toContain(OTHER_DIGEST);
  });
});
