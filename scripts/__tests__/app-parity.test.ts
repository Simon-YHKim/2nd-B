import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

// 앱과 localhost 는 같은 소프트웨어다 (Simon 결정 2026-09-29). localhost 는 폰 APK 빌드의
// 설정을 워크플로에서 읽어 띄우므로, 그 읽기가 틀리면 규칙 전체가 조용히 무너진다.
const {
  parseAndroidReleaseWorkflow,
  resolveEnvValue,
  appEnv,
  envDigest,
  isAppPath,
  parsePorcelainZ,
  SIMON_PORT,
} = require("../app-parity.cjs");

const root = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8").replace(/\r\n?/g, "\n");
const workflow = read(".github/workflows/android-release.yml");

type Workflow = {
  on?: { push?: { paths?: string[] } };
  jobs?: { build?: { env?: Record<string, unknown> } };
};

describe("app-parity: 폰 APK 빌드 설정 읽기", () => {
  const independent = parse(workflow) as Workflow;

  it("앱 경로와 env 를 워크플로 그대로 읽는다", () => {
    const parsed = parseAndroidReleaseWorkflow(workflow);
    expect(parsed.paths).toEqual(independent.on?.push?.paths);
    expect(parsed.paths).toEqual(expect.arrayContaining(["src/**", "assets/**", "app.json", "package.json"]));
    const envKeys = Object.keys(independent.jobs?.build?.env ?? {});
    expect(parsed.env.map((e: { key: string }) => e.key)).toEqual(envKeys);
  });

  it("폰 APK 의 EXPO_PUBLIC_* 를 빠짐없이, 그리고 그것만 만든다", () => {
    const env = appEnv(workflow, {});
    const expected = Object.keys(independent.jobs?.build?.env ?? {}).filter((k) => k.startsWith("EXPO_PUBLIC_"));
    expect(Object.keys(env).sort()).toEqual(expected.sort());
    expect(expected.length).toBeGreaterThan(20);
  });

  it("폰 앱처럼 등급을 강제하지 않고, 개발 등급을 열지 않고, 실제 LLM 을 쓴다", () => {
    const env = appEnv(workflow, {});
    expect(env.EXPO_PUBLIC_FORCE_TIER).toBe("off");
    expect(env.EXPO_PUBLIC_ALLOW_DEV_TIER).toBe("false");
    expect(env.EXPO_PUBLIC_LLM_MODE).toBe("live");
  });

  it("저장소 Variables 가 있으면 그 값을, 비어 있으면 워크플로 기본값을 쓴다", () => {
    const withVar = appEnv(workflow, { EXPO_PUBLIC_CHAT_VENDOR: "claude" });
    const empty = appEnv(workflow, { EXPO_PUBLIC_CHAT_VENDOR: "" });
    const fallback = resolveEnvValue("EXPO_PUBLIC_CHAT_VENDOR", String(independent.jobs?.build?.env?.EXPO_PUBLIC_CHAT_VENDOR), {});
    expect(withVar.EXPO_PUBLIC_CHAT_VENDOR).toBe("claude");
    expect(empty.EXPO_PUBLIC_CHAT_VENDOR).toBe(fallback);
  });
});

describe("app-parity: GitHub Actions 식 해석", () => {
  it("vars 와 기본값, vars 단독, push 에서 비는 inputs 를 Actions 와 같은 뜻으로 푼다", () => {
    expect(resolveEnvValue("K", "${{ vars.X || 'd' }}", { X: "v" })).toBe("v");
    expect(resolveEnvValue("K", "${{ vars.X || 'd' }}", {})).toBe("d");
    expect(resolveEnvValue("K", "${{ vars.X || 'd' }}", { X: "" })).toBe("d");
    expect(resolveEnvValue("K", "${{ vars.X }}", {})).toBe("");
    expect(resolveEnvValue("K", "${{ vars.X }}", { X: "v" })).toBe("v");
    expect(resolveEnvValue("K", "${{ inputs.allow_dev_tier && 'true' || 'false' }}", {})).toBe("false");
    expect(resolveEnvValue("K", "live", {})).toBe("live");
  });

  it("모르는 식은 추측하지 않고 멈춘다", () => {
    expect(() => resolveEnvValue("K", "${{ secrets.X }}", {})).toThrow(/해석하지 못했다/);
    expect(() => resolveEnvValue("K", "${{ github.ref == 'refs/heads/main' }}", {})).toThrow(/해석하지 못했다/);
    expect(() => resolveEnvValue("K", "pre-${{ vars.X }}", {})).toThrow(/섞인 식/);
  });

  it("env 순서가 달라도 같은 digest 를 낸다", () => {
    expect(envDigest({ A: "1", B: "2" })).toBe(envDigest({ B: "2", A: "1" }));
    expect(envDigest({ A: "1" })).not.toBe(envDigest({ A: "2" }));
  });
});

describe("app-parity: 앱 경로 판정", () => {
  const { paths } = parseAndroidReleaseWorkflow(workflow);

  it("워크플로의 on.push.paths 와 같은 경계로 가른다", () => {
    expect(isAppPath("src/app/index.tsx", paths)).toBe(true);
    expect(isAppPath("assets/fonts/x.woff2", paths)).toBe(true);
    expect(isAppPath("package.json", paths)).toBe(true);
    expect(isAppPath(".github/workflows/android-release.yml", paths)).toBe(true);
    expect(isAppPath("docs/HANDOFF.md", paths)).toBe(false);
    expect(isAppPath("scripts/app-parity.cjs", paths)).toBe(false);
    expect(isAppPath("srcx/index.ts", paths)).toBe(false);
    expect(isAppPath("src\\lib\\env.ts", paths)).toBe(true);
  });

  it("git status -z 의 이름 바꾸기 · 미추적 · 공백 이름을 읽는다", () => {
    const out = ["R  src/new name.ts", "src/old.ts", "?? src/added.tsx", " M docs/a.md", ""].join("\0");
    expect(parsePorcelainZ(out)).toEqual(["src/new name.ts", "src/added.tsx", "docs/a.md"]);
  });
});

describe("app-parity: 규칙이 저장소에 박혀 있다", () => {
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  const script = read("scripts/app-parity.cjs");

  it("localhost 명령은 전부 이 스크립트를 지난다", () => {
    expect(pkg.scripts.localhost).toBe("node scripts/app-parity.cjs localhost");
    expect(pkg.scripts.web).toMatch(/^node scripts\/app-parity\.cjs localhost\b/);
    expect(pkg.scripts["app:parity"]).toBe("node scripts/app-parity.cjs status");
    expect(pkg.scripts["app:qa-release"]).toBe("node scripts/app-parity.cjs qa-release");
    expect(Object.values(pkg.scripts).join("\n")).not.toMatch(/expo start --web/);
  });

  it("Simon 이 보는 포트는 8081 이고, 스크립트는 값을 복사해 두지 않는다", () => {
    expect(SIMON_PORT).toBe(8081);
    const workflowUrl = /https:\/\/[a-z0-9]+\.supabase\.co/.exec(workflow)?.[0];
    expect(workflowUrl).toBeTruthy();
    expect(script).not.toContain(String(workflowUrl));
    expect(script).toContain("EXPO_NO_DOTENV");
    expect(script).toMatch(/--no-dev/);
  });

  it("CLAUDE.md 맨 위에 규칙이 있고 AGENTS.md 가 그것을 가리킨다", () => {
    const claude = read("CLAUDE.md");
    const rule = claude.indexOf("앱과 localhost 는 같은 소프트웨어다");
    expect(rule).toBeGreaterThan(-1);
    expect(rule).toBeLessThan(claude.indexOf("## Project context"));
    for (const needle of ["npm run localhost", "npm run app:parity", "npm run app:qa-release", "localhost-main"]) {
      expect(claude.slice(rule, claude.indexOf("## Project context"))).toContain(needle);
    }
    expect(read("AGENTS.md")).toContain("앱과 localhost 는 같은 소프트웨어다");
  });
});
