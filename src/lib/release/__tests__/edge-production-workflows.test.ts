import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const root = path.resolve(__dirname, "../../../..");
const CHECKOUT_SHA = "11d5960a326750d5838078e36cf38b85af677262";
const SETUP_CLI_SHA = "ab058987d8d6c725971f6cf9d0b5c98467e30bd1";

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
}

interface Job {
  if?: string;
  environment?: string;
  "runs-on"?: string;
  "timeout-minutes"?: number;
  steps: Step[];
}

interface Workflow {
  on: {
    workflow_dispatch: {
      inputs?: Record<string, unknown>;
    };
  };
  permissions: Record<string, string>;
  concurrency: {
    group: string;
    "cancel-in-progress": boolean;
  };
  jobs: Record<string, Job>;
}

function load(name: string): { raw: string; workflow: Workflow; job: Job } {
  const raw = fs.readFileSync(path.join(root, `.github/workflows/${name}`), "utf8");
  const workflow = parse(raw) as Workflow;
  const jobs = Object.values(workflow.jobs);
  expect(jobs).toHaveLength(1);
  return { raw, workflow, job: jobs[0] };
}

function allRunScripts(job: Job): string {
  return job.steps.map((step) => step.run ?? "").join("\n");
}

function mutationStep(job: Job, command: string): Step {
  const matches = job.steps.filter((step) => step.run?.includes(command));
  expect(matches).toHaveLength(1);
  return matches[0];
}

describe.each([
  "deploy-edge-function.yml",
  "edge-flag-set.yml",
])("%s production boundary", (name) => {
  const { raw, workflow, job } = load(name);

  test("is valid YAML with a minimal protected serialized job", () => {
    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.concurrency).toEqual({
      group: "supabase-production-mutations",
      "cancel-in-progress": false,
    });
    expect(job.environment).toBe("Production");
    expect(job["runs-on"]).toBe("ubuntu-24.04");
    expect(job["timeout-minutes"]).toBeGreaterThan(0);
    expect(job["timeout-minutes"]).toBeLessThanOrEqual(15);
    expect(job.if).toContain("github.repository == 'Simon-YHKim/2nd-B'");
    expect(job.if).toContain("github.ref == 'refs/heads/main'");
  });

  test("pins checkout, setup-cli, and the Supabase CLI immutably", () => {
    expect(raw).toContain(`actions/checkout@${CHECKOUT_SHA}`);
    expect(raw).toContain(`supabase/setup-cli@${SETUP_CLI_SHA}`);
    expect(raw).toContain('version: "2.116.0"');
    expect(raw).not.toMatch(/uses:\s*[^\s]+@(?:v\d+|main|master|latest)\b/);
    expect(raw).not.toMatch(/version:\s*latest\b/);
  });

  test("accepts inputs and secrets through env only, never shell source interpolation", () => {
    expect(allRunScripts(job)).not.toMatch(/\$\{\{\s*(?:inputs|secrets)\./);
  });

  test("requires Production-scoped Supabase secret names", () => {
    expect(raw).toContain("secrets.PRODUCTION_SUPABASE_ACCESS_TOKEN");
    expect(raw).toContain("secrets.PRODUCTION_SUPABASE_PROJECT_REF");
    expect(raw).not.toMatch(/secrets\.SUPABASE_(?:ACCESS_TOKEN|PROJECT_REF)/);
  });

  test("gates the checked-out current origin/main before any mutation", () => {
    expect(raw).toContain("refs/heads/main:refs/remotes/origin/main");
    expect(raw).toContain('HEAD_SHA="$(git rev-parse HEAD)"');
    expect(raw).toContain('REMOTE_MAIN_SHA="$(git rev-parse refs/remotes/origin/main)"');
    expect(raw).toContain('[ "$HEAD_SHA" != "$RUN_SHA" ]');
    expect(raw).toContain('[ "$REMOTE_MAIN_SHA" != "$RUN_SHA" ]');
  });
});

describe("deploy-edge-function input and config contract", () => {
  const { raw, workflow, job } = load("deploy-edge-function.yml");

  test("has one function input and no operator-controlled JWT override", () => {
    expect(Object.keys(workflow.on.workflow_dispatch.inputs ?? {})).toEqual(["function"]);
    expect(raw).not.toContain("verify_jwt:");
    expect(raw.match(/\$\{\{\s*inputs\.function\s*\}\}/g)).toHaveLength(1);
    expect(job.steps.some((step) => step.env?.EDGE_FUNCTION_NAME === "${{ inputs.function }}"))
      .toBe(true);
  });

  test("delegates path and auth validation to the reviewed policy script", () => {
    const matches = job.steps.filter(
      (step) => step.run === "node scripts/check-edge-function-deploy-policy.mjs",
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].env).toEqual({ EDGE_FUNCTION_NAME: "${{ inputs.function }}" });
  });

  test("rechecks main before deploying the validated slug with an explicit fixed auth flag", () => {
    const step = mutationStep(job, "supabase functions deploy");
    const script = step.run ?? "";
    const fetch = script.indexOf("git fetch --no-tags --depth=1 origin");
    const comparison = script.indexOf('git rev-parse refs/remotes/origin/main');
    const deploy = script.indexOf('supabase functions deploy "$FUNCTION_SLUG"');
    expect(fetch).toBeGreaterThanOrEqual(0);
    expect(comparison).toBeGreaterThan(fetch);
    expect(deploy).toBeGreaterThan(comparison);
    expect(step.env?.PROJECT_REF).toBe("${{ secrets.PRODUCTION_SUPABASE_PROJECT_REF }}");
    expect(step.env?.NO_VERIFY_JWT).toBe("${{ steps.policy.outputs.no_verify_jwt }}");
    expect(script).toContain('--project-ref "$PROJECT_REF"');
    expect(script).toContain('case "$NO_VERIFY_JWT" in');
    expect(script).toContain('--no-verify-jwt="$NO_VERIFY_JWT"');
  });

  test("fails closed unless postflight metadata confirms the exact JWT policy", () => {
    const postflight = job.steps.find((candidate) => candidate.name === "Verify deployed auth policy");
    expect(postflight).toBeDefined();
    expect(postflight?.env?.EXPECTED_VERIFY_JWT).toBe("${{ steps.policy.outputs.verify_jwt }}");
    expect(postflight?.run).toContain("--output json > after.json");
    expect(postflight?.run).toContain("item?.slug === process.env.FUNCTION_SLUG");
    expect(postflight?.run).toContain("matches[0].verify_jwt !== expected");
  });
});

describe("edge-flag-set mutation contract", () => {
  const { raw, job } = load("edge-flag-set.yml");

  test("retains shell allowlists and rechecks main immediately before the secret update", () => {
    const scripts = allRunScripts(job);
    expect(scripts).toContain("PADDLE_SELF_SERVICE_ENABLED|PADDLE_SELF_SERVICE_DRYRUN");
    expect(scripts).toMatch(/case "\$VALUE" in[\s\S]*0\|1/);

    const step = mutationStep(job, "supabase secrets set");
    const script = step.run ?? "";
    const fetch = script.indexOf("git fetch --no-tags --depth=1 origin");
    const comparison = script.indexOf('git rev-parse refs/remotes/origin/main');
    const mutation = script.indexOf('supabase secrets set "$FLAG=$VALUE"');
    expect(fetch).toBeGreaterThanOrEqual(0);
    expect(comparison).toBeGreaterThan(fetch);
    expect(mutation).toBeGreaterThan(comparison);
  });

  test("keeps the remote secret catalog and digests out of public logs", () => {
    const listSteps = job.steps.filter((step) => step.run?.includes("supabase secrets list"));
    expect(listSteps).toHaveLength(1);

    const postflight = listSteps[0].run ?? "";
    expect(postflight).toContain("--output json");
    expect(postflight).toContain("> \"$RUNNER_TEMP/edge-flag-after.json\"");
    expect(postflight).toContain('createHash("sha256")');
    expect(postflight).toContain("item?.name === process.env.FLAG");
    expect(postflight).toContain("matches[0].value");
    expect(postflight).not.toContain("tee");
    expect(raw).not.toContain("before.txt");
    expect(raw).not.toContain("after.txt");
    expect(raw).not.toContain("GITHUB_STEP_SUMMARY");
  });
});
