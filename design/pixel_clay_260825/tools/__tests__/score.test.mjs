import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  deriveManifestStats,
  buildScoreReport,
  paletteFromTokens,
  readPngHistogram,
  reportExitCode,
  scoreCopy,
  scoreNavigation,
  scorePixelDiscipline,
  scoreScreen,
  scoreStructure,
  scoreTokenFidelity,
} from '../score.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const SCORE_CLI = fileURLToPath(new URL('../score.mjs', import.meta.url));

function writeSolidPng(file, width, height, rgba = [6, 9, 18, 255]) {
  const png = new PNG({ width, height });
  for (let index = 0; index < png.data.length; index += 4) png.data.set(rgba, index);
  writeFileSync(file, PNG.sync.write(png));
}

test('manifest counts and Stage 1 ids are derived from data instead of constants', () => {
  const screens = [
    { id: 'home', port: true, stage: 1 },
    { id: 'chat', port: true, stage: 1 },
    { id: 'later', port: true, stage: 2 },
    { id: 'skip', port: false },
    { id: 'wait', port: 'deferred' },
  ];
  const routes = {
    routes: { home: '/', later: '/later' },
    unmeasurable: { _note: 'metadata', chat: { route: '/chat', why: 'fixture' } },
    unmapped: { _note: 'metadata', wait: { why: 'fixture' } },
  };

  assert.deepEqual(deriveManifestStats(screens, routes), {
    total: 5,
    portTrue: 3,
    portFalse: 1,
    deferred: 1,
    stage1: ['home', 'chat'],
    mapped: 2,
    unmeasurable: 1,
    unmapped: 1,
  });
});

test('A subtracts six points for every rendered DOM violation', () => {
  const result = scorePixelDiscipline({ curves: 1, round: 1, blur: 0, alpha: 1 });
  assert.equal(result.violations, 3);
  assert.equal(result.score, 12);
  assert.match(result.deductions.join(' '), /curves=1/);
  assert.match(result.deductions.join(' '), /round=1/);
  assert.match(result.deductions.join(' '), /alpha=1/);
});

test('A fails closed when rendered DOM measurements are missing', () => {
  const result = scorePixelDiscipline({});
  assert.equal(result.score, 0);
  assert.deepEqual(result.missing, ['curves', 'round', 'blur', 'alpha']);
  assert.match(result.deductions.join(' '), /missing rendered DOM metrics/i);
});

test('A rejects null, strings, fractions, and negative rendered counts', () => {
  for (const bad of [null, '', '0', -1, 0.5, Number.POSITIVE_INFINITY]) {
    const result = scorePixelDiscipline({ curves: bad, round: 0, blur: 0, alpha: 0 });
    assert.equal(result.score, 0, `bad value ${String(bad)}`);
    assert.deepEqual(result.missing, ['curves']);
  }
});

test('B includes runtime token colors plus the two canonical background colors', () => {
  const palette = paletteFromTokens({ vars: { '--accent': '#5b8def', '--edge': '0 2px #0a0e18' } });
  assert.equal(palette.has('#5B8DEF'), true);
  assert.equal(palette.has('#0A0E18'), true);
  assert.equal(palette.has('#060912'), true);
  assert.equal(palette.has('#070A13'), true);

  const result = scoreTokenFidelity(
    [
      { color: '#5B8DEF', pixels: 3 },
      { color: '#123456', pixels: 1 },
    ],
    palette,
  );
  assert.equal(result.ratio, 0.75);
  assert.equal(result.score, 18.75);
  assert.match(result.deductions.join(' '), /1.*outside/i);
});

test('B reads exact painted pixel colors through pngjs', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), '2ndb-score-'));
  const file = path.join(dir, 'two-pixels.png');
  try {
    const png = new PNG({ width: 2, height: 1 });
    png.data.set([91, 141, 239, 255, 6, 9, 18, 255]);
    writeFileSync(file, PNG.sync.write(png));
    assert.deepEqual(readPngHistogram(file), [
      { color: '#060912', pixels: 1 },
      { color: '#5B8DEF', pixels: 1 },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('B validates the capture viewport and opaque-pixel contract', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), '2ndb-score-png-contract-'));
  try {
    const wrongSize = path.join(dir, 'wrong-size.png');
    const translucent = path.join(dir, 'translucent.png');
    writeSolidPng(wrongSize, 1, 1);
    writeSolidPng(translucent, 2, 1, [6, 9, 18, 128]);
    assert.throws(
      () => readPngHistogram(wrongSize, { width: 390, height: 820, requireOpaque: true }),
      /expected 390x820/i,
    );
    assert.throws(
      () => readPngHistogram(translucent, { width: 2, height: 1, requireOpaque: true }),
      /non-opaque/i,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C gives an exact digest 20 and reduces a missing section deterministically', () => {
  const ref = {
    tag: 'body', box: [100, 100], kids: [
      { tag: 'header', box: [100, 20], text: 'head' },
      { tag: 'main', box: [100, 60], text: 'body' },
      { tag: 'nav', box: [100, 20], text: 'nav' },
    ],
  };
  assert.equal(scoreStructure(ref, structuredClone(ref)).score, 20);
  const missing = structuredClone(ref);
  missing.kids.pop();
  const result = scoreStructure(ref, missing);
  assert.equal(result.score, 13.33);
  assert.match(result.deductions.join(' '), /section count/i);
});

test('C detects reordered same-tag sections by a stable semantic signature', () => {
  const ref = {
    tag: 'body', box: [100, 100], kids: [
      { tag: 'div', box: [100, 50], text: 'first section' },
      { tag: 'div', box: [100, 50], text: 'second section' },
    ],
  };
  const app = structuredClone(ref);
  app.kids.reverse();
  const result = scoreStructure(ref, app);
  assert.equal(result.orderRatio, 0.5);
  assert.equal(result.score, 15);
});

test('D uses rendered interactive labels as a multiset and E keeps its ten-point weight', () => {
  const nav = scoreNavigation(
    [
      { label: '담기', to: '/capture' },
      { label: '담기', to: '/capture-full' },
      { label: '설정', to: '/settings' },
    ],
    [
      { text: '담기', to: '/capture', interactive: true },
      { text: '설정', to: '/settings', interactive: true },
      { text: '담기', to: '/capture-full', interactive: false },
    ],
  );
  assert.equal(nav.ratio, 2 / 3);
  assert.equal(nav.score, 10);
  assert.equal(scoreCopy(87).score, 8.7);
  assert.equal(scoreCopy(Number.POSITIVE_INFINITY).score, 0);
});

test('D rejects a matching label that navigates to the wrong route', () => {
  const result = scoreNavigation(
    [{ label: '설정', to: '/settings' }],
    [{ text: '설정', to: '/', interactive: true }],
  );
  assert.equal(result.score, 0);
  assert.match(result.deductions.join(' '), /wrong destination/i);
});

test('D preserves origin and hash boundaries instead of treating external URLs as app routes', () => {
  const external = scoreNavigation(
    [{ label: '설정', to: '/settings' }],
    [{ text: '설정', to: 'https://evil.example/settings', interactive: true }],
  );
  const wrongHash = scoreNavigation(
    [{ label: '설정', to: '/settings#account' }],
    [{ text: '설정', to: '/settings#privacy', interactive: true }],
  );
  const exactHash = scoreNavigation(
    [{ label: '설정', to: '/settings#account' }],
    [{ text: '설정', to: '/settings#account', interactive: true }],
  );
  assert.equal(external.score, 0);
  assert.equal(wrongHash.score, 0);
  assert.equal(exactHash.score, 15);
});

test('CLI report exit contract distinguishes success, score failure, and invalid selection', () => {
  assert.equal(reportExitCode({ selection: { targetCount: 1, unknownScreens: [] }, scores: [{ automaticPass: true }] }), 0);
  assert.equal(reportExitCode({ selection: { targetCount: 1, unknownScreens: [] }, scores: [{ automaticPass: false }] }), 1);
  assert.equal(reportExitCode({ selection: { targetCount: 1, unknownScreens: [] }, scores: [{ error: 'damaged capture' }] }), 1);
  assert.equal(reportExitCode({ selection: { targetCount: 0, unknownScreens: [] }, scores: [] }), 2);
  assert.equal(reportExitCode({ selection: { targetCount: 1, unknownScreens: ['typo'] }, scores: [] }), 2);
});

test('valid deviations exempt their axis, empty reasons do not and trigger a penalty', () => {
  const base = {
    metrics: { curves: 0, round: 0, blur: 0, alpha: 0 },
    histogram: [{ color: '#123456', pixels: 1 }],
    palette: new Set(['#000000']),
    refStructure: { tag: 'body', box: [100, 100], text: 'a' },
    appStructure: { tag: 'body', box: [100, 100], text: 'a' },
    declaredNav: [],
    actualNav: [],
    textMatchPct: 100,
  };
  const valid = scoreScreen('home', base, [
    { screen: 'home', axis: 'B', what: 'fixture', why: 'approved difference', decidedBy: 'codex', date: '2026-08-27' },
  ]);
  assert.equal(valid.B, 25);
  assert.equal(valid.total, 100);
  assert.equal(valid.automaticPass, false);
  assert.deepEqual(valid.manualReviewAxes, ['B']);

  const invalid = scoreScreen('home', base, [
    { screen: 'home', axis: 'B', what: 'fixture', why: '', decidedBy: 'codex', date: '2026-08-27' },
  ]);
  assert.equal(invalid.B, 0);
  assert.equal(invalid.total, 75);
  assert.match(invalid.deductions.join(' '), /empty why/i);
});

test('report builder scores a real manifest screen from capture and DOM artifacts', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), '2ndb-score-report-'));
  const structures = path.join(dir, 'structure');
  const curves = path.join(dir, 'curves.json');
  const radius = path.join(dir, 'radius.json');
  const alpha = path.join(dir, 'alpha.json');
  try {
    mkdirSync(structures);
    writeSolidPng(path.join(dir, 'home.png'), 390, 820);
    writeFileSync(
      path.join(structures, 'home.json'),
      readFileSync(new URL('../../data/structure/home.json', import.meta.url)),
    );
    writeFileSync(
      path.join(dir, 'app-report.json'),
      JSON.stringify({ compare: [{ id: 'home', textMatchPct: 100 }] }),
    );
    writeFileSync(curves, JSON.stringify([{ route: '/', curves: 0 }]));
    writeFileSync(radius, JSON.stringify([{ route: '/', round: 0, blur: 0 }]));
    writeFileSync(alpha, JSON.stringify([{ route: '/', alpha: 0 }]));

    const report = buildScoreReport({
      appOut: dir,
      curvesFile: curves,
      radiusFile: radius,
      alphaFile: alpha,
      screensFilter: 'home',
    });
    assert.deepEqual(
      Object.fromEntries(['total', 'portTrue', 'portFalse', 'deferred'].map((key) => [key, report.manifest[key]])),
      { total: 93, portTrue: 80, portFalse: 7, deferred: 6 },
    );
    assert.equal(report.scores.length, 1);
    assert.equal(report.scores[0].A, 30);
    assert.equal(report.scores[0].B, 25);
    assert.equal(report.scores[0].C, 20);
    assert.equal(report.scores[0].D, 0);
    assert.equal(report.scores[0].E, 10);

    const out = path.join(dir, 'score.json');
    const args = [
      SCORE_CLI,
      '--app-out', dir,
      '--out', out,
      '--curves', curves,
      '--radius', radius,
      '--alpha', alpha,
      '--screens', 'home',
    ];
    assert.equal(spawnSync(process.execPath, args, { encoding: 'utf8' }).status, 1);
    assert.equal(
      spawnSync(process.execPath, [...args.slice(0, -1), 'not-a-screen'], { encoding: 'utf8' }).status,
      2,
    );
    assert.equal(spawnSync(process.execPath, [SCORE_CLI, '--app-out', dir, '--out'], { encoding: 'utf8' }).status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('report builder records a damaged PNG as a screen error instead of aborting', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), '2ndb-score-damaged-'));
  try {
    mkdirSync(path.join(dir, 'structure'));
    writeFileSync(path.join(dir, 'home.png'), 'not a png');
    writeFileSync(
      path.join(dir, 'structure', 'home.json'),
      readFileSync(new URL('../../data/structure/home.json', import.meta.url)),
    );
    writeFileSync(path.join(dir, 'app-report.json'), JSON.stringify({ compare: [{ id: 'home', textMatchPct: 100 }] }));
    const report = buildScoreReport({ appOut: dir, screensFilter: 'home' });
    assert.match(report.scores[0].error, /home\.png/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
