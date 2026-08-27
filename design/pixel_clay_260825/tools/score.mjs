#!/usr/bin/env node
/**
 * P1 PIXEL-CLAY five-axis scorer and shared capture contracts.
 *
 * A 30: rendered pixel-rule violations
 * B 25: rendered token-color area
 * C 20: screenshot band rhythm (the existing band-signature contract)
 * D 15: rendered label + exact destination
 * E 10: reference-copy coverage
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { PNG } from 'pngjs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT = path.join(HERE, '..');
const REPO = path.join(KIT, '..', '..');
const DATA = path.join(KIT, 'data');
const WEIGHTS = Object.freeze({ A: 30, B: 25, C: 20, D: 15, E: 10 });
const A_PENALTY = 6;
const MIN_TEXTS = 5;
const DUMMY_ROUTE_ORIGIN = 'https://route.invalid';
const SCREEN_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PORT_STATES = new Set([true, false, 'deferred']);
const DEVICE_CHROME = [/^\d{1,2}\s*[:.]\s*\d{2}$/];
const REQUIRED_PREVIEW_ENV = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_LLM_MODE',
];
const CAPTURE_FAILURE_CODES = new Set([
  'asset-404',
  'capture-failed',
  'console-error',
  'environment-attestation',
  'network-failure',
  'page-error',
  'page-not-settled',
  'unexpected-final-hash',
  'unexpected-final-origin',
  'unexpected-final-query',
  'unexpected-final-route',
]);
const SHOT_HEALTH_CODES = [
  'asset-404',
  'page-error',
  'console-error',
  'network-failure',
];
const CAPTURE_RECEIPT_MAX_AGE_MS = 2 * 60 * 60 * 1000;

const norm = (value) => String(value ?? '')
  .replace(/[\u2060\u200B\u200C\u200D\uFEFF]/g, '')
  .replace(/\s+/g, ' ')
  .trim();
const round1 = (value) => Math.round((value + Number.EPSILON) * 10) / 10;

function shellQuote(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function previewPublicEnv(previewEnv) {
  const env = { ...previewEnv };
  const missing = REQUIRED_PREVIEW_ENV.filter(
    (key) => typeof env[key] !== 'string' || env[key].trim().length === 0,
  );
  if (missing.length) throw new Error('invalid preview env: required public values are missing');
  if (env.EXPO_PUBLIC_LLM_MODE !== 'live') {
    throw new Error('invalid preview env: EXPO_PUBLIC_LLM_MODE must be live');
  }
  if (typeof env.EXPO_PUBLIC_UI !== 'string') env.EXPO_PUBLIC_UI = 'deep-space';
  if (typeof env.EXPO_PUBLIC_ALLOW_DEV_TIER !== 'string') {
    env.EXPO_PUBLIC_ALLOW_DEV_TIER = 'true';
  }
  const publicEntries = Object.entries(env).filter(([key]) => key.startsWith('EXPO_PUBLIC_'));
  if (publicEntries.some(([key, value]) => (
    !/^EXPO_PUBLIC_[A-Z0-9_]+$/.test(key)
      || typeof value !== 'string'
      || /[\u0000\r\n]/.test(value)
  ))) {
    throw new Error('invalid preview env: public keys and values must be shell-safe strings');
  }
  return Object.fromEntries(publicEntries.sort(([left], [right]) => left.localeCompare(right)));
}

export function previewEnvLines(previewEnv) {
  return Object.entries(previewPublicEnv(previewEnv))
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`);
}

function publicEnvSha256(previewEnv) {
  return createHash('sha256')
    .update(JSON.stringify(previewPublicEnv(previewEnv)))
    .digest('hex');
}

export function readPreviewProfileEnv(env = {}) {
  const easPath = env.EAS_FILE ? path.resolve(env.EAS_FILE) : path.join(REPO, 'eas.json');
  const eas = JSON.parse(readFileSync(easPath, 'utf8'));
  const previewEnv = eas.build?.preview?.env;
  previewPublicEnv(previewEnv);
  return previewEnv;
}

export function captureEnvReceiptPath(env = {}) {
  return env.CAPTURE_ENV_RECEIPT
    ? path.resolve(env.CAPTURE_ENV_RECEIPT)
    : path.join(REPO, '.app-shots', 'work0-env-receipt.json');
}

export function loadCaptureEnvAttestation(env = {}, now = Date.now()) {
  const previewEnv = readPreviewProfileEnv(env);
  const receipt = JSON.parse(readFileSync(captureEnvReceiptPath(env), 'utf8'));
  const { printedAt } = validateCaptureEnvReceipt(receipt, previewEnv, env, now);
  return { previewEnv, printedAt };
}

export function resolvePlaywright(load, env = {}) {
  const candidates = env.PW_PATH
    ? [env.PW_PATH, 'playwright', 'playwright-core']
    : ['playwright', 'playwright-core'];
  for (const candidate of candidates) {
    try {
      const loaded = load(candidate);
      if (loaded?.chromium || loaded?.default?.chromium) return loaded;
    } catch {
      // Loader errors can contain local paths. Try the next explicit candidate.
    }
  }
  throw new Error(
    'Playwright unavailable: set PW_PATH or install a local playwright/playwright-core module',
  );
}

export function browserLaunchOptions(env = {}) {
  return env.BROWSER_PATH ? { executablePath: env.BROWSER_PATH } : {};
}

function parseSafeAppRoute(value) {
  if (typeof value !== 'string' || !/^\/(?!\/)/.test(value)) return null;
  if (/[\\#\s\u0000-\u001F\u007F]/.test(value)) return null;
  const queryAt = value.indexOf('?');
  const rawPath = queryAt >= 0 ? value.slice(0, queryAt) : value;
  if (rawPath.length === 0 || (rawPath !== '/' && rawPath.includes('//'))) return null;
  if (/(?:^|\/)\.{1,2}(?:\/|$)/.test(rawPath)) return null;
  // Keep path normalization single-valued. Encoded path bytes (including double-encoded
  // traversal such as %252e) can be decoded a different number of times by a browser,
  // proxy, or static server. Queries remain percent-encoding aware and are compared exact.
  if (rawPath.includes('%')) return null;
  try {
    const parsed = new URL(value, DUMMY_ROUTE_ORIGIN);
    if (parsed.origin !== DUMMY_ROUTE_ORIGIN || parsed.hash || parsed.pathname !== rawPath) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isSafeAppRoute(value) {
  return parseSafeAppRoute(value) !== null;
}

function parseBaseUrl(baseUrl) {
  let target;
  try {
    target = new URL(baseUrl);
  } catch {
    throw new Error('BASE_URL must be an absolute http(s) URL');
  }
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) {
    throw new Error('BASE_URL must be an absolute http(s) URL without credentials');
  }
  if (target.search || target.hash) throw new Error('BASE_URL must not include query or hash');
  const basePath = target.pathname.replace(/\/+$/, '');
  if (basePath && basePath !== '/2nd-B') {
    throw new Error('BASE_URL path must be root or /2nd-B');
  }
  return target;
}

export function resolveHostedAppUrl(baseUrl, route) {
  const routeUrl = parseSafeAppRoute(route);
  if (!routeUrl) throw new Error(`unsafe app route: ${String(route)}`);
  const target = parseBaseUrl(baseUrl);
  target.pathname = routeUrl.pathname === '/' ? '/2nd-B/' : `/2nd-B${routeUrl.pathname}`;
  target.search = routeUrl.search;
  target.hash = '';
  return target.href;
}

export class CaptureContractError extends Error {
  constructor(codes) {
    const requested = Array.isArray(codes) ? codes : [codes];
    const safe = requested.filter((code) => CAPTURE_FAILURE_CODES.has(code));
    const normalized = safe.length ? [...new Set(safe)] : ['capture-failed'];
    super(normalized[0]);
    this.name = 'CaptureContractError';
    this.codes = normalized;
  }
}

export function captureFailureCodes(error) {
  const requested = Array.isArray(error?.codes) ? error.codes : [error?.code];
  const safe = requested.filter((code) => CAPTURE_FAILURE_CODES.has(code));
  return safe.length ? [...new Set(safe)] : ['capture-failed'];
}

export function createCaptureEnvReceipt(previewEnv, now = Date.now()) {
  if (!Number.isFinite(now)) throw new CaptureContractError('environment-attestation');
  // Store only a one-way digest. The public env values must never enter reports or errors.
  return {
    schemaVersion: 1,
    printedAt: new Date(now).toISOString(),
    publicEnvSha256: publicEnvSha256(previewEnv),
  };
}

export function validateCaptureEnvReceipt(
  receipt,
  previewEnv,
  runtimeEnv,
  now = Date.now(),
) {
  const expected = previewPublicEnv(previewEnv);
  const actual = Object.fromEntries(
    Object.entries(runtimeEnv ?? {})
      .filter(([key, value]) => key.startsWith('EXPO_PUBLIC_') && typeof value === 'string')
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  const printedAt = Date.parse(receipt?.printedAt ?? '');
  const exactRuntimeEnv = JSON.stringify(actual) === JSON.stringify(expected);
  const validReceipt = receipt?.schemaVersion === 1
    && receipt?.publicEnvSha256 === publicEnvSha256(previewEnv)
    && Number.isFinite(printedAt)
    && Number.isFinite(now)
    && now >= printedAt
    && now - printedAt <= CAPTURE_RECEIPT_MAX_AGE_MS;
  if (!exactRuntimeEnv || !validReceipt) {
    throw new CaptureContractError('environment-attestation');
  }
  return { printedAt };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function validateServedExportSources(sources, previewEnv, printedAt) {
  const expected = previewPublicEnv(previewEnv);
  const items = Array.isArray(sources) ? sources : [];
  const source = items.map((item) => String(item?.body ?? '')).join('\n');
  const notBefore = Math.floor(printedAt / 1000) * 1000;
  const fresh = items.length > 0 && items.every((item) => {
    const modifiedAt = Date.parse(item?.lastModified ?? '');
    return Number.isFinite(modifiedAt) && modifiedAt >= notBefore;
  });
  const modePattern = new RegExp(
    `["']?EXPO_PUBLIC_LLM_MODE["']?\\s*[:=]\\s*`
      + `(?:[$A-Za-z_][$\\w]*\\(\\s*)?["']${escapeRegExp(expected.EXPO_PUBLIC_LLM_MODE)}["']\\s*\\)?`,
  );
  const attested = fresh
    && source.includes(expected.EXPO_PUBLIC_SUPABASE_URL)
    && source.includes(expected.EXPO_PUBLIC_SUPABASE_ANON_KEY)
    && modePattern.test(source);
  if (!attested) throw new CaptureContractError('environment-attestation');
}

export async function attestServedExport(page, previewEnv, printedAt) {
  const sources = await page.evaluate(async () => {
    const urls = [...document.scripts]
      .map((script) => script.src)
      .filter(Boolean)
      .filter((value) => {
        try {
          return new URL(value, location.href).origin === location.origin;
        } catch {
          return false;
        }
      });
    return Promise.all(urls.map(async (url) => {
      const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) return { body: '', lastModified: null };
      return {
        body: await response.text(),
        lastModified: response.headers.get('last-modified'),
      };
    }));
  });
  validateServedExportSources(sources, previewEnv, printedAt);
}

export function createShotHealth() {
  return { failureCodes: [] };
}

export function recordShotFailure(health, code) {
  if (!health || !SHOT_HEALTH_CODES.includes(code)) return;
  if (!Array.isArray(health.failureCodes)) health.failureCodes = [];
  if (!health.failureCodes.includes(code) && health.failureCodes.length < SHOT_HEALTH_CODES.length) {
    health.failureCodes.push(code);
  }
}

export function recordShotResponse(health, baseUrl, responseUrl, status) {
  if (status !== 404) return;
  try {
    const base = parseBaseUrl(baseUrl);
    const response = new URL(responseUrl);
    if (
      response.origin === base.origin
      && (response.pathname === '/2nd-B' || response.pathname.startsWith('/2nd-B/'))
    ) {
      recordShotFailure(health, 'asset-404');
    }
  } catch {
    // Ignore malformed response metadata; never retain its raw URL.
  }
}

export function validateFinalUrl(baseUrl, route, finalUrl) {
  const expected = new URL(resolveHostedAppUrl(baseUrl, route));
  let actual;
  try {
    actual = new URL(finalUrl);
  } catch {
    throw new CaptureContractError('unexpected-final-route');
  }
  if (actual.origin !== expected.origin) {
    throw new CaptureContractError('unexpected-final-origin');
  }
  if (actual.pathname !== expected.pathname) {
    throw new CaptureContractError('unexpected-final-route');
  }
  if (actual.search !== expected.search) {
    throw new CaptureContractError('unexpected-final-query');
  }
  if (actual.hash !== '') throw new CaptureContractError('unexpected-final-hash');
}

export function shotFailureCodes({
  baseUrl,
  failureCodes = [],
  responses = [],
  pageErrorCount = 0,
  consoleErrorCount = 0,
  requestFailedCount = 0,
}) {
  const base = parseBaseUrl(baseUrl);
  const asset404 = responses.some((response) => {
    if (response.status !== 404) return false;
    try {
      const url = new URL(response.url);
      return url.origin === base.origin
        && (url.pathname === '/2nd-B' || url.pathname.startsWith('/2nd-B/'));
    } catch {
      return false;
    }
  });
  const detected = new Set(
    (Array.isArray(failureCodes) ? failureCodes : [])
      .filter((code) => SHOT_HEALTH_CODES.includes(code)),
  );
  if (asset404) detected.add('asset-404');
  if (pageErrorCount > 0) detected.add('page-error');
  if (consoleErrorCount > 0) detected.add('console-error');
  if (requestFailedCount > 0) detected.add('network-failure');
  return SHOT_HEALTH_CODES.filter((code) => detected.has(code));
}

export async function waitForSettledPage(
  page,
  { maxMs = 20000, pollMs = 700, now = Date.now } = {},
) {
  const started = now();
  let lastLen = -1;
  let stable = 0;
  while (now() - started < maxMs) {
    const info = await page.evaluate(() => {
      const text = document.body.innerText || '';
      return { len: text.length, loading: /영차영차|불러오는|Loading|읽는 중/.test(text) };
    });
    if (!info.loading && info.len > 40) {
      if (info.len === lastLen && ++stable >= 2) return;
    } else {
      stable = 0;
    }
    lastLen = info.len;
    await page.waitForTimeout(pollMs);
  }
  throw new CaptureContractError('page-not-settled');
}

export function makeCaptureInitScript(markerTime) {
  if (!Number.isFinite(markerTime)) throw new Error('FIXED_ISO must be a valid date');
  const markerDate = new Date(markerTime);
  if (Number.isNaN(markerDate.getTime())) throw new Error('FIXED_ISO must be a valid date');
  const markerIso = markerDate.toISOString();
  return `(function () {
  var fixedTime = ${markerTime};
  var markerIso = ${JSON.stringify(markerIso)};
  var RealDate = Date;
  var FakeDate = function (a, b, c, d, e, f, g) {
    if (!(this instanceof FakeDate)) return new RealDate(fixedTime).toString();
    switch (arguments.length) {
      case 0: return new RealDate(fixedTime);
      case 1: return new RealDate(a);
      default: return new RealDate(a, b, c, d || 0, e || 0, f || 0, g || 0);
    }
  };
  FakeDate.now = function () { return fixedTime; };
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;
  FakeDate.prototype = RealDate.prototype;
  window.Date = FakeDate;
  var seed = 42;
  Math.random = function () {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  try {
    sessionStorage.setItem('secondB_intro_played_v1', '1');
    localStorage.setItem('onboarding.cosmicPixel.v2.completedAt', markerIso);
    localStorage.setItem('onboarding.ttfv.v1.seenAt', markerIso);
    localStorage.setItem('onboarding.coachmarks.home.v1.seenAt', markerIso);
  } catch (e) {}
  var freezeMotion = function () {
    if (document.querySelector('style[data-capture-motion-freeze]')) return;
    var style = document.createElement('style');
    style.setAttribute('data-capture-motion-freeze', '');
    style.textContent = '*, *::before, *::after { animation-play-state: paused !important; transition: none !important; }';
    (document.head || document.documentElement).appendChild(style);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', freezeMotion);
  else freezeMotion();
})();`;
}

export function digestPage(root = document.body) {
  const walk = (element, depth) => {
    if (depth > 24) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    const own = [...element.childNodes]
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent.trim())
      .filter(Boolean)
      .join(' ');
    const interactive = element.matches?.('a[href], button, [role="button"], [role="link"]') === true;
    const interactiveText = interactive
      ? (element.innerText || element.getAttribute?.('aria-label') || '').replace(/\s+/g, ' ').trim()
      : '';
    const kids = [...element.children].map((child) => walk(child, depth + 1)).filter(Boolean);
    if (!own && kids.length === 0 && !interactive) return null;
    return {
      tag: element.tagName.toLowerCase(),
      box: [Math.round(rect.width), Math.round(rect.height)],
      ...(own ? { text: own.slice(0, 120) } : {}),
      ...(interactive
        ? {
          interactive: true,
          interactiveText: interactiveText.slice(0, 120),
          to: element.getAttribute?.('href'),
        }
        : {}),
      ...(kids.length ? { kids } : {}),
    };
  };
  return walk(root, 0);
}

function hasWhy(value) {
  return value != null
    && typeof value === 'object'
    && !Array.isArray(value)
    && typeof value.why === 'string'
    && value.why.trim().length > 0;
}

export function validateManifestClassification(screens, routesFile) {
  const errors = [];
  const screenById = new Map();
  const duplicateScreenIds = new Set();
  for (const screen of Array.isArray(screens) ? screens : []) {
    if (typeof screen?.id !== 'string' || !SCREEN_ID_PATTERN.test(screen.id)) {
      errors.push({ code: 'invalid-screen-id', id: typeof screen?.id === 'string' ? screen.id : '' });
    }
    if (!PORT_STATES.has(screen?.port)) {
      errors.push({ code: 'invalid-port', id: typeof screen?.id === 'string' ? screen.id : '' });
    }
    if (screenById.has(screen.id)) duplicateScreenIds.add(screen.id);
    screenById.set(screen.id, screen);
  }
  const memberships = new Map();
  const nonPortTrueIds = new Set();
  for (const category of ['routes', 'unmeasurable', 'unmapped']) {
    const entries = routesFile?.[category];
    if (entries == null || typeof entries !== 'object' || Array.isArray(entries)) {
      errors.push({ code: 'invalid-category', id: category, category });
      continue;
    }
    for (const id of Object.keys(entries).filter((key) => key !== '_note')) {
      memberships.set(id, [...(memberships.get(id) ?? []), category]);
      const payload = entries[id];
      const validPayload = category === 'routes' ? isSafeAppRoute(payload) : hasWhy(payload);
      if (!validPayload) errors.push({ code: 'invalid-payload', id, category });
      const screen = screenById.get(id);
      if (!screen) errors.push({ code: 'unknown-id', id, category });
      else if (screen.port !== true) nonPortTrueIds.add(id);
    }
  }
  for (const id of duplicateScreenIds) errors.push({ code: 'duplicate-screen-id', id });
  const portTrue = [...screenById.values()].filter((screen) => screen.port === true);
  for (const screen of portTrue) {
    const categories = memberships.get(screen.id) ?? [];
    if (categories.length === 0) errors.push({ code: 'missing-port-true', id: screen.id });
    else if (categories.length > 1) errors.push({ code: 'duplicate-id', id: screen.id, categories });
  }
  errors.sort((left, right) => (
    `${left.code}:${left.id}:${left.category ?? ''}`.localeCompare(
      `${right.code}:${right.id}:${right.category ?? ''}`,
    )
  ));
  const targetIds = portTrue
    .filter((screen) => Object.hasOwn(routesFile?.routes ?? {}, screen.id))
    .map((screen) => screen.id);
  return {
    valid: errors.length === 0,
    errors,
    targetIds,
    nonPortTrueIds: [...nonPortTrueIds].sort(),
    stats: {
      total: screenById.size,
      portTrue: portTrue.length,
      portFalse: [...screenById.values()].filter((screen) => screen.port === false).length,
      deferred: [...screenById.values()].filter((screen) => screen.port === 'deferred').length,
      stage1: portTrue.filter((screen) => screen.stage === 1).map((screen) => screen.id),
    },
  };
}

function normalizeDestination(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  if (/^[a-z][a-z\d+.-]*:/i.test(raw) || raw.startsWith('//')) {
    try {
      const url = new URL(raw);
      if (!['http:', 'https:'].includes(url.protocol)) return null;
      return `${url.origin}${url.pathname}${url.search}${url.hash}`;
    } catch {
      return null;
    }
  }
  if (raw.startsWith('/2nd-B/')) return normalizeDestination(raw.slice('/2nd-B'.length));
  if (raw === '/2nd-B') return '/';
  const parsed = parseSafeAppRoute(raw);
  return parsed ? `${parsed.pathname}${parsed.search}` : null;
}

export function scoreNavigation(declared, actual) {
  const expected = Array.isArray(declared)
    ? declared.map((entry) => ({ label: norm(entry?.label), to: normalizeDestination(entry?.to) }))
    : [];
  if (!expected.length || expected.some((entry) => !entry.label || !entry.to)) {
    return {
      score: 0,
      max: WEIGHTS.D,
      measurable: false,
      ratio: 0,
      matched: 0,
      declared: expected.length,
      deductions: ['navigation destination contract is missing or invalid'],
    };
  }
  const rendered = (Array.isArray(actual) ? actual : [])
    .map((entry) => ({ label: norm(entry?.label ?? entry?.text), to: normalizeDestination(entry?.to) }))
    .filter((entry) => entry.label && entry.to);
  const remaining = [...rendered];
  let matched = 0;
  for (const edge of expected) {
    const index = remaining.findIndex(
      (candidate) => candidate.label === edge.label && candidate.to === edge.to,
    );
    if (index >= 0) {
      matched += 1;
      remaining.splice(index, 1);
    }
  }
  const ratio = matched / expected.length;
  return {
    score: round1(ratio * WEIGHTS.D),
    max: WEIGHTS.D,
    measurable: true,
    ratio,
    matched,
    declared: expected.length,
    deductions: matched === expected.length
      ? []
      : [`${expected.length - matched} declared navigation destinations were not verified`],
  };
}

export function flattenInteractive(node, output = []) {
  if (!node) return output;
  if (node.interactive === true || node.tag === 'a' || node.tag === 'button') {
    output.push({
      label: norm(node.interactiveText ?? node.text),
      to: node.to ?? null,
    });
  }
  for (const child of node.kids ?? []) flattenInteractive(child, output);
  return output;
}

export function isDeviceChromeText(value) {
  const text = norm(value);
  return DEVICE_CHROME.some((pattern) => pattern.test(text));
}

export function referenceCopyTexts(root) {
  const output = [];
  const walk = (node) => {
    if (!node) return;
    const text = norm(node.text);
    if (text && !isDeviceChromeText(text)) output.push(text);
    for (const child of node.kids ?? []) walk(child);
  };
  walk(root);
  return output;
}

export function scoreCopyCoverage(referenceTexts, appTexts) {
  const expected = (Array.isArray(referenceTexts) ? referenceTexts : [])
    .map(norm)
    .filter(Boolean);
  const rendered = new Set(
    (Array.isArray(appTexts) ? appTexts : []).map(norm).filter(Boolean),
  );
  const matched = expected.filter((text) => rendered.has(text)).length;
  const ratio = expected.length ? matched / expected.length : 0;
  return {
    matched,
    total: expected.length,
    ratio,
    score: ratio * WEIGHTS.E,
  };
}

/** B: count the pixels the browser actually painted, not overlapping DOM boxes. */
export function scoreTokenPixels(source, ramp) {
  const png = PNG.sync.read(source);
  let paintedPixels = 0;
  let inRampPixels = 0;
  for (let index = 0; index < png.data.length; index += 4) {
    if (png.data[index + 3] === 0) continue;
    paintedPixels += 1;
    const hex = `#${[png.data[index], png.data[index + 1], png.data[index + 2]]
      .map((channel) => channel.toString(16).padStart(2, '0'))
      .join('')}`;
    if (ramp?.has(hex)) inRampPixels += 1;
  }
  const ratio = paintedPixels > 0 ? inRampPixels / paintedPixels : 0;
  return {
    score: ratio * WEIGHTS.B,
    ratio,
    paintedPixels,
    inRampPixels,
  };
}

function structureKind(node) {
  let hasText = false;
  let hasInteractive = false;
  const walk = (current) => {
    if (!current) return;
    if (norm(current.text)) hasText = true;
    if (current.interactive === true || ['a', 'button'].includes(current.tag)) {
      hasInteractive = true;
    }
    for (const child of current.kids ?? []) walk(child);
  };
  walk(node);
  if (hasInteractive) return 'interactive';
  if (hasText) return 'text';
  return 'graphic';
}

function sectionIdentity(node) {
  const outline = [];
  const anchors = [];
  const walk = (current) => {
    if (!current) return;
    const text = norm(current.text);
    const interactive = current.interactive === true || ['a', 'button'].includes(current.tag);
    const role = interactive ? 'interactive' : text ? 'text' : String(current.tag ?? 'node');
    outline.push(`${role}:${(current.kids ?? []).length}`);
    if (text) anchors.push(text);
    for (const child of current.kids ?? []) walk(child);
  };
  walk(node);
  return {
    shapeSignature: `${structureKind(node)}|${outline.join('/')}`,
    textAnchor: anchors.join('\u241f'),
  };
}

/**
 * C's data contract exposes ordered DOM children and [width,height] boxes only.
 * Apply the documented depth<=3, >=half-viewport, >=24px section rule to both
 * reference and app digests so renderer wrapper depth is not tuned per side.
 */
export function extractStructureSections(root) {
  const rootWidth = Number(root?.box?.[0]);
  const rootHeight = Number(root?.box?.[1]);
  if (!(rootWidth > 0) || !(rootHeight > 0)) return [];
  const sections = [];
  const walk = (node, depth) => {
    const width = Number(node?.box?.[0]);
    const height = Number(node?.box?.[1]);
    if (
      depth >= 1
      && depth <= 3
      && width >= rootWidth * 0.5
      && height >= 24
    ) {
      sections.push({
        kind: structureKind(node),
        height,
        heightRatio: height / rootHeight,
        ...sectionIdentity(node),
      });
    }
    if (depth >= 3) return;
    for (const child of node?.kids ?? []) walk(child, depth + 1);
  };
  walk(root, 0);
  return sections;
}

function orderedSectionMatches(expected, observed, reference, actual) {
  if (!expected || !observed || expected.shapeSignature !== observed.shapeSignature) return false;
  if (expected.textAnchor === observed.textAnchor) return true;

  // Copy may legitimately differ from the mock reference, so text is only a
  // disambiguator when either anchor exists elsewhere in the same structural
  // sequence. That detects A/B reordering without turning C into a second E.
  const expectedMoved = expected.textAnchor && actual.some(
    (section) => section.shapeSignature === expected.shapeSignature
      && section.textAnchor === expected.textAnchor,
  );
  const observedMoved = observed.textAnchor && reference.some(
    (section) => section.shapeSignature === observed.shapeSignature
      && section.textAnchor === observed.textAnchor,
  );
  return !expectedMoved && !observedMoved;
}

function orderedSectionMatchCount(reference, actual) {
  const rows = Array.from({ length: reference.length + 1 }, () => (
    Array(actual.length + 1).fill(0)
  ));
  for (let left = 1; left <= reference.length; left += 1) {
    for (let right = 1; right <= actual.length; right += 1) {
      rows[left][right] = orderedSectionMatches(
        reference[left - 1],
        actual[right - 1],
        reference,
        actual,
      )
        ? rows[left - 1][right - 1] + 1
        : Math.max(rows[left - 1][right], rows[left][right - 1]);
    }
  }
  return rows[reference.length][actual.length];
}

/** C: section order 10 + count 5 + relative-height-within-10% 5. */
export function scoreStructure(referenceDigest, actualDigest) {
  const reference = extractStructureSections(referenceDigest);
  const actual = extractStructureSections(actualDigest);
  const maxCount = Math.max(reference.length, actual.length);
  if (maxCount === 0) {
    return {
      score: 0,
      orderScore: 0,
      countScore: 0,
      heightScore: 0,
      referenceCount: 0,
      actualCount: 0,
      closeHeightCount: 0,
    };
  }
  const pairedCount = Math.min(reference.length, actual.length);
  const orderScore = round1((orderedSectionMatchCount(reference, actual) / maxCount) * 10);
  const countScore = round1((Math.min(reference.length, actual.length) / maxCount) * 5);
  let closeHeightCount = 0;
  for (let index = 0; index < pairedCount; index += 1) {
    const expected = reference[index].heightRatio;
    const observed = actual[index].heightRatio;
    if (expected > 0 && Math.abs(observed - expected) / expected <= 0.1) {
      closeHeightCount += 1;
    }
  }
  const heightScore = round1((closeHeightCount / maxCount) * 5);
  return {
    score: round1(orderScore + countScore + heightScore),
    orderScore,
    countScore,
    heightScore,
    referenceCount: reference.length,
    actualCount: actual.length,
    closeHeightCount,
  };
}

export function reportExitCode(report) {
  if (report?.validInput !== true) return 2;
  const rows = Array.isArray(report?.rows) ? report.rows : [];
  if (rows.length === 0) return 2;
  return rows.some((row) => row?.error || row?.automaticPass !== true) ? 1 : 0;
}

export function inspectRenderedPixelRules(
  elements = document.querySelectorAll('*'),
  styleFor = getComputedStyle,
) {
  const curves = ['circle', 'ellipse', 'path', 'polyline', 'polygon'];
  const translucent = (value) => /rgba?\([^)]*?,\s*0?\.\d+\s*\)/.test(value || '');
  const result = {
    curves: 0,
    rounds: 0,
    blurs: 0,
    alphas: 0,
    texts: [],
    interactive: [],
  };
  for (const element of elements) {
    const tag = element.tagName.toLowerCase();
    const style = styleFor(element);
    if (curves.includes(tag)) result.curves += 1;
    for (const property of [
      'borderTopLeftRadius',
      'borderTopRightRadius',
      'borderBottomLeftRadius',
      'borderBottomRightRadius',
    ]) {
      if (parseFloat(style[property]) > 0) {
        result.rounds += 1;
        break;
      }
    }
    const hasPositiveBlur = (value) => (
      [...String(value || '').matchAll(/blur\(\s*([\d.]+)(?:px)?\s*\)/g)]
        .some((match) => Number(match[1]) > 0)
    );
    if (
      hasPositiveBlur(style.filter)
      || hasPositiveBlur(style.backdropFilter)
      || hasPositiveBlur(style.webkitBackdropFilter)
    ) result.blurs += 1;
    if (style.boxShadow && style.boxShadow !== 'none') {
      const lengths = (style.boxShadow.match(/(-?[\d.]+)px/g) || []).map(Number.parseFloat);
      if (lengths.length >= 3 && Math.abs(lengths[2]) > 0.5) result.blurs += 1;
    }
    const opacity = Number(style.opacity);
    let alpha = opacity > 0 && opacity < 1;
    if (!alpha) {
      alpha = ['fillOpacity', 'strokeOpacity']
        .some((property) => Number(style[property]) > 0 && Number(style[property]) < 1);
    }
    if (!alpha) {
      for (const property of ['backgroundColor', 'color', 'borderTopColor', 'fill', 'stroke']) {
        if (translucent(style[property])) {
          alpha = true;
          break;
        }
      }
    }
    if (alpha) result.alphas += 1;

    if (element.children.length === 0 && (element.textContent || '').trim()) {
      result.texts.push(element.textContent);
    }
    if (element.matches('a[href], button, [role="button"], [role="link"]')) {
      const label = (element.innerText || element.getAttribute('aria-label') || '').trim();
      result.interactive.push({ label, to: element.getAttribute('href') });
    }
  }
  return result;
}

function tokenRamp(tokens) {
  const output = new Set();
  const walk = (value) => {
    for (const child of Object.values(value || {})) {
      if (child && typeof child === 'object') walk(child);
      else if (typeof child === 'string' && /^#[0-9a-fA-F]{6}$/.test(child)) {
        output.add(child.toLowerCase());
      }
    }
  };
  walk(tokens);
  return output;
}

function deviationsFor(deviations, screen, axis) {
  return (deviations?.deviations ?? []).filter(
    (entry) => entry?.screen === screen
      && entry?.axis === axis
      && typeof entry?.why === 'string'
      && entry.why.trim().length > 0,
  );
}

async function scoreOne({
  page,
  id,
  route,
  baseUrl,
  ramp,
  navFile,
  deviations,
  activeShot,
}) {
  await page.goto(resolveHostedAppUrl(baseUrl, route), { waitUntil: 'load', timeout: 60000 });
  await waitForSettledPage(page);
  validateFinalUrl(baseUrl, route, page.url());
  const failureCodes = shotFailureCodes({ baseUrl, ...activeShot });
  if (failureCodes.length) throw new CaptureContractError(failureCodes);
  const app = await page.evaluate(inspectRenderedPixelRules);
  if (app.texts.length < MIN_TEXTS) {
    return {
      id,
      route,
      A: null,
      B: null,
      C: null,
      D: null,
      E: null,
      total: null,
      automaticPass: false,
      unmeasured: ['A', 'B', 'C', 'D', 'E'],
      error: 'page-not-settled',
    };
  }

  const manualReviewAxes = [];
  const applyDeviation = (axis, score) => {
    if (deviationsFor(deviations, id, axis).length === 0) return score;
    manualReviewAxes.push(axis);
    return WEIGHTS[axis];
  };

  const violations = app.curves + app.rounds + app.blurs + app.alphas;
  const A = applyDeviation('A', Math.max(0, WEIGHTS.A - violations * A_PENALTY));

  const screenshot = await page.screenshot();
  const tokenPixels = scoreTokenPixels(screenshot, ramp);
  const B = applyDeviation('B', tokenPixels.score);

  const structurePath = path.join(DATA, 'structure', `${id}.json`);
  const reference = existsSync(structurePath)
    ? JSON.parse(readFileSync(structurePath, 'utf8'))
    : null;
  const appStructure = await page.evaluate(digestPage);
  let C = null;
  let structure = null;
  if (reference && appStructure) {
    structure = scoreStructure(reference, appStructure);
    C = structure.score;
  }
  C = applyDeviation('C', C);

  const navigation = scoreNavigation(navFile?.[id], app.interactive);
  const D = applyDeviation('D', navigation.score);

  let E = 0;
  if (reference) {
    E = scoreCopyCoverage(referenceCopyTexts(reference), app.texts).score;
  }
  E = applyDeviation('E', E);

  await page.waitForTimeout(100);
  const finalFailureCodes = shotFailureCodes({ baseUrl, ...activeShot });
  if (finalFailureCodes.length) throw new CaptureContractError(finalFailureCodes);

  const raw = { A, B, C, D, E };
  const unmeasured = Object.entries(raw)
    .filter(([, value]) => value == null)
    .map(([axis]) => axis);
  if (!navigation.measurable && !unmeasured.includes('D')) unmeasured.push('D');
  const scores = Object.fromEntries(
    Object.entries(raw).map(([axis, value]) => [axis, value == null ? null : round1(value)]),
  );
  const total = round1(Object.values(raw).reduce((sum, value) => sum + (value ?? 0), 0));
  return {
    id,
    route,
    ...scores,
    total,
    automaticPass: total >= 98 && unmeasured.length === 0 && manualReviewAxes.length === 0,
    unmeasured,
    manualReviewAxes,
    why: {
      A: `curves ${app.curves} · rounds ${app.rounds} · blur ${app.blurs} · alpha ${app.alphas}`,
      B: tokenPixels.paintedPixels > 0
        ? `token pixels ${round1(tokenPixels.ratio * 100)}% (${tokenPixels.inRampPixels}/${tokenPixels.paintedPixels})`
        : 'no painted pixels',
      C: structure
        ? `order ${structure.orderScore}/10 · count ${structure.countScore}/5 · height ${structure.heightScore}/5`
        : 'reference structure missing',
      D: navigation.measurable
        ? `destinations ${navigation.matched}/${navigation.declared}`
        : 'navigation destination contract missing',
      E: reference ? 'reference copy compared' : 'reference structure missing',
    },
  };
}

function readJson(file, fallback) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
}

async function loginForQa(page) {
  const env = readFileSync(path.join(REPO, '.env.test'), 'utf8');
  const email = (/^QA_TEST_EMAIL=(.*)$/m.exec(env) ?? [])[1]?.trim();
  const password = (/^QA_TEST_PASSWORD=(.*)$/m.exec(env) ?? [])[1]?.trim();
  if (!email || !password) throw new CaptureContractError('capture-failed');
  if (page.url().includes('/sign-in')) {
    await page.getByRole('textbox', { name: /이메일|email/i }).fill(email);
    await page.getByRole('textbox', { name: /비밀번호|password/i }).fill(password);
    await page.locator('button:has-text("로그인"), button:has-text("Sign in")').first().click();
    await page.waitForTimeout(5000);
  }
  if (page.url().includes('/sign-in')) throw new CaptureContractError('unexpected-final-route');
}

export async function main(args = process.argv.slice(2), env = process.env) {
  const screensFile = readJson(path.join(DATA, 'screens.json'), { screens: [] });
  const routesFile = readJson(path.join(DATA, 'app-routes.json'), {});
  const classification = validateManifestClassification(screensFile.screens, routesFile);
  if (!classification.valid) {
    console.error('invalid manifest classification');
    return 2;
  }
  const requested = [...new Set(args.map((value) => value.trim()).filter(Boolean))];
  if (requested.some((id) => !classification.targetIds.includes(id))) {
    console.error('invalid screen selection');
    return 2;
  }
  const targetIds = requested.length ? requested : classification.targetIds;
  if (!targetIds.length) {
    console.error('invalid screen selection: no targets');
    return 2;
  }

  const baseUrl = env.BASE_URL || 'http://localhost:8979';
  try {
    resolveHostedAppUrl(baseUrl, '/');
  } catch {
    console.error('invalid BASE_URL');
    return 2;
  }
  let playwright;
  try {
    playwright = resolvePlaywright(require, env);
  } catch {
    console.error('Playwright unavailable: set PW_PATH or install a local module');
    return 1;
  }
  const chromium = playwright.chromium ?? playwright.default.chromium;
  let environmentAttestation;
  try {
    environmentAttestation = loadCaptureEnvAttestation(env);
  } catch {
    console.error('environment attestation failed');
    return 2;
  }
  const tokens = readJson(path.join(DATA, 'tokens.json'), {});
  const navRoutesPath = path.join(DATA, 'nav-routes.json');
  const navFile = readJson(navRoutesPath, readJson(path.join(DATA, 'nav.json'), {}));
  const deviations = readJson(path.join(DATA, 'deviations.json'), { deviations: [] });
  const output = env.SCORE_OUT || path.join(DATA, 'score.json');
  const rows = [];
  let browser;
  try {
    browser = await chromium.launch(browserLaunchOptions(env));
    const context = await browser.newContext({ viewport: { width: 390, height: 820 }, deviceScaleFactor: 1 });
    await context.addInitScript(makeCaptureInitScript(Date.now()));
    const page = await context.newPage();
    let activeShot = createShotHealth();
    page.on('console', (message) => {
      if (message.type() === 'error') recordShotFailure(activeShot, 'console-error');
    });
    page.on('pageerror', () => {
      recordShotFailure(activeShot, 'page-error');
    });
    page.on('requestfailed', () => {
      recordShotFailure(activeShot, 'network-failure');
    });
    page.on('response', (response) => {
      recordShotResponse(activeShot, baseUrl, response.url(), response.status());
    });
    await page.goto(resolveHostedAppUrl(baseUrl, '/'), { waitUntil: 'load', timeout: 90000 });
    await page.waitForTimeout(2500);
    await loginForQa(page);
    const bootstrapFailureCodes = shotFailureCodes({ baseUrl, ...activeShot });
    if (bootstrapFailureCodes.length) throw new CaptureContractError(bootstrapFailureCodes);
    await attestServedExport(
      page,
      environmentAttestation.previewEnv,
      environmentAttestation.printedAt,
    );

    for (const id of targetIds) {
      const route = routesFile.routes[id];
      activeShot = createShotHealth();
      try {
        rows.push(await scoreOne({
          page,
          id,
          route,
          baseUrl,
          ramp: tokenRamp(tokens),
          navFile,
          deviations,
          activeShot,
        }));
      } catch (error) {
        rows.push({
          id,
          route,
          total: null,
          automaticPass: false,
          failureCodes: captureFailureCodes(error),
          error: 'capture-failed',
        });
      } finally {
        activeShot = null;
      }
    }
  } catch {
    console.error('score capture failed');
    return 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  const report = {
    schemaVersion: 1,
    validInput: true,
    baseUrl: new URL(baseUrl).origin,
    manifest: classification.stats,
    environmentAttested: true,
    navigationContract: existsSync(navRoutesPath) ? 'data/nav-routes.json' : 'invalid: data/nav.json has labels only',
    weights: WEIGHTS,
    rows,
  };
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  const exitCode = reportExitCode(report);
  const passed = rows.filter((row) => row.automaticPass === true).length;
  console.log(`scored ${rows.length} · >=98 automatic ${passed}`);
  return exitCode;
}

const invoked = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invoked) process.exitCode = await main();
