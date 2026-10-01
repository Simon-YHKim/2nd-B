import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse } from "yaml";

// 앱과 localhost 는 같은 소프트웨어다 (Simon 결정 2026-09-29 · 갱신 2026-09-30). 기준은 origin/main
// 이고, 8081 은 그 설정을 워크플로에서 읽어 띄우며 main 을 스스로 따라간다. 그 읽기 · 판단이 틀리면
// 규칙 전체가 조용히 무너진다.
const {
  parseAndroidReleaseWorkflow,
  resolveEnvValue,
  appEnv,
  envDigest,
  isAppPath,
  parsePorcelainZ,
  porcelainEntries,
  dirtyFiles,
  lockDrift,
  nodeModulesDrift,
  patchProblems,
  patchPackageOf,
  stalePatchProblems,
  classifyBuild,
  sameCodeChecker,
  buildRunsFromApi,
  validateQaRunMetadata,
  validateQaArtifactMetadata,
  validateQaReleaseNotes,
  planFollow,
  parsePreflight,
  zipEntryNames,
  apkAbis,
  isRoleProcess,
  psQuote,
  winLaunchScript,
  followTick,
  runPreflight,
  SIMON_PORT,
  LOCALHOST_WORKTREE,
  APP_PARITY_PROTOCOL,
  DIGEST_ANNOTATION,
  ABI_ANNOTATION,
  PHONE_ABI,
  GATE_STEP,
  REFUSAL_TTL_MS,
} = require("../app-parity.cjs");

const root = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8").replace(/\r\n?/g, "\n");
const workflow = read(".github/workflows/android-release.yml");

type Step = { name?: string; run?: string; env?: Record<string, unknown> };
type Workflow = {
  on?: { push?: { paths?: string[] } };
  jobs?: { build?: { env?: Record<string, unknown>; steps?: Step[] } };
};

describe("app-parity: 폰 APK 빌드 설정 읽기", () => {
  const independent = parse(workflow) as Workflow;
  const steps = independent.jobs?.build?.steps ?? [];

  it("앱 경로와 env 를 워크플로 그대로 읽는다", () => {
    const parsed = parseAndroidReleaseWorkflow(workflow);
    expect(parsed.paths).toEqual(independent.on?.push?.paths);
    expect(parsed.paths).toEqual(expect.arrayContaining(["src/**", "assets/**", "app.json", "package.json", "locales/**"]));
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

  it("CI 가 남기는 digest · ABI 주석은 이 스크립트와 같은 계산이다(실제 단계를 돌려 본다)", () => {
    const step = steps.find((s) => s.name === "Record EXPO_PUBLIC digest for localhost parity");
    expect(step?.run).toBeTruthy();
    const runText = String(step?.run);
    expect(runText).not.toMatch(/\$\{\{/); // run 에 식을 끼우지 않는다(github-actions-security)
    const js = runText.slice(runText.indexOf("'") + 1, runText.lastIndexOf("'"));
    const env = { EXPO_PUBLIC_B: "", EXPO_PUBLIC_A: "x=y", OTHER: "ignored", ANDROID_ABI_FILTER: "arm64-v8a" };
    const childEnv = { ...env, PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "" } as unknown as NodeJS.ProcessEnv;
    const out = execFileSync(process.execPath, ["-e", js], { env: childEnv, encoding: "utf8" });
    const digest = out.match(new RegExp(`::notice title=${DIGEST_ANNOTATION}::([0-9a-f]{64})`));
    expect(digest?.[1]).toBe(envDigest({ EXPO_PUBLIC_A: "x=y", EXPO_PUBLIC_B: "" }));
    expect(out).toContain(`::notice title=${ABI_ANNOTATION}::${PHONE_ABI}`);
    // 첫 게이트를 지나자마자(node 준비 직후, npm ci 전) 남긴다 - 뒤에서 빌드가 실패해도 주석은 남는다
    const at = steps.indexOf(step as Step);
    expect(steps[at - 1]?.name).toBe("Setup Node 22");
    expect(at).toBeGreaterThan(steps.findIndex((s) => GATE_STEP.test(String(s.name))));
    expect(at).toBeLessThan(steps.findIndex((s) => s.name === "Build diagnostic APK (release)"));
  });

  it("EXPO_PUBLIC_* 는 job env 로만 정해진다 - 주석을 남긴 뒤 어느 단계도 바꾸지 않는다", () => {
    for (const s of steps) {
      expect(Object.keys(s.env ?? {}).filter((k) => k.startsWith("EXPO_PUBLIC_"))).toEqual([]);
      expect(String(s.run ?? "")).not.toMatch(/EXPO_PUBLIC_[A-Z0-9_]*=.*GITHUB_ENV/);
    }
  });

  it("게이트 단계 이름이 스크립트가 '밀림' 으로 알아보는 모양 그대로고, 마지막 게이트를 알아낸다", () => {
    const gates = steps.filter((s) => GATE_STEP.test(String(s.name)));
    expect(gates.length).toBeGreaterThanOrEqual(2);
    const { lastGate } = parseAndroidReleaseWorkflow(workflow);
    expect(lastGate).toBe(gates[gates.length - 1]?.name);
    expect(steps.findIndex((s) => s.name === lastGate)).toBeLessThan(steps.findIndex((s) => s.name === "Build diagnostic APK (release)"));
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

describe("app-parity: 앱 경로 · 작업 트리 · 설치 판정", () => {
  const { paths } = parseAndroidReleaseWorkflow(workflow);

  it("워크플로의 on.push.paths 와 같은 경계로 가른다", () => {
    expect(isAppPath("src/app/index.tsx", paths)).toBe(true);
    expect(isAppPath("assets/fonts/x.woff2", paths)).toBe(true);
    expect(isAppPath("package.json", paths)).toBe(true);
    expect(isAppPath("locales/ko/common.json", paths)).toBe(true);
    expect(isAppPath(".github/workflows/android-release.yml", paths)).toBe(true);
    expect(isAppPath("docs/HANDOFF.md", paths)).toBe(false);
    expect(isAppPath("scripts/app-parity.cjs", paths)).toBe(false);
    expect(isAppPath("srcx/index.ts", paths)).toBe(false);
    expect(isAppPath("src\\lib\\env.ts", paths)).toBe(true);
  });

  it("src 가 번들로 끌어오는 파일은 전부 앱 경로(on.push.paths) 안에 있다", () => {
    // 웹 전용: 네이티브에서 CSS import 는 빈 모듈이라 APK 에 영향이 없다.
    const WEB_ONLY = new Set(["global.css"]);
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== "__tests__" && e.name !== "node_modules") walk(p);
        } else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) {
          files.push(p);
        }
      }
    };
    walk(path.join(root, "src"));
    for (const f of ["metro.config.js", "babel.config.js", "app.config.js"]) files.push(path.join(root, f));
    const re = /(?:\bfrom\s+|\bimport\s+|\brequire\(\s*|\bimport\(\s*)["'](\.{1,2}\/[^"']+)["']/g;
    const outside = new Set<string>();
    let seen = 0;
    // 주석 속 예시(`an import './x.svg' resolves ...`)는 import 가 아니다 - 걷어내고 본다(URL 의 // 는 남긴다).
    const code = (text: string) =>
      text
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split(/\r?\n/) // Windows 체크아웃은 CRLF - `.` 이 \r 에 안 맞아 줄 끝 주석이 안 걷힌다
        .map((l) => l.replace(/(^|[^:"'\\])\/\/.*$/, "$1"))
        .join("\n");
    for (const f of files) {
      for (const m of code(fs.readFileSync(f, "utf8")).matchAll(re)) {
        seen++;
        const target = path.relative(root, path.resolve(path.dirname(f), m[1])).replace(/\\/g, "/");
        if (WEB_ONLY.has(target)) continue;
        const inside = [target, `${target}.js`, `${target}.ts`, `${target}.tsx`].some((t) => isAppPath(t, paths));
        if (target.startsWith("..") || !inside) outside.add(`${path.relative(root, f).replace(/\\/g, "/")} -> ${target}`);
      }
    }
    expect(seen).toBeGreaterThan(500);
    expect([...outside]).toEqual([]);
  });

  it("git status -z 의 이름 바꾸기 · 미추적 · 공백 이름을 읽는다", () => {
    const out = ["R  src/new name.ts", "src/old.ts", "?? src/added.tsx", " M docs/a.md", ""].join("\0");
    expect(parsePorcelainZ(out)).toEqual(["src/new name.ts", "src/added.tsx", "docs/a.md"]);
    expect(porcelainEntries(out).map((e: { code: string }) => e.code)).toEqual(["R ", "??", " M"]);
  });

  it("전용 워크트리의 '더러움' 은 추적 파일의 모든 변경 + 앱 경로의 미추적 파일이다(serve · 감독자 공통)", () => {
    const entries = porcelainEntries(["?? src/gen.ts", "?? notes.txt", " M docs/a.md", ""].join("\0"));
    expect(dirtyFiles(entries, paths)).toEqual(["src/gen.ts", "docs/a.md"]);
  });

  it("lockfile 과 설치를 이름 · 버전으로 대조한다(다른 플랫폼 optional 은 없어도 된다)", () => {
    const lock = {
      "": {},
      "node_modules/a": { version: "1.0.0" },
      "node_modules/b": { version: "2.0.0" },
      "node_modules/c": { version: "1.0.0", optional: true },
    };
    expect(lockDrift(lock, { "node_modules/a": { version: "1.0.0" }, "node_modules/b": { version: "2.0.0" } })).toEqual([]);
    expect(lockDrift(lock, { "node_modules/b": { version: "2.0.1" }, "node_modules/d": { version: "0.1.0" } })).toEqual([
      "a 없음",
      "b 2.0.1 (lock 2.0.0)",
      "d 여분",
    ]);
  });

  it("설치 기록 파일이 없으면 같다고 하지 않는다 · 넘겨준 lockfile 원문으로도 대조한다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "app-parity-nm-"));
    fs.mkdirSync(path.join(dir, "node_modules"));
    fs.writeFileSync(path.join(dir, "package-lock.json"), JSON.stringify({ packages: { "node_modules/a": { version: "1.0.0" } } }));
    expect(nodeModulesDrift(dir)).toEqual([expect.stringContaining("읽지 못했다")]);
    fs.writeFileSync(path.join(dir, "node_modules", ".package-lock.json"), JSON.stringify({ packages: { "node_modules/a": { version: "1.0.0" } } }));
    expect(nodeModulesDrift(dir)).toEqual([]);
    expect(nodeModulesDrift(dir, JSON.stringify({ packages: { "node_modules/a": { version: "1.1.0" } } }))).toEqual([
      "a 1.0.0 (lock 1.1.0)",
    ]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("patch-package 패치가 설치에 적용돼 있는지 더한 줄로 본다(버전이 같아 lockfile 로는 안 보이는 경우)", () => {
    const patch = [
      "diff --git a/node_modules/x/lib/a.js b/node_modules/x/lib/a.js",
      "--- a/node_modules/x/lib/a.js",
      "+++ b/node_modules/x/lib/a.js",
      "@@ -1,2 +1,2 @@",
      "-const mode = 'old-behaviour';",
      "+const mode = 'patched-behaviour';",
      "+}",
    ].join("\n");
    const files: Record<string, string | null> = { "node_modules/x/lib/a.js": "const mode = 'patched-behaviour';\n}\n" };
    expect(patchProblems("patches/x.patch", patch, (rel: string) => files[rel] ?? null)).toEqual([]);
    files["node_modules/x/lib/a.js"] = "const mode = 'old-behaviour';\n";
    expect(patchProblems("patches/x.patch", patch, (rel: string) => files[rel] ?? null)).toEqual([
      expect.stringContaining("적용돼 있지 않다"),
    ]);
    files["node_modules/x/lib/a.js"] = null;
    expect(patchProblems("patches/x.patch", patch, (rel: string) => files[rel] ?? null)).toEqual([expect.stringContaining("없다")]);
  });

  it("patch-package 파일 이름에서 설치 경로와 버전을 읽는다(범위 · 중첩 · 순서 붙은 패치)", () => {
    expect(patchPackageOf("patches/@expo+cli+56.1.17.patch")).toEqual({ dir: "node_modules/@expo/cli", version: "56.1.17" });
    expect(patchPackageOf("patches/pdfjs-dist+6.2.108.patch")).toEqual({ dir: "node_modules/pdfjs-dist", version: "6.2.108" });
    expect(patchPackageOf("patches/a++@s+b+1.0.0.patch")).toEqual({ dir: "node_modules/a/node_modules/@s/b", version: "1.0.0" });
    expect(patchPackageOf("patches/x+2.0.0+001+first.patch")).toEqual({ dir: "node_modules/x", version: "2.0.0" });
    expect(patchPackageOf("patches/README.md")).toBeNull();
  });

  describe("main 에 없는 옛 패치가 설치에 남아 있는가", () => {
    const file = "node_modules/x/lib/a.js";
    const patchOf = (lines: string[]) => [`diff --git a/${file} b/${file}`, `--- a/${file}`, `+++ b/${file}`, "@@ -1 +1 @@", ...lines].join("\n");
    const v1 = { name: "patches/x+1.0.0.patch", text: patchOf(["-const mode = 'old';", "+const mode = 'patched-v1';", "+const extra = 'only-in-v1';"]) };
    const v2 = { name: "patches/x+1.0.0.patch", text: patchOf(["-const mode = 'old';", "+const mode = 'patched-v1';"]) };
    const at = (body: string) => (rel: string) => (rel === file ? body : null);
    const installed = (v: string) => (dir: string) => (dir === "node_modules/x" ? v : null);

    it("같은 버전에서 지운 패치가 그대로 적용돼 있으면 잡는다", () => {
      const body = "const mode = 'patched-v1';\nconst extra = 'only-in-v1';\n";
      expect(stalePatchProblems([], [v1], at(body), installed("1.0.0"))).toEqual([expect.stringContaining("main 에 없는 옛 패치")]);
      expect(stalePatchProblems([], [v1], at("const mode = 'old';\n"), installed("1.0.0"))).toEqual([]);
    });

    it("고치기 전 판이 적용돼 있으면(새 판에 없는 줄이 남아 있으면) 잡는다", () => {
      expect(stalePatchProblems([v2], [v1], at("const mode = 'patched-v1';\nconst extra = 'only-in-v1';\n"), installed("1.0.0"))).toHaveLength(1);
      expect(stalePatchProblems([v2], [v1], at("const mode = 'patched-v1';\n"), installed("1.0.0"))).toEqual([]);
    });

    it("버전이 바뀌었으면 보지 않는다(윗선이 같은 수정을 받아들였을 수 있다 - lockfile 대조가 맡는다)", () => {
      const body = "const mode = 'patched-v1';\nconst extra = 'only-in-v1';\n";
      expect(stalePatchProblems([], [v1], at(body), installed("1.1.0"))).toEqual([]);
    });

    it("줄 그대로 있을 때만 남은 것으로 본다(다른 줄 안에 글자가 들어 있는 것은 아니다)", () => {
      const body = "const mode = 'patched-v1';\n// const extra = 'only-in-v1'; was removed\n";
      expect(stalePatchProblems([], [v1], at(body), installed("1.0.0"))).toEqual([]);
    });
  });
});

describe("app-parity: 그 코드 · 그 설정의 폰용 APK 빌드 상태", () => {
  const run = (id: number, sha: string, status: string, conclusion: string | null, t: string, event = "push") => ({
    databaseId: id,
    headSha: sha,
    status,
    conclusion,
    createdAt: t,
    event,
  });
  const same = (s: string) => s === "A" || s === "A2";
  const cfg = (map: Record<number, string>) => (r: { databaseId: number }) => map[r.databaseId] ?? "unknown";

  it("같은 코드 · 같은 설정의 성공이 있으면 성공(재시도의 흔들린 실패보다 앞선다)", () => {
    const runs = [run(3, "A2", "completed", "failure", "3"), run(2, "A", "completed", "success", "2"), run(1, "B", "completed", "success", "1")];
    expect(classifyBuild(runs, same, cfg({ 2: "match" }))).toMatchObject({ state: "success", run: { databaseId: 2 }, config: "match" });
  });

  it("digest 이전의 push 빌드는 설정 미확인 성공으로, 수동 빌드는 digest 가 있어야 인정한다", () => {
    expect(classifyBuild([run(2, "A", "completed", "success", "2")], same)).toMatchObject({ state: "success", config: "unknown" });
    expect(classifyBuild([run(2, "A", "completed", "success", "2", "workflow_dispatch")], same).state).toBe("unconfirmed");
    expect(classifyBuild([run(2, "A", "completed", "success", "2", "workflow_dispatch")], same, cfg({ 2: "match" })).state).toBe("success");
  });

  it("폰용이 아닌 ABI(에뮬레이터 x86_64) 빌드는 설정이 같아도, 성공이든 실패든 진행 중이든 세지 않는다", () => {
    const runs = [run(3, "A", "completed", "success", "3", "workflow_dispatch"), run(2, "A", "completed", "success", "2")];
    expect(classifyBuild(runs, same, cfg({ 3: "skip", 2: "match" }))).toMatchObject({ state: "success", run: { databaseId: 2 } });
    expect(classifyBuild([runs[0]], same, cfg({ 3: "skip" })).state).toBe("none");
    expect(classifyBuild([run(4, "A", "completed", "failure", "4", "workflow_dispatch")], same, cfg({ 4: "skip" })).state).toBe("none");
    // 에뮬레이터용 수동 빌드가 도는 동안 게이트에서 끊긴 push 빌드만 있으면 '빌드 중' 이 아니라 밀림이다
    const gate = (r: { databaseId: number }) => r.databaseId === 5;
    const x86 = [run(6, "A", "in_progress", null, "6", "workflow_dispatch"), run(5, "A", "completed", "failure", "5")];
    expect(classifyBuild(x86, same, cfg({ 6: "skip" }), gate).state).toBe("superseded");
  });

  it("같은 코드여도 설정이 다른 빌드뿐이면 stale 이다(같은 설정의 빌드가 진행 중이면 그것을 기다린다)", () => {
    expect(classifyBuild([run(1, "A", "completed", "success", "1")], same, cfg({ 1: "mismatch" })).state).toBe("stale");
    const rebuild = [run(2, "A", "in_progress", null, "2", "workflow_dispatch"), run(1, "A", "completed", "success", "1")];
    expect(classifyBuild(rebuild, same, cfg({ 1: "mismatch", 2: "match" })).state).toBe("running");
    // 주석을 아직 안 남긴 수동 빌드는 폰용 · 같은 설정인지 모른다 - '빌드 중' 으로 세지 않는다
    expect(classifyBuild(rebuild, same, cfg({ 1: "mismatch" })).state).toBe("unconfirmed");
    // 진행 중인 push 빌드도 설정이 다르면(Variables 가 빌드 뒤 바뀜) stale 이다
    expect(classifyBuild([run(3, "A", "in_progress", null, "3")], same, cfg({ 3: "mismatch" })).state).toBe("stale");
  });

  it("런 목록은 필터 없는 응답에서 main 의 push · 수동 런만 골라 최신순으로 만든다(검색 색인을 거치지 않게)", () => {
    const api = {
      workflow_runs: [
        { id: 1, head_sha: "a", event: "push", head_branch: "main", status: "completed", conclusion: "success", created_at: "2026-09-30T01:00:00Z" },
        { id: 3, head_sha: "c", event: "push", head_branch: "main", status: "queued", conclusion: null, created_at: "2026-09-30T03:00:00Z" },
        { id: 2, head_sha: "b", event: "workflow_dispatch", head_branch: "main", status: "completed", conclusion: "failure", created_at: "2026-09-30T02:00:00Z" },
        { id: 4, head_sha: "d", event: "workflow_dispatch", head_branch: "feat/x", status: "completed", conclusion: "success", created_at: "2026-09-30T04:00:00Z" },
        { id: 5, head_sha: "e", event: "pull_request", head_branch: "main", status: "completed", conclusion: "success", created_at: "2026-09-30T05:00:00Z" },
      ],
    };
    const runs = buildRunsFromApi(api);
    expect(runs.map((r: { databaseId: number }) => r.databaseId)).toEqual([3, 2, 1]);
    expect(runs[0]).toEqual({ databaseId: 3, headSha: "c", status: "queued", conclusion: "", createdAt: "2026-09-30T03:00:00Z", event: "push" });
    expect(buildRunsFromApi({})).toEqual([]);
  });

  it("앱 코드 대조의 오류를 '다른 코드' 로 삼키지 않는다(받지 않은 커밋만 '다른 코드')", () => {
    const quiet = () => undefined;
    let n = 0;
    const flaky = { compare: () => (n++ === 0 ? (() => { throw new Error("index.lock"); })() : true), has: () => true, pause: quiet };
    expect(sameCodeChecker("A", [], ".", flaky)("B")).toBe(true); // 한 번 더 보면 된다
    const broken = { compare: () => { throw new Error("bad tree"); }, has: () => true, pause: quiet };
    expect(() => sameCodeChecker("A", [], ".", broken)("B")).toThrow(/앱 코드 대조 실패/);
    const unfetched = { compare: () => { throw new Error("bad object"); }, has: () => false, pause: quiet };
    expect(sameCodeChecker("A", [], ".", unfetched)("B")).toBe(false);
  });

  it("끝났다고 나왔지만 결론이 아직 비어 있는 런은 진행 중으로 본다(GitHub 가 정리하는 틈)", () => {
    expect(classifyBuild([run(2, "A", "completed", "", "2")], same, cfg({ 2: "match" })).state).toBe("running");
    expect(classifyBuild([run(2, "A", "completed", null, "2")], same).state).toBe("running");
    expect(classifyBuild([run(2, "A", "completed", "failure", "2")], same, cfg({ 2: "match" })).state).toBe("failure");
  });

  it("main 이 이미 움직여 게이트에서 끊길 대기 빌드는 '빌드 중' 이 아니라 밀림이다", () => {
    const queued = [run(2, "A", "queued", null, "2")];
    expect(classifyBuild(queued, same, cfg({}), () => false, () => true)).toMatchObject({ state: "superseded", run: { databaseId: 2 } });
    // 마지막 게이트를 지났으면(끊길 수 없으면) 빌드 중이다
    expect(classifyBuild(queued, same, cfg({}), () => false, () => false).state).toBe("running");
  });

  it("main 이 움직여 게이트에서 끊긴 빌드는 '만들 수 없는 실패' 가 아니라 밀림이다", () => {
    const gate = (r: { databaseId: number }) => r.databaseId === 2;
    expect(classifyBuild([run(2, "A", "completed", "failure", "2")], same, cfg({}), gate).state).toBe("superseded");
    expect(classifyBuild([run(3, "A", "completed", "failure", "3"), run(2, "A", "completed", "failure", "2")], same, cfg({}), gate)).toMatchObject({
      state: "failure",
      run: { databaseId: 3 },
    });
  });

  it("성공이 없으면 진행 중 → 실패 → 취소 → 기록 없음 순으로 말한다", () => {
    expect(classifyBuild([run(2, "A", "in_progress", null, "2"), run(1, "A", "completed", "failure", "1")], same).state).toBe("running");
    expect(classifyBuild([run(2, "A", "completed", "cancelled", "2"), run(1, "A", "completed", "timed_out", "1")], same)).toMatchObject({
      state: "failure",
      run: { databaseId: 1 },
    });
    expect(classifyBuild([run(1, "A", "completed", "cancelled", "1")], same).state).toBe("cancelled");
    expect(classifyBuild([run(1, "B", "completed", "success", "1")], same)).toEqual({ state: "none", run: null });
  });

  it("게시 직전에 APK 안의 네이티브 ABI 를 zip 에서 직접 읽는다", () => {
    const zip = (names: string[]) => {
      const locals: Buffer[] = [];
      const centrals: Buffer[] = [];
      let offset = 0;
      for (const name of names) {
        const n = Buffer.from(name, "utf8");
        const local = Buffer.alloc(30 + n.length);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(n.length, 26);
        n.copy(local, 30);
        const central = Buffer.alloc(46 + n.length);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(n.length, 28);
        central.writeUInt32LE(offset, 42);
        n.copy(central, 46);
        locals.push(local);
        centrals.push(central);
        offset += local.length;
      }
      const cd = Buffer.concat(centrals);
      const end = Buffer.alloc(22);
      end.writeUInt32LE(0x06054b50, 0);
      end.writeUInt16LE(names.length, 8);
      end.writeUInt16LE(names.length, 10);
      end.writeUInt32LE(cd.length, 12);
      end.writeUInt32LE(offset, 16);
      return Buffer.concat([...locals, cd, end]);
    };
    const names = ["AndroidManifest.xml", "lib/arm64-v8a/libhermes.so", "lib/arm64-v8a/libc++_shared.so", "classes.dex"];
    expect(zipEntryNames(zip(names))).toEqual(names);
    expect(apkAbis(zipEntryNames(zip(names)))).toEqual([PHONE_ABI]);
    expect(apkAbis(zipEntryNames(zip([...names, "lib/x86_64/libhermes.so"])))).toEqual(["arm64-v8a", "x86_64"]);
    expect(() => zipEntryNames(Buffer.from("not a zip"))).toThrow(/zip/);
  });
});

describe("app-parity: 지정한 QA 빌드의 출처", () => {
  const sha = "a".repeat(40);
  const workflow = { id: 299995038, path: ".github/workflows/android-release.yml" };
  const run = {
    id: 36838147144,
    workflow_id: workflow.id,
    path: workflow.path,
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: sha,
    status: "completed",
    conclusion: "success",
    created_at: "2026-10-01T08:43:52Z",
    repository: { id: 1248737949, full_name: "Simon-YHKim/2nd-B" },
    head_repository: { full_name: "Simon-YHKim/2nd-B" },
  };
  const artifact = {
    id: 11144480094,
    name: `2ndb-android-${sha}`,
    expired: false,
    workflow_run: { id: run.id, head_sha: sha, head_branch: "main", repository_id: run.repository.id, head_repository_id: run.repository.id },
  };

  it("main 의 android-release 수동 실행을 선택하고 해당 APK 산출물을 인정한다", () => {
    expect(validateQaRunMetadata(run, workflow, String(run.id))).toMatchObject({ databaseId: run.id, headSha: sha, event: "workflow_dispatch" });
    expect(validateQaArtifactMetadata({ artifacts: [artifact] }, run)).toBe(artifact);
  });

  it.each([
    ["다른 실행 ID", { id: 1 }],
    ["다른 저장소", { repository: { id: 1, full_name: "other/repo" } }],
    ["다른 head 저장소", { head_repository: { full_name: "other/repo" } }],
    ["다른 workflow", { workflow_id: 1 }],
    ["다른 workflow 경로", { path: ".github/workflows/other.yml" }],
    ["다른 branch", { head_branch: "feature" }],
    ["다른 event", { event: "pull_request" }],
    ["유효하지 않은 SHA", { head_sha: "a" }],
  ])("%s 실행을 거부한다", (_label, change) => {
    expect(() => validateQaRunMetadata({ ...run, ...change }, workflow, String(run.id))).toThrow(/QA 빌드/);
  });

  it("불명확한 run ID 를 API 조회 전에 거부한다", () => {
    expect(() => validateQaRunMetadata(run, workflow, "1/../2")).toThrow(/실행 ID/);
    expect(() => validateQaRunMetadata(run, workflow, "0")).toThrow(/실행 ID/);
    expect(() => validateQaRunMetadata(run, workflow, "")).toThrow(/실행 ID/);
  });

  it("명시 실행과 모든 수동 실행은 설정 digest · 폰용 ABI 주석이 모두 필요하다", () => {
    const digest = "d".repeat(64);
    expect(() => validateQaReleaseNotes({ digest, abi: "arm64-v8a" }, digest, "workflow_dispatch", true, run.id)).not.toThrow();
    expect(() => validateQaReleaseNotes({ digest: null, abi: "arm64-v8a" }, digest, "workflow_dispatch", true, run.id)).toThrow(/설정 digest/);
    expect(() => validateQaReleaseNotes({ digest, abi: null }, digest, "push", true, run.id)).toThrow(/설정 digest/);
    expect(() => validateQaReleaseNotes({ digest: "e".repeat(64), abi: "arm64-v8a" }, digest, "workflow_dispatch", true, run.id)).toThrow(/지금 설정과 다르다/);
    expect(() => validateQaReleaseNotes({ digest, abi: "x86_64" }, digest, "workflow_dispatch", true, run.id)).toThrow(/x86_64/);
    expect(() => validateQaReleaseNotes({ digest: null, abi: null }, digest, "push", false, run.id)).not.toThrow();
  });

  it.each([
    ["누락", []],
    ["중복", [artifact, { ...artifact, id: 2 }]],
    ["기한 만료", [{ ...artifact, expired: true }]],
    ["다른 커밋", [{ ...artifact, workflow_run: { ...artifact.workflow_run, head_sha: "b".repeat(40) } }]],
    ["다른 실행", [{ ...artifact, workflow_run: { ...artifact.workflow_run, id: 1 } }]],
    ["다른 저장소", [{ ...artifact, workflow_run: { ...artifact.workflow_run, repository_id: 1 } }]],
  ])("%s APK 산출물을 거부한다", (_label, artifacts) => {
    expect(() => validateQaArtifactMetadata({ artifacts }, run)).toThrow(/QA 산출물/);
  });
});

describe("app-parity: 감독자의 판단", () => {
  const base = { appDiff: [], envChanged: false, scriptChanged: false, headMoved: false, dirty: [], drift: [], envError: null, headIsMain: true };

  it("움직일 것이 없으면 아무것도 하지 않고, 문서만 바뀌면 체크아웃만 옮긴다", () => {
    expect(planFollow(base)).toEqual({ action: "none" });
    expect(planFollow({ ...base, headIsMain: false })).toEqual({ action: "checkout" });
  });

  it("앱 경로 · 체크아웃 이동이면 다시 띄우고, 빌드 설정이 바뀌었을 때만 Metro 캐시를 비운다", () => {
    expect(planFollow({ ...base, appDiff: ["src/a.ts"], headIsMain: false })).toEqual({ action: "restart", clear: false });
    expect(planFollow({ ...base, headMoved: true, headIsMain: false })).toEqual({ action: "restart", clear: false });
    expect(planFollow({ ...base, envChanged: true })).toEqual({ action: "restart", clear: true });
  });

  it("이 스크립트가 바뀌면 설정 · 의존성 판정을 새 스크립트에 맡긴다(옛 스크립트가 모르는 식이 새로 올 수 있다)", () => {
    expect(planFollow({ ...base, scriptChanged: true, appDiff: ["src/a.ts"], headIsMain: false })).toEqual({ action: "self-update" });
    expect(planFollow({ ...base, scriptChanged: true, envError: "새 식", headIsMain: false })).toEqual({ action: "self-update" });
    expect(planFollow({ ...base, scriptChanged: true, drift: ["x 없음"], headIsMain: false })).toEqual({ action: "self-update" });
  });

  it("따라가면 앱과 달라지는 경우에는 지금 커밋을 그대로 둔다", () => {
    expect(planFollow({ ...base, dirty: ["src/a.ts"], scriptChanged: true }).action).toBe("hold");
    expect(planFollow({ ...base, appDiff: ["src/a.ts"], headIsMain: false, drift: ["x 없음"] }).action).toBe("hold");
    expect(planFollow({ ...base, appDiff: ["src/a.ts"], headIsMain: false, envError: "해석하지 못했다" }).action).toBe("hold");
    // 움직일 것이 없으면 일시적인 설정 조회 실패로 서버를 멈추지 않는다
    expect(planFollow({ ...base, envError: "gh 실패" })).toEqual({ action: "none" });
  });

  it("preflight 는 약속한 판 이상의 JSON 한 줄로만 통과한다", () => {
    expect(parsePreflight(`noise\n${JSON.stringify({ appParityPreflight: APP_PARITY_PROTOCOL, ok: true, reasons: [] })}\n`).ok).toBe(true);
    expect(parsePreflight(JSON.stringify({ appParityPreflight: APP_PARITY_PROTOCOL, ok: false, reasons: ["x"] }))).toMatchObject({ ok: false, reasons: ["x"] });
    expect(parsePreflight(JSON.stringify({ appParityPreflight: 1, ok: true, reasons: [] })).ok).toBe(false);
    expect(parsePreflight("사용법: node scripts/app-parity.cjs <localhost|status|qa-release>").ok).toBe(false);
  });

  it("기록의 pid 는 역할 · 포트 · 생성 시각이 모두 맞을 때만 우리 프로세스로 본다", () => {
    const since = Date.parse("2026-09-30T08:00:00Z");
    const serve = '"C:\\Program Files\\nodejs\\node.exe" "E:\\lm\\scripts\\app-parity.cjs" "serve" "--port=8081" "--log=x"';
    // 09-29 판 감독자의 실제 명령줄(npm run localhost 가 만든 것, --port 없음 - 2026-09-30 실측)
    const oldStyle = "node  scripts/app-parity.cjs localhost";
    expect(isRoleProcess({ cmd: serve, created: since - 1000 }, "supervisor", 8081, since)).toBe(true);
    expect(isRoleProcess({ cmd: oldStyle, created: null }, "supervisor", 8081, since)).toBe(true);
    expect(isRoleProcess({ cmd: oldStyle, created: null }, "supervisor", 8082, since)).toBe(false);
    expect(isRoleProcess({ cmd: serve, created: since + 10 * 60 * 1000 }, "supervisor", 8081, since)).toBe(false); // pid 재사용
    expect(isRoleProcess({ cmd: serve.replace("8081", "8082"), created: null }, "supervisor", 8081, since)).toBe(false);
    expect(isRoleProcess({ cmd: 'node "E:\\x\\app-parity.cjs" status', created: null }, "supervisor", 8081, since)).toBe(false);
    expect(isRoleProcess({ cmd: 'cmd.exe /d /s /c "npx.cmd expo start --port 8081 --no-dev"', created: null }, "child", 8081, since)).toBe(true);
    expect(isRoleProcess({ cmd: "node scripts/app-parity.cjs localhost", created: null }, "launcher", 8081, since)).toBe(true);
    expect(isRoleProcess(null, "supervisor", 8081, since)).toBe(false);
  });
});

describe("app-parity: 새 스크립트의 preflight", () => {
  it("후보를 임시 파일로 꺼내 돌려도 모듈은 그 워크트리의 설치(node_modules)에서 찾는다", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "app-parity-preflight-"));
    const G2 = (...args: string[]) =>
      execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...args], {
        cwd: repo,
        encoding: "utf8",
      }).trim();
    try {
      G2("init", "-q");
      fs.mkdirSync(path.join(repo, "scripts"));
      fs.writeFileSync(
        path.join(repo, "scripts", "app-parity.cjs"),
        `const v = require("app-parity-fake-dep");\nconsole.log(JSON.stringify({ appParityPreflight: ${APP_PARITY_PROTOCOL}, ok: v === 42, reasons: [] }));\n`,
      );
      G2("add", "-A");
      G2("commit", "-q", "-m", "c");
      const sha = G2("rev-parse", "HEAD");
      expect(runPreflight(repo, 1, sha).ok).toBe(false); // 설치에 없으면 못 찾는다
      fs.mkdirSync(path.join(repo, "node_modules", "app-parity-fake-dep"), { recursive: true });
      fs.writeFileSync(path.join(repo, "node_modules", "app-parity-fake-dep", "index.js"), "module.exports = 42;\n");
      expect(runPreflight(repo, 1, sha).ok).toBe(true);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("app-parity: 세션과 분리된 기동(Windows)", () => {
  it("PowerShell 작은따옴표를 두 번 써서 가둔다", () => {
    expect(psQuote("it's")).toBe("'it''s'");
  });

  it("WMI 로 숨긴 창에 띄우고, cmd 의 따옴표 규칙을 /s 와 바깥 한 겹으로 피한 명령줄을 그대로 넘긴다", () => {
    const cmd = 'cmd.exe /d /s /c ""C:\\Program Files\\nodejs\\node.exe" "E:\\x\\app-parity.cjs" "serve" > "E:\\l.log" 2>&1"';
    const ps = winLaunchScript(cmd, "E:\\it's");
    expect(ps).toContain("Invoke-CimMethod -ClassName Win32_Process -MethodName Create");
    expect(ps).toContain("ShowWindow = [uint16]0");
    expect(ps).toContain("ProcessStartupInformation = $si");
    expect(ps).toContain(`CommandLine = '${cmd}'`);
    expect(ps).toContain("CurrentDirectory = 'E:\\it''s'");
  });
});

describe("app-parity: 감독자가 origin/main 을 따라간다(실제 git 저장소)", () => {
  jest.setTimeout(240000);
  const WF = [
    "on:",
    "  push:",
    "    paths:",
    '      - "src/**"',
    '      - "package.json"',
    '      - "package-lock.json"',
    '      - ".github/workflows/android-release.yml"',
    "jobs:",
    "  build:",
    "    env:",
    "      EXPO_PUBLIC_A: \"${{ vars.A || 'a' }}\"",
    '      EXPO_PUBLIC_B: "lit"',
    "",
  ].join("\n");
  const PREFLIGHT_OK = `console.log(JSON.stringify({ appParityPreflight: ${APP_PARITY_PROTOCOL}, ok: true, reasons: [], ref: process.argv.find((a) => a.startsWith("--ref=")) }));\n`;
  const lockOf = (v: string) => JSON.stringify({ packages: { "": {}, "node_modules/x": { version: v } } });
  const G = (cwd: string, ...args: string[]) =>
    execFileSync(
      "git",
      ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...args],
      { cwd, encoding: "utf8" },
    ).trim();
  let tmp = "";
  let dev = "";
  let lm = "";
  let vars: Record<string, string> = {};
  let newSupervisorOk = true;
  let otherSupervisorUp = false;
  const calls: unknown[][] = [];
  const startedAt: string[] = []; // 서버를 띄운 순간의 체크아웃(Metro 가 내보낼 디스크)
  const ctx: Record<string, unknown> = {};
  const deps = {
    loadVars: () => vars,
    killTree: (pid: number) => calls.push(["kill", pid]),
    waitPort: async () => true,
    startChild: (c: Record<string, unknown>, clear: boolean) => {
      calls.push(["start", clear]);
      startedAt.push(G(lm, "rev-parse", "HEAD"));
      const child = { pid: 1000 + calls.length };
      c.child = child;
      return child;
    },
    launchDetached: (_cwd: string, args: string[]) => {
      calls.push(["launch", args[0]]);
      return 1;
    },
    newLogFile: () => "log",
    runPreflight: (r: string, p: number, ref: string) => {
      const res = runPreflight(r, p, ref);
      calls.push(["preflight", res.ok]);
      return res;
    },
    waitNewSupervisor: async () => newSupervisorOk,
    otherSupervisor: () => otherSupervisorUp,
    writeMarker: (_port: number, patch: Record<string, unknown>) => calls.push(["marker", patch]),
    removeMarker: () => calls.push(["unmark"]),
    // 되돌린 기록이 다시 띄운 서버를 가리키는지 본다(childPid 가 비면 감독자가 죽은 뒤 서버를 못 찾는다)
    restoreMarker: (c: Record<string, unknown>, extra: Record<string, unknown>) =>
      calls.push(["restore", (c.child as { pid: number } | null)?.pid ?? null, Boolean(extra && extra.lastSyncAt)]),
    exit: (code: number) => calls.push(["exit", code]),
    log: () => undefined,
  };
  const put = (rel: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(dev, rel)), { recursive: true });
    fs.writeFileSync(path.join(dev, rel), text);
  };
  const push = (msg: string) => {
    G(dev, "add", "-A");
    G(dev, "commit", "-q", "-m", msg);
    G(dev, "push", "-q", "origin", "HEAD:main");
    return G(dev, "rev-parse", "HEAD");
  };
  const lmHead = () => G(lm, "rev-parse", "HEAD");
  const tick = async () => {
    calls.length = 0;
    return followTick(ctx, deps);
  };
  const installed = (v: string) =>
    fs.writeFileSync(path.join(lm, "node_modules", ".package-lock.json"), JSON.stringify({ packages: { "node_modules/x": { version: v } } }));

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "app-parity-follow-"));
    dev = path.join(tmp, "dev");
    lm = path.join(tmp, "lm");
    const origin = path.join(tmp, "origin.git");
    fs.mkdirSync(dev);
    G(dev, "init", "-q");
    G(dev, "checkout", "-q", "-b", "main");
    put(".github/workflows/android-release.yml", WF);
    put("src/a.ts", "export const a = 1;\n");
    put("package-lock.json", lockOf("1.0.0"));
    put("scripts/app-parity.cjs", "// v1\n");
    put("docs/n.md", "n1\n");
    G(dev, "add", "-A");
    G(dev, "commit", "-q", "-m", "c1");
    G(tmp, "clone", "-q", "--bare", dev, origin);
    G(dev, "remote", "add", "origin", origin);
    G(tmp, "clone", "-q", origin, lm);
    G(lm, "config", "core.autocrlf", "false");
    G(lm, "checkout", "-q", "--detach", "origin/main");
    fs.mkdirSync(path.join(lm, "node_modules"));
    fs.writeFileSync(path.join(lm, ".git", "info", "exclude"), "node_modules/\n");
    installed("1.0.0");
    const env = appEnv(WF, {});
    Object.assign(ctx, {
      root: lm,
      port: 1,
      paths: parseAndroidReleaseWorkflow(WF).paths,
      env,
      digest: envDigest(env),
      child: { pid: 7 },
      servedSha: lmHead(),
    });
  });

  afterAll(() => {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("이미 origin/main 이면 아무것도 하지 않는다", async () => {
    expect(await tick()).toEqual({ action: "none" });
    expect(calls.filter((c) => c[0] !== "marker")).toEqual([]);
  });

  it("문서만 바뀌면 서버를 두고 체크아웃만 옮긴다", async () => {
    put("docs/n.md", "n2\n");
    const sha = push("docs");
    expect(await tick()).toEqual({ action: "checkout" });
    expect(lmHead()).toBe(sha);
    expect(ctx.servedSha).toBe(sha);
    expect(calls.some((c) => c[0] === "kill" || c[0] === "start")).toBe(false);
  });

  it("체크아웃이 실패하면(미추적 파일 충돌) 서버를 건드리지 않고 보류한다", async () => {
    const was = lmHead();
    fs.writeFileSync(path.join(lm, "docs", "new.md"), "local\n"); // 앱 경로 밖 미추적 파일
    put("docs/new.md", "remote\n");
    push("docs new");
    const plan = await tick();
    expect(plan.action).toBe("hold");
    expect(plan.reason).toMatch(/체크아웃 실패/);
    expect(lmHead()).toBe(was);
    expect(calls.some((c) => c[0] === "kill")).toBe(false);
    fs.rmSync(path.join(lm, "docs", "new.md"));
    expect(await tick()).toEqual({ action: "checkout" });
  });

  it("앱 코드가 바뀌면 체크아웃한 뒤 옛 서버를 멈추고 다시 띄운다(캐시는 둔다)", async () => {
    put("src/a.ts", "export const a = 2;\n");
    const sha = push("app");
    expect(await tick()).toEqual({ action: "restart", clear: false });
    expect(lmHead()).toBe(sha);
    expect(calls).toEqual(expect.arrayContaining([["kill", 7], ["start", false]]));
  });

  it("빌드 설정(워크플로 env)이 바뀌면 캐시를 비우고 새 값으로 다시 띄운다", async () => {
    put(".github/workflows/android-release.yml", WF.replace('"lit"', '"lit2"'));
    const sha = push("env");
    const before = ctx.digest;
    expect(await tick()).toEqual({ action: "restart", clear: true });
    expect(lmHead()).toBe(sha);
    expect(ctx.digest).not.toBe(before);
    expect((ctx.env as Record<string, string>).EXPO_PUBLIC_B).toBe("lit2");
  });

  it("커밋 없이 저장소 Variables 만 바뀌어도 새 값으로 다시 띄운다", async () => {
    vars = { A: "from-vars" };
    expect(await tick()).toEqual({ action: "restart", clear: true });
    expect((ctx.env as Record<string, string>).EXPO_PUBLIC_A).toBe("from-vars");
  });

  it("main 의 lockfile 과 설치가 다르면 따라가지 않고, 설치가 맞춰지면 따라간다", async () => {
    const was = lmHead();
    put("package-lock.json", lockOf("2.0.0"));
    put("src/a.ts", "export const a = 3;\n");
    const sha = push("deps");
    expect((await tick()).action).toBe("hold");
    expect(lmHead()).toBe(was);
    expect(calls.some((c) => c[0] === "kill")).toBe(false);
    installed("2.0.0");
    expect(await tick()).toEqual({ action: "restart", clear: false });
    expect(lmHead()).toBe(sha);
  });

  it("보류하는 동안 누가 체크아웃을 머지 안 된 커밋으로 옮겨 놓으면 띄운 커밋으로 되돌린다", async () => {
    const served = lmHead();
    expect(ctx.servedSha).toBe(served);
    put("package-lock.json", lockOf("3.0.0")); // main 이 설치와 달라져 보류할 상황
    put("src/a.ts", "export const a = 5;\n");
    const sha = push("deps 3");
    fs.writeFileSync(path.join(lm, "src", "a.ts"), "export const a = 'UNMERGED';\n");
    G(lm, "commit", "-q", "-am", "unmerged feature"); // 깨끗한 작업 트리 · 옮겨진 HEAD
    expect(lmHead()).not.toBe(served);
    const plan = await tick();
    expect(plan.action).toBe("hold");
    expect(lmHead()).toBe(served);
    expect(fs.readFileSync(path.join(lm, "src", "a.ts"), "utf8")).toBe(`${G(lm, "show", `${served}:src/a.ts`)}\n`);
    expect(calls.some((c) => c[0] === "kill")).toBe(false); // 되돌렸으니 서버는 그대로 둔다
    installed("3.0.0");
    expect((await tick()).action).toBe("restart");
    expect(lmHead()).toBe(sha);
  });

  it("편집 금지 워크트리가 더러우면(미추적 앱 파일 포함) 8081 을 멈추고, 깨끗해지면 다시 띄워 따라간다", async () => {
    const running = (ctx.child as { pid: number }).pid;
    fs.writeFileSync(path.join(lm, "src", "gen.ts"), "export const g = 1;\n");
    put("src/a.ts", "export const a = 4;\n");
    const sha = push("app 4");
    const held = await tick();
    expect(held.action).toBe("hold");
    expect(held.reason).toMatch(/8081 을 멈췄다/);
    expect(calls).toEqual(expect.arrayContaining([["kill", running]]));
    expect(ctx.child).toBeNull();
    fs.rmSync(path.join(lm, "src", "gen.ts"));
    expect((await tick()).action).toBe("restart");
    expect(calls.filter((c) => c[0] === "start").length).toBe(2); // 멈췄던 서버를 되살린 뒤 새 커밋으로 다시 띄운다
    expect(lmHead()).toBe(sha);
  });

  it("누가 체크아웃을 옮겨 놓으면 origin/main 으로 되돌려 다시 띄운다", async () => {
    const main = lmHead();
    G(lm, "checkout", "-q", "--detach", "HEAD~1");
    expect((await tick()).action).toBe("restart");
    expect(lmHead()).toBe(main);
  });

  it("멈춘 사이 누가 그 변경을 커밋해 체크아웃이 옮겨졌으면, 띄운 커밋으로 되돌린 뒤에 서버를 되살린다", async () => {
    const served = ctx.servedSha as string;
    fs.writeFileSync(path.join(lm, "src", "gen2.ts"), "export const g = 2;\n");
    expect((await tick()).action).toBe("hold"); // 더러워서 멈췄다
    G(lm, "add", "-A");
    G(lm, "commit", "-q", "-m", "local edit"); // 깨끗해졌지만 HEAD 가 main 에 없는 커밋이다
    startedAt.length = 0;
    await tick();
    expect(startedAt[0]).toBe(served);
    expect(lmHead()).toBe(served);
  });

  it("해석 못 하는 빌드 설정이 main 에 들어오면 따라가지 않는다", async () => {
    const was = lmHead();
    put(".github/workflows/android-release.yml", WF.replace('"lit"', '"${{ secrets.X }}"'));
    push("bad env");
    expect((await tick()).action).toBe("hold");
    expect(lmHead()).toBe(was);
    put(".github/workflows/android-release.yml", WF.replace('"lit"', '"lit2"'));
    const sha = push("env back");
    // 지금 띄운 커밋과 비교하면 앱 경로 순변화가 없다 - 서버는 그대로 두고 체크아웃만 옮긴다
    expect((await tick()).action).toBe("checkout");
    expect(lmHead()).toBe(sha);
  });

  it("새 스크립트의 preflight 가 거부하면 체크아웃도 서버도 건드리지 않고, 같은 main 에는 다시 묻지 않는다", async () => {
    const was = lmHead();
    put("scripts/app-parity.cjs", "// v2 - preflight 를 모른다\n");
    push("script without preflight");
    const plan = await tick();
    expect(plan.action).toBe("hold");
    expect(plan.reason).toMatch(/새 스크립트가 거부했다/);
    expect(lmHead()).toBe(was);
    expect(calls).toEqual(expect.arrayContaining([["preflight", false]]));
    expect(calls.some((c) => c[0] === "kill" || c[0] === "launch")).toBe(false);
    expect((await tick()).action).toBe("hold");
    expect(calls.some((c) => c[0] === "preflight")).toBe(false); // 기억한 거부
    // 기억은 시간이 지나면 풀린다(일시적인 gh · 네트워크 실패가 다음 머지까지 굳지 않게)
    (ctx.refused as { at: number }).at = Date.now() - REFUSAL_TTL_MS - 1000;
    expect((await tick()).action).toBe("hold");
    expect(calls).toEqual(expect.arrayContaining([["preflight", false]]));
  });

  it("새 감독자가 넘겨받지 못하면 띄운 것을 멈추고 옛 커밋 · 옛 서버로 되돌린 뒤, 한동안 다시 시도하지 않는다", async () => {
    const was = lmHead();
    put("scripts/app-parity.cjs", PREFLIGHT_OK);
    push("script");
    newSupervisorOk = false;
    const plan = await tick();
    newSupervisorOk = true;
    expect(plan.action).toBe("hold");
    expect(plan.reason).toMatch(/되돌렸다/);
    expect(lmHead()).toBe(was);
    expect(calls).toEqual(expect.arrayContaining([["preflight", true], ["launch", "serve"], ["kill", 1]]));
    expect(calls.some((c) => c[0] === "exit")).toBe(false);
    // 서버를 먼저 띄우고 기록을 쓴다 - 기록이 새 서버의 pid 와 다시 띄운 시각을 담는다
    const start = calls.findIndex((c) => c[0] === "start");
    const restore = calls.find((c) => c[0] === "restore");
    expect(start).toBeGreaterThan(-1);
    expect(start).toBeLessThan(calls.indexOf(restore as unknown[]));
    expect(restore).toEqual(["restore", (ctx.child as { pid: number }).pid, true]);
    // 같은 스크립트로는 한동안 다시 넘기지 않는다(시도할 때마다 8081 이 꺼지므로)
    const again = await tick();
    expect(again.action).toBe("hold");
    expect(calls.some((c) => c[0] === "preflight" || c[0] === "kill" || c[0] === "launch")).toBe(false);
  });

  it("넘겨주기를 기다리는 사이 다른 감독자가 8081 을 맡았으면 다투지 않고 물러난다", async () => {
    (ctx.handover as { until: number }).until = 0; // 다시 시도할 때가 됐다
    newSupervisorOk = false;
    otherSupervisorUp = true;
    await tick();
    newSupervisorOk = true;
    otherSupervisorUp = false;
    expect(calls).toEqual(expect.arrayContaining([["launch", "serve"], ["kill", 1], ["exit", 0]]));
    expect(calls.some((c) => c[0] === "restore" || c[0] === "start")).toBe(false);
  });

  it("새 스크립트의 preflight 가 통과하고 새 감독자가 넘겨받으면 기록을 넘기고 스스로 끝낸다", async () => {
    const sha = G(dev, "rev-parse", "HEAD");
    expect(await tick()).toEqual({ action: "self-update" });
    expect(lmHead()).toBe(sha);
    expect(calls).toEqual(expect.arrayContaining([["preflight", true], ["unmark"], ["launch", "serve"], ["exit", 0]]));
    expect(calls.findIndex((c) => c[0] === "unmark")).toBeLessThan(calls.findIndex((c) => c[0] === "launch"));
    expect(calls.some((c) => c[0] === "start")).toBe(false);
  });
});

describe("app-parity: 규칙이 저장소에 박혀 있다", () => {
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  const script = read("scripts/app-parity.cjs");

  it("localhost 명령은 전부 이 스크립트를 지난다", () => {
    expect(pkg.scripts.localhost).toBe("node scripts/app-parity.cjs localhost");
    expect(pkg.scripts.web).toBe("node scripts/app-parity.cjs localhost --open");
    expect(pkg.scripts["localhost:stop"]).toBe("node scripts/app-parity.cjs stop");
    expect(pkg.scripts["app:parity"]).toBe("node scripts/app-parity.cjs status");
    expect(pkg.scripts["app:qa-release"]).toBe("node scripts/app-parity.cjs qa-release");
    expect(Object.values(pkg.scripts).join("\n")).not.toMatch(/expo start --web/);
  });

  it("Simon 이 보는 포트와 전용 워크트리가 정해져 있고, 스크립트는 값을 복사해 두지 않는다", () => {
    expect(SIMON_PORT).toBe(8081);
    expect(LOCALHOST_WORKTREE).toBe("localhost-main");
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
    const section = claude.slice(rule, claude.indexOf("## Project context"));
    for (const needle of ["origin/main", "npm run localhost", "npm run app:parity", "npm run app:qa-release", "localhost-main", "폰에서 볼 때만"]) {
      expect(section).toContain(needle);
    }
    expect(read("AGENTS.md")).toContain("앱과 localhost 는 같은 소프트웨어다");
  });
});
