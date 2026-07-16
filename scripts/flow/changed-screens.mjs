// Map the source files a PR changed to the flow-debugger screen routes they back,
// so CI re-shoots exactly those screens (not all 80). Prints a comma-separated route list.
//
// usage: node scripts/flow/changed-screens.mjs <baseRef>   # diffs <baseRef>...HEAD
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const base = process.argv[2] || 'origin/main';
let files = [];
try {
  files = execSync(`git diff --name-only ${base}...HEAD -- "src/**" app.json`, { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);
} catch { /* no diff / detached — leaves files empty */ }

const g = JSON.parse(readFileSync('docs/flow-map.json', 'utf8'));
const screens = g.screens || [];
const fileOf = a => String(a || '').split(':')[0].replace(/\\/g, '/').trim();
const changed = new Set(files.map(f => f.replace(/\\/g, '/')));

const routes = [];
for (const s of screens) {
  const r = s.route; if (!r) continue;
  const anchors = [s.rendersInProduction, s.renders]
    .concat((s.actions || []).flatMap(a => [a.file, a.impl]))
    .map(fileOf).filter(Boolean);
  if (anchors.some(f => changed.has(f))) routes.push(r);
}
process.stdout.write([...new Set(routes)].join(','));
