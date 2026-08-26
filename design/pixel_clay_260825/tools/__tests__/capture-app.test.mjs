import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as scoreModule from '../score.mjs';
import * as contractModule from '../capture-app-contract.mjs';

import {
  browserLaunchOptions,
  digestPage,
  makeCaptureInitScript,
  previewEnvLines,
  resolvePlaywright,
  shotFailureCodes,
  validateFinalUrl,
  waitForSettledPage,
} from '../capture-app-contract.mjs';

const CAPTURE_CLI = fileURLToPath(new URL('../capture-app.mjs', import.meta.url));

test('capture URL join keeps exactly one base subpath with or without trailing slash', () => {
  assert.equal(typeof scoreModule.resolveHostedAppUrl, 'function');
  assert.equal(scoreModule.resolveHostedAppUrl('http://localhost:8977', '/'), 'http://localhost:8977/2nd-B/');
  assert.equal(scoreModule.resolveHostedAppUrl('http://localhost:8977/', '/settings'), 'http://localhost:8977/2nd-B/settings');
  assert.equal(scoreModule.resolveHostedAppUrl('http://localhost:8977/2nd-B/', '/settings'), 'http://localhost:8977/2nd-B/settings');
  assert.throws(
    () => scoreModule.resolveHostedAppUrl('http://localhost:8977/preview/', '/settings'),
    /BASE_URL path must be root or \/2nd-B/,
  );
});

test('capture CLI rejects deferred, false, unknown, unmeasurable, and unmapped selections before browser startup', () => {
  for (const id of ['wiki', 'audit', 'missing-test-id', 'pwreset', 'domains']) {
    const env = { ...process.env, SCREENS: id };
    delete env.BASE_URL;
    const result = spawnSync(process.execPath, [CAPTURE_CLI], { env, encoding: 'utf8' });
    assert.equal(result.status, 2, `${id}: ${result.stderr}`);
    assert.match(result.stderr, /invalid screen selection/i, id);
  }
});

test('preview env emits every string EXPO_PUBLIC value without logging non-public values', () => {
  const lines = previewEnvLines({
    EXPO_PUBLIC_ALPHA: 'alpha value',
    EXPO_PUBLIC_QUOTE: "it's-safe",
    EXPO_PUBLIC_NUMBER: 42,
    PRIVATE_TOKEN: 'must-not-appear',
  });

  assert.deepEqual(lines, [
    "export EXPO_PUBLIC_ALLOW_DEV_TIER='true'",
    "export EXPO_PUBLIC_ALPHA='alpha value'",
    "export EXPO_PUBLIC_QUOTE='it'\"'\"'s-safe'",
    "export EXPO_PUBLIC_UI='deep-space'",
  ]);
  assert.equal(lines.join('\n').includes('must-not-appear'), false);
});

test('preview env preserves explicit UI values and sorts all preview keys', () => {
  const lines = previewEnvLines({
    EXPO_PUBLIC_ZETA: 'z',
    EXPO_PUBLIC_UI: 'deep-space-custom',
    EXPO_PUBLIC_ALLOW_DEV_TIER: 'false',
    EXPO_PUBLIC_ALPHA: 'a',
  });

  assert.deepEqual(lines, [
    "export EXPO_PUBLIC_ALLOW_DEV_TIER='false'",
    "export EXPO_PUBLIC_ALPHA='a'",
    "export EXPO_PUBLIC_UI='deep-space-custom'",
    "export EXPO_PUBLIC_ZETA='z'",
  ]);
});

test('playwright resolution honors PW_PATH before local modules', () => {
  const attempts = [];
  const loaded = { chromium: {} };
  const loader = (candidate) => {
    attempts.push(candidate);
    if (candidate === 'D:/tools/playwright') return loaded;
    throw new Error('missing');
  };

  assert.equal(resolvePlaywright(loader, { PW_PATH: 'D:/tools/playwright' }), loaded);
  assert.deepEqual(attempts, ['D:/tools/playwright']);
});

test('playwright resolution falls back to playwright then playwright-core and fails clearly', () => {
  const attempts = [];
  const core = { chromium: {} };
  const loader = (candidate) => {
    attempts.push(candidate);
    if (candidate === 'playwright-core') return core;
    throw new Error('module resolution internals');
  };

  assert.equal(resolvePlaywright(loader, {}), core);
  assert.deepEqual(attempts, ['playwright', 'playwright-core']);
  assert.throws(
    () => resolvePlaywright(() => { throw new Error('sensitive loader detail'); }, {}),
    /PW_PATH.*playwright.*playwright-core/,
  );
});

test('playwright resolution continues to local modules when PW_PATH is unusable', () => {
  const attempts = [];
  const local = { chromium: {} };
  const loader = (candidate) => {
    attempts.push(candidate);
    if (candidate === 'playwright') return local;
    throw new Error('missing');
  };

  assert.equal(resolvePlaywright(loader, { PW_PATH: 'D:/missing/playwright' }), local);
  assert.deepEqual(attempts, ['D:/missing/playwright', 'playwright']);
});

test('BROWSER_PATH becomes a Playwright executablePath without extra options', () => {
  assert.deepEqual(browserLaunchOptions({ BROWSER_PATH: 'D:/browsers/chrome.exe' }), {
    executablePath: 'D:/browsers/chrome.exe',
  });
  assert.deepEqual(browserLaunchOptions({}), {});
});

test('capture init script sets the real intro/onboarding keys and installs persistent motion freeze', () => {
  const script = makeCaptureInitScript(1234);

  assert.match(script, /sessionStorage\.setItem\('secondB_intro_played_v1', '1'\)/);
  assert.match(script, /localStorage\.setItem\('onboarding\.cosmicPixel\.v2\.completedAt'/);
  assert.match(script, /animation-play-state: paused !important/);
  assert.match(script, /DOMContentLoaded/);
  assert.doesNotMatch(script, /localStorage\.setItem\('secondB_intro_played_v1'/);
  assert.doesNotMatch(script, /sb_onboarded/);
});

test('capture init script marks storage and freezes motion without replacing Date or Math.random', () => {
  const fixedTime = Date.UTC(2026, 7, 27, 7, 0, 0);
  const local = new Map();
  const session = new Map();
  const appended = [];
  const stableRandom = () => 0.314159;
  const stableMath = Object.create(Math);
  stableMath.random = stableRandom;
  const document = {
    readyState: 'complete',
    querySelector: () => null,
    createElement: () => ({ setAttribute() {}, textContent: '' }),
    head: { appendChild: (node) => appended.push(node) },
    documentElement: { appendChild: (node) => appended.push(node) },
  };
  const context = {
    Date,
    Math: stableMath,
    document,
    localStorage: { setItem: (key, value) => local.set(key, value) },
    sessionStorage: { setItem: (key, value) => session.set(key, value) },
  };
  context.window = context;

  vm.runInNewContext(makeCaptureInitScript(fixedTime), context);

  const fixedIso = new Date(fixedTime).toISOString();
  assert.equal(context.Date, Date);
  assert.equal(context.Date.now, Date.now);
  assert.equal(context.Math.random, stableRandom);
  assert.equal(context.Math.random(), 0.314159);
  assert.equal(session.get('secondB_intro_played_v1'), '1');
  assert.equal(local.get('onboarding.cosmicPixel.v2.completedAt'), fixedIso);
  assert.equal(local.get('onboarding.coachmarks.home.v1.seenAt'), fixedIso);
  assert.equal(appended.length, 1);
  assert.match(appended[0].textContent, /animation-play-state: paused !important/);
});

test('known capture failures become safe enum codes without retaining messages or URLs', async () => {
  assert.equal(typeof contractModule.captureFailureCodes, 'function');

  let routeFailure;
  try {
    validateFinalUrl(
      'http://localhost:8977',
      '/persona',
      'http://localhost:8977/2nd-B/sign-in?token=must-not-survive',
    );
  } catch (error) {
    routeFailure = error;
  }
  assert.deepEqual(contractModule.captureFailureCodes(routeFailure), ['unexpected-final-route']);

  let settleFailure;
  let tick = 0;
  try {
    await waitForSettledPage(
      {
        evaluate: async () => ({ len: 0, loading: true }),
        waitForTimeout: async () => {},
      },
      { maxMs: 25, pollMs: 0, now: () => tick++ * 10 },
    );
  } catch (error) {
    settleFailure = error;
  }
  assert.deepEqual(contractModule.captureFailureCodes(settleFailure), ['page-not-settled']);

  const combined = new contractModule.CaptureContractError(['asset-404', 'page-error']);
  assert.deepEqual(contractModule.captureFailureCodes(combined), ['asset-404', 'page-error']);

  const unknown = contractModule.captureFailureCodes(
    new Error('https://secret.invalid/path?token=must-not-survive'),
  );
  assert.deepEqual(unknown, ['capture-failed']);
  assert.equal(JSON.stringify(unknown).includes('must-not-survive'), false);
});

test('final URL validation accepts only the exact requested /2nd-B route', () => {
  assert.doesNotThrow(() => validateFinalUrl('http://localhost:8977', '/persona', 'http://localhost:8977/2nd-B/persona?x=1#top'));
  assert.doesNotThrow(() => validateFinalUrl('http://localhost:8977', '/persona?tab=one', 'http://localhost:8977/2nd-B/persona?tab=one'));
  assert.doesNotThrow(() => validateFinalUrl('http://localhost:8977/', '/', 'http://localhost:8977/2nd-B/'));
  assert.throws(() => validateFinalUrl('http://localhost:8977', '/persona', 'http://localhost:8977/2nd-B/sign-in'), /unexpected final route/);
  assert.throws(() => validateFinalUrl('http://localhost:8977', '/persona', 'http://localhost:8977/2nd-B/onboarding'), /unexpected final route/);
  assert.throws(() => validateFinalUrl('http://localhost:8977', '/persona', 'http://localhost:8977/2nd-B/+not-found'), /unexpected final route/);
  assert.throws(() => validateFinalUrl('http://localhost:8977', '/persona', 'https://example.test/2nd-B/persona'), /unexpected final origin/);
});

test('shot health fails closed for /2nd-B 404s and page errors without retaining messages', () => {
  const codes = shotFailureCodes({
    baseUrl: 'http://localhost:8977',
    responses: [
      { url: 'http://localhost:8977/2nd-B/assets/a.js', status: 404 },
      { url: 'https://elsewhere.test/missing.png', status: 404 },
    ],
    pageErrorCount: 1,
  });

  assert.deepEqual(codes, ['asset-404', 'page-error']);
  assert.equal(JSON.stringify(codes).includes('a.js'), false);
});

test('page settle fails closed when loading or empty content never stabilizes', async () => {
  let tick = 0;
  const page = {
    evaluate: async () => ({ len: 8, loading: true }),
    waitForTimeout: async () => {},
  };

  await assert.rejects(
    waitForSettledPage(page, { maxMs: 25, pollMs: 0, now: () => tick++ * 10 }),
    /page did not settle/,
  );
});

test('page settle succeeds after rendered content is stable twice', async () => {
  const states = [
    { len: 50, loading: false },
    { len: 50, loading: false },
    { len: 50, loading: false },
  ];
  let tick = 0;
  const page = {
    evaluate: async () => states.shift(),
    waitForTimeout: async () => {},
  };

  await assert.doesNotReject(
    waitForSettledPage(page, { maxMs: 100, pollMs: 0, now: () => tick++ * 10 }),
  );
});

function element({ tag = 'div', own = '', descendants = '', href = null, children = [] } = {}) {
  const childNodes = own ? [{ nodeType: 3, textContent: own }] : [];
  return {
    tagName: tag.toUpperCase(),
    childNodes,
    children,
    innerText: [own, descendants].filter(Boolean).join(' '),
    getBoundingClientRect: () => ({ width: 100, height: 20 }),
    getAttribute: (name) => (name === 'href' ? href : null),
    matches: (selector) => selector.split(',').some((part) => {
      const trimmed = part.trim();
      return (trimmed === 'a[href]' && tag === 'a' && href !== null)
        || (trimmed === 'button' && tag === 'button');
    }),
  };
}

test('digest records descendant interactive text and raw href instead of an absolute URL', () => {
  const textChild = element({ tag: 'span', own: '별 보기' });
  const root = element({ tag: 'a', descendants: '별 보기', href: '/persona', children: [textChild] });
  const digest = digestPage(root);

  assert.equal(digest.interactive, true);
  assert.equal(digest.interactiveText, '별 보기');
  assert.equal(digest.text, undefined);
  assert.equal(digest.to, '/persona');
});

test('digest interactive text is consumed exactly once by the D-axis scorer', () => {
  const textChild = element({ tag: 'span', own: '별 보기' });
  const root = element({ tag: 'a', descendants: '별 보기', href: '/persona', children: [textChild] });
  const digest = digestPage(root);

  assert.equal(typeof scoreModule.flattenInteractive, 'function');
  const actual = scoreModule.flattenInteractive(digest);
  assert.deepEqual(actual, [{ text: '별 보기', to: '/persona', interactive: true }]);
  assert.equal(
    scoreModule.scoreNavigation([{ label: '별 보기', to: '/persona' }], actual).score,
    15,
  );
});
