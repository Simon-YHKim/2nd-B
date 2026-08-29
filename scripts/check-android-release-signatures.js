const crypto = require("node:crypto");
const fs = require("node:fs");

const COMPACT_DIGEST_RE = /^[0-9a-f]{64}$/i;
const COLON_DIGEST_RE = /^(?:[0-9a-f]{2}:){31}[0-9a-f]{2}$/i;
const NUMBERED_APK_SIGNER_RE = /^Signer #([1-9][0-9]*)$/;
const SDK_RANGE_APK_SIGNER_RE =
  /^Signer \(minSdkVersion=([0-9]+)(?: \(dev release=true\))?, maxSdkVersion=([0-9]+)\)$/;
const SCHEME_SINGLE_APK_SIGNER_RE = /^(V1|V2|V3\.0) Signer:$/;
const SCHEME_NUMBERED_APK_SIGNER_RE = /^(V1|V2|V3\.0) Signer #([1-9][0-9]*):$/;
const SCHEME_SDK_RANGE_APK_SIGNER_RE =
  /^V3\.[01] Signer: \(minSdkVersion=([0-9]+)(?: \(dev release=true\))?, maxSdkVersion=([0-9]+)\)$/;
const SOURCE_STAMP_APK_SIGNER_RE = /^Source Stamp Signer:?$/;

class SignatureGateError extends Error {
  constructor(code) {
    super(code);
    this.name = "SignatureGateError";
    this.code = code;
  }
}

function reject(code) {
  throw new SignatureGateError(code);
}

function normalizeDigest(value, code = "digest-invalid") {
  const raw = typeof value === "string" ? value.trim() : "";
  if (COMPACT_DIGEST_RE.test(raw)) return raw.toLowerCase();
  if (COLON_DIGEST_RE.test(raw)) return raw.replaceAll(":", "").toLowerCase();
  reject(code);
}

function parseApkSignerDigests(output) {
  const records = [];
  const seenLabels = new Set();
  let style = null;

  for (const line of String(output ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")) {
    if (!line.includes("certificate SHA-256 digest")) continue;

    const match = line.match(/^(.+?) certificate SHA-256 digest:\s*(\S*)\s*$/);
    if (!match) reject("apk-signer-digest-invalid");
    const [, label, rawDigest] = match;
    if (SOURCE_STAMP_APK_SIGNER_RE.test(label)) continue;

    const numbered = label.match(NUMBERED_APK_SIGNER_RE);
    const legacySdkRange = label.match(SDK_RANGE_APK_SIGNER_RE);
    const schemeSingle = label.match(SCHEME_SINGLE_APK_SIGNER_RE);
    const schemeNumbered = label.match(SCHEME_NUMBERED_APK_SIGNER_RE);
    const schemeSdkRange = label.match(SCHEME_SDK_RANGE_APK_SIGNER_RE);
    if (!numbered && !legacySdkRange && !schemeSingle && !schemeNumbered && !schemeSdkRange) {
      reject("apk-signer-label-invalid");
    }

    const nextStyle = numbered
      ? "legacy-numbered"
      : legacySdkRange
        ? "legacy-sdk-range"
        : schemeSingle
          ? "scheme-single"
          : schemeNumbered
            ? `scheme-numbered-${schemeNumbered[1]}`
            : "scheme-sdk-range";
    if (style && style !== nextStyle) reject("apk-signer-style-mixed");
    style = nextStyle;
    if (seenLabels.has(label)) reject("apk-signer-duplicate");
    seenLabels.add(label);

    const sdkRange = legacySdkRange ?? schemeSdkRange;
    if (sdkRange && Number(sdkRange[1]) > Number(sdkRange[2])) {
      reject("apk-signer-sdk-range-invalid");
    }
    records.push({
      digest: normalizeDigest(rawDigest, "apk-signer-digest-invalid"),
      number: numbered ? Number(numbered[1]) : schemeNumbered ? Number(schemeNumbered[2]) : null,
    });
  }

  if (records.length === 0) reject("apk-signer-missing");
  if (style === "scheme-single" && records.length !== 1) reject("apk-signer-count-invalid");
  if (style === "legacy-numbered" || style?.startsWith("scheme-numbered-")) {
    records.forEach((record, index) => {
      if (record.number !== index + 1) reject("apk-signer-sequence-invalid");
    });
  }
  return records.map((record) => record.digest);
}

function parseAabSignerDigests(output) {
  const lines = String(output ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const signerHeaders = [];

  lines.forEach((line, index) => {
    const header = line.match(/^Signer #([1-9][0-9]*):\s*$/);
    if (header) {
      signerHeaders.push({ index, number: Number(header[1]) });
      return;
    }
    if (/^Signer #/.test(line)) reject("aab-signer-header-invalid");
    if (signerHeaders.length === 0 && /^\s*SHA256\s*:/i.test(line)) {
      reject("aab-digest-outside-signer");
    }
  });

  if (signerHeaders.length === 0) reject("aab-signer-missing");
  signerHeaders.forEach((header, index) => {
    if (header.number !== index + 1) reject("aab-signer-sequence-invalid");
  });

  return signerHeaders.map((header, signerIndex) => {
    const end = signerHeaders[signerIndex + 1]?.index ?? lines.length;
    const block = lines.slice(header.index + 1, end);
    const certificates = [];

    block.forEach((line, index) => {
      const certificate = line.match(/^\s*Certificate #([1-9][0-9]*):\s*$/);
      if (certificate) {
        certificates.push({ index, number: Number(certificate[1]) });
      } else if (/^\s*Certificate #/.test(line)) {
        reject("aab-certificate-header-invalid");
      }
    });

    const leaves = certificates.filter((certificate) => certificate.number === 1);
    if (leaves.length !== 1) reject("aab-leaf-certificate-count");
    certificates.forEach((certificate, index) => {
      if (certificate.number !== index + 1) reject("aab-certificate-sequence-invalid");
    });

    const firstCertificate = certificates[0].index;
    if (block.slice(0, firstCertificate).some((line) => /^\s*SHA256\s*:/i.test(line))) {
      reject("aab-digest-outside-certificate");
    }

    const leaf = leaves[0];
    const nextCertificate = certificates.find((certificate) => certificate.index > leaf.index);
    const leafBlock = block.slice(leaf.index + 1, nextCertificate?.index ?? block.length);
    const digestLines = leafBlock.filter((line) => /^\s*SHA256\s*:/i.test(line));
    if (digestLines.length !== 1) reject("aab-leaf-digest-count");

    const digest = digestLines[0].match(/^\s*SHA256:\s*(\S+)\s*$/i);
    if (!digest) reject("aab-leaf-digest-invalid");
    return normalizeDigest(digest[1], "aab-leaf-digest-invalid");
  });
}

function assertAabJarVerified(output) {
  const text = String(output ?? "");
  if (/unsigned entries/i.test(text)) reject("aab-jar-unsigned");
  const verifiedLines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => /^\s*jar verified\.\s*$/i.test(line));
  if (verifiedLines.length !== 1 || /not signed/i.test(text)) reject("aab-jar-unverified");
}

function digestMatches(actual, expected) {
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function verifyReleaseSigners({
  apkOutput,
  aabVerificationOutput,
  aabCertificateOutput,
  apkExpected,
  aabExpected,
}) {
  const expectedApk = normalizeDigest(apkExpected, "apk-expected-digest-invalid");
  const expectedAab = normalizeDigest(aabExpected, "aab-expected-digest-invalid");
  const apkDigests = parseApkSignerDigests(apkOutput);
  assertAabJarVerified(aabVerificationOutput);
  const aabDigests = parseAabSignerDigests(aabCertificateOutput);

  if (!apkDigests.every((digest) => digestMatches(digest, expectedApk))) {
    reject("apk-signer-mismatch");
  }
  if (!aabDigests.every((digest) => digestMatches(digest, expectedAab))) {
    reject("aab-signer-mismatch");
  }
  return { apkSignerCount: apkDigests.length, aabSignerCount: aabDigests.length };
}

function readReport(file, code) {
  if (typeof file !== "string" || file.length === 0) reject(code);
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    reject(code);
  }
}

function main(argv = process.argv.slice(2)) {
  const [command, apkFile, aabVerificationFile, aabCertificateFile, ...extra] = argv;
  if (command !== "verify" || extra.length > 0) reject("command-invalid");
  const result = verifyReleaseSigners({
    apkOutput: readReport(apkFile, "apk-report-unreadable"),
    aabVerificationOutput: readReport(aabVerificationFile, "aab-verification-report-unreadable"),
    aabCertificateOutput: readReport(aabCertificateFile, "aab-certificate-report-unreadable"),
    apkExpected: process.env.ANDROID_APK_SIGNER_SHA256,
    aabExpected: process.env.ANDROID_AAB_SIGNER_SHA256,
  });
  process.stdout.write(
    `[android-release-signatures] PASS apk-signers=${result.apkSignerCount} aab-signers=${result.aabSignerCount}\n`,
  );
}

function reportFailure(error) {
  const code = error instanceof SignatureGateError ? error.code : "unexpected";
  process.stderr.write(`::error title=Android release signer gate::${code}\n`);
  process.exitCode = 1;
}

module.exports = {
  SignatureGateError,
  assertAabJarVerified,
  normalizeDigest,
  parseAabSignerDigests,
  parseApkSignerDigests,
  verifyReleaseSigners,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    reportFailure(error);
  }
}
