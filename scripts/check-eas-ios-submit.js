const fs = require("node:fs");
const path = require("node:path");

const EAS_CLI_VERSION = "22.6.0";
const APPLE_TEAM_ID = "7CP84WS5C6";
const EXPO_GRAPHQL_URL = "https://api.expo.dev/graphql";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA_RE = /^[0-9a-f]{40}$/i;
const ACTIVE_SUBMISSION_STATUSES = new Set(["AWAITING_BUILD", "IN_QUEUE", "IN_PROGRESS"]);
const TERMINAL_SUBMISSION_STATUSES = new Set(["FINISHED", "ERRORED", "CANCELED"]);
const KNOWN_SUBMISSION_STATUSES = new Set([
  ...ACTIVE_SUBMISSION_STATUSES,
  ...TERMINAL_SUBMISSION_STATUSES,
]);

// eas-cli 22.6.0's build:view fragment does not request either
// isGitWorkingTreeDirty or resolvedEnvironment. This authenticated readback
// asks EAS directly and fails closed when either field is absent.
const BUILD_PROVENANCE_QUERY = `
  query EasIosBuildProvenance($buildId: ID!) {
    builds {
      byId(buildId: $buildId) {
        id
        status
        platform
        distribution
        buildProfile
        appIdentifier
        app { id }
        updateChannel { name }
        runtime { version }
        fingerprint { hash }
        resolvedEnvironment
        isForIosSimulator
        isGitWorkingTreeDirty
        gitCommitHash
        submissions {
          id
          status
          platform
          createdAt
          app { id }
          iosConfig { ascAppIdentifier }
          submittedBuild { id }
        }
      }
    }
  }
`;

class GateError extends Error {
  constructor(code) {
    super(code);
    this.name = "GateError";
    this.code = code;
  }
}

function reject(code) {
  throw new GateError(code);
}

function assertUuid(value, label = "value") {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!UUID_RE.test(normalized)) reject(`invalid-${label}-id`);
  return normalized;
}

function assertSha(value, code) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!SHA_RE.test(normalized)) reject(code);
  return normalized;
}

function cliVersionOf(raw) {
  const match = String(raw ?? "").match(/(?:^|\/|\s)(\d+\.\d+\.\d+)(?:\s|$)/);
  return match?.[1] ?? null;
}

function validateRepositoryConfig({ easConfig, appConfig, cliVersion }) {
  if (easConfig?.cli?.version !== EAS_CLI_VERSION) reject("config-cli-version");
  if (cliVersionOf(cliVersion) !== EAS_CLI_VERSION) reject("runtime-cli-version");

  const production = easConfig?.build?.production;
  if (production?.environment !== "production") reject("config-environment");
  if (production?.channel !== "production") reject("config-channel");
  if (production?.distribution !== "store") reject("config-distribution");
  if (production?.ios?.simulator !== false) reject("config-simulator");

  const projectId = assertUuid(appConfig?.expo?.extra?.eas?.projectId, "project");
  const bundleIdentifier = appConfig?.expo?.ios?.bundleIdentifier;
  if (typeof bundleIdentifier !== "string" || bundleIdentifier.length === 0) {
    reject("config-bundle-identifier");
  }
  const submitIos = easConfig?.submit?.production?.ios;
  const ascAppId = submitIos?.ascAppId;
  if (typeof ascAppId !== "string" || !/^\d+$/.test(ascAppId)) reject("config-asc-app-id");
  if (submitIos?.appleTeamId !== APPLE_TEAM_ID) reject("config-apple-team-id");

  return { projectId, bundleIdentifier, ascAppId, appleTeamId: APPLE_TEAM_ID };
}

function validateBuildProvenance(build, expected) {
  const buildId = assertUuid(expected?.buildId, "build");
  const mainSha = assertSha(expected?.mainSha, "expected-main-sha");
  const projectId = assertUuid(expected?.projectId, "project");

  if (assertUuid(build?.id, "build") !== buildId) reject("build-id");
  if (build?.status !== "FINISHED") reject("build-status");
  if (build?.platform !== "IOS") reject("build-platform");
  if (build?.distribution !== "STORE") reject("build-distribution");
  if (build?.buildProfile !== "production") reject("build-profile");
  if (build?.app?.id?.toLowerCase?.() !== projectId) reject("build-project-id");
  if (build?.appIdentifier !== expected?.bundleIdentifier) reject("build-app-identifier");
  if (build?.updateChannel?.name !== "production") reject("build-channel");
  if (build?.resolvedEnvironment !== "PRODUCTION") reject("build-environment");
  if (build?.isForIosSimulator !== false) reject("build-simulator");
  if (build?.isGitWorkingTreeDirty !== false) reject("build-dirty");

  const buildSha = assertSha(build?.gitCommitHash, "build-main-sha");
  if (buildSha !== mainSha) reject("build-main-sha");

  const runtime = assertSha(build?.runtime?.version, "build-runtime");
  const fingerprint = assertSha(build?.fingerprint?.hash, "build-fingerprint");
  if (runtime !== fingerprint) reject("build-runtime-fingerprint");

  return { buildId, mainSha, runtime };
}

function validateMatchingSubmission(submission, expected) {
  const submissionId = assertUuid(submission?.id, "submission");
  const buildId = assertUuid(expected?.buildId, "build");
  const projectId = assertUuid(expected?.projectId, "project");
  if (submission?.platform !== "IOS") reject("submission-platform");
  if (submission?.app?.id?.toLowerCase?.() !== projectId) reject("submission-project-id");
  if (submission?.submittedBuild?.id?.toLowerCase?.() !== buildId) {
    reject("submission-build-id");
  }
  if (submission?.iosConfig?.ascAppIdentifier !== expected?.ascAppId) {
    reject("submission-asc-app-id");
  }
  if (!KNOWN_SUBMISSION_STATUSES.has(submission?.status)) reject("submission-status-unknown");
  return { submissionId, status: submission.status };
}

function newest(submissions) {
  return [...submissions].sort((a, b) => {
    const aTime = Date.parse(a.createdAt ?? "") || 0;
    const bTime = Date.parse(b.createdAt ?? "") || 0;
    return bTime - aTime;
  })[0];
}

function decideSubmission(submissions, expected) {
  if (!Array.isArray(submissions)) reject("submissions-shape");
  const buildId = assertUuid(expected?.buildId, "build");
  const matches = submissions.filter(
    (submission) => submission?.submittedBuild?.id?.toLowerCase?.() === buildId,
  );
  if (matches.length === 0) return { action: "schedule" };

  const validated = matches.map((submission) => ({
    raw: submission,
    ...validateMatchingSubmission(submission, expected),
  }));
  const finished = validated.filter(({ status }) => status === "FINISHED");
  const active = validated.filter(({ status }) => ACTIVE_SUBMISSION_STATUSES.has(status));
  const selected = newest(
    (finished.length > 0 ? finished : active.length > 0 ? active : validated).map(
      ({ raw, ...safe }) => ({ ...raw, ...safe }),
    ),
  );

  if (finished.length > 0) {
    return { action: "noop", submissionId: selected.submissionId, status: selected.status };
  }
  if (active.length > 0) {
    return { action: "resume", submissionId: selected.submissionId, status: selected.status };
  }
  return { action: "fail", submissionId: selected.submissionId, status: selected.status };
}

function validateSubmission(submission, expected) {
  const expectedSubmissionId = assertUuid(expected?.submissionId, "submission");
  const validated = validateMatchingSubmission(submission, expected);
  if (validated.submissionId !== expectedSubmissionId) reject("submission-id");
  return validated.status;
}

function extractSubmissionId(output) {
  const ids = new Set();
  const pattern = /\/submissions\/([0-9a-f-]{36})(?=[/?#\s]|$)/gi;
  for (const match of String(output ?? "").matchAll(pattern)) {
    ids.add(assertUuid(match[1], "submission"));
  }
  if (ids.size === 0) reject("submission-id-missing");
  if (ids.size !== 1) reject("submission-id-ambiguous");
  return [...ids][0];
}

async function fetchBuildProvenance(buildId, token) {
  if (typeof token !== "string" || token.length === 0) reject("expo-token-missing");
  let response;
  try {
    response = await fetch(EXPO_GRAPHQL_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: BUILD_PROVENANCE_QUERY, variables: { buildId } }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    reject("graphql-network");
  }
  if (!response.ok) reject("graphql-http");

  let payload;
  try {
    payload = await response.json();
  } catch {
    reject("graphql-json");
  }
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) reject("graphql-errors");
  const build = payload?.data?.builds?.byId;
  if (!build) reject("graphql-build-missing");
  return build;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    reject("json-read");
  }
}

function repositoryConfig(cliVersion) {
  const root = path.resolve(__dirname, "..");
  return validateRepositoryConfig({
    easConfig: readJson(path.join(root, "eas.json")),
    appConfig: readJson(path.join(root, "app.json")),
    cliVersion,
  });
}

function writeWorkflowOutputs(file, decision) {
  if (typeof file !== "string" || file.length === 0) reject("github-output-missing");
  if (!["schedule", "noop", "resume", "fail"].includes(decision?.action)) {
    reject("submission-plan-invalid");
  }

  const submissionId =
    decision.action === "schedule" ? "" : assertUuid(decision.submissionId, "submission");
  const status = decision.status ?? "";
  if (status !== "" && !KNOWN_SUBMISSION_STATUSES.has(status)) {
    reject("submission-status-unknown");
  }
  fs.appendFileSync(
    file,
    `action=${decision.action}\nsubmission_id=${submissionId}\nsubmission_status=${status}\n`,
    "utf8",
  );
}

async function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;

  if (command === "validate-input") {
    const buildId = assertUuid(args[0], "build");
    process.stdout.write(buildId);
    return;
  }

  if (command === "config") {
    const cliOutput = fs.readFileSync(args[0], "utf8");
    repositoryConfig(cliOutput);
    process.stdout.write(`[eas-ios-submit] PASS config eas-cli ${EAS_CLI_VERSION}\n`);
    return;
  }

  if (command === "verify-build") {
    const buildId = assertUuid(args[0], "build");
    const mainSha = assertSha(args[1], "expected-main-sha");
    const config = repositoryConfig(EAS_CLI_VERSION);
    const build = await fetchBuildProvenance(buildId, process.env.EXPO_TOKEN);
    const result = validateBuildProvenance(build, { ...config, buildId, mainSha });
    const decision = decideSubmission(build.submissions, { ...config, buildId });
    writeWorkflowOutputs(args[2], decision);
    process.stdout.write(
      `[eas-ios-submit] PASS build ${result.buildId} main ${result.mainSha.slice(0, 12)} runtime ${result.runtime.slice(0, 12)}\n`,
    );
    process.stdout.write(
      `[eas-ios-submit] PASS submission plan ${decision.action}${decision.status ? ` ${decision.status}` : ""}\n`,
    );
    if (decision.action === "fail") reject("existing-submission-terminal-failure");
    return;
  }

  if (command === "extract") {
    process.stdout.write(extractSubmissionId(fs.readFileSync(args[0], "utf8")) + "\n");
    return;
  }

  if (command === "poll") {
    const submission = readJson(args[0]);
    const buildId = assertUuid(args[1], "build");
    const submissionId = assertUuid(args[2], "submission");
    const config = repositoryConfig(EAS_CLI_VERSION);
    process.stdout.write(
      validateSubmission(submission, { ...config, buildId, submissionId }) + "\n",
    );
    return;
  }

  reject("command-unsupported");
}

function reportFailure(error) {
  const code = error instanceof GateError ? error.code : "unexpected";
  process.stderr.write(`::error title=EAS iOS submit gate::${code}\n`);
  process.exitCode = 1;
}

module.exports = {
  ACTIVE_SUBMISSION_STATUSES,
  APPLE_TEAM_ID,
  BUILD_PROVENANCE_QUERY,
  EAS_CLI_VERSION,
  GateError,
  assertUuid,
  decideSubmission,
  extractSubmissionId,
  fetchBuildProvenance,
  validateBuildProvenance,
  validateRepositoryConfig,
  validateSubmission,
  writeWorkflowOutputs,
};

if (require.main === module) {
  main().catch(reportFailure);
}
