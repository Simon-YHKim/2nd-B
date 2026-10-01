import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "yaml";

const root = path.resolve(__dirname, "../..");
const policyPath = path.join(root, "scripts/check-edge-function-deploy-policy.mjs");
const workflowPath = path.join(root, ".github/workflows/deploy-edge-function.yml");
const functionsPath = path.join(root, "supabase/functions");

const JWT_REQUIRED = ["gemini-proxy", "openai-proxy", "claude-proxy", "xai-proxy"] as const;
const JWT_BYPASS_ALLOWED = ["oauth-naver", "paddle-webhook", "rewarded-ssv"] as const;
const POLICY_ERROR = "::error title=Edge deploy policy::";

const deployableFunctions = readdirSync(functionsPath)
  .filter((name) => statSync(path.join(functionsPath, name)).isDirectory())
  .filter((name) => existsSync(path.join(functionsPath, name, "index.ts")))
  .sort();

type PolicyRun = {
  status: number | null;
  stdout: string;
  stderr: string;
  output: Record<string, string>;
};

type RunOptions = {
  projectRoot?: string;
  withOutput?: boolean;
  extraEnv?: Partial<NodeJS.ProcessEnv>;
};

type WorkflowStep = {
  name?: string;
  id?: string;
  run?: string;
  env?: Record<string, string>;
};

type Workflow = {
  on: { workflow_dispatch: { inputs?: Record<string, unknown> } };
  jobs: { deploy: { environment?: string; if?: string; steps: WorkflowStep[] } };
};

const parseOutput = (source: string) =>
  source
    .split(/\r?\n/)
    .filter(Boolean)
    .reduce<Record<string, string>>((result, line) => {
      const separator = line.indexOf("=");
      if (separator >= 0) result[line.slice(0, separator)] = line.slice(separator + 1);
      return result;
    }, {});

const runPolicy = (functionName: string, options: RunOptions = {}): PolicyRun => {
  const temp = mkdtempSync(path.join(tmpdir(), "edge-deploy-policy-"));
  const outputPath = path.join(temp, "github-output.txt");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...options.extraEnv,
    EDGE_FUNCTION_NAME: functionName,
    GITHUB_OUTPUT: outputPath,
  };
  if (options.withOutput === false) delete env.GITHUB_OUTPUT;

  const result = spawnSync(process.execPath, [policyPath], {
    cwd: options.projectRoot ?? root,
    encoding: "utf8",
    env,
  });
  const output = existsSync(outputPath) ? parseOutput(readFileSync(outputPath, "utf8")) : {};
  rmSync(temp, { recursive: true, force: true });

  return { status: result.status, stdout: result.stdout, stderr: result.stderr, output };
};

const runWithConfig = (functionName: string, config: string) => {
  const projectRoot = mkdtempSync(path.join(tmpdir(), "edge-deploy-project-"));
  const functionPath = path.join(projectRoot, "supabase/functions", functionName);
  mkdirSync(functionPath, { recursive: true });
  writeFileSync(path.join(functionPath, "index.ts"), "export {};\n", "utf8");
  writeFileSync(path.join(projectRoot, "supabase/config.toml"), config, "utf8");
  try {
    return runPolicy(functionName, { projectRoot });
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
};

const readLf = (file: string) => readFileSync(file, "utf8").replace(/\r\n?/g, "\n");
const occurrences = (text: string, needle: string) => text.split(needle).length - 1;

describe("edge function deploy JWT policy", () => {
  test.each(JWT_REQUIRED)("%s always retains gateway JWT verification", (functionName) => {
    const result = runPolicy(functionName, { extraEnv: { EDGE_VERIFY_JWT: "false" } });
    expect(result.status).toBe(0);
    expect(result.output).toEqual({
      function_name: functionName,
      verify_jwt: "true",
      no_verify_jwt: "false",
    });
  });

  test.each(JWT_BYPASS_ALLOWED)("%s retains its reviewed public-callback policy", (functionName) => {
    const result = runPolicy(functionName, { extraEnv: { EDGE_VERIFY_JWT: "true" } });
    expect(result.status).toBe(0);
    expect(result.output).toEqual({
      function_name: functionName,
      verify_jwt: "false",
      no_verify_jwt: "true",
    });
  });

  test("the fixed allowlist covers every deployable function", () => {
    const allowed = new Set<string>(JWT_BYPASS_ALLOWED);
    for (const functionName of deployableFunctions) {
      const result = runPolicy(functionName);
      expect({ functionName, status: result.status, output: result.output }).toEqual({
        functionName,
        status: 0,
        output: {
          function_name: functionName,
          verify_jwt: String(!allowed.has(functionName)),
          no_verify_jwt: String(allowed.has(functionName)),
        },
      });
    }
  });

  test("rejects a direct config downgrade without changing the fixed authority", () => {
    const result = runWithConfig(
      "openai-proxy",
      "[functions.openai-proxy]\nverify_jwt = false\n",
    );
    expect(result.status).toBe(1);
    expect(result.output).toEqual({});
    expect(result.stderr).toContain("config.toml");
  });

  test("rejects an effective remote-profile override", () => {
    const result = runWithConfig(
      "openai-proxy",
      [
        "[functions.openai-proxy]",
        "verify_jwt = true",
        "[remotes.production.functions.openai-proxy]",
        "verify_jwt = false",
        "",
      ].join("\n"),
    );
    expect(result.status).toBe(1);
    expect(result.output).toEqual({});
    expect(result.stderr).toContain("Remote or quoted TOML sections");
  });

  test("rejects quoted keys hidden behind a multiline TOML decoy", () => {
    const result = runWithConfig(
      "openai-proxy",
      [
        "[functions.openai-proxy]",
        'static_files = """',
        "verify_jwt = true",
        '"""',
        '"verify_jwt" = false',
        "",
      ].join("\n"),
    );
    expect(result.status).toBe(1);
    expect(result.output).toEqual({});
    expect(result.stderr).toContain("Multiline TOML strings");
  });

  // A TOML parser reads `"verify\u005fjwt"` as verify_jwt and files the line
  // after `[[decoy]]` under the decoy table. A line scanner sees neither, so
  // both constructs are refused instead of modelled.
  test("rejects an escaped quoted key followed by an array-table decoy", () => {
    const result = runWithConfig(
      "openai-proxy",
      [
        "[functions.openai-proxy]",
        '"verify\\u005fjwt" = false',
        "[[decoy]]",
        "verify_jwt = true",
        "",
      ].join("\n"),
    );
    expect(result.status).toBe(1);
    expect(result.output).toEqual({});
    expect(result.stderr).toContain("unsupported");
  });

  test("rejects quoted assignment keys even when the canonical setting is present", () => {
    const result = runWithConfig(
      "openai-proxy",
      [
        "[functions.openai-proxy]",
        "verify_jwt = true",
        '"unrelated" = "value"',
        "",
      ].join("\n"),
    );
    expect(result.status).toBe(1);
    expect(result.output).toEqual({});
    expect(result.stderr).toContain("quoted TOML assignment keys");
  });

  test("rejects a quoted segment inside a dotted assignment key", () => {
    const result = runWithConfig(
      "openai-proxy",
      [
        "[functions.openai-proxy]",
        "verify_jwt = true",
        "[functions]",
        'openai-proxy."verify\\u005fjwt" = false',
        "",
      ].join("\n"),
    );
    expect(result.status).toBe(1);
    expect(result.output).toEqual({});
    expect(result.stderr).toContain("quoted TOML assignment keys");
  });

  test("rejects an array-table line that would move a setting out of the function section", () => {
    const result = runWithConfig(
      "paddle-webhook",
      ["[functions.paddle-webhook]", "[[decoy]]", "verify_jwt = false", ""].join("\n"),
    );
    expect(result.status).toBe(1);
    expect(result.output).toEqual({});
    expect(result.stderr).toContain("unsupported TOML table syntax");
  });

  test("still accepts quoted array values that contain an equals sign", () => {
    const result = runWithConfig(
      "openai-proxy",
      [
        "[auth]",
        "additional_redirect_urls = [",
        '  "https://example.com/auth-bridge.html?to=root",',
        "]",
        "[functions.openai-proxy]",
        "verify_jwt = true",
        "",
      ].join("\n"),
    );
    expect(result.status).toBe(0);
    expect(result.output).toEqual({
      function_name: "openai-proxy",
      verify_jwt: "true",
      no_verify_jwt: "false",
    });
  });

  test.each([
    "",
    "Openai-proxy",
    "openai-proxy ",
    "openai_proxy",
    "../openai-proxy",
    "openai-proxy\nno_verify_jwt=true",
    "a".repeat(64),
    "does-not-exist",
  ])("rejects a non-canonical or unknown function slug: %j", (functionName) => {
    const result = runPolicy(functionName);
    expect(result.status).toBe(1);
    expect(result.output).toEqual({});
    expect(result.stderr).toContain(POLICY_ERROR);
  });

  test("rejects a symlinked function directory", () => {
    const projectRoot = mkdtempSync(path.join(tmpdir(), "edge-deploy-symlink-"));
    const functionsRoot = path.join(projectRoot, "supabase/functions");
    const target = path.join(functionsRoot, "target");
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, "index.ts"), "export {};\n", "utf8");
    symlinkSync(target, path.join(functionsRoot, "openai-proxy"), "junction");
    writeFileSync(
      path.join(projectRoot, "supabase/config.toml"),
      "[functions.openai-proxy]\nverify_jwt = true\n",
      "utf8",
    );
    try {
      const result = runPolicy("openai-proxy", { projectRoot });
      expect(result.status).toBe(1);
      expect(result.output).toEqual({});
      expect(result.stderr).toContain("symlink");
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test("fails closed when GitHub does not provide an output channel", () => {
    const result = runPolicy("openai-proxy", { withOutput: false });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("GITHUB_OUTPUT");
  });
});

describe("deploy-edge-function workflow contract", () => {
  const workflowText = readLf(workflowPath);
  const workflow = parse(workflowText) as Workflow;
  const deployJob = workflow.jobs.deploy;

  test("has one function input and no operator-controlled JWT override", () => {
    expect(Object.keys(workflow.on.workflow_dispatch.inputs ?? {})).toEqual(["function"]);
    expect(workflowText).not.toContain("inputs.verify_jwt");
    expect(occurrences(workflowText, "${{ inputs.function }}")).toBe(1);

    const policy = deployJob.steps.find((step) => step.id === "policy");
    expect(policy).toEqual(expect.objectContaining({
      name: "Validate deployment policy",
      run: "node scripts/check-edge-function-deploy-policy.mjs",
      env: { EDGE_FUNCTION_NAME: "${{ inputs.function }}" },
    }));
  });

  test("binds secrets to the protected Production job on current main", () => {
    expect(deployJob.environment).toBe("Production");
    expect(deployJob.if).toContain("github.repository == 'Simon-YHKim/2nd-B'");
    expect(deployJob.if).toContain("github.ref == 'refs/heads/main'");
    expect(workflowText).toContain("persist-credentials: false");
    expect(workflowText).toContain("refs/heads/main:refs/remotes/origin/main");
  });

  test("deploy consumes a fixed boolean argv only after the remote-main recheck", () => {
    const step = deployJob.steps.find((candidate) => candidate.name === "Recheck main and deploy fixed auth policy");
    expect(step).toBeDefined();
    const script = step?.run ?? "";
    const recheck = script.indexOf("git rev-parse refs/remotes/origin/main");
    const deploy = script.indexOf('supabase functions deploy "$FUNCTION_SLUG"');
    expect(recheck).toBeGreaterThanOrEqual(0);
    expect(deploy).toBeGreaterThan(recheck);
    expect(step?.env?.NO_VERIFY_JWT).toBe("${{ steps.policy.outputs.no_verify_jwt }}");
    expect(script).toContain('case "$NO_VERIFY_JWT" in');
    expect(script).toContain('--no-verify-jwt="$NO_VERIFY_JWT"');
    expect(occurrences(workflowText, "--no-verify-jwt=")).toBe(1);
    expect(script).not.toContain("${{ inputs.");
  });

  test("postflight fails unless the exact remote slug has the expected boolean", () => {
    const step = deployJob.steps.find((candidate) => candidate.name === "Verify deployed auth policy");
    expect(step).toBeDefined();
    expect(step?.env?.EXPECTED_VERIFY_JWT).toBe("${{ steps.policy.outputs.verify_jwt }}");
    expect(step?.run).toContain("--output json > after.json");
    expect(step?.run).toContain("item?.slug === process.env.FUNCTION_SLUG");
    expect(step?.run).toContain('typeof matches[0].verify_jwt !== "boolean"');
    expect(step?.run).toContain("matches[0].verify_jwt !== expected");
  });
});
