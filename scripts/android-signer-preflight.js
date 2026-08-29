// Android signer preflight — is the registered release-signer secret the key
// that actually signs the public release APK?
//
// github-release.yml gained a fail-closed signer gate in #1465 (hardened in
// #1472, 2026-08-28) and has not run since; the two secrets it reads were
// registered on 2026-08-29 and have never been compared to anything. If either
// is wrong, the first release after the EAS quota returns stops at
// `apk-signer-mismatch` — after a full EAS build has already been spent. This
// answers the question in under a minute from the latest GitHub Release APK,
// using the SAME parser the gate uses, so a PASS here is a PASS there for the
// APK half.
//
// AAB: only the APK is on the GitHub Release, so the AAB is not measured here.
// The release contract signs APK and AAB with the one EAS-managed keystore, so
// the AAB secret is compared to the APK digest as an ASSERTION of that
// contract — which is STRICTER than the gate, which measures the AAB itself.
// If the production profile is ever given its own EAS credentials and the
// AAB secret is updated to that key, this preflight says `mismatch` while the
// gate would pass; read that as "the one-keystore contract changed, update
// this comparison", not as a broken gate.
//
// What is printed: the APK certificate digest (public — anyone with the APK
// can compute it) and one status WORD per secret. The secret values are never
// written to stdout, the step summary, or the returned object. One wrinkle:
// on a PASS the public digest is byte-identical to the secret, so GitHub's
// log masking prints it as `***`. That is harmless (the status word carries
// the answer) — the abbreviated form beside it stays readable either way.

const fs = require("node:fs");
const { parseApkSignerDigests, normalizeDigest } = require("./check-android-release-signatures.js");

const SECRET_NAMES = ["ANDROID_APK_SIGNER_SHA256", "ANDROID_AAB_SIGNER_SHA256"];

function statusFor(rawExpected, actual) {
  const raw = typeof rawExpected === "string" ? rawExpected.trim() : "";
  if (!raw) return "unset";
  let expected;
  try {
    expected = normalizeDigest(raw);
  } catch {
    return "invalid";
  }
  return expected === actual ? "match" : "mismatch";
}

// Pure: takes the apksigner report text and the two secret values, returns a
// result that carries the public digest and status words only.
function preflight({ report, apkExpected, aabExpected }) {
  const digests = parseApkSignerDigests(report);
  if (digests.length !== 1) {
    return { ok: false, code: "apk-signer-count", signerCount: digests.length, rows: [] };
  }
  const actual = digests[0];
  const rows = [
    { name: SECRET_NAMES[0], status: statusFor(apkExpected, actual) },
    { name: SECRET_NAMES[1], status: statusFor(aabExpected, actual) },
  ];
  return { ok: rows.every((r) => r.status === "match"), actual, rows };
}

function render(result) {
  const lines = [];
  if (result.code) {
    lines.push(`[android-signer-preflight] FAIL ${result.code} (signers=${result.signerCount})`);
    return lines.join("\n");
  }
  const short = `${result.actual.slice(0, 8)}…${result.actual.slice(-5)}`;
  lines.push(`[android-signer-preflight] release APK signer SHA-256: ${result.actual} (${short})`);
  for (const r of result.rows) lines.push(`[android-signer-preflight] ${r.name}: ${r.status}`);
  lines.push(`[android-signer-preflight] ${result.ok ? "PASS" : "FAIL"}`);
  return lines.join("\n");
}

function main() {
  const reportPath = process.env.REPORT;
  if (!reportPath) throw new Error("REPORT (path to apksigner output) is required");
  const result = preflight({
    report: fs.readFileSync(reportPath, "utf8"),
    apkExpected: process.env.ANDROID_APK_SIGNER_SHA256,
    aabExpected: process.env.ANDROID_AAB_SIGNER_SHA256,
  });
  const text = render(result);
  process.stdout.write(text + "\n");
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, "```\n" + text + "\n```\n");
  }
  if (!result.ok) process.exitCode = 1;
}

module.exports = { preflight, render, statusFor, SECRET_NAMES };

if (require.main === module) {
  try {
    main();
  } catch (error) {
    const code = error && error.code ? error.code : "unexpected";
    process.stderr.write(`::error title=Android signer preflight::${code}\n`);
    process.exitCode = 1;
  }
}
