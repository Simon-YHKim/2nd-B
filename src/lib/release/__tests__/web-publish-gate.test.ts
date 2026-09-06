import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";

type WorkflowStep = {
  env?: Record<string, unknown>;
  id?: string;
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
};

type WorkflowJob = {
  if?: string;
  permissions?: Record<string, string>;
  environment?: { name?: string; url?: string };
  concurrency?: { group?: string; "cancel-in-progress"?: boolean; queue?: string };
  outputs?: Record<string, string>;
  steps?: WorkflowStep[];
};

type WebWorkflow = {
  on?: {
    push?: { branches?: string[] };
    workflow_dispatch?: {
      inputs?: Record<
        string,
        { required?: boolean; type?: string; default?: string | boolean; options?: string[] }
      >;
    };
    pull_request?: unknown;
    pull_request_target?: unknown;
  };
  permissions?: Record<string, string>;
  env?: Record<string, string>;
  concurrency?: { group?: string; "cancel-in-progress"?: boolean };
  jobs?: Record<string, WorkflowJob>;
};

const ROOT = resolve(__dirname, "../../../..");
const RAW = readFileSync(resolve(ROOT, ".github/workflows/web-deploy.yml"), "utf8").replace(
  /\r\n?/g,
  "\n",
);
const CI_WORKFLOW = parse(
  readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8").replace(/\r\n?/g, "\n"),
) as WebWorkflow;
const RUNBOOK = readFileSync(resolve(ROOT, "docs/WEB-PUBLISH-RUNBOOK.md"), "utf8").replace(
  /\r\n?/g,
  "\n",
);
const ARTIFACT_VERIFIER_PATH = resolve(ROOT, "scripts/verify-pages-artifact-identity.mjs");
const ARTIFACT_VERIFIER = readFileSync(ARTIFACT_VERIFIER_PATH, "utf8").replace(/\r\n?/g, "\n");
const WORKFLOW = parse(RAW) as WebWorkflow;
const BUILD = WORKFLOW.jobs?.build;
const DEPLOY = WORKFLOW.jobs?.deploy;
const FINAL_GATE_NAME = "Revalidate exact SHA immediately before official Pages deployment";

function namedStep(job: WorkflowJob | undefined, name: string): WorkflowStep {
  const step = job?.steps?.find((candidate) => candidate.name === name);
  if (!step) throw new Error(`workflow step missing: ${name}`);
  return step;
}

describe("web publish event and permission boundary", () => {
  test("main pushes build only, while fork and PR events cannot reach this workflow", () => {
    expect(WORKFLOW.on?.push?.branches).toEqual(["main"]);
    expect(WORKFLOW.on?.pull_request).toBeUndefined();
    expect(WORKFLOW.on?.pull_request_target).toBeUndefined();

    const dispatch = WORKFLOW.on?.workflow_dispatch?.inputs;
    expect(dispatch?.mode).toEqual(
      expect.objectContaining({
        required: true,
        type: "choice",
        options: ["build-only", "publish"],
      }),
    );
    expect(dispatch?.source_sha).toEqual(expect.objectContaining({ required: true, type: "string" }));
    expect(dispatch?.public_config_sha256).toEqual(
      expect.objectContaining({ required: true, type: "string", default: "" }),
    );
    expect(dispatch?.artifact_content_sha256).toEqual(
      expect.objectContaining({ required: true, type: "string", default: "" }),
    );
    expect(dispatch?.compliance_floor_sha).toBeUndefined();
    expect(dispatch?.confirmation).toEqual(
      expect.objectContaining({ required: true, type: "string" }),
    );
  });

  test("only the protected deploy job gets the official Pages and OIDC write grants", () => {
    expect(WORKFLOW.permissions).toEqual({ actions: "read", contents: "read" });
    expect(BUILD?.permissions?.contents).not.toBe("write");
    expect(DEPLOY?.permissions).toEqual({
      actions: "read",
      contents: "read",
      pages: "write",
      "id-token": "write",
    });
    expect(RAW).not.toMatch(/^\s+contents: write$/m);
    expect(RAW.match(/^\s+pages: write$/gm)).toHaveLength(1);
    expect(RAW.match(/^\s+id-token: write$/gm)).toHaveLength(1);
  });

  test("the deploy job is manual-only, protected, and queued without cancelling in-progress", () => {
    expect(DEPLOY?.if).toContain("github.event_name == 'workflow_dispatch'");
    expect(DEPLOY?.if).toContain("needs.build.outputs.mode == 'publish'");
    expect(DEPLOY?.if).not.toContain("rollback");
    expect(DEPLOY?.environment).toEqual({
      name: "Production",
      url: "${{ steps.deployment.outputs.page_url }}",
    });
    expect(WORKFLOW.concurrency?.["cancel-in-progress"]).toBe(false);
    expect(DEPLOY?.concurrency).toEqual({
      group: "pages",
      "cancel-in-progress": false,
      queue: "max",
    });
  });
});

describe("web artifact is verified and immutable", () => {
  test("the build installs CI's pinned uv before dependency install and full verify", () => {
    const uvAction = "astral-sh/setup-uv@d0cc045d04ccac9d8b7881df0226f9e82c39688e";
    const steps = BUILD?.steps ?? [];
    const ciUv = CI_WORKFLOW.jobs?.verify?.steps?.find((step) => step.uses === uvAction);
    const uvIndexes = steps
      .map((step, index) => (step.uses === uvAction ? index : -1))
      .filter((index) => index >= 0);
    const installIndex = steps.findIndex((step) => step.name === "Install dependencies");
    const verifyIndex = steps.findIndex((step) => step.name === "Verify repository contracts");

    expect(ciUv?.with?.version).toBe("0.11.19");
    expect(uvIndexes).toHaveLength(1);
    expect(steps[uvIndexes[0]]?.with?.version).toBe(ciUv?.with?.version);
    expect(uvIndexes[0]).toBeLessThan(installIndex);
    expect(installIndex).toBeLessThan(verifyIndex);
  });

  test("every push runs full verify, exports, records provenance, and uploads only an artifact", () => {
    expect(namedStep(BUILD, "Verify repository contracts").run).toContain("npm run verify");
    expect(namedStep(BUILD, "Build Expo Web (static export)").run).toContain(
      "expo export --platform web --output-dir dist",
    );
    expect(namedStep(BUILD, "Bind the artifact to its reviewed source").run).toContain(
      "dist/.release-source.json",
    );
    const upload = namedStep(BUILD, "Upload immutable Pages artifact");
    expect(upload.id).toBe("upload");
    expect(upload.uses).toBe(
      "actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9",
    );
    expect(upload.with?.["include-hidden-files"]).toBe(true);
    expect(RAW).not.toContain("peaceiris/actions-gh-pages");
  });

  test("the uploaded artifact is GET-attested by ID and exact current-run name", () => {
    const attestation = namedStep(BUILD, "Attest uploaded Pages artifact identity");
    expect(attestation.id).toBe("artifact-attestation");
    expect(attestation.run).toContain("node scripts/verify-pages-artifact-identity.mjs");
    expect(attestation.env?.EXPECTED_ARTIFACT_ID).toBe("${{ steps.upload.outputs.artifact_id }}");
    expect(attestation.env?.EXPECTED_ARTIFACT_NAME).toBe("${{ steps.gate.outputs.artifact_name }}");
    expect(attestation.env?.EXPECTED_ARTIFACT_RUN_ATTEMPT).toBe(
      "${{ steps.gate.outputs.artifact_run_attempt }}",
    );
    expect(attestation.env?.WRITE_ARTIFACT_OUTPUTS).toBe("true");
    expect(ARTIFACT_VERIFIER).toContain('"api",\n        "--method",\n        "GET"');
    expect(ARTIFACT_VERIFIER).toContain("Cache-Control: no-cache");
    expect(ARTIFACT_VERIFIER).toContain("actions/artifacts/${expected.id}");
    expect(ARTIFACT_VERIFIER).toContain(
      "actions/runs/${expected.runId}/artifacts?name=${encodeURIComponent(expected.name)}&per_page=100",
    );
    expect(ARTIFACT_VERIFIER).not.toMatch(/["'](?:-f|--field)["']/);
    expect(ARTIFACT_VERIFIER).toContain("list.total_count !== 1");
    expect(ARTIFACT_VERIFIER).toContain("artifact.expired !== false");
    expect(ARTIFACT_VERIFIER).toContain("/^sha256:[0-9a-f]{64}$/");

    for (const output of [
      "artifact_id",
      "artifact_digest",
      "artifact_name",
      "artifact_size_in_bytes",
      "artifact_head_sha",
      "artifact_run_id",
      "artifact_run_attempt",
    ]) {
      expect(BUILD?.outputs?.[output]).toBe(`\${{ steps.artifact-attestation.outputs.${output} }}`);
    }
  });

  test("the real artifact verifier rejects expiry, ambiguity, digest drift, and partial reruns", () => {
    const expected = {
      id: "98765",
      name: "github-pages-12345-2",
      digest: `sha256:${"a".repeat(64)}`,
      size: "4321",
      runId: "12345",
      runAttempt: "2",
      headSha: "b".repeat(40),
    };
    const valid = {
      artifact: {
        id: 98765,
        name: expected.name,
        digest: expected.digest,
        size_in_bytes: 4321,
        expired: false,
        workflow_run: { id: 12345, head_sha: expected.headSha },
      },
      list: { total_count: 1, artifacts: [{ id: 98765, name: expected.name }] },
      expected,
      current: { runId: "12345", runAttempt: "2", headSha: expected.headSha },
      requireAttestedOutputs: true,
    };
    const harness = [
      `import { verifyArtifactIdentity } from ${JSON.stringify(pathToFileURL(ARTIFACT_VERIFIER_PATH).href)};`,
      "const fixture = JSON.parse(process.env.ARTIFACT_FIXTURE);",
      "process.stdout.write(JSON.stringify(verifyArtifactIdentity(fixture)));",
    ].join("\n");
    const runFixture = (fixture: unknown) =>
      execFileSync(process.execPath, ["--input-type=module", "--eval", harness], {
        encoding: "utf8",
        env: { ...process.env, ARTIFACT_FIXTURE: JSON.stringify(fixture) },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });

    expect(JSON.parse(runFixture(valid))).toEqual({
      id: "98765",
      name: expected.name,
      digest: expected.digest,
      size: "4321",
      runId: "12345",
      runAttempt: "2",
      headSha: expected.headSha,
    });
    expect(() => runFixture({ ...valid, artifact: { ...valid.artifact, expired: true } })).toThrow();
    expect(() =>
      runFixture({ ...valid, artifact: { ...valid.artifact, digest: `sha256:${"c".repeat(64)}` } }),
    ).toThrow();
    expect(() =>
      runFixture({ ...valid, list: { ...valid.list, total_count: 2 } }),
    ).toThrow();
    expect(() =>
      runFixture({ ...valid, current: { ...valid.current, runAttempt: "3" } }),
    ).toThrow();
  });

  test("all third-party actions are pinned to immutable commits", () => {
    for (const step of [...(BUILD?.steps ?? []), ...(DEPLOY?.steps ?? [])]) {
      if (step.uses) expect(step.uses).toMatch(/^[^@]+@[0-9a-f]{40}$/);
    }
    expect(RAW).not.toMatch(/uses:\s+[^\n]+@v\d/);
  });

  test("the official deployment consumes this run attempt's unique Pages artifact", () => {
    const requestGate = namedStep(BUILD, "Resolve and validate the requested immutable source");
    expect(requestGate.run).toContain(
      'ARTIFACT_NAME="github-pages-${{ github.run_id }}-${{ github.run_attempt }}"',
    );
    expect(namedStep(BUILD, "Upload immutable Pages artifact").with?.name).toBe(
      "${{ steps.gate.outputs.artifact_name }}",
    );
    const deployment = namedStep(DEPLOY, "Deploy the approved artifact with GitHub Pages OIDC");
    expect(deployment.id).toBe("deployment");
    expect(deployment.uses).toBe(
      "actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346",
    );
    expect(deployment.with?.artifact_name).toBe("${{ needs.build.outputs.artifact_name }}");
    expect(RAW).not.toContain("actions/download-artifact");
  });

  test("the build rejects symlinks and Git control paths before the Pages archiver runs", () => {
    const reject = namedStep(BUILD, "Reject unsafe Pages artifact entries").run ?? "";
    expect(reject).toContain("find dist -type l -print -quit");
    expect(reject).toContain("-iname .git -o -iname .github");
    expect(reject).toContain("! -type f ! -type d");
    expect(reject).toContain("must not contain symlinks");
    expect(reject).toContain("must not contain Git control paths");
    expect(reject).toContain("regular files and directories only");
    expect(reject).toContain(".release-source.json must not exist in exported content");
  });

  test("unsafe output is rejected before trusted writes, then sealed immediately before upload", () => {
    const steps = BUILD?.steps ?? [];
    const buildIndex = steps.findIndex((step) => step.name === "Build Expo Web (static export)");
    const rejectIndex = steps.findIndex((step) => step.name === "Reject unsafe Pages artifact entries");
    const finalizeIndex = steps.findIndex((step) => step.name === "Finalize trusted Pages fallback files");
    const digestIndex = steps.findIndex((step) => step.name === "Hash and approve immutable Pages content");
    const provenanceIndex = steps.findIndex((step) => step.name === "Bind the artifact to its reviewed source");
    const sealIndex = steps.findIndex((step) => step.name === "Revalidate sealed Pages content");
    const uploadIndex = steps.findIndex((step) => step.name === "Upload immutable Pages artifact");

    expect(rejectIndex).toBe(buildIndex + 1);
    expect(finalizeIndex).toBe(rejectIndex + 1);
    expect(digestIndex).toBe(finalizeIndex + 1);
    expect(provenanceIndex).toBe(digestIndex + 1);
    expect(sealIndex).toBe(provenanceIndex + 1);
    expect(uploadIndex).toBe(sealIndex + 1);

    const buildRun = steps[buildIndex]?.run ?? "";
    const finalizeRun = steps[finalizeIndex]?.run ?? "";
    const provenanceRun = steps[provenanceIndex]?.run ?? "";
    const sealRun = steps[sealIndex]?.run ?? "";
    expect(buildRun).not.toContain("cp dist/index.html");
    expect(buildRun).not.toContain("touch dist/.nojekyll");
    expect(finalizeRun).toContain("cp -- dist/index.html dist/404.html");
    expect(finalizeRun).toContain(": > dist/.nojekyll");
    expect(provenanceRun).toContain('{ flag: "wx", mode: 0o644 }');
    expect(sealRun).toContain("find dist -type l -print -quit");
    expect(sealRun).toContain("! -type f ! -type d");
    expect(sealRun).toContain("artifact provenance has missing or unexpected fields");
    expect(sealRun).toContain("artifact provenance mismatch");
    expect(sealRun).not.toMatch(/(?:writeFile|\bcp\b|\btouch\b|>\s*dist\/)/);
  });

  test("the resolved export environment is digested in the same step and compared safely", () => {
    const webBuild = namedStep(BUILD, "Build Expo Web (static export)");
    const run = webBuild.run ?? "";
    const expoEnvKeys = Object.keys(webBuild.env ?? {}).filter((key) => key.startsWith("EXPO_"));
    const uncovered = expoEnvKeys.filter(
      (key) =>
        !key.startsWith("EXPO_PUBLIC_") && key !== "EXPO_NO_DOTENV" && key !== "EXPO_USE_STATIC",
    );

    expect(uncovered).toEqual([]);
    expect(webBuild.env?.EXPO_NO_DOTENV).toBe("1");
    for (const [key, value] of Object.entries(webBuild.env ?? {})) {
      if (key.startsWith("EXPO_PUBLIC_")) {
        expect(String(value)).not.toMatch(/\$\{\{\s*secrets\./);
      }
    }
    expect(run).toContain('key.startsWith("EXPO_PUBLIC_")');
    expect(run).toContain('key === "EXPO_NO_DOTENV"');
    expect(run).toContain('key === "EXPO_USE_STATIC"');
    expect(run).toContain('createHash("sha256")');
    expect(run).toContain("timingSafeEqual(expected, actual)");
    expect(run).toContain("GITHUB_STEP_SUMMARY");
    expect(run).not.toContain("console.log(publicConfig");
    expect(run.indexOf('createHash("sha256")')).toBeLessThan(
      run.indexOf("expo export --platform web --output-dir dist"),
    );
  });

  test("canonical artifact content is approval-bound and rehashed after provenance", () => {
    const digest = namedStep(BUILD, "Hash and approve immutable Pages content");
    const digestRun = digest.run ?? "";
    const sealRun = namedStep(BUILD, "Revalidate sealed Pages content").run ?? "";

    expect(digest.id).toBe("content-digest");
    expect(digestRun).toContain("2nd-B/pages-artifact-content-sha256/v1\\0");
    expect(digestRun).toContain("Buffer.compare(Buffer.from(left, \"utf8\")");
    expect(digestRun).toContain('split(path.sep).join("/")');
    expect(digestRun).toContain("pathLength.writeBigUInt64BE");
    expect(digestRun).toContain("contentLength.writeBigUInt64BE");
    expect(digestRun).toContain('relative !== ".release-source.json"');
    expect(digestRun).toContain("timingSafeEqual(approved, actual)");
    expect(digestRun).toContain("artifact_content_sha256=$CONTENT_SHA");
    expect(digestRun).toContain("artifact content SHA-256");
    expect(sealRun).toContain('node "$RUNNER_TEMP/hash-pages-content.cjs" dist');
    expect(sealRun).toContain("timingSafeEqual(expected, actual)");
    expect(BUILD?.outputs?.artifact_content_sha256).toBe(
      "${{ steps.content-digest.outputs.artifact_content_sha256 }}",
    );
  });

  test("the workflow's real hash script is order/mtime independent and path/content framed", () => {
    const run = namedStep(BUILD, "Hash and approve immutable Pages content").run ?? "";
    const match = run.match(
      /# CONTENT_HASH_SCRIPT_BEGIN\ncat > "\$RUNNER_TEMP\/hash-pages-content\.cjs" <<'NODE'\n([\s\S]*?)\nNODE\n# CONTENT_HASH_SCRIPT_END/,
    );
    expect(match?.[1]).toBeDefined();

    const temporaryRoot = mkdtempSync(join(tmpdir(), "pages-content-hash-"));
    try {
      const script = join(temporaryRoot, "hash-pages-content.cjs");
      writeFileSync(script, match?.[1] ?? "", "utf8");
      const first = join(temporaryRoot, "first");
      const second = join(temporaryRoot, "second");
      mkdirSync(join(first, "nested"), { recursive: true });
      writeFileSync(join(first, "nested", "한글.txt"), "line one\nline two\n", "utf8");
      writeFileSync(join(first, "z.bin"), Buffer.from([0, 10, 255, 1]));
      mkdirSync(second, { recursive: true });
      writeFileSync(join(second, "z.bin"), Buffer.from([0, 10, 255, 1]));
      mkdirSync(join(second, "nested"));
      writeFileSync(join(second, "nested", "한글.txt"), "line one\nline two\n", "utf8");
      utimesSync(join(first, "z.bin"), new Date(1_000), new Date(2_000));
      utimesSync(join(second, "z.bin"), new Date(3_000), new Date(4_000));

      const hash = (directory: string) =>
        execFileSync(process.execPath, [script, directory], { encoding: "utf8" }).trim();
      const baseline = hash(first);
      expect(baseline).toMatch(/^[0-9a-f]{64}$/);
      expect(hash(second)).toBe(baseline);

      writeFileSync(join(first, ".release-source.json"), '{"ignored":true}\n', "utf8");
      expect(hash(first)).toBe(baseline);
      writeFileSync(join(second, "nested", "한글.txt"), "line one\nchanged\n", "utf8");
      expect(hash(second)).not.toBe(baseline);
      writeFileSync(join(second, "nested", "한글.txt"), "line one\nline two\n", "utf8");
      renameSync(join(second, "nested", "한글.txt"), join(second, "nested", "다른.txt"));
      expect(hash(second)).not.toBe(baseline);

      const framedA = join(temporaryRoot, "framed-a");
      const framedB = join(temporaryRoot, "framed-b");
      mkdirSync(framedA);
      mkdirSync(framedB);
      writeFileSync(join(framedA, "a"), "bc\n", "utf8");
      writeFileSync(join(framedB, "ab"), "c\n", "utf8");
      expect(hash(framedA)).not.toBe(hash(framedB));
    } finally {
      rmSync(temporaryRoot, { force: true, recursive: true });
    }
  });

  test("the workflow's real provenance verifier rejects extra and mismatched fields", () => {
    const seal = namedStep(BUILD, "Revalidate sealed Pages content");
    const run = seal.run ?? "";
    const match = run.match(
      /# PROVENANCE_VERIFY_SCRIPT_BEGIN\nnode - <<'NODE'\n([\s\S]*?)\nNODE\n# PROVENANCE_VERIFY_SCRIPT_END/,
    );
    expect(match?.[1]).toBeDefined();

    const temporaryRoot = mkdtempSync(join(tmpdir(), "pages-provenance-"));
    try {
      const script = join(temporaryRoot, "verify-provenance.cjs");
      const dist = join(temporaryRoot, "dist");
      mkdirSync(dist);
      writeFileSync(script, match?.[1] ?? "", "utf8");
      const trusted = {
        sourceSha: "1".repeat(40),
        workflowSha: "1".repeat(40),
        mode: "publish",
        publicConfigSha256: "2".repeat(64),
        artifactContentSha256: "3".repeat(64),
        workflowRunId: "12345",
        workflowRunAttempt: "2",
        artifactName: "github-pages-12345-2",
      };
      const env = {
        ...process.env,
        SOURCE_SHA: trusted.sourceSha,
        WORKFLOW_SHA: trusted.workflowSha,
        MODE: trusted.mode,
        PUBLIC_CONFIG_SHA256: trusted.publicConfigSha256,
        EXPECTED_ARTIFACT_CONTENT_SHA256: trusted.artifactContentSha256,
        RUN_ID: trusted.workflowRunId,
        RUN_ATTEMPT: trusted.workflowRunAttempt,
        ARTIFACT_NAME: trusted.artifactName,
      };
      const provenancePath = join(dist, ".release-source.json");
      const verify = () =>
        execFileSync(process.execPath, [script], {
          cwd: temporaryRoot,
          env,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        });

      writeFileSync(provenancePath, `${JSON.stringify(trusted)}\n`, "utf8");
      expect(() => verify()).not.toThrow();
      writeFileSync(provenancePath, `${JSON.stringify({ ...trusted, extra: "forbidden" })}\n`, "utf8");
      expect(() => verify()).toThrow();
      writeFileSync(
        provenancePath,
        `${JSON.stringify({ ...trusted, artifactContentSha256: "4".repeat(64) })}\n`,
        "utf8",
      );
      expect(() => verify()).toThrow();
    } finally {
      rmSync(temporaryRoot, { force: true, recursive: true });
    }
  });

  test("artifact provenance binds content, gate, config, run attempt, and artifact identity", () => {
    const provenance = namedStep(BUILD, "Bind the artifact to its reviewed source").run ?? "";
    for (const field of [
      "sourceSha",
      "workflowSha",
      "publicConfigSha256",
      "artifactContentSha256",
      "workflowRunId",
      "workflowRunAttempt",
      "artifactName",
    ]) {
      expect(provenance).toContain(field);
    }
    expect(provenance).toContain("artifact name is not bound to this run attempt");
  });
});

describe("exact-SHA, config-bound, forward-only publication contract", () => {
  const requestGate = namedStep(BUILD, "Resolve and validate the requested immutable source").run ?? "";
  const sourceGate = namedStep(BUILD, "Prove source membership and publication eligibility").run ?? "";
  const finalGate = namedStep(DEPLOY, FINAL_GATE_NAME).run ?? "";

  test("dispatch accepts only exact lowercase SHAs and exact typed confirmations", () => {
    expect(requestGate).toContain("^[0-9a-f]{40}$");
    expect(requestGate).toContain("^[0-9a-f]{64}$");
    expect(requestGate).toContain('EXPECTED_CONFIRMATION="build-only:$SOURCE_SHA"');
    expect(requestGate).toContain(
      'EXPECTED_CONFIRMATION="publish:$SOURCE_SHA:$CONFIG_SHA:$CONTENT_SHA"',
    );
    expect(requestGate).toContain(
      "Build-only requires blank public_config_sha256 and artifact_content_sha256 inputs",
    );
    expect(requestGate).toContain(
      "Publish requires approved public_config_sha256 and artifact_content_sha256 values",
    );
    expect(requestGate).toContain('CONFIRMATION" != "$EXPECTED_CONFIRMATION');
    expect(requestGate).toContain('REPOSITORY" != "Simon-YHKim/2nd-B');
    expect(requestGate).toContain('REF_NAME" != "refs/heads/main');
  });

  test("every manual build and publish requires fresh origin/main before and after approval", () => {
    for (const gate of [sourceGate, finalGate]) {
      expect(gate).toContain(
        "git fetch --no-tags origin '+refs/heads/main:refs/remotes/origin/main'",
      );
      expect(gate).toContain("origin/main");
      expect(gate).toContain("SOURCE_SHA");
    }
    expect(sourceGate).toContain(
      "Manual builds and publishes require source_sha to equal fresh origin/main",
    );
    expect(finalGate).toContain("main advanced while this run waited for Production approval");
    expect(finalGate).toContain("Publish source is no longer the fresh origin/main head");
  });

  test("ancestor rollback and floor inputs do not exist", () => {
    expect(WORKFLOW.on?.workflow_dispatch?.inputs?.mode?.options).toEqual(["build-only", "publish"]);
    expect(WORKFLOW.on?.workflow_dispatch?.inputs?.compliance_floor_sha).toBeUndefined();
    expect(RAW).not.toMatch(/\bPINNED_COMPLIANCE_FLOOR_SHA\b/);
    expect(RAW).not.toMatch(/\bPRE_BOUNDARY_LIVE_SHA\b/);
    expect(RAW).not.toMatch(/\brollback\b/i);
  });

  test("public artifacts reject the QA tier override", () => {
    expect(requestGate).toContain("Publish forbids the QA tier override");
    expect(finalGate).toContain("Public deployment cannot contain the QA tier override");
  });

  test("the final protected gate rebinds confirmation to the actual config and content outputs", () => {
    expect(namedStep(DEPLOY, FINAL_GATE_NAME).env?.CONTENT_SHA).toBe(
      "${{ needs.build.outputs.artifact_content_sha256 }}",
    );
    expect(finalGate).toContain("Resolved artifact-content digest is missing or malformed");
    expect(finalGate).toContain(
      'EXPECTED_CONFIRMATION="publish:$SOURCE_SHA:$CONFIG_SHA:$CONTENT_SHA"',
    );
  });

  test("the final gate re-attests build outputs and rejects deploy-only partial reruns", () => {
    const gate = namedStep(DEPLOY, FINAL_GATE_NAME);
    expect(gate.env?.EXPECTED_ARTIFACT_ID).toBe("${{ needs.build.outputs.artifact_id }}");
    expect(gate.env?.EXPECTED_ARTIFACT_NAME).toBe("${{ needs.build.outputs.artifact_name }}");
    expect(gate.env?.EXPECTED_ARTIFACT_DIGEST).toBe("${{ needs.build.outputs.artifact_digest }}");
    expect(gate.env?.EXPECTED_ARTIFACT_RUN_ATTEMPT).toBe(
      "${{ needs.build.outputs.artifact_run_attempt }}",
    );
    expect(gate.env?.REQUIRE_ATTESTED_OUTPUTS).toBe("true");
    expect(finalGate).toContain("node scripts/verify-pages-artifact-identity.mjs");
    expect(finalGate).toContain(
      'EXPECTED_ARTIFACT_RUN_ATTEMPT" != "$CURRENT_RUN_ATTEMPT',
    );
    expect(finalGate).toContain("Deploy-only reruns cannot reuse a prior-attempt artifact");
    expect(finalGate).not.toContain("github-pages-${{ github.run_id }}-${{ github.run_attempt }}");
  });

  test("a cached status lookup rejects every already-used or unknown Pages deployment SHA", () => {
    expect(finalGate).toContain("repos/Simon-YHKim/2nd-B/pages/deployments/$SOURCE_SHA");
    expect(finalGate).toContain("Cache-Control: no-cache");
    expect(finalGate).toContain('else "__malformed__" end');
    expect(finalGate).toContain('if [ -n "$DEPLOYMENT_STATUS" ]');
    expect(finalGate).toContain("Every Pages deployment requires a new, never-deployed main SHA");
    expect(finalGate).toContain("Could not prove that source_sha has never been deployed");
  });
});

describe("the official Pages deployment is the only external mutation", () => {
  test("the final refetch is immediately followed by the pinned OIDC deployment action", () => {
    const steps = DEPLOY?.steps ?? [];
    const gateIndex = steps.findIndex((step) => step.name === FINAL_GATE_NAME);
    const deployIndex = steps.findIndex(
      (step) => step.name === "Deploy the approved artifact with GitHub Pages OIDC",
    );
    const gate = namedStep(DEPLOY, FINAL_GATE_NAME).run ?? "";

    expect(gateIndex).toBeGreaterThanOrEqual(0);
    expect(deployIndex).toBe(gateIndex + 1);
    expect(gate).toContain(
      "git fetch --no-tags origin '+refs/heads/main:refs/remotes/origin/main'",
    );
    expect(gate).toContain("deploy-pages must be a separate action step");
    expect(RAW).not.toContain("push --force");
    expect(RAW).not.toContain("GH_PAGES_TOKEN");
  });

  test("the runbook requires an approved Actions-source cutover and legacy-run quarantine", () => {
    expect(RUNBOOK).toContain("build_type=workflow");
    expect(RUNBOOK).toContain("사용자 명시 승인");
    expect(RUNBOOK).toContain("Settings → Pages");
    expect(RUNBOOK).toContain("FIRST technical lock");
    expect(RUNBOOK).toContain("모든 nonterminal");
    expect(RUNBOOK).toContain('select(.status != "completed")');
    expect(RUNBOOK).toContain("취소가 필요하면 그 취소도 별도 사용자 명시 승인");
    expect(RUNBOOK).toContain("refs/tags/legacy-pages-pre-actions-cutover-260903");
    expect(RUNBOOK).toContain("1회 creation만 허용");
    expect(RUNBOOK).toMatch(/update,\s+deletion, force-push를 모두 거부/);
    expect(RUNBOOK).toContain("approved-inert-archive-tag-ruleset-id");
    expect(RUNBOOK).toContain("archive/tip mismatch");
    expect(RUNBOOK).toContain("`refs/heads/gh-pages` exact target의 creation, update");
    expect(RUNBOOK).toContain("force-push를 거부");
    expect(RUNBOOK).toContain("bypass actor가 없는");
    expect(RUNBOOK).toContain("삭제 제한은 켜지 않아");
    expect(RUNBOOK).toContain("`gh-pages` branch를 삭제");
    expect(RUNBOOK).toContain("legacy `github-pages` environment");
    expect(RUNBOOK).toContain("main-only + required reviewer");
    expect(RUNBOOK).toContain("admins bypass=false");
    expect(RUNBOOK).toContain("구 peaceiris step은 실패하고");
    expect(RUNBOOK).toContain("`PUT /pages`까지 진행하지 못한다");
    expect(RUNBOOK).toContain("cross-step race");

    const lock = RUNBOOK.indexOf("FIRST technical lock");
    const drain = RUNBOOK.indexOf("모든 nonterminal");
    const archive = RUNBOOK.indexOf("그 뒤에만 고정된 `gh-pages` tip SHA");
    const retire = RUNBOOK.indexOf("`gh-pages` branch를 삭제");
    const cutover = RUNBOOK.indexOf("source를 `GitHub Actions`로 1회 변경");
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(drain).toBeGreaterThan(lock);
    expect(archive).toBeGreaterThan(drain);
    expect(retire).toBeGreaterThan(archive);
    expect(cutover).toBeGreaterThan(retire);
  });

  test("every documented gh api probe is explicitly GET and never carries fields", () => {
    const probes = RUNBOOK.split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("gh api "));
    expect(probes.length).toBeGreaterThan(0);
    for (const probe of probes) {
      expect(probe).toContain("--method GET");
      expect(probe).not.toMatch(/(?:^|\s)(?:-f|--field)(?:\s|=)/);
    }
    expect(RUNBOOK).toContain("GET probe에는");
    expect(RUNBOOK).toContain("`-f`/`--field`를 추가하지 않는다");
  });

  test("the runbook makes recovery forward-only and forbids same-SHA redeployment", () => {
    expect(RUNBOOK).toContain("ancestor artifact를 다시 배포하는 `rollback` mode와 floor input은 없다");
    expect(RUNBOOK).toContain("새 revert/fix PR");
    expect(RUNBOOK).toContain("새 unique main SHA");
    expect(RUNBOOK).toContain("같은 SHA의 재배포도 금지");
    expect(RUNBOOK).toContain("`workflowSha`와 `sourceSha`");
    expect(RUNBOOK).toContain("서로 다른 SHA면 gate가 실패");
    expect(RUNBOOK).toContain("Digest script 자체는 설정값을 echo하지 않고");
    expect(RUNBOOK).toContain("Actions가 step environment를 렌더링");
    expect(RUNBOOK).toContain("confidential secret은 절대로 `EXPO_PUBLIC_*`");
    expect(RUNBOOK).toContain("artifactContentSha256");
    expect(RUNBOOK).toContain('confirmation="publish:$sha:$config:$content"');
    expect(RUNBOOK).toContain("provenance의 exact key/value 대조");
    expect(RUNBOOK).toContain("filesystem **cross-step race**");
  });

  test("the workflow never creates or rewrites the repository Pages source", () => {
    expect(RAW).not.toMatch(/\bcurl\b/);
    expect(RAW).not.toMatch(/\b(?:POST|PUT)\s+\/pages\b/);
    expect(RAW).not.toMatch(/build_type\s*[:=]\s*["']?legacy/i);
    expect(RAW).not.toContain("peaceiris/actions-gh-pages");
    expect(RAW).not.toContain("publish_branch:");
    expect(RAW).not.toContain("refs/heads/gh-pages");
    expect(RAW).not.toMatch(/^\s+contents: write$/m);
  });
});
