#!/usr/bin/env node
// 앱과 localhost 는 같은 소프트웨어다 (Simon 결정, 2026-09-29).
//
//   node scripts/app-parity.cjs localhost   (= npm run localhost / npm run web)
//     폰 APK 와 같은 코드 · 같은 EXPO_PUBLIC_* 값 · 같은 릴리스 모드로 웹을 띄운다.
//   node scripts/app-parity.cjs status      (= npm run app:parity)
//     지금 localhost 가 보여 주는 코드와 폰 QA APK 의 코드를 앱 경로 기준으로 대조한다.
//   node scripts/app-parity.cjs qa-release  (= npm run app:qa-release)
//     main 의 android-release APK 를 QA pre-release 로 올려 폰 앱을 localhost 와 맞춘다.
//
// 정본은 .github/workflows/android-release.yml 하나다. 폰 APK 는 그 파일의 jobs.build.env
// 로 빌드되고, 그 파일의 on.push.paths 가 '앱에 들어가는 파일' 이다. 이 스크립트는 둘을
// 실행할 때마다 그 파일에서 읽는다. 값을 여기 복사해 두지 않는다 - 복사본은 반드시 갈라진다.
//
// 왜 필요했나 (2026-09-29 실측): Simon 이 보던 localhost 는 다른 워크트리의 개발 서버였다.
// main 보다 뒤처진 기반 위에 미커밋 파일 586개, 워크트리 .env 의 EXPO_PUBLIC_FORCE_TIER 로
// 유료 등급 강제, 개발 모드. 같은 앱처럼 보였지만 코드 · 설정 · 모드가 모두 폰 APK 와 달랐다.
"use strict";

const { spawn, spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const REPO = "Simon-YHKim/2nd-B";
const WORKFLOW = ".github/workflows/android-release.yml";
// Simon 이 브라우저로 보는 자리. 이 포트는 폰 APK 와 코드가 같을 때만 띄운다.
const SIMON_PORT = 8081;

// ---------------------------------------------------------------------------
// android-release.yml 읽기
// ---------------------------------------------------------------------------

/** on.push.paths 목록과 jobs.build.env 항목(원문 값)을 읽는다. 모르는 모양이면 멈춘다. */
function parseAndroidReleaseWorkflow(text) {
  const doc = require("yaml").parse(String(text));
  const paths = doc && doc.on && doc.on.push && doc.on.push.paths;
  if (!Array.isArray(paths) || paths.length === 0) throw new Error(`${WORKFLOW}: on.push.paths 를 찾지 못했다`);
  const block = doc.jobs && doc.jobs.build && doc.jobs.build.env;
  if (!block || typeof block !== "object") throw new Error(`${WORKFLOW}: jobs.build.env 를 찾지 못했다`);
  const env = Object.entries(block).map(([key, raw]) => ({ key, raw: raw === null ? "" : String(raw) }));
  if (env.length === 0) throw new Error(`${WORKFLOW}: jobs.build.env 가 비어 있다`);
  return { paths: paths.map(String), env };
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

/** `git status --porcelain -z` 출력에서 경로만 꺼낸다(이름 바꾸기는 새 이름). */
function parsePorcelainZ(out) {
  const parts = String(out).split("\0");
  const files = [];
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (entry.length < 4) continue;
    files.push(entry.slice(3));
    if (entry[0] === "R" || entry[0] === "C") i++; // 다음 칸은 옛 이름
  }
  return files;
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
const gh = (args) => run("gh", args).trim();

function loadRepoVars() {
  const list = JSON.parse(gh(["variable", "list", "--repo", REPO, "--json", "name,value"]) || "[]");
  return Object.fromEntries(list.map((v) => [v.name, v.value]));
}

/** 폰에 올린 가장 최근 QA APK(태그 qa-*, pre-release)와 그 소스 커밋. */
function latestPhoneApk() {
  const list = JSON.parse(
    gh(["release", "list", "--repo", REPO, "--limit", "50", "--json", "tagName,isPrerelease,publishedAt"]) || "[]",
  );
  const qa = list
    .filter((r) => r.isPrerelease && /^qa-/.test(r.tagName))
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))[0];
  if (!qa) return null;
  const v = JSON.parse(gh(["release", "view", qa.tagName, "--repo", REPO, "--json", "tagName,targetCommitish,url"]));
  if (!/^[0-9a-f]{40}$/.test(v.targetCommitish)) {
    throw new Error(`${qa.tagName} 의 대상이 커밋 SHA 가 아니다(${v.targetCommitish}) - QA 릴리스는 --target <SHA> 로 만든다`);
  }
  return { tag: v.tagName, sha: v.targetCommitish, url: v.url };
}

/** 작업 트리(root)의 코드와 폰 APK 커밋을 앱 경로로 대조한다. differing 이 비면 같은 앱. */
function compareWithPhone(root, paths) {
  try {
    git(["fetch", "--quiet", "origin"], root);
  } catch {
    /* 오프라인이면 로컬에 있는 커밋으로만 본다 */
  }
  const phone = latestPhoneApk();
  const head = git(["rev-parse", "HEAD"], root);
  const dirty = parsePorcelainZ(run("git", ["status", "--porcelain", "-z", "-uall"], { cwd: root })).filter((f) =>
    isAppPath(f, paths),
  );
  if (!phone) return { phone: null, head, dirty, differing: null };
  const committed = gitZ(["diff", "--name-only", "-z", phone.sha, "HEAD", "--", ...paths], root);
  return { phone, head, dirty, differing: [...new Set([...committed, ...dirty])].sort() };
}

/**
 * 설치된 node_modules 가 그 체크아웃의 package-lock.json 과 이름 · 버전이 같은가. 폰 APK 는 CI 에서
 * `npm ci` 로 lockfile 그대로 설치해 번들을 만든다. 워크트리는 정본 체크아웃의 설치를 정션으로
 * 같이 쓰므로, 그 설치가 낡으면 코드가 같아도 번들이 달라진다(조용히). 다른 항목을 돌려준다.
 */
function nodeModulesDrift(root) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8")).packages || {};
  let inst;
  try {
    inst = JSON.parse(fs.readFileSync(path.join(root, "node_modules", ".package-lock.json"), "utf8")).packages || {};
  } catch {
    return ["node_modules/.package-lock.json 을 읽지 못했다(설치가 없다)"];
  }
  const out = [];
  for (const [k, v] of Object.entries(lock)) {
    if (!k.startsWith("node_modules/")) continue;
    const i = inst[k];
    if (!i) {
      if (!v.optional) out.push(`${k.slice(13)} 없음`); // 다른 플랫폼용 optional 은 원래 안 깔린다
    } else if (i.version !== v.version) {
      out.push(`${k.slice(13)} ${i.version} (lock ${v.version})`);
    }
  }
  for (const k of Object.keys(inst)) if (k.startsWith("node_modules/") && !lock[k]) out.push(`${k.slice(13)} 여분`);
  return out;
}

// localhost 기록은 git 공통 디렉터리에 둔다 - 어느 워크트리에서 status 를 쳐도 같은 기록을 본다.
function markerPath(port) {
  const common = path.resolve(git(["rev-parse", "--git-common-dir"]));
  return path.join(common, "app-parity", `localhost-${port}.json`);
}

function readMarker(port) {
  try {
    return JSON.parse(fs.readFileSync(markerPath(port), "utf8"));
  } catch {
    return null;
  }
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
  return { yymmdd: `${p.year}${p.month}${p.day}`, text: `20${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} KST` };
}

function flag(argv, name) {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : true;
}

// ---------------------------------------------------------------------------
// localhost
// ---------------------------------------------------------------------------

const TIERS = ["off", "free", "soma", "cortex", "brain"];

async function cmdLocalhost(argv) {
  const port = Number(flag(argv, "port") || SIMON_PORT);
  const offline = Boolean(flag(argv, "offline-defaults"));
  const allowDiff = Boolean(flag(argv, "allow-diff"));
  const tier = flag(argv, "tier");
  if (tier !== undefined && !TIERS.includes(tier)) {
    console.error(`✗ --tier 는 ${TIERS.join(" | ")} 중 하나다`);
    process.exit(64);
  }
  if (tier !== undefined && (port === SIMON_PORT || !allowDiff)) {
    console.error(`✗ --tier 는 폰 앱과 다른 설정이다. ${SIMON_PORT} 이 아닌 --port 와 --allow-diff 를 함께 쓸 때만 받는다(세션 자체 확인용).`);
    process.exit(4);
  }
  const root = git(["rev-parse", "--show-toplevel"]);
  process.chdir(root);

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
    if (port === SIMON_PORT) {
      console.error(`✗ --offline-defaults 로는 ${SIMON_PORT} 을 띄우지 않는다(앱과 다를 수 있다). 다른 --port 를 쓸 것.`);
      process.exit(2);
    }
    console.warn("⚠ --offline-defaults: 저장소 Variables 없이 워크플로 기본값으로 띄운다. 앱과 다를 수 있다.");
  }
  const env = appEnv(workflow, vars);
  const digest = envDigest(env);
  if (tier !== undefined) env.EXPO_PUBLIC_FORCE_TIER = tier; // digest 는 앱 설정 그대로 - 차이는 기록의 tier 로 남긴다

  if (await portInUse(port)) {
    const m = readMarker(port);
    const who = m && alive(m.pid) ? `npm run localhost 가 ${m.root} 에서 띄운 서버(pid ${m.pid})` : "기록 없는 서버(직접 띄운 expo start 일 수 있다)";
    console.error(`✗ ${port} 포트를 이미 쓰고 있다: ${who}. 먼저 멈춘 뒤 다시 실행할 것.`);
    process.exit(3);
  }

  const cmp = compareWithPhone(root, paths);
  const drift = nodeModulesDrift(root);
  const same = Boolean(cmp.phone) && cmp.differing.length === 0 && drift.length === 0 && tier === undefined;
  console.log("━━━ 앱과 같은 localhost (CLAUDE.md '앱과 localhost 는 같은 소프트웨어다') ━━━");
  console.log(`코드      : ${root} @ ${cmp.head.slice(0, 8)}${cmp.dirty.length ? ` + 미커밋 앱 파일 ${cmp.dirty.length}개` : ""}`);
  console.log(`의존성    : ${drift.length ? `⚠ package-lock 과 다른 설치 ${drift.length}개 (${drift.slice(0, 3).join(" · ")})` : "package-lock 과 같음"}`);
  console.log(`설정      : ${WORKFLOW} env 의 EXPO_PUBLIC_* ${Object.keys(env).length}개 · .env 무시 · digest ${digest.slice(0, 12)}`);
  console.log(
    `등급 강제 : EXPO_PUBLIC_FORCE_TIER=${env.EXPO_PUBLIC_FORCE_TIER} · ALLOW_DEV_TIER=${env.EXPO_PUBLIC_ALLOW_DEV_TIER}` +
      (tier === undefined ? " (폰 앱과 같음)" : ` (⚠ --tier 로 바꿈 - 폰 앱과 다름)`),
  );
  console.log("모드      : 릴리스(--no-dev --minify) · 이 서버 전용 Metro 캐시");
  if (cmp.phone) {
    console.log(`폰 APK    : ${cmp.phone.tag} (${cmp.phone.sha.slice(0, 8)}) → ${same ? "앱 경로 차이 0, 같은 앱" : `⚠ 앱 경로 차이 ${cmp.differing.length}개`}`);
    for (const f of cmp.differing.slice(0, 15)) console.log(`   - ${f}`);
    if (cmp.differing.length > 15) console.log(`   … 외 ${cmp.differing.length - 15}개`);
  } else {
    console.log("폰 APK    : QA pre-release 가 없다 (npm run app:qa-release 로 만든다)");
  }
  if (!same) {
    if (port === SIMON_PORT) {
      console.error(`✗ ${SIMON_PORT} 은 폰 앱과 같은 코드 · 의존성만 띄운다. 이 차이는 폰 앱에 없다.`);
      console.error("  코드: PR → main 머지 → npm run app:qa-release (새 QA APK) → main 체크아웃에서 npm run localhost.");
      if (drift.length) console.error("  의존성: 정본 체크아웃의 설치를 main 의 package-lock 으로 맞춘다(정션 워크트리 안에서 npm ci 하지 말 것).");
      process.exit(4);
    }
    if (!allowDiff) {
      console.error(`✗ 폰 앱과 다른 코드다. 세션 자체 확인용이면 --allow-diff 를 붙인다(${port} 은 Simon 에게 앱으로 보여주지 않는다).`);
      process.exit(4);
    }
    console.warn(`⚠ --allow-diff: ${port} 은 폰 앱과 다른 코드다. 세션 자체 확인용이며 앱 화면으로 보고하지 않는다.`);
  }
  console.log(`주소      : http://localhost:${port}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Metro 기본 캐시(os.tmpdir()/metro-cache)는 모든 워크트리 · 세션이 같이 쓴다. 다른 설정으로 뜬
  // 서버가 변환해 둔 파일에 그 서버의 EXPO_PUBLIC_* 값이 박혀 있을 수 있으므로 이 서버만의 임시
  // 디렉터리를 준다. --clear 는 그 전용 캐시만 비운다.
  const tmp = path.join(os.tmpdir(), `2ndb-app-parity-${port}`);
  fs.mkdirSync(tmp, { recursive: true });
  const childEnv = { ...process.env };
  for (const k of Object.keys(childEnv)) if (/^EXPO_PUBLIC_/i.test(k)) delete childEnv[k];
  Object.assign(childEnv, env, { EXPO_NO_DOTENV: "1", TMPDIR: tmp, TEMP: tmp, TMP: tmp });

  // --localhost 는 넣지 않는다: 그러면 ::1 에만 떠서 127.0.0.1 로 여는 도구가 못 붙는다(2026-09-29 실측).
  const expoArgs = ["expo", "start", "--port", String(port), "--no-dev", "--minify", "--clear"];
  if (flag(argv, "open")) expoArgs.push("--web");
  // Windows 의 npx 는 .cmd 라 셸이 필요하다. 인자는 위 고정 토큰뿐이므로 한 줄 명령으로 넘긴다.
  const child =
    process.platform === "win32"
      ? spawn(`npx.cmd ${expoArgs.join(" ")}`, { stdio: "inherit", env: childEnv, shell: true })
      : spawn("npx", expoArgs, { stdio: "inherit", env: childEnv });

  const marker = markerPath(port);
  fs.mkdirSync(path.dirname(marker), { recursive: true });
  fs.writeFileSync(
    marker,
    JSON.stringify(
      {
        root,
        port,
        pid: process.pid,
        childPid: child.pid,
        servedSha: cmp.head,
        phoneTag: cmp.phone ? cmp.phone.tag : null,
        phoneSha: cmp.phone ? cmp.phone.sha : null,
        allowDiff,
        tier: tier === undefined ? null : tier,
        envDigest: digest,
        envKeys: Object.keys(env).length,
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  const cleanup = () => {
    try {
      const m = readMarker(port);
      if (m && m.pid === process.pid) fs.unlinkSync(marker);
    } catch {
      /* 이미 없음 */
    }
  };
  child.on("exit", (code) => {
    cleanup();
    process.exit(code ?? 0);
  });
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

async function cmdStatus(argv) {
  const port = Number(flag(argv, "port") || SIMON_PORT);
  const m = readMarker(port);
  const listening = await portInUse(port);
  const problems = [];

  let root = git(["rev-parse", "--show-toplevel"]);
  if (!listening) problems.push(`localhost:${port} 이 응답하지 않는다`);
  if (!m || !alive(m.pid)) {
    problems.push(listening ? `${port} 의 서버는 npm run localhost 로 띄운 것이 아니다(기록 없음)` : "npm run localhost 기록이 없다");
  } else {
    root = m.root;
  }
  console.log(`localhost : ${listening ? `http://localhost:${port} 응답` : `${port} 응답 없음`}${m && alive(m.pid) ? ` · ${m.root} 에서 ${m.startedAt} 에 띄움` : ""}`);

  const workflow = fs.readFileSync(path.join(root, WORKFLOW), "utf8");
  const { paths } = parseAndroidReleaseWorkflow(workflow);
  if (m && alive(m.pid)) {
    try {
      const app = appEnv(workflow, loadRepoVars());
      const now = envDigest(app);
      if (now !== m.envDigest) problems.push("띄운 뒤 앱 빌드 설정(워크플로 env · 저장소 Variables)이 바뀌었다 - 다시 띄울 것");
      if (m.tier) problems.push(`--tier=${m.tier} 로 등급을 바꾼 서버다(폰 앱은 ${app.EXPO_PUBLIC_FORCE_TIER})`);
      console.log(`설정      : ${now === m.envDigest && !m.tier ? "폰 APK 빌드 설정과 같음" : "⚠ 다름"} (digest ${m.envDigest.slice(0, 12)})`);
    } catch (e) {
      problems.push(`설정을 대조하지 못했다(${e.message.slice(0, 120)})`);
    }
    if (m.allowDiff) problems.push("--allow-diff 로 띄운 서버다(세션 확인용)");
  }

  const drift = nodeModulesDrift(root);
  console.log(`의존성    : ${drift.length ? `⚠ package-lock 과 다른 설치 ${drift.length}개` : "package-lock 과 같음"}`);
  for (const d of drift.slice(0, 10)) console.log(`   - ${d}`);
  if (drift.length) problems.push(`node_modules 가 package-lock 과 ${drift.length}곳 다르다(폰 APK 는 lockfile 그대로 설치한다)`);

  const cmp = compareWithPhone(root, paths);
  if (!cmp.phone) {
    problems.push("QA pre-release(폰 APK)가 없다");
  } else {
    console.log(`폰 APK    : ${cmp.phone.tag} (${cmp.phone.sha.slice(0, 8)})`);
    console.log(`코드      : ${root} @ ${cmp.head.slice(0, 8)} + 미커밋 앱 파일 ${cmp.dirty.length}개 → 앱 경로 차이 ${cmp.differing.length}개`);
    for (const f of cmp.differing.slice(0, 30)) console.log(`   - ${f}`);
    if (cmp.differing.length > 30) console.log(`   … 외 ${cmp.differing.length - 30}개`);
    if (cmp.differing.length) problems.push(`폰 APK 에 없는 앱 경로 차이 ${cmp.differing.length}개`);
  }

  if (problems.length === 0) {
    console.log("결론      : 같음 - localhost 와 폰 앱이 같은 소프트웨어다");
    process.exit(0);
  }
  console.log("결론      : 다름");
  for (const p of problems) console.log(`   · ${p}`);
  console.log("   → 코드 차이는 PR → main 머지 → npm run app:qa-release, 서버는 main 체크아웃에서 npm run localhost 로 다시 띄운다.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// qa-release
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function listPushRuns() {
  return JSON.parse(
    gh([
      "run", "list", "--repo", REPO, "--workflow", "android-release.yml", "--branch", "main", "--event", "push",
      "--limit", "50", "--json", "databaseId,headSha,status,conclusion,createdAt",
    ]) || "[]",
  ).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function cmdQaRelease(argv) {
  const root = git(["rev-parse", "--show-toplevel"]);
  process.chdir(root);
  git(["fetch", "--quiet", "origin"]);
  const target = git(["rev-parse", "origin/main"]);
  const { paths } = parseAndroidReleaseWorkflow(git(["show", `${target}:${WORKFLOW}`]));
  const sameApp = (a, b) => a === b || gitZ(["diff", "--name-only", "-z", a, b, "--", ...paths]).length === 0;

  const phone = latestPhoneApk();
  if (phone && sameApp(phone.sha, target)) {
    console.log(`폰 APK ${phone.tag}(${phone.sha.slice(0, 8)})와 origin/main ${target.slice(0, 8)} 사이에 앱 경로 차이가 없다 - 이미 같은 앱이다. 새로 올리지 않는다.`);
    return;
  }

  // origin/main 과 앱 코드가 같은 가장 최근 push 빌드를 고른다. 동시성 그룹이 중간 빌드를 건너뛰므로
  // origin/main 의 SHA 자체에는 빌드가 없을 수 있다(그 뒤 커밋이 문서뿐이면 앞 빌드가 같은 앱이다).
  const runArg = flag(argv, "run");
  const pick = () => {
    const runs = listPushRuns();
    if (runArg) return runs.find((r) => String(r.databaseId) === String(runArg)) || null;
    return runs.find((r) => !(r.status === "completed" && r.conclusion !== "success") && sameApp(r.headSha, target)) || null;
  };
  let runInfo = pick();
  if (!runInfo) {
    throw new Error(
      `origin/main ${target.slice(0, 8)} 과 같은 앱 코드의 android-release push 빌드가 없다(아직 트리거 전이거나 취소됨). ` +
        "몇 분 뒤 다시 실행하거나, gh workflow run android-release.yml --ref main 을 기본 입력으로 돌린 뒤 --run=<id> 로 지정한다.",
    );
  }
  if (!sameApp(runInfo.headSha, target)) throw new Error(`빌드 ${runInfo.databaseId} 의 커밋이 origin/main 과 앱 코드가 다르다`);
  const deadline = Date.now() + 50 * 60 * 1000;
  while (runInfo.status !== "completed") {
    if (Date.now() > deadline) throw new Error(`빌드 ${runInfo.databaseId} 가 50분 안에 끝나지 않았다`);
    console.log(`빌드 ${runInfo.databaseId} (${runInfo.headSha.slice(0, 8)}): ${runInfo.status} - 30초 뒤 다시 본다`);
    await sleep(30000);
    runInfo = listPushRuns().find((r) => r.databaseId === runInfo.databaseId) || runInfo;
  }
  if (runInfo.conclusion !== "success") throw new Error(`빌드 ${runInfo.databaseId} 결과 ${runInfo.conclusion} - APK 를 올리지 않는다`);

  const sha = runInfo.headSha;
  const sha8 = sha.slice(0, 8);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-apk-"));
  gh(["run", "download", String(runInfo.databaseId), "--repo", REPO, "-n", `2ndb-android-${sha}`, "-D", dir]);
  const found = fs.readdirSync(dir).find((f) => f.endsWith(".apk"));
  if (!found) throw new Error("내려받은 산출물에 APK 가 없다");
  const apkName = `2ndb-qa-${sha8}-arm64.apk`;
  const apk = path.join(dir, apkName);
  fs.renameSync(path.join(dir, found), apk);
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
  const tag = `qa-${yymmdd}-${sha8}`;
  const since = phone
    ? git(["log", "--oneline", "--no-merges", `${phone.sha}..${sha}`, "--", ...paths]).split("\n").filter(Boolean)
    : [];
  const notes = [
    "**QA 빌드 - 정식 릴리스 아님.** 폰 앱을 localhost 와 같은 소프트웨어로 맞추는 진단 APK 입니다 (CLAUDE.md '앱과 localhost 는 같은 소프트웨어다').",
    "",
    `- 소스: \`main\` \`${sha}\``,
    `- 빌드: android-release.yml 런 ${runInfo.databaseId} (GitHub Actions, EAS 미사용)`,
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
  gh([
    "release", "create", tag, apk, sums, "--repo", REPO, "--target", sha, "--prerelease", "--latest=false",
    "--title", `QA 빌드 ${yymmdd} (main ${sha8}) - 정식 릴리스 아님`, "--notes-file", notesFile,
  ]);
  console.log(`올렸다: https://github.com/${REPO}/releases/tag/${tag}`);
  console.log(`APK   : https://github.com/${REPO}/releases/download/${tag}/${apkName}`);
  console.log(`sha256: ${apkSha}`);
}

// ---------------------------------------------------------------------------

module.exports = {
  parseAndroidReleaseWorkflow,
  resolveEnvValue,
  appEnv,
  envDigest,
  isAppPath,
  parsePorcelainZ,
  nodeModulesDrift,
  WORKFLOW,
  SIMON_PORT,
};

if (require.main === module) {
  const [cmd, ...argv] = process.argv.slice(2);
  const commands = { localhost: cmdLocalhost, status: cmdStatus, "qa-release": cmdQaRelease };
  if (!commands[cmd]) {
    console.error(
      "사용법: node scripts/app-parity.cjs <localhost|status|qa-release> [--port=8081] [--open] [--allow-diff] [--tier=<등급>] [--offline-defaults] [--run=<id>]",
    );
    process.exit(64);
  }
  Promise.resolve(commands[cmd](argv)).catch((e) => {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  });
}
