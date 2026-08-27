import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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
  const { captureFailureCodes, shotFailureCodes } = await contract();
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
        env: { ...process.env, EAS_FILE: easFile },
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
      env: { ...process.env, EAS_FILE: easFile },
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
