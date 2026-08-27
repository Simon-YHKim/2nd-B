import fs from "node:fs";
import path from "node:path";

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
  const validArgs = () => ({
    apkOutput: apkSigner("Signer #1"),
    aabVerificationOutput: "jar verified.\n",
    aabCertificateOutput: aabSigner(1),
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
        ...validArgs(),
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
    const releaseMutation = workflow.indexOf('ARGS=(release create "$TAG"');

    expect(workflow).toContain('> "$RUNNER_TEMP/apk-signature.txt" 2>&1');
    expect(workflow).toContain('> "$RUNNER_TEMP/aab-signature.txt" 2>&1');
    expect(workflow).toContain('> "$RUNNER_TEMP/aab-certificate.txt" 2>&1');
    expect(parserCall).toBeGreaterThan(-1);
    expect(releaseMutation).toBeGreaterThan(parserCall);
    expect(workflow).not.toContain("const normalize = (value)");
    expect(workflow).not.toContain("set -x");
  });
});
