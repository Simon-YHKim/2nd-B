#!/usr/bin/env node
/**
 * compare-shots.mjs — pixel-diff two capture directories produced by
 * capture-proto.mjs. PASS when the differing-pixel ratio of every pair is
 * under THRESHOLD (default 1.5% — canvas screens drift slightly between
 * runs; real breakage shows up as tens of percent).
 *
 * Usage: node tools/compare-shots.mjs <dirA> <dirB> [--threshold 0.015]
 * pngjs is resolved from E:/2ndB/node_modules (already installed there).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire('E:/2ndB/package.json');
const { PNG } = require('pngjs');

const [dirA, dirB] = process.argv.slice(2);
const thIdx = process.argv.indexOf('--threshold');
const THRESHOLD = thIdx > 0 ? Number(process.argv[thIdx + 1]) : 0.015;
if (!dirA || !dirB) { console.error('usage: compare-shots.mjs <dirA> <dirB>'); process.exit(1); }

const names = readdirSync(dirA).filter((f) => f.endsWith('.png'));
let fails = 0;
const rows = [];
for (const n of names) {
  const pB = path.join(dirB, n);
  if (!existsSync(pB)) { rows.push([n, 'MISSING in B']); fails++; continue; }
  const a = PNG.sync.read(readFileSync(path.join(dirA, n)));
  const b = PNG.sync.read(readFileSync(pB));
  if (a.width !== b.width || a.height !== b.height) {
    rows.push([n, `SIZE ${a.width}x${a.height} vs ${b.width}x${b.height}`]); fails++; continue;
  }
  const total = a.width * a.height;
  let diff = 0;
  const TOL = 12; // per-channel tolerance for AA/rounding noise
  for (let i = 0; i < a.data.length; i += 4) {
    if (Math.abs(a.data[i] - b.data[i]) > TOL ||
        Math.abs(a.data[i + 1] - b.data[i + 1]) > TOL ||
        Math.abs(a.data[i + 2] - b.data[i + 2]) > TOL) diff++;
  }
  const ratio = diff / total;
  const ok = ratio <= THRESHOLD;
  if (!ok) fails++;
  rows.push([n, (ratio * 100).toFixed(3) + '%' + (ok ? '' : '  << FAIL')]);
}
for (const [n, r] of rows) console.log(n.padEnd(20), r);
console.log(fails === 0 ? `PASS — all ${names.length} pairs under ${THRESHOLD * 100}%` : `FAIL — ${fails}/${names.length} pairs over threshold`);
process.exit(fails === 0 ? 0 : 1);
