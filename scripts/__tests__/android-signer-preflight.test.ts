// The signer preflight exists because the release gate (#1465, hardened #1472)
// has never run and the two secrets it reads have never been compared to
// anything. Two properties make it safe to run on a whim:
//
//   1. it agrees with the gate — same parser, same digest normalisation, same
//      apksigner invocation, so a PASS here means the gate's APK half passes;
//   2. it cannot leak — the secret values never reach the returned object,
//      stdout, stderr, or the step summary, in any status.
//
// The workflow-level pins are ALLOWLISTS where the review found denylists
// were not enough: the trigger set, the permissions set, and WHERE the secrets
// are placed (job-level env would hand them to every step).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(__dirname, "../..");
const workflowPath = path.join(root, ".github/workflows/android-signer-preflight.yml");
const releaseWorkflowPath = path.join(root, ".github/workflows/github-release.yml");
const scriptPath = path.join(root, "scripts/android-signer-preflight.js");
const docPath = path.join(root, "docs/ANDROID-BUILD.md");

// git may check these out with CRLF on Windows; every regex below wants "\n".
const readLf = (p: string) => fs.readFileSync(p, "utf8").replace(/\r\n?/g, "\n");

type PreflightResult = {
  ok: boolean;
  code?: string;
  actual?: string;
  signerCount?: number;
  rows: Array<{ name: string; status: string }>;
};

type PreflightModule = {
  preflight: (input: { report: string; apkExpected?: string; aabExpected?: string }) => PreflightResult;
  render: (result: PreflightResult) => string;
  SECRET_NAMES: string[];
};

const loadPreflight = (): PreflightModule => require("../android-signer-preflight") as PreflightModule;

const EAS = "0fb37bc076c46bc45a637c04bacfce7613bb0db91eda21b74bce595ad00ce570";
const DIAG = "03bcf8faa96a1c1e47188fb032716a7939d4f27042b30f1433eb74b2826fe89a";
const colon = (hex: string) => hex.match(/../g)!.join(":").toUpperCase();

// The complete `apksigner verify --verbose --print-certs` output for the
// v0.6.0 release APK (build-tools 37.0.0, 2026-08-29), certificate digest
// parameterised. The "public key SHA-256 digest" line is the one a loosened
// parser would confuse with the certificate line — keep it.
const verboseReport = (digest: string) =>
  [
    "Verifies",
    "Verified using v1 scheme (JAR signing): false",
    "Verified using v2 scheme (APK Signature Scheme v2): true",
    "Verified using v3 scheme (APK Signature Scheme v3): false",
    "Verified using v3.1 scheme (APK Signature Scheme v3.1): false",
    "Verified using v3.2 scheme (APK Signature Scheme v3.2): false",
    "Verified using v4 scheme (APK Signature Scheme v4): false",
    "Verified for SourceStamp: false",
    "Number of signers: 1",
    "V2 Signer: certificate DN: CN=, OU=, O=, L=, ST=, C=US",
    `V2 Signer: certificate SHA-256 digest: ${digest}`,
    "V2 Signer: certificate SHA-1 digest: b8d84430c8aed2f13b3745648d3c5b440340133f",
    "V2 Signer: certificate MD5 digest: 9d61d7baefc681f18631a715da05323c",
    "V2 Signer: key algorithm: RSA",
    "V2 Signer: key size (bits): 2048",
    "V2 Signer: public key SHA-256 digest: ad8ae7eb30681de79542f3092f88c1606d33a6eaa92657a7677e94a7842d314b",
    "V2 Signer: public key SHA-1 digest: 96faaf60da0ab52330158568425b6329ad0f415c",
    "V2 Signer: public key MD5 digest: 373f236c14babf4b52df7b4c7efda635",
    "",
  ].join("\n");

// Legacy numbered style, two signers — the shape parseApkSignerDigests ACCEPTS
// with two digests, so the preflight's own count check is what must reject it.
const twoSignerReport = () =>
  [
    "Number of signers: 2",
    `Signer #1 certificate SHA-256 digest: ${EAS}`,
    `Signer #2 certificate SHA-256 digest: ${DIAG}`,
    "",
  ].join("\n");

describe("preflight agrees with the release gate", () => {
  test("both secrets equal to the release signer → PASS", () => {
    const { preflight } = loadPreflight();
    const r = preflight({ report: verboseReport(EAS), apkExpected: EAS, aabExpected: EAS });
    expect(r.ok).toBe(true);
    expect(r.actual).toBe(EAS);
    expect(r.rows.map((x) => x.status)).toEqual(["match", "match"]);
  });

  test("accepts the byte-colon form the gate accepts", () => {
    const { preflight } = loadPreflight();
    const r = preflight({ report: verboseReport(EAS), apkExpected: colon(EAS), aabExpected: EAS });
    expect(r.rows[0].status).toBe("match");
  });

  test("a secret holding the DIAGNOSTIC key is a mismatch — the exact 9/1 failure this prevents", () => {
    const { preflight } = loadPreflight();
    const r = preflight({ report: verboseReport(EAS), apkExpected: DIAG, aabExpected: EAS });
    expect(r.ok).toBe(false);
    expect(r.rows.map((x) => x.status)).toEqual(["mismatch", "match"]);
  });

  test("unset and malformed secrets are named, not conflated with mismatch", () => {
    const { preflight } = loadPreflight();
    const r = preflight({ report: verboseReport(EAS), apkExpected: "", aabExpected: "not-a-digest" });
    expect(r.ok).toBe(false);
    expect(r.rows.map((x) => x.status)).toEqual(["unset", "invalid"]);
  });

  test("two accepted signers is a count failure, not a pick", () => {
    const { preflight, render } = loadPreflight();
    const r = preflight({ report: twoSignerReport(), apkExpected: EAS, aabExpected: EAS });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("apk-signer-count");
    expect(r.signerCount).toBe(2);
    expect(r.rows).toEqual([]);
    expect(render(r)).toMatch(/FAIL apk-signer-count \(signers=2\)/);
  });

  test("the public-key digest line does not stand in for the certificate line", () => {
    // Remove the certificate line: the parser must report a missing signer,
    // not fall back to "public key SHA-256 digest".
    const { preflight } = loadPreflight();
    const noCert = verboseReport(EAS)
      .split("\n")
      .filter((l) => !l.includes("certificate SHA-256 digest"))
      .join("\n");
    let code = "";
    try {
      preflight({ report: noCert, apkExpected: EAS, aabExpected: EAS });
    } catch (error) {
      code = (error as { code?: string }).code ?? "";
    }
    expect(code).toBe("apk-signer-missing");
  });
});

describe("the preflight cannot leak a secret", () => {
  test("the result and its rendering carry status words, never the expected value", () => {
    // A secret that MATCHES is, by definition, the public digest — so the
    // leak property is about every secret that does NOT match: wrong key,
    // garbage, colon form. None of those may appear in the output.
    const { preflight, render } = loadPreflight();
    for (const [apk, aab] of [
      [DIAG, DIAG],
      ["deadbeef", DIAG],
      [colon(DIAG), ""],
    ] as const) {
      const r = preflight({ report: verboseReport(EAS), apkExpected: apk, aabExpected: aab });
      expect(r.ok).toBe(false);
      const blob = JSON.stringify(r) + "\n" + render(r);
      for (const v of [apk, aab]) {
        if (!v) continue;
        expect(blob).not.toContain(v);
        expect(blob.toLowerCase()).not.toContain(v.replaceAll(":", "").toLowerCase());
      }
    }
  });

  test("the CLI entry point: exit code, stdout, step summary, and no secret on any stream", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "signer-preflight-"));
    const report = path.join(dir, "apk-signature.txt");
    const summary = path.join(dir, "summary.md");
    fs.writeFileSync(report, verboseReport(EAS));

    const run = (apk: string, aab: string) =>
      spawnSync(process.execPath, [scriptPath], {
        encoding: "utf8",
        env: {
          ...process.env,
          REPORT: report,
          GITHUB_STEP_SUMMARY: summary,
          ANDROID_APK_SIGNER_SHA256: apk,
          ANDROID_AAB_SIGNER_SHA256: aab,
        },
      });

    const pass = run(EAS, EAS);
    expect(pass.status).toBe(0);
    expect(pass.stdout).toMatch(/\] PASS\s*$/);
    expect(pass.stdout).toContain(`release APK signer SHA-256: ${EAS}`);

    const fail = run(DIAG, colon(DIAG));
    expect(fail.status).toBe(1);
    expect(fail.stdout).toMatch(/ANDROID_APK_SIGNER_SHA256: mismatch/);
    expect(fail.stdout).toMatch(/ANDROID_AAB_SIGNER_SHA256: mismatch/);
    expect(fail.stdout).toMatch(/\] FAIL\s*$/);
    const everything = fail.stdout + fail.stderr + fs.readFileSync(summary, "utf8");
    expect(everything).not.toContain(DIAG);
    expect(everything.toLowerCase()).not.toContain(colon(DIAG).replaceAll(":", "").toLowerCase());

    // The step summary got one fenced block per run.
    expect(fs.readFileSync(summary, "utf8").match(/```/g)).toHaveLength(4);

    const missing = spawnSync(process.execPath, [scriptPath], {
      encoding: "utf8",
      env: { ...process.env, REPORT: "", GITHUB_STEP_SUMMARY: "" },
    });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toMatch(/::error title=Android signer preflight::/);
  });

  test("the script source never logs the expected values", () => {
    const src = readLf(scriptPath);
    expect(src).not.toMatch(/console\.log\(/);
    expect(src).not.toMatch(/write\([^)]*(apkExpected|aabExpected|rawExpected|expected\b)/);
    expect(src).not.toMatch(/\$\{(apkExpected|aabExpected|rawExpected|expected)\}/);
    expect(src).toMatch(/status:\s*statusFor\(/);
  });
});

describe("the workflow stays a read-only, dispatch-only probe", () => {
  const wf = () => readLf(workflowPath);

  // Top-level keys of a YAML mapping block: lines indented exactly `indent`
  // spaces that look like `key:`.
  const keysUnder = (text: string, block: string, indent: number) => {
    const m = text.match(new RegExp(`^${block}:\\n((?:(?:[ \\t]+.*)?\\n)*?)(?=^\\S|\\Z)`, "m"));
    if (!m) return null;
    const pad = " ".repeat(indent);
    return m[1]
      .split("\n")
      .filter((l) => l.startsWith(pad) && !l.startsWith(pad + " ") && /^\s*[A-Za-z_-]+:/.test(l))
      .map((l) => l.trim().replace(/:.*$/, ""));
  };

  test("workflow_dispatch is the ONLY trigger (allowlist, not denylist)", () => {
    expect(keysUnder(wf(), "on", 2)).toEqual(["workflow_dispatch"]);
  });

  test("exactly one permissions block, top-level, contents: read and nothing else", () => {
    const text = wf();
    expect(text.match(/^\s*permissions:/gm)).toHaveLength(1);
    expect(keysUnder(text, "permissions", 2)).toEqual(["contents"]);
    expect(text).toMatch(/^permissions:\n  contents: read\n/m);
  });

  test("the secrets are env of the compare step only — not job-level, not any other step", () => {
    const text = wf();
    const { SECRET_NAMES } = loadPreflight();
    // Slice the compare step: from its name line to the next step or EOF.
    const start = text.indexOf("- name: Compare the registered secrets");
    expect(start).toBeGreaterThan(0);
    const rest = text.slice(start + 1);
    const nextStep = rest.search(/\n\s*- (name|uses):/);
    const step = text.slice(start, nextStep === -1 ? undefined : start + 1 + nextStep);
    for (const name of SECRET_NAMES) {
      const total = (text.match(new RegExp(`secrets\\.${name}`, "g")) ?? []).length;
      const inStep = (step.match(new RegExp(`secrets\\.${name}`, "g")) ?? []).length;
      expect(`${name}: total=${total} inStep=${inStep}`).toBe(`${name}: total=1 inStep=1`);
      // and it is an env: entry inside the step, not interpolated into run:
      expect(step).toMatch(new RegExp(`^\\s+${name}: \\$\\{\\{ secrets\\.${name} \\}\\}$`, "m"));
      expect(text).not.toMatch(new RegExp(`(echo|printf|run:)[^\\n]*${name}`));
    }
    // No job-level env at all, so nothing above step scope can carry a secret.
    expect(text).not.toMatch(/^    env:/m);
    expect(step).toMatch(/run: node scripts\/android-signer-preflight\.js\s*$/m);
    expect(step).toMatch(/REPORT: \$\{\{ runner\.temp \}\}\/apk-signature\.txt/);
  });

  test("uses the release gate's exact apksigner resolution and invocation, into the file the script reads", () => {
    const text = wf();
    const release = readLf(releaseWorkflowPath);
    const find = /APKSIGNER="\$\(find "\$ANDROID_HOME\/build-tools" -maxdepth 2 -type f -name apksigner \| sort -V \| tail -1\)"/;
    expect(text).toMatch(find);
    expect(release).toMatch(find);
    expect(text).toMatch(/"\$APKSIGNER" verify --verbose --print-certs "\$APK" > "\$RUNNER_TEMP\/apk-signature\.txt" 2>&1/);
    expect(release).toMatch(/"\$APKSIGNER" verify --verbose --print-certs "\$PREVIEW_FILE"/);
  });

  test("the secret-bearing job checks out by SHA, the same pin the release gate uses", () => {
    const text = wf();
    const release = readLf(releaseWorkflowPath);
    const pin = release.match(/actions\/checkout@([0-9a-f]{40})/)?.[1];
    expect(pin).toBeTruthy();
    expect(text).toContain(`actions/checkout@${pin}`);
    expect(text).not.toMatch(/actions\/checkout@v\d/);
  });

  test("docs record the measured identities in the right rows and name this preflight", () => {
    const doc = readLf(docPath);
    const row = (label: RegExp) => doc.split("\n").find((l) => l.startsWith("|") && label.test(l)) ?? "";
    expect(row(/EAS release/)).toContain(EAS);
    expect(row(/EAS release/)).not.toContain(DIAG);
    expect(row(/Diagnostic Gradle/)).toContain(DIAG);
    expect(row(/Diagnostic Gradle/)).not.toContain(EAS);
    expect(doc).toMatch(/must hold the \*\*EAS\*\*\s*digest,\s*`0fb37bc0…ce570`/);
    expect(doc).toContain("android-signer-preflight.yml");
  });
});
