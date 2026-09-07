// Did this pull actually leave the shared install behind?
//
// "package-lock.json changed" is not the same claim as "the install is stale" -
// npm may already have the right versions on disk. On 2026-09-08 a peer session
// took the first as the second, ran a targeted install to fix it, and npm removed
// ten packages that nothing had asked it to touch. The lockfile had changed and
// the install had zero version mismatches.
//
// So measure instead of inferring, and measure only what moved: the packages
// whose lockfile entry changed in this fast-forward. Everything else was already
// correct or already wrong before this hook ran.
//
// Usage: node lockfile-drift.mjs <before-sha> <after-sha>
// Prints one line per real mismatch, then a verdict. Never throws.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const [beforeSha, afterSha] = process.argv.slice(2);
if (!beforeSha || !afterSha) {
  console.log("사용법: lockfile-drift.mjs <before> <after>");
  process.exit(0);
}

const git = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28 });

let diff = "";
try {
  diff = git(["diff", "--unified=0", `${beforeSha}..${afterSha}`, "--", "package-lock.json"]);
} catch {
  console.log("락파일 diff 를 읽지 못했습니다 — 판정 보류");
  process.exit(0);
}
if (!diff.trim()) {
  console.log("락파일 변경 없음");
  process.exit(0);
}

// Added lines name the entries this pull now wants. A path key looks like
//   "node_modules/pkg": {      or      "node_modules/a/node_modules/b": {
const wanted = new Set();
for (const line of diff.split("\n")) {
  if (!line.startsWith("+")) continue;
  const m = line.match(/^\+\s*"(node_modules\/[^"]+)":\s*\{/);
  if (m) wanted.add(m[1]);
}
if (wanted.size === 0) {
  console.log("락파일이 바뀌었지만 패키지 항목 변경은 없습니다 (메타데이터만)");
  process.exit(0);
}

let lock;
try {
  lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
} catch {
  console.log("package-lock.json 을 읽지 못했습니다 — 판정 보류");
  process.exit(0);
}
const packages = lock.packages || {};

const mismatch = [];
const missing = [];
let checked = 0;
for (const key of wanted) {
  const entry = packages[key];
  if (!entry || typeof entry.version !== "string") continue;
  checked += 1;
  let installed = null;
  try {
    installed = JSON.parse(readFileSync(`${key}/package.json`, "utf8")).version;
  } catch {
    // Optional dependencies are allowed to be absent - that is not drift.
    if (entry.optional === true || entry.dev === true) continue;
    missing.push(key.replace(/^node_modules\//, ""));
    continue;
  }
  if (installed !== entry.version) {
    mismatch.push(`${key.replace(/^node_modules\//, "")}  설치 ${installed} ≠ 락 ${entry.version}`);
  }
}

console.log(`이 pull 이 바꾼 패키지 ${checked}개를 실측했습니다`);
if (mismatch.length === 0 && missing.length === 0) {
  console.log("불일치 0 · 필수 미설치 0 — 설치본은 락파일과 맞습니다. 재설치 불필요");
  process.exit(0);
}
mismatch.slice(0, 8).forEach((m) => console.log(`  버전 불일치  ${m}`));
missing.slice(0, 8).forEach((m) => console.log(`  필수 미설치  ${m}`));
if (mismatch.length + missing.length > 16) console.log(`  … 외 ${mismatch.length + missing.length - 16}건`);
console.log("→ 조용한 때에:  npm ci --legacy-peer-deps");
console.log("  (개별 패키지 install 은 쓰지 마십시오 — npm 이 다른 것을 같이 지웁니다)");
