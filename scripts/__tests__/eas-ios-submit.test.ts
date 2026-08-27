import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(__dirname, "../..");
const workflowPath = path.join(root, ".github/workflows/eas-ios-submit.yml");
const easJsonPath = path.join(root, "eas.json");

const loadChecker = () =>
  require("../check-eas-ios-submit") as {
    BUILD_PROVENANCE_QUERY: string;
    EAS_CLI_VERSION: string;
    assertUuid: (value: unknown, label?: string) => string;
    validateRepositoryConfig: (args: {
      easConfig: Record<string, any>;
      appConfig: Record<string, any>;
      cliVersion: string;
    }) => { projectId: string; bundleIdentifier: string; ascAppId: string; appleTeamId: string };
    validateBuildProvenance: (
      build: Record<string, any>,
      expected: Record<string, string>,
    ) => Record<string, string>;
    fetchBuildProvenance: (buildId: string, token: string) => Promise<Record<string, unknown>>;
    decideSubmission: (
      submissions: Array<Record<string, any>>,
      expected: Record<string, string>,
    ) => { action: string; submissionId?: string; status?: string };
    validateSubmission: (
      submission: Record<string, any>,
      expected: Record<string, string>,
    ) => string;
    extractSubmissionId: (output: string) => string;
    writeWorkflowOutputs: (
      file: string,
      decision: { action: string; submissionId?: string; status?: string },
    ) => void;
  };

const IDS = {
  build: "123e4567-e89b-42d3-a456-426614174000",
  submission: "223e4567-e89b-42d3-a456-426614174000",
  otherSubmission: "323e4567-e89b-42d3-a456-426614174000",
  project: "439c4c86-39a7-4a47-8bfa-0426f9fe18c9",
};
const MAIN_SHA = "7f7a622b44702b9a04042fc5ebd0da86c77594e0";
const FINGERPRINT = "c28067519b5576eaa29279c7e3b4ce9707623812";

const expected = {
  buildId: IDS.build,
  mainSha: MAIN_SHA,
  projectId: IDS.project,
  bundleIdentifier: "com.simonk.secondbrain",
  ascAppId: "6792266942",
  appleTeamId: "7CP84WS5C6",
};

const validBuild = (over: Record<string, unknown> = {}) => ({
  id: IDS.build,
  status: "FINISHED",
  platform: "IOS",
  distribution: "STORE",
  buildProfile: "production",
  appIdentifier: "com.simonk.secondbrain",
  app: { id: IDS.project },
  updateChannel: { name: "production" },
  runtime: { version: FINGERPRINT },
  fingerprint: { hash: FINGERPRINT },
  resolvedEnvironment: "PRODUCTION",
  isForIosSimulator: false,
  isGitWorkingTreeDirty: false,
  gitCommitHash: MAIN_SHA,
  ...over,
});

const submission = (status: string, over: Record<string, unknown> = {}) => ({
  id: IDS.submission,
  status,
  platform: "IOS",
  createdAt: "2026-08-28T00:00:00.000Z",
  app: { id: IDS.project },
  iosConfig: { ascAppIdentifier: "6792266942" },
  submittedBuild: { id: IDS.build },
  ...over,
});

describe("workflow supply-chain and scheduling gates", () => {
  const workflow = fs.readFileSync(workflowPath, "utf8");

  test("pins checkout and setup-node to immutable commits", () => {
    expect(workflow).toContain("actions/checkout@11d5960a326750d5838078e36cf38b85af677262");
    expect(workflow).toContain("actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020");
    expect(workflow).not.toMatch(/actions\/(?:checkout|setup-node)@v\d/);
  });

  test("uses one protected Production lane globally", () => {
    expect(workflow).toMatch(/^\s{4}environment: Production$/m);
    expect(workflow).toMatch(/^\s{2}group: eas-ios-submit-testflight$/m);
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("queue: max");
  });

  test("pins eas-cli, gates current remote main, and never waits inside submit", () => {
    expect(workflow).toContain('EAS_CLI_VERSION: "22.6.0"');
    expect(workflow).toContain("eas-cli@${EAS_CLI_VERSION}");
    expect(workflow).toContain("refs/heads/main");
    expect(workflow).toContain("github.ref");
    expect(workflow).toContain("github.sha");
    expect(workflow).toMatch(/git fetch[^\n]+origin[^\n]+refs\/heads\/main/);
    expect(workflow).not.toContain("submit:list");
    expect(workflow).not.toContain("--limit 50");
    expect(workflow).toContain("submit:view");
    expect(workflow).toContain("--no-wait");
  });

  test("normalizes the dispatch UUID once and uses only the gated output afterward", () => {
    expect(workflow.match(/\$\{\{ inputs\.build_id \}\}/g)).toHaveLength(1);
    expect(workflow).toContain('echo "build_id=$NORMALIZED_BUILD_ID"');
    expect(workflow).toContain("BUILD_ID: ${{ steps.main_gate.outputs.build_id }}");
  });

  test("captures machine output without replaying raw service logs", () => {
    expect(workflow).not.toMatch(/\|\s*tee\b/);
    expect(workflow).not.toMatch(/\btail\s+-/);
    expect(workflow).not.toMatch(/\bcat\s+[^<]/);
    expect(workflow).not.toContain("set -x");
  });
});

describe("repository configuration", () => {
  test("the repository and installed CLI agree on one exact production contract", () => {
    const { validateRepositoryConfig } = loadChecker();
    const easConfig = JSON.parse(fs.readFileSync(easJsonPath, "utf8"));
    const appConfig = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));

    expect(
      validateRepositoryConfig({ easConfig, appConfig, cliVersion: "eas-cli/22.6.0 linux-x64" }),
    ).toEqual({
      projectId: IDS.project,
      bundleIdentifier: "com.simonk.secondbrain",
      ascAppId: "6792266942",
      appleTeamId: "7CP84WS5C6",
    });
  });

  test("rejects a CLI range or an implicit store/simulator setting", () => {
    const { validateRepositoryConfig } = loadChecker();
    const base = {
      cli: { version: "22.6.0" },
      build: {
        production: {
          environment: "production",
          channel: "production",
          distribution: "store",
          ios: { simulator: false },
        },
      },
      submit: {
        production: { ios: { ascAppId: "6792266942", appleTeamId: "7CP84WS5C6" } },
      },
    };
    const appConfig = {
      expo: {
        ios: { bundleIdentifier: "com.simonk.secondbrain" },
        extra: { eas: { projectId: IDS.project } },
      },
    };

    expect(() =>
      validateRepositoryConfig({
        easConfig: { ...base, cli: { version: ">= 22.0.0" } },
        appConfig,
        cliVersion: "22.6.0",
      }),
    ).toThrow("config-cli-version");
    expect(() =>
      validateRepositoryConfig({
        easConfig: {
          ...base,
          build: { production: { environment: "production", channel: "production", ios: {} } },
        },
        appConfig,
        cliVersion: "22.6.0",
      }),
    ).toThrow("config-distribution");
    expect(() =>
      validateRepositoryConfig({
        easConfig: {
          ...base,
          submit: {
            production: { ios: { ascAppId: "6792266942", appleTeamId: "WRONGTEAM1" } },
          },
        },
        appConfig,
        cliVersion: "22.6.0",
      }),
    ).toThrow("config-apple-team-id");
  });
});

describe("UUID boundary", () => {
  test("accepts canonical UUIDs and normalizes case", () => {
    const { assertUuid } = loadChecker();
    expect(assertUuid(IDS.build.toUpperCase(), "build")).toBe(IDS.build);
  });

  test.each(["", "latest", "123e4567-e89b-02d3-a456-426614174000", "../../token"])(
    "rejects %p",
    (value) => {
      const { assertUuid } = loadChecker();
      expect(() => assertUuid(value, "build")).toThrow("invalid-build-id");
    },
  );
});

describe("authenticated build provenance", () => {
  test("the GraphQL readback asks for fields build:view omits", () => {
    const { BUILD_PROVENANCE_QUERY } = loadChecker();
    expect(BUILD_PROVENANCE_QUERY).toContain("isGitWorkingTreeDirty");
    expect(BUILD_PROVENANCE_QUERY).toContain("resolvedEnvironment");
    expect(BUILD_PROVENANCE_QUERY).toContain("gitCommitHash");
    expect(BUILD_PROVENANCE_QUERY).toContain("fingerprint");
    expect(BUILD_PROVENANCE_QUERY).toContain("submissions");
    expect(BUILD_PROVENANCE_QUERY).toContain("submittedBuild");
  });

  test("accepts only the finished clean production iOS build from current main", () => {
    const { validateBuildProvenance } = loadChecker();
    expect(validateBuildProvenance(validBuild(), expected)).toEqual({
      buildId: IDS.build,
      mainSha: MAIN_SHA,
      runtime: FINGERPRINT,
    });
  });

  test("sends the token only as a Bearer header and the UUID only as a GraphQL variable", async () => {
    const { BUILD_PROVENANCE_QUERY, fetchBuildProvenance } = loadChecker();
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { builds: { byId: validBuild() } } }),
    });
    const originalFetch = global.fetch;
    global.fetch = fetchMock as typeof fetch;
    try {
      await expect(fetchBuildProvenance(IDS.build, "opaque-test-token")).resolves.toMatchObject({
        id: IDS.build,
      });
    } finally {
      global.fetch = originalFetch;
    }

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.expo.dev/graphql",
      expect.objectContaining({
        headers: {
          authorization: "Bearer opaque-test-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          query: BUILD_PROVENANCE_QUERY,
          variables: { buildId: IDS.build },
        }),
      }),
    );
    expect(BUILD_PROVENANCE_QUERY).not.toContain(IDS.build);
  });

  test("does not make an unauthenticated provenance request", async () => {
    const { fetchBuildProvenance } = loadChecker();
    const fetchMock = jest.fn();
    const originalFetch = global.fetch;
    global.fetch = fetchMock as typeof fetch;
    try {
      await expect(fetchBuildProvenance(IDS.build, "")).rejects.toThrow("expo-token-missing");
    } finally {
      global.fetch = originalFetch;
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each([
    ["graphql-network", async () => Promise.reject(new Error("offline"))],
    ["graphql-http", async () => ({ ok: false })],
    [
      "graphql-json",
      async () => ({
        ok: true,
        json: async () => Promise.reject(new Error("invalid json")),
      }),
    ],
    [
      "graphql-errors",
      async () => ({ ok: true, json: async () => ({ errors: [{ message: "denied" }] }) }),
    ],
    [
      "graphql-build-missing",
      async () => ({ ok: true, json: async () => ({ data: { builds: { byId: null } } }) }),
    ],
  ])("fails closed with %s without exposing a service response", async (code, implementation) => {
    const { fetchBuildProvenance } = loadChecker();
    const originalFetch = global.fetch;
    global.fetch = jest.fn(implementation) as unknown as typeof fetch;
    try {
      await expect(fetchBuildProvenance(IDS.build, "opaque-test-token")).rejects.toThrow(
        code as string,
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  test.each([
    ["build-status", { status: "ERRORED" }],
    ["build-platform", { platform: "ANDROID" }],
    ["build-distribution", { distribution: "INTERNAL" }],
    ["build-profile", { buildProfile: "preview" }],
    ["build-project-id", { app: { id: "539c4c86-39a7-4a47-8bfa-0426f9fe18c9" } }],
    ["build-app-identifier", { appIdentifier: "com.example.wrong" }],
    ["build-channel", { updateChannel: { name: "preview" } }],
    ["build-environment", { resolvedEnvironment: "PREVIEW" }],
    ["build-simulator", { isForIosSimulator: true }],
    ["build-dirty", { isGitWorkingTreeDirty: true }],
    ["build-dirty", { isGitWorkingTreeDirty: undefined }],
    ["build-main-sha", { gitCommitHash: "0".repeat(40) }],
    ["build-runtime", { runtime: null }],
    ["build-fingerprint", { fingerprint: null }],
    ["build-runtime-fingerprint", { fingerprint: { hash: "f".repeat(40) } }],
  ])("rejects %s", (code, over) => {
    const { validateBuildProvenance } = loadChecker();
    expect(() => validateBuildProvenance(validBuild(over), expected)).toThrow(code as string);
  });
});

describe("existing submission state machine", () => {
  test.each([
    ["FINISHED", "noop"],
    ["AWAITING_BUILD", "resume"],
    ["IN_QUEUE", "resume"],
    ["IN_PROGRESS", "resume"],
    ["ERRORED", "fail"],
    ["CANCELED", "fail"],
  ])("maps %s to %s", (status, action) => {
    const { decideSubmission } = loadChecker();
    expect(decideSubmission([submission(status)], expected)).toMatchObject({
      action,
      submissionId: IDS.submission,
      status,
    });
  });

  test("schedules only when no submission exists for that build", () => {
    const { decideSubmission } = loadChecker();
    const unrelated = submission("FINISHED", {
      id: IDS.otherSubmission,
      submittedBuild: { id: "423e4567-e89b-42d3-a456-426614174000" },
    });
    expect(decideSubmission([unrelated], expected)).toEqual({ action: "schedule" });
  });

  test("a finished duplicate wins over stale failures and prevents resubmission", () => {
    const { decideSubmission } = loadChecker();
    expect(
      decideSubmission(
        [
          submission("ERRORED"),
          submission("FINISHED", {
            id: IDS.otherSubmission,
            createdAt: "2026-08-27T00:00:00.000Z",
          }),
        ],
        expected,
      ),
    ).toMatchObject({ action: "noop", status: "FINISHED" });
  });

  test("finds the matching build after fifty unrelated submission records", () => {
    const { decideSubmission } = loadChecker();
    const unrelated = Array.from({ length: 50 }, (_, index) =>
      submission("FINISHED", {
        id: `423e4567-e89b-42d3-a456-${String(index).padStart(12, "0")}`,
        submittedBuild: { id: IDS.otherSubmission },
      }),
    );
    expect(decideSubmission([...unrelated, submission("FINISHED")], expected)).toMatchObject({
      action: "noop",
      submissionId: IDS.submission,
    });
  });

  test("unknown matching states fail closed", () => {
    const { decideSubmission } = loadChecker();
    expect(() => decideSubmission([submission("MYSTERY")], expected)).toThrow(
      "submission-status-unknown",
    );
  });
});

describe("scheduled submission parsing and polling", () => {
  test("extracts and validates the one submission UUID", () => {
    const { extractSubmissionId } = loadChecker();
    expect(
      extractSubmissionId(
        `Submission details: https://expo.dev/accounts/simon_k/projects/2nd-brain/submissions/${IDS.submission}`,
      ),
    ).toBe(IDS.submission);
  });

  test("rejects missing or ambiguous submission IDs", () => {
    const { extractSubmissionId } = loadChecker();
    expect(() => extractSubmissionId("submitted")).toThrow("submission-id-missing");
    expect(() =>
      extractSubmissionId(`/submissions/${IDS.submission} /submissions/${IDS.otherSubmission}`),
    ).toThrow("submission-id-ambiguous");
  });

  test.each(["AWAITING_BUILD", "IN_QUEUE", "IN_PROGRESS", "FINISHED", "ERRORED", "CANCELED"])(
    "validates poll status %s against the exact build and project",
    (status) => {
      const { validateSubmission } = loadChecker();
      expect(
        validateSubmission(submission(status), { ...expected, submissionId: IDS.submission }),
      ).toBe(status);
    },
  );

  test("polling fails closed on another build or unknown state", () => {
    const { validateSubmission } = loadChecker();
    expect(() =>
      validateSubmission(submission("FINISHED", { submittedBuild: { id: IDS.otherSubmission } }), {
        ...expected,
        submissionId: IDS.submission,
      }),
    ).toThrow("submission-build-id");
    expect(() =>
      validateSubmission(submission("MYSTERY"), { ...expected, submissionId: IDS.submission }),
    ).toThrow("submission-status-unknown");
    expect(() =>
      validateSubmission(
        submission("FINISHED", { iosConfig: { ascAppIdentifier: "1234567890" } }),
        { ...expected, submissionId: IDS.submission },
      ),
    ).toThrow("submission-asc-app-id");
  });
});

describe("GitHub output allowlist", () => {
  test("writes only the validated action, UUID, and known status", () => {
    const { writeWorkflowOutputs } = loadChecker();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "eas-ios-submit-test-"));
    const outputFile = path.join(tempDir, "github-output.txt");
    try {
      writeWorkflowOutputs(outputFile, {
        action: "resume",
        submissionId: IDS.submission,
        status: "IN_PROGRESS",
      });
      expect(fs.readFileSync(outputFile, "utf8")).toBe(
        `action=resume\nsubmission_id=${IDS.submission}\nsubmission_status=IN_PROGRESS\n`,
      );
      expect(() =>
        writeWorkflowOutputs(outputFile, {
          action: "resume\nuntrusted=value",
          submissionId: IDS.submission,
          status: "IN_PROGRESS",
        }),
      ).toThrow("submission-plan-invalid");
      expect(() =>
        writeWorkflowOutputs(outputFile, {
          action: "resume",
          submissionId: IDS.submission,
          status: "UNKNOWN",
        }),
      ).toThrow("submission-status-unknown");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
