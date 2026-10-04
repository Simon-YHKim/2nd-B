#!/usr/bin/env node
// 앱과 localhost 는 같은 소프트웨어다 (Simon 결정 2026-09-29 · 갱신 2026-09-30).
//
// 기준은 origin/main 이다. main 에 머지된 앱 변경마다 CI(android-release.yml)가 그 코드를 그 파일의
// jobs.build.env 로 APK 로 빌드하고, 쓴 EXPO_PUBLIC_* 의 digest · ABI 를 run 주석(app-env-digest ·
// app-apk-abi)으로 남긴다. localhost 가 origin/main 을 같은 값 · 같은 릴리스 모드 · 같은 의존성으로
// 띄우면 그 APK 와 같은 소프트웨어다. 폰에 게시(QA pre-release)하는 것은 볼 때만 한다
// (Simon 2026-09-30: "매번 apk 발행은 너무 헤비 … 코드 수정만 해놓으면 안돼?").
// 빌드는 main 이 도중에 움직이면(문서 머지 포함) 게이트('Gate/Recheck current main')에서 스스로 끊긴다.
// 대기 중인 빌드도 끊길 것이 확실하면 '빌드 중' 으로 세지 않는다. 그러면 같은 코드의 APK 가 없을 수
// 있어서 app:parity 가 알리고 다시 빌드하는 명령을 안내한다.
//
//   npm run localhost        8081 을 보장한다. 전용 워크트리 .worktrees/localhost-main(없으면 만든다)의
//                            origin/main 스크립트에게 preflight 를 먼저 물어(체크아웃을 옮기지 않고),
//                            통과하면 옮기고 세션과 분리된 감독자를 띄운다. 감독자는 60초마다
//                            origin/main 을 따라간다. 이미 따라가는 중이면 그대로 둔다(--restart 로 강제).
//   npm run web              위와 같고 브라우저까지 연다.
//   npm run localhost:stop   8081 감독자를 멈춘다.
//   npm run app:parity       8081 의 코드 · 설정 · 의존성을 origin/main 과 대조하고, 같은 코드 · 같은 설정의
//                            폰용(arm64) APK 빌드가 있는지 본다. 폰 QA APK 가 뒤처졌는지는 참고로만 알려 준다.
//   npm run app:qa-release   폰에서 볼 때만: origin/main 의 APK 를 QA pre-release 로 올린다(같은 설정의
//                            빌드가 없으면 기본 입력으로 새로 빌드한다).
//   node scripts/app-parity.cjs serve --port=8082 --allow-diff [--tier=brain]
//                            세션 자체 확인용 서버(앱 화면이 아니다). 8081 의 serve 는 감독자 전용이다.
//   node scripts/app-parity.cjs preflight [--ref=<sha>]
//                            그 커밋으로 8081 을 띄울 수 있는가(감독자 교체 전에 새 스크립트가 스스로 판정).
//
// 설정의 정본은 .github/workflows/android-release.yml 하나다. 폰 APK 는 그 파일의 jobs.build.env 로
// 빌드되고, 그 파일의 on.push.paths 가 '앱에 들어가는 파일' 이다. 이 스크립트는 둘을 실행할 때마다 그
// 파일에서 읽는다. 값을 여기 복사해 두지 않는다 - 복사본은 반드시 갈라진다.
//
// 왜 필요했나 (2026-09-29 실측): Simon 이 보던 localhost 는 다른 워크트리의 개발 서버였다. main 보다
// 뒤처진 기반 위에 미커밋 파일 586개, 워크트리 .env 의 EXPO_PUBLIC_FORCE_TIER 로 유료 등급 강제,
// 개발 모드. 같은 앱처럼 보였지만 코드 · 설정 · 모드가 모두 폰 APK 와 달랐다.
"use strict";

const { spawn, spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const REPO = "Simon-YHKim/2nd-B";
const WORKFLOW = ".github/workflows/android-release.yml";
const MAIN_REF = "origin/main";
// Simon 이 브라우저로 보는 자리. origin/main 에 있는 코드만 띄운다.
const SIMON_PORT = 8081;
// 8081 을 띄우는 전용 워크트리. origin/main 을 detached 로 따라가고, 사람이 편집하지 않는다.
const LOCALHOST_WORKTREE = "localhost-main";
const FOLLOW_INTERVAL_MS = 60 * 1000;
const SELF = "scripts/app-parity.cjs";
const TIERS = ["off", "free", "soma", "cortex", "brain"];
// preflight 가 내는 약속의 판. 감독자는 이 판 이상을 내는 스크립트로만 갈아탄다(되돌림 · 머지 전 보호).
// 판 2 의 약속: `preflight [--ref=<sha>]` 가 마지막 줄에 {appParityPreflight, ok, reasons} JSON 을 낸다.
const APP_PARITY_PROTOCOL = 2;
// CI 가 run 주석으로 남기는 값의 제목(android-release.yml 의 한 단계와 짝).
const DIGEST_ANNOTATION = "app-env-digest";
const ABI_ANNOTATION = "app-apk-abi";
// 폰에 까는 APK 의 ABI. 에뮬레이터용 x86_64 빌드는 설정이 같아도 폰 앱이 아니다.
const PHONE_ABI = "arm64-v8a";
// main 이 도중에 움직여 빌드가 스스로 끊기는 단계(android-release.yml).
const GATE_STEP = /^(Gate|Recheck) current main\b/;
// 8081 이 캐시를 비우고 번들링하는 동안(CPU 가득) gh 호출 하나가 40~60초를 넘긴 적이 있다(2026-09-30 실측).
const NET_TIMEOUT_MS = 120 * 1000;
// 새 스크립트의 거부는 이만큼 기억한다(일시적인 gh · 네트워크 실패가 다음 머지까지 굳지 않게).
const REFUSAL_TTL_MS = 10 * 60 * 1000;
// 새 감독자가 기록을 쓸 때까지 기다리는 시간. 기록 전에 gh · git fetch 를 하고 각각 상한이 NET_TIMEOUT_MS 다.
const HANDOVER_WAIT_MS = 2 * NET_TIMEOUT_MS + 30 * 1000;
// 넘겨주기에 실패하면 그 스크립트로는 이만큼 뒤에 다시 시도한다(실패할 때마다 두 배, 상한 4시간).
const HANDOVER_BACKOFF_MS = 10 * 60 * 1000;
const HANDOVER_BACKOFF_MAX_MS = 4 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// android-release.yml 읽기
// ---------------------------------------------------------------------------

/**
 * on.push.paths 목록, jobs.build.env 항목(원문 값), 마지막 게이트 단계 이름을 읽는다. 모르는 모양이면
 * 멈춘다. 마지막 게이트를 지난 빌드는 main 이 움직여도 끝까지 간다.
 */
function parseAndroidReleaseWorkflow(text) {
  const doc = require("yaml").parse(String(text));
  const paths = doc && doc.on && doc.on.push && doc.on.push.paths;
  if (!Array.isArray(paths) || paths.length === 0) throw new Error(`${WORKFLOW}: on.push.paths 를 찾지 못했다`);
  const block = doc.jobs && doc.jobs.build && doc.jobs.build.env;
  if (!block || typeof block !== "object") throw new Error(`${WORKFLOW}: jobs.build.env 를 찾지 못했다`);
  const env = Object.entries(block).map(([key, raw]) => ({ key, raw: raw === null ? "" : String(raw) }));
  if (env.length === 0) throw new Error(`${WORKFLOW}: jobs.build.env 가 비어 있다`);
  const gates = (Array.isArray(doc.jobs.build.steps) ? doc.jobs.build.steps : [])
    .map((s) => String((s && s.name) || ""))
    .filter((n) => GATE_STEP.test(n));
  return { paths: paths.map(String), env, lastGate: gates.length ? gates[gates.length - 1] : null };
}

/**
 * 워크플로 env 값 하나를 GitHub Actions 와 같은 뜻으로 푼다. `vars` 는 저장소 Variables.
 * 폰 APK 는 main push 로 빌드되므로 `inputs.*` 는 비어 있다(= `&&` 쪽이 거짓).
 * 여기 없는 식이 나오면 같은 값을 보장할 수 없으므로 멈춘다.
 */
function resolveEnvValue(key, raw, vars) {
  const text = String(raw);
  const expr = text.trim().match(/^\$\{\{\s*(.*?)\s*\}\}$/);
  if (!expr) {
    if (text.includes("${{")) throw new Error(`${key}: 문자열 안에 섞인 식은 해석하지 않는다: ${text}`);
    return text;
  }
  const body = expr[1];
  const v = vars || {};
  let m = body.match(/^vars\.([A-Za-z0-9_]+)\s*\|\|\s*'([^']*)'$/);
  if (m) return v[m[1]] ? String(v[m[1]]) : m[2];
  m = body.match(/^vars\.([A-Za-z0-9_]+)$/);
  if (m) return v[m[1]] ? String(v[m[1]]) : "";
  m = body.match(/^inputs\.[A-Za-z0-9_]+\s*&&\s*'([^']*)'\s*\|\|\s*'([^']*)'$/);
  if (m) return m[2];
  throw new Error(
    `${key}: ${WORKFLOW} 의 식 '\${{ ${body} }}' 을 해석하지 못했다 - 앱과 같은 값을 보장할 수 없어 멈춘다. ` +
      "scripts/app-parity.cjs 의 resolveEnvValue 에 그 식을 추가할 것.",
  );
}

/** 폰 APK 번들에 들어가는 EXPO_PUBLIC_* 값 전부. */
function appEnv(workflowText, vars) {
  const out = {};
  for (const { key, raw } of parseAndroidReleaseWorkflow(workflowText).env) {
    if (key.startsWith("EXPO_PUBLIC_")) out[key] = resolveEnvValue(key, raw, vars);
  }
  return out;
}

/** 정렬한 `KEY=value\n` 줄들의 sha256. android-release.yml 의 digest 단계와 같은 계산이다. */
function envDigest(env) {
  const body = Object.keys(env)
    .sort()
    .map((k) => `${k}=${env[k]}\n`)
    .join("");
  return crypto.createHash("sha256").update(body).digest("hex");
}

/** git 경로가 워크플로의 on.push.paths(앱 경로)에 걸리는가. */
function isAppPath(file, paths) {
  const f = String(file).replace(/\\/g, "/");
  return paths.some((p) => (p.endsWith("/**") ? f.startsWith(p.slice(0, -2)) : f === p));
}

/** `git status --porcelain -z` 출력의 항목(상태 두 글자 + 경로, 이름 바꾸기는 새 이름). */
function porcelainEntries(out) {
  const parts = String(out).split("\0");
  const entries = [];
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (entry.length < 4) continue;
    entries.push({ code: entry.slice(0, 2), file: entry.slice(3) });
    if (entry[0] === "R" || entry[0] === "C") i++; // 다음 칸은 옛 이름
  }
  return entries;
}
const parsePorcelainZ = (out) => porcelainEntries(out).map((e) => e.file);

/**
 * 전용 워크트리를 더럽히는 것: 추적 파일의 모든 변경 + 앱 경로의 미추적 파일. serve · preflight ·
 * 감독자가 모두 이 한 정의를 쓴다(따로 두면 감독자는 통과시키고 새 serve 는 거부해 8081 이 꺼진다).
 */
function dirtyFiles(entries, paths) {
  return entries.filter((e) => e.code !== "??" || isAppPath(e.file, paths)).map((e) => e.file);
}

/**
 * lockfile 의 packages 와 설치(node_modules/.package-lock.json)의 packages 를 이름 · 버전으로 대조한다.
 * 폰 APK 는 CI 에서 `npm ci` 로 lockfile 그대로 설치해 번들을 만든다. 다른 플랫폼용 optional 은 원래
 * 안 깔리므로 없어도 된다.
 */
function lockDrift(lockPackages, installedPackages) {
  const lock = lockPackages || {};
  const inst = installedPackages || {};
  const out = [];
  for (const [k, v] of Object.entries(lock)) {
    if (!k.startsWith("node_modules/")) continue;
    const i = inst[k];
    if (!i) {
      if (!v.optional) out.push(`${k.slice(13)} 없음`);
    } else if (i.version !== v.version) {
      out.push(`${k.slice(13)} ${i.version} (lock ${v.version})`);
    }
  }
  for (const k of Object.keys(inst)) if (k.startsWith("node_modules/") && !lock[k]) out.push(`${k.slice(13)} 여분`);
  return out;
}

/**
 * patch-package 패치 하나가 설치에 적용돼 있는가(내용으로 본다). 그 패치가 더한 줄 중 충분히 긴 것
 * (공백 빼고 8자 이상)이 대상 파일에 모두 있어야 한다. readTarget(rel) 은 파일 내용이나 null.
 * 버전이 같으면 lockfile 대조로는 안 보이는데, CI 는 새 패치를 적용한다.
 */
function patchProblems(patchName, patchText, readTarget) {
  const problems = [];
  for (const [target, added] of patchAddedLines(patchText)) {
    const body = readTarget(target);
    if (body === null) {
      problems.push(`${patchName}: ${target} 이 설치에 없다`);
      continue;
    }
    const text = body.replace(/\r\n/g, "\n");
    const missing = added.filter((l) => !text.includes(l));
    if (missing.length) problems.push(`${patchName}: ${target} 에 패치가 적용돼 있지 않다(${missing.length}줄)`);
  }
  return problems;
}

/** 패치 원문에서 대상 파일마다 '더한 줄'(공백 빼고 8자 이상)을 모은다. */
function patchAddedLines(patchText) {
  const out = new Map();
  let target = null;
  for (const line of String(patchText).replace(/\r\n/g, "\n").split("\n")) {
    if (line.startsWith("diff --git ")) {
      target = null;
    } else if (line.startsWith("+++ ")) {
      const p = line.slice(4).trim();
      target = p === "/dev/null" ? null : p.replace(/^b\//, "");
      if (target && !out.has(target)) out.set(target, []);
    } else if (line.startsWith("+") && target) {
      const l = line.slice(1);
      if (l.trim().length >= 8) out.get(target).push(l);
    }
  }
  return out;
}

/**
 * patch-package 파일 이름의 설치 경로와 버전. `@scope+name+1.2.3.patch` · `a++b+1.0.0.patch`(a 안의 b) ·
 * `x+1.0.0+001+desc.patch`(순서 붙은 패치). 모르는 모양이면 null.
 */
function patchPackageOf(name) {
  const base = String(name).replace(/\\/g, "/").split("/").pop().replace(/\.patch$/, "");
  const parts = base.split("++");
  const m = parts.pop().match(/^(@[^+]+\+[^+]+|[^+]+)\+([^+]+)(?:\+.*)?$/);
  if (!m) return null;
  const names = [...parts, m[1]].map((n) => n.replace(/^(@[^+]+)\+/, "$1/"));
  return { dir: names.map((n) => `node_modules/${n}`).join("/"), version: m[2] };
}

/**
 * main 에 없는 옛 패치(지운 것 · 고치기 전 판)가 설치에 남아 있는가. 설치된 버전이 그 패치의 버전과 같을
 * 때만 본다 - 버전이 다르면 원본부터 달라(윗선이 그 수정을 받아들였을 수도 있다) lockfile 대조가 맡는다.
 * 옛 패치만 더했던 줄이 대상 파일에 줄 그대로 모두 있으면 옛 패치가 적용된 설치다. CI 는 main 의
 * 패치만 적용하므로 그 설치로 띄운 localhost 는 APK 와 다르다.
 * current · history = [{ name, text }], installedVersion(dir) = 버전 | null.
 */
function stalePatchProblems(current, history, readTarget, installedVersion) {
  const keep = new Map(); // 대상 파일 → main 의 패치들이 더하는 줄
  for (const p of current) {
    for (const [t, lines] of patchAddedLines(p.text)) keep.set(t, new Set([...(keep.get(t) || []), ...lines]));
  }
  const problems = [];
  for (const h of history) {
    const pkg = patchPackageOf(h.name);
    if (!pkg || installedVersion(pkg.dir) !== pkg.version) continue;
    for (const [target, added] of patchAddedLines(h.text)) {
      const only = added.filter((l) => !(keep.get(target) || new Set()).has(l));
      if (!only.length) continue;
      const body = readTarget(target);
      if (body === null) continue;
      const lines = new Set(body.replace(/\r\n/g, "\n").split("\n"));
      const msg = `${h.name}: main 에 없는 옛 패치가 ${target} 에 남아 있다`;
      if (only.every((l) => lines.has(l)) && !problems.includes(msg)) problems.push(msg);
    }
  }
  return problems;
}

const FAILED_CONCLUSIONS = new Set(["failure", "timed_out", "startup_failure"]);

/**
 * 그 코드 · 그 설정의 폰용 APK 빌드 상태. `runs` 는 android-release 런(push · workflow_dispatch),
 * `sameCode(sha)` 는 앱 경로에서 같은 코드인가, `configOf(run)` 는 "match" | "mismatch" | "unknown" |
 * "skip"(폰용이 아닌 ABI), `supersededOf(run)` 은 main 이 움직여 게이트에서 끊긴 실패인가,
 * `doomedOf(run)` 은 진행 중인데 main 이 이미 움직여 게이트에서 끊길 것이 확실한가.
 *   success     같은 코드 · 같은 설정의 성공 빌드가 있다(unknown 설정은 push 런만 인정 - digest 이전 빌드)
 *   running     같은 코드 · 같은 설정이 될 폰용 빌드가 진행 중이다(수동 빌드는 주석이 같다고 말해야 한다)
 *   unconfirmed 같은 코드의 수동 빌드가 진행 중인데 설정 · ABI 주석이 아직 없다
 *   stale       같은 코드의 빌드가 있지만 설정이 다르다(저장소 Variables 가 빌드 뒤 바뀜 등)
 *   failure     같은 코드의 폰용 빌드가 실패했다(게이트가 아닌 곳에서)
 *   superseded  같은 코드의 빌드가 main 이 움직여 게이트에서 끊겼다(끊길 것이 확실한 것 포함)
 *   cancelled / none
 */
function classifyBuild(runs, sameCode, configOf = () => "unknown", supersededOf = () => false, doomedOf = () => false) {
  const eq = [...runs]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .filter((r) => sameCode(r.headSha));
  const memo = new Map();
  const cfg = (r) => {
    if (!memo.has(r)) memo.set(r, configOf(r));
    return memo.get(r);
  };
  const done = eq.filter((r) => r.status === "completed" && r.conclusion === "success" && cfg(r) !== "skip");
  let run = done.find((r) => cfg(r) === "match");
  if (run) return { state: "success", run, config: "match" };
  run = done.find((r) => cfg(r) === "unknown" && r.event !== "workflow_dispatch");
  if (run) return { state: "success", run, config: "unknown" };
  // 끝났다고 나와도 결론이 아직 비어 있으면(GitHub 가 정리하는 몇 초) 진행 중으로 본다(2026-09-30 실측: 그
  // 틈에 대조가 '기록 없음' 을 냈다).
  const live = eq.filter((r) => r.status !== "completed" || !r.conclusion);
  const doomed = live.filter((r) => doomedOf(r));
  const alive = live.filter((r) => !doomed.includes(r));
  run = alive.find((r) => cfg(r) === "match" || (cfg(r) === "unknown" && r.event !== "workflow_dispatch"));
  if (run) return { state: "running", run };
  run = alive.find((r) => cfg(r) === "unknown");
  if (run) return { state: "unconfirmed", run };
  run = done.find((r) => cfg(r) === "mismatch") || alive.find((r) => cfg(r) === "mismatch");
  if (run) return { state: "stale", run };
  const failed = eq.filter((r) => FAILED_CONCLUSIONS.has(r.conclusion) && cfg(r) !== "skip");
  run = failed.find((r) => !supersededOf(r));
  if (run) return { state: "failure", run };
  if (doomed.length || failed.length) return { state: "superseded", run: doomed[0] || failed[0] };
  run = done.find((r) => cfg(r) === "unknown"); // 주석이 없는 수동 빌드(digest 단계 이전) - 폰용인지 모른다
  if (run) return { state: "unconfirmed", run };
  run = eq.find((r) => r.conclusion === "cancelled");
  if (run) return { state: "cancelled", run };
  return { state: "none", run: null };
}

/**
 * 감독자가 이번 확인에서 할 일. 입력은 전부 관측값이고 결정만 여기서 한다(미커밋 변경은 이 앞에서 따로
 * 처리한다 - 그때는 Metro 를 멈춘다).
 *   hold        따라가면 앱과 다른 것을 띄우게 된다 → 띄운 커밋을 그대로 둔다(체크아웃이 옮겨져 있으면
 *               띄운 커밋으로 되돌리고, 못 되돌리면 멈춘다)
 *   self-update 이 스크립트가 바뀌었다 → 새 스크립트의 preflight 가 통과하면 감독자째 갈아탄다
 *               (설정 · 의존성 판정은 새 스크립트가 한다 - 옛 스크립트가 모르는 식이 새로 들어올 수 있다)
 *   restart     앱 경로 · 빌드 설정이 바뀌었거나 체크아웃이 감독자 모르게 움직였다 → 다시 띄운다
 *               (clear = 설정이 바뀜)
 *   checkout    앱과 무관한 파일만 바뀌었다 → 체크아웃만 옮긴다(서버 유지)
 *   none        이미 origin/main 이다
 */
function planFollow(s) {
  if (s.dirty && s.dirty.length) return { action: "hold", reason: `localhost-main 에 미커밋 변경 ${s.dirty.length}개(편집 금지 워크트리)` };
  if (s.scriptChanged) return { action: "self-update" };
  const moving = s.appDiff.length > 0 || s.envChanged || Boolean(s.headMoved);
  if (moving && s.envError) return { action: "hold", reason: `빌드 설정을 해석하지 못했다: ${s.envError}` };
  if (moving && s.drift.length) {
    return { action: "hold", reason: `설치가 main 과 다르다(${s.drift.length}곳: ${s.drift.slice(0, 3).join(" · ")})` };
  }
  if (moving) return { action: "restart", clear: Boolean(s.envChanged) };
  if (!s.headIsMain) return { action: "checkout" };
  return { action: "none" };
}

/** preflight 출력에서 약속된 JSON 한 줄을 찾는다. 없거나 판이 낮으면 그 스크립트로는 8081 을 못 띄운다. */
function parsePreflight(stdout) {
  for (const line of String(stdout).split(/\r?\n/).reverse()) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      const j = JSON.parse(t);
      if (typeof j.appParityPreflight === "number") {
        if (j.appParityPreflight < APP_PARITY_PROTOCOL) return { ok: false, reasons: [`preflight 판 ${j.appParityPreflight} < ${APP_PARITY_PROTOCOL}`] };
        return { ok: j.ok === true, reasons: Array.isArray(j.reasons) ? j.reasons.map(String) : [], envDigest: j.envDigest || null };
      }
    } catch {
      /* 다른 JSON 줄 */
    }
  }
  return { ok: false, reasons: ["그 스크립트가 preflight 를 모른다(머지 전이거나 되돌려진 판) - 8081 을 넘겨주지 않는다"] };
}

/** zip(APK) 의 중앙 디렉터리에서 항목 이름을 읽는다. 게시 전에 폰용 ABI 인지 직접 확인하려고 쓴다. */
function zipEntryNames(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip 이 아니다(끝 레코드 없음)");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const names = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("zip 중앙 디렉터리가 깨졌다");
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    names.push(buf.toString("utf8", p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

/** APK 에 들어 있는 네이티브 ABI 목록(lib/<abi>/...). */
function apkAbis(names) {
  return [...new Set(names.map((n) => (n.match(/^lib\/([^/]+)\//) || [])[1]).filter(Boolean))].sort();
}

/** PowerShell 작은따옴표 문자열. */
function psQuote(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

/**
 * 세션과 분리된 숨은 프로세스를 띄우는 PowerShell 스크립트. Win32_Process.Create 는 WMI 서비스가 만들므로
 * 부른 쪽(Claude 세션 · 터미널)의 작업 개체에 묶이지 않는다 - 세션이 끝나도 8081 이 산다. 창은 숨긴다
 * (보이는 콘솔 창을 누가 닫으면 8081 이 같이 죽는다).
 */
function winLaunchScript(commandLine, cwd) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$si = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }",
    `$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = ${psQuote(commandLine)}; CurrentDirectory = ${psQuote(cwd)}; ProcessStartupInformation = $si }`,
    "Write-Output ('{0} {1}' -f $r.ReturnValue, $r.ProcessId)",
  ].join("\n");
}

/**
 * 기록의 pid 가 정말 그 역할의 우리 프로세스인가. pid 는 재사용되므로 파일 이름만 보지 않고 역할 · 포트 ·
 * 생성 시각을 본다. info = { cmd, created(ms) | null }, since = 기록 시각(ms) | null.
 */
function isRoleProcess(info, role, port, since) {
  if (!info || !info.cmd) return false;
  const c = info.cmd;
  // 09-29 판 감독자는 `node scripts/app-parity.cjs localhost` 로 --port 없이 8081 을 띄웠다.
  const portOk = c.includes(`--port=${port}`) || (!/--port[= ]/.test(c) && port === SIMON_PORT);
  const ok =
    role === "supervisor"
      ? /app-parity\.cjs"?\s+"?(serve|localhost)\b/.test(c) && portOk
      : role === "launcher"
        ? /app-parity\.cjs"?\s+"?localhost\b/.test(c)
        : c.includes("expo") && c.includes(`--port ${port}`);
  if (!ok) return false;
  // 기록보다 한참 뒤에 생긴 프로세스는 같은 pid 를 물려받은 다른 프로세스다.
  if (since && info.created && info.created > since + 120 * 1000) return false;
  return true;
}

// ---------------------------------------------------------------------------
// 명령 실행 도우미
// ---------------------------------------------------------------------------

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} 실패(${r.status}): ${String(r.stderr || r.stdout).trim().slice(0, 400)}`);
  }
  return String(r.stdout);
}
const git = (args, cwd) => run("git", args, cwd ? { cwd } : {}).trim();
const gitZ = (args, cwd) => run("git", args, cwd ? { cwd } : {}).split("\0").filter(Boolean);
// 네트워크를 타는 명령은 시간 상한을 둔다(멈추면 감독자의 따라가기가 조용히 멈춘다).
const gitNet = (args, cwd) => run("git", args, { cwd, timeout: NET_TIMEOUT_MS }).trim();
const gh = (args) => run("gh", args, { timeout: NET_TIMEOUT_MS }).trim();
// 감독자 · 대조의 fetch 는 백그라운드 유지보수를 끈다(다른 세션의 git 과 잠금을 오래 다투지 않게).
const fetchMain = (cwd) => gitNet(["-c", "gc.auto=0", "-c", "maintenance.auto=false", "fetch", "--quiet", "origin", "main"], cwd);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isAncestor(a, b, cwd) {
  return spawnSync("git", ["merge-base", "--is-ancestor", a, b], { cwd, encoding: "utf8" }).status === 0;
}

function loadRepoVars() {
  const list = JSON.parse(gh(["variable", "list", "--repo", REPO, "--json", "name,value"]) || "[]");
  return Object.fromEntries(list.map((v) => [v.name, v.value]));
}

/** android-release 런(push · workflow_dispatch, main). */
function listBuildRuns() {
  for (let attempt = 0; ; attempt++) {
    const body = JSON.parse(gh(["api", `repos/${REPO}/actions/workflows/android-release.yml/runs?per_page=100`]) || "{}");
    const runs = buildRunsFromApi(body);
    if (runs.some((r) => r.event === "push")) return runs;
    if (attempt >= 2) throw new Error("GitHub 가 android-release 빌드 목록을 비워서 돌려줬다(세 번) - 잠시 뒤 다시");
    pauseSync(3000);
  }
}

/**
 * 필터 없는 런 목록 응답에서 main 의 push · workflow_dispatch 런만 골라 최신순으로 돌려준다. branch · event 로
 * 거르는 조회(`gh run list --branch --event`)는 GitHub 의 검색 색인을 거쳐 가끔 비거나 늦게 온다 - 2026-09-30 에
 * 대조가 세 번, 같은 코드의 빌드가 도는데도 '기록 없음' 을 냈고 근거로 찍힌 최근 런에 push 런이 하나도 없었다.
 * 그래서 필터 없이 받아 여기서 거르고, main 의 push 빌드가 하나도 없으면 조회가 불완전한 것으로 본다.
 */
function buildRunsFromApi(body) {
  return (Array.isArray(body && body.workflow_runs) ? body.workflow_runs : [])
    .filter((r) => r.head_branch === "main" && (r.event === "push" || r.event === "workflow_dispatch"))
    .map((r) => ({
      databaseId: r.id,
      headSha: r.head_sha,
      status: r.status,
      conclusion: r.conclusion || "",
      createdAt: r.created_at,
      event: r.event,
    }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/** 그 런의 job 들(단계 결과 포함). */
const runJobs = (runId) => JSON.parse(gh(["run", "view", String(runId), "--repo", REPO, "--json", "jobs"]) || "{}").jobs || [];

/** CI 가 그 런에 남긴 설정 digest · ABI(주석). 이 단계가 생기기 전 런이면 둘 다 null. */
function buildNotes(runId, jobs = runJobs(runId)) {
  const out = { digest: null, abi: null };
  for (const job of jobs) {
    const notes = JSON.parse(gh(["api", `repos/${REPO}/check-runs/${job.databaseId}/annotations`]) || "[]");
    for (const a of notes) {
      const msg = String(a.message || "").trim();
      if (a.title === DIGEST_ANNOTATION && /^[0-9a-f]{64}$/.test(msg)) out.digest = msg;
      if (a.title === ABI_ANNOTATION && msg) out.abi = msg;
    }
  }
  return out;
}

/** 실패한 런이 main 이 움직여 게이트에서 스스로 끊긴 것인가. */
function failedAtGate(jobs) {
  for (const job of jobs) {
    const step = (job.steps || []).find((s) => FAILED_CONCLUSIONS.has(s.conclusion));
    if (step && GATE_STEP.test(String(step.name))) return true;
  }
  return false;
}

/** 그 이름의 단계를 성공으로 지났는가(마지막 게이트를 지난 빌드는 main 이 움직여도 끝까지 간다). */
const passedStep = (jobs, name) => jobs.some((j) => (j.steps || []).some((s) => s.name === name && s.conclusion === "success"));

/** 폰에 올린 가장 최근 QA APK(태그 qa-*, pre-release)와 그 소스 커밋 · 빌드 런. */
function latestPhoneApk() {
  const list = JSON.parse(
    gh(["release", "list", "--repo", REPO, "--limit", "50", "--json", "tagName,isPrerelease,publishedAt"]) || "[]",
  );
  const qa = list
    .filter((r) => r.isPrerelease && /^qa-/.test(r.tagName))
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))[0];
  if (!qa) return null;
  const v = JSON.parse(gh(["release", "view", qa.tagName, "--repo", REPO, "--json", "tagName,targetCommitish,url,body"]));
  if (!/^[0-9a-f]{40}$/.test(v.targetCommitish)) {
    throw new Error(`${qa.tagName} 의 대상이 커밋 SHA 가 아니다(${v.targetCommitish}) - QA 릴리스는 --target <SHA> 로 만든다`);
  }
  const runId = (String(v.body || "").match(/android-release\.yml 런 (\d+)/) || [])[1] || null;
  return { tag: v.tagName, sha: v.targetCommitish, url: v.url, runId };
}

/** jobs.build.env 가 읽는 저장소 Variables 이름들. */
function referencedVars(workflowText) {
  const names = new Set();
  for (const { raw } of parseAndroidReleaseWorkflow(workflowText).env) {
    for (const m of String(raw).matchAll(/vars\.([A-Za-z0-9_]+)/g)) names.add(m[1]);
  }
  return [...names];
}

/** 저장소 Variables 의 마지막 수정 시각(ISO). */
function varsUpdatedAt() {
  const list = JSON.parse(gh(["variable", "list", "--repo", REPO, "--json", "name,updatedAt"]) || "[]");
  return Object.fromEntries(list.map((v) => [v.name, String(v.updatedAt || "")]));
}

/** 앱 경로에서 두 커밋의 코드가 같은가. */
function sameAppCode(a, b, paths, cwd) {
  return a === b || gitZ(["diff", "--name-only", "-z", a, b, "--", ...paths], cwd).length === 0;
}

/** 그 커밋을 이 저장소가 갖고 있는가. */
const hasCommit = (sha, cwd) => spawnSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd, stdio: "ignore" }).status === 0;
/** 동기 대기(분류는 동기 함수라서). */
const pauseSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * 런마다 '그 커밋이 sha 와 앱 코드가 같은가' 를 본다. 아직 받지 않은 커밋(main 이 막 움직임)은 같다고 할 수
 * 없으니 '다른 코드' 다. 받은 커밋에서 난 오류는 일시적인 git 잠금 · 팩 정리일 수 있어 한 번 더 보고, 그래도
 * 나면 조용히 '다른 코드' 로 넘기지 않고 알린다(2026-09-30: 그렇게 삼킨 오류가 '기록 없음' 으로 보인 적이 있다).
 */
function sameCodeChecker(sha, paths, cwd, deps = { compare: sameAppCode, has: hasCommit, pause: pauseSync }) {
  return (s) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return deps.compare(s, sha, paths, cwd);
      } catch (e) {
        if (!deps.has(s, cwd)) return false;
        if (attempt >= 1) throw new Error(`앱 코드 대조 실패(${String(s).slice(0, 8)}): ${String(e.message).slice(0, 160)}`);
        deps.pause(500);
      }
    }
  };
}

const statusEntries = (root) => porcelainEntries(run("git", ["status", "--porcelain", "-z", "-uall"], { cwd: root }));

/** 작업 트리(root)의 코드를 origin/main 과 앱 경로로 대조한다. differing 이 비면 main 과 같은 앱. */
function compareWithMain(root, paths) {
  try {
    fetchMain(root);
  } catch {
    /* 오프라인이면 로컬의 origin/main 으로 본다 */
  }
  const head = git(["rev-parse", "HEAD"], root);
  const main = git(["rev-parse", MAIN_REF], root);
  const dirty = statusEntries(root)
    .map((e) => e.file)
    .filter((f) => isAppPath(f, paths));
  const committed = head === main ? [] : gitZ(["diff", "--name-only", "-z", main, head, "--", ...paths], root);
  let relation = "same";
  if (head !== main) relation = isAncestor(head, main, root) ? "behind" : isAncestor(main, head, root) ? "ahead" : "diverged";
  return { head, main, dirty, differing: [...new Set([...committed, ...dirty])].sort(), relation };
}

/**
 * 그 체크아웃이 쓰는 node_modules 가 lockfile(기본: 그 체크아웃의 package-lock.json, 아니면 넘겨준
 * 원문)과 다른 항목. 워크트리는 정본 체크아웃의 설치를 정션으로 같이 쓰므로, 그 설치가 낡으면 코드가
 * 같아도 번들이 조용히 달라진다.
 */
function nodeModulesDrift(root, lockText) {
  const text = lockText === undefined ? fs.readFileSync(path.join(root, "package-lock.json"), "utf8") : lockText;
  const lock = JSON.parse(text).packages || {};
  let inst;
  try {
    inst = JSON.parse(fs.readFileSync(path.join(root, "node_modules", ".package-lock.json"), "utf8")).packages || {};
  } catch {
    return ["node_modules/.package-lock.json 을 읽지 못했다(설치가 없다)"];
  }
  return lockDrift(lock, inst);
}

/** ref 의 역사에서 patches/ 아래 지워지거나 고쳐진 옛 판들(이름 · 원문). */
function patchHistory(root, ref) {
  const out = [];
  const seen = new Set();
  const raw = run("git", ["log", "--no-renames", "--raw", "--no-abbrev", "--format=", ref, "--", "patches/"], { cwd: root });
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^:\d+ \d+ ([0-9a-f]{40,64}) [0-9a-f]{40,64} [DM]\t(.+\.patch)$/);
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ name: m[2], text: run("git", ["cat-file", "blob", m[1]], { cwd: root }) });
  }
  return out;
}

/**
 * ref(없으면 작업 트리)의 patches/ 가 전부 root 의 설치에 적용돼 있고, ref 에서 지운 · 고친 옛 패치가 남아
 * 있지 않은가. 문제 목록을 돌려준다.
 */
function patchesDrift(root, ref) {
  let patches;
  if (ref) {
    patches = gitZ(["ls-tree", "-z", "--name-only", ref, "patches/"], root)
      .filter((f) => f.endsWith(".patch"))
      .map((f) => ({ name: f, text: run("git", ["show", `${ref}:${f}`], { cwd: root }) }));
  } else {
    const dir = path.join(root, "patches");
    patches = fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((f) => f.endsWith(".patch"))
          .map((f) => ({ name: `patches/${f}`, text: fs.readFileSync(path.join(dir, f), "utf8") }))
      : [];
  }
  const read = (rel) => {
    try {
      return fs.readFileSync(path.join(root, rel), "utf8");
    } catch {
      return null;
    }
  };
  const installedVersion = (dir) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(root, dir, "package.json"), "utf8")).version || null;
    } catch {
      return null;
    }
  };
  let history;
  try {
    history = patchHistory(root, ref || "HEAD");
  } catch (e) {
    return [...patches.flatMap((p) => patchProblems(p.name, p.text, read)), `patches/ 역사를 읽지 못했다: ${String(e.message).slice(0, 120)}`];
  }
  return [...patches.flatMap((p) => patchProblems(p.name, p.text, read)), ...stalePatchProblems(patches, history, read, installedVersion)];
}

// ---------------------------------------------------------------------------
// 기록 · 프로세스
// ---------------------------------------------------------------------------

/** git 공통 디렉터리 - 어느 워크트리에서 부르든 같은 곳. localhost 기록과 로그를 여기 둔다. */
function commonDir(cwd) {
  const base = cwd || process.cwd();
  return path.resolve(base, git(["rev-parse", "--git-common-dir"], base));
}
const repoRoot = () => path.dirname(commonDir());
const localhostWorktree = () => path.join(repoRoot(), ".worktrees", LOCALHOST_WORKTREE);

function samePath(a, b) {
  const n = (p) => path.resolve(String(p)).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? n(a).toLowerCase() === n(b).toLowerCase() : n(a) === n(b);
}

/**
 * dir 이 그 자체로 git 워크트리인가. 아니면 git 이 위로 올라가 정본 체크아웃(E:\2ndB)을 잡으므로,
 * 그 상태로 checkout 하면 모든 세션이 쓰는 정본을 detach 한다. 쓰기 전에 반드시 본다.
 */
function assertWorktree(dir) {
  let top = "";
  try {
    top = git(["rev-parse", "--show-toplevel"], dir);
  } catch {
    /* git 밖 */
  }
  if (!top || !samePath(top, dir)) {
    throw new Error(`${dir} 는 git 워크트리가 아니다(git 이 ${top || "없음"} 을 잡는다). 폴더를 치우고 npm run localhost 로 다시 만들 것.`);
  }
}

function parityDir() {
  const d = path.join(commonDir(), "app-parity");
  fs.mkdirSync(d, { recursive: true });
  return d;
}
const markerPath = (port) => path.join(parityDir(), `localhost-${port}.json`);

function readMarker(port) {
  try {
    return JSON.parse(fs.readFileSync(markerPath(port), "utf8"));
  } catch {
    return null;
  }
}

/** 이 프로세스가 주인인 기록만 고친다(다른 감독자가 이미 새로 썼으면 건드리지 않는다). */
function writeOwnMarker(port, patch) {
  const cur = readMarker(port);
  if (!cur || cur.pid !== process.pid) return;
  fs.writeFileSync(markerPath(port), JSON.stringify({ ...cur, ...patch }, null, 2));
}

function removeOwnMarker(port) {
  const cur = readMarker(port);
  if (cur && cur.pid === process.pid) {
    try {
      fs.unlinkSync(markerPath(port));
    } catch {
      /* 이미 없음 */
    }
  }
}

/** 감독자의 기록 전체(serve 시작 · 자기 갱신을 되돌릴 때). */
function writeFullMarker(ctx, extra = {}) {
  fs.writeFileSync(
    markerPath(ctx.port),
    JSON.stringify(
      {
        root: ctx.root,
        port: ctx.port,
        pid: process.pid,
        childPid: ctx.child ? ctx.child.pid : null,
        servedSha: ctx.servedSha,
        mainSha: ctx.mainSha || null,
        allowDiff: Boolean(ctx.allowDiff),
        tier: ctx.tier === undefined ? null : ctx.tier,
        envDigest: ctx.digest,
        envKeys: Object.keys(ctx.env || {}).length,
        follow: Boolean(ctx.follow),
        protocol: APP_PARITY_PROTOCOL,
        logFile: ctx.logFile || null,
        startedAt: ctx.startedAt || new Date().toISOString(),
        lastCheckedAt: null,
        lastSyncAt: null,
        followHold: null,
        lastFollowError: null,
        ...extra,
      },
      null,
      2,
    ),
  );
}

function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

/** 그 pid 의 명령줄과 생성 시각(ms). 없으면 null. */
function processInfo(pid) {
  if (!alive(pid)) return null;
  try {
    if (process.platform === "win32") {
      const ps =
        `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)}"; ` +
        "if ($p) { [pscustomobject]@{ cmd = $p.CommandLine; created = $p.CreationDate.ToUniversalTime().ToString('o') } | ConvertTo-Json -Compress }";
      const out = run("powershell", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(ps, "utf16le").toString("base64")]).trim();
      if (!out) return null;
      const j = JSON.parse(out);
      return { cmd: String(j.cmd || ""), created: j.created ? Date.parse(j.created) : null };
    }
    return { cmd: run("ps", ["-o", "command=", "-p", String(Number(pid))]).trim(), created: null };
  } catch {
    return null;
  }
}
const commandLineOf = (pid) => (processInfo(pid) || {}).cmd || "";
const sinceOf = (iso) => (iso ? Date.parse(iso) : null);
const isOurSupervisor = (m, port) => Boolean(m) && isRoleProcess(processInfo(m.pid), "supervisor", port, sinceOf(m.startedAt));
const isOurChild = (m, port) => Boolean(m) && isRoleProcess(processInfo(m.childPid), "child", port, sinceOf(m.lastSyncAt || m.startedAt));

/** port 에서 듣고 있는 프로세스의 pid(없거나 모르면 null). */
function portOwnerPid(port) {
  try {
    if (process.platform === "win32") {
      const ps = `$c = Get-NetTCPConnection -State Listen -LocalPort ${Number(port)} -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $c.OwningProcess }`;
      const out = run("powershell", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(ps, "utf16le").toString("base64")]).trim();
      return /^\d+$/.test(out) ? Number(out) : null;
    }
    const out = run("lsof", ["-nP", `-iTCP:${Number(port)}`, "-sTCP:LISTEN", "-t"]).trim().split(/\s+/)[0];
    return /^\d+$/.test(out) ? Number(out) : null;
  } catch {
    return null;
  }
}

/**
 * 감독자 없이 남은 Metro 의 pid. 감독자가 트리째 멈추지 않고 죽으면 Windows 에서는 기록의 childPid(cmd.exe)는
 * 같이 죽고 Metro(손자 node)는 산다 - libuv 의 작업 개체가 손자를 놓아 준다. 그래서 포트 주인으로 찾는다:
 * 그 명령줄이 이 포트의 expo start 이고, 기록한 워크트리 경로를 담고, 기록 뒤에 생겼을 때만 우리 것이다.
 */
function strayServerPid(m, port) {
  if (!m || !m.root) return null;
  const pid = portOwnerPid(port);
  if (!pid || pid === m.pid) return null;
  const info = processInfo(pid);
  if (!isRoleProcess(info, "child", port, null)) return null;
  const norm = (s) => String(s).replace(/[\\/]+/g, "/").toLowerCase();
  if (!norm(info.cmd).includes(`${norm(m.root).replace(/\/$/, "")}/`)) return null;
  const since = sinceOf(m.startedAt);
  if (since && info.created && info.created < since - 5000) return null;
  return pid;
}

/** 프로세스와 그 자식들을 멈춘다(Windows 는 트리째). */
function killTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  for (const target of [-pid, pid]) {
    try {
      process.kill(target, "SIGTERM");
    } catch {
      /* 이미 없음 */
    }
  }
}

/** 기록의 서버를 멈춘다. 멈추기 바로 직전에 역할 · 포트 · 생성 시각으로 우리 프로세스인지 다시 본다. */
function stopRecorded(m, port) {
  if (!m) return;
  if (isOurSupervisor(m, port)) killTree(m.pid);
  if (isOurChild(m, port)) killTree(m.childPid);
  const stray = strayServerPid(m, port); // 감독자 없이 남은 Metro(위에서 트리째 멈췄으면 이미 없다)
  if (stray) killTree(stray);
}

function connects(port, host) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host });
    s.once("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.once("error", () => resolve(false));
    s.setTimeout(1500, () => {
      s.destroy();
      resolve(false);
    });
  });
}

// 서버가 IPv4 · IPv6 중 한쪽에만 떠 있을 수 있다(expo --localhost 는 ::1 에만 뜬다). 둘 다 본다.
async function portInUse(port) {
  const [v4, v6] = await Promise.all([connects(port, "127.0.0.1"), connects(port, "::1")]);
  return v4 || v6;
}

async function waitPort(port, wantUp, timeoutMs) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    if ((await portInUse(port)) === wantUp) return true;
    if (Date.now() > end) return false;
    await sleep(1000);
  }
}

/** 이 감독자가 아닌, 살아 있는 따라가기 감독자가 기록을 쥐고 있는가. */
function otherSupervisor(port) {
  const m = readMarker(port);
  return Boolean(m && m.pid !== process.pid && m.follow && isOurSupervisor(m, port));
}

/** 자기 갱신 뒤 새 감독자가 자기 기록을 쓸 때까지 기다린다. 띄운 프로세스가 먼저 끝나면 곧바로 실패다. */
async function waitNewSupervisor(port, timeoutMs, launchedPid) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    if (otherSupervisor(port)) return true;
    if (launchedPid && !alive(launchedPid)) return otherSupervisor(port);
    if (Date.now() > end) return false;
    await sleep(1000);
  }
}

/** 새 로그 파일. 감독자마다 따로 쓴다(Windows 는 열린 로그를 다른 프로세스가 덮어쓰지 못한다). 최근 5개만 남긴다. */
function newLogFile(port) {
  const dir = parityDir();
  const old = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`localhost-${port}-`) && f.endsWith(".log"))
    .sort();
  for (const f of old.slice(0, Math.max(0, old.length - 4))) {
    try {
      fs.unlinkSync(path.join(dir, f));
    } catch {
      /* 아직 쓰는 중이면 둔다 */
    }
  }
  return path.join(dir, `localhost-${port}-${new Date().toISOString().replace(/[:.]/g, "-")}.log`);
}

/** 세션과 분리된 `node scripts/app-parity.cjs <args>` 를 cwd 에서 띄운다. 출력은 logFile 로. */
function launchDetached(cwd, args, logFile) {
  const script = path.join(cwd, SELF);
  if (process.platform === "win32") {
    const q = (s) => `"${s}"`; // Windows 경로에는 큰따옴표가 들어갈 수 없다
    // cmd /c 는 명령이 따옴표로 시작하면 첫 따옴표와 마지막 따옴표를 떼어 낸다("C:\Program Files\..." 가
    // 깨진다). /s 와 바깥 따옴표 한 겹으로 감싸면 그 한 겹만 떼고 안쪽은 그대로 둔다.
    const inner = `${q(process.execPath)} ${q(script)} ${args.map(q).join(" ")} > ${q(logFile)} 2>&1`;
    const commandLine = `cmd.exe /d /s /c "${inner}"`;
    const encoded = Buffer.from(winLaunchScript(commandLine, cwd), "utf16le").toString("base64");
    const out = run("powershell", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded]).trim();
    const [rv, pid] = out.split(/\s+/);
    if (rv !== "0") throw new Error(`Win32_Process.Create 가 실패했다(${out})`);
    return Number(pid);
  }
  const fd = fs.openSync(logFile, "a");
  const child = spawn(process.execPath, [script, ...args], { cwd, detached: true, stdio: ["ignore", fd, fd] });
  child.unref();
  return child.pid;
}

/**
 * ref 의 스크립트에게 "그 커밋으로 8081 을 띄울 수 있나" 를 묻는다. 살아 있는 체크아웃은 옮기지 않는다 -
 * 후보 스크립트를 임시 파일로 꺼내(모듈은 root 의 node_modules 에서 찾게 한다) `preflight --ref` 로 돌린다.
 */
function runPreflight(root, port, ref) {
  const tmp = path.join(os.tmpdir(), `app-parity-candidate-${process.pid}-${Date.now()}.cjs`);
  try {
    try {
      fs.writeFileSync(tmp, run("git", ["show", `${ref}:${SELF}`], { cwd: root }));
    } catch (e) {
      return { ok: false, reasons: [`${String(ref).slice(0, 8)} 에 ${SELF} 가 없다(${String(e.message).slice(0, 120)})`] };
    }
    const r = spawnSync(process.execPath, [tmp, "preflight", `--port=${port}`, `--ref=${ref}`], {
      cwd: root,
      encoding: "utf8",
      timeout: 3 * NET_TIMEOUT_MS,
      env: { ...process.env, NODE_PATH: path.join(root, "node_modules") },
    });
    if (r.error) return { ok: false, reasons: [`preflight 를 실행하지 못했다: ${r.error.message}`] };
    const res = parsePreflight(r.stdout);
    return r.status === 0 ? res : { ...res, ok: false };
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

function openBrowser(url) {
  const [cmd, args] =
    process.platform === "win32"
      ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
  } catch {
    console.log(`브라우저로 여세요: ${url}`);
  }
}

/** 두 `npm run localhost` 가 동시에 8081 을 바꾸지 않게 하는 잠금(파일을 배타적으로 만든다). */
function acquireLock(port) {
  const lock = path.join(parityDir(), `localhost-${port}.lock`);
  for (let i = 0; i < 2; i++) {
    try {
      fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), { flag: "wx" });
      return () => {
        try {
          const holder = JSON.parse(fs.readFileSync(lock, "utf8"));
          if (holder.pid === process.pid) fs.unlinkSync(lock);
        } catch {
          /* 이미 없음 */
        }
      };
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      let holder = null;
      try {
        holder = JSON.parse(fs.readFileSync(lock, "utf8"));
      } catch {
        /* 깨진 잠금 */
      }
      if (holder && holder.pid !== process.pid && isRoleProcess(processInfo(holder.pid), "launcher", port, sinceOf(holder.at))) {
        throw new Error(`다른 npm run localhost(pid ${holder.pid})가 ${port} 을 바꾸는 중이다. 끝난 뒤 다시.`);
      }
      fs.rmSync(lock, { force: true }); // 주인이 없는 잠금
    }
  }
  throw new Error("잠금을 잡지 못했다");
}

function kstStamp(date = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return {
    yymmdd: `${p.year}${p.month}${p.day}`,
    text: `20${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} KST`,
    short: `${p.month}-${p.day} ${p.hour}:${p.minute}`,
  };
}
const kst = (iso) => (iso ? kstStamp(new Date(iso)).short : "-");

function flag(argv, name) {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : true;
}

// ---------------------------------------------------------------------------
// 8081 전용 워크트리
// ---------------------------------------------------------------------------

/** .worktrees/localhost-main 이 없으면 origin/main 으로 만들고, node_modules 를 정본 설치에 정션으로 잇는다. */
function ensureLocalhostWorktree() {
  const root = repoRoot();
  const lm = localhostWorktree();
  if (!fs.existsSync(lm)) {
    fetchMain(root);
    git(["worktree", "add", "--detach", lm, MAIN_REF], root);
    console.log(`만들었다: ${lm} (origin/main, detached)`);
  }
  assertWorktree(lm);
  const nm = path.join(lm, "node_modules");
  let st = null;
  try {
    st = fs.lstatSync(nm);
  } catch {
    /* 없음 */
  }
  if (!st) {
    fs.symlinkSync(path.join(root, "node_modules"), nm, "junction");
    st = fs.lstatSync(nm);
    console.log(`이었다: ${nm} → ${path.join(root, "node_modules")} (정션)`);
  }
  if (!st.isSymbolicLink()) console.warn(`⚠ ${nm} 가 정션이 아니다(복사본일 수 있다). 의존성 대조가 대신 지킨다.`);
  return lm;
}

// ---------------------------------------------------------------------------
// localhost - 8081 보장
// ---------------------------------------------------------------------------

async function cmdLocalhost(argv) {
  const port = Number(flag(argv, "port") || SIMON_PORT);
  if (port !== SIMON_PORT) return cmdServe(argv); // 세션 확인용 포트는 이 워크트리에서 바로 띄운다
  const url = `http://localhost:${port}`;
  const lm = ensureLocalhostWorktree();
  const m = readMarker(port);
  const supervisor = isOurSupervisor(m, port);
  // 감독자만 죽고 남은 서버(기록의 자식이 살아 있거나, 자식은 죽고 Metro 만 남았거나)
  const strayPid = supervisor ? null : isOurChild(m, port) ? m.childPid : strayServerPid(m, port);
  const strayChild = Boolean(strayPid);
  let up = await portInUse(port);
  // 감독자가 따라가며 다시 띄우는 중일 수 있다 - 잠깐 기다린다.
  if (supervisor && m.follow && !up) up = await waitPort(port, true, 60000);
  if (up && supervisor && m.follow && samePath(m.root, lm) && !flag(argv, "restart")) {
    console.log(`이미 떠 있다: ${url} · ${m.root} @ ${String(m.servedSha).slice(0, 8)} · origin/main 을 따라가는 중 (마지막 확인 ${kst(m.lastCheckedAt || m.startedAt)})`);
    if (m.followHold) console.log(`⚠ 따라가기 보류: ${m.followHold}`);
    console.log("대조는 npm run app:parity · 강제로 다시 띄우려면 npm run localhost -- --restart");
    if (flag(argv, "open")) openBrowser(url);
    return;
  }
  if (up && !supervisor && !strayChild) {
    console.error(`✗ ${port} 포트를 기록 없는 서버가 쓰고 있다(직접 띄운 expo start 일 수 있다). 그 프로세스를 먼저 멈출 것.`);
    process.exitCode = 3;
    return;
  }

  const release = acquireLock(port);
  try {
    // 1) 체크아웃을 옮기지 않은 채 origin/main 의 스크립트에게 그 커밋으로 띄울 수 있는지 묻는다.
    //    막히면 아무것도 바꾸지 않고 멈춘다 - 되는지 확인하기 전에는 지금 서버를 끄지 않는다.
    fetchMain(lm);
    const main = git(["rev-parse", MAIN_REF], lm);
    const pre = runPreflight(lm, port, main);
    if (!pre.ok) {
      console.error(`✗ origin/main ${main.slice(0, 8)} 으로는 8081 을 띄울 수 없다 - 지금 서버를 그대로 둔다.`);
      for (const r of pre.reasons) console.error(`   · ${r}`);
      process.exitCode = 4;
      return;
    }
    // 2) 되는 것을 확인했으니 옮기고, 이전 서버를 멈추고, 새 감독자를 띄운다.
    git(["checkout", "-q", "--detach", main], lm);
    if (supervisor || strayChild) {
      console.log(
        `멈춘다: 이전 서버(${supervisor ? `감독자 pid ${m.pid}` : `감독자 없이 남은 서버 pid ${strayPid}`})` +
          (m.follow ? "" : " - origin/main 을 따라가지 않는 방식"),
      );
      stopRecorded(m, port);
      if (!(await waitPort(port, false, 30000))) throw new Error(`${port} 포트가 30초 안에 비지 않았다`);
    }
    const logFile = newLogFile(port);
    const pid = launchDetached(lm, ["serve", `--port=${port}`, `--log=${logFile}`], logFile);
    console.log(`띄우는 중: 감독자 pid ${pid} · ${lm} @ ${main.slice(0, 8)} (origin/main)`);
    if (!(await waitPort(port, true, 180000))) {
      let tail = "";
      try {
        tail = fs.readFileSync(logFile, "utf8").split(/\r?\n/).slice(-15).join("\n");
      } catch {
        /* 로그 없음 */
      }
      throw new Error(`3분 안에 ${port} 가 뜨지 않았다. 로그 ${logFile}\n${tail}`);
    }
    console.log(`떴다: ${url} · 로그 ${logFile}`);
    console.log(`감독자가 ${FOLLOW_INTERVAL_MS / 1000}초마다 origin/main 을 따라간다(앱 경로가 바뀌면 다시 띄운다). 대조는 npm run app:parity`);
    if (flag(argv, "open")) openBrowser(url);
  } finally {
    release();
  }
}

// ---------------------------------------------------------------------------
// preflight - 그 커밋으로 8081 을 띄울 수 있나(스크립트가 스스로 판정)
// ---------------------------------------------------------------------------

async function cmdPreflight(argv) {
  const reasons = [];
  let head = null;
  let digest = null;
  try {
    const root = git(["rev-parse", "--show-toplevel"]);
    const ref = typeof flag(argv, "ref") === "string" ? flag(argv, "ref") : null;
    head = git(["rev-parse", ref || "HEAD"], root);
    const workflow = ref ? git(["show", `${ref}:${WORKFLOW}`], root) : fs.readFileSync(path.join(root, WORKFLOW), "utf8");
    const { paths } = parseAndroidReleaseWorkflow(workflow);
    const dirty = dirtyFiles(statusEntries(root), paths);
    if (dirty.length) reasons.push(`미커밋 변경 ${dirty.length}개: ${dirty.slice(0, 3).join(", ")}`);
    const lockText = ref ? run("git", ["show", `${ref}:package-lock.json`], { cwd: root }) : undefined;
    const drift = [...nodeModulesDrift(root, lockText), ...patchesDrift(root, ref)];
    if (drift.length) reasons.push(`설치가 lockfile · patches 와 다르다(${drift.length}곳: ${drift.slice(0, 3).join(" · ")})`);
    digest = envDigest(appEnv(workflow, loadRepoVars()));
  } catch (e) {
    reasons.push(String(e.message).slice(0, 300));
  }
  const out = { appParityPreflight: APP_PARITY_PROTOCOL, ok: reasons.length === 0, reasons, head, envDigest: digest };
  console.log(JSON.stringify(out));
  process.exitCode = out.ok ? 0 : 1;
}

// ---------------------------------------------------------------------------
// serve - 이 워크트리에서 서버를 띄운다(8081 은 감독자)
// ---------------------------------------------------------------------------

/** Metro 를 폰 APK 와 같은 값 · 릴리스 모드로 띄운다. ctx.child 를 바꿔 끼우면 옛 서버의 종료는 무시한다. */
function startChild(ctx, clear) {
  // Metro 기본 캐시(os.tmpdir()/metro-cache)는 모든 워크트리 · 세션이 같이 쓴다. 다른 설정으로 뜬
  // 서버가 변환해 둔 파일에 그 서버의 EXPO_PUBLIC_* 값이 박혀 있을 수 있으므로 이 서버만의 임시
  // 디렉터리를 준다. --clear 는 그 전용 캐시만 비운다.
  const tmp = path.join(os.tmpdir(), `2ndb-app-parity-${ctx.port}`);
  fs.mkdirSync(tmp, { recursive: true });
  const childEnv = { ...process.env };
  for (const k of Object.keys(childEnv)) if (/^EXPO_PUBLIC_/i.test(k)) delete childEnv[k];
  Object.assign(childEnv, ctx.env, { EXPO_NO_DOTENV: "1", TMPDIR: tmp, TEMP: tmp, TMP: tmp });
  // --localhost 는 넣지 않는다: 그러면 ::1 에만 떠서 127.0.0.1 로 여는 도구가 못 붙는다(2026-09-29 실측).
  const expoArgs = ["expo", "start", "--port", String(ctx.port), "--no-dev", "--minify", ...(clear ? ["--clear"] : [])];
  // Windows 의 npx 는 .cmd 라 셸이 필요하다. 인자는 위 고정 토큰뿐이므로 한 줄 명령으로 넘긴다.
  const child =
    process.platform === "win32"
      ? spawn(`npx.cmd ${expoArgs.join(" ")}`, { cwd: ctx.root, stdio: "inherit", env: childEnv, shell: true })
      : spawn("npx", expoArgs, { cwd: ctx.root, stdio: "inherit", env: childEnv, detached: true });
  ctx.child = child;
  child.on("exit", (code) => {
    if (ctx.child !== child || ctx.stopping) return; // 감독자가 바꿔 끼운 서버
    removeOwnMarker(ctx.port);
    process.exit(code ?? 0);
  });
  return child;
}

async function cmdServe(argv) {
  const port = Number(flag(argv, "port") || SIMON_PORT);
  const canonical = port === SIMON_PORT;
  const offline = Boolean(flag(argv, "offline-defaults"));
  const allowDiff = Boolean(flag(argv, "allow-diff"));
  const tier = flag(argv, "tier");
  if (tier !== undefined && !TIERS.includes(tier)) {
    console.error(`✗ --tier 는 ${TIERS.join(" | ")} 중 하나다`);
    process.exit(64);
  }
  if (canonical && (tier !== undefined || allowDiff || offline)) {
    console.error(`✗ ${SIMON_PORT} 은 앱과 같은 것만 띄운다. --tier · --allow-diff · --offline-defaults 는 다른 --port 에서만 받는다(세션 자체 확인용).`);
    process.exit(4);
  }
  if (tier !== undefined && !allowDiff) {
    console.error("✗ --tier 는 앱과 다른 설정이다. --allow-diff 와 함께 쓸 때만 받는다(세션 자체 확인용).");
    process.exit(4);
  }
  const root = git(["rev-parse", "--show-toplevel"]);
  if (canonical && !samePath(root, localhostWorktree())) {
    console.error(`✗ ${SIMON_PORT} 은 npm run localhost 가 전용 워크트리(${localhostWorktree()})에서 띄운다. 여기서는 --port 를 다르게 줄 것.`);
    process.exit(4);
  }
  process.chdir(root);
  if (canonical) {
    // 감독자 교체 중이면 옛 감독자가 끝나기를 잠깐 기다린다(그 사이 기록이 남아 있을 수 있다).
    for (let i = 0; ; i++) {
      const other = readMarker(port);
      if (!(other && other.pid !== process.pid && other.follow && isOurSupervisor(other, port))) break;
      if (i >= 15) {
        console.error(`✗ 다른 감독자(pid ${other.pid})가 8081 을 맡고 있다.`);
        process.exit(3);
      }
      await sleep(1000);
    }
  }

  const workflow = fs.readFileSync(WORKFLOW, "utf8");
  const { paths } = parseAndroidReleaseWorkflow(workflow);
  let vars = {};
  try {
    vars = loadRepoVars();
  } catch (e) {
    if (!offline) {
      console.error(`✗ 저장소 Variables 를 읽지 못했다(${e.message.slice(0, 200)}).`);
      console.error("  폰 APK 는 그 값으로 빌드되므로 없이 띄우면 같은 앱이 아니다. gh 로그인 뒤 다시 실행할 것.");
      process.exit(2);
    }
    console.warn("⚠ --offline-defaults: 저장소 Variables 없이 워크플로 기본값으로 띄운다. 앱과 다를 수 있다.");
  }
  const env = appEnv(workflow, vars);
  const digest = envDigest(env);
  if (tier !== undefined) env.EXPO_PUBLIC_FORCE_TIER = tier; // digest 는 앱 설정 그대로 - 차이는 기록의 tier 로 남긴다

  if (await portInUse(port)) {
    const m = readMarker(port);
    const who = isOurSupervisor(m, port) ? `app-parity 가 ${m.root} 에서 띄운 서버(pid ${m.pid})` : "기록 없는 서버(직접 띄운 expo start 일 수 있다)";
    console.error(`✗ ${port} 포트를 이미 쓰고 있다: ${who}. 먼저 멈춘 뒤 다시 실행할 것.`);
    process.exit(3);
  }

  const cmp = compareWithMain(root, paths);
  const drift = [...nodeModulesDrift(root), ...patchesDrift(root)];
  const dirty = canonical ? dirtyFiles(statusEntries(root), paths) : cmp.dirty;
  // 8081 은 main 에 있는 코드만 띄운다. 막 머지된 새 커밋 때문에 몇 초 뒤처진 것(behind)은 main 의
  // 코드이므로 띄우고, 감독자가 곧 따라간다.
  const codeOk = dirty.length === 0 && (cmp.differing.length === 0 || (canonical && cmp.relation === "behind"));
  const same = codeOk && drift.length === 0 && tier === undefined;
  console.log("━━━ 앱과 같은 localhost (CLAUDE.md '앱과 localhost 는 같은 소프트웨어다') ━━━");
  console.log(
    `코드      : ${root} @ ${cmp.head.slice(0, 8)}${dirty.length ? ` + 미커밋 ${dirty.length}개` : ""}` +
      ` · origin/main ${cmp.main.slice(0, 8)} → 앱 경로 차이 ${cmp.differing.length}개${cmp.relation === "same" ? "" : ` (${cmp.relation})`}`,
  );
  for (const f of cmp.differing.slice(0, 15)) console.log(`   - ${f}`);
  if (cmp.differing.length > 15) console.log(`   … 외 ${cmp.differing.length - 15}개`);
  console.log(`의존성    : ${drift.length ? `⚠ lockfile · patches 와 다른 설치 ${drift.length}개 (${drift.slice(0, 3).join(" · ")})` : "package-lock · patches 와 같음"}`);
  console.log(`설정      : ${WORKFLOW} env 의 EXPO_PUBLIC_* ${Object.keys(env).length}개 · .env 무시 · digest ${digest.slice(0, 12)}`);
  console.log(
    `등급 강제 : EXPO_PUBLIC_FORCE_TIER=${env.EXPO_PUBLIC_FORCE_TIER} · ALLOW_DEV_TIER=${env.EXPO_PUBLIC_ALLOW_DEV_TIER}` +
      (tier === undefined ? " (폰 앱과 같음)" : " (⚠ --tier 로 바꿈 - 폰 앱과 다름)"),
  );
  console.log("모드      : 릴리스(--no-dev --minify) · 이 서버 전용 Metro 캐시");
  if (!same) {
    if (canonical) {
      console.error(`✗ ${SIMON_PORT} 은 origin/main 과 같은 코드 · 의존성만 띄운다.`);
      process.exit(4);
    }
    if (!allowDiff) {
      console.error(`✗ origin/main 과 다른 코드다. 세션 자체 확인용이면 --allow-diff 를 붙인다(${port} 은 Simon 에게 앱으로 보여 주지 않는다).`);
      process.exit(4);
    }
    console.warn(`⚠ --allow-diff: ${port} 은 origin/main 과 다른 코드다. 세션 자체 확인용이며 앱 화면으로 보고하지 않는다.`);
  }
  console.log(`주소      : http://localhost:${port}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const log = flag(argv, "log");
  const ctx = {
    root,
    port,
    paths,
    env,
    digest,
    child: null,
    stopping: false,
    servedSha: cmp.head,
    mainSha: cmp.main,
    pendingStart: null,
    allowDiff,
    tier,
    follow: canonical && !flag(argv, "no-follow"),
    logFile: typeof log === "string" ? log : null,
    startedAt: new Date().toISOString(),
  };
  startChild(ctx, true);
  writeFullMarker(ctx);
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
      ctx.stopping = true;
      if (ctx.child) killTree(ctx.child.pid);
      removeOwnMarker(port);
      process.exit(0);
    });
  }
  if (ctx.follow) startFollow(ctx);
}

// ---------------------------------------------------------------------------
// 감독자 - origin/main 따라가기
// ---------------------------------------------------------------------------

const followDeps = {
  loadVars: loadRepoVars,
  killTree,
  waitPort,
  startChild,
  launchDetached,
  newLogFile,
  runPreflight,
  waitNewSupervisor,
  otherSupervisor,
  writeMarker: writeOwnMarker,
  removeMarker: removeOwnMarker,
  restoreMarker: (ctx, extra) => writeFullMarker(ctx, extra),
  exit: (code) => process.exit(code),
  log: (msg) => console.log(msg),
};

/** 설치 상태의 지문(거부를 기억했다가 설치가 바뀌면 다시 묻는다). */
function installStamp(root) {
  try {
    return String(fs.statSync(path.join(root, "node_modules", ".package-lock.json")).mtimeMs);
  } catch {
    return "none";
  }
}

/**
 * 한 번 확인한다. origin/main 이 앞서 있으면 planFollow 대로 움직인다. 외부 동작(서버 기동 · 종료 ·
 * 기록 · 분리 기동 · preflight)은 deps 로 받는다 - 테스트가 실제 git 저장소로 이 함수를 돌린다.
 * 순서 원칙: 실패할 수 있는 일(판정 · 체크아웃)을 먼저 하고, 서버는 마지막에 바꾸며, 바꾸다 실패하면
 * 옛 커밋 · 옛 서버로 되돌린다. 보류하는 동안 Metro 가 내보내는 디스크는 늘 띄운 커밋(servedSha)이다.
 */
async function followTick(ctx, deps = followDeps) {
  const { root, port } = ctx;
  const now = new Date().toISOString();
  assertWorktree(root);
  const hold = (reason) => {
    if (ctx.lastHold !== reason) deps.log(`[follow] 보류: ${reason}`);
    ctx.lastHold = reason;
    deps.writeMarker(port, { lastCheckedAt: now, followHold: reason, servedSha: ctx.servedSha, envDigest: ctx.digest });
    return { action: "hold", reason };
  };

  // 편집 금지 워크트리가 더러우면 Metro 가 그 디스크를 그대로 내보낸다 - 8081 을 멈추고 깨끗해질 때까지 둔다.
  const dirty = dirtyFiles(statusEntries(root), ctx.paths);
  if (dirty.length) {
    if (ctx.child) {
      const old = ctx.child;
      ctx.child = null;
      deps.killTree(old.pid);
      ctx.pendingStart = { clear: false };
    }
    return hold(`localhost-main 에 미커밋 변경 ${dirty.length}개(${dirty.slice(0, 3).join(", ")}) - 8081 을 멈췄다(편집 금지 워크트리)`);
  }

  // 지난번에 못 띄운 서버(포트가 늦게 빔 · 더러움이 풀림)가 있으면 먼저 다시 띄운다. 띄울 커밋 그대로인지
  // 먼저 본다(그 사이 누가 체크아웃을 옮겼으면 main 에 없는 코드를 띄우게 된다).
  if (!ctx.child && ctx.pendingStart) {
    if (git(["rev-parse", "HEAD"], root) !== ctx.servedSha) {
      try {
        git(["checkout", "-q", "--detach", ctx.servedSha], root);
      } catch (e) {
        return hold(`띄울 커밋 ${String(ctx.servedSha).slice(0, 8)} 로 체크아웃하지 못해 8081 을 멈춘 채 둔다(${String(e.message).slice(0, 120)})`);
      }
    }
    if (!(await deps.waitPort(port, false, 5000))) return hold(`${port} 포트가 아직 비지 않아 서버를 못 띄우고 있다`);
    const child = deps.startChild(ctx, ctx.pendingStart.clear);
    ctx.pendingStart = null;
    deps.writeMarker(port, { lastCheckedAt: now, childPid: child && child.pid, followHold: null, lastSyncAt: now, servedSha: ctx.servedSha, envDigest: ctx.digest });
  }

  // 원격이 움직였을 때만 fetch 한다(fetch 는 공용 ref 를 잠근다 - 다른 세션과 덜 다투게).
  const remote = gitNet(["ls-remote", "origin", "refs/heads/main"], root).split(/\s+/)[0];
  if (remote && remote !== git(["rev-parse", MAIN_REF], root)) fetchMain(root);
  const main = git(["rev-parse", MAIN_REF], root);
  const head = git(["rev-parse", "HEAD"], root);
  const base = ctx.servedSha || head; // Metro 가 지금 띄운 커밋
  let envError = null;
  let nextEnv = null;
  let nextDigest = ctx.digest;
  let paths = ctx.paths;
  try {
    const wf = git(["show", `${main}:${WORKFLOW}`], root);
    paths = parseAndroidReleaseWorkflow(wf).paths; // main 이 앱 경로를 넓혔으면 그것으로 본다
    nextEnv = appEnv(wf, deps.loadVars());
    nextDigest = envDigest(nextEnv);
  } catch (e) {
    envError = String(e.message).slice(0, 200);
  }
  const appDiff = base === main ? [] : gitZ(["diff", "--name-only", "-z", base, main, "--", ...paths], root);
  const scriptChanged = base !== main && gitZ(["diff", "--name-only", "-z", base, main, "--", SELF], root).length > 0;
  const envChanged = !envError && nextDigest !== ctx.digest;
  const headMoved = head !== base; // 감독자 모르게 체크아웃이 움직였다
  let drift = [];
  if (!scriptChanged && (appDiff.length || envChanged || headMoved)) {
    try {
      drift = [...nodeModulesDrift(root, run("git", ["show", `${main}:package-lock.json`], { cwd: root })), ...patchesDrift(root, main)];
    } catch (e) {
      drift = [`lockfile · patches 를 읽지 못했다: ${e.message}`];
    }
  }
  const plan = planFollow({ appDiff, envChanged, scriptChanged, headMoved, dirty: [], drift, envError, headIsMain: head === main && base === main });
  const seen = { lastCheckedAt: now, mainSha: main };
  // 체크아웃이 띄운 커밋에서 벗어난 채로 보류하면 Metro 가 그 디스크를 내보낸다 - 띄운 커밋으로 되돌리고,
  // 못 되돌리면 8081 을 멈춘다(main 에 없는 코드는 8081 에 올리지 않는다).
  const holdServed = (reason) => {
    let cur = null;
    try {
      cur = git(["rev-parse", "HEAD"], root);
    } catch {
      /* 아래에서 되돌린다 */
    }
    if (cur !== base) {
      try {
        git(["checkout", "-q", "--detach", base], root);
        deps.log(`[follow] 체크아웃이 ${String(cur).slice(0, 8)} 로 옮겨져 있어 띄운 커밋 ${base.slice(0, 8)} 로 되돌렸다`);
      } catch (e) {
        if (ctx.child) {
          const old = ctx.child;
          ctx.child = null;
          deps.killTree(old.pid);
          ctx.pendingStart = { clear: false };
        }
        return hold(`${reason} · 체크아웃을 띄운 커밋으로 되돌리지 못해 8081 을 멈췄다(${String(e.message).slice(0, 120)})`);
      }
    }
    return hold(reason);
  };

  if (plan.action === "none") {
    ctx.lastHold = null;
    deps.writeMarker(port, { ...seen, followHold: null, lastFollowError: null });
    return plan;
  }
  if (plan.action === "hold") return holdServed(plan.reason);

  // 새 스크립트 판정의 기억: 거부는 (main · 설치)로, 넘겨주기 실패는 (스크립트 · 설치)로 묶는다. 둘 다 시간이
  // 지나면 다시 묻는다(일시적인 gh · 네트워크 실패가 다음 머지까지 굳지 않게, 실패가 매분 되풀이되지 않게).
  const stamp = installStamp(root);
  let script = null;
  if (plan.action === "self-update") {
    try {
      script = git(["rev-parse", `${main}:${SELF}`], root);
    } catch {
      /* main 에 스크립트가 없다 - preflight 가 거부한다 */
    }
    const t = Date.now();
    const h = ctx.handover;
    if (h && h.script === script && h.stamp === stamp && t < h.until) return holdServed(h.reason);
    const r = ctx.refused;
    if (r && r.main === main && r.stamp === stamp && t - r.at < REFUSAL_TTL_MS) return holdServed(r.reason);
    const pre = deps.runPreflight(root, port, main);
    if (!pre.ok) {
      const reason = `새 스크립트가 거부했다: ${pre.reasons.join(" · ").slice(0, 240)}`;
      ctx.refused = { main, stamp, reason, at: t };
      return holdServed(reason);
    }
    ctx.refused = null;
  }

  // 실패할 수 있는 체크아웃을 서버를 건드리기 전에 한다(실패하면 지금 서버 그대로).
  try {
    git(["checkout", "-q", "--detach", main], root);
  } catch (e) {
    return holdServed(`체크아웃 실패: ${String(e.message).slice(0, 200)}`);
  }
  ctx.lastHold = null;
  ctx.mainSha = main;
  if (plan.action === "checkout") {
    ctx.servedSha = main;
    ctx.paths = paths;
    deps.writeMarker(port, { ...seen, servedSha: main, followHold: null, lastFollowError: null });
    deps.log(`[follow] ${main.slice(0, 8)} 로 옮겼다(앱 경로 변경 없음, 서버 유지)`);
    return plan;
  }

  deps.log(
    `[follow] origin/main ${main.slice(0, 8)}: ` +
      (plan.action === "self-update"
        ? "이 스크립트가 바뀌었다 - 새 스크립트로 감독자째 다시 띄운다"
        : `앱 경로 ${appDiff.length}개${envChanged ? " · 빌드 설정" : ""}${headMoved ? " · 체크아웃 이동" : ""} 바뀜 - 다시 띄운다`),
  );
  const old = ctx.child;
  ctx.child = null; // 옛 서버의 종료를 감독자 종료로 착각하지 않게 먼저 뗀다
  if (old) deps.killTree(old.pid);
  const freed = await deps.waitPort(port, false, 30000);

  if (plan.action === "self-update") {
    // 되돌리기: 옛 커밋으로 돌아가 옛 서버를 다시 띄우고, 그 스크립트로는 한동안 다시 시도하지 않는다
    // (시도할 때마다 8081 이 1~3분 꺼지므로). 기록은 서버를 띄운 뒤 쓴다(childPid · lastSyncAt 이 맞게).
    const rollback = async (reason) => {
      ctx.stopping = false;
      try {
        git(["checkout", "-q", "--detach", base], root);
      } catch {
        /* 다음 확인의 holdServed · pendingStart 가 다시 본다 */
      }
      const free = await deps.waitPort(port, false, 30000);
      if (free) deps.startChild(ctx, false);
      else ctx.pendingStart = { clear: false };
      deps.restoreMarker(ctx, free ? { lastSyncAt: now } : {});
      const failures = ctx.handover && ctx.handover.script === script ? ctx.handover.failures + 1 : 1;
      const wait = Math.min(HANDOVER_BACKOFF_MS * 2 ** (failures - 1), HANDOVER_BACKOFF_MAX_MS);
      ctx.handover = { script, stamp, failures, until: Date.now() + wait, reason: `${reason} - ${Math.round(wait / 60000)}분 뒤 다시 시도한다` };
      return hold(ctx.handover.reason);
    };
    if (!freed) return rollback(`${port} 포트가 30초 안에 비지 않아 새 감독자를 못 띄웠다 - 옛 커밋으로 되돌렸다`);
    const logFile = deps.newLogFile(port);
    ctx.stopping = true;
    deps.removeMarker(port); // 새 감독자가 이 기록을 '다른 감독자'로 보고 물러나지 않게 먼저 치운다
    let launched = null;
    try {
      launched = deps.launchDetached(root, ["serve", `--port=${port}`, `--log=${logFile}`], logFile);
    } catch (e) {
      return rollback(`새 감독자를 못 띄웠다(${String(e.message).slice(0, 160)}) - 옛 커밋으로 되돌렸다`);
    }
    if (!(await deps.waitNewSupervisor(port, HANDOVER_WAIT_MS, launched))) {
      // 늦게라도 뜬 새 감독자와 8081 을 다투지 않게 먼저 멈춘다. 그 사이 다른 감독자가 기록을 쥐었으면 물러난다.
      if (launched) deps.killTree(launched);
      if (deps.otherSupervisor(port)) {
        deps.log(`[follow] 다른 감독자가 ${port} 을 맡았다 - 이 감독자는 끝낸다.`);
        deps.exit(0);
        return plan;
      }
      return rollback(`새 감독자가 ${HANDOVER_WAIT_MS / 1000}초 안에 기록을 쓰지 않았다 - 옛 커밋 · 옛 서버로 되돌렸다(로그 ${logFile})`);
    }
    ctx.handover = null;
    deps.log(`[follow] 새 감독자가 넘겨받았다(로그 ${logFile}). 이 감독자는 끝낸다.`);
    deps.exit(0);
    return plan;
  }

  ctx.env = nextEnv;
  ctx.digest = nextDigest;
  ctx.servedSha = main;
  ctx.paths = paths;
  if (!freed) {
    ctx.pendingStart = { clear: plan.clear };
    return hold(`${port} 포트가 30초 안에 비지 않았다 - 다음 확인에서 다시 띄운다`);
  }
  const child = deps.startChild(ctx, plan.clear);
  deps.writeMarker(port, {
    ...seen,
    servedSha: main,
    envDigest: nextDigest,
    childPid: child && child.pid,
    lastSyncAt: now,
    followHold: null,
    lastFollowError: null,
  });
  return plan;
}

function startFollow(ctx) {
  let busy = false;
  setInterval(async () => {
    if (busy || ctx.stopping) return;
    busy = true;
    try {
      await followTick(ctx);
    } catch (e) {
      const msg = String((e && e.message) || e).slice(0, 300);
      writeOwnMarker(ctx.port, { lastCheckedAt: new Date().toISOString(), lastFollowError: msg });
      console.error(`[follow] ${msg}`);
    } finally {
      busy = false;
    }
  }, FOLLOW_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// stop
// ---------------------------------------------------------------------------

async function cmdStop(argv) {
  const port = Number(flag(argv, "port") || SIMON_PORT);
  const m = readMarker(port);
  if (!m) {
    console.log(`기록된 ${port} 서버가 없다${(await portInUse(port)) ? " (⚠ 기록 없는 서버가 포트를 쓰고 있다)" : ""}`);
    return;
  }
  stopRecorded(m, port);
  const freed = await waitPort(port, false, 30000);
  try {
    fs.unlinkSync(markerPath(port));
  } catch {
    /* 이미 없음 */
  }
  console.log(freed ? `멈췄다: ${port}` : `⚠ ${port} 포트가 아직 쓰이고 있다(기록 밖의 프로세스)`);
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

/**
 * 그 코드 · 지금 설정의 폰용 APK 빌드 상태. 설정은 CI 가 남긴 digest 로 대조하고(폰용이 아닌 ABI 는
 * 빼고), digest 단계 이전 빌드는 그 빌드가 시작된 뒤 워크플로가 읽는 저장소 Variables 가 바뀌었는지로
 * 대신 본다. 실패는 게이트(main 이 움직임)에서 끊긴 것과 나눈다. 진행 중인 빌드는 커밋이 지금 main
 * (mainSha)이 아니고 마지막 게이트를 아직 못 지났으면 끊길 것이 확실하므로 세지 않는다.
 */
function buildStatusFor(sha, paths, cwd, localDigest, workflowText, mainSha) {
  const notes = new Map();
  const jobs = new Map();
  const jobsOf = (id) => {
    if (!jobs.has(id)) jobs.set(id, runJobs(id));
    return jobs.get(id);
  };
  const names = referencedVars(workflowText);
  const { lastGate } = parseAndroidReleaseWorkflow(workflowText);
  let updated = null;
  let noteErrors = 0;
  const runs = listBuildRuns();
  const same = new Map();
  const checker = sameCodeChecker(sha, paths, cwd);
  const result = classifyBuild(
    runs,
    (s) => {
      if (!same.has(s)) same.set(s, checker(s));
      return same.get(s);
    },
    (r) => {
      if (!notes.has(r.databaseId)) {
        let n = { digest: null, abi: null };
        try {
          n = buildNotes(r.databaseId, jobsOf(r.databaseId));
        } catch {
          noteErrors++; // 조회 실패는 미확인 - 대조 결과에 몇 건인지 밝힌다
        }
        notes.set(r.databaseId, n);
      }
      const n = notes.get(r.databaseId);
      if (n.abi && n.abi !== PHONE_ABI) return "skip";
      if (n.digest !== null) return n.digest === localDigest ? "match" : "mismatch";
      try {
        if (updated === null) updated = varsUpdatedAt();
      } catch {
        return "unknown";
      }
      return names.some((x) => updated[x] && updated[x] > String(r.createdAt)) ? "mismatch" : "unknown";
    },
    (r) => {
      try {
        return failedAtGate(jobsOf(r.databaseId));
      } catch {
        return false;
      }
    },
    (r) => {
      if (!mainSha || r.headSha === mainSha || !lastGate) return false;
      try {
        return !passedStep(jobsOf(r.databaseId), lastGate);
      } catch {
        return true; // 모르면 세지 않는다(거짓 '같음' 보다 '다름' 이 낫다)
      }
    },
  );
  // 판정의 근거로 보여 줄 가장 최근 런 셋(다른 코드 포함)
  result.recent = runs.slice(0, 3).map((r) => ({ ...r, same: same.has(r.headSha) ? same.get(r.headSha) : null }));
  result.noteErrors = noteErrors;
  return result;
}

async function cmdStatus(argv) {
  const port = Number(flag(argv, "port") || SIMON_PORT);
  const m = readMarker(port);
  const supervisor = isOurSupervisor(m, port);
  const listening = await portInUse(port);
  const problems = [];
  const lm = localhostWorktree();
  const root = supervisor ? m.root : port === SIMON_PORT && fs.existsSync(lm) ? lm : git(["rev-parse", "--show-toplevel"]);
  const rebuild = "gh workflow run android-release.yml --ref main 으로 새로 빌드한다(폰에 올릴 거면 npm run app:qa-release 가 알아서 돌린다)";

  if (!listening) problems.push(`localhost:${port} 이 응답하지 않는다 (npm run localhost)`);
  if (!supervisor) {
    const stray = m && listening ? (isOurChild(m, port) ? m.childPid : strayServerPid(m, port)) : null;
    problems.push(
      stray
        ? `감독자(기록 pid ${m.pid})가 없고 서버(pid ${stray})만 남았다 - origin/main 을 따라가지 않는다 (npm run localhost 가 넘겨받는다)`
        : m
          ? `기록의 감독자(pid ${m.pid})가 없다${listening ? " - 포트는 기록 밖의 서버가 쓰고 있다" : ""} (npm run localhost)`
          : listening
            ? `${port} 의 서버는 app-parity 로 띄운 것이 아니다(기록 없음)`
            : "app-parity 기록이 없다",
    );
  }
  console.log(
    `localhost : ${listening ? `http://localhost:${port} 응답` : `${port} 응답 없음`}` +
      (supervisor ? ` · ${m.root} 에서 ${kst(m.startedAt)} 에 띄움` : ""),
  );
  if (supervisor && port === SIMON_PORT) {
    if (!m.follow) {
      problems.push("origin/main 을 따라가지 않는 방식으로 뜬 서버다 (npm run localhost -- --restart)");
    } else {
      console.log(
        `따라감    : 마지막 확인 ${kst(m.lastCheckedAt || m.startedAt)} · 마지막 다시 띄움 ${kst(m.lastSyncAt || m.startedAt)}` +
          (m.lastFollowError ? ` · 최근 오류 ${m.lastFollowError}` : ""),
      );
      if (m.followHold) problems.push(`따라가기 보류: ${m.followHold}`);
    }
  }

  const workflow = fs.readFileSync(path.join(root, WORKFLOW), "utf8");
  const { paths } = parseAndroidReleaseWorkflow(workflow);
  let localDigest = null;
  try {
    const app = appEnv(workflow, loadRepoVars());
    localDigest = envDigest(app);
    if (supervisor) {
      if (localDigest !== m.envDigest) problems.push("띄운 뒤 앱 빌드 설정(워크플로 env · 저장소 Variables)이 바뀌었다 - 감독자가 곧 다시 띄운다(아니면 npm run localhost -- --restart)");
      if (m.tier) problems.push(`--tier=${m.tier} 로 등급을 바꾼 서버다(앱은 ${app.EXPO_PUBLIC_FORCE_TIER})`);
      console.log(`설정      : ${localDigest === m.envDigest && !m.tier ? "워크플로 env · 저장소 Variables 와 같음" : "⚠ 다름"} (digest ${String(m.envDigest).slice(0, 12)})`);
    }
  } catch (e) {
    problems.push(`설정을 대조하지 못했다(${e.message.slice(0, 120)})`);
  }
  if (supervisor && m.allowDiff) problems.push("--allow-diff 로 띄운 서버다(세션 확인용)");

  const drift = [...nodeModulesDrift(root), ...patchesDrift(root)];
  console.log(`의존성    : ${drift.length ? `⚠ lockfile · patches 와 다른 설치 ${drift.length}개` : "package-lock · patches 와 같음"}`);
  for (const d of drift.slice(0, 10)) console.log(`   - ${d}`);
  if (drift.length) problems.push(`설치가 lockfile · patches 와 ${drift.length}곳 다르다(APK 는 lockfile 그대로 설치하고 patches 를 적용한다)`);

  const cmp = compareWithMain(root, paths);
  console.log(
    `코드      : ${root} @ ${cmp.head.slice(0, 8)} + 미커밋 앱 파일 ${cmp.dirty.length}개 · origin/main ${cmp.main.slice(0, 8)}` +
      ` → 앱 경로 차이 ${cmp.differing.length}개${cmp.relation === "same" ? "" : ` (${cmp.relation})`}`,
  );
  for (const f of cmp.differing.slice(0, 30)) console.log(`   - ${f}`);
  if (cmp.differing.length > 30) console.log(`   … 외 ${cmp.differing.length - 30}개`);
  if (cmp.differing.length) {
    problems.push(
      cmp.relation === "behind" && cmp.dirty.length === 0
        ? `origin/main 보다 앱 경로 ${cmp.differing.length}개 뒤처졌다 - 감독자가 1분 안에 따라간다(보류 사유가 없으면 잠시 뒤 다시 확인)`
        : `origin/main 에 없는 코드가 있다(${cmp.differing.length}개) - main 에 머지하지 않은 것은 8081 에 올리지 않는다`,
    );
  }

  try {
    const build = buildStatusFor(cmp.head, paths, root, localDigest, workflow, cmp.main);
    const url = build.run ? `https://github.com/${REPO}/actions/runs/${build.run.databaseId}` : "";
    const ref = build.run ? `런 ${build.run.databaseId} · ${String(build.run.headSha).slice(0, 8)}` : "";
    const inProgress = Boolean(build.run && build.run.status !== "completed");
    const label = {
      success:
        build.config === "match"
          ? `성공 (${ref}) - 같은 코드 · 같은 설정으로 폰용 APK 가 만들어졌다`
          : `성공 (${ref}) - 같은 코드(설정 digest 를 읽지 못했다: digest 단계 이전 빌드거나 조회 실패)`,
      running: `빌드 중 (${ref})`,
      unconfirmed: inProgress
        ? `⚠ 수동 빌드가 진행 중이다 - 설정 · ABI 주석은 빌드가 끝나야 읽힌다 (${ref})`
        : `⚠ 수동 빌드뿐이고 설정 · ABI 주석이 없다(digest 단계 이전 빌드) (${ref})`,
      stale: `⚠ 같은 코드의 APK 가 다른 설정으로 빌드됐다 (${ref})`,
      failure: `⚠ 실패 (${ref})`,
      superseded: inProgress
        ? `⚠ 빌드가 기다리는 사이 main 이 움직여 게이트에서 끊긴다 (${ref})`
        : `⚠ main 이 움직여 빌드가 게이트에서 끊겼다 (${ref})`,
      cancelled: `⚠ 같은 코드의 빌드가 취소됐다 (${ref})`,
      none: "⚠ 기록 없음(최근 빌드 안에 같은 코드의 폰용 빌드가 없다)",
    }[build.state];
    console.log(`APK 빌드  : ${label}`);
    if (build.noteErrors) console.log(`   ⚠ 빌드 주석 조회 실패 ${build.noteErrors}건 - 그 빌드들의 설정은 저장소 Variables 수정 시각으로 대신 봤다`);
    if (build.state === "failure") problems.push(`이 코드의 APK 빌드가 실패했다(${url}) - 앱을 이 코드로 만들 수 없는 상태`);
    if (build.state === "stale") problems.push(`같은 코드의 APK 가 지금과 다른 설정으로 빌드됐다(저장소 Variables 가 빌드 뒤 바뀜) - ${rebuild}`);
    if (build.state === "unconfirmed") {
      problems.push(
        inProgress
          ? `같은 코드의 수동 빌드(${url})가 폰용 · 같은 설정인지는 끝나야 안다(GitHub 는 주석을 빌드가 끝난 뒤에 보여 준다) - 끝난 뒤 다시 확인`
          : `같은 코드의 수동 빌드가 폰용 · 같은 설정인지 모른다 - ${rebuild}`,
      );
    }
    if (build.state === "superseded" || build.state === "cancelled" || build.state === "none") {
      problems.push(`이 코드 · 설정의 폰용 APK 가 아직 없다(${build.state}) - ${rebuild}`);
    }
    // '같음' 이 아닌 판정에는 근거를 붙인다: 가장 최근 런 셋과 각각이 같은 앱 코드인지
    if (build.state !== "success" && build.state !== "running") {
      for (const r of build.recent || []) {
        const same = r.same === true ? "같은 앱 코드" : r.same === false ? "다른 앱 코드" : "대조 안 함";
        console.log(`   - 최근 런 ${r.databaseId} · ${String(r.headSha).slice(0, 8)} · ${r.event} · ${r.status}${r.conclusion ? `/${r.conclusion}` : ""} · ${same}`);
      }
    }
  } catch (e) {
    console.log(`APK 빌드  : 확인 못 함(${e.message.slice(0, 160)})`);
    problems.push("APK 빌드를 확인하지 못했다(gh · git) - 잠시 뒤 다시");
  }

  try {
    const phone = latestPhoneApk();
    if (phone) {
      const behind = gitZ(["diff", "--name-only", "-z", phone.sha, cmp.main, "--", ...paths], root).length;
      console.log(
        `폰 QA APK : ${phone.tag} (${phone.sha.slice(0, 8)}) · main 과 앱 경로 차이 ${behind}개` +
          (behind ? " - 참고: 폰에서 보려면 npm run app:qa-release" : ""),
      );
    } else {
      console.log("폰 QA APK : 없음 - 참고: 폰에서 보려면 npm run app:qa-release");
    }
  } catch (e) {
    console.log(`폰 QA APK : 확인 못 함(${e.message.slice(0, 120)})`);
  }

  if (problems.length === 0) {
    console.log("결론      : 같음 - localhost 가 origin/main(= CI 가 APK 로 빌드하는 코드 · 설정)과 같은 소프트웨어다");
    process.exitCode = 0;
    return;
  }
  console.log("결론      : 다름");
  for (const p of problems) console.log(`   · ${p}`);
  console.log("   → 코드는 PR → main 머지(8081 이 1분 안에 따라간다), 서버는 npm run localhost (필요하면 -- --restart).");
  process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// qa-release - 폰에서 볼 때만
// ---------------------------------------------------------------------------

function findTool(sdkRelative) {
  const sdk =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    (process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Android", "Sdk"));
  if (!sdk || !fs.existsSync(path.join(sdk, "build-tools"))) return null;
  for (const v of fs.readdirSync(path.join(sdk, "build-tools")).sort().reverse()) {
    const p = path.join(sdk, "build-tools", v, sdkRelative);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** --run 은 목록 검색 결과가 아닌 해당 실행의 API 원본으로 출처를 확인한다. */
function parseQaRunId(value) {
  const text = String(value);
  const id = Number(text);
  if (!/^[1-9][0-9]*$/.test(text) || !Number.isSafeInteger(id)) throw new Error(`실행 ID 가 올바르지 않다: ${text}`);
  return id;
}

function validateQaRunMetadata(raw, workflow, requestedId) {
  const id = parseQaRunId(requestedId);
  if (!workflow || !Number.isSafeInteger(workflow.id) || workflow.path !== WORKFLOW) {
    throw new Error("QA 빌드 workflow 원본을 확인하지 못했다");
  }
  if (!raw || raw.id !== id || raw.workflow_id !== workflow.id || raw.path !== WORKFLOW) {
    throw new Error(`QA 빌드 ${id} 가 ${WORKFLOW} 실행인지 확인하지 못했다`);
  }
  if (raw.repository?.full_name !== REPO || !Number.isSafeInteger(raw.repository?.id) || raw.head_repository?.full_name !== REPO) {
    throw new Error(`QA 빌드 ${id} 의 저장소가 ${REPO} 인지 확인하지 못했다`);
  }
  if (raw.head_branch !== "main" || (raw.event !== "push" && raw.event !== "workflow_dispatch")) {
    throw new Error(`QA 빌드 ${id} 는 main 의 push/수동 실행이 아니다`);
  }
  if (!/^[0-9a-f]{40}$/.test(String(raw.head_sha || ""))) throw new Error(`QA 빌드 ${id} 의 소스 커밋이 올바르지 않다`);
  return {
    databaseId: id,
    headSha: raw.head_sha,
    status: raw.status,
    conclusion: raw.conclusion || "",
    createdAt: raw.created_at,
    event: raw.event,
  };
}

/** 지정 런에서 다운로드할 이름의 artifact 가 정확히 하나이고, 같은 커밋 · 저장소의 것인지 확인한다. */
function validateQaArtifactMetadata(body, rawRun) {
  const artifacts = body && body.artifacts;
  const expected = `2ndb-android-${rawRun.head_sha}`;
  if (!Array.isArray(artifacts) || (body.total_count !== undefined && body.total_count !== artifacts.length)) {
    throw new Error("QA 산출물 목록이 불완전하다");
  }
  const matches = artifacts.filter((a) => a.name === expected);
  if (matches.length !== 1) throw new Error(`QA 산출물 ${expected} 을 정확히 하나 확인하지 못했다`);
  const artifact = matches[0];
  const source = artifact.workflow_run;
  if (artifact.expired !== false || !source || source.id !== rawRun.id || source.head_sha !== rawRun.head_sha ||
      source.head_branch !== "main" || source.repository_id !== rawRun.repository.id ||
      source.head_repository_id !== rawRun.repository.id) {
    throw new Error(`QA 산출물 ${expected} 의 실행 · 커밋 · 저장소 또는 보존 상태가 다르다`);
  }
  return artifact;
}

function validateQaReleaseNotes(notes, expectedDigest, event, explicitRun, runId) {
  if ((explicitRun || event === "workflow_dispatch") && (!notes.digest || !notes.abi)) {
    throw new Error(`빌드 ${runId} 의 설정 digest 또는 ABI 주석이 없다 - 수동/지정 빌드는 올리지 않는다`);
  }
  if (notes.digest && notes.digest !== expectedDigest) throw new Error(`빌드 ${runId} 의 설정 digest 가 지금 설정과 다르다 - 올리지 않는다`);
  if (notes.abi && notes.abi !== PHONE_ABI) throw new Error(`빌드 ${runId} 는 ${notes.abi} 빌드다(폰은 ${PHONE_ABI}) - 올리지 않는다`);
}

async function waitRun(runId) {
  const deadline = Date.now() + 50 * 60 * 1000;
  for (;;) {
    const r = JSON.parse(gh(["run", "view", String(runId), "--repo", REPO, "--json", "databaseId,headSha,status,conclusion,createdAt,event"]));
    if (r.status === "completed" && r.conclusion) return r; // 결론이 채워질 때까지 기다린다
    if (Date.now() > deadline) throw new Error(`빌드 ${runId} 가 50분 안에 끝나지 않았다`);
    console.log(`빌드 ${runId} (${String(r.headSha).slice(0, 8)}): ${r.status} - 30초 뒤 다시 본다`);
    await sleep(30000);
  }
}

async function cmdQaRelease(argv) {
  const root = git(["rev-parse", "--show-toplevel"]);
  process.chdir(root);
  fetchMain(root);
  const target = git(["rev-parse", MAIN_REF]);
  const workflow = git(["show", `${target}:${WORKFLOW}`]);
  const { paths } = parseAndroidReleaseWorkflow(workflow);
  const vars = loadRepoVars();
  const localDigest = envDigest(appEnv(workflow, vars));
  const sameApp = (a, b) => sameAppCode(a, b, paths);
  const currentMain = () => {
    try {
      fetchMain(root);
    } catch {
      /* 오프라인이면 로컬의 origin/main */
    }
    return git(["rev-parse", MAIN_REF]);
  };

  const phone = latestPhoneApk();
  const runArg = flag(argv, "run");
  let runInfo = null;
  let pinnedRaw = null;
  if (runArg !== undefined) {
    const id = parseQaRunId(runArg);
    const pinnedWorkflow = JSON.parse(gh(["api", `repos/${REPO}/actions/workflows/android-release.yml`]));
    const readPinned = () => JSON.parse(gh(["api", `repos/${REPO}/actions/runs/${id}`]));
    pinnedRaw = readPinned();
    runInfo = validateQaRunMetadata(pinnedRaw, pinnedWorkflow, runArg);
    if (!sameApp(runInfo.headSha, target)) throw new Error(`빌드 ${id} 의 커밋이 origin/main 과 앱 코드가 다르다`);
    if (runInfo.status !== "completed" || !runInfo.conclusion) await waitRun(id);
    // 대기 뒤에도 API 원본을 다시 읽는다. 목록/CLI 캐시의 값만으로 게시 대상을 확정하지 않는다.
    pinnedRaw = readPinned();
    runInfo = validateQaRunMetadata(pinnedRaw, pinnedWorkflow, runArg);
  } else {
    // origin/main 과 같은 코드 · 같은 설정의 폰용 빌드를 고른다. 동시성 그룹이 중간 빌드를 건너뛰므로
    // origin/main 의 SHA 자체에는 빌드가 없을 수 있다(그 뒤 커밋이 문서뿐이면 앞 빌드가 같은 앱이다).
    // 진행 중인 빌드는 끝날 때까지 기다린다. 주석이 아직 없는 수동 빌드도 마찬가지다 - GitHub 는 주석을 빌드가
    // 끝난 뒤에야 보여 주므로(2026-09-30 실측) 끝나야 폰용 · 같은 설정인지 알 수 있다.
    let st = buildStatusFor(target, paths, root, localDigest, workflow, currentMain());
    while (st.state === "running" || (st.state === "unconfirmed" && st.run.status !== "completed")) {
      await waitRun(st.run.databaseId);
      st = buildStatusFor(target, paths, root, localDigest, workflow, currentMain());
    }
    if (st.state === "success") {
      runInfo = st.run;
    } else {
      // 같은 설정의 폰용 빌드가 없다(Variables 가 빌드 뒤 바뀜 · 게이트 · 실패 · 취소) - 기본 입력으로 새로 빌드한다.
      console.log(`같은 코드 · 같은 설정의 폰용 성공 빌드가 없다(${st.state}) - android-release 를 기본 입력으로 돌린다.`);
      const since = Date.now() - 5000;
      gh(["workflow", "run", "android-release.yml", "--repo", REPO, "--ref", "main"]);
      // 디스패치는 그 순간의 main 으로 돈다 - 기다리는 동안 main 이 움직였으면 target 과 SHA 가 다르다.
      let started = null;
      for (let i = 0; i < 20 && !started; i++) {
        await sleep(6000);
        started = listBuildRuns().filter((r) => r.event === "workflow_dispatch" && Date.parse(r.createdAt) >= since).pop() || null;
      }
      if (!started) throw new Error("새 빌드가 2분 안에 보이지 않았다 - Actions 탭에서 확인할 것");
      currentMain();
      if (!sameApp(started.headSha, target)) {
        console.log(`그사이 origin/main 에 앱 변경이 들어왔다 - 새 main ${String(started.headSha).slice(0, 8)} 의 빌드(런 ${started.databaseId})를 올린다.`);
      }
      runInfo = await waitRun(started.databaseId);
    }
  }
  if (runInfo.status !== "completed") runInfo = await waitRun(runInfo.databaseId);
  if (runInfo.conclusion !== "success") throw new Error(`빌드 ${runInfo.databaseId} 결과 ${runInfo.conclusion} - APK 를 올리지 않는다`);
  const requirePinnedCurrentApp = () => {
    if (!pinnedRaw) return;
    fetchMain(root); // 명시한 런은 최신 main 을 재조회할 수 없으면 게시하지 않는다.
    const now = git(["rev-parse", MAIN_REF]);
    if (!sameApp(runInfo.headSha, now)) throw new Error(`빌드 ${runInfo.databaseId} 와 현재 origin/main ${now.slice(0, 8)} 의 앱 코드가 다르다 - 올리지 않는다`);
  };
  requirePinnedCurrentApp();
  // 올릴 빌드의 커밋이 target 과 다르면(디스패치 사이 main 이 움직임) 그 커밋의 워크플로로 설정을 다시 계산한다.
  const expectedDigest =
    runInfo.headSha === target ? localDigest : envDigest(appEnv(git(["show", `${runInfo.headSha}:${WORKFLOW}`]), vars));
  const notesOfRun = buildNotes(runInfo.databaseId);
  validateQaReleaseNotes(notesOfRun, expectedDigest, runInfo.event, runArg !== undefined, runInfo.databaseId);
  if (pinnedRaw) {
    const artifacts = JSON.parse(gh(["api", `repos/${REPO}/actions/runs/${runInfo.databaseId}/artifacts?per_page=100`]));
    validateQaArtifactMetadata(artifacts, pinnedRaw);
  }
  if (phone && phone.runId && String(phone.runId) === String(runInfo.databaseId)) {
    console.log(`폰 APK ${phone.tag} 가 이미 이 빌드(런 ${runInfo.databaseId})다 - 새로 올리지 않는다.`);
    return;
  }

  const sha = runInfo.headSha;
  const sha8 = sha.slice(0, 8);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-apk-"));
  gh(["run", "download", String(runInfo.databaseId), "--repo", REPO, "-n", `2ndb-android-${sha}`, "-D", dir]);
  const found = fs.readdirSync(dir).find((f) => f.endsWith(".apk"));
  if (!found) throw new Error("내려받은 산출물에 APK 가 없다");
  const apkName = `2ndb-qa-${sha8}-arm64.apk`;
  const apk = path.join(dir, apkName);
  fs.renameSync(path.join(dir, found), apk);
  // 게시 직전에 APK 안을 직접 본다: 폰용 ABI 하나만 들어 있어야 한다.
  const abis = apkAbis(zipEntryNames(fs.readFileSync(apk)));
  if (abis.length !== 1 || abis[0] !== PHONE_ABI) throw new Error(`APK 의 네이티브 ABI 가 [${abis.join(", ")}] 다(폰은 ${PHONE_ABI} 하나) - 올리지 않는다`);
  const apkSha = crypto.createHash("sha256").update(fs.readFileSync(apk)).digest("hex");
  const sums = path.join(dir, `SHA256SUMS-${sha8}.txt`);
  fs.writeFileSync(sums, `${apkSha} *${apkName}\n`);

  let badge = "검증 도구(aapt2 · apksigner)가 없어 건너뜀";
  const aapt2 = findTool(process.platform === "win32" ? "aapt2.exe" : "aapt2");
  const signer = findTool(path.join("lib", "apksigner.jar"));
  if (aapt2 && signer) {
    const b = run(aapt2, ["dump", "badging", apk]);
    const pkg = (b.match(/^package: .*$/m) || ["package: ?"])[0];
    const abi = (b.match(/^native-code: .*$/m) || ["native-code: ?"])[0];
    const cert = (run("java", ["-jar", signer, "verify", "--print-certs", apk]).match(/certificate SHA-256 digest: ([0-9a-f]+)/) || [])[1];
    badge = `${pkg} · ${abi} · 서명 SHA-256 ${cert || "?"}`;
  }

  const { yymmdd, text } = kstStamp();
  // 같은 커밋을 설정만 바꿔 다시 빌드한 것(수동 실행)은 런 번호를 붙여 태그가 겹치지 않게 한다.
  const tag = `qa-${yymmdd}-${sha8}${runInfo.event === "workflow_dispatch" ? `-r${runInfo.databaseId}` : ""}`;
  const since = phone
    ? git(["log", "--oneline", "--no-merges", `${phone.sha}..${sha}`, "--", ...paths]).split("\n").filter(Boolean)
    : [];
  const notes = [
    "**QA 빌드 - 정식 릴리스 아님.** 폰에서 main 을 볼 때 올리는 진단 APK 입니다. localhost(8081)는 이 커밋의 origin/main 을 같은 설정으로 띄웁니다 (CLAUDE.md '앱과 localhost 는 같은 소프트웨어다').",
    "",
    `- 소스: \`main\` \`${sha}\``,
    `- 빌드: android-release.yml 런 ${runInfo.databaseId} (${runInfo.event || "push"}, GitHub Actions, EAS 미사용)`,
    `- 설정 digest: \`${notesOfRun.digest || "(이 단계 이전 빌드)"}\` · ABI ${abis.join(", ")}`,
    `- 확인: ${badge}`,
    `- 파일 sha256: \`${apkSha}\` (SHA256SUMS 첨부)`,
    `- 올린 시각: ${text}`,
    "",
    phone ? `## ${phone.tag} 이후 앱에 들어간 커밋 (${since.length}개)` : "## 커밋",
    ...(since.length ? since.slice(0, 40).map((l) => `- ${l}`) : ["- (없음)"]),
    ...(since.length > 40 ? [`- … 외 ${since.length - 40}개`] : []),
    "",
    "## 설치",
    "- 같은 진단 키로 서명했으므로 이전 QA APK 위에 그대로 덮어 설치됩니다(데이터 유지). Play · v0.8.0 설치본과는 서명이 달라 먼저 삭제해야 합니다.",
  ].join("\n");
  const notesFile = path.join(dir, "notes.md");
  fs.writeFileSync(notesFile, notes);
  requirePinnedCurrentApp();
  gh([
    "release", "create", tag, apk, sums, "--repo", REPO, "--target", sha, "--prerelease", "--latest=false",
    "--title", `QA 빌드 ${yymmdd} (main ${sha8}) - 정식 릴리스 아님`, "--notes-file", notesFile,
  ]);
  console.log(`올렸다: https://github.com/${REPO}/releases/tag/${tag}`);
  console.log(`APK   : https://github.com/${REPO}/releases/download/${tag}/${apkName}`);
  console.log(`sha256: ${apkSha}`);
  try {
    const now = currentMain();
    if (!sameApp(sha, now)) console.log(`⚠ 올리는 사이 origin/main(${now.slice(0, 8)})에 앱 변경이 더 들어왔다 - 폰에서 최신을 보려면 다시 실행`);
  } catch {
    /* 참고 정보 */
  }
}

// ---------------------------------------------------------------------------

module.exports = {
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
  patchAddedLines,
  patchPackageOf,
  stalePatchProblems,
  patchesDrift,
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
  processInfo,
  commandLineOf,
  portOwnerPid,
  strayServerPid,
  launchDetached,
  newLogFile,
  runPreflight,
  WORKFLOW,
  SELF,
  MAIN_REF,
  SIMON_PORT,
  LOCALHOST_WORKTREE,
  FOLLOW_INTERVAL_MS,
  APP_PARITY_PROTOCOL,
  DIGEST_ANNOTATION,
  ABI_ANNOTATION,
  PHONE_ABI,
  GATE_STEP,
  REFUSAL_TTL_MS,
  HANDOVER_BACKOFF_MS,
};

if (require.main === module) {
  const [cmd, ...argv] = process.argv.slice(2);
  const commands = {
    localhost: cmdLocalhost,
    serve: cmdServe,
    stop: cmdStop,
    status: cmdStatus,
    preflight: cmdPreflight,
    "qa-release": cmdQaRelease,
  };
  if (!commands[cmd]) {
    console.error(
      "사용법: node scripts/app-parity.cjs <localhost|serve|stop|status|preflight|qa-release> " +
        "[--open] [--restart] [--port=8082 --allow-diff --tier=<등급>] [--offline-defaults] [--ref=<sha>] [--run=<id>]",
    );
    process.exit(64);
  }
  Promise.resolve(commands[cmd](argv)).catch((e) => {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  });
}
