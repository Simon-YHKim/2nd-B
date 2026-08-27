import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
    { ...visibleStyle, overflow: 'hidden', overflowX: 'hidden', overflowY: 'hidden', textIndent: '-9999px' },
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
  const clipPathHidden = makeElement(
    'CHEAT',
    rect(10, 380, 100, 20),
    visibleStyle,
    clipPathParent,
  );
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
    const parent = makeElement(
      '',
      rect(0, 0, 200, 100),
      { ...visibleStyle, ...paintStyle },
      root,
    );
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
  assert.equal(
    scoreNavigationLabels(['설정'], inspected.texts, inspected.groups).score,
    15,
  );
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

test('capture and score share the same overlay dismissal contract before evidence collection', async () => {
  const { dismissCaptureOverlays } = await contract();
  assert.equal(typeof dismissCaptureOverlays, 'function');
  const clicks = [];
  let dismissed = false;
  const page = {
    getByText(label) {
      return {
        async count() {
          return label === '알겠습니다' && !dismissed ? 1 : 0;
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
    async waitForTimeout() {},
  };

  await dismissCaptureOverlays(page);
  assert.deepEqual(clicks, ['알겠습니다']);

  const captureSource = readFileSync(CAPTURE_CLI, 'utf8');
  assert.match(
    captureSource,
    /waitForSettledPage\(page\);[\s\S]*dismissCaptureOverlays\(page\);[\s\S]*validateFinalUrl[\s\S]*page\.evaluate\(digestPage\)/,
  );
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
    ratio: 1,
    score: 10,
    exempted: 1,
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

test('D axis scores nav.json labels and removes only exempted items from its denominator', async () => {
  const { scoreNavigationLabels } = await contract();
  const declared = ['설정', '계정 설정…', '새 대화'];
  const result = scoreNavigationLabels(declared, ['설정'], ['계정 설정 안내'], ['새 대화']);

  assert.equal(result.score, 15);
  assert.equal(result.measurable, true);
  assert.equal(result.declared, 3);
  assert.equal(result.measured, 2);
  assert.equal(result.exempted, 1);
  assert.deepEqual(result.missing, []);

  const missing = scoreNavigationLabels(declared, ['설정'], [], ['새 대화']);
  assert.equal(missing.score, 7.5);
  assert.deepEqual(missing.missing, ['계정 설정…']);
  assert.equal(scoreNavigationLabels(null, ['설정']).score, null);
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
  const { exempt, exemptItems } = await contract();
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
