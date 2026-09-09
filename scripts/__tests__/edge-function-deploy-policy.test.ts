import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

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

const runPolicy = (functionName: string, verifyJwt: string, options: RunOptions = {}): PolicyRun => {
  const temp = mkdtempSync(path.join(tmpdir(), "edge-deploy-policy-"));
  const outputPath = path.join(temp, "github-output.txt");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    EDGE_FUNCTION_NAME: functionName,
    EDGE_VERIFY_JWT: verifyJwt,
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

const runWithConfig = (functionName: string, verifyJwt: string, config: string) => {
  const projectRoot = mkdtempSync(path.join(tmpdir(), "edge-deploy-project-"));
  const functionPath = path.join(projectRoot, "supabase/functions", functionName);
  mkdirSync(functionPath, { recursive: true });
  writeFileSync(path.join(functionPath, "index.ts"), "export {};\n", "utf8");
  writeFileSync(path.join(projectRoot, "supabase/config.toml"), config, "utf8");
  try {
    return runPolicy(functionName, verifyJwt, { projectRoot });
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
};

const readLf = (file: string) => readFileSync(file, "utf8").replace(/\r\n?/g, "\n");
const occurrences = (text: string, needle: string) => text.split(needle).length - 1;

describe("edge function deploy JWT policy", () => {
  test.each(JWT_REQUIRED)("%s can never request verify_jwt=false", (functionName) => {
    const result = runPolicy(functionName, "false");
    expect(result.status).toBe(1);
    expect(result.output).toEqual({});
    expect(result.stderr).toContain("verify_jwt=false is not allowed");
  });

  test.each(JWT_REQUIRED)("%s retains gateway JWT verification", (functionName) => {
    const result = runPolicy(functionName, "true");
    expect(result.status).toBe(0);
    expect(result.output).toEqual({
      function_name: functionName,
      verify_jwt: "true",
      jwt_flag: "",
    });
  });

  test.each(JWT_REQUIRED)("%s rejects a config.toml JWT downgrade even when the input says true", (functionName) => {
    const result = runWithConfig(
      functionName,
      "true",
      `[functions.${functionName}]\nverify_jwt = false\n`,
    );
    expect(result.status).toBe(1);
    expect(result.output).toEqual({});
    expect(result.stderr).toContain("config.toml");
  });

  test("a JWT-required proxy must declare verify_jwt=true explicitly", () => {
    const result = runWithConfig("openai-proxy", "true", "");
    expect(result.status).toBe(1);
    expect(result.output).toEqual({});
    expect(result.stderr).toContain("config.toml");
  });

  test("a non-callback function cannot inherit an explicit config.toml bypass", () => {
    const result = runWithConfig(
      "delete-account",
      "true",
      "[functions.delete-account]\nverify_jwt = false\n",
    );
    expect(result.status).toBe(1);
    expect(result.output).toEqual({});
    expect(result.stderr).toContain("config.toml");
  });

  test.each(JWT_BYPASS_ALLOWED)("%s retains its reviewed public-callback deployment", (functionName) => {
    const result = runPolicy(functionName, "false");
    expect(result.status).toBe(0);
    expect(result.output).toEqual({
      function_name: functionName,
      verify_jwt: "false",
      jwt_flag: "--no-verify-jwt",
    });
  });

  test("the bypass is an allowlist across every deployable function", () => {
    const allowed = new Set<string>(JWT_BYPASS_ALLOWED);
    for (const functionName of deployableFunctions) {
      const result = runPolicy(functionName, "false");
      expect({ functionName, status: result.status }).toEqual({
        functionName,
        status: allowed.has(functionName) ? 0 : 1,
      });
      if (!allowed.has(functionName)) expect(result.stderr).toContain(POLICY_ERROR);
    }
  });

  test.each([
    "",
    "Openai-proxy",
    "openai-proxy ",
    "openai_proxy",
    "../openai-proxy",
    "openai-proxy\njwt_flag=--no-verify-jwt",
    "does-not-exist",
  ])("rejects a non-canonical or unknown function slug: %j", (functionName) => {
    const result = runPolicy(functionName, "true");
    expect(result.status).toBe(1);
    expect(result.output).toEqual({});
    expect(result.stderr).toContain(POLICY_ERROR);
  });

  test.each(["", "1", "TRUE", "false\njwt_flag=--no-verify-jwt"])(
    "rejects a non-boolean verify_jwt value: %j",
    (verifyJwt) => {
      const result = runPolicy("openai-proxy", verifyJwt);
      expect(result.status).toBe(1);
      expect(result.output).toEqual({});
      expect(result.stderr).toContain(POLICY_ERROR);
    },
  );

  test("fails closed when GitHub does not provide an output channel", () => {
    const result = runPolicy("openai-proxy", "true", { withOutput: false });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("GITHUB_OUTPUT");
  });
});

describe("deploy-edge-function workflow contract", () => {
  const workflow = readLf(workflowPath);

  test("routes the untrusted dispatch inputs through the policy step exactly once", () => {
    expect(workflow).toContain("- name: Validate deployment policy");
    expect(workflow).toContain("id: policy");
    expect(workflow).toContain("run: node scripts/check-edge-function-deploy-policy.mjs");
    expect(occurrences(workflow, "${{ inputs.function }}")).toBe(1);
    expect(occurrences(workflow, "${{ inputs.verify_jwt }}")).toBe(1);
    expect(workflow).not.toContain("--no-verify-jwt");
  });

  test("deploy consumes only validated fixed-shape outputs", () => {
    const start = workflow.indexOf("- name: Deploy");
    expect(start).toBeGreaterThan(0);
    const tail = workflow.slice(start + 1);
    const nextStep = tail.search(/\n\s+- (name|uses):/);
    const deploy = workflow.slice(start, nextStep === -1 ? undefined : start + 1 + nextStep);

    expect(deploy).toContain("FUNCTION_NAME: ${{ steps.policy.outputs.function_name }}");
    expect(deploy).toContain("JWT_FLAG: ${{ steps.policy.outputs.jwt_flag }}");
    expect(deploy).toContain('args+=("$JWT_FLAG")');
    expect(deploy).toContain('supabase "${args[@]}"');
    expect(deploy).not.toContain("${{ inputs.");
  });
});
