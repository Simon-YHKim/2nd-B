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
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { bandSignature, compareSignatures } from './band-signature.mjs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT = path.join(HERE, '..');
const REPO = path.join(KIT, '..', '..');
const DATA = path.join(KIT, 'data');
const WEIGHTS = Object.freeze({ A: 30, B: 25, C: 20, D: 15, E: 10 });
const A_PENALTY = 6;
const MIN_TEXTS = 5;
const DUMMY_ROUTE_ORIGIN = 'https://route.invalid';
const REQUIRED_PREVIEW_ENV = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_LLM_MODE',
];
const CAPTURE_FAILURE_CODES = new Set([
  'asset-404',
  'capture-failed',
  'console-error',
  'network-failure',
  'page-error',
  'page-not-settled',
  'unexpected-final-hash',
  'unexpected-final-origin',
  'unexpected-final-query',
  'unexpected-final-route',
]);

const norm = (value) => String(value ?? '')
  .replace(/[\u2060\u200B\u200C\u200D\uFEFF]/g, '')
  .replace(/\s+/g, ' ')
  .trim();
const round1 = (value) => Math.round((value + Number.EPSILON) * 10) / 10;

function shellQuote(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function previewEnvLines(previewEnv) {
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
  return publicEntries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`);
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
  return [
    asset404 ? 'asset-404' : null,
    pageErrorCount > 0 ? 'page-error' : null,
    consoleErrorCount > 0 ? 'console-error' : null,
    requestFailedCount > 0 ? 'network-failure' : null,
  ].filter(Boolean);
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
  var markerIso = ${JSON.stringify(markerIso)};
  try {
    sessionStorage.setItem('secondB_intro_played_v1', '1');
    localStorage.setItem('onboarding.cosmicPixel.v2.completedAt', markerIso);
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
  const screenById = new Map();
  const duplicateScreenIds = new Set();
  for (const screen of Array.isArray(screens) ? screens : []) {
    if (screenById.has(screen.id)) duplicateScreenIds.add(screen.id);
    screenById.set(screen.id, screen);
  }
  const memberships = new Map();
  const errors = [];
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

export function reportExitCode(report) {
  if (report?.validInput !== true) return 2;
  const rows = Array.isArray(report?.rows) ? report.rows : [];
  if (rows.length === 0) return 2;
  return rows.some((row) => row?.error || row?.automaticPass !== true) ? 1 : 0;
}

const IN_PAGE = () => {
  const curves = ['circle', 'ellipse', 'path', 'polyline', 'polygon'];
  const translucent = (value) => /rgba?\([^)]*?,\s*0?\.\d+\s*\)/.test(value || '');
  const result = {
    curves: 0,
    rounds: 0,
    blurs: 0,
    alphas: 0,
    colors: {},
    texts: [],
    interactive: [],
  };
  for (const element of document.querySelectorAll('*')) {
    const tag = element.tagName.toLowerCase();
    const style = getComputedStyle(element);
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
    const filterBlurs = [...String(style.filter || '').matchAll(/blur\(\s*([\d.]+)(?:px)?\s*\)/g)]
      .some((match) => Number(match[1]) > 0);
    if (filterBlurs) result.blurs += 1;
    if (style.boxShadow && style.boxShadow !== 'none') {
      const lengths = (style.boxShadow.match(/(-?[\d.]+)px/g) || []).map(Number.parseFloat);
      if (lengths.length >= 3 && Math.abs(lengths[2]) > 0.5) result.blurs += 1;
    }
    const opacity = Number(style.opacity);
    let alpha = opacity > 0 && opacity < 1;
    if (!alpha) {
      for (const property of ['backgroundColor', 'color', 'borderTopColor', 'fill', 'stroke']) {
        if (translucent(style[property])) {
          alpha = true;
          break;
        }
      }
    }
    if (alpha) result.alphas += 1;

    const rect = element.getBoundingClientRect();
    const area = Math.max(0, rect.width) * Math.max(0, rect.height);
    if (area > 0) {
      const background = style.backgroundColor;
      const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(background || '');
      if (match && !/rgba\([^)]*,\s*0\)/.test(background)) {
        const hex = `#${[match[1], match[2], match[3]]
          .map((part) => Number(part).toString(16).padStart(2, '0'))
          .join('')}`;
        result.colors[hex] = (result.colors[hex] || 0) + area;
      }
    }
    if (element.children.length === 0 && (element.textContent || '').trim()) {
      result.texts.push(element.textContent);
    }
    if (element.matches('a[href], button, [role="button"], [role="link"]')) {
      const label = (element.innerText || element.getAttribute('aria-label') || '').trim();
      result.interactive.push({ label, to: element.getAttribute('href') });
    }
  }
  return result;
};

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
  const app = await page.evaluate(IN_PAGE);
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

  let inRamp = 0;
  let paintedArea = 0;
  for (const [hex, area] of Object.entries(app.colors)) {
    paintedArea += area;
    if (ramp.has(hex.toLowerCase())) inRamp += area;
  }
  const B = applyDeviation('B', paintedArea > 0 ? (inRamp / paintedArea) * WEIGHTS.B : 0);

  const capturePath = path.join(KIT, 'captures', `${id}.png`);
  let C = null;
  let cWhy = 'reference capture missing';
  if (existsSync(capturePath)) {
    const screenshot = await page.screenshot();
    const compared = compareSignatures(bandSignature(capturePath), bandSignature(screenshot));
    C = compared.score * WEIGHTS.C;
    cWhy = `band ref ${compared.refBands} / app ${compared.appBands}`;
  }
  C = applyDeviation('C', C);

  const navigation = scoreNavigation(navFile?.[id], app.interactive);
  const D = applyDeviation('D', navigation.score);

  const structurePath = path.join(DATA, 'structure', `${id}.json`);
  const reference = existsSync(structurePath)
    ? JSON.parse(readFileSync(structurePath, 'utf8'))
    : null;
  let E = 0;
  if (reference) {
    const referenceTexts = [];
    const walk = (node) => {
      if (!node) return;
      if (node.text) referenceTexts.push(norm(node.text));
      for (const child of node.kids ?? []) walk(child);
    };
    walk(reference);
    const appTexts = app.texts.map(norm).filter(Boolean);
    const matched = referenceTexts.filter(
      (text) => text && appTexts.some((candidate) => candidate.includes(text)),
    ).length;
    E = referenceTexts.length ? (matched / referenceTexts.length) * WEIGHTS.E : 0;
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
      B: paintedArea > 0 ? `token area ${round1((100 * inRamp) / paintedArea)}%` : 'no painted area',
      C: cWhy,
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
    let activeShot = null;
    page.on('console', (message) => {
      if (activeShot && message.type() === 'error') activeShot.consoleErrorCount += 1;
    });
    page.on('pageerror', () => {
      if (activeShot) activeShot.pageErrorCount += 1;
    });
    page.on('requestfailed', () => {
      if (activeShot) activeShot.requestFailedCount += 1;
    });
    page.on('response', (response) => {
      if (activeShot) activeShot.responses.push({ url: response.url(), status: response.status() });
    });
    await page.goto(resolveHostedAppUrl(baseUrl, '/'), { waitUntil: 'load', timeout: 90000 });
    await page.waitForTimeout(2500);
    await loginForQa(page);

    for (const id of targetIds) {
      const route = routesFile.routes[id];
      activeShot = {
        responses: [],
        pageErrorCount: 0,
        consoleErrorCount: 0,
        requestFailedCount: 0,
      };
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
