import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

import { PNG } from 'pngjs';

const SCORE_CLI = fileURLToPath(new URL('../score.mjs', import.meta.url));
const CAPTURE_CLI = fileURLToPath(new URL('../capture-app.mjs', import.meta.url));
const REPO = fileURLToPath(new URL('../../../../', import.meta.url));

async function contract() {
  return import('../score.mjs');
}

test('preview export rejects incomplete or mock env and shell-quotes public values', async () => {
  const { previewEnvLines } = await contract();

  assert.throws(() => previewEnvLines({}), /preview env/i);
  assert.throws(
    () => previewEnvLines({
      EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon',
      EXPO_PUBLIC_LLM_MODE: 'mock',
    }),
    /live/i,
  );
  assert.throws(
    () => previewEnvLines({
      EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon',
      EXPO_PUBLIC_LLM_MODE: 'LIVE',
    }),
    /live/i,
  );
  assert.throws(
    () => previewEnvLines({
      EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon',
      EXPO_PUBLIC_LLM_MODE: 'live',
      'EXPO_PUBLIC_BAD;echo': 'unsafe',
    }),
    /shell-safe/i,
  );

  const lines = previewEnvLines({
    EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "public'anonymous",
    EXPO_PUBLIC_LLM_MODE: 'live',
    EXPO_PUBLIC_ALPHA: 'alpha value',
    PRIVATE_TOKEN: 'must-not-appear',
  });
  assert.deepEqual(lines, [
    "export EXPO_PUBLIC_ALLOW_DEV_TIER='true'",
    "export EXPO_PUBLIC_ALPHA='alpha value'",
    "export EXPO_PUBLIC_LLM_MODE='live'",
    "export EXPO_PUBLIC_SUPABASE_ANON_KEY='public'\"'\"'anonymous'",
    "export EXPO_PUBLIC_SUPABASE_URL='https://project.supabase.co'",
    "export EXPO_PUBLIC_UI='deep-space'",
  ]);
  assert.equal(lines.join('\n').includes('must-not-appear'), false);
});

test('capture init freezes Date and seeded randomness while marking gates as seen', async () => {
  const { makeCaptureInitScript } = await contract();
  const marker = Date.parse('2026-08-27T00:00:00.000Z');
  const script = makeCaptureInitScript(marker);

  assert.match(script, /onboarding\.cosmicPixel\.v2\.completedAt/);
  assert.match(script, /onboarding\.ttfv\.v1\.seenAt/);
  assert.match(script, /onboarding\.coachmarks\.home\.v1\.seenAt/);
  assert.match(script, /2026-08-27T00:00:00\.000Z/);

  const execute = () => {
    const values = new Map();
    const sandbox = {
      document: {
        readyState: 'complete',
        querySelector: () => null,
        createElement: () => ({ setAttribute() {}, style: {}, textContent: '' }),
        head: { appendChild() {} },
        documentElement: { appendChild() {} },
      },
      localStorage: { setItem: (key, value) => values.set(key, value) },
      sessionStorage: { setItem: (key, value) => values.set(key, value) },
    };
    sandbox.window = sandbox;
    runInNewContext(`${script}\nresult = { now: Date.now(), random: [Math.random(), Math.random()] };`, sandbox);
    return { result: sandbox.result, values };
  };
  const first = execute();
  const second = execute();
  assert.equal(JSON.stringify(first.result), JSON.stringify(second.result));
  assert.equal(first.result.now, marker);
  assert.equal(first.values.get('onboarding.ttfv.v1.seenAt'), '2026-08-27T00:00:00.000Z');
});

test('A axis DOM audit counts backdrop blur and partial SVG opacity only', async () => {
  const { inspectRenderedPixelRules } = await contract();
  const baseStyle = {
    borderTopLeftRadius: '0px',
    borderTopRightRadius: '0px',
    borderBottomLeftRadius: '0px',
    borderBottomRightRadius: '0px',
    filter: 'none',
    backdropFilter: 'none',
    webkitBackdropFilter: 'none',
    boxShadow: 'none',
    opacity: '1',
    backgroundColor: 'rgb(0, 0, 0)',
    color: 'rgb(255, 255, 255)',
    borderTopColor: 'rgb(0, 0, 0)',
    fill: 'rgb(255, 255, 255)',
    stroke: 'rgb(255, 255, 255)',
    fillOpacity: '1',
    strokeOpacity: '1',
  };
  const elements = [
    { tag: 'div', style: { ...baseStyle, backdropFilter: 'blur(4px)' } },
    { tag: 'line', style: { ...baseStyle, strokeOpacity: '0.5' } },
    { tag: 'rect', style: { ...baseStyle, fillOpacity: '0.5' } },
    { tag: 'div', style: { ...baseStyle, filter: 'blur(0px)' } },
  ].map(({ tag, style }) => ({
    tagName: tag.toUpperCase(),
    style,
    children: [],
    textContent: 'fixture',
    matches: () => false,
  }));

  const result = inspectRenderedPixelRules(elements, (element) => element.style);
  assert.equal(result.blurs, 1);
  assert.equal(result.alphas, 2);
});

test('E copy coverage uses normalized exact matches and preserves duplicate denominator', async () => {
  const { scoreCopyCoverage } = await contract();
  const result = scoreCopyCoverage(
    ['설정', '계정 설정', '설정', '워드\u2060조이너'],
    ['계정 설정 안내', '설정', '워드조이너'],
  );
  assert.deepEqual(result, {
    matched: 3,
    total: 4,
    ratio: 0.75,
    score: 7.5,
  });
});

test('live export receipt binds exact runtime env, fresh served bytes, and live mode', async () => {
  const {
    createCaptureEnvReceipt,
    validateCaptureEnvReceipt,
    validateServedExportSources,
  } = await contract();
  const preview = {
    EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon',
    EXPO_PUBLIC_LLM_MODE: 'live',
  };
  const runtime = {
    ...preview,
    EXPO_PUBLIC_ALLOW_DEV_TIER: 'true',
    EXPO_PUBLIC_UI: 'deep-space',
  };
  const printedAt = Date.parse('2026-08-27T00:00:00.000Z');
  const receipt = createCaptureEnvReceipt(preview, printedAt);
  const validated = validateCaptureEnvReceipt(receipt, preview, runtime, printedAt + 1000);
  assert.equal(validated.printedAt, printedAt);
  assert.equal(JSON.stringify(receipt).includes('public-anon'), false);

  const liveSource = [
    'https://project.supabase.co',
    'public-anon',
    'EXPO_PUBLIC_LLM_MODE:"live"',
  ].join(';');
  assert.doesNotThrow(() => validateServedExportSources(
    [{ body: liveSource, lastModified: 'Thu, 27 Aug 2026 00:00:02 GMT' }],
    preview,
    validated.printedAt,
  ));
  assert.throws(() => validateServedExportSources(
    [{ body: liveSource.replace('"live"', '"mock"'), lastModified: 'Thu, 27 Aug 2026 00:00:02 GMT' }],
    preview,
    validated.printedAt,
  ), /environment-attestation/);
  assert.throws(() => validateServedExportSources(
    [{ body: liveSource, lastModified: 'Wed, 26 Aug 2026 23:59:00 GMT' }],
    preview,
    validated.printedAt,
  ), /environment-attestation/);
  assert.throws(() => validateCaptureEnvReceipt(
    receipt,
    preview,
    { ...runtime, EXPO_PUBLIC_LLM_MODE: 'mock' },
    printedAt + 1000,
  ), /environment-attestation/);
});

test('hosted app URLs accept only canonical in-app paths', async () => {
  const { resolveHostedAppUrl } = await contract();

  assert.equal(
    resolveHostedAppUrl('http://localhost:8977', '/settings?tab=privacy'),
    'http://localhost:8977/2nd-B/settings?tab=privacy',
  );
  assert.equal(
    resolveHostedAppUrl('http://localhost:8977/2nd-B/', '/'),
    'http://localhost:8977/2nd-B/',
  );
  for (const unsafe of [
    'https://evil.example/settings',
    '//evil.example/settings',
    '/\\evil.example',
    '/../settings',
    '/%2e%2e/settings',
    '/%252e%252e/settings',
    '/settings%2fadmin',
    '/settings#account',
    '/settings bad',
  ]) {
    assert.throws(() => resolveHostedAppUrl('http://localhost:8977', unsafe), /unsafe app route/i, unsafe);
  }
});

test('final URL validation is exact for origin, canonical path, query, and hash', async () => {
  const { validateFinalUrl } = await contract();

  assert.doesNotThrow(() => validateFinalUrl(
    'http://localhost:8977',
    '/persona?tab=one',
    'http://localhost:8977/2nd-B/persona?tab=one',
  ));
  for (const actual of [
    'http://localhost:8977/2nd-B/persona?tab=two',
    'http://localhost:8977/2nd-B/persona?tab=one#top',
    'http://localhost:8977/2nd-B/sign-in?tab=one',
    'https://example.test/2nd-B/persona?tab=one',
  ]) {
    assert.throws(
      () => validateFinalUrl('http://localhost:8977', '/persona?tab=one', actual),
      /unexpected-final/i,
      actual,
    );
  }
});

test('D axis requires both rendered label and exact destination', async () => {
  const { scoreNavigation } = await contract();
  const declared = [{ label: '설정', to: '/settings' }];

  assert.equal(scoreNavigation(declared, [{ label: '설정', to: '/settings' }]).score, 15);
  assert.equal(scoreNavigation(declared, [{ label: '설정', to: '/' }]).score, 0);
  assert.equal(scoreNavigation(declared, [{ label: '설정', to: null }]).score, 0);
  const missing = scoreNavigation(['설정'], [{ label: '설정', to: '/settings' }]);
  assert.equal(missing.score, 0);
  assert.equal(missing.measurable, false);
});

test('capture health emits only safe enum codes and never raw error data', async () => {
  const {
    captureFailureCodes,
    createShotHealth,
    recordShotFailure,
    recordShotResponse,
    shotFailureCodes,
  } = await contract();
  const codes = shotFailureCodes({
    baseUrl: 'http://localhost:8977',
    responses: [{ url: 'http://localhost:8977/2nd-B/assets/app.js?token=secret', status: 404 }],
    pageErrorCount: 1,
    consoleErrorCount: 1,
    requestFailedCount: 1,
  });
  assert.deepEqual(codes, ['asset-404', 'page-error', 'console-error', 'network-failure']);
  assert.deepEqual(
    captureFailureCodes(new Error('https://secret.invalid/?token=must-not-survive')),
    ['capture-failed'],
  );
  assert.equal(JSON.stringify(codes).includes('secret'), false);

  assert.equal(typeof createShotHealth, 'function');
  assert.equal(typeof recordShotFailure, 'function');
  assert.equal(typeof recordShotResponse, 'function');
  const health = createShotHealth();
  recordShotResponse(
    health,
    'http://localhost:8977',
    'http://localhost:8977/2nd-B/assets/app.js?token=must-not-survive',
    404,
  );
  for (let index = 0; index < 100; index += 1) {
    recordShotFailure(health, 'console-error');
    recordShotFailure(health, 'page-error');
    recordShotFailure(health, 'network-failure');
  }
  assert.deepEqual(
    shotFailureCodes({ baseUrl: 'http://localhost:8977', ...health }),
    ['asset-404', 'page-error', 'console-error', 'network-failure'],
  );
  assert.equal(health.failureCodes.length, 4);
  assert.equal(JSON.stringify(health).includes('must-not-survive'), false);
});

test('manifest selection is exact-once for port:true and rejects deferred ids', async () => {
  const { validateManifestClassification } = await contract();
  const screens = [
    { id: 'home', port: true },
    { id: 'chat', port: true },
    { id: 'wait', port: 'deferred' },
  ];
  const valid = validateManifestClassification(screens, {
    routes: { home: '/' },
    unmeasurable: { chat: { why: 'requires a fixture' } },
    unmapped: { wait: { why: 'deferred reference' } },
  });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.targetIds, ['home']);
  assert.deepEqual(valid.nonPortTrueIds, ['wait']);

  const duplicate = validateManifestClassification(screens, {
    routes: { home: '/', chat: '/secondb' },
    unmeasurable: { home: { why: 'duplicate' } },
    unmapped: {},
  });
  assert.equal(duplicate.valid, false);
  assert.equal(duplicate.errors.some((entry) => entry.code === 'duplicate-id' && entry.id === 'home'), true);
});

test('manifest validation rejects unknown port states instead of dropping a target', async () => {
  const { validateManifestClassification } = await contract();
  const result = validateManifestClassification(
    [
      { id: 'home', port: true },
      { id: 'silently-dropped', port: 'treu' },
    ],
    {
      routes: { home: '/', 'silently-dropped': '/settings' },
      unmeasurable: {},
      unmapped: {},
    },
  );

  assert.equal(result.valid, false);
  assert.equal(
    result.errors.some((entry) => entry.code === 'invalid-port' && entry.id === 'silently-dropped'),
    true,
  );
});

test('manifest validation rejects screen ids that can escape output directories', async () => {
  const { validateManifestClassification } = await contract();
  for (const id of ['../escape', '..\\escape', '/absolute', '']) {
    const result = validateManifestClassification(
      [{ id, port: true }],
      { routes: { [id]: '/' }, unmeasurable: {}, unmapped: {} },
    );
    assert.equal(result.valid, false, id);
    assert.equal(
      result.errors.some((entry) => entry.code === 'invalid-screen-id'),
      true,
      id,
    );
  }
});

test('B axis counts actual non-transparent PNG pixels against the token ramp', async () => {
  const { scoreTokenPixels } = await contract();
  assert.equal(typeof scoreTokenPixels, 'function');

  const png = new PNG({ width: 2, height: 2 });
  const pixels = [
    [255, 0, 0, 255],
    [255, 0, 0, 255],
    [0, 0, 255, 255],
    [0, 255, 0, 0],
  ];
  pixels.forEach((pixel, index) => {
    png.data.set(pixel, index * 4);
  });

  const result = scoreTokenPixels(PNG.sync.write(png), new Set(['#ff0000']));
  assert.equal(result.paintedPixels, 3);
  assert.equal(result.inRampPixels, 2);
  assert.equal(result.ratio, 2 / 3);
  assert.equal(result.score, 25 * (2 / 3));
});

test('C axis uses shallow structure order, count, and relative-height components', async () => {
  const { extractStructureSections, scoreStructure } = await contract();
  assert.equal(typeof extractStructureSections, 'function');
  assert.equal(typeof scoreStructure, 'function');

  const textSection = (height, text = 'section') => ({
    tag: 'div',
    box: [390, height],
    kids: [{ tag: 'span', box: [100, 20], text }],
  });
  const interactiveSection = (height) => ({
    tag: 'div',
    box: [390, height],
    kids: [{ tag: 'button', box: [100, 32], text: 'go' }],
  });
  const digest = (kids) => ({ tag: 'div', box: [390, 820], kids });
  const reference = digest([textSection(100), interactiveSection(200)]);

  assert.deepEqual(
    extractStructureSections(reference).map(({ kind, heightRatio }) => ({ kind, heightRatio })),
    [
      { kind: 'text', heightRatio: 100 / 820 },
      { kind: 'interactive', heightRatio: 200 / 820 },
    ],
  );
  assert.deepEqual(scoreStructure(reference, reference), {
    score: 20,
    orderScore: 10,
    countScore: 5,
    heightScore: 5,
    referenceCount: 2,
    actualCount: 2,
    closeHeightCount: 2,
  });

  const heightMismatch = scoreStructure(
    reference,
    digest([textSection(125), interactiveSection(200)]),
  );
  assert.equal(heightMismatch.orderScore, 10);
  assert.equal(heightMismatch.countScore, 5);
  assert.equal(heightMismatch.heightScore, 2.5);

  const reordered = scoreStructure(
    reference,
    digest([interactiveSection(200), textSection(100)]),
  );
  assert.equal(reordered.orderScore, 5);
  assert.equal(reordered.countScore, 5);

  const missing = scoreStructure(reference, digest([textSection(100)]));
  assert.equal(missing.countScore, 2.5);

  const sameKindReference = digest([textSection(100, 'A'), textSection(100, 'B')]);
  const sameKindReordered = scoreStructure(
    sameKindReference,
    digest([textSection(100, 'B'), textSection(100, 'A')]),
  );
  assert.ok(sameKindReordered.orderScore < 10, JSON.stringify(sameKindReordered));
});

test('current reference digests expose the documented depth<=3 section order', async () => {
  const { extractStructureSections } = await contract();
  const home = JSON.parse(readFileSync(
    path.join(REPO, 'design/pixel_clay_260825/data/structure/home.json'),
    'utf8',
  ));
  assert.deepEqual(
    extractStructureSections(home).map((section) => section.height),
    [812, 42, 42, 80],
  );
});

test('E copy contract excludes reference device chrome on all 93 structures', async () => {
  const { referenceCopyTexts } = await contract();
  assert.equal(typeof referenceCopyTexts, 'function');
  const structureDir = path.join(REPO, 'design/pixel_clay_260825/data/structure');
  const files = readdirSync(structureDir).filter((file) => file.endsWith('.json'));
  assert.equal(files.length, 93);
  for (const file of files) {
    const root = JSON.parse(readFileSync(path.join(structureDir, file), 'utf8'));
    const texts = referenceCopyTexts(root);
    assert.equal(texts.some((text) => /^\d{1,2}\s*[:.]\s*\d{2}$/.test(text)), false, file);
  }
});

test('current manifest classifies every port:true screen exactly once', async () => {
  const { validateManifestClassification } = await contract();
  const screens = JSON.parse(readFileSync(
    path.join(REPO, 'design/pixel_clay_260825/data/screens.json'),
    'utf8',
  ));
  const routes = JSON.parse(readFileSync(
    path.join(REPO, 'design/pixel_clay_260825/data/app-routes.json'),
    'utf8',
  ));
  const result = validateManifestClassification(screens.screens, routes);
  const portTrue = screens.screens.filter((screen) => screen.port === true);
  const independentlyClassified = portTrue.map((screen) => [
    screen.id,
    ['routes', 'unmeasurable', 'unmapped'].filter(
      (category) => Object.hasOwn(routes[category] ?? {}, screen.id),
    ),
  ]);
  const expectedTargets = portTrue
    .filter((screen) => Object.hasOwn(routes.routes ?? {}, screen.id))
    .map((screen) => screen.id);
  const expectedStage1 = portTrue
    .filter((screen) => screen.stage === 1)
    .map((screen) => screen.id);

  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.stats.portTrue, portTrue.length);
  assert.equal(independentlyClassified.every(([, categories]) => categories.length === 1), true);
  assert.deepEqual(result.targetIds, expectedTargets);
  assert.deepEqual(result.stats.stage1, expectedStage1);
  assert.equal(
    result.targetIds.every((id) => screens.screens.find((screen) => screen.id === id)?.port === true),
    true,
  );
});

test('score report exit contract distinguishes pass, score failure, and invalid input', async () => {
  const { reportExitCode } = await contract();
  assert.equal(reportExitCode({ validInput: true, rows: [{ automaticPass: true }] }), 0);
  assert.equal(reportExitCode({ validInput: true, rows: [{ automaticPass: false }] }), 1);
  assert.equal(reportExitCode({ validInput: true, rows: [{ error: 'capture failed' }] }), 1);
  assert.equal(reportExitCode({ validInput: false, rows: [] }), 2);
  assert.equal(reportExitCode({ validInput: true, rows: [] }), 2);
});

test('score CLI rejects an unknown selection before output and preserves a sentinel', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), '2ndb-work0-score-'));
  const out = path.join(dir, 'score.json');
  try {
    writeFileSync(out, 'sentinel-output');
    const result = spawnSync(process.execPath, [SCORE_CLI, 'not-a-screen'], {
      cwd: REPO,
      env: { ...process.env, SCORE_OUT: out },
      encoding: 'utf8',
    });
    assert.equal(result.status, 2, result.stderr);
    assert.equal(readFileSync(out, 'utf8'), 'sentinel-output');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('score CLI returns runtime failure without overwriting a sentinel', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), '2ndb-work0-runtime-'));
  const out = path.join(dir, 'score.json');
  try {
    writeFileSync(out, 'sentinel-output');
    const result = spawnSync(process.execPath, [SCORE_CLI, 'home'], {
      cwd: REPO,
      env: {
        ...process.env,
        SCORE_OUT: out,
        PW_PATH: path.join(dir, 'missing-playwright.cjs'),
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(readFileSync(out, 'utf8'), 'sentinel-output');
    assert.match(result.stderr, /Playwright unavailable/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('capture CLI rejects a deferred selection before browser startup', () => {
  const env = { ...process.env, SCREENS: 'wiki,sensitive-marker' };
  delete env.BASE_URL;
  const result = spawnSync(process.execPath, [CAPTURE_CLI], { cwd: REPO, env, encoding: 'utf8' });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /invalid screen selection/i);
  assert.equal(result.stderr.includes('sensitive-marker'), false);
});

test('capture CLI rejects unknown arguments as invalid input', () => {
  const result = spawnSync(process.execPath, [CAPTURE_CLI, '--unknown'], {
    cwd: REPO,
    env: process.env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /invalid arguments/i);
});

test('capture CLI fails closed on a bootstrap console error without retaining raw data', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), '2ndb-work0-bootstrap-'));
  try {
    const { createCaptureEnvReceipt, previewPublicEnv } = await contract();
    const fakePlaywright = path.join(dir, 'fake-playwright.cjs');
    const easFile = path.join(dir, 'eas.json');
    const receiptFile = path.join(dir, 'receipt.json');
    const out = path.join(dir, 'captures');
    const preview = {
      EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon',
      EXPO_PUBLIC_LLM_MODE: 'live',
    };
    writeFileSync(easFile, JSON.stringify({ build: { preview: { env: preview } } }));
    writeFileSync(receiptFile, JSON.stringify(createCaptureEnvReceipt(preview)));
    writeFileSync(fakePlaywright, `
const handlers = {};
let firstNavigation = true;
let currentUrl = 'http://localhost:8977/2nd-B/';
const page = {
  on(name, callback) { handlers[name] = callback; },
  async goto(url) {
    currentUrl = url;
    if (firstNavigation) {
      firstNavigation = false;
      handlers.console?.({ type: () => 'error', text: () => 'token=must-not-survive' });
    }
  },
  url() { return currentUrl; },
  async waitForTimeout() {},
  async evaluate() { return { len: 100, loading: false }; },
  async screenshot() { return Buffer.from('not-a-real-png'); },
};
module.exports = {
  chromium: {
    async launch() {
      return {
        async newContext() {
          return { async addInitScript() {}, async newPage() { return page; } };
        },
        async close() {},
      };
    },
  },
};
`);
    const cleanEnv = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('EXPO_PUBLIC_')),
    );
    const result = spawnSync(process.execPath, [CAPTURE_CLI], {
      cwd: REPO,
      env: {
        ...cleanEnv,
        ...previewPublicEnv(preview),
        BASE_URL: 'http://localhost:8977',
        CAPTURE_ENV_RECEIPT: receiptFile,
        EAS_FILE: easFile,
        OUT: out,
        PW_PATH: fakePlaywright,
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /capture failed/i);
    assert.equal(`${result.stdout}${result.stderr}`.includes('must-not-survive'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('capture --print-env fails closed for incomplete and mock EAS profiles', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), '2ndb-work0-env-'));
  try {
    const easFile = path.join(dir, 'eas.json');
    for (const env of [
      {},
      {
        EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon',
        EXPO_PUBLIC_LLM_MODE: 'mock',
      },
    ]) {
      writeFileSync(easFile, JSON.stringify({ build: { preview: { env } } }));
      const result = spawnSync(process.execPath, [CAPTURE_CLI, '--print-env'], {
        cwd: REPO,
        env: {
          ...process.env,
          CAPTURE_ENV_RECEIPT: path.join(dir, 'receipt.json'),
          EAS_FILE: easFile,
        },
        encoding: 'utf8',
      });
      assert.equal(result.status, 2, result.stdout);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /preview env/i);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('capture --print-env accepts a complete live profile without private values', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), '2ndb-work0-live-env-'));
  try {
    const easFile = path.join(dir, 'eas.json');
    writeFileSync(easFile, JSON.stringify({
      build: {
        preview: {
          env: {
            EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
            EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon',
            EXPO_PUBLIC_LLM_MODE: 'live',
            PRIVATE_TOKEN: 'must-not-appear',
          },
        },
      },
    }));
    const result = spawnSync(process.execPath, [CAPTURE_CLI, '--print-env'], {
      cwd: REPO,
      env: {
        ...process.env,
        CAPTURE_ENV_RECEIPT: path.join(dir, 'receipt.json'),
        EAS_FILE: easFile,
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /EXPO_PUBLIC_LLM_MODE='live'/);
    assert.equal(result.stdout.includes('PRIVATE_TOKEN'), false);
    assert.equal(result.stdout.includes('must-not-appear'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('work0 runtime dependencies and tests are declared in package metadata', () => {
  const pkg = JSON.parse(readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  assert.equal(typeof pkg.devDependencies?.pngjs, 'string');
  assert.match(pkg.scripts?.['test:ui-work0'] ?? '', /work0-hardening\.test\.mjs/);
  assert.match(pkg.scripts?.verify ?? '', /test:ui-work0/);
});
