#!/usr/bin/env node
/**
 * validate-data.mjs — integrity checks for the proto_rev2 JSON data layer.
 *
 * Checks:
 *  1. every file in data/index.json parses and is not a leftover {"__stub": true}
 *  2. screens.json: unique ids, valid layout enum, ≥1 root, canvas sane
 *  3. every screens.json component name is actually exported to window by some
 *     reference-app script (window.X = / Object.assign(window, {...}))
 *  4. nav tab ids exist in screens.json as roots; constellation star routes exist
 *  5. every "assets/..." string in any data file points to a real file
 *  6. every "icon" field value resolves in icons.json (warn only — the Icon
 *     component falls back to 'workspaces', same as before the extraction)
 *
 * Run from design/proto_rev2: node tools/validate-data.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..', 'reference-app');
const errors = [];
const warns = [];

const J = (rel) => JSON.parse(readFileSync(path.join(APP, rel), 'utf8'));

// 1. manifest + parse + stub check
const manifest = J('data/index.json');
const data = {};
for (const [key, rel] of Object.entries(manifest.files)) {
  try {
    data[key] = J(rel);
    if (data[key] && data[key].__stub) errors.push(`stub not filled: ${rel} (key ${key})`);
  } catch (e) {
    errors.push(`parse failed: ${rel} — ${e.message}`);
  }
}

// 2. screens registry
const reg = data.screens;
if (!reg || !Array.isArray(reg.screens)) errors.push('screens.json missing screens[]');
else {
  const ids = new Set();
  for (const s of reg.screens) {
    if (ids.has(s.id)) errors.push(`duplicate screen id: ${s.id}`);
    ids.add(s.id);
    if (!['immersive', 'museumLike', 'windowed'].includes(s.layout)) errors.push(`bad layout for ${s.id}: ${s.layout}`);
    if (!s.component) errors.push(`no component for ${s.id}`);
  }
  if (!reg.screens.some((s) => s.root)) errors.push('no root screens');
  if (reg.canvas.w !== 390 || reg.canvas.h !== 820) errors.push(`canvas changed: ${reg.canvas.w}x${reg.canvas.h}`);

  // 3. component exports
  const srcs = readdirSync(APP).filter((f) => f.endsWith('.jsx') || f.endsWith('.js'))
    .map((f) => readFileSync(path.join(APP, f), 'utf8')).join('\n');
  const exported = new Set();
  for (const m of srcs.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) exported.add(m[1]);
  for (const m of srcs.matchAll(/Object\.assign\(window,\s*\{([\s\S]*?)\}\)/g)) {
    for (const id of m[1].split(/[,\s:]+/)) if (/^[A-Za-z_$][\w$]*$/.test(id)) exported.add(id);
  }
  for (const s of reg.screens) {
    if (!exported.has(s.component)) errors.push(`component not window-exported anywhere: ${s.component} (screen ${s.id})`);
  }

  // 4. cross-refs
  for (const t of (data.nav?.tabs || [])) {
    const hit = reg.screens.find((s) => s.id === t.id);
    if (!hit) errors.push(`nav tab has no screen: ${t.id}`);
    else if (!hit.root) errors.push(`nav tab is not a root screen: ${t.id}`);
  }
  for (const st of (data.constellation?.stars || [])) {
    if (st.route && !reg.screens.find((s) => s.id === st.route)) errors.push(`star route has no screen: ${st.id} → ${st.route}`);
  }
}

// 5+6. walk all data for asset paths and icon fields
const iconSet = new Set(Object.keys(data.icons?.icons || {}));
function walk(node, file) {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, file));
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'string' && v.startsWith('assets/') && /\.(png|jpg|jpeg|webp|svg|avif)$/i.test(v)) {
        if (!existsSync(path.join(APP, v))) errors.push(`missing asset in ${file}: ${v}`);
      }
      if (k === 'icon' && typeof v === 'string' && !iconSet.has(v)) {
        warns.push(`icon not in icons.json (falls back to 'workspaces'): "${v}" in ${file}`);
      }
      walk(v, file);
    }
  }
}
for (const [key, rel] of Object.entries(manifest.files)) if (data[key]) walk(data[key], rel);

for (const w of warns) console.log('WARN ', w);
for (const e of errors) console.log('ERROR', e);
console.log(`\n${Object.keys(manifest.files).length} data files · ${errors.length} errors · ${warns.length} warnings`);
process.exit(errors.length ? 1 : 0);
