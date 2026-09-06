import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} is invalid`);
}

function requirePositiveIntegerString(value, label) {
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error(`${label} is invalid`);
}

export function verifyArtifactIdentity({ artifact, list, expected, current, requireAttestedOutputs }) {
  requirePositiveIntegerString(expected.id, "expected artifact id");
  requirePositiveIntegerString(expected.runId, "expected run id");
  requirePositiveIntegerString(expected.runAttempt, "expected run attempt");
  requirePositiveIntegerString(current.runId, "current run id");
  requirePositiveIntegerString(current.runAttempt, "current run attempt");
  if (!/^[0-9a-f]{40}$/.test(expected.headSha)) throw new Error("expected head SHA is invalid");
  if (!/^[0-9a-f]{40}$/.test(current.headSha)) throw new Error("current head SHA is invalid");
  const boundName = `github-pages-${expected.runId}-${expected.runAttempt}`;
  if (expected.name !== boundName) throw new Error("expected artifact name is not run/attempt bound");
  if (expected.runId !== current.runId) throw new Error("artifact run is not this workflow run");
  if (expected.runAttempt !== current.runAttempt) {
    throw new Error("artifact attempt is not this workflow attempt; deploy-only reruns are forbidden");
  }
  if (expected.headSha !== current.headSha) throw new Error("artifact head is not this workflow SHA");
  if (requireAttestedOutputs && !/^sha256:[0-9a-f]{64}$/.test(expected.digest)) {
    throw new Error("attested server artifact digest is missing or malformed");
  }
  if (expected.digest && !/^sha256:[0-9a-f]{64}$/.test(expected.digest)) {
    throw new Error("expected server artifact digest is invalid");
  }
  if (requireAttestedOutputs && !/^[1-9][0-9]*$/.test(expected.size)) {
    throw new Error("attested artifact size is missing or malformed");
  }
  if (expected.size && !/^[1-9][0-9]*$/.test(expected.size)) {
    throw new Error("expected artifact size is invalid");
  }

  if (!isRecord(artifact)) throw new Error("artifact API response is malformed");
  if (!isRecord(artifact.workflow_run)) throw new Error("artifact workflow identity is missing");
  requirePositiveInteger(artifact.id, "artifact id");
  requirePositiveInteger(artifact.size_in_bytes, "artifact size");
  requirePositiveInteger(artifact.workflow_run.id, "artifact run id");
  if (String(artifact.id) !== expected.id) throw new Error("artifact id does not match upload output");
  if (artifact.name !== expected.name) throw new Error("artifact name mismatch");
  if (typeof artifact.digest !== "string" || !/^sha256:[0-9a-f]{64}$/.test(artifact.digest)) {
    throw new Error("server artifact digest is missing or malformed");
  }
  if (expected.digest && artifact.digest !== expected.digest) {
    throw new Error("server artifact digest changed");
  }
  if (expected.size && String(artifact.size_in_bytes) !== expected.size) {
    throw new Error("artifact size changed");
  }
  if (String(artifact.workflow_run.id) !== expected.runId) {
    throw new Error("artifact workflow run mismatch");
  }
  if (artifact.workflow_run.head_sha !== expected.headSha) {
    throw new Error("artifact workflow head mismatch");
  }
  if (artifact.expired !== false) throw new Error("artifact is expired or expiry is unknown");

  if (!isRecord(list) || !Array.isArray(list.artifacts)) {
    throw new Error("artifact list API response is malformed");
  }
  if (list.total_count !== 1 || list.artifacts.length !== 1) {
    throw new Error("exact artifact name does not resolve to one current-run artifact");
  }
  const listed = list.artifacts[0];
  if (!isRecord(listed)) throw new Error("listed artifact record is malformed");
  if (String(listed.id) !== expected.id || listed.name !== expected.name) {
    throw new Error("listed artifact identity mismatch");
  }

  return {
    id: String(artifact.id),
    name: artifact.name,
    digest: artifact.digest,
    size: String(artifact.size_in_bytes),
    runId: String(artifact.workflow_run.id),
    runAttempt: expected.runAttempt,
    headSha: artifact.workflow_run.head_sha,
  };
}

function fetchGitHubJson(endpoint, label) {
  let raw;
  try {
    raw = execFileSync(
      "gh",
      [
        "api",
        "--method",
        "GET",
        "-H",
        "Accept: application/vnd.github+json",
        "-H",
        "Cache-Control: no-cache",
        endpoint,
      ],
      {
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
  } catch {
    throw new Error(`could not read ${label}`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label} returned malformed JSON`);
  }
}

function expectedFromEnvironment() {
  return {
    id: process.env.EXPECTED_ARTIFACT_ID ?? "",
    name: process.env.EXPECTED_ARTIFACT_NAME ?? "",
    digest: process.env.EXPECTED_ARTIFACT_DIGEST ?? "",
    size: process.env.EXPECTED_ARTIFACT_SIZE ?? "",
    runId: process.env.EXPECTED_ARTIFACT_RUN_ID ?? "",
    runAttempt: process.env.EXPECTED_ARTIFACT_RUN_ATTEMPT ?? "",
    headSha: process.env.EXPECTED_ARTIFACT_HEAD_SHA ?? "",
  };
}

function writeSafeAttestation(verified) {
  if (!process.env.GITHUB_OUTPUT || !process.env.GITHUB_STEP_SUMMARY) {
    throw new Error("artifact attestation output paths are missing");
  }
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    [
      `artifact_id=${verified.id}`,
      `artifact_digest=${verified.digest}`,
      `artifact_name=${verified.name}`,
      `artifact_size_in_bytes=${verified.size}`,
      `artifact_head_sha=${verified.headSha}`,
      `artifact_run_id=${verified.runId}`,
      `artifact_run_attempt=${verified.runAttempt}`,
      "",
    ].join("\n"),
  );
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    [
      "### Uploaded Pages artifact attestation",
      `- artifact: \`${verified.name}\` (ID \`${verified.id}\`, ${verified.size} bytes)`,
      `- server digest: \`${verified.digest}\``,
      `- workflow run/attempt/head: \`${verified.runId}/${verified.runAttempt}\` / \`${verified.headSha}\``,
      "",
    ].join("\n"),
  );
}

function main() {
  const expected = expectedFromEnvironment();
  requirePositiveIntegerString(expected.id, "expected artifact id");
  requirePositiveIntegerString(expected.runId, "expected run id");
  const artifact = fetchGitHubJson(
    `repos/Simon-YHKim/2nd-B/actions/artifacts/${expected.id}`,
    "artifact-by-id response",
  );
  const list = fetchGitHubJson(
    `repos/Simon-YHKim/2nd-B/actions/runs/${expected.runId}/artifacts?name=${encodeURIComponent(expected.name)}&per_page=100`,
    "current-run exact-name artifact list",
  );
  const verified = verifyArtifactIdentity({
    artifact,
    list,
    expected,
    current: {
      runId: process.env.CURRENT_RUN_ID ?? "",
      runAttempt: process.env.CURRENT_RUN_ATTEMPT ?? "",
      headSha: process.env.CURRENT_WORKFLOW_SHA ?? "",
    },
    requireAttestedOutputs: process.env.REQUIRE_ATTESTED_OUTPUTS === "true",
  });
  if (process.env.WRITE_ARTIFACT_OUTPUTS === "true") writeSafeAttestation(verified);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown artifact attestation failure";
    process.stderr.write(`::error::${message}\n`);
    process.exitCode = 1;
  }
}
