import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  rmSync,
  unlinkSync,
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
  const { previewEnvLines, previewPublicEnv } = await contract();

  assert.throws(() => previewEnvLines({}), /preview env/i);
  assert.throws(
    () =>
      previewEnvLines({
        EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon',
        EXPO_PUBLIC_LLM_MODE: 'mock',
      }),
    /live/i,
  );
  assert.throws(
    () =>
      previewEnvLines({
        EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon',
        EXPO_PUBLIC_LLM_MODE: 'LIVE',
      }),
    /live/i,
  );
  assert.throws(
    () =>
      previewEnvLines({
        EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon',
        EXPO_PUBLIC_LLM_MODE: 'live',
        'EXPO_PUBLIC_BAD;echo': 'unsafe',
      }),
    /shell-safe/i,
  );
  assert.throws(
    () =>
      previewPublicEnv({
        EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon',
        EXPO_PUBLIC_LLM_MODE: 'live',
        expo_public_force_tier: 'brain',
      }),
    /shell-safe|canonical/i,
  );
  assert.throws(
    () =>
      previewPublicEnv({
        EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon',
        EXPO_PUBLIC_LLM_MODE: 'live',
        expo_public_work0_receipt_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }),
    /reserved|canonical/i,
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
  const { makeCaptureDeterminismScript, makeCaptureInitScript } = await contract();
  const marker = Date.parse('2026-08-27T00:00:00.000Z');
  const initScript = makeCaptureInitScript(marker);
  const determinismScript = makeCaptureDeterminismScript(marker);

  assert.match(initScript, /onboarding\.cosmicPixel\.v2\.completedAt/);
  assert.match(initScript, /onboarding\.ttfv\.v1\.seenAt/);
  assert.match(initScript, /onboarding\.coachmarks\.home\.v1\.seenAt/);
  assert.match(initScript, /secondB_intro_dismissed_v1/);
  assert.match(initScript, /2026-08-27T00:00:00\.000Z/);
  assert.doesNotMatch(initScript, /window\.Date = FakeDate/);
  assert.match(determinismScript, /window\.Date = FakeDate/);

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
    runInNewContext(
      `${initScript}\n${determinismScript}\nresult = {
      now: Date.now(),
      random: [Math.random(), Math.random()],
      dates: [
        new Date().getTime(),
        new Date(0).getTime(),
        new Date(2026, 0).getTime(),
        new Date(2026, 0, 2).getTime(),
        new Date(2026, 0, 2, 3).getTime(),
        new Date(2026, 0, 2, 3, 4).getTime(),
        new Date(2026, 0, 2, 3, 4, 5).getTime(),
        new Date(2026, 0, 2, 3, 4, 5, 6).getTime()
      ]
    };`,
      sandbox,
    );
    return { result: sandbox.result, values };
  };
  const first = execute();
  const second = execute();
  assert.equal(JSON.stringify(first.result), JSON.stringify(second.result));
  assert.equal(first.result.now, marker);
  assert.deepEqual(
    [...first.result.dates],
    [
      marker,
      new Date(0).getTime(),
      new Date(2026, 0).getTime(),
      new Date(2026, 0, 2).getTime(),
      new Date(2026, 0, 2, 3).getTime(),
      new Date(2026, 0, 2, 3, 4).getTime(),
      new Date(2026, 0, 2, 3, 4, 5).getTime(),
      new Date(2026, 0, 2, 3, 4, 5, 6).getTime(),
    ],
  );
  assert.equal(first.values.get('secondB_intro_played_v1'), '1');
  assert.equal(first.values.get('secondB_intro_dismissed_v1'), 'permanent');
  assert.equal(
    first.values.get('onboarding.cosmicPixel.v2.completedAt'),
    '2026-08-27T00:00:00.000Z',
  );
  assert.equal(first.values.get('onboarding.ttfv.v1.seenAt'), '2026-08-27T00:00:00.000Z');
  assert.equal(
    first.values.get('onboarding.coachmarks.home.v1.seenAt'),
    '2026-08-27T00:00:00.000Z',
  );
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
    display: 'block',
    visibility: 'visible',
  };
  const elements = [
    { tag: 'div', style: { ...baseStyle, backdropFilter: 'blur(4px)' } },
    { tag: 'line', style: { ...baseStyle, strokeOpacity: '0.5' } },
    { tag: 'rect', style: { ...baseStyle, fillOpacity: '0.5' } },
    { tag: 'div', style: { ...baseStyle, filter: 'blur(0px)' } },
    { tag: 'path', style: { ...baseStyle, display: 'none' } },
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
  assert.equal(result.curves, 0);
});

test('rendered audits exclude transparent, offscreen, and fully clipped DOM', async () => {
  const { digestPage, inspectRenderedPixelRules } = await contract();
  const visibleStyle = {
    display: 'block',
    visibility: 'visible',
    contentVisibility: 'visible',
    opacity: '1',
    overflow: 'visible',
    overflowX: 'visible',
    overflowY: 'visible',
    borderTopLeftRadius: '0px',
    borderTopRightRadius: '0px',
    borderBottomLeftRadius: '0px',
    borderBottomRightRadius: '0px',
    filter: 'none',
    backdropFilter: 'none',
    webkitBackdropFilter: 'none',
    boxShadow: 'none',
    backgroundColor: 'rgb(0, 0, 0)',
    color: 'rgb(255, 255, 255)',
    borderTopColor: 'rgb(0, 0, 0)',
    fill: 'rgb(255, 255, 255)',
    stroke: 'rgb(255, 255, 255)',
    fillOpacity: '1',
    strokeOpacity: '1',
    clipPath: 'none',
    webkitClipPath: 'none',
    clip: 'auto',
    maskImage: 'none',
    webkitMaskImage: 'none',
    textIndent: '0px',
    textShadow: 'none',
  };
  const rect = (left, top, width, height) => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  });
  const makeElement = (text, box, style = visibleStyle, parentElement = null) => ({
    tagName: 'DIV',
    style,
    parentElement,
    hidden: false,
    children: [],
    childNodes: text ? [{ nodeType: 3, textContent: text }] : [],
    textContent: text,
    innerText: text,
    getBoundingClientRect: () => box,
    getAttribute: () => null,
    matches: () => false,
  });
  const root = makeElement('', rect(0, 0, 390, 820));
  const visible = makeElement('visible', rect(10, 10, 100, 20), visibleStyle, root);
  const transparentParent = makeElement(
    '',
    rect(0, 0, 200, 100),
    { ...visibleStyle, opacity: '0' },
    root,
  );
  const transparent = makeElement(
    'transparent',
    rect(10, 40, 100, 20),
    visibleStyle,
    transparentParent,
  );
  transparentParent.children = [transparent];
  const offscreen = makeElement('offscreen', rect(500, 10, 100, 20), visibleStyle, root);
  const clipParent = makeElement(
    '',
    rect(0, 0, 80, 80),
    { ...visibleStyle, overflow: 'hidden', overflowX: 'hidden', overflowY: 'hidden' },
    root,
  );
  const clipped = makeElement('clipped', rect(100, 100, 40, 20), visibleStyle, clipParent);
  clipParent.children = [clipped];
  const sliver = makeElement('hidden-score-copy', rect(-999, -999, 1000, 1000), visibleStyle, root);
  const partial = makeElement('partial', rect(-50, 100, 100, 20), visibleStyle, root);
  const roundedSliver = makeElement(
    'too-clipped-to-read',
    rect(-91, 200, 100, 100),
    { ...visibleStyle, borderTopLeftRadius: '4px' },
    root,
  );
  const transparentText = makeElement(
    'invisible-copy',
    rect(10, 300, 100, 20),
    { ...visibleStyle, color: 'rgba(255, 255, 255, 0)' },
    root,
  );
  const redText = makeElement(
    'red-visible',
    rect(120, 300, 100, 20),
    { ...visibleStyle, color: 'rgb(255, 0, 0)' },
    root,
  );
  const slashTransparentText = makeElement(
    'slash-alpha-hidden',
    rect(230, 300, 100, 20),
    { ...visibleStyle, color: 'rgb(255 0 0 / 0)' },
    root,
  );
  const sameColorText = makeElement(
    'same-paint-hidden',
    rect(120, 325, 120, 20),
    { ...visibleStyle, color: 'rgb(17, 17, 17)', backgroundColor: 'rgb(17, 17, 17)' },
    root,
  );
  const partialAlphaText = makeElement(
    'partial-alpha-hidden',
    rect(250, 325, 120, 20),
    { ...visibleStyle, color: 'rgba(255, 255, 255, 0.01)' },
    root,
  );
  const svgFillAlphaText = makeElement(
    'svg-alpha-hidden',
    rect(120, 350, 120, 20),
    { ...visibleStyle, fill: 'rgb(255, 255, 255)', fillOpacity: '0.01' },
    root,
  );
  svgFillAlphaText.tagName = 'text';
  const legacyClippedText = makeElement(
    'legacy-clip-hidden',
    rect(250, 350, 120, 20),
    { ...visibleStyle, position: 'absolute', clip: 'rect(0px, 0px, 0px, 0px)' },
    root,
  );
  const indentedText = makeElement(
    'indented-hidden',
    rect(120, 375, 120, 20),
    {
      ...visibleStyle,
      overflow: 'hidden',
      overflowX: 'hidden',
      overflowY: 'hidden',
      textIndent: '-9999px',
    },
    root,
  );
  indentedText.childNodes[0].getClientRects = () => [rect(-9879, 375, 120, 20)];
  const filteredParent = makeElement(
    '',
    rect(0, 0, 200, 100),
    { ...visibleStyle, filter: 'opacity(0)' },
    root,
  );
  const filterHidden = makeElement('CHEAT', rect(10, 340, 100, 20), visibleStyle, filteredParent);
  filterHidden.tagName = 'A';
  filterHidden.matches = (selector) => selector.includes('a[href]');
  filterHidden.getAttribute = (name) => (name === 'href' ? '/growth' : null);
  filteredParent.children = [filterHidden];
  const clipPathParent = makeElement(
    '',
    rect(0, 0, 200, 100),
    { ...visibleStyle, clipPath: 'inset(50%)' },
    root,
  );
  const clipPathHidden = makeElement('CHEAT', rect(10, 380, 100, 20), visibleStyle, clipPathParent);
  clipPathHidden.tagName = 'A';
  clipPathHidden.matches = (selector) => selector.includes('a[href]');
  clipPathHidden.getAttribute = (name) => (name === 'href' ? '/growth' : null);
  clipPathParent.children = [clipPathHidden];
  const nearTransparentParent = makeElement(
    '',
    rect(0, 0, 200, 100),
    { ...visibleStyle, opacity: '0.001' },
    root,
  );
  const nearTransparent = makeElement(
    'CHEAT',
    rect(10, 420, 100, 20),
    visibleStyle,
    nearTransparentParent,
  );
  nearTransparent.tagName = 'A';
  nearTransparent.matches = (selector) => selector.includes('a[href]');
  nearTransparent.getAttribute = (name) => (name === 'href' ? '/growth' : null);
  nearTransparentParent.children = [nearTransparent];
  const unsupportedPaintParents = [
    { clipPath: 'circle(0)' },
    { clipPath: 'polygon(0 0, 0 0, 0 0)' },
    { maskImage: 'linear-gradient(transparent, transparent)' },
  ].map((paintStyle, index) => {
    const parent = makeElement('', rect(0, 0, 200, 100), { ...visibleStyle, ...paintStyle }, root);
    const child = makeElement('CHEAT', rect(10, 460 + index * 40, 100, 20), visibleStyle, parent);
    child.tagName = 'A';
    child.matches = (selector) => selector.includes('a[href]');
    child.getAttribute = (name) => (name === 'href' ? '/growth' : null);
    parent.children = [child];
    return { parent, child };
  });
  root.children = [
    visible,
    transparentParent,
    offscreen,
    clipParent,
    sliver,
    partial,
    roundedSliver,
    transparentText,
    redText,
    slashTransparentText,
    sameColorText,
    partialAlphaText,
    svgFillAlphaText,
    legacyClippedText,
    indentedText,
    filteredParent,
    clipPathParent,
    nearTransparentParent,
    ...unsupportedPaintParents.map(({ parent }) => parent),
  ];

  const inspected = inspectRenderedPixelRules(
    [
      visible,
      transparent,
      offscreen,
      clipped,
      sliver,
      partial,
      roundedSliver,
      transparentText,
      redText,
      slashTransparentText,
      sameColorText,
      partialAlphaText,
      svgFillAlphaText,
      legacyClippedText,
      indentedText,
      filterHidden,
      clipPathHidden,
      nearTransparent,
      ...unsupportedPaintParents.map(({ child }) => child),
    ],
    (element) => element.style,
    { width: 390, height: 820 },
  );
  assert.deepEqual(inspected.texts, ['visible', 'partial', 'red-visible']);
  assert.deepEqual(inspected.interactive, []);
  assert.equal(inspected.rounds, 1);

  const previousWindow = globalThis.window;
  const previousComputedStyle = globalThis.getComputedStyle;
  try {
    globalThis.window = { innerWidth: 390, innerHeight: 820 };
    globalThis.getComputedStyle = (element) => element.style;
    const digest = digestPage(root);
    assert.deepEqual(
      digest.kids.map((child) => child.text),
      ['visible', 'partial', 'red-visible'],
    );
    assert.deepEqual(digest.kids[1].box, [50, 20]);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousComputedStyle === undefined) delete globalThis.getComputedStyle;
    else globalThis.getComputedStyle = previousComputedStyle;
  }
});

test('D axis accepts only visibly painted descendant text, never aria-only labels', async () => {
  const { digestPage, inspectRenderedPixelRules, scoreNavigationLabels } = await contract();
  const style = {
    display: 'block',
    visibility: 'visible',
    contentVisibility: 'visible',
    opacity: '1',
    overflow: 'visible',
    overflowX: 'visible',
    overflowY: 'visible',
    color: 'rgb(255, 255, 255)',
    webkitTextFillColor: 'rgb(255, 255, 255)',
    fill: 'rgb(255, 255, 255)',
    borderTopLeftRadius: '0px',
    borderTopRightRadius: '0px',
    borderBottomLeftRadius: '0px',
    borderBottomRightRadius: '0px',
    filter: 'none',
    backdropFilter: 'none',
    webkitBackdropFilter: 'none',
    boxShadow: 'none',
    backgroundColor: 'rgb(0, 0, 0)',
    borderTopColor: 'rgb(0, 0, 0)',
    stroke: 'rgb(255, 255, 255)',
    fillOpacity: '1',
    strokeOpacity: '1',
  };
  const box = { left: 10, top: 10, right: 110, bottom: 54, width: 100, height: 44 };
  const make = (text, elementStyle = style) => ({
    tagName: 'SPAN',
    style: elementStyle,
    hidden: false,
    parentElement: null,
    children: [],
    childNodes: text ? [{ nodeType: 3, textContent: text }] : [],
    textContent: text,
    getBoundingClientRect: () => box,
    getAttribute: () => null,
    matches: () => false,
  });
  const link = (child, ariaLabel) => {
    const element = make('');
    element.tagName = 'A';
    element.children = child ? [child] : [];
    if (child) child.parentElement = element;
    element.matches = (selector) => selector.includes('a[href]');
    element.getAttribute = (name) =>
      name === 'href' ? '/settings' : name === 'aria-label' ? ariaLabel : null;
    return element;
  };
  const ariaOnly = link(null, '설정');
  const hiddenText = make('설정', {
    ...style,
    color: 'rgba(255, 255, 255, 0)',
    webkitTextFillColor: 'rgba(255, 255, 255, 0)',
  });
  const hiddenLabel = link(hiddenText, null);
  const visibleText = make('설정');
  const visibleLabel = link(visibleText, null);

  const inspected = inspectRenderedPixelRules(
    [ariaOnly, hiddenLabel, hiddenText, visibleLabel, visibleText],
    (element) => element.style,
    { width: 390, height: 820 },
  );
  assert.equal(scoreNavigationLabels(['설정'], inspected.interactive).score, 15);
  assert.deepEqual(
    inspected.interactive.map((entry) => entry.label),
    ['', '', '설정'],
  );

  const previousWindow = globalThis.window;
  const previousComputedStyle = globalThis.getComputedStyle;
  try {
    globalThis.window = { innerWidth: 390, innerHeight: 820 };
    globalThis.getComputedStyle = (element) => element.style;
    assert.equal(digestPage(ariaOnly), null);
    assert.equal(digestPage(hiddenLabel), null);
    assert.equal(digestPage(visibleLabel).interactiveText, '설정');
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousComputedStyle === undefined) delete globalThis.getComputedStyle;
    else globalThis.getComputedStyle = previousComputedStyle;
  }
});

test('capture and score prefer an allowlisted button role over a matching text parent', async () => {
  const { dismissCaptureOverlays } = await contract();
  assert.equal(typeof dismissCaptureOverlays, 'function');
  const clicks = [];
  let dismissed = false;
  const overlay = {
    async count() {
      return dismissed ? 0 : 1;
    },
    getByRole(role, { name, exact }) {
      assert.equal(role, 'button');
      assert.equal(exact, true);
      return {
        async count() {
          return name === '알겠습니다' && !dismissed ? 1 : 0;
        },
        first() {
          return {
            async click() {
              dismissed = true;
              clicks.push(`role:${name}`);
            },
          };
        },
      };
    },
    getByText(label) {
      return {
        async count() {
          return label === '알겠습니다' && !dismissed ? 1 : 0;
        },
        first() {
          return {
            async click() {
              dismissed = true;
              clicks.push(`text:${label}`);
            },
          };
        },
      };
    },
  };
  const page = {
    locator(selector) {
      assert.match(selector, /aria-modal|role="dialog"/);
      return overlay;
    },
    async waitForTimeout() {},
  };

  await dismissCaptureOverlays(page);
  assert.deepEqual(clicks, ['role:알겠습니다']);

  const captureSource = readFileSync(CAPTURE_CLI, 'utf8');
  assert.match(
    captureSource,
    /waitForSettledPage\(page\);[\s\S]*dismissCaptureOverlays\(page\);[\s\S]*validateFinalUrl[\s\S]*page\.evaluate\(digestPage\)/,
  );
});

test('overlay dismissal text fallback resolves only an actionable allowlisted ancestor', async () => {
  const { dismissCaptureOverlays } = await contract();
  const clicks = [];
  let dismissed = false;
  const overlay = {
    async count() {
      return dismissed ? 0 : 1;
    },
    getByRole() {
      return {
        async count() {
          return 0;
        },
      };
    },
    getByText(label, { exact }) {
      assert.equal(exact, true);
      return {
        locator(selector) {
          assert.match(selector, /ancestor-or-self/);
          return {
            async count() {
              return label === '다시 보지 않기' && !dismissed ? 1 : 0;
            },
            first() {
              return {
                async click() {
                  dismissed = true;
                  clicks.push(label);
                },
              };
            },
          };
        },
        first() {
          throw new Error('the non-actionable text parent must never be clicked directly');
        },
      };
    },
  };
  const page = {
    locator(selector) {
      assert.match(selector, /aria-modal|role="dialog"/);
      return overlay;
    },
    async waitForTimeout() {},
  };

  await dismissCaptureOverlays(page);
  assert.deepEqual(clicks, ['다시 보지 않기']);
});

test('overlay dismissal polls for a late allowlisted button within a bounded pass budget', async () => {
  const { dismissCaptureOverlays } = await contract();
  const clicks = [];
  const waits = [];
  let visible = false;
  let dismissed = false;
  const makeLocator = (kind, label) => ({
    async count() {
      return label === '오늘은 그만 보겠습니다' && visible && !dismissed ? 1 : 0;
    },
    first() {
      return {
        async click() {
          dismissed = true;
          clicks.push(`${kind}:${label}`);
        },
      };
    },
  });
  const overlay = {
    async count() {
      return dismissed ? 0 : 1;
    },
    getByRole(role, { name }) {
      assert.equal(role, 'button');
      return makeLocator('role', name);
    },
    getByText(label) {
      return makeLocator('text', label);
    },
  };
  const page = {
    locator(selector) {
      assert.match(selector, /aria-modal|role="dialog"/);
      return overlay;
    },
    async waitForTimeout(ms) {
      waits.push(ms);
      visible = true;
    },
  };

  await dismissCaptureOverlays(page);
  assert.deepEqual(clicks, ['role:오늘은 그만 보겠습니다']);
  assert.ok(waits.length <= 4, `overlay polling exceeded its bounded budget: ${waits.length}`);
});

test('overlay dismissal keeps its non-mutating allowlist and three-pass click ceiling', async () => {
  const { dismissCaptureOverlays } = await contract();
  const allowlist = ['다시 보지 않기', '건너뛰기', '알겠습니다', '오늘은 그만 보겠습니다'];
  const queried = [];
  const clicks = [];
  const overlay = {
    async count() {
      return 1;
    },
    getByRole(role, { name }) {
      assert.equal(role, 'button');
      queried.push(name);
      return {
        async count() {
          return name === '건너뛰기' ? 1 : 0;
        },
        first() {
          return {
            async click() {
              clicks.push(name);
            },
          };
        },
      };
    },
    getByText(label) {
      queried.push(label);
      return {
        async count() {
          return 0;
        },
        first() {
          throw new Error('empty text locator must not be clicked');
        },
      };
    },
  };
  const page = {
    locator(selector) {
      assert.match(selector, /aria-modal|role="dialog"/);
      return overlay;
    },
    async waitForTimeout() {},
  };

  await dismissCaptureOverlays(page);
  assert.deepEqual(clicks, ['건너뛰기', '건너뛰기', '건너뛰기']);
  assert.ok(queried.every((label) => allowlist.includes(label)));
});

test('notice dismissal isolates its confirm fallback to a notice-marked modal', async () => {
  const { dismissCaptureOverlays, dismissNoticeOverlay } = await contract();
  let dismissed = false;
  let confirmed = false;
  const overlay = {
    async count() {
      return dismissed ? 0 : 1;
    },
    nth() {
      return this;
    },
    getByRole(role, { name }) {
      assert.equal(role, 'button');
      return {
        async count() {
          return ['공지 닫기', '확인'].includes(name) && !dismissed ? 1 : 0;
        },
        first() {
          return {
            async click() {
              if (name === '공지 닫기') throw new Error('scrim centre is covered by the card');
              if (name === '확인') {
                dismissed = true;
                confirmed = true;
              }
            },
          };
        },
      };
    },
    getByText() {
      return {
        async count() {
          return 0;
        },
      };
    },
  };
  const page = {
    locator() {
      return overlay;
    },
    async waitForTimeout() {},
  };

  await dismissNoticeOverlay(page);
  assert.equal(dismissed, true);
  assert.equal(confirmed, true);

  dismissed = false;
  confirmed = false;
  await dismissCaptureOverlays(page);
  assert.equal(dismissed, false);
  assert.equal(confirmed, false);
});

test('overlay dismissal ignores allowlisted product actions outside modal ancestry', async () => {
  const { dismissCaptureOverlays } = await contract();
  const clicks = [];
  const page = {
    locator(selector) {
      assert.match(selector, /aria-modal|role="dialog"/);
      return {
        async count() {
          return 0;
        },
        getByRole() {
          throw new Error('an absent overlay scope must not be queried');
        },
        getByText() {
          throw new Error('an absent overlay scope must not be queried');
        },
      };
    },
    getByRole(role, { name }) {
      assert.equal(role, 'button');
      return {
        async count() {
          return name === '건너뛰기' ? 1 : 0;
        },
        first() {
          return {
            async click() {
              clicks.push(name);
            },
          };
        },
      };
    },
    async waitForTimeout() {},
  };

  await dismissCaptureOverlays(page);
  assert.deepEqual(clicks, []);
});

test('E copy coverage uses visible leaf and group text with item exemptions', async () => {
  const { scoreCopyCoverage } = await contract();
  const result = scoreCopyCoverage(
    ['설정', '계정 설정', '설정', '워드\u2060조이너', '면제 문장'],
    ['설정', '워드조이너'],
    ['계정 설정 안내'],
    ['면제 문장'],
  );
  assert.deepEqual(result, {
    matched: 4,
    total: 4,
    declared: 5,
    ratio: 1,
    score: 10,
    exempted: 1,
    requiresManualReview: false,
    missing: [],
  });
});

test('live export receipt binds the full public env and a unique served proof', async () => {
  const {
    captureExportEnv,
    createCaptureEnvReceipt,
    createServedExportAttestation,
    servedExportMarkerBody,
    sourceBodySha256,
    validateCaptureEnvReceipt,
    validateServedExportSources,
  } = await contract();
  const preview = {
    EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon',
    EXPO_PUBLIC_LLM_MODE: 'live',
    EXPO_PUBLIC_CHAT_VENDOR: 'openai',
  };
  const printedAt = Date.parse('2026-08-27T00:00:00.000Z');
  const receipt = createCaptureEnvReceipt(
    preview,
    printedAt,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  );
  const runtime = captureExportEnv(preview, receipt);
  const validated = validateCaptureEnvReceipt(receipt, preview, runtime, printedAt + 1000);
  assert.equal(validated.printedAt, printedAt);
  assert.equal(validated.receipt.receiptId, receipt.receiptId);
  assert.equal(JSON.stringify(receipt).includes('public-anon'), false);

  const sourceBody = 'fresh-app-bundle';
  const markerBody = servedExportMarkerBody(receipt);
  const manifest = [
    { path: '_expo/app.js', sha256: sourceBodySha256(sourceBody) },
    { path: 'work0-export-marker.js', sha256: sourceBodySha256(markerBody) },
  ];
  const inlineScripts = [sourceBodySha256('inline-module')];
  const served = createServedExportAttestation(receipt, manifest, inlineScripts, printedAt + 1000);
  const servedFiles = manifest.map((file) => ({
    ...file,
    lastModified: 'Thu, 27 Aug 2026 00:00:02 GMT',
  }));
  const scriptContract = {
    externalUrls: [
      'http://localhost:8977/2nd-B/_expo/app.js',
      'http://localhost:8977/2nd-B/work0-export-marker.js',
    ],
    inlineSha256: inlineScripts,
    crossOriginCount: 0,
  };
  assert.doesNotThrow(() =>
    validateServedExportSources(
      servedFiles,
      preview,
      validated.receipt,
      { body: JSON.stringify(served), lastModified: 'Thu, 27 Aug 2026 00:00:02 GMT' },
      scriptContract,
    ),
  );

  const staleReceipt = createCaptureEnvReceipt(
    { ...preview, EXPO_PUBLIC_CHAT_VENDOR: 'claude' },
    printedAt,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  );
  assert.throws(
    () =>
      validateServedExportSources(
        servedFiles,
        preview,
        validated.receipt,
        {
          body: JSON.stringify(
            createServedExportAttestation(staleReceipt, manifest, inlineScripts, printedAt + 1000),
          ),
          lastModified: 'Thu, 27 Aug 2026 00:00:02 GMT',
        },
        scriptContract,
      ),
    /environment-attestation/,
  );
  assert.throws(
    () =>
      validateServedExportSources(
        servedFiles,
        preview,
        validated.receipt,
        { body: JSON.stringify(served), lastModified: 'Thu, 27 Aug 2026 00:00:02 GMT' },
        {
          ...scriptContract,
          externalUrls: scriptContract.externalUrls.map((url) => url.replace('/2nd-B/', '/evil/')),
        },
      ),
    /environment-attestation/,
  );
  assert.throws(
    () =>
      validateServedExportSources(
        servedFiles,
        preview,
        validated.receipt,
        { body: JSON.stringify(served), lastModified: 'Wed, 26 Aug 2026 23:59:00 GMT' },
        scriptContract,
      ),
    /environment-attestation/,
  );
  assert.throws(
    () =>
      validateServedExportSources(
        servedFiles.map((file, index) =>
          index === 0 ? { ...file, sha256: sourceBodySha256('tampered') } : file,
        ),
        preview,
        validated.receipt,
        { body: JSON.stringify(served), lastModified: 'Thu, 27 Aug 2026 00:00:02 GMT' },
        scriptContract,
      ),
    /environment-attestation/,
  );
  const incompleteProof = createServedExportAttestation(
    receipt,
    [...manifest, { path: '_expo/lazy.js', sha256: sourceBodySha256('lazy') }],
    inlineScripts,
    printedAt + 1000,
  );
  assert.throws(
    () =>
      validateServedExportSources(
        servedFiles,
        preview,
        validated.receipt,
        { body: JSON.stringify(incompleteProof), lastModified: 'Thu, 27 Aug 2026 00:00:02 GMT' },
        scriptContract,
      ),
    /environment-attestation/,
  );
  assert.throws(
    () =>
      validateCaptureEnvReceipt(
        receipt,
        preview,
        { ...runtime, EXPO_PUBLIC_LLM_MODE: 'mock' },
        printedAt + 1000,
      ),
    /environment-attestation/,
  );
  assert.throws(
    () =>
      validateCaptureEnvReceipt(
        receipt,
        preview,
        { ...runtime, expo_public_force_tier: 'brain' },
        printedAt + 1000,
      ),
    /environment-attestation/,
  );
});

test('capture marker time is stable across score and capture runs sharing one receipt', async () => {
  const { resolveCaptureMarkerTime } = await contract();
  const printedAt = Date.parse('2026-08-27T00:00:00.000Z');
  assert.equal(resolveCaptureMarkerTime({}, printedAt), printedAt);
  assert.equal(
    resolveCaptureMarkerTime({ FIXED_ISO: '2026-08-27T00:01:00.000Z' }, printedAt),
    printedAt + 60000,
  );
  assert.throws(
    () => resolveCaptureMarkerTime({ FIXED_ISO: 'not-a-date' }, printedAt),
    /valid date/i,
  );
});

test('credential fill is limited to the expected loopback or explicit origin', async () => {
  const { fillQaLogin } = await contract();
  let fills = 0;
  const page = {
    url: () => 'https://evil.example/2nd-B/sign-in',
    getByLabel: () => ({
      async fill() {
        fills += 1;
      },
    }),
    locator: () => ({ first: () => ({ async click() {} }) }),
    async waitForTimeout() {},
  };
  await assert.rejects(
    fillQaLogin(page, {
      baseUrl: 'http://localhost:8977',
      email: 'qa@example.com',
      password: 'disposable',
      env: {},
    }),
    /unexpected-final-origin/,
  );
  assert.equal(fills, 0);

  const remotePage = { ...page, url: () => 'https://preview.example/2nd-B/sign-in' };
  await assert.rejects(
    fillQaLogin(remotePage, {
      baseUrl: 'https://preview.example',
      email: 'qa@example.com',
      password: 'disposable',
      env: {},
    }),
    /unexpected-final-origin/,
  );
  assert.equal(fills, 0);

  let ipv6Url = 'http://[::1]:8977/2nd-B/sign-in';
  const ipv6Page = {
    url: () => ipv6Url,
    getByLabel: () => ({
      async count() {
        return 1;
      },
      async fill() {
        fills += 1;
      },
    }),
    locator: (selector) =>
      selector === 'input[type="password"]'
        ? {
            async count() {
              return 1;
            },
            async fill() {
              fills += 1;
            },
          }
        : {
            first: () => ({
              async click() {
                ipv6Url = 'http://[::1]:8977/2nd-B/';
              },
            }),
          },
    async waitForTimeout() {},
  };
  await fillQaLogin(ipv6Page, {
    baseUrl: 'http://[::1]:8977',
    email: 'qa@example.com',
    password: 'disposable',
    env: {},
  });
  assert.equal(fills, 2);

  let emailFilled = false;
  const ambiguousPasswordPage = {
    ...ipv6Page,
    url: () => 'http://localhost:8977/2nd-B/sign-in',
    getByLabel: () => ({
      async count() {
        return 1;
      },
      async fill() {
        emailFilled = true;
      },
    }),
    locator: () => ({
      async count() {
        return 2;
      },
    }),
  };
  await assert.rejects(
    fillQaLogin(ambiguousPasswordPage, {
      baseUrl: 'http://localhost:8977',
      email: 'qa@example.com',
      password: 'disposable',
      env: {},
    }),
    /capture-failed/,
  );
  assert.equal(emailFilled, false);
});

test('browser executable is explicit and exists before Playwright launch', async () => {
  const { browserLaunchOptions, captureContextOptions, validateBrowserRuntime } = await contract();
  const managed = { executablePath: () => process.execPath };
  assert.throws(() => browserLaunchOptions({}), /BROWSER_PATH/);
  assert.throws(
    () =>
      browserLaunchOptions({ BROWSER_PATH: path.join(os.tmpdir(), 'missing-browser') }, managed),
    /BROWSER_PATH/,
  );
  assert.deepEqual(browserLaunchOptions({ BROWSER_PATH: process.execPath }, managed), {
    executablePath: process.execPath,
  });
  assert.throws(
    () =>
      browserLaunchOptions(
        { BROWSER_PATH: process.execPath },
        { executablePath: () => path.join(os.tmpdir(), 'different-browser') },
      ),
    /pinned Playwright Chromium/,
  );
  assert.equal(validateBrowserRuntime({ version: () => '151.0.7922.34' }), '151.0.7922.34');
  assert.throws(() => validateBrowserRuntime({ version: () => '152.0.0.0' }), /browser version/i);
  assert.deepEqual(captureContextOptions(), {
    viewport: { width: 390, height: 820 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    reducedMotion: 'no-preference',
  });
});

test('path identity follows the target platform case rules', async () => {
  const { samePlatformPath } = await contract();

  assert.equal(
    samePlatformPath('C:\\Work0\\Receipt.json', 'c:\\work0\\receipt.JSON', 'win32'),
    true,
  );
  assert.equal(samePlatformPath('/Work0/Receipt.json', '/work0/receipt.json', 'linux'), false);
  assert.equal(samePlatformPath('/Work0/Receipt.json', '/Work0/Receipt.json', 'darwin'), true);
});

test('hosted app URLs accept only canonical in-app paths', async () => {
  const { navigateHostedAppRoute, resolveHostedAppUrl } = await contract();

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
    assert.throws(
      () => resolveHostedAppUrl('http://localhost:8977', unsafe),
      /unsafe app route/i,
      unsafe,
    );
  }
  let evaluatedTarget;
  await navigateHostedAppRoute(
    {
      async evaluate(callback, target) {
        assert.match(callback.toString(), /history\.pushState/);
        assert.match(callback.toString(), /PopStateEvent/);
        evaluatedTarget = target;
      },
    },
    'http://localhost:8977',
    '/settings?tab=privacy',
  );
  assert.equal(evaluatedTarget, 'http://localhost:8977/2nd-B/settings?tab=privacy');
});

test('final URL validation is exact for origin, canonical path, query, and hash', async () => {
  const { validateFinalUrl } = await contract();

  assert.doesNotThrow(() =>
    validateFinalUrl(
      'http://localhost:8977',
      '/persona?tab=one',
      'http://localhost:8977/2nd-B/persona?tab=one',
    ),
  );
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

test('D axis scores only visible actionable labels and removes only exempted items', async () => {
  const { formatNavigationWhy, scoreNavigationLabels } = await contract();
  const declared = ['설정', '계정 설정…', '새 대화'];
  const result = scoreNavigationLabels(
    declared,
    [
      { label: '설정', to: null },
      { label: '계정 설정 안내', to: '/settings' },
    ],
    ['새 대화'],
  );

  assert.equal(result.score, 15);
  assert.equal(result.measurable, true);
  assert.equal(result.declared, 3);
  assert.equal(result.measured, 2);
  assert.equal(result.exempted, 1);
  assert.equal(result.requiresManualReview, true);
  assert.deepEqual(result.manualReviewReasons, ['actionable-only-targets']);
  assert.deepEqual(result.missing, []);

  const missing = scoreNavigationLabels(declared, [{ label: '설정', to: null }], ['새 대화']);
  assert.equal(missing.score, 7.5);
  assert.deepEqual(missing.missing, ['계정 설정…']);
  assert.equal(scoreNavigationLabels(null, [{ label: '설정', to: null }]).score, null);

  const staticLookalike = scoreNavigationLabels(['설정'], []);
  assert.equal(staticLookalike.score, 0);
  assert.deepEqual(staticLookalike.missing, ['설정']);

  const duplicateCannotReuseOneAction = scoreNavigationLabels(
    ['설정', '설정'],
    [{ label: '설정', to: null }],
  );
  assert.equal(duplicateCannotReuseOneAction.score, 7.5);
  assert.deepEqual(duplicateCannotReuseOneAction.missing, ['설정']);

  const unsafeTarget = scoreNavigationLabels(
    ['설정'],
    [{ label: '설정', to: 'https://example.invalid/settings' }],
    [],
    { baseUrl: 'http://localhost:8977' },
  );
  assert.equal(unsafeTarget.score, 0);
  assert.equal(unsafeTarget.evidence.unsafeTargets, 1);

  const safeTarget = scoreNavigationLabels(
    ['설정'],
    [{ label: '설정', to: '/2nd-B/settings' }],
    [],
    {
      baseUrl: 'http://localhost:8977',
    },
  );
  assert.equal(safeTarget.score, 15);
  assert.equal(safeTarget.evidence.safeHrefs, 1);
  assert.equal(safeTarget.requiresManualReview, false);
  assert.equal(
    formatNavigationWhy(safeTarget),
    'declared 1 · measured 1 · exempt 0 · missing 0 · evidence safe-href 1 / actionable-only 0 / unsafe-target 0',
  );
});

test('D v2 validates exact route and action contracts without clicking unsafe items', async () => {
  const { formatNavigationWhy, normalizeNavigationContract, scoreExactNavigationResults } =
    await contract();
  const nav = normalizeNavigationContract(
    {
      version: 2,
      items: [
        { label: '설정', kind: 'route', to: '/settings' },
        {
          label: '프로필',
          kind: 'action',
          effect: { type: 'visible', role: 'button', name: '여행하기' },
        },
        {
          label: '지금',
          kind: 'action',
          safe: false,
          why: '제안 생성은 LLM 호출과 사용자별 근거가 필요함',
        },
      ],
      unresolved: [
        { label: '새 대화', why: '현재 앱에서 대응되는 독립 대화 action을 확인할 수 없음' },
      ],
    },
    'http://localhost:8977',
  );

  assert.equal(nav.items.length, 3);
  assert.equal(nav.items[0].occurrence, 1);
  assert.equal(nav.items[0].to, '/settings');
  assert.equal(nav.items[1].safe, true);
  assert.equal(nav.items[2].safe, false);
  assert.equal(nav.unresolved.length, 1);

  const result = scoreExactNavigationResults(nav, [
    { index: 0, passed: true, evidence: 'exact-route' },
    { index: 1, passed: true, evidence: 'visible-effect' },
  ]);
  assert.equal(result.score, 7.5);
  assert.equal(result.matched, 2);
  assert.equal(result.declared, 4);
  assert.equal(result.measured, 2);
  assert.equal(result.requiresManualReview, true);
  assert.deepEqual(result.manualReviewReasons, ['unsafe-actions', 'unresolved-items']);
  assert.deepEqual(result.missing, ['지금', '새 대화']);
  assert.deepEqual(result.evidence, {
    exactRoutes: 1,
    exactActions: 1,
    unsafeActions: 1,
    unresolved: 1,
  });
  const explanation = formatNavigationWhy(result);
  assert.equal(
    explanation,
    'declared 4 · measured 2 · exempt 0 · missing 2 → 지금 / 새 대화 · exact routes 1 · exact actions 1 · unsafe actions 1 · unresolved 1 · manual review unsafe-actions / unresolved-items',
  );
  assert.doesNotMatch(explanation, /undefined/);

  const failed = scoreExactNavigationResults(nav, [
    { index: 0, passed: false, failure: 'mutation-blocked' },
    { index: 1, passed: false, failure: 'effect-mismatch' },
  ]);
  const failedExplanation = formatNavigationWhy(failed);
  assert.equal(
    failedExplanation,
    'declared 4 · measured 2 · exempt 0 · missing 4 → 설정 / 프로필 / 지금 / 새 대화 · unsafe actions 1 · unresolved 1 · failures mutation-blocked 1 / effect-mismatch 1 · manual review unsafe-actions / unresolved-items',
  );
  assert.doesNotMatch(failedExplanation, /undefined/);
});

test('D v2 schema is fail-closed for fuzzy, duplicate, unsafe, and incomplete declarations', async () => {
  const { normalizeNavigationContract } = await contract();
  const baseUrl = 'http://localhost:8977';
  const rejects = [
    { version: 2, items: [], unresolved: [] },
    { version: 2, items: [{ label: '설정', kind: 'route', to: 'https://example.test/settings' }] },
    { version: 2, items: [{ label: '설정', kind: 'route' }] },
    { version: 2, items: [{ label: '설정 안내', kind: 'action' }] },
    { version: 2, items: [{ label: '지금', kind: 'action', safe: false }] },
    {
      version: 2,
      items: [
        {
          label: '지금',
          kind: 'action',
          safe: 'false',
          effect: { type: 'selected' },
        },
      ],
    },
    {
      version: 2,
      items: [
        {
          label: '지금',
          kind: 'action',
          safe: null,
          effect: { type: 'selected' },
        },
      ],
    },
    {
      version: 2,
      items: [
        {
          label: '지금',
          kind: 'action',
          safe: 0,
          effect: { type: 'selected' },
        },
      ],
    },
    {
      version: 2,
      items: [
        {
          label: '프로필',
          kind: 'action',
          effect: { type: 'visible', name: '여행하기', value: true },
        },
      ],
    },
    {
      version: 2,
      items: [
        { label: '설정', kind: 'route', to: '/settings' },
        { label: '설정', kind: 'route', to: '/settings' },
      ],
    },
    { version: 2, items: [], unresolved: [{ label: '새 대화' }] },
    {
      version: 2,
      items: [{ label: '설정', kind: 'route', to: '/settings' }],
      unresolved: [{ label: '설정', why: '중복 선언' }],
    },
  ];
  for (const declaration of rejects) {
    assert.throws(() => normalizeNavigationContract(declaration, baseUrl), /navigation contract/i);
  }

  const duplicates = normalizeNavigationContract(
    {
      version: 2,
      items: [
        { label: '문장 다듬기', occurrence: 1, kind: 'route', to: '/northstar' },
        { label: '문장 다듬기', occurrence: 2, kind: 'route', to: '/northstar' },
      ],
      unresolved: [],
    },
    baseUrl,
  );
  assert.deepEqual(
    duplicates.items.map((item) => item.occurrence),
    [1, 2],
  );
});

test('D v2 runner probes each safe item once and never invokes an unsafe action', async () => {
  const { normalizeNavigationContract, runExactNavigationChecks } = await contract();
  const nav = normalizeNavigationContract(
    {
      version: 2,
      items: [
        {
          label: '위키',
          kind: 'route',
          to: '/records',
          locator: { strategy: 'role', role: 'tab', name: '위키' },
        },
        { label: '프로필', kind: 'action', effect: { type: 'selected' } },
        {
          label: '지금',
          kind: 'action',
          safe: false,
          why: 'LLM 제안 생성은 자동 클릭하지 않음',
          locator: { strategy: 'role', role: 'button', name: '지금' },
          effect: { type: 'visible', role: 'button', name: '승인' },
        },
      ],
      unresolved: [],
    },
    'http://localhost:8977',
  );
  const calls = [];
  const results = await runExactNavigationChecks(nav, async (item, index) => {
    calls.push({ label: item.label, index });
    if (index === 1) throw new Error('raw browser detail must not escape');
    return { passed: true, evidence: 'exact-route' };
  });

  assert.deepEqual(calls, [
    { label: '위키', index: 0 },
    { label: '프로필', index: 1 },
  ]);
  assert.deepEqual(results, [
    { index: 0, passed: true, evidence: 'exact-route' },
    { index: 1, passed: false, evidence: null, failure: 'probe-failed' },
  ]);
  assert.doesNotMatch(JSON.stringify(results), /raw browser detail/);
});

test('D manual effect evidence is fresh and bound to export, contract, artifact, and exact effect', async () => {
  const {
    isAutomaticPass,
    isReviewedPass,
    loadManualEffectEvidence,
    navigationContractSha256,
    normalizeNavigationContract,
    scoreExactNavigationResults,
    sourceBodySha256,
    validateManualEffectEvidence,
  } = await contract();
  const now = Date.parse('2026-08-28T10:00:00.000Z');
  const exportedAt = now - 60_000;
  const exportSha256 = 'a'.repeat(64);
  const nav = normalizeNavigationContract(
    {
      version: 2,
      items: [
        ...['병자리', '담기', '세컨비', '위키', '설정'].map((label, index) => ({
          label,
          kind: 'route',
          to: ['/', '/capture', '/secondb', '/records', '/settings'][index],
          locator: { strategy: 'role', role: 'tab', name: label },
        })),
        ...['학창시절', '지금'].map((label) => ({
          label,
          kind: 'action',
          safe: false,
          why: '사용자별 근거로 제안을 생성하므로 자동 클릭하지 않음',
          locator: { strategy: 'role', role: 'button', name: label },
          effect: { type: 'visible', role: 'button', name: '승인', occurrence: 1 },
        })),
      ],
      unresolved: [],
    },
    'http://localhost:8977',
  );
  const automaticResults = nav.items.slice(0, 5).map((_, index) => ({
    index,
    passed: true,
    evidence: 'exact-route',
  }));
  const withoutEvidence = scoreExactNavigationResults(nav, automaticResults);
  assert.equal(withoutEvidence.score, (5 / 7) * 15);
  assert.equal(withoutEvidence.matched, 5);
  assert.deepEqual(withoutEvidence.missing, ['학창시절', '지금']);

  const artifactRoot = mkdtempSync(path.join(os.tmpdir(), 'work0-manual-effect-'));
  try {
    const artifacts = ['school.png', 'now.png'].map((name, index) => {
      const png = new PNG({ width: 1, height: 1 });
      png.data.set([index, 0, 0, 255]);
      const body = PNG.sync.write(png);
      writeFileSync(path.join(artifactRoot, name), body);
      return { path: name, sha256: sourceBodySha256(body) };
    });
    const manifest = {
      schemaVersion: 1,
      exportSha256,
      screens: [
        {
          screen: 'review',
          contractSha256: navigationContractSha256(nav),
          items: ['학창시절', '지금'].map((label, index) => ({
            label,
            occurrence: 1,
            effect: { type: 'visible', role: 'button', name: '승인', occurrence: 1 },
            artifact: artifacts[index],
            attestation: {
              type: 'human-observed-effect',
              observedAt: new Date(now - 1_000 + index).toISOString(),
            },
          })),
        },
      ],
    };
    const validate = (candidate) =>
      validateManualEffectEvidence(candidate, {
        artifactRoot,
        contracts: { review: nav },
        targetIds: ['review'],
        exportSha256,
        exportedAt,
        now,
      });
    const validated = validate(manifest);
    const evidence = validated.get('review');
    const withEvidence = scoreExactNavigationResults(nav, automaticResults, [], evidence);
    assert.equal(withEvidence.score, 15);
    assert.equal(withEvidence.matched, 7);
    assert.equal(withEvidence.measured, 7);
    assert.deepEqual(withEvidence.missing, []);
    assert.deepEqual(withEvidence.manualReviewReasons, ['manual-effect-evidence']);
    assert.equal(withEvidence.manualEvidenceComplete, true);
    assert.equal(withEvidence.evidence.manualEffects, 2);
    const oversizedManifestPath = path.join(artifactRoot, 'oversized-evidence.json');
    writeFileSync(
      oversizedManifestPath,
      `${JSON.stringify(manifest)}${' '.repeat(300 * 1024)}`,
    );
    assert.throws(
      () =>
        loadManualEffectEvidence(
          { MANUAL_EFFECT_EVIDENCE: oversizedManifestPath },
          {
            contracts: { review: nav },
            targetIds: ['review'],
            exportSha256,
            exportedAt,
            now,
          },
        ),
      /manual effect evidence/i,
    );
    const schoolEffect = nav.items.find((item) => item.label === '학창시절').effect;
    const originalEffectName = schoolEffect.name;
    schoolEffect.name = '변조된 승인';
    try {
      assert.throws(
        () => scoreExactNavigationResults(nav, automaticResults, [], evidence),
        /manual effect evidence/i,
      );
    } finally {
      schoolEffect.name = originalEffectName;
    }
    assert.equal(Object.isFrozen(evidence[0].effect), true);
    assert.equal(isAutomaticPass(100, ['C'], ['D']), false);
    assert.equal(isReviewedPass(100, ['C'], [], []), false);
    assert.equal(isReviewedPass(100, ['C'], ['D'], []), false);
    assert.equal(isReviewedPass(100, ['C'], ['D'], ['D']), true);
    assert.equal(isReviewedPass(97.9, ['C'], ['D'], ['D']), false);
    assert.equal(isReviewedPass(100, ['C', 'E'], ['D'], ['D']), false);
    assert.equal(isReviewedPass(100, ['C'], ['D', 'E'], ['D']), false);

    assert.throws(
      () => scoreExactNavigationResults(nav, automaticResults, [], manifest.screens[0].items),
      /manual effect evidence/i,
    );
    const corruptArtifact = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      Buffer.from('not-a-decodable-png'),
    ]);
    writeFileSync(path.join(artifactRoot, 'corrupt.png'), corruptArtifact);
    const hiddenPng = new PNG({ width: 1, height: 1 });
    hiddenPng.data.set([3, 0, 0, 255]);
    const hiddenArtifact = PNG.sync.write(hiddenPng);
    writeFileSync(path.join(artifactRoot, 'stream-host.txt'), 'host');
    writeFileSync(path.join(artifactRoot, 'stream-host.txt:proof.png'), hiddenArtifact);
    const repeatedPng = new PNG({ width: 1, height: 1 });
    repeatedPng.data.set([4, 0, 0, 255]);
    const repeatedFast = PNG.sync.write(repeatedPng, { deflateLevel: 0 });
    const repeatedCompact = PNG.sync.write(repeatedPng, { deflateLevel: 9 });
    assert.notEqual(sourceBodySha256(repeatedFast), sourceBodySha256(repeatedCompact));
    writeFileSync(path.join(artifactRoot, 'repeated-fast.png'), repeatedFast);
    writeFileSync(path.join(artifactRoot, 'repeated-compact.png'), repeatedCompact);
    const rejects = [
      {
        label: 'stale',
        mutate: (value) =>
          (value.screens[0].items[0].attestation.observedAt = new Date(
            now - 2 * 60 * 60 * 1000 - 1,
          ).toISOString()),
      },
      { label: 'orphan', mutate: (value) => (value.screens[0].items[0].label = '없는 항목') },
      { label: 'export hash', mutate: (value) => (value.exportSha256 = 'b'.repeat(64)) },
      {
        label: 'contract hash',
        mutate: (value) => (value.screens[0].contractSha256 = 'b'.repeat(64)),
      },
      {
        label: 'artifact hash',
        mutate: (value) => (value.screens[0].items[0].artifact.sha256 = 'b'.repeat(64)),
      },
      {
        label: 'artifact traversal',
        mutate: (value) => (value.screens[0].items[0].artifact.path = '../school.png'),
      },
      {
        label: 'alternate data stream',
        mutate: (value) => {
          value.screens[0].items[0].artifact = {
            path: 'stream-host.txt:proof.png',
            sha256: sourceBodySha256(hiddenArtifact),
          };
        },
      },
      {
        label: 'artifact reuse',
        mutate: (value) =>
          (value.screens[0].items[1].artifact = structuredClone(
            value.screens[0].items[0].artifact,
          )),
      },
      {
        label: 'visual artifact reuse',
        mutate: (value) => {
          value.screens[0].items[0].artifact = {
            path: 'repeated-fast.png',
            sha256: sourceBodySha256(repeatedFast),
          };
          value.screens[0].items[1].artifact = {
            path: 'repeated-compact.png',
            sha256: sourceBodySha256(repeatedCompact),
          };
        },
      },
      { label: 'occurrence', mutate: (value) => (value.screens[0].items[0].occurrence = 2) },
      { label: 'effect', mutate: (value) => (value.screens[0].items[0].effect.name = '아니요') },
      {
        label: 'future attestation',
        mutate: (value) =>
          (value.screens[0].items[0].attestation.observedAt = new Date(now + 1).toISOString()),
      },
      { label: 'screen outside target', mutate: (value) => (value.screens[0].screen = 'other') },
      {
        label: 'unknown key',
        mutate: (value) => (value.screens[0].items[0].note = '신뢰하지 않음'),
      },
      {
        label: 'corrupt png',
        mutate: (value) => {
          value.screens[0].items[0].artifact = {
            path: 'corrupt.png',
            sha256: sourceBodySha256(corruptArtifact),
          };
        },
      },
    ];
    for (const rejection of rejects) {
      const candidate = structuredClone(manifest);
      rejection.mutate(candidate);
      assert.throws(() => validate(candidate), /manual effect evidence/i, rejection.label);
    }
  } finally {
    for (const name of [
      'stream-host.txt:proof.png',
      'stream-host.txt',
      'repeated-fast.png',
      'repeated-compact.png',
      'oversized-evidence.json',
      'school.png',
      'now.png',
      'corrupt.png',
    ]) {
      const artifact = path.join(artifactRoot, name);
      if (existsSync(artifact)) unlinkSync(artifact);
    }
    rmdirSync(artifactRoot);
  }
});

test('review unsafe actions declare exact role locators and expected effects without evidence', async () => {
  const { normalizeNavigationContract, scoreExactNavigationResults } = await contract();
  const navFile = JSON.parse(
    readFileSync(path.join(REPO, 'design/pixel_clay_260825/data/nav.json'), 'utf8'),
  );
  const rawReview = navFile.review;
  assert.equal(Object.hasOwn(rawReview, 'evidence'), false);
  assert.equal(Object.hasOwn(rawReview, 'manualEvidence'), false);
  const review = normalizeNavigationContract(rawReview, 'http://localhost:8977');
  assert.deepEqual(
    review.items
      .filter((item) => item.safe === false)
      .map((item) => ({
        label: item.label,
        occurrence: item.occurrence,
        locator: item.locator,
        effect: item.effect,
      })),
    ['학창시절', '지금'].map((label) => ({
      label,
      occurrence: 1,
      locator: { strategy: 'role', role: 'button', name: label },
      effect: { type: 'visible', role: 'button', name: '승인', occurrence: 1 },
    })),
  );
  const withoutEvidence = scoreExactNavigationResults(
    review,
    review.items.slice(2).map((_, offset) => ({
      index: offset + 2,
      passed: true,
      evidence: 'exact-route',
    })),
  );
  assert.equal(withoutEvidence.score, (5 / 7) * 15);
  assert.equal(Math.round(withoutEvidence.score * 1000) / 1000, 10.714);
  assert.deepEqual(withoutEvidence.missing, ['학창시절', '지금']);
});

test('D manual effect evidence enforces an aggregate item budget', async () => {
  const {
    navigationContractSha256,
    normalizeNavigationContract,
    sourceBodySha256,
    validateManualEffectEvidence,
  } = await contract();
  const itemCount = 17;
  const labels = Array.from({ length: itemCount }, (_, index) => `수동 항목 ${index + 1}`);
  const nav = normalizeNavigationContract(
    {
      version: 2,
      items: labels.map((label) => ({
        label,
        kind: 'action',
        safe: false,
        why: '사람이 직접 확인해야 하는 상태 변경',
        locator: { strategy: 'role', role: 'button', name: label },
        effect: { type: 'visible', role: 'button', name: '승인' },
      })),
      unresolved: [],
    },
    'http://localhost:8977',
  );
  const artifactRoot = mkdtempSync(path.join(os.tmpdir(), 'work0-manual-budget-'));
  const names = labels.map((_, index) => `item-${index + 1}.png`);
  try {
    const artifacts = names.map((name, index) => {
      const png = new PNG({ width: 1, height: 1 });
      png.data.set([index, 1, 0, 255]);
      const body = PNG.sync.write(png);
      writeFileSync(path.join(artifactRoot, name), body);
      return { path: name, sha256: sourceBodySha256(body) };
    });
    const now = Date.parse('2026-08-28T10:00:00.000Z');
    const exportSha256 = 'a'.repeat(64);
    const manifest = {
      schemaVersion: 1,
      exportSha256,
      screens: [
        {
          screen: 'review',
          contractSha256: navigationContractSha256(nav),
          items: labels.map((label, index) => ({
            label,
            occurrence: 1,
            effect: { type: 'visible', role: 'button', name: '승인', occurrence: 1 },
            artifact: artifacts[index],
            attestation: {
              type: 'human-observed-effect',
              observedAt: new Date(now - 1_000 + index).toISOString(),
            },
          })),
        },
      ],
    };
    assert.throws(
      () =>
        validateManualEffectEvidence(manifest, {
          artifactRoot,
          contracts: { review: nav },
          targetIds: ['review'],
          exportSha256,
          exportedAt: now - 60_000,
          now,
        }),
      /manual effect evidence/i,
    );
  } finally {
    for (const name of names) {
      const artifact = path.join(artifactRoot, name);
      if (existsSync(artifact)) unlinkSync(artifact);
    }
    rmdirSync(artifactRoot);
  }
});

test('exact role navigation target must contain its painted label', async () => {
  const { locateExactNavigationTarget } = await contract();
  const item = {
    label: '위키',
    occurrence: 1,
    locator: { strategy: 'role', role: 'tab', name: '위키' },
  };
  const makeCollection = (entries) => ({
    async count() {
      return entries.length;
    },
    nth(index) {
      return entries[index];
    },
  });
  const visibleText = {
    async isVisible() {
      return true;
    },
    async elementHandle() {
      return { async dispose() {} };
    },
  };
  const makeTarget = (containsPainted) => ({
    async isVisible() {
      return true;
    },
    async evaluate(callback, paintedHandle) {
      assert.equal(typeof callback, 'function');
      assert.equal(typeof paintedHandle.dispose, 'function');
      return containsPainted;
    },
  });
  const inside = makeTarget(true);
  const outside = makeTarget(false);
  const page = (target) => ({
    getByRole(role, { name, exact }) {
      assert.equal(role, 'tab');
      assert.equal(name, '위키');
      assert.equal(exact, true);
      return makeCollection([target]);
    },
    getByText(label, { exact }) {
      assert.equal(label, '위키');
      assert.equal(exact, true);
      return makeCollection([visibleText]);
    },
  });

  assert.equal(await locateExactNavigationTarget(page(inside), item), inside);
  assert.equal(await locateExactNavigationTarget(page(outside), item), null);
});

test('every Stage 1 screen requires a valid v2 navigation contract', async () => {
  const { validateStage1NavigationContracts } = await contract();
  const valid = {
    home: {
      version: 2,
      items: [{ label: '설정', kind: 'route', to: '/settings' }],
      unresolved: [],
    },
    chat: {
      version: 2,
      items: [{ label: '세컨비', kind: 'action', effect: { type: 'selected' } }],
      unresolved: [],
    },
  };
  assert.equal(
    validateStage1NavigationContracts(['home', 'chat'], valid, 'http://localhost:8977'),
    true,
  );
  assert.equal(
    validateStage1NavigationContracts(
      ['home', 'chat'],
      { ...valid, chat: ['세컨비'] },
      'http://localhost:8977',
    ),
    false,
  );
  assert.equal(
    validateStage1NavigationContracts(
      ['home', 'chat'],
      { home: valid.home },
      'http://localhost:8977',
    ),
    false,
  );
});

test('C stays unmeasured while totals renormalize and unexpected missing axes fail the gate', async () => {
  const { isAutomaticPass, renormalizeScores } = await contract();
  const complete = renormalizeScores({ A: 30, B: 25, C: null, D: 15, E: 10 });
  assert.deepEqual(complete, {
    scores: { A: 30, B: 25, C: null, D: 15, E: 10 },
    total: 100,
    unmeasured: ['C'],
  });
  assert.equal(isAutomaticPass(complete.total, complete.unmeasured), true);

  const missingD = renormalizeScores({ A: 30, B: 25, C: null, D: null, E: 10 });
  assert.deepEqual(missingD.unmeasured, ['C', 'D']);
  assert.equal(isAutomaticPass(missingD.total, missingD.unmeasured), false);
  assert.equal(isAutomaticPass(100, ['C'], ['A']), false);
});

test('deviations distinguish whole-axis review from item-only denominator exclusions', async () => {
  const { exempt, exemptItems, reviewedNavigationAxes, scoreCopyCoverage, scoreNavigationLabels } =
    await contract();
  const deviations = {
    deviations: [
      { screen: 'chat', axis: 'D', items: ['새 대화'], why: '상태 뒤에 숨은 목적지' },
      { screen: 'chat', axis: 'E', why: '사람 눈 검토가 필요한 전체 축' },
      { screen: 'chat', axis: 'A', why: '' },
    ],
  };

  assert.deepEqual(exemptItems('chat', 'D', deviations), ['새 대화']);
  assert.equal(exempt('chat', 'D', deviations), false);
  assert.equal(exempt('chat', 'E', deviations), true);
  assert.equal(exempt('chat', 'A', deviations), false);
  assert.deepEqual(reviewedNavigationAxes('chat', deviations, { manualEvidenceComplete: true }), [
    'D',
  ]);
  const wholeAxisD = {
    deviations: [...deviations.deviations, { screen: 'chat', axis: 'D', why: '별도 사람 검토' }],
  };
  assert.deepEqual(
    reviewedNavigationAxes('chat', wholeAxisD, { manualEvidenceComplete: true }),
    [],
  );

  const labels = ['목적지 하나', '목적지 둘', '목적지 셋', '목적지 넷'];
  const halfNavigation = scoreNavigationLabels(labels, [], labels.slice(0, 2));
  assert.equal(halfNavigation.requiresManualReview, false);
  const majorityNavigation = scoreNavigationLabels(labels, [], labels.slice(0, 3));
  assert.equal(majorityNavigation.requiresManualReview, true);

  const halfCopy = scoreCopyCoverage(labels, [], [], labels.slice(0, 2));
  assert.equal(halfCopy.requiresManualReview, false);
  const majorityCopy = scoreCopyCoverage(labels, [], [], labels.slice(0, 3));
  assert.equal(majorityCopy.requiresManualReview, true);
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
  assert.deepEqual(shotFailureCodes({ baseUrl: 'http://localhost:8977', ...health }), [
    'asset-404',
    'page-error',
    'console-error',
    'network-failure',
  ]);
  assert.equal(health.failureCodes.length, 4);
  assert.equal(JSON.stringify(health).includes('must-not-survive'), false);
});

test('pre-measurement notice dismissal correlates one exact idempotent read conflict', async () => {
  const {
    captureSetupFailureCodes,
    createShotHealth,
    recordShotConsole,
    recordShotFailure,
    recordShotResponse,
  } = await contract();
  const message = (url) => ({
    type: () => 'error',
    location: () => ({ url }),
  });
  const health = createShotHealth({ noticeReadOrigin: 'https://example.supabase.co' });
  recordShotConsole(health, message('https://example.supabase.co/rest/v1/user_notice_reads'));
  recordShotResponse(
    health,
    'http://localhost:8977',
    'https://example.supabase.co/rest/v1/user_notice_reads',
    409,
    'POST',
  );
  assert.deepEqual(captureSetupFailureCodes('http://localhost:8977', health), []);

  recordShotConsole(health, message('https://example.supabase.co/rest/v1/other_table'));
  assert.deepEqual(captureSetupFailureCodes('http://localhost:8977', health), ['console-error']);

  const wrongOrigin = createShotHealth({ noticeReadOrigin: 'https://expected.supabase.co' });
  recordShotConsole(wrongOrigin, message('https://example.supabase.co/rest/v1/user_notice_reads'));
  recordShotResponse(
    wrongOrigin,
    'http://localhost:8977',
    'https://example.supabase.co/rest/v1/user_notice_reads',
    409,
    'POST',
  );
  assert.deepEqual(captureSetupFailureCodes('http://localhost:8977', wrongOrigin), [
    'console-error',
  ]);

  recordShotFailure(health, 'page-error');
  assert.deepEqual(captureSetupFailureCodes('http://localhost:8977', health), [
    'page-error',
    'console-error',
  ]);
  assert.equal(JSON.stringify(health).includes('example.supabase.co'), false);
});

test('navigation probe health and blocked mutation fail before success evidence', async () => {
  const {
    createShotHealth,
    isCaptureNoticeReadRequest,
    navigationProbeFailureCode,
    recordShotFailure,
  } = await contract();
  const healthy = createShotHealth();
  assert.equal(navigationProbeFailureCode('http://localhost:8977', healthy, false), null);
  assert.equal(
    navigationProbeFailureCode('http://localhost:8977', healthy, true),
    'mutation-blocked',
  );
  recordShotFailure(healthy, 'page-error');
  assert.equal(
    navigationProbeFailureCode('http://localhost:8977', healthy, false),
    'source-health',
  );

  const request = (method, url) => ({ method: () => method, url: () => url });
  assert.equal(
    isCaptureNoticeReadRequest(
      request('POST', 'https://example.supabase.co/rest/v1/user_notice_reads'),
      'https://example.supabase.co',
      true,
    ),
    true,
  );
  assert.equal(
    isCaptureNoticeReadRequest(
      request('POST', 'https://example.supabase.co/rest/v1/user_notice_reads'),
      'https://example.supabase.co',
      false,
    ),
    false,
  );
  assert.equal(
    isCaptureNoticeReadRequest(
      request('GET', 'https://example.supabase.co/rest/v1/user_notice_reads'),
      'https://example.supabase.co',
      true,
    ),
    false,
  );
  assert.equal(
    isCaptureNoticeReadRequest(
      request('POST', 'https://other.supabase.co/rest/v1/user_notice_reads'),
      'https://example.supabase.co',
      true,
    ),
    false,
  );
});

test('network failures stay bound to the route health that started the request', async () => {
  const { createShotHealth, createShotNetworkTracker, waitForShotNetworkIdle } = await contract();
  const previous = createShotHealth();
  const next = createShotHealth();
  const truncated = createShotHealth();
  const failedHeadStatus = createShotHealth();
  const failedHeadError = createShotHealth();
  const tracker = createShotNetworkTracker();
  const successfulHead = {
    method: () => 'HEAD',
    failure: () => ({ errorText: 'net::ERR_ABORTED' }),
  };
  const truncatedGet = {
    method: () => 'GET',
    failure: () => ({ errorText: 'net::ERR_FAILED' }),
  };
  const previousRequest = {};
  const nextRequest = {};

  tracker.start(successfulHead, previous);
  tracker.response(
    successfulHead,
    'http://127.0.0.1:8979',
    'https://project.supabase.co/rest/v1/records',
    200,
  );
  tracker.fail(successfulHead);
  assert.deepEqual(previous.failureCodes, []);

  tracker.start(truncatedGet, truncated);
  tracker.response(
    truncatedGet,
    'http://127.0.0.1:8979',
    'https://project.supabase.co/rest/v1/records',
    200,
  );
  tracker.fail(truncatedGet);
  assert.deepEqual(truncated.failureCodes, ['network-failure']);

  const head500 = {
    method: () => 'HEAD',
    failure: () => ({ errorText: 'net::ERR_ABORTED' }),
  };
  tracker.start(head500, failedHeadStatus);
  tracker.response(
    head500,
    'http://127.0.0.1:8979',
    'https://project.supabase.co/rest/v1/records',
    500,
  );
  tracker.fail(head500);
  assert.deepEqual(failedHeadStatus.failureCodes, ['network-failure']);

  const headNetworkError = {
    method: () => 'HEAD',
    failure: () => ({ errorText: 'net::ERR_CONNECTION_RESET' }),
  };
  tracker.start(headNetworkError, failedHeadError);
  tracker.response(
    headNetworkError,
    'http://127.0.0.1:8979',
    'https://project.supabase.co/rest/v1/records',
    200,
  );
  tracker.fail(headNetworkError);
  assert.deepEqual(failedHeadError.failureCodes, ['network-failure']);

  tracker.start(previousRequest, previous);
  tracker.start(nextRequest, next);
  tracker.fail(previousRequest);
  assert.deepEqual(previous.failureCodes, ['network-failure']);
  assert.deepEqual(next.failureCodes, []);
  assert.equal(previous.pendingRequests, 0);
  assert.equal(next.pendingRequests, 1);

  let clock = 0;
  const page = {
    waitForTimeout: async (ms) => {
      clock += ms;
      if (clock === ms) tracker.finish(nextRequest);
    },
  };
  await waitForShotNetworkIdle(page, next, {
    maxMs: 1000,
    pollMs: 50,
    quietMs: 100,
    now: () => clock,
  });
  assert.equal(next.pendingRequests, 0);
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
  assert.equal(
    duplicate.errors.some((entry) => entry.code === 'duplicate-id' && entry.id === 'home'),
    true,
  );
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
    const result = validateManifestClassification([{ id, port: true }], {
      routes: { [id]: '/' },
      unmeasurable: {},
      unmapped: {},
    });
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
  assert.deepEqual(result.offTop, [{ hex: '#0000ff', pixels: 1 }]);
});

test('B token ramp derives typed composite and stacked-alpha colors with exact 8-bit sRGB rounding', async () => {
  const { tokenRamp } = await contract();
  const tokens = {
    derivedRamp: {
      sources: {
        base: '#0a0e18',
        'window-rim': '#96B4E6',
        'nebula-blue': '#285696',
        'nebula-violet': '#7860D2',
      },
      recipes: {
        'window-rim': {
          type: 'composite',
          background: 'base',
          foreground: 'window-rim',
          alpha: 0.16,
        },
        'shared-nebula': {
          type: 'stacked-alpha',
          background: 'base',
          layers: [
            { color: 'nebula-blue', alpha: { min: 0, max: 0.34 } },
            { color: 'nebula-violet', alpha: { min: 0, max: 0.2 } },
          ],
        },
      },
    },
  };
  const first = tokenRamp(tokens);
  const second = tokenRamp(tokens);
  assert.equal(first.has('#202939'), true, 'window rim composite');
  assert.equal(first.has('#202243'), true, 'actual stacked nebula gradient color');
  assert.equal(first.has('#283260'), true, 'stacked nebula endpoint');
  assert.equal(first.has('#96b4e6'), false, 'bounded foreground source is not a rendered color');
  assert.equal(first.has('#285696'), false, 'bounded blue source is not a rendered color');
  assert.equal(first.has('#7860d2'), false, 'bounded violet source is not a rendered color');
  assert.deepEqual([...first], [...second], 'derived output is deterministic');

  const actualTokens = JSON.parse(
    readFileSync(path.join(REPO, 'design/pixel_clay_260825/data/tokens.json'), 'utf8'),
  );
  const actualRamp = tokenRamp(actualTokens);
  assert.equal(actualRamp.has('#202939'), true);
  assert.equal(actualRamp.has('#202243'), true);

  const rejects = [
    { label: 'raw array', value: { ...tokens, derivedRamp: ['#202939'] } },
    {
      label: 'invalid type',
      mutate: (value) => (value.derivedRamp.recipes['window-rim'].type = 'colors'),
    },
    {
      label: 'unknown key',
      mutate: (value) => (value.derivedRamp.recipes['window-rim'].tolerance = 2),
    },
    { label: 'range', mutate: (value) => (value.derivedRamp.recipes['window-rim'].alpha = 1.01) },
    { label: 'layer', mutate: (value) => (value.derivedRamp.recipes['shared-nebula'].layers = []) },
    {
      label: 'unrelated literal',
      mutate: (value) => (value.derivedRamp.recipes['window-rim'].foreground = '#123456'),
    },
    {
      label: 'unknown token',
      mutate: (value) => (value.derivedRamp.recipes['window-rim'].foreground = 'missing'),
    },
    {
      label: 'layer key',
      mutate: (value) => (value.derivedRamp.recipes['shared-nebula'].layers[0].screen = 'review'),
    },
    {
      label: 'unrelated source',
      mutate: (value) => (value.derivedRamp.sources.unrelated = '#123456'),
    },
  ];
  for (const rejection of rejects) {
    const value = rejection.value ?? structuredClone(tokens);
    rejection.mutate?.(value);
    assert.throws(() => tokenRamp(value), /token ramp/i, rejection.label);
  }
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

  const reordered = scoreStructure(reference, digest([interactiveSection(200), textSection(100)]));
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
  const home = JSON.parse(
    readFileSync(path.join(REPO, 'design/pixel_clay_260825/data/structure/home.json'), 'utf8'),
  );
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
    assert.equal(
      texts.some((text) => /^\d{1,2}\s*[:.]\s*\d{2}$/.test(text)),
      false,
      file,
    );
  }
});

test('current manifest classifies every port:true screen exactly once', async () => {
  const { validateManifestClassification } = await contract();
  const screens = JSON.parse(
    readFileSync(path.join(REPO, 'design/pixel_clay_260825/data/screens.json'), 'utf8'),
  );
  const routes = JSON.parse(
    readFileSync(path.join(REPO, 'design/pixel_clay_260825/data/app-routes.json'), 'utf8'),
  );
  const result = validateManifestClassification(screens.screens, routes);
  const portTrue = screens.screens.filter((screen) => screen.port === true);
  const independentlyClassified = portTrue.map((screen) => [
    screen.id,
    ['routes', 'unmeasurable', 'unmapped'].filter((category) =>
      Object.hasOwn(routes[category] ?? {}, screen.id),
    ),
  ]);
  const expectedTargets = portTrue
    .filter((screen) => Object.hasOwn(routes.routes ?? {}, screen.id))
    .map((screen) => screen.id);
  const expectedStage1 = portTrue.filter((screen) => screen.stage === 1).map((screen) => screen.id);

  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.stats.portTrue, portTrue.length);
  assert.equal(
    independentlyClassified.every(([, categories]) => categories.length === 1),
    true,
  );
  assert.deepEqual(result.targetIds, expectedTargets);
  assert.deepEqual(result.stats.stage1, expectedStage1);
  assert.equal(
    result.targetIds.every(
      (id) => screens.screens.find((screen) => screen.id === id)?.port === true,
    ),
    true,
  );
});

test('score report exit contract distinguishes pass, score failure, and invalid input', async () => {
  const { reportExitCode } = await contract();
  assert.equal(reportExitCode({ validInput: true, rows: [{ automaticPass: true }] }), 0);
  assert.equal(
    reportExitCode({ validInput: true, rows: [{ automaticPass: false, reviewedPass: true }] }),
    0,
  );
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

test('score main classifies malformed input manifests as invalid input', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), '2ndb-work0-invalid-manifest-'));
  const manifests = {
    'screens.json': JSON.stringify({ screens: [{ id: 'home', port: true, stage: 1 }] }),
    'app-routes.json': JSON.stringify({ routes: { home: '/' }, unmeasurable: {}, unmapped: {} }),
    'tokens.json': JSON.stringify({}),
    'nav.json': JSON.stringify({ home: ['홈'] }),
    'deviations.json': JSON.stringify({ deviations: [] }),
  };
  try {
    const { main } = await contract();
    for (const malformed of Object.keys(manifests)) {
      for (const [name, body] of Object.entries(manifests)) {
        writeFileSync(path.join(dir, name), body);
      }
      writeFileSync(path.join(dir, malformed), '{');
      const errors = [];
      const originalError = console.error;
      console.error = (...values) => errors.push(values.join(' '));
      try {
        assert.equal(await main([], {}, dir), 2, malformed);
      } finally {
        console.error = originalError;
      }
      assert.match(errors.join('\n'), /invalid input manifest/i, malformed);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('score CLI returns runtime failure without overwriting a sentinel', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), '2ndb-work0-runtime-'));
  const out = path.join(dir, 'score.json');
  try {
    const { captureExportEnv, createCaptureEnvReceipt } = await contract();
    const easFile = path.join(dir, 'eas.json');
    const receiptFile = path.join(dir, 'receipt.json');
    const preview = {
      EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon',
      EXPO_PUBLIC_LLM_MODE: 'live',
    };
    const receipt = createCaptureEnvReceipt(preview);
    writeFileSync(easFile, JSON.stringify({ build: { preview: { env: preview } } }));
    writeFileSync(receiptFile, JSON.stringify(receipt));
    writeFileSync(out, 'sentinel-output');
    const cleanEnv = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('EXPO_PUBLIC_')),
    );
    const result = spawnSync(process.execPath, [SCORE_CLI, 'home'], {
      cwd: REPO,
      env: {
        ...cleanEnv,
        ...captureExportEnv(preview, receipt),
        BASE_URL: 'http://localhost:8977',
        CAPTURE_ENV_RECEIPT: receiptFile,
        EAS_FILE: easFile,
        SCORE_OUT: out,
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(readFileSync(out, 'utf8'), 'sentinel-output');
    assert.match(result.stderr, /score capture failed/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('score CLI classifies invalid deterministic time as input failure', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), '2ndb-work0-fixed-time-'));
  try {
    const { captureExportEnv, createCaptureEnvReceipt } = await contract();
    const easFile = path.join(dir, 'eas.json');
    const receiptFile = path.join(dir, 'receipt.json');
    const preview = {
      EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon',
      EXPO_PUBLIC_LLM_MODE: 'live',
    };
    const receipt = createCaptureEnvReceipt(preview);
    writeFileSync(easFile, JSON.stringify({ build: { preview: { env: preview } } }));
    writeFileSync(receiptFile, JSON.stringify(receipt));
    const cleanEnv = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('EXPO_PUBLIC_')),
    );
    const result = spawnSync(process.execPath, [SCORE_CLI, 'home'], {
      cwd: REPO,
      env: {
        ...cleanEnv,
        ...captureExportEnv(preview, receipt),
        CAPTURE_ENV_RECEIPT: receiptFile,
        EAS_FILE: easFile,
        FIXED_ISO: 'not-a-date',
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /FIXED_ISO/);
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
    const { captureExportEnv, createCaptureEnvReceipt } = await contract();
    const fakePlaywright = path.join(dir, 'fake-playwright.cjs');
    const easFile = path.join(dir, 'eas.json');
    const receiptFile = path.join(dir, 'receipt.json');
    const out = path.join(dir, 'captures');
    const preview = {
      EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon',
      EXPO_PUBLIC_LLM_MODE: 'live',
    };
    const receipt = createCaptureEnvReceipt(preview);
    writeFileSync(easFile, JSON.stringify({ build: { preview: { env: preview } } }));
    writeFileSync(receiptFile, JSON.stringify(receipt));
    writeFileSync(
      fakePlaywright,
      `
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
`,
    );
    const cleanEnv = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('EXPO_PUBLIC_')),
    );
    const result = spawnSync(process.execPath, [CAPTURE_CLI], {
      cwd: REPO,
      env: {
        ...cleanEnv,
        ...captureExportEnv(preview, receipt),
        BASE_URL: 'http://localhost:8977',
        BROWSER_PATH: process.execPath,
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

test('capture --export-web disables dotenv and atomically publishes an attested bundle', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), '2ndb-work0-export-'));
  try {
    const { createCaptureEnvReceipt } = await contract();
    const fakeExpo = path.join(dir, 'fake-expo.cjs');
    const easFile = path.join(dir, 'eas.json');
    const receiptFile = path.join(dir, 'receipt.json');
    const output = path.join(dir, 'published');
    const failedOutput = path.join(dir, 'failed-publish');
    const preview = {
      EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon',
      EXPO_PUBLIC_LLM_MODE: 'live',
    };
    const receipt = createCaptureEnvReceipt(preview);
    writeFileSync(easFile, JSON.stringify({ build: { preview: { env: preview } } }));
    writeFileSync(receiptFile, JSON.stringify(receipt));
    writeFileSync(
      fakeExpo,
      [
        "const fs = require('node:fs');",
        "const path = require('node:path');",
        "const index = process.argv.indexOf('--output-dir');",
        'const output = process.argv[index + 1];',
        "if (process.env.EXPO_NO_DOTENV !== '1' || process.env.EXPO_PUBLIC_ROGUE || process.env.expo_public_mixed_case_rogue || process.env.EXPO_PUBLIC_MIXED_CASE_ROGUE) process.exit(41);",
        "if (process.argv.filter((arg) => arg === '--clear').length !== 1) process.exit(42);",
        "const jsDir = path.join(output, '_expo', 'static', 'js', 'web');",
        'fs.mkdirSync(jsDir, { recursive: true });',
        "const body = 'app-bundle-without-attestation-markers';",
        "fs.writeFileSync(path.join(jsDir, 'app.js'), body);",
        "fs.writeFileSync(path.join(output, 'index.html'), '<html><head></head><body><script src=\"/2nd-B/_expo/static/js/web/app.js\"></script></body></html>');",
        "if (process.env.FAKE_EXPORT_FAIL === '1') process.exit(9);",
      ].join('\n'),
    );
    const commonEnv = {
      ...process.env,
      CAPTURE_ENV_RECEIPT: receiptFile,
      EAS_FILE: easFile,
      EXPO_CLI_PATH: fakeExpo,
      EXPO_PUBLIC_ROGUE: 'must-be-removed',
      expo_public_mixed_case_rogue: 'must-also-be-removed',
    };
    const success = spawnSync(process.execPath, [CAPTURE_CLI, '--export-web'], {
      cwd: REPO,
      env: { ...commonEnv, CAPTURE_EXPORT_DIR: output },
      encoding: 'utf8',
    });
    assert.equal(success.status, 0, `${success.stdout}\n${success.stderr}`);
    const proof = JSON.parse(readFileSync(path.join(output, 'work0-export-attestation.json')));
    assert.equal(proof.schemaVersion, 2);
    assert.equal(proof.receiptId, receipt.receiptId);
    assert.deepEqual(
      proof.files.map((file) => file.path),
      ['_expo/static/js/web/app.js', 'index.html', 'work0-export-marker.js'],
    );
    assert.match(proof.files[0].sha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(proof.inlineScripts, []);

    const duplicate = spawnSync(process.execPath, [CAPTURE_CLI, '--export-web'], {
      cwd: REPO,
      env: { ...commonEnv, CAPTURE_EXPORT_DIR: output },
      encoding: 'utf8',
    });
    assert.equal(duplicate.status, 2);

    const failed = spawnSync(process.execPath, [CAPTURE_CLI, '--export-web'], {
      cwd: REPO,
      env: {
        ...commonEnv,
        CAPTURE_EXPORT_DIR: failedOutput,
        FAKE_EXPORT_FAIL: '1',
      },
      encoding: 'utf8',
    });
    assert.equal(failed.status, 1);
    assert.equal(existsSync(failedOutput), false);
    assert.equal(
      readdirSync(dir).some((name) => name.startsWith('.work0-export-')),
      true,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('capture --export-web classifies a stale receipt as input failure', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), '2ndb-work0-stale-export-'));
  try {
    const { createCaptureEnvReceipt } = await contract();
    const easFile = path.join(dir, 'eas.json');
    const receiptFile = path.join(dir, 'receipt.json');
    const preview = {
      EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon',
      EXPO_PUBLIC_LLM_MODE: 'live',
    };
    const receipt = createCaptureEnvReceipt(preview, Date.now() - 3 * 60 * 60 * 1000);
    writeFileSync(easFile, JSON.stringify({ build: { preview: { env: preview } } }));
    writeFileSync(receiptFile, JSON.stringify(receipt));
    const result = spawnSync(process.execPath, [CAPTURE_CLI, '--export-web'], {
      cwd: REPO,
      env: {
        ...process.env,
        CAPTURE_ENV_RECEIPT: receiptFile,
        EAS_FILE: easFile,
        CAPTURE_EXPORT_DIR: path.join(dir, 'published'),
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 2, result.stderr);
    assert.equal(existsSync(path.join(dir, 'published')), false);
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
    writeFileSync(
      easFile,
      JSON.stringify({
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
      }),
    );
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
    assert.match(result.stdout, /EXPO_PUBLIC_WORK0_RECEIPT_ID=/);
    assert.match(result.stdout, /EXPO_PUBLIC_WORK0_ENV_SHA256=/);
    assert.equal(result.stdout.includes('PRIVATE_TOKEN'), false);
    assert.equal(result.stdout.includes('must-not-appear'), false);

    const jsonResult = spawnSync(process.execPath, [CAPTURE_CLI, '--print-env=json'], {
      cwd: REPO,
      env: {
        ...process.env,
        CAPTURE_ENV_RECEIPT: path.join(dir, 'receipt-json.json'),
        EAS_FILE: easFile,
      },
      encoding: 'utf8',
    });
    assert.equal(jsonResult.status, 0, jsonResult.stderr);
    const publicEnv = JSON.parse(jsonResult.stdout);
    assert.equal(publicEnv.EXPO_PUBLIC_LLM_MODE, 'live');
    assert.match(publicEnv.EXPO_PUBLIC_WORK0_RECEIPT_ID, /^[0-9a-f-]{36}$/i);
    assert.match(publicEnv.EXPO_PUBLIC_WORK0_ENV_SHA256, /^[0-9a-f]{64}$/i);
    assert.equal(Object.hasOwn(publicEnv, 'PRIVATE_TOKEN'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('work0 runtime dependencies and tests are declared in package metadata', () => {
  const pkg = JSON.parse(readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  assert.equal(typeof pkg.devDependencies?.pngjs, 'string');
  assert.equal(pkg.devDependencies?.['playwright-core'], '1.62.1');
  assert.match(pkg.scripts?.['test:ui-work0'] ?? '', /work0-hardening\.test\.mjs/);
  assert.match(pkg.scripts?.verify ?? '', /test:ui-work0/);
});
