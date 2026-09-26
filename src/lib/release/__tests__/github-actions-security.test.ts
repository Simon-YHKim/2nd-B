import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const ROOT = join(__dirname, "..", "..", "..", "..");
const CREDENTIAL_CONTRACT_PATH = "docs/GITHUB-ACTIONS-CREDENTIAL-BOUNDARIES.md";
const WORKFLOW_PATHS = [
  ".github/workflows/android-release.yml",
  ".github/workflows/ci.yml",
  ".github/workflows/db-backup.yml",
  ".github/workflows/issue-sla.yml",
  ".github/workflows/model-refresh.yml",
  ".github/workflows/pr-title.yml",
  ".github/workflows/supabase-dry-run.yml",
] as const;

const APPROVED_ACTIONS = {
  "actions/checkout": { sha: "11d5960a326750d5838078e36cf38b85af677262", tag: "v4", count: 8 },
  "actions/setup-node": { sha: "49933ea5288caeca8642d1e84afbd3f7d6820020", tag: "v4", count: 5 },
  "actions/setup-java": { sha: "cf277c60eb25467037889841efdb72551f06f6c3", tag: "v4", count: 1 },
  "android-actions/setup-android": {
    sha: "9fc6c4e9069bf8d3d10b2204b1fb8f6ef7065407",
    tag: "v3",
    count: 1,
  },
  "actions/upload-artifact": {
    sha: "ea165f8d65b6e75b540449e92b4886f43607fa02",
    tag: "v4",
    count: 2,
  },
  "actions/github-script": {
    sha: "f28e40c7f34bde8b3046d885e986cb6290c5673b",
    tag: "v7",
    count: 1,
  },
  "astral-sh/setup-uv": {
    sha: "d0cc045d04ccac9d8b7881df0226f9e82c39688e",
    tag: "v6",
    count: 1,
  },
  "supabase/setup-cli": {
    sha: "ab058987d8d6c725971f6cf9d0b5c98467e30bd1",
    tag: "v1",
    count: 1,
  },
  "denoland/setup-deno": {
    sha: "22d081ff2d3a40755e97629de92e3bcbfa7cf2ed",
    tag: "v2",
    count: 1,
  },
} as const;

const PGVECTOR_PG16_IMAGE =
  "pgvector/pgvector@sha256:ccc6e83d6e35e931dc7c5def2022729d5a6c370318d099181995567ff1fb4d6b";

type Step = {
  name?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, string | number | boolean>;
};

type Workflow = {
  on?: {
    push?: { branches?: string[] };
    schedule?: unknown;
    workflow_dispatch?: {
      inputs?: Record<string, { default?: boolean; required?: boolean; type?: string }>;
    };
  };
  jobs?: Record<
    string,
    {
      if?: string;
      environment?: string | { name?: string };
      services?: Record<string, { image?: string }>;
      steps?: Step[];
    }
  >;
};

function readWorkflow(path: (typeof WORKFLOW_PATHS)[number]): {
  raw: string;
  steps: Step[];
  workflow: Workflow;
} {
  const raw = readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");
  const workflow = parse(raw) as Workflow;
  const steps = Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);
  return { raw, steps, workflow };
}

function namedStep(path: (typeof WORKFLOW_PATHS)[number], name: string): Step {
  const step = readWorkflow(path).steps.find((candidate) => candidate.name === name);
  if (!step) throw new Error(`step not found in ${path}: ${name}`);
  return step;
}

function jobSteps(path: (typeof WORKFLOW_PATHS)[number], jobName: string): Step[] {
  const steps = readWorkflow(path).workflow.jobs?.[jobName]?.steps;
  if (!steps) throw new Error(`job not found in ${path}: ${jobName}`);
  return steps;
}

function secretStepIndexes(steps: Step[]): number[] {
  return steps.flatMap((step, index) =>
    Object.values(step.env ?? {}).some((value) => value.includes("${{ secrets.")) ? [index] : [],
  );
}

function expectFreshMainGate(step: Step): void {
  expect(step.env?.RUN_SHA).toBe("${{ github.sha }}");
  expect(step.run).toContain(
    "git fetch --no-tags --depth=1 origin '+refs/heads/main:refs/remotes/origin/main'",
  );
  expect(step.run).toContain('HEAD_SHA="$(git rev-parse HEAD)"');
  expect(step.run).toContain('REMOTE_MAIN_SHA="$(git rev-parse refs/remotes/origin/main)"');
  expect(step.run).toContain('[ "$HEAD_SHA" != "$RUN_SHA" ]');
  expect(step.run).toContain('[ "$REMOTE_MAIN_SHA" != "$RUN_SHA" ]');
}

function expectImmediateFreshMainGate(
  steps: Step[],
  credentialStepName: string,
  gateStepName: string,
): void {
  const credentialIndex = steps.findIndex((step) => step.name === credentialStepName);
  expect(credentialIndex).toBeGreaterThan(0);
  expect(steps[credentialIndex - 1]?.name).toBe(gateStepName);
  expectFreshMainGate(steps[credentialIndex - 1]!);
}

describe("security-sensitive GitHub Actions workflows", () => {
  test("every workflow keeps external actions on immutable revisions", () => {
    const workflowDir = join(ROOT, ".github", "workflows");
    const files = readdirSync(workflowDir)
      .filter((name) => /\.ya?ml$/.test(name))
      .sort();
    let externalUses = 0;

    for (const file of files) {
      const lines = readFileSync(join(workflowDir, file), "utf8").split(/\r?\n/);
      for (const line of lines) {
        const value = line.match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/)?.[1];
        if (!value || value.startsWith("./")) continue;
        externalUses += 1;
        expect({ file, value, immutable: /@[0-9a-f]{40}$/.test(value) }).toEqual({
          file,
          value,
          immutable: true,
        });
      }
    }

    expect(externalUses).toBeGreaterThan(0);
  });

  test("every external action is pinned to the reviewed immutable SHA", () => {
    const observed = new Map<string, number>();
    let actionCount = 0;

    expect(WORKFLOW_PATHS).toHaveLength(7);

    for (const path of WORKFLOW_PATHS) {
      const { raw } = readWorkflow(path);
      const usesLines = raw.split("\n").filter((line) => /^\s*(?:-\s*)?uses:/.test(line));
      expect(usesLines.length).toBeGreaterThan(0);
      actionCount += usesLines.length;

      for (const line of usesLines) {
        const match = line.match(
          /^\s*(?:-\s*)?uses:\s*([\w.-]+\/[\w.-]+)@([0-9a-f]{40})\s+#\s+(v\d+)\s*$/,
        );
        expect({ path, line, immutableShaAndTagComment: Boolean(match) }).toEqual({
          path,
          line,
          immutableShaAndTagComment: true,
        });

        const [, action, sha, tag] = match!;
        const approved = APPROVED_ACTIONS[action as keyof typeof APPROVED_ACTIONS];
        expect({ path, action, sha, tag }).toEqual({
          path,
          action,
          sha: approved?.sha,
          tag: approved?.tag,
        });
        observed.set(action, (observed.get(action) ?? 0) + 1);
      }
    }

    for (const [action, { count }] of Object.entries(APPROVED_ACTIONS)) {
      expect({ action, count: observed.get(action) }).toEqual({ action, count });
    }
    expect(actionCount).toBe(
      Object.values(APPROVED_ACTIONS).reduce((total, action) => total + action.count, 0),
    );
  });

  test("run scripts never interpolate GitHub context, secrets, or variables directly", () => {
    for (const path of WORKFLOW_PATHS) {
      for (const step of readWorkflow(path).steps) {
        expect({
          path,
          step: step.name ?? step.uses,
          directExpression: step.run?.match(/\$\{\{\s*(?:github|secrets|vars)\./)?.[0] ?? null,
        }).toEqual({ path, step: step.name ?? step.uses, directExpression: null });
      }
    }
  });

  test("dispatch refs cross the shell boundary through env", () => {
    const dispatch = namedStep(
      ".github/workflows/android-release.yml",
      "Gate current main before Firebase and signing credentials",
    );
    expect(dispatch.env?.RUN_REF).toBe("${{ github.ref }}");
    expect(dispatch.run).toContain("$RUN_REF");
  });

  test.each([
    [".github/workflows/model-refresh.yml", "report", "ModelRefreshReadOnly"],
    [".github/workflows/model-refresh.yml", "apply", "Production"],
    [".github/workflows/db-backup.yml", "dump", "Backup"],
  ] as const)(
    "%s credential job %s is bound to trusted current main",
    (path, jobName, environment) => {
      const { workflow } = readWorkflow(path);
      const job = workflow.jobs?.[jobName];
      const steps = job?.steps ?? [];

      expect(job?.if).toContain("github.repository == 'Simon-YHKim/2nd-B'");
      expect(job?.if).toContain("github.ref == 'refs/heads/main'");
      expect(job?.environment).toBe(environment);

      const checkoutIndex = steps.findIndex((step) => step.uses?.startsWith("actions/checkout@"));
      const gateIndex = steps.findIndex((step) => step.name === "Gate trusted current origin/main");
      expect(checkoutIndex).toBeGreaterThanOrEqual(0);
      expect(steps[checkoutIndex]?.with?.["persist-credentials"]).toBe(false);
      expect(gateIndex).toBe(checkoutIndex + 1);
      expectFreshMainGate(steps[gateIndex]!);

      const credentialSteps = secretStepIndexes(steps);
      expect(credentialSteps.length).toBeGreaterThan(0);
      for (const secretIndex of credentialSteps) expect(secretIndex).toBeGreaterThan(gateIndex);
    },
  );

  test("model refresh keeps scheduled reports non-mutating and reserves apply for approved dispatch", () => {
    const { raw } = readWorkflow(".github/workflows/model-refresh.yml");
    const { workflow } = readWorkflow(".github/workflows/model-refresh.yml");
    const reportJob = workflow.jobs?.report;
    const applyJob = workflow.jobs?.apply;
    const applyInput = workflow.on?.workflow_dispatch?.inputs?.apply;
    const report = namedStep(
      ".github/workflows/model-refresh.yml",
      "Discover and smoke-test the newest model per seat (report only)",
    );
    const apply = namedStep(
      ".github/workflows/model-refresh.yml",
      "Discover, smoke-test, and apply the newest model per seat",
    );

    expect(workflow.on?.schedule).toBeDefined();
    expect(applyInput).toMatchObject({ type: "boolean", required: false, default: false });
    expect(reportJob?.if).toContain("github.event_name == 'schedule'");
    expect(reportJob?.if).toContain("inputs.apply != true");
    expect(reportJob?.environment).toBe("ModelRefreshReadOnly");
    expect(report.run).not.toContain("--apply");
    expect(report.env).toMatchObject({
      ANTHROPIC_API_KEY: "${{ secrets.MODEL_REFRESH_ANTHROPIC_API_KEY }}",
      OPENAI_API_KEY: "${{ secrets.MODEL_REFRESH_OPENAI_API_KEY }}",
      XAI_API_KEY: "${{ secrets.MODEL_REFRESH_XAI_API_KEY }}",
    });
    expect(report.env).not.toHaveProperty("SUPABASE_ACCESS_TOKEN");
    expect(report.env).not.toHaveProperty("SUPABASE_PROJECT_REF");
    expect(report.run).toContain(
      "MODEL_REFRESH_ANTHROPIC_API_KEY and MODEL_REFRESH_OPENAI_API_KEY",
    );

    expect(applyJob?.if).toContain("github.event_name == 'workflow_dispatch'");
    expect(applyJob?.if).toContain("inputs.apply == true");
    expect(applyJob?.if).not.toContain("schedule");
    expect(applyJob?.environment).toBe("Production");
    expect(apply.env).toMatchObject({
      ANTHROPIC_API_KEY: "${{ secrets.PRODUCTION_ANTHROPIC_API_KEY }}",
      OPENAI_API_KEY: "${{ secrets.PRODUCTION_OPENAI_API_KEY }}",
      XAI_API_KEY: "${{ secrets.PRODUCTION_XAI_API_KEY }}",
      SUPABASE_ACCESS_TOKEN: "${{ secrets.PRODUCTION_SUPABASE_ACCESS_TOKEN }}",
      SUPABASE_PROJECT_REF: "${{ secrets.PRODUCTION_SUPABASE_PROJECT_REF }}",
    });
    expect(apply.run).toContain("--apply");
    expect(apply.run).toContain("PRODUCTION_ANTHROPIC_API_KEY and PRODUCTION_OPENAI_API_KEY");
    expect(apply.run).toContain(
      "PRODUCTION_SUPABASE_ACCESS_TOKEN and PRODUCTION_SUPABASE_PROJECT_REF",
    );
    expect(raw).not.toContain("MODEL_REFRESH_APPLY");

    expectImmediateFreshMainGate(
      jobSteps(".github/workflows/model-refresh.yml", "report"),
      "Discover and smoke-test the newest model per seat (report only)",
      "Recheck current main before model report credentials",
    );
    expectImmediateFreshMainGate(
      jobSteps(".github/workflows/model-refresh.yml", "apply"),
      "Discover, smoke-test, and apply the newest model per seat",
      "Recheck current main before Production model credentials",
    );
  });

  test("DB backup uses the fail-closed Backup environment credential contract", () => {
    const { raw, workflow } = readWorkflow(".github/workflows/db-backup.yml");
    const dump = namedStep(".github/workflows/db-backup.yml", "Dump and encrypt");

    expect(workflow.on?.schedule).toBeDefined();
    expect(workflow.jobs?.dump.environment).toBe("Backup");
    expect(dump.env).toMatchObject({
      DB_URL: "${{ secrets.BACKUP_PGDUMP_DATABASE_URL }}",
      AGE_PUBLIC_KEY: "${{ secrets.BACKUP_PGDUMP_AGE_PUBLIC_KEY }}",
    });
    expect(raw).not.toContain("environment: Production");
    expect(raw).not.toMatch(/secrets\.(?:SUPABASE_DB_URL|BACKUP_AGE_PUBLIC_KEY)\b/);
    expect(dump.run).toContain('if [ -z "${DB_URL:-}" ] || [ -z "${AGE_PUBLIC_KEY:-}" ]; then');
    expect(dump.run).toContain("BACKUP_PGDUMP_DATABASE_URL or BACKUP_PGDUMP_AGE_PUBLIC_KEY");
    expectImmediateFreshMainGate(
      jobSteps(".github/workflows/db-backup.yml", "dump"),
      "Dump and encrypt",
      "Recheck current main before backup credentials",
    );
  });

  test("environment credential ownership stays an audited external contract", () => {
    const contract = readFileSync(join(ROOT, CREDENTIAL_CONTRACT_PATH), "utf8");

    expect(contract).toContain("GitHub은 secret 이름만으로 environment 소유를 보장하지 않는다");
    expect(contract).toContain("동명 repository/organization Actions secret 금지");
    expect(contract).toContain("GitHub API에서 재확인해야 한다");
    expect(contract).toContain("branch `main`만");
    expect(contract).toContain("ModelRefreshReadOnly");
    expect(contract).toContain("Backup");
    expect(contract).toContain("gh secret list --app actions");
    expect(contract).toContain("gh secret list --env");
  });

  test("Android push and dispatch builds reject anything but fresh main before secrets", () => {
    const { raw, workflow } = readWorkflow(".github/workflows/android-release.yml");
    const steps = workflow.jobs?.build.steps ?? [];

    expect(workflow.on?.push?.branches).toEqual(["main"]);
    expect(workflow.on?.workflow_dispatch).toBeDefined();
    expect(workflow.jobs?.build.if).toContain("github.ref == 'refs/heads/main'");

    const checkoutIndex = steps.findIndex((step) => step.uses?.startsWith("actions/checkout@"));
    const gateIndex = steps.findIndex(
      (step) => step.name === "Gate current main before Firebase and signing credentials",
    );
    expect(checkoutIndex).toBe(0);
    expect(steps[checkoutIndex]?.with?.["persist-credentials"]).toBe(false);
    expect(gateIndex).toBe(checkoutIndex + 1);
    expect(steps[gateIndex]?.env?.RUN_REF).toBe("${{ github.ref }}");
    expect(steps[gateIndex]?.run).toContain('if [ "$RUN_REF" != "refs/heads/main" ]; then');
    expectFreshMainGate(steps[gateIndex]!);

    const credentialSteps = secretStepIndexes(steps);
    expect(credentialSteps.length).toBeGreaterThanOrEqual(2);
    for (const secretIndex of credentialSteps) {
      expect(secretIndex).toBeGreaterThan(gateIndex);
      const recheck = steps[secretIndex - 1];
      expect(recheck?.name).toMatch(
        /^Recheck current main before (?:Firebase|signing) credentials$/,
      );
      expect(recheck?.env?.RUN_REF).toBe("${{ github.ref }}");
      expect(recheck?.run).toContain('if [ "$RUN_REF" != "refs/heads/main" ]; then');
      expectFreshMainGate(recheck!);
    }
    expect(raw).not.toContain("tag or release/* only");
    expect(raw).not.toContain("startsWith(github.ref_name, 'release/')");
  });

  test("untrusted PR titles cross through env and are validated without being logged", () => {
    const validate = namedStep(".github/workflows/pr-title.yml", "Validate title");
    expect(validate.env?.TITLE).toBe("${{ github.event.pull_request.title }}");
    expect(validate.run).toContain(`printf '%s\\n' "$TITLE" | grep -Eq --`);
    expect(validate.run?.match(/\$TITLE/g)).toHaveLength(1);
    expect(validate.run).not.toMatch(/\becho\b/);
    expect(validate.run).not.toContain("Title:");
  });

  test("Supabase dry-run pins pgvector pg16 by immutable registry digest", () => {
    const { raw, workflow } = readWorkflow(".github/workflows/supabase-dry-run.yml");
    expect(workflow.jobs?.sql.services?.postgres.image).toBe(PGVECTOR_PG16_IMAGE);
    expect(raw).toContain(`image: ${PGVECTOR_PG16_IMAGE} # pg16`);
    expect(raw).not.toMatch(/image:\s*pgvector\/pgvector:pg16(?:\s|$)/);
    expect(raw).toContain("version: 2.116.0");
    expect(raw).not.toMatch(/version:\s*(?:latest|v\d+)\b/);
  });

  test("Android signing secrets use private files and never step outputs", () => {
    const resolve = namedStep(".github/workflows/android-release.yml", "Resolve signing keystore");
    for (const secret of [
      "ANDROID_KEYSTORE_BASE64",
      "ANDROID_KEYSTORE_PASSWORD",
      "ANDROID_KEY_ALIAS",
      "ANDROID_KEY_PASSWORD",
    ]) {
      expect(resolve.env?.[secret]).toBe(`\${{ secrets.${secret} }}`);
    }
    expect(resolve.run).toContain("chmod 600");
    expect(resolve.run).toContain("release-store-password");
    expect(resolve.run).toContain("release-key-alias");
    expect(resolve.run).toContain("release-key-password");
    expect(resolve.run).not.toContain("GITHUB_OUTPUT");

    const build = namedStep(
      ".github/workflows/android-release.yml",
      "Build diagnostic APK (release)",
    );
    expect(build.run).toContain("release-store-password");
    expect(build.run).toContain("release-key-alias");
    expect(build.run).toContain("release-key-password");
    expect(build.run).not.toContain("steps.signing.outputs");
  });
});
