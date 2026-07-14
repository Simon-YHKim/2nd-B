#!/usr/bin/env node
// Is docs/flow-map.json still describing THIS code, or a past version of it?
//
// The flow map (docs/flow-map.json + FLOW-HANDOFF.md) hands a fresh session file:line coordinates
// for every screen and action. Those coordinates are only true for the commit the map was scanned
// at. Once the app moves on, they drift — silently — and a "verified" checkmark starts pointing at
// the wrong line. That already happened once: a map scanned at 1e41e34 had 64 wrong coordinates
// four merges later, each still wearing a checkmark.
//
// This is a SELF-CONTAINED check (no plugin dependency): it reads the fingerprint the map shipped
// with — the sha256 of every file the map anchors into — and recomputes them against the working
// tree. It is deliberately NON-BLOCKING: a drifting map is a docs-refresh signal, not a reason to
// fail an unrelated PR. It surfaces as a GitHub warning + a job-summary line so nobody has to
// remember to look. To make it blocking somewhere (a nightly job, say), pass --strict.
//
// Refresh drill when it warns:
//   node <flow-debugger>/scripts/check-stale.js   docs/flow-map.json .
//   node <flow-debugger>/scripts/rebase-anchors.js Output/flow-debugger/screenmap.*.json .   # follows line/file moves
//   node <flow-debugger>/scripts/make-handoff.js  Output/flow-debugger/screenmap.*.json . --out docs/FLOW-HANDOFF.md --json docs/flow-map.json
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const strict = process.argv.includes('--strict');
const FP = path.join(__dirname, '..', 'docs', 'flow-map.fingerprint.json');
const root = path.join(__dirname, '..');

// same hash the map was built with: sha256 of the file, CRLF normalised, first 16 hex chars
const sha = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

function summary(line) {
  // GitHub step summary, when running in Actions — a durable, visible note on the run
  const f = process.env.GITHUB_STEP_SUMMARY;
  if (f) { try { fs.appendFileSync(f, line + '\n'); } catch (e) { /* not fatal */ } }
}

if (!fs.existsSync(FP)) {
  console.log('flow-map fingerprint 없음 — 낡음 점검을 건너뜁니다 (docs/flow-map.fingerprint.json).');
  process.exit(0);   // absence is not staleness; the map may simply not ship a fingerprint yet
}

const fp = JSON.parse(fs.readFileSync(FP, 'utf8'));
const files = (fp && fp.files) || {};
const builtAt = fp.git && fp.git.head ? String(fp.git.head).slice(0, 8) : '?';

const changed = [];
const gone = [];
for (const [rel, was] of Object.entries(files)) {
  let now;
  try { now = sha(fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n')); }
  catch (e) { gone.push(rel); continue; }
  if (now !== was) changed.push(rel);
}

const total = Object.keys(files).length;
const stale = changed.length + gone.length;

if (!stale) {
  console.log(`flow-map FRESH — 앵커한 ${total}개 파일이 지도(커밋 ${builtAt}) 그대로입니다.`);
  summary(`✅ flow-map FRESH — ${total} anchored files unchanged since \`${builtAt}\`.`);
  process.exit(0);
}

// A GitHub Actions warning annotation shows up on the run without failing it.
const head = `flow-map STALE — 지도(커밋 ${builtAt}) 이후 ${stale}/${total} 파일이 바뀌었습니다. `
  + `docs/flow-map.json 의 좌표가 틀렸을 수 있어요 (변경 ${changed.length} · 사라짐 ${gone.length}).`;
console.log('::warning title=flow-map is stale::' + head);
console.log(head);
[...changed.map(f => '  변경 ' + f), ...gone.map(f => '  사라짐 ' + f)].slice(0, 40).forEach(l => console.log(l));
if (stale > 40) console.log(`  … 그 외 ${stale - 40}개`);
console.log('\n새로고침: check-stale → rebase-anchors → make-handoff (파일 상단 주석 참고).');

summary(`⚠️ **flow-map STALE** — ${stale}/${total} files changed since \`${builtAt}\`. `
  + `\`docs/flow-map.json\` coordinates may be wrong; refresh with rebase-anchors + make-handoff.`);

process.exit(strict ? 1 : 0);   // non-blocking by default; --strict for a gate that should fail
