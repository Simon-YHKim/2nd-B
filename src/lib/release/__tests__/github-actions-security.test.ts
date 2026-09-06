import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const ROOT = join(__dirname, "..", "..", "..", "..");
const WORKFLOW_PATHS = [
  ".github/workflows/android-release.yml",
  ".github/workflows/db-backup.yml",
  ".github/workflows/issue-sla.yml",
  ".github/workflows/model-refresh.yml",
] as const;

const APPROVED_ACTIONS = {
  "actions/checkout": { sha: "11d5960a326750d5838078e36cf38b85af677262", tag: "v4", count: 2 },
  "actions/setup-node": { sha: "49933ea5288caeca8642d1e84afbd3f7d6820020", tag: "v4", count: 2 },
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
} as const;

type Step = {
  name?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
};

type Workflow = {
  jobs?: Record<string, { steps?: Step[] }>;
};

function readWorkflow(path: (typeof WORKFLOW_PATHS)[number]): { raw: string; steps: Step[] } {
  const raw = readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");
  const workflow = parse(raw) as Workflow;
  const steps = Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);
  return { raw, steps };
}

function namedStep(path: (typeof WORKFLOW_PATHS)[number], name: string): Step {
  const step = readWorkflow(path).steps.find((candidate) => candidate.name === name);
  if (!step) throw new Error(`step not found in ${path}: ${name}`);
  return step;
}

describe("security-sensitive GitHub Actions workflows", () => {
  test("every external action is pinned to the reviewed immutable SHA", () => {
    const observed = new Map<string, number>();

    for (const path of WORKFLOW_PATHS) {
      const { raw } = readWorkflow(path);
      const usesLines = raw.split("\n").filter((line) => /^\s*(?:-\s*)?uses:/.test(line));
      expect(usesLines.length).toBeGreaterThan(0);

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

  test("dispatch refs and model-refresh control values cross the shell boundary through env", () => {
    const dispatch = namedStep(
      ".github/workflows/android-release.yml",
      "Refuse workflow_dispatch off pinned refs (tag or release/* only)",
    );
    expect(dispatch.env?.DISPATCH_REF_NAME).toBe("${{ github.ref_name }}");
    expect(dispatch.run).toContain("$DISPATCH_REF_NAME");

    const refresh = namedStep(
      ".github/workflows/model-refresh.yml",
      "Discover and smoke-test the newest model per seat",
    );
    expect(refresh.env?.MODEL_REFRESH_APPLY).toBe("${{ vars.MODEL_REFRESH_APPLY }}");
    expect(refresh.run).toContain('$MODEL_REFRESH_APPLY');
  });

  test("Android signing secrets use private files and never step outputs", () => {
    const resolve = namedStep(
      ".github/workflows/android-release.yml",
      "Resolve signing keystore",
    );
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
