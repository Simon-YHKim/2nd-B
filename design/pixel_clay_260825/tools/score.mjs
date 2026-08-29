#!/usr/bin/env node
/**
 * P1 PIXEL-CLAY five-axis scorer and shared capture contracts.
 *
 * A 30: rendered pixel-rule violations
 * B 25: rendered token-color area
 * C 20: screenshot band rhythm (the existing band-signature contract)
 * D 15: rendered actionable label + safe same-app href when an href exists
 * E 10: reference-copy coverage
 */
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
const SHOT_HEALTH_CODES = ['asset-404', 'page-error', 'console-error', 'network-failure'];
const CAPTURE_RECEIPT_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const WORK0_RECEIPT_ID_KEY = 'EXPO_PUBLIC_WORK0_RECEIPT_ID';
const WORK0_ENV_SHA_KEY = 'EXPO_PUBLIC_WORK0_ENV_SHA256';
const WORK0_RESERVED_ENV = new Set([WORK0_RECEIPT_ID_KEY, WORK0_ENV_SHA_KEY]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLAYWRIGHT_CORE_ROOT = path.dirname(require.resolve('playwright-core/package.json'));
const PLAYWRIGHT_BROWSER_VERSION = JSON.parse(
  readFileSync(path.join(PLAYWRIGHT_CORE_ROOT, 'browsers.json'), 'utf8'),
).browsers.find((browser) => browser.name === 'chromium')?.browserVersion;
const WORK0_TRUSTED_FONT_ASSETS = Object.freeze({
  Pretendard: Object.freeze({
    relativePath: 'assets/fonts/Pretendard-Regular.otf',
    mime: 'font/otf',
    format: 'opentype',
    fontStretch: 'normal',
    fontStyle: 'normal',
    fontWeight: '400',
    sha256: '3ffbacde6ab8411f1d2db54bb9b1f0b3ee2a738932033722cf0388c06aed1c93',
  }),
  Galmuri11: Object.freeze({
    relativePath: 'assets/fonts/Galmuri11-subset.woff2',
    mime: 'font/woff2',
    format: 'woff2',
    fontStretch: 'normal',
    fontStyle: 'normal',
    fontWeight: '400',
    sha256: '5a9d7365d0033be03b7460c80ff799636b8b8c427a0430859470734c09b1f2e2',
  }),
  Galmuri11Bold: Object.freeze({
    relativePath: 'assets/fonts/Galmuri11Bold-subset.woff2',
    mime: 'font/woff2',
    format: 'woff2',
    fontStretch: 'normal',
    fontStyle: 'normal',
    fontWeight: '700',
    sha256: 'bbbe1fea11b163a3224c698e69a7ce70ef7c54ab222d43d9069e30d8e06dfd88',
  }),
  Galmuri14: Object.freeze({
    relativePath: 'assets/fonts/Galmuri14-subset.woff2',
    mime: 'font/woff2',
    format: 'woff2',
    fontStretch: 'normal',
    fontStyle: 'normal',
    fontWeight: '400',
    sha256: '309b8ecbe2badd7cdd21fc736dc4c6373621902580dd1379d60baefd0c827bc4',
  }),
  Galmuri9: Object.freeze({
    relativePath: 'assets/fonts/Galmuri9-subset.woff2',
    mime: 'font/woff2',
    format: 'woff2',
    fontStretch: 'normal',
    fontStyle: 'normal',
    fontWeight: '400',
    sha256: 'f7c71b4f2a3d67e389027a7c639ae4f1fca7a1bd39e5073179b38ecae54aba06',
  }),
  GalmuriMono11: Object.freeze({
    relativePath: 'assets/fonts/GalmuriMono11-subset.woff2',
    mime: 'font/woff2',
    format: 'woff2',
    fontStretch: 'normal',
    fontStyle: 'normal',
    fontWeight: '400',
    sha256: '6fc243e742eae8b6bc5ab2cda315b9921dd494b7656577efe570f2c800b2cd82',
  }),
});
const WORK0_MAX_FONT_BYTES = 4 * 1024 * 1024;
const WORK0_MAX_FONT_FACE_RULES = 16;
const WORK0_MAX_FONT_SOURCE_CHARS = 4 * 1024 * 1024;
const WORK0_MAX_FONT_CSS_RULES = 2048;
const WORK0_MAX_FONT_IMPORT_DEPTH = 8;
const WORK0_FONT_MIMES = new Set([
  'application/font-sfnt',
  'application/font-woff',
  'application/font-woff2',
  'application/octet-stream',
  'font/otf',
  'font/sfnt',
  'font/ttf',
  'font/woff',
  'font/woff2',
]);
const WORK0_SYSTEM_FONT_FAMILIES = new Set([
  '-apple-system',
  'apple sd gothic neo',
  'arial',
  'arial black',
  'blinkmacsystemfont',
  'courier new',
  'cursive',
  'fantasy',
  'georgia',
  'monospace',
  'sans-serif',
  'segoe ui',
  'serif',
  'system-ui',
  'times new roman',
  'trebuchet ms',
  'verdana',
]);
const WORK0_TRUSTED_FONT_BY_DIGEST = new Map(
  Object.entries(WORK0_TRUSTED_FONT_ASSETS).map(([family, asset]) => [
    asset.sha256,
    { ...asset, family },
  ]),
);
const WORK0_TRUSTED_FONT_RULE_CACHE = new Map();
const WORK0_PAGE_FONT_RESPONSES = new WeakMap();

const norm = (value) =>
  String(value ?? '')
    .replace(/[\u2060\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const tight = (value) => norm(value).split(' ').join('');
const round1 = (value) => Math.round((value + Number.EPSILON) * 10) / 10;

function shellQuote(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function samePlatformPath(left, right, platform = process.platform) {
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const leftPath = pathApi.resolve(left);
  const rightPath = pathApi.resolve(right);
  return platform === 'win32'
    ? leftPath.toLowerCase() === rightPath.toLowerCase()
    : leftPath === rightPath;
}

export function previewPublicEnv(previewEnv) {
  const env = { ...previewEnv };
  const suppliedPublicEntries = Object.entries(env).filter(([key]) => /^EXPO_PUBLIC_/i.test(key));
  if (Object.keys(env).some((key) => WORK0_RESERVED_ENV.has(key.toUpperCase()))) {
    throw new Error('invalid preview env: work0 attestation keys are reserved');
  }
  if (
    suppliedPublicEntries.some(
      ([key, value]) =>
        !/^EXPO_PUBLIC_[A-Z0-9_]+$/.test(key) ||
        typeof value !== 'string' ||
        /[\u0000\r\n]/.test(value),
    )
  ) {
    throw new Error('invalid preview env: public keys require canonical shell-safe strings');
  }
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
  if (
    publicEntries.some(
      ([key, value]) =>
        !/^EXPO_PUBLIC_[A-Z0-9_]+$/.test(key) ||
        typeof value !== 'string' ||
        /[\u0000\r\n]/.test(value),
    )
  ) {
    throw new Error('invalid preview env: public keys and values must be shell-safe strings');
  }
  return Object.fromEntries(publicEntries.sort(([left], [right]) => left.localeCompare(right)));
}

export function previewEnvLines(previewEnv, receipt) {
  const values = receipt ? captureExportEnv(previewEnv, receipt) : previewPublicEnv(previewEnv);
  return Object.entries(values).map(([key, value]) => `export ${key}=${shellQuote(value)}`);
}

function publicEnvSha256(previewEnv) {
  return createHash('sha256')
    .update(JSON.stringify(previewPublicEnv(previewEnv)))
    .digest('hex');
}

export function captureExportEnv(previewEnv, receipt) {
  const expected = previewPublicEnv(previewEnv);
  if (
    receipt?.schemaVersion !== 2 ||
    !UUID_PATTERN.test(receipt?.receiptId ?? '') ||
    receipt?.publicEnvSha256 !== publicEnvSha256(previewEnv)
  ) {
    throw new CaptureContractError('environment-attestation');
  }
  return Object.fromEntries(
    Object.entries({
      ...expected,
      [WORK0_RECEIPT_ID_KEY]: receipt.receiptId,
      [WORK0_ENV_SHA_KEY]: receipt.publicEnvSha256,
    }).sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function previewEnvJson(previewEnv, receipt) {
  return JSON.stringify(captureExportEnv(previewEnv, receipt));
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
  const validated = validateCaptureEnvReceipt(receipt, previewEnv, env, now);
  return { previewEnv, ...validated };
}

export function resolvePlaywright(load, env = {}) {
  const candidates = env.PW_PATH ? [env.PW_PATH] : ['playwright-core'];
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

export function browserLaunchOptions(env = {}, chromium) {
  if (typeof env.BROWSER_PATH !== 'string' || env.BROWSER_PATH.trim().length === 0) {
    throw new Error('BROWSER_PATH must name an existing browser executable');
  }
  const executablePath = path.resolve(env.BROWSER_PATH);
  if (!existsSync(executablePath)) {
    throw new Error('BROWSER_PATH must name an existing browser executable');
  }
  const managedExecutable = path.resolve(chromium?.executablePath?.() ?? '');
  if (!managedExecutable || !samePlatformPath(executablePath, managedExecutable)) {
    throw new Error('BROWSER_PATH must match the pinned Playwright Chromium executable');
  }
  return { executablePath };
}

export function validateBrowserRuntime(browser) {
  const actual = browser?.version?.();
  if (!PLAYWRIGHT_BROWSER_VERSION || actual !== PLAYWRIGHT_BROWSER_VERSION) {
    throw new Error('browser version does not match pinned Playwright Chromium');
  }
  return actual;
}

export function captureContextOptions() {
  return {
    viewport: { width: 390, height: 820 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    reducedMotion: 'no-preference',
  };
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
    if (parsed.origin !== DUMMY_ROUTE_ORIGIN || parsed.hash || parsed.pathname !== rawPath)
      return null;
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

export async function navigateHostedAppRoute(page, baseUrl, route) {
  const target = resolveHostedAppUrl(baseUrl, route);
  await page.evaluate((href) => {
    const next = new URL(href);
    if (next.origin !== location.origin || next.hash) throw new Error('invalid SPA target');
    history.pushState({}, '', `${next.pathname}${next.search}`);
    dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  }, target);
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

export function createCaptureEnvReceipt(previewEnv, now = Date.now(), receiptId = randomUUID()) {
  if (!Number.isFinite(now)) throw new CaptureContractError('environment-attestation');
  if (!UUID_PATTERN.test(receiptId)) throw new CaptureContractError('environment-attestation');
  // Store only a one-way digest. The public env values must never enter reports or errors.
  return {
    schemaVersion: 2,
    receiptId,
    printedAt: new Date(now).toISOString(),
    publicEnvSha256: publicEnvSha256(previewEnv),
  };
}

export function validateCaptureEnvReceiptMetadata(receipt, previewEnv, now = Date.now()) {
  const printedAt = Date.parse(receipt?.printedAt ?? '');
  const validReceipt =
    receipt?.schemaVersion === 2 &&
    UUID_PATTERN.test(receipt?.receiptId ?? '') &&
    receipt?.publicEnvSha256 === publicEnvSha256(previewEnv) &&
    Number.isFinite(printedAt) &&
    Number.isFinite(now) &&
    now >= printedAt &&
    now - printedAt <= CAPTURE_RECEIPT_MAX_AGE_MS;
  if (!validReceipt) throw new CaptureContractError('environment-attestation');
  return { printedAt, receipt };
}

export function validateCaptureEnvReceipt(receipt, previewEnv, runtimeEnv, now = Date.now()) {
  const validated = validateCaptureEnvReceiptMetadata(receipt, previewEnv, now);
  const expected = captureExportEnv(previewEnv, receipt);
  const actual = Object.fromEntries(
    Object.entries(runtimeEnv ?? {})
      .filter(([key, value]) => /^EXPO_PUBLIC_/i.test(key) && typeof value === 'string')
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  const exactRuntimeEnv = JSON.stringify(actual) === JSON.stringify(expected);
  if (!exactRuntimeEnv) {
    throw new CaptureContractError('environment-attestation');
  }
  return validated;
}

export function sourceBodySha256(body) {
  const value = typeof body === 'string' || Buffer.isBuffer(body) ? body : String(body ?? '');
  return createHash('sha256').update(value).digest('hex');
}

export function servedExportMarkerBody(receipt) {
  if (
    !UUID_PATTERN.test(receipt?.receiptId ?? '') ||
    !/^[0-9a-f]{64}$/i.test(receipt?.publicEnvSha256 ?? '')
  )
    throw new CaptureContractError('environment-attestation');
  return `globalThis.__WORK0_EXPORT_ATTESTATION__=Object.freeze(${JSON.stringify({
    receiptId: receipt.receiptId,
    publicEnvSha256: receipt.publicEnvSha256,
  })});\n`;
}

function validServedFileManifest(files) {
  if (!Array.isArray(files) || files.length === 0 || files.length > 5000) return false;
  const paths = new Set();
  return files.every((file) => {
    const valid =
      file != null &&
      typeof file === 'object' &&
      typeof file.path === 'string' &&
      file.path.length <= 512 &&
      /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*[\\\u0000-\u001f]).+$/.test(file.path) &&
      file.path !== 'work0-export-attestation.json' &&
      /^[0-9a-f]{64}$/i.test(file.sha256 ?? '') &&
      !paths.has(file.path);
    if (valid) paths.add(file.path);
    return valid;
  });
}

function validInlineScriptManifest(inlineScripts) {
  return (
    Array.isArray(inlineScripts) &&
    inlineScripts.length <= 100 &&
    inlineScripts.every((sha256) => /^[0-9a-f]{64}$/i.test(sha256))
  );
}

export function createServedExportAttestation(receipt, files, inlineScripts, now = Date.now()) {
  const printedAt = Date.parse(receipt?.printedAt ?? '');
  if (
    receipt?.schemaVersion !== 2 ||
    !UUID_PATTERN.test(receipt?.receiptId ?? '') ||
    !/^[0-9a-f]{64}$/i.test(receipt?.publicEnvSha256 ?? '') ||
    !validServedFileManifest(files) ||
    !validInlineScriptManifest(inlineScripts) ||
    !Number.isFinite(now) ||
    !Number.isFinite(printedAt) ||
    now < printedAt ||
    now - printedAt > CAPTURE_RECEIPT_MAX_AGE_MS
  ) {
    throw new CaptureContractError('environment-attestation');
  }
  return {
    schemaVersion: 2,
    receiptId: receipt.receiptId,
    publicEnvSha256: receipt.publicEnvSha256,
    exportedAt: new Date(now).toISOString(),
    files: [...files].sort((left, right) => left.path.localeCompare(right.path)),
    inlineScripts: [...inlineScripts],
  };
}

export function validateServedExportSources(
  servedFiles,
  previewEnv,
  receipt,
  servedAttestation,
  scriptContract = {},
) {
  const items = Array.isArray(servedFiles) ? servedFiles : [];
  let proof;
  try {
    proof = JSON.parse(servedAttestation?.body ?? '');
  } catch {
    throw new CaptureContractError('environment-attestation');
  }
  const exportedAt = Date.parse(proof?.exportedAt ?? '');
  const { printedAt } = validateCaptureEnvReceiptMetadata(receipt, previewEnv, exportedAt);
  const notBefore = Math.floor(printedAt / 1000) * 1000;
  const manifest = proof?.files;
  const fileMap = new Map(items.map((item) => [item?.path, item]));
  const filesMatch =
    validServedFileManifest(manifest) &&
    items.length === manifest.length &&
    fileMap.size === items.length &&
    manifest.every((file) => fileMap.get(file.path)?.sha256 === file.sha256);
  const externalScripts = scriptContract?.externalUrls;
  const servedExportPath = (url) => {
    try {
      const pathname = decodeURIComponent(new URL(url, DUMMY_ROUTE_ORIGIN).pathname);
      const prefix = '/2nd-B/';
      return pathname.startsWith(prefix) ? pathname.slice(prefix.length) : null;
    } catch {
      return null;
    }
  };
  const loadedScriptsMatch =
    Array.isArray(externalScripts) &&
    externalScripts.length > 0 &&
    scriptContract?.crossOriginCount === 0 &&
    externalScripts.some((url) => servedExportPath(url) === 'work0-export-marker.js') &&
    externalScripts.every((url) => manifest.some((file) => servedExportPath(url) === file.path)) &&
    validInlineScriptManifest(scriptContract?.inlineSha256) &&
    JSON.stringify(scriptContract.inlineSha256) === JSON.stringify(proof?.inlineScripts);
  const markerMatches =
    manifest?.find((file) => file.path === 'work0-export-marker.js')?.sha256 ===
    sourceBodySha256(servedExportMarkerBody(receipt));
  // Expo preserves source asset mtimes while producing a fresh export. The
  // fresh, receipt-bound proof is the publication timestamp; every served
  // file is bound separately by its byte hash.
  const proofModifiedAt = Date.parse(servedAttestation?.lastModified ?? '');
  const fresh = Number.isFinite(proofModifiedAt) && proofModifiedAt >= notBefore;
  const attested =
    fresh &&
    filesMatch &&
    loadedScriptsMatch &&
    markerMatches &&
    proof?.schemaVersion === 2 &&
    proof?.receiptId === receipt.receiptId &&
    proof?.publicEnvSha256 === receipt.publicEnvSha256 &&
    Number.isFinite(exportedAt) &&
    exportedAt >= printedAt;
  if (!attested) throw new CaptureContractError('environment-attestation');
  return {
    exportSha256: sourceBodySha256(servedAttestation.body),
    exportedAt,
  };
}

export async function attestServedExport(page, previewEnv, receipt) {
  const { servedFiles, servedAttestation, scriptContract } = await page.evaluate(async () => {
    const sha256 = async (value) => {
      const digest = await crypto.subtle.digest('SHA-256', value);
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    };
    const externalUrls = [];
    const inlineSha256 = [];
    let crossOriginCount = 0;
    for (const script of document.scripts) {
      if (script.src) {
        try {
          const url = new URL(script.src, location.href);
          if (url.origin === location.origin) externalUrls.push(url.href);
          else crossOriginCount += 1;
        } catch {
          crossOriginCount += 1;
        }
      } else {
        inlineSha256.push(await sha256(new TextEncoder().encode(script.textContent ?? '')));
      }
    }
    const proofUrl = new URL('/2nd-B/work0-export-attestation.json', location.origin);
    const proofResponse = await fetch(proofUrl, { cache: 'no-store', credentials: 'same-origin' });
    const servedAttestation = proofResponse.ok
      ? {
          body: await proofResponse.text(),
          lastModified: proofResponse.headers.get('last-modified'),
        }
      : { body: '', lastModified: null };
    let manifestPaths = [];
    try {
      const parsed = JSON.parse(servedAttestation.body);
      manifestPaths = Array.isArray(parsed?.files)
        ? parsed.files
            .map((file) => file?.path)
            .filter(
              (value) =>
                typeof value === 'string' &&
                value.length <= 512 &&
                /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*[\\\u0000-\u001f]).+$/.test(value),
            )
        : [];
    } catch {
      manifestPaths = [];
    }
    const servedFiles = await Promise.all(
      manifestPaths.map(async (filePath) => {
        const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
        const url = new URL(`/2nd-B/${encodedPath}`, location.origin).href;
        const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) return { path: filePath, sha256: '', lastModified: null };
        const body = await response.arrayBuffer();
        return {
          path: filePath,
          sha256: await sha256(body),
          lastModified: response.headers.get('last-modified'),
        };
      }),
    );
    return {
      servedFiles,
      servedAttestation,
      scriptContract: { externalUrls, inlineSha256, crossOriginCount },
    };
  });
  return validateServedExportSources(
    servedFiles,
    previewEnv,
    receipt,
    servedAttestation,
    scriptContract,
  );
}

function captureOriginHash(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return createHash('sha256').update(new URL(value).origin).digest('hex');
  } catch {
    return null;
  }
}

function isExpectedNoticeReadUrl(health, responseUrl) {
  if (!health?.noticeReadOriginHash) return false;
  try {
    const response = new URL(responseUrl);
    return (
      response.pathname === '/rest/v1/user_notice_reads' &&
      captureOriginHash(response.origin) === health.noticeReadOriginHash
    );
  } catch {
    return false;
  }
}

export function createShotHealth({ noticeReadOrigin } = {}) {
  return {
    failureCodes: [],
    pendingRequests: 0,
    networkRevision: 0,
    consoleErrorCount: 0,
    noticeReadConflictConsoleCount: 0,
    noticeReadConflictResponseCount: 0,
    noticeReadOriginHash: captureOriginHash(noticeReadOrigin),
  };
}

export function recordShotFailure(health, code) {
  if (!health || !SHOT_HEALTH_CODES.includes(code)) return;
  if (!Array.isArray(health.failureCodes)) health.failureCodes = [];
  if (
    !health.failureCodes.includes(code) &&
    health.failureCodes.length < SHOT_HEALTH_CODES.length
  ) {
    health.failureCodes.push(code);
  }
}

export function recordShotConsole(health, message) {
  if (!health || message?.type?.() !== 'error') return;
  health.consoleErrorCount = (Number(health.consoleErrorCount) || 0) + 1;
  recordShotFailure(health, 'console-error');
  let locationUrl = '';
  try {
    locationUrl = message.location?.().url ?? '';
  } catch {
    locationUrl = '';
  }
  if (isExpectedNoticeReadUrl(health, locationUrl)) {
    health.noticeReadConflictConsoleCount =
      (Number(health.noticeReadConflictConsoleCount) || 0) + 1;
  }
}

export function recordShotResponse(health, baseUrl, responseUrl, status, method = null) {
  try {
    const response = new URL(responseUrl);
    if (status === 409 && method === 'POST' && isExpectedNoticeReadUrl(health, response.href)) {
      health.noticeReadConflictResponseCount =
        (Number(health.noticeReadConflictResponseCount) || 0) + 1;
      return;
    }
    if (!Number.isInteger(status) || status < 400) return;
    const base = parseBaseUrl(baseUrl);
    if (
      status === 404 &&
      response.origin === base.origin &&
      (response.pathname === '/2nd-B' || response.pathname.startsWith('/2nd-B/'))
    ) {
      recordShotFailure(health, 'asset-404');
      return;
    }
    recordShotFailure(health, 'network-failure');
  } catch {
    // Ignore malformed response metadata; never retain its raw URL.
  }
}

export function createShotNetworkTracker() {
  const owners = new WeakMap();
  const responseStatuses = new WeakMap();
  const bump = (health) => {
    if (!health) return;
    health.networkRevision = Number.isFinite(health.networkRevision)
      ? health.networkRevision + 1
      : 1;
  };
  const release = (request, failed) => {
    if (!request || (typeof request !== 'object' && typeof request !== 'function')) return null;
    const health = owners.get(request);
    if (!health) return null;
    owners.delete(request);
    const responseStatus = responseStatuses.get(request);
    responseStatuses.delete(request);
    health.pendingRequests = Math.max(0, (Number(health.pendingRequests) || 0) - 1);
    bump(health);
    let successfulHeadAbort = false;
    if (
      failed &&
      Number.isInteger(responseStatus) &&
      responseStatus >= 200 &&
      responseStatus < 300
    ) {
      try {
        successfulHeadAbort =
          request.method?.() === 'HEAD' && request.failure?.()?.errorText === 'net::ERR_ABORTED';
      } catch {
        successfulHeadAbort = false;
      }
    }
    if (failed && !successfulHeadAbort) recordShotFailure(health, 'network-failure');
    return health;
  };
  return {
    start(request, health) {
      if (
        !health ||
        !request ||
        (typeof request !== 'object' && typeof request !== 'function') ||
        owners.has(request)
      )
        return;
      owners.set(request, health);
      health.pendingRequests = (Number(health.pendingRequests) || 0) + 1;
      bump(health);
    },
    finish(request) {
      release(request, false);
    },
    fail(request) {
      release(request, true);
    },
    response(request, baseUrl, responseUrl, status, { ignoreAsset404 = false } = {}) {
      if (owners.has(request) && Number.isInteger(status)) responseStatuses.set(request, status);
      let method = null;
      try {
        method = request?.method?.() ?? null;
      } catch {
        method = null;
      }
      if (!ignoreAsset404 || status !== 404) {
        recordShotResponse(owners.get(request), baseUrl, responseUrl, status, method);
      }
    },
  };
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

export function resolveCaptureMarkerTime(env = {}, printedAt) {
  const markerTime = env.FIXED_ISO ? Date.parse(env.FIXED_ISO) : printedAt;
  if (!Number.isFinite(markerTime)) throw new Error('FIXED_ISO must be a valid date');
  return markerTime;
}

function assertCredentialOrigin(baseUrl, currentUrl, env = {}) {
  const expected = parseBaseUrl(baseUrl);
  let actual;
  try {
    actual = new URL(currentUrl);
  } catch {
    throw new CaptureContractError('unexpected-final-origin');
  }
  if (actual.origin !== expected.origin) {
    throw new CaptureContractError('unexpected-final-origin');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(expected.hostname);
  let explicitlyAllowed = false;
  if (typeof env.CAPTURE_ALLOWED_ORIGIN === 'string' && env.CAPTURE_ALLOWED_ORIGIN.trim()) {
    try {
      const allowed = new URL(env.CAPTURE_ALLOWED_ORIGIN);
      explicitlyAllowed =
        allowed.origin === expected.origin && allowed.href === `${allowed.origin}/`;
    } catch {
      explicitlyAllowed = false;
    }
  }
  if (!loopback && !explicitlyAllowed) {
    throw new CaptureContractError('unexpected-final-origin');
  }
  return actual;
}

export async function fillQaLogin(page, { baseUrl, email, password, env = {} }) {
  if (!email || !password) throw new CaptureContractError('capture-failed');
  const current = assertCredentialOrigin(baseUrl, page.url(), env);
  const signInPath = new URL(resolveHostedAppUrl(baseUrl, '/sign-in')).pathname;
  if (current.pathname !== signInPath) return;

  const emailInput = page.getByLabel(/이메일|email/i);
  // Password inputs deliberately have no textbox ARIA role. RN-web renders
  // secureTextEntry as input[type=password] with the accessibility label.
  const passwordInput = page.locator('input[type="password"]');
  if ((await emailInput.count()) !== 1 || (await passwordInput.count()) !== 1) {
    throw new CaptureContractError('capture-failed');
  }
  await emailInput.fill(email);
  await passwordInput.fill(password);
  await page.locator('button:has-text("로그인"), button:has-text("Sign in")').first().click();
  await page.waitForTimeout(5000);
  const after = assertCredentialOrigin(baseUrl, page.url(), env);
  if (after.pathname === signInPath) {
    throw new CaptureContractError('unexpected-final-route');
  }
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
      return (
        url.origin === base.origin &&
        (url.pathname === '/2nd-B' || url.pathname.startsWith('/2nd-B/'))
      );
    } catch {
      return false;
    }
  });
  const detected = new Set(
    (Array.isArray(failureCodes) ? failureCodes : []).filter((code) =>
      SHOT_HEALTH_CODES.includes(code),
    ),
  );
  if (asset404) detected.add('asset-404');
  if (pageErrorCount > 0) detected.add('page-error');
  if (consoleErrorCount > 0) detected.add('console-error');
  if (requestFailedCount > 0) detected.add('network-failure');
  return SHOT_HEALTH_CODES.filter((code) => detected.has(code));
}

export async function waitForShotNetworkIdle(
  page,
  health,
  { maxMs = 10000, pollMs = 50, quietMs = 250, now = Date.now } = {},
) {
  const started = now();
  let observedRevision = -1;
  let idleSince = null;
  while (now() - started <= maxMs) {
    const revision = Number(health?.networkRevision) || 0;
    const pending = Number(health?.pendingRequests) || 0;
    if (revision !== observedRevision) {
      observedRevision = revision;
      idleSince = pending === 0 ? now() : null;
    } else if (pending === 0) {
      if (idleSince == null) idleSince = now();
      if (now() - idleSince >= quietMs) return;
    } else {
      idleSince = null;
    }
    await page.waitForTimeout(pollMs);
  }
  throw new CaptureContractError('network-failure');
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
    localStorage.setItem('secondB_intro_dismissed_v1', 'permanent');
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

export function makeCaptureDeterminismScript(markerTime) {
  if (!Number.isFinite(markerTime)) throw new Error('FIXED_ISO must be a valid date');
  const markerDate = new Date(markerTime);
  if (Number.isNaN(markerDate.getTime())) throw new Error('FIXED_ISO must be a valid date');
  return `(function () {
  var fixedTime = ${markerTime};
  var RealDate = Date;
  var FakeDate = function () {
    if (!(this instanceof FakeDate)) return new RealDate(fixedTime).toString();
    if (arguments.length === 0) return new RealDate(fixedTime);
    return Reflect.construct(RealDate, Array.prototype.slice.call(arguments));
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
})();`;
}

export function digestPage(root = document.body) {
  const filterOpacity = (value) => {
    let product = 1;
    for (const match of String(value || '').matchAll(
      /opacity\(\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*(%)?\s*\)/gi,
    )) {
      const parsed = Number(match[1]);
      if (!Number.isFinite(parsed)) continue;
      product *= Math.min(1, Math.max(0, match[2] ? parsed / 100 : parsed));
    }
    return product;
  };
  const insetClip = (value, rect) => {
    const match = /^inset\(([^)]*)\)$/i.exec(String(value || '').trim());
    if (!match || !rect) return null;
    const raw = match[1]
      .split(/\s+round\s+/i)[0]
      .trim()
      .split(/\s+/);
    if (raw.length < 1 || raw.length > 4) return null;
    const parsed = raw.map((part) => {
      const token = /^([+-]?(?:\d+\.?\d*|\.\d+))(px|%)?$/.exec(part);
      return token ? { value: Number(token[1]), percent: token[2] === '%' } : null;
    });
    if (parsed.some((part) => !part || !Number.isFinite(part.value))) return null;
    const expanded =
      parsed.length === 1
        ? [parsed[0], parsed[0], parsed[0], parsed[0]]
        : parsed.length === 2
          ? [parsed[0], parsed[1], parsed[0], parsed[1]]
          : parsed.length === 3
            ? [parsed[0], parsed[1], parsed[2], parsed[1]]
            : parsed;
    const pixels = (part, size) => (part.percent ? (part.value / 100) * size : part.value);
    return {
      top: rect.top + pixels(expanded[0], rect.height),
      right: rect.right - pixels(expanded[1], rect.width),
      bottom: rect.bottom - pixels(expanded[2], rect.height),
      left: rect.left + pixels(expanded[3], rect.width),
    };
  };
  const legacyClip = (value, rect) => {
    const match = /^rect\(([^)]*)\)$/i.exec(String(value || '').trim());
    if (!match || !rect) return null;
    const parts = match[1]
      .trim()
      .split(/\s*,\s*|\s+/)
      .filter(Boolean);
    if (parts.length !== 4) return null;
    const offset = (part, fallback) => {
      if (part.toLowerCase() === 'auto') return fallback;
      const parsed = /^([+-]?(?:\d+\.?\d*|\.\d+))(?:px)?$/i.exec(part);
      return parsed ? Number(parsed[1]) : null;
    };
    const values = [
      offset(parts[0], 0),
      offset(parts[1], rect.width),
      offset(parts[2], rect.height),
      offset(parts[3], 0),
    ];
    if (values.some((part) => part === null || !Number.isFinite(part))) return null;
    return {
      top: rect.top + values[0],
      right: rect.left + values[1],
      bottom: rect.top + values[2],
      left: rect.left + values[3],
    };
  };
  const transparentPaint = (value) => {
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    return (
      normalized === 'transparent' ||
      normalized === 'none' ||
      /^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(normalized) ||
      /^(?:rgb|rgba)\([^)]*\/\s*0(?:\.0+)?%?\s*\)$/.test(normalized)
    );
  };
  const parsedRgb = (value) => {
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    if (!/^rgba?\(/.test(normalized)) return null;
    const components = normalized.match(/[+-]?(?:\d+\.?\d*|\.\d+)%?/g) ?? [];
    if (components.length < 3) return null;
    const hasAlpha =
      normalized.includes('/') || (normalized.startsWith('rgba(') && components.length > 3);
    let alpha = 1;
    if (hasAlpha) {
      const token = components[3] ?? '1';
      alpha = token.endsWith('%') ? Number(token.slice(0, -1)) / 100 : Number(token);
      if (!Number.isFinite(alpha)) return null;
    }
    return {
      alpha,
      rgb: components
        .slice(0, 3)
        .map((token) => {
          const channel = token.endsWith('%')
            ? (Number(token.slice(0, -1)) / 100) * 255
            : Number(token);
          return Math.round(channel);
        })
        .join(','),
    };
  };
  const readableTextPaint = (element, style, paint) => {
    const tag = element.tagName?.toLowerCase?.();
    let foregroundPaint = paint;
    let channelOpacity = 1;
    if (['text', 'tspan'].includes(tag)) {
      channelOpacity = Number(style.fillOpacity);
      if (transparentPaint(foregroundPaint) && !transparentPaint(style.stroke)) {
        foregroundPaint = style.stroke;
        channelOpacity = Number(style.strokeOpacity);
      }
    }
    if (transparentPaint(foregroundPaint)) return false;
    const foreground = parsedRgb(foregroundPaint);
    if (
      (foreground && foreground.alpha < 0.1) ||
      (Number.isFinite(channelOpacity) && channelOpacity < 0.1)
    )
      return false;
    if (!foreground || (style.textShadow && style.textShadow !== 'none')) return true;
    for (let current = element; current; current = current.parentElement) {
      const currentStyle = current === element ? style : getComputedStyle(current);
      const backgroundPaint = currentStyle.backgroundColor;
      if (transparentPaint(backgroundPaint)) continue;
      const background = parsedRgb(backgroundPaint);
      return !background || background.alpha < 1 || background.rgb !== foreground.rgb;
    }
    return true;
  };
  const renderedRect = (element, isRoot = false, subjectRect = null, clipOwnOverflow = false) => {
    const rect = subjectRect ?? element.getBoundingClientRect?.();
    if (!rect || rect.width < 1 || rect.height < 1) return null;
    const viewportWidth =
      typeof window === 'undefined' ? Number.POSITIVE_INFINITY : window.innerWidth;
    const viewportHeight =
      typeof window === 'undefined' ? Number.POSITIVE_INFINITY : window.innerHeight;
    let left = Math.max(0, rect.left);
    let top = Math.max(0, rect.top);
    let right = Math.min(viewportWidth, rect.right);
    let bottom = Math.min(viewportHeight, rect.bottom);
    let cumulativeOpacity = 1;
    for (let current = element; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      const opacity = Number(style.opacity);
      if (
        current.hidden === true ||
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse' ||
        style.contentVisibility === 'hidden'
      )
        return null;
      if (Number.isFinite(opacity)) {
        cumulativeOpacity *= Math.min(1, Math.max(0, opacity));
      }
      cumulativeOpacity *= filterOpacity(style.filter);
      if (cumulativeOpacity <= 0) return null;
      const ancestorRect = current.getBoundingClientRect?.();
      if (ancestorRect) {
        const clipValue = String(style.clipPath || style.webkitClipPath || 'none').trim();
        if (clipValue !== 'none') {
          const clip = insetClip(clipValue, ancestorRect);
          if (!clip) return null;
          left = Math.max(left, clip.left);
          right = Math.min(right, clip.right);
          top = Math.max(top, clip.top);
          bottom = Math.min(bottom, clip.bottom);
        }
        const legacyClipValue = String(style.clip || 'auto').trim();
        if (legacyClipValue !== 'auto') {
          const clip = legacyClip(legacyClipValue, ancestorRect);
          if (!clip) return null;
          left = Math.max(left, clip.left);
          right = Math.min(right, clip.right);
          top = Math.max(top, clip.top);
          bottom = Math.min(bottom, clip.bottom);
        }
        const maskValue = String(style.maskImage || style.webkitMaskImage || 'none').trim();
        if (maskValue !== 'none') return null;
        if (current !== element || clipOwnOverflow) {
          const overflowX = style.overflowX || style.overflow;
          const overflowY = style.overflowY || style.overflow;
          if (['auto', 'clip', 'hidden', 'scroll'].includes(overflowX)) {
            left = Math.max(left, ancestorRect.left);
            right = Math.min(right, ancestorRect.right);
          }
          if (['auto', 'clip', 'hidden', 'scroll'].includes(overflowY)) {
            top = Math.max(top, ancestorRect.top);
            bottom = Math.min(bottom, ancestorRect.bottom);
          }
        }
      }
      if (right - left < 1 || bottom - top < 1) return null;
    }
    const width = right - left;
    const height = bottom - top;
    const visibleRatio = (width * height) / (rect.width * rect.height);
    if (cumulativeOpacity < 0.1 || (!isRoot && (width < 2 || height < 2 || visibleRatio < 0.1)))
      return null;
    return { ...rect, left, top, right, bottom, width, height };
  };
  const digestText = (node) =>
    [node?.text || '', ...(node?.kids ?? []).map(digestText)].join(' ').replace(/\s+/g, ' ').trim();
  const textNodeRects = (node, fallbackRect) => {
    if (typeof node?.getClientRects === 'function') return [...node.getClientRects()];
    if (typeof document !== 'undefined' && typeof document.createRange === 'function') {
      const range = document.createRange();
      try {
        range.selectNodeContents(node);
        return [...range.getClientRects()];
      } finally {
        range.detach?.();
      }
    }
    return fallbackRect ? [fallbackRect] : [];
  };
  const directVisibleText = (element, style, isRoot) => {
    const tag = element.tagName.toLowerCase();
    const paint = ['text', 'tspan'].includes(tag)
      ? style.fill
      : style.webkitTextFillColor || style.color;
    if (!readableTextPaint(element, style, paint)) return '';
    const fallbackRect = element.getBoundingClientRect?.();
    return [...(element.childNodes ?? [])]
      .filter((node) => node.nodeType === 3 && node.textContent?.trim())
      .filter((node) =>
        textNodeRects(node, fallbackRect).some((rect) => renderedRect(element, isRoot, rect, true)),
      )
      .map((node) => node.textContent.trim())
      .join(' ');
  };
  const walk = (element, depth) => {
    if (depth > 24) return null;
    const rect = renderedRect(element, element === root);
    if (!rect) return null;
    const style = getComputedStyle(element);
    const tag = element.tagName.toLowerCase();
    const own = directVisibleText(element, style, element === root);
    const kids = [...element.children].map((child) => walk(child, depth + 1)).filter(Boolean);
    const interactiveElement =
      element.matches?.('a[href], button, [role="button"], [role="link"]') === true;
    const interactiveText = interactiveElement
      ? [own, ...kids.map(digestText)].join(' ').replace(/\s+/g, ' ').trim()
      : '';
    const interactive = interactiveElement && interactiveText.length > 0;
    if (!own && kids.length === 0 && !interactive) return null;
    return {
      tag,
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
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.why === 'string' &&
    value.why.trim().length > 0
  );
}

export function validateManifestClassification(screens, routesFile) {
  const errors = [];
  const screenById = new Map();
  const duplicateScreenIds = new Set();
  for (const screen of Array.isArray(screens) ? screens : []) {
    if (typeof screen?.id !== 'string' || !SCREEN_ID_PATTERN.test(screen.id)) {
      errors.push({
        code: 'invalid-screen-id',
        id: typeof screen?.id === 'string' ? screen.id : '',
      });
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
    else if (categories.length > 1)
      errors.push({ code: 'duplicate-id', id: screen.id, categories });
  }
  errors.sort((left, right) =>
    `${left.code}:${left.id}:${left.category ?? ''}`.localeCompare(
      `${right.code}:${right.id}:${right.category ?? ''}`,
    ),
  );
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

function partitionExemptedItems(values, exempted = []) {
  const pending = new Map();
  for (const value of exempted) {
    const key = tight(value);
    if (key) pending.set(key, (pending.get(key) ?? 0) + 1);
  }
  const declared = (Array.isArray(values) ? values : [])
    .map((raw) => ({ raw, key: tight(raw) }))
    .filter(({ key }) => key.length > 0);
  const scored = [];
  let exemptedCount = 0;
  for (const item of declared) {
    const remaining = pending.get(item.key) ?? 0;
    if (remaining > 0) {
      pending.set(item.key, remaining - 1);
      exemptedCount += 1;
    } else {
      scored.push(item);
    }
  }
  return { declared, scored, exemptedCount };
}

function requiresItemDeviationReview(declaredCount, exemptedCount) {
  return declaredCount > 0 && exemptedCount / declaredCount > 0.5;
}

export function isSafeInteractiveHref(value, baseUrl = null) {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  if (!baseUrl) return isSafeAppRoute(value);
  try {
    const base = parseBaseUrl(baseUrl);
    const target = new URL(value, `${base.origin}/2nd-B/`);
    if (target.origin !== base.origin || target.hash) return false;
    let routePath;
    if (target.pathname === '/2nd-B' || target.pathname === '/2nd-B/') routePath = '/';
    else if (target.pathname.startsWith('/2nd-B/')) routePath = target.pathname.slice(6);
    else return false;
    return isSafeAppRoute(`${routePath}${target.search}`);
  } catch {
    return false;
  }
}

function actionableNavigationEntries(interactions, baseUrl) {
  const entries = [];
  let unsafeTargets = 0;
  for (const interaction of Array.isArray(interactions) ? interactions : []) {
    const label = tight(interaction?.label);
    if (!label) continue;
    const rawTarget = interaction?.to;
    const hasTarget = typeof rawTarget === 'string' && rawTarget.trim().length > 0;
    if (hasTarget && !isSafeInteractiveHref(rawTarget, baseUrl)) {
      unsafeTargets += 1;
      continue;
    }
    entries.push({ label, evidence: hasTarget ? 'safe-href' : 'actionable-only' });
  }
  return { entries, unsafeTargets };
}

export function scoreNavigationLabels(declared, interactions, exempted = [], options = {}) {
  if (!Array.isArray(declared) || declared.length === 0) {
    return {
      score: null,
      max: WEIGHTS.D,
      measurable: false,
      ratio: null,
      matched: 0,
      declared: Array.isArray(declared) ? declared.length : 0,
      measured: 0,
      exempted: 0,
      requiresManualReview: false,
      evidence: { actionableOnly: 0, safeHrefs: 0, unsafeTargets: 0 },
      missing: [],
    };
  }
  const partition = partitionExemptedItems(declared, exempted);
  const { entries, unsafeTargets } = actionableNavigationEntries(interactions, options.baseUrl);
  const used = new Set();
  const missing = [];
  let matched = 0;
  let actionableOnly = 0;
  let safeHrefs = 0;
  for (const item of partition.scored) {
    const normalized = item.key.replace(/[…·]+$/u, '');
    const probe = normalized.slice(0, Math.max(2, Math.min(normalized.length, 8)));
    const found = entries.findIndex(
      (entry, index) => !used.has(index) && probe && entry.label.includes(probe),
    );
    if (found >= 0) {
      used.add(found);
      matched += 1;
      if (entries[found].evidence === 'safe-href') safeHrefs += 1;
      else actionableOnly += 1;
    } else {
      missing.push(item.raw);
    }
  }
  const ratio = partition.scored.length ? matched / partition.scored.length : 1;
  const itemDeviationReview = requiresItemDeviationReview(
    partition.declared.length,
    partition.exemptedCount,
  );
  return {
    score: ratio * WEIGHTS.D,
    max: WEIGHTS.D,
    measurable: true,
    ratio,
    matched,
    declared: partition.declared.length,
    measured: partition.scored.length,
    exempted: partition.exemptedCount,
    requiresManualReview: itemDeviationReview || actionableOnly > 0,
    manualReviewReasons: [
      ...(itemDeviationReview ? ['item-deviations-exceed-half'] : []),
      ...(actionableOnly > 0 ? ['actionable-only-targets'] : []),
    ],
    evidence: { actionableOnly, safeHrefs, unsafeTargets },
    missing,
  };
}

export function formatNavigationWhy(navigation) {
  if (!navigation?.measurable) return 'nav declaration missing';
  const missing = Array.isArray(navigation.missing) ? navigation.missing : [];
  const parts = [
    `declared ${navigation.declared} · measured ${navigation.measured} · exempt ${navigation.exempted} · missing ${missing.length}${
      missing.length ? ` → ${missing.slice(0, 8).join(' / ')}` : ''
    }`,
  ];
  const evidence =
    navigation.evidence && typeof navigation.evidence === 'object' ? navigation.evidence : {};
  const exactEvidence = Object.prototype.hasOwnProperty.call(evidence, 'exactRoutes');
  if (exactEvidence) {
    const exactFields = [
      ['exact routes', evidence.exactRoutes],
      ['exact actions', evidence.exactActions],
      ['post effects', evidence.postEffects],
      ['unsafe actions', evidence.unsafeActions],
      ['manual effects', evidence.manualEffects],
      ['unresolved', evidence.unresolved],
    ];
    let evidenceCount = 0;
    for (const [label, value] of exactFields) {
      const count = Number.isFinite(value) ? value : 0;
      evidenceCount += count;
      if (count > 0) parts.push(`${label} ${count}`);
    }
    const failures = Object.entries(evidence.failures ?? {}).filter(
      ([, count]) => Number.isInteger(count) && count > 0,
    );
    if (failures.length > 0) {
      parts.push(`failures ${failures.map(([code, count]) => `${code} ${count}`).join(' / ')}`);
    } else if (evidenceCount === 0) {
      parts.push('exact evidence 0');
    }
  } else {
    parts.push(
      `evidence safe-href ${Number.isFinite(evidence.safeHrefs) ? evidence.safeHrefs : 0} / actionable-only ${
        Number.isFinite(evidence.actionableOnly) ? evidence.actionableOnly : 0
      } / unsafe-target ${Number.isFinite(evidence.unsafeTargets) ? evidence.unsafeTargets : 0}`,
    );
  }
  const manualReviewReasons = Array.isArray(navigation.manualReviewReasons)
    ? navigation.manualReviewReasons
    : [];
  if (manualReviewReasons.length > 0) {
    parts.push(`manual review ${manualReviewReasons.join(' / ')}`);
  }
  return parts.join(' · ');
}

const NAVIGATION_ITEM_KINDS = new Set(['route', 'action']);
const NAVIGATION_LOCATOR_STRATEGIES = new Set(['text-ancestor', 'role']);
const NAVIGATION_LOCATOR_ROLES = new Set(['button', 'link', 'tab']);
const NAVIGATION_EFFECT_TYPES = new Set(['selected', 'visible', 'input-value']);
const NAVIGATION_POST_EFFECT_TYPES = new Set(['visible']);
const NAVIGATION_FAILURE_CODES = new Set([
  'probe-failed',
  'probe-setup',
  'source-route',
  'source-health',
  'painted-label',
  'action-target',
  'click-failed',
  'route-mismatch',
  'reveal-target',
  'mutation-blocked',
  'effect-mismatch',
]);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MANUAL_EFFECT_MAX_SCREENS = 100;
const MANUAL_EFFECT_MAX_ITEMS = 20;
const MANUAL_EFFECT_MAX_TOTAL_ITEMS = 16;
const MANUAL_EFFECT_MAX_MANIFEST_BYTES = 256 * 1024;
const MANUAL_EFFECT_MAX_ARTIFACT_BYTES = 20 * 1024 * 1024;
const MANUAL_EFFECT_MAX_ARTIFACT_PIXELS = 32 * 1024 * 1024;
const MANUAL_EFFECT_MAX_TOTAL_ARTIFACT_BYTES = 64 * 1024 * 1024;
const MANUAL_EFFECT_MAX_TOTAL_ARTIFACT_PIXELS = 32 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const VALIDATED_MANUAL_EFFECT_EVIDENCE = new WeakMap();

function navigationContractError() {
  return new Error('invalid navigation contract');
}

function assertNavigationKeys(value, allowed) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.has(key))
  ) {
    throw navigationContractError();
  }
}

export function captureSetupFailureCodes(baseUrl, health = {}) {
  const codes = shotFailureCodes({ baseUrl, ...health });
  const consoleCount = Number(health.consoleErrorCount) || 0;
  const candidateCount = Number(health.noticeReadConflictConsoleCount) || 0;
  const responseCount = Number(health.noticeReadConflictResponseCount) || 0;
  const onlyCorrelatedConflict =
    consoleCount > 0 && consoleCount === candidateCount && candidateCount <= responseCount;
  return onlyCorrelatedConflict ? codes.filter((code) => code !== 'console-error') : codes;
}

function exactNavigationText(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f\u200b\u200c\u200d\u2060\ufeff]/iu.test(value)
  ) {
    throw navigationContractError();
  }
  return value;
}

function normalizeNavigationOccurrence(value) {
  if (value === undefined) return 1;
  if (!Number.isSafeInteger(value) || value < 1 || value > 20) {
    throw navigationContractError();
  }
  return value;
}

function normalizeNavigationLocator(value, label) {
  if (value === undefined) {
    return { strategy: 'text-ancestor', role: 'button', name: label };
  }
  assertNavigationKeys(value, new Set(['strategy', 'role', 'name']));
  if (!NAVIGATION_LOCATOR_STRATEGIES.has(value.strategy)) throw navigationContractError();
  const role = value.role ?? 'button';
  if (!NAVIGATION_LOCATOR_ROLES.has(role)) throw navigationContractError();
  if (value.strategy === 'role' && value.name === undefined) throw navigationContractError();
  return {
    strategy: value.strategy,
    role,
    name: value.name === undefined ? label : exactNavigationText(value.name),
  };
}

function normalizeNavigationEffect(value, label) {
  assertNavigationKeys(value, new Set(['type', 'role', 'name', 'occurrence', 'value', 'text']));
  if (!NAVIGATION_EFFECT_TYPES.has(value.type)) throw navigationContractError();
  if (value.type === 'selected') {
    assertNavigationKeys(value, new Set(['type', 'value']));
    if (value.value !== undefined && typeof value.value !== 'boolean') {
      throw navigationContractError();
    }
    return { type: value.type, value: value.value ?? true };
  }
  const occurrence = normalizeNavigationOccurrence(value.occurrence);
  if (value.type === 'visible') {
    assertNavigationKeys(value, new Set(['type', 'role', 'name', 'occurrence', 'text']));
    const role = value.role ?? 'button';
    if (!NAVIGATION_LOCATOR_ROLES.has(role)) throw navigationContractError();
    return {
      type: value.type,
      role,
      name: exactNavigationText(value.name ?? label),
      occurrence,
      ...(value.text === undefined ? {} : { text: exactNavigationText(value.text) }),
    };
  }
  assertNavigationKeys(value, new Set(['type', 'role', 'name', 'occurrence', 'value']));
  if (value.role !== undefined && value.role !== 'textbox') throw navigationContractError();
  return {
    type: value.type,
    role: 'textbox',
    name: value.name === undefined ? null : exactNavigationText(value.name),
    occurrence,
    value: exactNavigationText(value.value ?? label),
  };
}

function normalizePostNavigation(value, label) {
  assertNavigationKeys(value, new Set(['reveal', 'effect']));
  const effect = normalizeNavigationEffect(value.effect, label);
  if (!NAVIGATION_POST_EFFECT_TYPES.has(effect.type)) throw navigationContractError();
  if (value.reveal === undefined) return { effect };
  assertNavigationKeys(value.reveal, new Set(['role', 'name', 'occurrence']));
  const role = value.reveal.role ?? 'button';
  if (role !== 'button') throw navigationContractError();
  return {
    reveal: {
      role,
      name: exactNavigationText(value.reveal.name),
      occurrence: normalizeNavigationOccurrence(value.reveal.occurrence),
    },
    effect,
  };
}

export function normalizeNavigationContract(value, baseUrl = null) {
  assertNavigationKeys(value, new Set(['version', 'items', 'unresolved']));
  if (value.version !== 2 || !Array.isArray(value.items)) throw navigationContractError();
  const rawItems = value.items;
  const items = rawItems.map((item) => {
    assertNavigationKeys(
      item,
      new Set([
        'label',
        'occurrence',
        'kind',
        'to',
        'locator',
        'safe',
        'why',
        'effect',
        'postNavigation',
      ]),
    );
    const label = exactNavigationText(item.label);
    const occurrence = normalizeNavigationOccurrence(item.occurrence);
    if (!NAVIGATION_ITEM_KINDS.has(item.kind)) throw navigationContractError();
    const locator = normalizeNavigationLocator(item.locator, label);
    if (item.kind === 'route') {
      if (
        item.safe !== undefined ||
        item.why !== undefined ||
        item.effect !== undefined ||
        !isSafeAppRoute(item.to) ||
        (baseUrl && !isSafeInteractiveHref(resolveHostedAppUrl(baseUrl, item.to), baseUrl))
      ) {
        throw navigationContractError();
      }
      return {
        label,
        occurrence,
        kind: item.kind,
        to: item.to,
        locator,
        safe: true,
        ...(item.postNavigation === undefined
          ? {}
          : { postNavigation: normalizePostNavigation(item.postNavigation, label) }),
      };
    }
    if (item.to !== undefined || item.postNavigation !== undefined) throw navigationContractError();
    if (item.safe !== undefined && typeof item.safe !== 'boolean') {
      throw navigationContractError();
    }
    const safe = item.safe ?? true;
    if (!safe) {
      if (typeof item.why !== 'string' || !norm(item.why)) {
        throw navigationContractError();
      }
      return {
        label,
        occurrence,
        kind: item.kind,
        locator,
        safe,
        why: norm(item.why),
        ...(item.effect === undefined
          ? {}
          : { effect: normalizeNavigationEffect(item.effect, label) }),
      };
    }
    if (item.why !== undefined || item.effect === undefined) throw navigationContractError();
    return {
      label,
      occurrence,
      kind: item.kind,
      locator,
      safe,
      effect: normalizeNavigationEffect(item.effect, label),
    };
  });
  const byLabel = new Map();
  rawItems.forEach((item, index) => {
    const label = items[index].label;
    const group = byLabel.get(label) ?? [];
    group.push({
      explicit: Object.hasOwn(item, 'occurrence'),
      occurrence: items[index].occurrence,
    });
    byLabel.set(label, group);
  });
  for (const group of byLabel.values()) {
    if (
      group.length > 1 &&
      (group.some((item) => !item.explicit) ||
        new Set(group.map((item) => item.occurrence)).size !== group.length)
    ) {
      throw navigationContractError();
    }
  }

  const unresolved = (value.unresolved ?? []).map((item) => {
    assertNavigationKeys(item, new Set(['label', 'occurrence', 'why']));
    if (typeof item.why !== 'string' || !norm(item.why)) throw navigationContractError();
    return {
      label: exactNavigationText(item.label),
      occurrence: normalizeNavigationOccurrence(item.occurrence),
      why: norm(item.why),
    };
  });
  if (items.length + unresolved.length === 0) throw navigationContractError();
  const exactDeclarations = new Set();
  for (const item of [...items, ...unresolved]) {
    const key = `${item.label}\u0000${item.occurrence}`;
    if (exactDeclarations.has(key)) throw navigationContractError();
    exactDeclarations.add(key);
  }
  return { version: 2, items, unresolved };
}

export function validateStage1NavigationContracts(stage1Ids, navFile, baseUrl) {
  if (!Array.isArray(stage1Ids) || !navFile || typeof navFile !== 'object') return false;
  try {
    for (const id of stage1Ids) {
      if (!SCREEN_ID_PATTERN.test(id) || navFile[id]?.version !== 2) return false;
      normalizeNavigationContract(navFile[id], baseUrl);
    }
    return true;
  } catch {
    return false;
  }
}

function manualEffectEvidenceError() {
  return new Error('invalid manual effect evidence');
}

function assertManualEffectKeys(value, allowed) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.has(key))
  ) {
    throw manualEffectEvidenceError();
  }
}

export function navigationContractSha256(contract) {
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    throw navigationContractError();
  }
  return sourceBodySha256(JSON.stringify(contract));
}

function canonicalArtifactPath(artifactRoot, relativePath) {
  if (
    typeof relativePath !== 'string' ||
    relativePath.length === 0 ||
    relativePath.length > 512 ||
    !/^(?!\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*[\\:*?"<>|\u0000-\u001f]).+\.png$/i.test(
      relativePath,
    )
  ) {
    throw manualEffectEvidenceError();
  }
  const root = realpathSync(artifactRoot);
  const candidate = realpathSync(path.resolve(root, ...relativePath.split('/')));
  const relative = path.relative(root, candidate);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw manualEffectEvidenceError();
  }
  const stats = statSync(candidate);
  if (
    !stats.isFile() ||
    stats.size < PNG_SIGNATURE.length ||
    stats.size > MANUAL_EFFECT_MAX_ARTIFACT_BYTES
  ) {
    throw manualEffectEvidenceError();
  }
  return { path: candidate, bytes: stats.size };
}

function manualEffectPngPixels(artifact, remainingPixels) {
  if (
    artifact.length < 33 ||
    !artifact.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) ||
    artifact.readUInt32BE(8) !== 13 ||
    artifact.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    return null;
  }
  const width = artifact.readUInt32BE(16);
  const height = artifact.readUInt32BE(20);
  const pixels = width * height;
  if (
    width < 1 ||
    height < 1 ||
    pixels > MANUAL_EFFECT_MAX_ARTIFACT_PIXELS ||
    pixels > remainingPixels
  ) {
    return null;
  }
  try {
    const decoded = PNG.sync.read(artifact);
    if (decoded.width !== width || decoded.height !== height) return null;
    const dimensions = Buffer.allocUnsafe(8);
    dimensions.writeUInt32BE(width, 0);
    dimensions.writeUInt32BE(height, 4);
    return {
      pixels,
      pixelSha256: createHash('sha256')
        .update(dimensions)
        .update(decoded.data)
        .digest('hex'),
    };
  } catch {
    return null;
  }
}

function validateManualEffectEvidenceInternal(manifest, context) {
  assertManualEffectKeys(manifest, new Set(['schemaVersion', 'exportSha256', 'screens']));
  if (
    manifest.schemaVersion !== 1 ||
    !SHA256_PATTERN.test(manifest.exportSha256 ?? '') ||
    manifest.exportSha256 !== context?.exportSha256 ||
    !Array.isArray(manifest.screens) ||
    manifest.screens.length === 0 ||
    manifest.screens.length > MANUAL_EFFECT_MAX_SCREENS ||
    !Number.isFinite(context?.exportedAt) ||
    !Number.isFinite(context?.now)
  ) {
    throw manualEffectEvidenceError();
  }
  const targetIds = new Set(context.targetIds);
  const seenScreens = new Set();
  const output = new Map();
  const artifactDigests = new Set();
  const artifactPixelDigests = new Set();
  let totalItems = 0;
  let totalArtifactBytes = 0;
  let totalArtifactPixels = 0;
  for (const screen of manifest.screens) {
    assertManualEffectKeys(screen, new Set(['screen', 'contractSha256', 'items']));
    if (
      typeof screen.screen !== 'string' ||
      !SCREEN_ID_PATTERN.test(screen.screen) ||
      !targetIds.has(screen.screen) ||
      seenScreens.has(screen.screen) ||
      !SHA256_PATTERN.test(screen.contractSha256 ?? '') ||
      !Array.isArray(screen.items) ||
      screen.items.length === 0 ||
      screen.items.length > MANUAL_EFFECT_MAX_ITEMS
    ) {
      throw manualEffectEvidenceError();
    }
    totalItems += screen.items.length;
    if (totalItems > MANUAL_EFFECT_MAX_TOTAL_ITEMS) throw manualEffectEvidenceError();
    seenScreens.add(screen.screen);
    const contract = context.contracts?.[screen.screen];
    if (!contract || screen.contractSha256 !== navigationContractSha256(contract)) {
      throw manualEffectEvidenceError();
    }
    const unsafeByDeclaration = new Map(
      contract.items
        .filter((item) => item.safe === false && item.effect)
        .map((item) => [`${item.label}\u0000${item.occurrence}`, item]),
    );
    const seenItems = new Set();
    const validatedItems = [];
    for (const item of screen.items) {
      assertManualEffectKeys(
        item,
        new Set(['label', 'occurrence', 'effect', 'artifact', 'attestation']),
      );
      const label = exactNavigationText(item.label);
      const occurrence = normalizeNavigationOccurrence(item.occurrence);
      const declarationKey = `${label}\u0000${occurrence}`;
      const expected = unsafeByDeclaration.get(declarationKey);
      if (!expected || seenItems.has(declarationKey)) throw manualEffectEvidenceError();
      seenItems.add(declarationKey);
      const observedEffect = normalizeNavigationEffect(item.effect, label);
      if (JSON.stringify(observedEffect) !== JSON.stringify(expected.effect)) {
        throw manualEffectEvidenceError();
      }
      assertManualEffectKeys(item.artifact, new Set(['path', 'sha256']));
      if (!SHA256_PATTERN.test(item.artifact.sha256 ?? '')) {
        throw manualEffectEvidenceError();
      }
      const artifactFile = canonicalArtifactPath(context.artifactRoot, item.artifact.path);
      totalArtifactBytes += artifactFile.bytes;
      if (totalArtifactBytes > MANUAL_EFFECT_MAX_TOTAL_ARTIFACT_BYTES) {
        throw manualEffectEvidenceError();
      }
      const artifact = readFileSync(artifactFile.path);
      const decodedArtifact = manualEffectPngPixels(
        artifact,
        MANUAL_EFFECT_MAX_TOTAL_ARTIFACT_PIXELS - totalArtifactPixels,
      );
      if (
        decodedArtifact === null ||
        sourceBodySha256(artifact) !== item.artifact.sha256 ||
        artifactDigests.has(item.artifact.sha256) ||
        artifactPixelDigests.has(decodedArtifact.pixelSha256)
      ) {
        throw manualEffectEvidenceError();
      }
      totalArtifactPixels += decodedArtifact.pixels;
      artifactDigests.add(item.artifact.sha256);
      artifactPixelDigests.add(decodedArtifact.pixelSha256);
      assertManualEffectKeys(item.attestation, new Set(['type', 'observedAt']));
      const observedAt = Date.parse(item.attestation.observedAt ?? '');
      if (
        item.attestation.type !== 'human-observed-effect' ||
        !Number.isFinite(observedAt) ||
        new Date(observedAt).toISOString() !== item.attestation.observedAt ||
        observedAt < context.exportedAt ||
        observedAt > context.now ||
        context.now - observedAt > CAPTURE_RECEIPT_MAX_AGE_MS
      ) {
        throw manualEffectEvidenceError();
      }
      validatedItems.push(
        Object.freeze({
          label,
          occurrence,
          effect: Object.freeze({ ...expected.effect }),
          artifactSha256: item.artifact.sha256,
          observedAt: new Date(observedAt).toISOString(),
        }),
      );
    }
    const evidence = Object.freeze(validatedItems);
    VALIDATED_MANUAL_EFFECT_EVIDENCE.set(evidence, screen.contractSha256);
    output.set(screen.screen, evidence);
  }
  return output;
}

export function validateManualEffectEvidence(manifest, context) {
  try {
    return validateManualEffectEvidenceInternal(manifest, context);
  } catch {
    throw manualEffectEvidenceError();
  }
}

export function loadManualEffectEvidence(env = {}, context) {
  if (env.MANUAL_EFFECT_EVIDENCE === undefined) return new Map();
  if (
    typeof env.MANUAL_EFFECT_EVIDENCE !== 'string' ||
    env.MANUAL_EFFECT_EVIDENCE.trim().length === 0
  ) {
    throw manualEffectEvidenceError();
  }
  try {
    const manifestPath = realpathSync(path.resolve(env.MANUAL_EFFECT_EVIDENCE));
    const manifestStats = statSync(manifestPath);
    if (
      !manifestStats.isFile() ||
      manifestStats.size === 0 ||
      manifestStats.size > MANUAL_EFFECT_MAX_MANIFEST_BYTES
    ) {
      throw manualEffectEvidenceError();
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return validateManualEffectEvidence(manifest, {
      ...context,
      artifactRoot: path.dirname(manifestPath),
    });
  } catch {
    throw manualEffectEvidenceError();
  }
}

export function scoreExactNavigationResults(
  contract,
  results,
  exempted = [],
  manualEvidence = null,
) {
  const validatedContractSha256 =
    manualEvidence === null ? null : VALIDATED_MANUAL_EFFECT_EVIDENCE.get(manualEvidence);
  if (
    manualEvidence !== null &&
    (!Array.isArray(manualEvidence) ||
      validatedContractSha256 === undefined ||
      validatedContractSha256 !== navigationContractSha256(contract))
  ) {
    throw manualEffectEvidenceError();
  }
  const entries = [
    ...contract.items.map((item, index) => ({ type: 'item', index, item })),
    ...contract.unresolved.map((item) => ({ type: 'unresolved', item })),
  ];
  if (entries.length === 0) {
    return {
      score: null,
      max: WEIGHTS.D,
      measurable: false,
      ratio: null,
      matched: 0,
      declared: 0,
      measured: 0,
      exempted: 0,
      requiresManualReview: false,
      manualReviewReasons: [],
      evidence: { exactRoutes: 0, exactActions: 0, unsafeActions: 0, unresolved: 0 },
      missing: [],
    };
  }
  const pendingExemptions = new Map();
  for (const label of exempted) {
    const key = tight(label);
    if (key) pendingExemptions.set(key, (pendingExemptions.get(key) ?? 0) + 1);
  }
  const scoredEntries = [];
  let exemptedCount = 0;
  for (const entry of entries) {
    const key = tight(entry.item.label);
    const remaining = pendingExemptions.get(key) ?? 0;
    if (remaining > 0) {
      pendingExemptions.set(key, remaining - 1);
      exemptedCount += 1;
    } else {
      scoredEntries.push(entry);
    }
  }
  const byIndex = new Map();
  for (const result of Array.isArray(results) ? results : []) {
    if (
      !result ||
      !Number.isSafeInteger(result.index) ||
      result.index < 0 ||
      result.index >= contract.items.length ||
      byIndex.has(result.index)
    ) {
      throw navigationContractError();
    }
    byIndex.set(result.index, result);
  }
  let matched = 0;
  let measured = 0;
  let exactRoutes = 0;
  let exactActions = 0;
  let postEffects = 0;
  let unsafeActions = 0;
  let manualEffects = 0;
  let unresolved = 0;
  const failures = {};
  const missing = [];
  const manualByDeclaration = new Map(
    (manualEvidence ?? []).map((item) => [`${item.label}\u0000${item.occurrence}`, item]),
  );
  const usedManualDeclarations = new Set();
  const manualArtifactSha256 = [];
  for (const entry of scoredEntries) {
    if (entry.type === 'unresolved') {
      unresolved += 1;
      missing.push(entry.item.label);
      continue;
    }
    if (entry.item.safe === false) {
      unsafeActions += 1;
      const declarationKey = `${entry.item.label}\u0000${entry.item.occurrence}`;
      const manual = manualByDeclaration.get(declarationKey);
      if (
        manual &&
        entry.item.effect &&
        JSON.stringify(manual.effect) === JSON.stringify(entry.item.effect)
      ) {
        matched += 1;
        measured += 1;
        manualEffects += 1;
        usedManualDeclarations.add(declarationKey);
        manualArtifactSha256.push(manual.artifactSha256);
      } else {
        missing.push(entry.item.label);
      }
      continue;
    }
    measured += 1;
    const result = byIndex.get(entry.index);
    const expectedEvidence =
      entry.item.kind === 'route'
        ? entry.item.postNavigation
          ? `exact-route+${entry.item.postNavigation.effect.type}-effect`
          : 'exact-route'
        : `${entry.item.effect.type}-effect`;
    if (result?.passed === true && result.evidence === expectedEvidence) {
      matched += 1;
      if (entry.item.kind === 'route') {
        exactRoutes += 1;
        if (entry.item.postNavigation) postEffects += 1;
      } else exactActions += 1;
    } else {
      missing.push(entry.item.label);
      const code = NAVIGATION_FAILURE_CODES.has(result?.failure) ? result.failure : 'probe-failed';
      failures[code] = (failures[code] ?? 0) + 1;
    }
  }
  if (usedManualDeclarations.size !== manualByDeclaration.size) {
    throw manualEffectEvidenceError();
  }
  const denominator = scoredEntries.length;
  const ratio = denominator > 0 ? matched / denominator : 1;
  const itemDeviationReview = requiresItemDeviationReview(entries.length, exemptedCount);
  const manualReviewReasons = [
    ...(itemDeviationReview ? ['item-deviations-exceed-half'] : []),
    ...(unsafeActions > manualEffects ? ['unsafe-actions'] : []),
    ...(manualEffects > 0 ? ['manual-effect-evidence'] : []),
    ...(unresolved > 0 ? ['unresolved-items'] : []),
  ];
  const manualEvidenceComplete =
    manualEffects > 0 &&
    manualEffects === unsafeActions &&
    !itemDeviationReview &&
    unresolved === 0;
  return {
    score: ratio * WEIGHTS.D,
    max: WEIGHTS.D,
    measurable: true,
    ratio,
    matched,
    declared: entries.length,
    measured,
    exempted: exemptedCount,
    requiresManualReview: manualReviewReasons.length > 0,
    manualReviewReasons,
    manualEvidenceComplete,
    evidence: {
      exactRoutes,
      exactActions,
      ...(postEffects > 0 ? { postEffects } : {}),
      unsafeActions,
      ...(manualEffects > 0
        ? { manualEffects, manualArtifactSha256: manualArtifactSha256.sort() }
        : {}),
      unresolved,
      ...(Object.keys(failures).length > 0 ? { failures } : {}),
    },
    missing,
  };
}

export async function runExactNavigationChecks(contract, probeItem) {
  if (typeof probeItem !== 'function') throw navigationContractError();
  const results = [];
  for (let index = 0; index < contract.items.length; index += 1) {
    const item = contract.items[index];
    if (item.safe === false) continue;
    try {
      const result = await probeItem(item, index);
      results.push({
        index,
        passed: result?.passed === true,
        evidence: typeof result?.evidence === 'string' ? result.evidence : null,
        ...(result?.passed === true
          ? {}
          : {
              failure: NAVIGATION_FAILURE_CODES.has(result?.failure)
                ? result.failure
                : 'probe-failed',
            }),
      });
    } catch {
      results.push({ index, passed: false, evidence: null, failure: 'probe-failed' });
    }
  }
  return results;
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

export function scoreCopyCoverage(referenceTexts, appTexts, appGroups = [], exempted = []) {
  const partition = partitionExemptedItems(referenceTexts, exempted);
  const expected = partition.scored.map(({ key }) => key);
  const rendered = [...appTexts, ...appGroups].map(tight).filter(Boolean);
  const missing = expected.filter((text) => !rendered.some((actual) => actual.includes(text)));
  const matched = expected.length - missing.length;
  const ratio = expected.length ? matched / expected.length : 1;
  return {
    matched,
    total: expected.length,
    declared: partition.declared.length,
    ratio,
    score: ratio * WEIGHTS.E,
    exempted: partition.exemptedCount,
    requiresManualReview: requiresItemDeviationReview(
      partition.declared.length,
      partition.exemptedCount,
    ),
    missing,
  };
}

/** B: count the pixels the browser actually painted, not overlapping DOM boxes. */
export function scoreTokenPixels(source, ramp) {
  const png = PNG.sync.read(source);
  let paintedPixels = 0;
  let inRampPixels = 0;
  const offRampPixels = new Map();
  for (let index = 0; index < png.data.length; index += 4) {
    if (png.data[index + 3] === 0) continue;
    paintedPixels += 1;
    const hex = `#${[png.data[index], png.data[index + 1], png.data[index + 2]]
      .map((channel) => channel.toString(16).padStart(2, '0'))
      .join('')}`;
    if (ramp?.has(hex)) inRampPixels += 1;
    else offRampPixels.set(hex, (offRampPixels.get(hex) ?? 0) + 1);
  }
  const ratio = paintedPixels > 0 ? inRampPixels / paintedPixels : 0;
  return {
    score: ratio * WEIGHTS.B,
    ratio,
    paintedPixels,
    inRampPixels,
    offTop: [...offRampPixels.entries()]
      .map(([hex, pixels]) => ({ hex, pixels }))
      .sort((left, right) => right.pixels - left.pixels)
      .slice(0, 5),
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
    if (depth >= 1 && depth <= 3 && width >= rootWidth * 0.5 && height >= 24) {
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
  const expectedMoved =
    expected.textAnchor &&
    actual.some(
      (section) =>
        section.shapeSignature === expected.shapeSignature &&
        section.textAnchor === expected.textAnchor,
    );
  const observedMoved =
    observed.textAnchor &&
    reference.some(
      (section) =>
        section.shapeSignature === observed.shapeSignature &&
        section.textAnchor === observed.textAnchor,
    );
  return !expectedMoved && !observedMoved;
}

function orderedSectionMatchCount(reference, actual) {
  const rows = Array.from({ length: reference.length + 1 }, () => Array(actual.length + 1).fill(0));
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
  return rows.some(
    (row) => row?.error || (row?.automaticPass !== true && row?.reviewedPass !== true),
  )
    ? 1
    : 0;
}

export function inspectRenderedPixelRules(
  elements = document.querySelectorAll('*'),
  styleFor = getComputedStyle,
  viewport = typeof window === 'undefined'
    ? null
    : { width: window.innerWidth, height: window.innerHeight },
) {
  const curves = ['circle', 'ellipse', 'path', 'polyline', 'polygon'];
  const translucent = (value) => /rgba?\([^)]*?,\s*0?\.\d+\s*\)/.test(value || '');
  const filterOpacity = (value) => {
    let product = 1;
    for (const match of String(value || '').matchAll(
      /opacity\(\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*(%)?\s*\)/gi,
    )) {
      const parsed = Number(match[1]);
      if (!Number.isFinite(parsed)) continue;
      product *= Math.min(1, Math.max(0, match[2] ? parsed / 100 : parsed));
    }
    return product;
  };
  const insetClip = (value, rect) => {
    const match = /^inset\(([^)]*)\)$/i.exec(String(value || '').trim());
    if (!match || !rect) return null;
    const raw = match[1]
      .split(/\s+round\s+/i)[0]
      .trim()
      .split(/\s+/);
    if (raw.length < 1 || raw.length > 4) return null;
    const parsed = raw.map((part) => {
      const token = /^([+-]?(?:\d+\.?\d*|\.\d+))(px|%)?$/.exec(part);
      return token ? { value: Number(token[1]), percent: token[2] === '%' } : null;
    });
    if (parsed.some((part) => !part || !Number.isFinite(part.value))) return null;
    const expanded =
      parsed.length === 1
        ? [parsed[0], parsed[0], parsed[0], parsed[0]]
        : parsed.length === 2
          ? [parsed[0], parsed[1], parsed[0], parsed[1]]
          : parsed.length === 3
            ? [parsed[0], parsed[1], parsed[2], parsed[1]]
            : parsed;
    const pixels = (part, size) => (part.percent ? (part.value / 100) * size : part.value);
    return {
      top: rect.top + pixels(expanded[0], rect.height),
      right: rect.right - pixels(expanded[1], rect.width),
      bottom: rect.bottom - pixels(expanded[2], rect.height),
      left: rect.left + pixels(expanded[3], rect.width),
    };
  };
  const legacyClip = (value, rect) => {
    const match = /^rect\(([^)]*)\)$/i.exec(String(value || '').trim());
    if (!match || !rect) return null;
    const parts = match[1]
      .trim()
      .split(/\s*,\s*|\s+/)
      .filter(Boolean);
    if (parts.length !== 4) return null;
    const offset = (part, fallback) => {
      if (part.toLowerCase() === 'auto') return fallback;
      const parsed = /^([+-]?(?:\d+\.?\d*|\.\d+))(?:px)?$/i.exec(part);
      return parsed ? Number(parsed[1]) : null;
    };
    const values = [
      offset(parts[0], 0),
      offset(parts[1], rect.width),
      offset(parts[2], rect.height),
      offset(parts[3], 0),
    ];
    if (values.some((part) => part === null || !Number.isFinite(part))) return null;
    return {
      top: rect.top + values[0],
      right: rect.left + values[1],
      bottom: rect.top + values[2],
      left: rect.left + values[3],
    };
  };
  const transparentPaint = (value) => {
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    return (
      normalized === 'transparent' ||
      normalized === 'none' ||
      /^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(normalized) ||
      /^(?:rgb|rgba)\([^)]*\/\s*0(?:\.0+)?%?\s*\)$/.test(normalized)
    );
  };
  const parsedRgb = (value) => {
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    if (!/^rgba?\(/.test(normalized)) return null;
    const components = normalized.match(/[+-]?(?:\d+\.?\d*|\.\d+)%?/g) ?? [];
    if (components.length < 3) return null;
    const hasAlpha =
      normalized.includes('/') || (normalized.startsWith('rgba(') && components.length > 3);
    let alpha = 1;
    if (hasAlpha) {
      const token = components[3] ?? '1';
      alpha = token.endsWith('%') ? Number(token.slice(0, -1)) / 100 : Number(token);
      if (!Number.isFinite(alpha)) return null;
    }
    return {
      alpha,
      rgb: components
        .slice(0, 3)
        .map((token) => {
          const channel = token.endsWith('%')
            ? (Number(token.slice(0, -1)) / 100) * 255
            : Number(token);
          return Math.round(channel);
        })
        .join(','),
    };
  };
  const result = {
    curves: 0,
    rounds: 0,
    blurs: 0,
    alphas: 0,
    texts: [],
    groups: [],
    interactive: [],
  };
  const renderedVisibility = (element, subjectRect = null, clipOwnOverflow = false) => {
    const rect = subjectRect ?? element.getBoundingClientRect?.();
    if (rect && (rect.width < 1 || rect.height < 1)) {
      return { pixel: false, content: false };
    }
    let left = rect ? Math.max(0, rect.left) : 0;
    let top = rect ? Math.max(0, rect.top) : 0;
    let right = rect ? Math.min(viewport?.width ?? Number.POSITIVE_INFINITY, rect.right) : 1;
    let bottom = rect ? Math.min(viewport?.height ?? Number.POSITIVE_INFINITY, rect.bottom) : 1;
    let cumulativeOpacity = 1;
    let supportedContentPaint = true;
    for (let current = element; current; current = current.parentElement) {
      const style = styleFor(current);
      const opacity = Number(style.opacity);
      if (
        current.hidden === true ||
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse' ||
        style.contentVisibility === 'hidden'
      )
        return { pixel: false, content: false };
      if (Number.isFinite(opacity)) {
        cumulativeOpacity *= Math.min(1, Math.max(0, opacity));
      }
      cumulativeOpacity *= filterOpacity(style.filter);
      if (cumulativeOpacity <= 0) return { pixel: false, content: false };
      if (rect) {
        const ancestorRect = current.getBoundingClientRect?.();
        if (ancestorRect) {
          const clipValue = String(style.clipPath || style.webkitClipPath || 'none').trim();
          if (clipValue !== 'none') {
            const clip = insetClip(clipValue, ancestorRect);
            if (!clip) supportedContentPaint = false;
            else {
              left = Math.max(left, clip.left);
              right = Math.min(right, clip.right);
              top = Math.max(top, clip.top);
              bottom = Math.min(bottom, clip.bottom);
            }
          }
          const legacyClipValue = String(style.clip || 'auto').trim();
          if (legacyClipValue !== 'auto') {
            const clip = legacyClip(legacyClipValue, ancestorRect);
            if (!clip) supportedContentPaint = false;
            else {
              left = Math.max(left, clip.left);
              right = Math.min(right, clip.right);
              top = Math.max(top, clip.top);
              bottom = Math.min(bottom, clip.bottom);
            }
          }
          const maskValue = String(style.maskImage || style.webkitMaskImage || 'none').trim();
          if (maskValue !== 'none') supportedContentPaint = false;
          if (current !== element || clipOwnOverflow) {
            const overflowX = style.overflowX || style.overflow;
            const overflowY = style.overflowY || style.overflow;
            if (['auto', 'clip', 'hidden', 'scroll'].includes(overflowX)) {
              left = Math.max(left, ancestorRect.left);
              right = Math.min(right, ancestorRect.right);
            }
            if (['auto', 'clip', 'hidden', 'scroll'].includes(overflowY)) {
              top = Math.max(top, ancestorRect.top);
              bottom = Math.min(bottom, ancestorRect.bottom);
            }
          }
        }
      }
      if (right - left < 1 || bottom - top < 1) {
        return { pixel: false, content: false };
      }
    }
    if (!rect) return { pixel: true, content: true };
    const visibleWidth = right - left;
    const visibleHeight = bottom - top;
    const visibleRatio = (visibleWidth * visibleHeight) / (rect.width * rect.height);
    const tag = element.tagName?.toLowerCase?.();
    const pixel = visibleWidth >= 2 && visibleHeight >= 2;
    return {
      pixel,
      content:
        pixel &&
        cumulativeOpacity >= 0.1 &&
        supportedContentPaint &&
        (tag === 'html' || tag === 'body' || visibleRatio >= 0.1),
    };
  };
  const readableTextPaint = (element) => {
    const style = styleFor(element);
    const tag = element.tagName?.toLowerCase?.();
    let paint = ['text', 'tspan'].includes(tag)
      ? style.fill
      : style.webkitTextFillColor || style.color || style.fill;
    let channelOpacity = 1;
    if (['text', 'tspan'].includes(tag)) {
      channelOpacity = Number(style.fillOpacity);
      if (transparentPaint(paint) && !transparentPaint(style.stroke)) {
        paint = style.stroke;
        channelOpacity = Number(style.strokeOpacity);
      }
    }
    if (transparentPaint(paint)) return false;
    const foreground = parsedRgb(paint);
    if (
      (foreground && foreground.alpha < 0.1) ||
      (Number.isFinite(channelOpacity) && channelOpacity < 0.1)
    )
      return false;
    if (!foreground || (style.textShadow && style.textShadow !== 'none')) return true;
    for (let current = element; current; current = current.parentElement) {
      const currentStyle = current === element ? style : styleFor(current);
      const backgroundPaint = currentStyle.backgroundColor;
      if (transparentPaint(backgroundPaint)) continue;
      const background = parsedRgb(backgroundPaint);
      return !background || background.alpha < 1 || background.rgb !== foreground.rgb;
    }
    return true;
  };
  const textNodeRects = (node, fallbackRect) => {
    if (typeof node?.getClientRects === 'function') return [...node.getClientRects()];
    if (typeof document !== 'undefined' && typeof document.createRange === 'function') {
      const range = document.createRange();
      try {
        range.selectNodeContents(node);
        return [...range.getClientRects()];
      } finally {
        range.detach?.();
      }
    }
    return fallbackRect ? [fallbackRect] : [];
  };
  const directVisibleText = (element) => {
    if (!readableTextPaint(element)) return '';
    const fallbackRect = element.getBoundingClientRect?.();
    return [...(element.childNodes ?? [])]
      .filter((node) => node.nodeType === 3 && node.textContent?.trim())
      .filter((node) =>
        textNodeRects(node, fallbackRect).some(
          (rect) => renderedVisibility(element, rect, true).content,
        ),
      )
      .map((node) => node.textContent || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  };
  const visibleText = (element, depth = 0) => {
    if (depth > 24) return '';
    const direct = directVisibleText(element);
    const descendants = [...element.children].map((child) => visibleText(child, depth + 1));
    return [direct, ...descendants].join(' ').replace(/\s+/g, ' ').trim();
  };
  const descendantCount = (element, limit = 9) => {
    let count = 0;
    const visit = (current) => {
      for (const child of current?.children ?? []) {
        count += 1;
        if (count >= limit) return;
        visit(child);
        if (count >= limit) return;
      }
    };
    visit(element);
    return count;
  };
  for (const element of elements) {
    const style = styleFor(element);
    const visibility = renderedVisibility(element);
    if (!visibility.pixel) continue;
    const tag = element.tagName.toLowerCase();
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
    const hasPositiveBlur = (value) =>
      [...String(value || '').matchAll(/blur\(\s*([\d.]+)(?:px)?\s*\)/g)].some(
        (match) => Number(match[1]) > 0,
      );
    if (
      hasPositiveBlur(style.filter) ||
      hasPositiveBlur(style.backdropFilter) ||
      hasPositiveBlur(style.webkitBackdropFilter)
    )
      result.blurs += 1;
    if (style.boxShadow && style.boxShadow !== 'none') {
      const lengths = (style.boxShadow.match(/(-?[\d.]+)px/g) || []).map(Number.parseFloat);
      if (lengths.length >= 3 && Math.abs(lengths[2]) > 0.5) result.blurs += 1;
    }
    const opacity = Number(style.opacity);
    let alpha = opacity > 0 && opacity < 1;
    if (!alpha) {
      const filteredOpacity = filterOpacity(style.filter);
      alpha = filteredOpacity > 0 && filteredOpacity < 1;
    }
    if (!alpha) {
      alpha = ['fillOpacity', 'strokeOpacity'].some(
        (property) => Number(style[property]) > 0 && Number(style[property]) < 1,
      );
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

    if (!visibility.content) continue;
    const ignoredCopyTag = /^(STYLE|SCRIPT|NOSCRIPT|TEMPLATE|TITLE)$/.test(element.tagName);
    const directText = ignoredCopyTag ? '' : directVisibleText(element);
    if (!ignoredCopyTag && element.children.length === 0 && directText) {
      result.texts.push(directText);
    }
    if (!ignoredCopyTag) {
      const descendants = descendantCount(element);
      if (descendants >= 1 && descendants <= 8) {
        const group = visibleText(element);
        if (group && group.length <= 60) result.groups.push(group);
      }
    }
    if (element.matches('a[href], button, [role="button"], [role="link"]')) {
      const label = visibleText(element);
      result.interactive.push({ label, to: element.getAttribute('href') });
    }
  }
  return result;
}

const TOKEN_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const DERIVED_RAMP_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DERIVED_RAMP_MAX_RECIPES = 32;
const DERIVED_RAMP_MAX_SOURCES = 32;
const DERIVED_RAMP_MAX_LAYERS = 4;
const DERIVED_RAMP_MAX_COMBINATIONS = 8192;

function tokenRampError() {
  return new Error('invalid token ramp contract');
}

function assertTokenRampKeys(value, allowed) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.has(key))
  ) {
    throw tokenRampError();
  }
}

function resolveRampColor(reference, sources, usedSources) {
  if (
    typeof reference !== 'string' ||
    !DERIVED_RAMP_NAME_PATTERN.test(reference) ||
    !Object.hasOwn(sources, reference)
  ) {
    throw tokenRampError();
  }
  usedSources.add(reference);
  return sources[reference].toLowerCase();
}

function finiteAlpha(value) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw tokenRampError();
  return value;
}

function compositeSrgb(background, foreground, alpha) {
  const channels = (hex) =>
    [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  const bg = channels(background);
  const fg = channels(foreground);
  return `#${bg
    .map((channel, index) => Math.round(channel * (1 - alpha) + fg[index] * alpha))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

function alphaByteSamples(value) {
  assertTokenRampKeys(value, new Set(['min', 'max']));
  const min = finiteAlpha(value.min);
  const max = finiteAlpha(value.max);
  if (min > max) throw tokenRampError();
  const first = Math.round(min * 255);
  const last = Math.round(max * 255);
  return Array.from({ length: last - first + 1 }, (_, index) => (first + index) / 255);
}

function addDerivedRamp(output, derivedRamp, screenId, knownScreenIds) {
  assertTokenRampKeys(derivedRamp, new Set(['sources', 'recipes']));
  const sources = derivedRamp.sources;
  const recipes = derivedRamp.recipes;
  if (
    !sources ||
    typeof sources !== 'object' ||
    Array.isArray(sources) ||
    Object.keys(sources).length === 0 ||
    Object.keys(sources).length > DERIVED_RAMP_MAX_SOURCES ||
    Object.entries(sources).some(
      ([name, color]) =>
        !DERIVED_RAMP_NAME_PATTERN.test(name) ||
        name.length > 64 ||
        !TOKEN_COLOR_PATTERN.test(color),
    ) ||
    !recipes ||
    typeof recipes !== 'object' ||
    Array.isArray(recipes) ||
    Object.keys(recipes).length === 0 ||
    Object.keys(recipes).length > DERIVED_RAMP_MAX_RECIPES
  ) {
    throw tokenRampError();
  }
  const usedSources = new Set();
  for (const [name, recipe] of Object.entries(recipes)) {
    if (!DERIVED_RAMP_NAME_PATTERN.test(name) || name.length > 64) throw tokenRampError();
    const scopedScreen = recipe?.screen;
    if (
      scopedScreen !== undefined &&
      (typeof scopedScreen !== 'string' ||
        !SCREEN_ID_PATTERN.test(scopedScreen) ||
        typeof screenId !== 'string' ||
        !knownScreenIds?.has(scopedScreen))
    ) {
      throw tokenRampError();
    }
    const included = scopedScreen === undefined || scopedScreen === screenId;
    if (recipe?.type === 'composite') {
      assertTokenRampKeys(
        recipe,
        new Set(['type', 'screen', 'background', 'foreground', 'alpha']),
      );
      const background = resolveRampColor(recipe.background, sources, usedSources);
      const foreground = resolveRampColor(recipe.foreground, sources, usedSources);
      const color = compositeSrgb(background, foreground, finiteAlpha(recipe.alpha));
      if (included) output.add(color);
      continue;
    }
    if (recipe?.type !== 'stacked-alpha') throw tokenRampError();
    assertTokenRampKeys(recipe, new Set(['type', 'screen', 'background', 'layers']));
    if (
      !Array.isArray(recipe.layers) ||
      recipe.layers.length === 0 ||
      recipe.layers.length > DERIVED_RAMP_MAX_LAYERS
    ) {
      throw tokenRampError();
    }
    const background = resolveRampColor(recipe.background, sources, usedSources);
    const layers = recipe.layers.map((layer) => {
      assertTokenRampKeys(layer, new Set(['color', 'alpha']));
      return {
        color: resolveRampColor(layer.color, sources, usedSources),
        alphas: alphaByteSamples(layer.alpha),
      };
    });
    const combinations = layers.reduce((count, layer) => count * layer.alphas.length, 1);
    if (!Number.isSafeInteger(combinations) || combinations > DERIVED_RAMP_MAX_COMBINATIONS) {
      throw tokenRampError();
    }
    const visit = (index, color) => {
      if (index === layers.length) {
        output.add(color);
        return;
      }
      const layer = layers[index];
      for (const alpha of layer.alphas) {
        visit(index + 1, compositeSrgb(color, layer.color, alpha));
      }
    };
    if (included) visit(0, background);
  }
  if (usedSources.size !== Object.keys(sources).length) throw tokenRampError();
}

export function tokenRamp(tokens, screenId = null, knownScreens = null) {
  const knownScreenIds =
    knownScreens === null
      ? null
      : Array.isArray(knownScreens) &&
          knownScreens.length > 0 &&
          knownScreens.every((id) => typeof id === 'string' && SCREEN_ID_PATTERN.test(id)) &&
          new Set(knownScreens).size === knownScreens.length
        ? new Set(knownScreens)
        : null;
  if (
    (screenId !== null && (typeof screenId !== 'string' || !SCREEN_ID_PATTERN.test(screenId))) ||
    (knownScreens !== null &&
      (!knownScreenIds || typeof screenId !== 'string' || !knownScreenIds.has(screenId)))
  ) {
    throw tokenRampError();
  }
  const output = new Set();
  const walk = (value) => {
    for (const [key, child] of Object.entries(value || {})) {
      if (key === 'derivedRamp') continue;
      if (child && typeof child === 'object') walk(child);
      else if (typeof child === 'string' && TOKEN_COLOR_PATTERN.test(child)) {
        output.add(child.toLowerCase());
      }
    }
  };
  walk(tokens);
  if (tokens?.derivedRamp !== undefined) {
    addDerivedRamp(output, tokens.derivedRamp, screenId, knownScreenIds);
  }
  return output;
}

export function exemptItems(screen, axis, deviations) {
  const output = [];
  for (const entry of deviations?.deviations ?? []) {
    if (entry?.screen !== screen || entry?.axis !== axis) continue;
    if (typeof entry?.why !== 'string' || entry.why.trim().length === 0) continue;
    if (Array.isArray(entry.items) && entry.items.length > 0) output.push(...entry.items);
  }
  return output.map(norm).filter(Boolean);
}

export function exempt(screen, axis, deviations) {
  return (deviations?.deviations ?? []).some(
    (entry) =>
      entry?.screen === screen &&
      entry?.axis === axis &&
      typeof entry?.why === 'string' &&
      entry.why.trim().length > 0 &&
      !(Array.isArray(entry.items) && entry.items.length > 0),
  );
}

export function renormalizeScores(raw) {
  const measured = Object.entries(raw).filter(([, value]) => value !== null);
  const unmeasured = Object.entries(raw)
    .filter(([, value]) => value === null)
    .map(([axis]) => axis);
  const gotSum = measured.reduce((sum, [, value]) => sum + value, 0);
  const maxSum = measured.reduce((sum, [axis]) => sum + WEIGHTS[axis], 0);
  return {
    scores: Object.fromEntries(
      Object.entries(raw).map(([axis, value]) => [axis, value === null ? null : round1(value)]),
    ),
    total: maxSum > 0 ? round1((gotSum / maxSum) * 100) : null,
    unmeasured,
  };
}

export function isAutomaticPass(total, unmeasured, manualReviewAxes = []) {
  return (
    total !== null &&
    total >= 98 &&
    unmeasured.every((axis) => axis === 'C') &&
    manualReviewAxes.length === 0
  );
}

export function reviewedNavigationAxes(screen, deviations, navigation) {
  return navigation?.manualEvidenceComplete === true && !exempt(screen, 'D', deviations)
    ? ['D']
    : [];
}

export function isReviewedPass(total, unmeasured, manualReviewAxes = [], reviewedManualAxes = []) {
  const reviewed = new Set(reviewedManualAxes);
  return (
    total !== null &&
    total >= 98 &&
    manualReviewAxes.length > 0 &&
    reviewed.size === manualReviewAxes.length &&
    unmeasured.every((axis) => axis === 'C') &&
    manualReviewAxes.every((axis) => reviewed.has(axis))
  );
}

const CAPTURE_OVERLAY_LABELS = [
  '다시 보지 않기',
  '건너뛰기',
  '알겠습니다',
  '오늘은 그만 보겠습니다',
];
const CAPTURE_OVERLAY_MAX_PASSES = 3;
const CAPTURE_OVERLAY_CLICK_TIMEOUT_MS = 500;
const CAPTURE_OVERLAY_RECHECK_MS = 400;
const CAPTURE_OVERLAY_DISMISS_SETTLE_MS = 800;
const CAPTURE_OVERLAY_SCOPE_SELECTOR =
  '[aria-modal="true"], [role="dialog"], [accessibilityviewismodal="true"], [data-capture-overlay="true"]';

async function clickFirstOverlayCandidate(candidate) {
  if (!candidate) return false;
  try {
    if ((await candidate.count()) === 0) return false;
    await candidate.first().click({ timeout: CAPTURE_OVERLAY_CLICK_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

function allowlistedTextAction(scope, label) {
  const textMatch = scope.getByText(label, { exact: true });
  if (typeof textMatch.locator !== 'function') return null;
  return textMatch.locator(
    'xpath=ancestor-or-self::*[self::button or @role="button" or (@tabindex and @tabindex != "-1")][1]',
  );
}

async function visibleLocatorAt(locator, occurrence = 1) {
  const count = Math.min(await locator.count(), 50);
  let visible = 0;
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (!(await candidate.isVisible().catch(() => false))) continue;
    visible += 1;
    if (visible === occurrence) return candidate;
  }
  return null;
}

function parseScreenshotPaint(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!/^rgba?\(/.test(normalized)) return null;
  const tokens = normalized.match(/[+-]?(?:\d+\.?\d*|\.\d+)%?/g) ?? [];
  if (tokens.length < 3) return null;
  const channels = tokens.slice(0, 3).map((token) => {
    const parsed = Number.parseFloat(token);
    return token.endsWith('%') ? (parsed / 100) * 255 : parsed;
  });
  if (channels.some((channel) => !Number.isFinite(channel))) return null;
  const alphaToken = tokens[3];
  const parsedAlpha = alphaToken === undefined ? 1 : Number.parseFloat(alphaToken);
  if (!Number.isFinite(parsedAlpha)) return null;
  return {
    alpha: Math.min(1, Math.max(0, alphaToken?.endsWith('%') ? parsedAlpha / 100 : parsedAlpha)),
    channels: channels.map((channel) => Math.min(255, Math.max(0, channel))),
  };
}

function blendScreenshotPaint(foreground, background) {
  return foreground.channels.map(
    (channel, index) => channel * foreground.alpha + background[index] * (1 - foreground.alpha),
  );
}

function screenshotLuminance(channels) {
  const linear = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function screenshotContrast(first, second) {
  const firstLuminance = screenshotLuminance(first);
  const secondLuminance = screenshotLuminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

function sanitizedFontAlias(value) {
  let alias = String(value ?? '').trim();
  if (
    alias.length >= 2 &&
    ((alias.startsWith('"') && alias.endsWith('"')) ||
      (alias.startsWith("'") && alias.endsWith("'")))
  ) {
    alias = alias.slice(1, -1).trim();
  }
  return /^[\p{L}\p{N} _-]{1,80}$/u.test(alias) ? alias : null;
}

function normalizedFontFamilies(fontFamily) {
  return new Set(
    String(fontFamily ?? '')
      .split(',')
      .map(sanitizedFontAlias)
      .filter(Boolean)
      .map((family) => family.toLowerCase()),
  );
}

function verifiedSystemFontStack(fontFamily) {
  const families = normalizedFontFamilies(fontFamily);
  return (
    families.size > 0 && [...families].every((family) => WORK0_SYSTEM_FONT_FAMILIES.has(family))
  );
}

function trustedFontAsset(asset) {
  let cached = WORK0_TRUSTED_FONT_RULE_CACHE.get(asset.sha256);
  if (cached !== undefined) return cached;
  cached = null;
  try {
    const fontPath = path.join(REPO, asset.relativePath);
    const stat = statSync(fontPath);
    if (!stat.isFile() || stat.size < 1 || stat.size > WORK0_MAX_FONT_BYTES) {
      WORK0_TRUSTED_FONT_RULE_CACHE.set(asset.sha256, cached);
      return cached;
    }
    const bytes = readFileSync(fontPath);
    if (createHash('sha256').update(bytes).digest('hex') === asset.sha256) {
      cached = {
        ...asset,
        dataUrl: `data:${asset.mime};base64,${bytes.toString('base64')}`,
      };
    }
  } catch {
    cached = null;
  }
  WORK0_TRUSTED_FONT_RULE_CACHE.set(asset.sha256, cached);
  return cached;
}

function sanitizedFontDescriptor(value, kind) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (kind === 'style') {
    return /^(?:normal|italic|oblique(?: -?(?:\d+(?:\.\d+)?|\.\d+)deg)?)$/.test(normalized)
      ? normalized
      : 'normal';
  }
  if (kind === 'weight') {
    return /^(?:normal|bold|[1-9]\d{0,2}|1000)$/.test(normalized) ? normalized : '400';
  }
  return /^(?:normal|(?:\d+(?:\.\d+)?|\.\d+)%)$/.test(normalized)
    ? normalized
    : 'normal';
}

function trustedFontRule(alias, asset, descriptors = asset) {
  const trusted = trustedFontAsset(asset);
  if (!trusted) return null;
  return [
    '@font-face{',
    `font-family:${JSON.stringify(alias)};`,
    `src:url(${JSON.stringify(trusted.dataUrl)}) format(${JSON.stringify(asset.format)});`,
    `font-style:${sanitizedFontDescriptor(descriptors?.fontStyle, 'style')};`,
    `font-weight:${sanitizedFontDescriptor(descriptors?.fontWeight, 'weight')};`,
    `font-stretch:${sanitizedFontDescriptor(descriptors?.fontStretch, 'stretch')};`,
    '}',
  ].join('');
}

function trustedFontFaceRules(fontFamily) {
  const requestedFamilies = new Set(
    String(fontFamily ?? '')
      .split(',')
      .map(sanitizedFontAlias)
      .filter(Boolean),
  );
  const matches = Object.entries(WORK0_TRUSTED_FONT_ASSETS).filter(([family]) =>
    [...requestedFamilies].some((requested) => requested.toLowerCase() === family.toLowerCase()),
  );
  if (matches.length === 0) return { matched: false, rules: [], verified: true };
  const rules = [];
  for (const [family, asset] of matches) {
    const rule = trustedFontRule(family, asset);
    if (!rule) return { matched: true, rules: [], verified: false };
    rules.push(rule);
  }
  return { matched: true, rules, verified: true };
}

function normalizedObservedFontUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function fontMime(value) {
  return String(value ?? '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
}

export function attachFontResponseEvidence(page) {
  if (!page || WORK0_PAGE_FONT_RESPONSES.has(page)) {
    return WORK0_PAGE_FONT_RESPONSES.get(page) ?? null;
  }
  const observations = new Map();
  WORK0_PAGE_FONT_RESPONSES.set(page, observations);
  page.on('response', (response) => {
    let request;
    let key;
    try {
      request = response.request();
      if (request.resourceType() !== 'font') return;
      key = normalizedObservedFontUrl(response.url());
      if (!key) return;
    } catch {
      return;
    }
    const observation = (async () => {
      try {
        if (
          response.status() < 200 ||
          response.status() >= 300 ||
          request.redirectedFrom?.() ||
          !WORK0_FONT_MIMES.has(fontMime(response.headers()['content-type']))
        ) {
          return null;
        }
        const bytes = await response.body();
        if (bytes.length < 1 || bytes.length > WORK0_MAX_FONT_BYTES) return null;
        return createHash('sha256').update(bytes).digest('hex');
      } catch {
        return null;
      }
    })();
    const previous = observations.get(key) ?? [];
    previous.push(observation);
    observations.set(key, previous);
  });
  return observations;
}

function parsedFontSourceUrls(source) {
  if (typeof source !== 'string' || source.length < 1 || source.length > WORK0_MAX_FONT_SOURCE_CHARS) {
    return null;
  }
  if (/\blocal\s*\(/i.test(source)) return null;
  const urls = [];
  let malformed = false;
  let remainder = source.replace(
    /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi,
    (_match, doubleQuoted, singleQuoted, unquoted) => {
      const value = String(doubleQuoted ?? singleQuoted ?? unquoted ?? '').trim();
      if (!value) malformed = true;
      else urls.push(value);
      return '';
    },
  );
  remainder = remainder.replace(
    /(?:format|tech)\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\s*\)/gi,
    '',
  );
  if (malformed || urls.length === 0 || !/^[\s,]*$/.test(remainder)) return null;
  return urls;
}

function dataFontDigest(value) {
  const comma = value.indexOf(',');
  if (comma <= 5) return null;
  const metadata = value.slice(5, comma).toLowerCase();
  const payload = value.slice(comma + 1);
  const parts = metadata.split(';');
  if (parts.length !== 2 || parts[1] !== 'base64' || !WORK0_FONT_MIMES.has(parts[0])) return null;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload)) {
    return null;
  }
  try {
    const bytes = Buffer.from(payload, 'base64');
    if (
      bytes.length < 1 ||
      bytes.length > WORK0_MAX_FONT_BYTES ||
      bytes.toString('base64') !== payload
    ) {
      return null;
    }
    return createHash('sha256').update(bytes).digest('hex');
  } catch {
    return null;
  }
}

async function observedFontDigest(page, value) {
  if (/^data:/i.test(value)) return dataFontDigest(value);
  if (/^blob:/i.test(value)) return null;
  const key = normalizedObservedFontUrl(value);
  const observations = key ? WORK0_PAGE_FONT_RESPONSES.get(page)?.get(key) : null;
  if (!observations?.length) return null;
  const digests = await Promise.all(observations);
  if (digests.some((digest) => !digest) || new Set(digests).size !== 1) return null;
  return digests[0];
}

async function verifiedAliasFontFaceRules(page, fontFaces, drawing) {
  if (!Array.isArray(fontFaces) || fontFaces.length < 1 || fontFaces.length > WORK0_MAX_FONT_FACE_RULES) {
    return null;
  }
  const requestedFamilies = normalizedFontFamilies(drawing?.fontFamily);
  const aliases = new Map();
  const digests = new Set();
  let sourceChars = 0;
  for (const face of fontFaces) {
    const alias = sanitizedFontAlias(face?.family);
    if (!alias || !requestedFamilies.has(alias.toLowerCase())) return null;
    sourceChars += String(face?.source ?? '').length;
    if (sourceChars > WORK0_MAX_FONT_SOURCE_CHARS) return null;
    const urls = parsedFontSourceUrls(face.source);
    if (!urls) return null;
    for (const value of urls) {
      const digest = await observedFontDigest(page, value);
      if (!digest) return null;
      digests.add(digest);
    }
    const descriptor = {
      fontStretch: sanitizedFontDescriptor(face?.fontStretch, 'stretch'),
      fontStyle: sanitizedFontDescriptor(face?.fontStyle, 'style'),
      fontWeight: sanitizedFontDescriptor(face?.fontWeight, 'weight'),
    };
    const descriptorKey = JSON.stringify(descriptor);
    const previous = aliases.get(alias);
    if (previous && previous.key !== descriptorKey) return null;
    aliases.set(alias, { descriptor, key: descriptorKey });
  }
  if (digests.size !== 1) return null;
  const [digest] = digests;
  const asset = WORK0_TRUSTED_FONT_BY_DIGEST.get(digest);
  if (!asset || !trustedFontAsset(asset)) return null;
  const rules = [];
  for (const [alias, { descriptor }] of aliases) {
    const rule = trustedFontRule(alias, asset, descriptor);
    if (!rule) return null;
    rules.push(rule);
  }
  return rules;
}

async function screenshotConfirmsPaintedText(page, paintedHandle, targetHandle, expectedText) {
  if (typeof page.screenshot !== 'function' || typeof paintedHandle?.evaluate !== 'function') {
    return true;
  }
  try {
    const evidence = await paintedHandle.evaluate((paintedElement, payload) => {
      const { fontLimits, targetElement, text } = payload;
      const normalize = (value) =>
        String(value ?? '')
          .replace(/[\u2060\u200B\u200C\u200D\uFEFF]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      if (
        !targetElement?.contains?.(paintedElement) ||
        normalize(paintedElement.innerText ?? paintedElement.textContent) !== normalize(text)
      ) {
        return null;
      }
      const textNodes = [];
      const collect = (node) => {
        for (const child of node.childNodes ?? []) {
          if (child.nodeType === 3 && child.textContent?.length) textNodes.push(child);
          else if (child.nodeType === 1) collect(child);
        }
      };
      collect(paintedElement);
      const rects = [];
      for (const node of textNodes) {
        const range = document.createRange();
        try {
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) {
            if (rect.width >= 1 && rect.height >= 1) rects.push(rect);
          }
        } finally {
          range.detach?.();
        }
      }
      if (rects.length === 0) return null;
      const left = Math.min(...rects.map((rect) => rect.left));
      const top = Math.min(...rects.map((rect) => rect.top));
      const right = Math.max(...rects.map((rect) => rect.right));
      const bottom = Math.max(...rects.map((rect) => rect.bottom));
      if (
        ![left, top, right, bottom].every(Number.isFinite) ||
        left < 0 ||
        top < 0 ||
        right > window.innerWidth ||
        bottom > window.innerHeight ||
        right - left < 1 ||
        bottom - top < 1
      ) {
        return null;
      }
      const style = getComputedStyle(paintedElement);
      let compositorElement = targetElement;
      const roleTargetStyle = getComputedStyle(targetElement);
      let compositorStyle = roleTargetStyle;
      let neutral3DScrollElement = null;
      let neutral3DScrollStyle = null;
      let neutral3DScrollTransform = null;
      for (let current = targetElement; current; current = current.parentElement) {
        const currentStyle = getComputedStyle(current);
        let typedTransform = '';
        try {
          typedTransform = String(current.computedStyleMap?.().get('transform') ?? '').trim();
        } catch {
          typedTransform = '';
        }
        const neutral3DScrollLayer =
          !neutral3DScrollElement &&
          /^translate3d\(\s*0(?:px)?\s*,\s*0(?:px)?\s*,\s*0(?:px)?\s*\)$/i.test(
            typedTransform,
          ) &&
          /^matrix\(\s*1\s*,\s*0\s*,\s*0\s*,\s*1\s*,\s*0\s*,\s*0\s*\)$/i.test(
            String(currentStyle.transform || '').trim(),
          ) &&
          /^(?:auto|scroll)$/.test(currentStyle.overflowY) &&
          current.scrollHeight > current.clientHeight &&
          current.scrollTop !== 0;
        if (neutral3DScrollLayer) {
          neutral3DScrollElement = current;
          neutral3DScrollStyle = currentStyle;
          neutral3DScrollTransform = typedTransform;
        }
        const neutralFilterLayer = /^opacity\(\s*(?:1|100%)\s*\)$/i.test(
          String(currentStyle.filter || '').trim(),
        );
        if (
          String(currentStyle.willChange || 'auto').trim() !== 'auto' ||
          neutralFilterLayer
        ) {
          compositorElement = current;
          compositorStyle = currentStyle;
          break;
        }
      }
      const paintedLayerProxy =
        style.isolation === 'isolate' && String(style.willChange || 'auto').trim() !== 'auto';
      const nestedPaintedLayer =
        paintedLayerProxy &&
        /^(?:inline-)?(?:flex|grid)$/.test(roleTargetStyle.display);
      const normalizeFamily = (value) =>
        String(value ?? '')
          .trim()
          .replace(/^['"]|['"]$/g, '')
          .toLowerCase();
      const expectedFamilies = new Set(style.fontFamily.split(',').map(normalizeFamily));
      const fontFaces = [];
      let fontCollectionFailed = false;
      let fontRuleCount = 0;
      let fontSourceChars = 0;
      const absoluteFontUrls = (cssText, baseHref) =>
        cssText.replace(
          /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi,
          (_match, doubleQuoted, singleQuoted, unquoted) => {
            const value = String(doubleQuoted ?? singleQuoted ?? unquoted ?? '').trim();
            if (/^(?:data|blob):/i.test(value)) return `url(${JSON.stringify(value)})`;
            try {
              return `url(${JSON.stringify(new URL(value, baseHref).href)})`;
            } catch {
              fontCollectionFailed = true;
              return '';
            }
          },
        );
      const collectFontFaces = (rules, baseHref, depth = 0) => {
        if (depth > fontLimits.maxDepth) {
          fontCollectionFailed = true;
          return;
        }
        for (const rule of rules ?? []) {
          fontRuleCount += 1;
          if (fontRuleCount > fontLimits.maxRules) {
            fontCollectionFailed = true;
            return;
          }
          if (rule.type === 5 && expectedFamilies.has(normalizeFamily(rule.style?.fontFamily))) {
            const source = absoluteFontUrls(String(rule.style?.src ?? ''), baseHref);
            fontSourceChars += source.length;
            if (
              fontFaces.length >= fontLimits.maxFaces ||
              fontSourceChars > fontLimits.maxSourceChars
            ) {
              fontCollectionFailed = true;
              return;
            }
            fontFaces.push({
              family: rule.style?.fontFamily ?? '',
              fontStretch: rule.style?.fontStretch ?? 'normal',
              fontStyle: rule.style?.fontStyle ?? 'normal',
              fontWeight: rule.style?.fontWeight ?? '400',
              source,
            });
          } else if (rule.type === 3) {
            if (!rule.styleSheet) {
              fontCollectionFailed = true;
              return;
            }
            try {
              const importBase =
                rule.styleSheet.href || new URL(rule.href, baseHref || document.baseURI).href;
              collectFontFaces(rule.styleSheet.cssRules, importBase, depth + 1);
            } catch {
              fontCollectionFailed = true;
            }
          } else if (rule.cssRules) {
            collectFontFaces(rule.cssRules, baseHref, depth + 1);
          }
        }
      };
      const visitedFontSheets = new WeakSet();
      const collectFontSheet = (sheet, fallbackBase) => {
        if (!sheet) {
          fontCollectionFailed = true;
          return;
        }
        if (visitedFontSheets.has(sheet)) return;
        visitedFontSheets.add(sheet);
        try {
          collectFontFaces(sheet.cssRules, sheet.href || fallbackBase || document.baseURI);
        } catch {
          fontCollectionFailed = true;
        }
      };
      for (const sheet of document.styleSheets) {
        collectFontSheet(sheet, document.baseURI);
      }
      for (const sheet of document.adoptedStyleSheets ?? []) {
        collectFontSheet(sheet, document.baseURI);
      }
      for (let root = paintedElement.getRootNode?.(); root && root !== document; ) {
        for (const sheet of root.adoptedStyleSheets ?? []) {
          collectFontSheet(sheet, document.baseURI);
        }
        for (const owner of root.querySelectorAll?.('style,link[rel="stylesheet"]') ?? []) {
          collectFontSheet(owner.sheet, owner.baseURI || document.baseURI);
        }
        root = root.host?.getRootNode?.();
      }
      const tag = paintedElement.tagName?.toLowerCase?.();
      const foreground =
        tag === 'text' || tag === 'tspan'
          ? style.fill
          : style.webkitTextFillColor || style.color;
      const channelOpacity =
        tag === 'text' || tag === 'tspan' ? Number(style.fillOpacity || '1') : 1;
      const backgrounds = [];
      for (let current = paintedElement; current; current = current.parentElement) {
        backgrounds.push(getComputedStyle(current).backgroundColor);
      }
      const guard = 3;
      const targetRect = targetElement.getBoundingClientRect();
      const neutral3DScrollRect = neutral3DScrollElement?.getBoundingClientRect?.() ?? null;
      const compositorRect = nestedPaintedLayer
        ? paintedElement.getBoundingClientRect()
        : paintedLayerProxy
          ? targetRect
          : compositorElement.getBoundingClientRect();
      const clip = {
        x: Math.max(0, Math.floor(targetRect.left), Math.floor(left) - guard),
        y: Math.max(0, Math.floor(targetRect.top), Math.floor(top) - guard),
      };
      clip.width =
        Math.min(window.innerWidth, Math.ceil(targetRect.right), Math.ceil(right) + guard) - clip.x;
      clip.height =
        Math.min(window.innerHeight, Math.ceil(targetRect.bottom), Math.ceil(bottom) + guard) - clip.y;
      const canvas =
        typeof OffscreenCanvas === 'function'
          ? new OffscreenCanvas(clip.width, clip.height)
          : document.createElement('canvas');
      canvas.width = clip.width;
      canvas.height = clip.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return null;
      const canvasFont =
        style.font ||
        [style.fontStyle, style.fontVariant, style.fontWeight, style.fontSize]
          .filter(Boolean)
          .join(' ') + ` ${style.fontFamily}`;
      context.font = canvasFont;
      if (document.fonts?.check && !document.fonts.check(context.font, normalize(text))) return null;
      if ('fontKerning' in context) context.fontKerning = style.fontKerning;
      if ('fontStretch' in context) context.fontStretch = style.fontStretch;
      if ('fontVariantCaps' in context) context.fontVariantCaps = style.fontVariantCaps;
      if ('letterSpacing' in context) context.letterSpacing = style.letterSpacing;
      if ('wordSpacing' in context) context.wordSpacing = style.wordSpacing;
      if ('textRendering' in context) context.textRendering = style.textRendering;
      context.direction = 'ltr';
      context.textAlign = 'left';
      context.textBaseline = 'alphabetic';
      const normalizedText = normalize(text);
      if (
        textNodes.length === 0 ||
        textNodes.some((node) => node.parentElement !== paintedElement)
      ) {
        return null;
      }
      const rawSegments = [];
      let rawText = '';
      for (const node of textNodes) {
        const value = String(node.textContent ?? '');
        rawSegments.push({ end: rawText.length + value.length, node, start: rawText.length });
        rawText += value;
      }
      const startBoundary = (offset) => {
        const segment = rawSegments.find(({ end, start }) => offset >= start && offset < end);
        if (segment) return { node: segment.node, offset: offset - segment.start };
        const next = rawSegments.find(({ start }) => start === offset);
        if (next) return { node: next.node, offset: 0 };
        const last = rawSegments.at(-1);
        return last && offset === rawText.length
          ? { node: last.node, offset: last.end - last.start }
          : null;
      };
      const endBoundary = (offset) => {
        const segment = [...rawSegments]
          .reverse()
          .find(({ end, start }) => offset > start && offset <= end);
        if (segment) return { node: segment.node, offset: offset - segment.start };
        const first = rawSegments[0];
        return first && offset === 0 ? { node: first.node, offset: 0 } : null;
      };
      const normalizedCharacters = [];
      const ignoredCharacter = /[\u2060\u200B\u200C\u200D\uFEFF]/;
      for (let offset = 0; offset < rawText.length; ) {
        const character = String.fromCodePoint(rawText.codePointAt(offset));
        const end = offset + character.length;
        if (ignoredCharacter.test(character)) {
          offset = end;
          continue;
        }
        if (/\s/.test(character)) {
          let runEnd = end;
          while (runEnd < rawText.length) {
            const next = String.fromCodePoint(rawText.codePointAt(runEnd));
            if (!/\s/.test(next) && !ignoredCharacter.test(next)) break;
            runEnd += next.length;
          }
          normalizedCharacters.push({ character: ' ', end: runEnd, start: offset });
          offset = runEnd;
          continue;
        }
        normalizedCharacters.push({ character, end, start: offset });
        offset = end;
      }
      while (normalizedCharacters[0]?.character === ' ') normalizedCharacters.shift();
      while (normalizedCharacters.at(-1)?.character === ' ') normalizedCharacters.pop();
      if (normalizedCharacters.map(({ character }) => character).join('') !== normalizedText) {
        return null;
      }
      const glyphBounds = [];
      for (const { character, end, start } of normalizedCharacters) {
        if (/\s/.test(character)) continue;
        const rangeStart = startBoundary(start);
        const rangeEnd = endBoundary(end);
        if (!rangeStart || !rangeEnd) return null;
        const characterRange = document.createRange();
        try {
          characterRange.setStart(rangeStart.node, rangeStart.offset);
          characterRange.setEnd(rangeEnd.node, rangeEnd.offset);
          const characterRect = characterRange.getBoundingClientRect();
          if (characterRect.width < 1 || characterRect.height < 1) return null;
          glyphBounds.push({
            character,
            end: characterRect.right - clip.x,
            start: characterRect.left - clip.x,
          });
        } finally {
          characterRange.detach?.();
        }
      }
      const metrics = context.measureText(normalizedText);
      const fontAscent = Number.isFinite(metrics.fontBoundingBoxAscent)
        ? metrics.fontBoundingBoxAscent
        : metrics.actualBoundingBoxAscent;
      const fontDescent = Number.isFinite(metrics.fontBoundingBoxDescent)
        ? metrics.fontBoundingBoxDescent
        : metrics.actualBoundingBoxDescent;
      if (
        !Number.isFinite(metrics.width) ||
        !Number.isFinite(fontAscent) ||
        !Number.isFinite(fontDescent) ||
        metrics.width < 1 ||
        fontAscent + fontDescent < 1 ||
        Math.abs(metrics.width - (right - left)) > Math.max(4, (right - left) * 0.2)
      ) {
        return null;
      }
      const originX = left - clip.x + (right - left - metrics.width) / 2;
      const baseline = top - clip.y + (bottom - top - fontAscent - fontDescent) / 2 + fontAscent;
      context.clearRect(0, 0, clip.width, clip.height);
      context.fillStyle = '#fff';
      context.fillText(normalizedText, originX, baseline);
      const mask = context.getImageData(0, 0, clip.width, clip.height).data;
      const expectedAlpha = [];
      const expectedInk = [];
      const expectedCore = [];
      for (let offset = 3; offset < mask.length; offset += 4) {
        const alpha = mask[offset];
        const pixelIndex = (offset - 3) / 4;
        expectedAlpha.push(alpha);
        if (alpha >= 32) expectedInk.push(pixelIndex);
        if (alpha >= 128) expectedCore.push(pixelIndex);
      }
      if (expectedCore.length < 3 || expectedInk.length < expectedCore.length) return null;
      const expectedGlyphs = glyphBounds.map(({ end, start }) => {
        const owns = (pixelIndex) => {
          const centerX = (pixelIndex % clip.width) + 0.5;
          return centerX >= start && centerX < end;
        };
        return {
          core: expectedCore.filter(owns),
          end,
          ink: expectedInk.filter(owns),
          start,
        };
      });
      if (
        expectedGlyphs.length === 0 ||
        expectedGlyphs.some(({ core, ink }) => core.length === 0 || ink.length === 0)
      ) {
        return null;
      }
      return {
        backgrounds,
        channelOpacity: Number.isFinite(channelOpacity) ? channelOpacity : 1,
        clip,
        expectedCore,
        expectedGlyphs,
        expectedInk,
        fontCollectionFailed,
        fontFaces,
        foreground,
        glyphs: [...normalize(text)].filter((character) => !/\s/.test(character)).length,
        neutral3DScrollTarget:
          neutral3DScrollRect &&
          neutral3DScrollStyle &&
          neutral3DScrollTransform &&
          neutral3DScrollRect.width >= 1 &&
          neutral3DScrollRect.height >= 1
            ? {
                targetBackground: neutral3DScrollStyle.backgroundColor,
                targetFilter: neutral3DScrollStyle.filter,
                targetHeight: neutral3DScrollRect.height,
                targetIsolation: neutral3DScrollStyle.isolation,
                targetLeft: neutral3DScrollRect.left,
                targetTop: neutral3DScrollRect.top,
                targetTransform: neutral3DScrollTransform,
                targetTransparent: ['rgba(0, 0, 0, 0)', 'transparent'].includes(
                  String(neutral3DScrollStyle.backgroundColor || '')
                    .trim()
                    .toLowerCase(),
                ),
                targetWidth: neutral3DScrollRect.width,
                targetWillChange:
                  String(neutral3DScrollStyle.willChange || 'auto').trim() || 'auto',
              }
            : null,
        drawing: {
          filter: style.filter,
          font: context.font,
          fontFamily: style.fontFamily,
          fontKerning: style.fontKerning,
          fontSize: style.fontSize,
          fontStretch: style.fontStretch,
          fontStyle: style.fontStyle,
          fontVariant: style.fontVariant,
          fontVariantCaps: style.fontVariantCaps,
          fontWeight: style.fontWeight,
          height: bottom - top,
          left: left - clip.x,
          letterSpacing: style.letterSpacing,
          lineHeight: style.lineHeight,
          text: normalizedText,
          textRendering: style.textRendering,
          top: top - clip.y,
          targetBackground: null,
          targetHeight: compositorRect.height,
          targetFilter: paintedLayerProxy ? 'none' : compositorStyle.filter,
          targetLeft: compositorRect.left,
          targetIsolation: paintedLayerProxy ? style.isolation : compositorStyle.isolation,
          targetTop: compositorRect.top,
          targetTransform: 'none',
          targetTransparent: nestedPaintedLayer,
          targetWillChange: paintedLayerProxy ? style.willChange : compositorStyle.willChange,
          targetWidth: compositorRect.width,
          width: right - left,
          wordSpacing: style.wordSpacing,
        },
      };
    }, {
      fontLimits: {
        maxDepth: WORK0_MAX_FONT_IMPORT_DEPTH,
        maxFaces: WORK0_MAX_FONT_FACE_RULES,
        maxRules: WORK0_MAX_FONT_CSS_RULES,
        maxSourceChars: WORK0_MAX_FONT_SOURCE_CHARS,
      },
      targetElement: targetHandle,
      text: expectedText,
    });
    if (
      !evidence ||
      evidence.clip.width < 1 ||
      evidence.clip.height < 1 ||
      evidence.clip.width > 1024 ||
      evidence.clip.height > 512 ||
      evidence.glyphs < 1 ||
      evidence.fontCollectionFailed
    ) {
      return false;
    }
    const trustedFonts = trustedFontFaceRules(evidence.drawing.fontFamily, evidence.drawing);
    if (!trustedFonts.verified) return false;
    if (trustedFonts.matched) {
      evidence.fontFaceRules = trustedFonts.rules;
    } else if (evidence.fontFaces.length > 0) {
      const verifiedRules = await verifiedAliasFontFaceRules(
        page,
        evidence.fontFaces,
        evidence.drawing,
      );
      if (!verifiedRules) return false;
      evidence.fontFaceRules = verifiedRules;
    } else if (!verifiedSystemFontStack(evidence.drawing.fontFamily)) {
      return false;
    } else {
      evidence.fontFaceRules = [];
    }
    let background = [255, 255, 255];
    for (const value of [...evidence.backgrounds].reverse()) {
      const paint = parseScreenshotPaint(value);
      if (paint && paint.alpha > 0) background = blendScreenshotPaint(paint, background);
    }
    const foregroundPaint = parseScreenshotPaint(evidence.foreground);
    if (!foregroundPaint) return false;
    foregroundPaint.alpha *= Math.min(1, Math.max(0, evidence.channelOpacity));
    const foreground = blendScreenshotPaint(foregroundPaint, background);
    const separation = Math.sqrt(
      foreground.reduce((total, channel, index) => total + (channel - background[index]) ** 2, 0),
    );
    if (separation < 32 || screenshotContrast(foreground, background) < 3) return false;
    const foregroundVector = foreground.map((channel, index) => channel - background[index]);
    const foregroundMagnitudeSquared = foregroundVector.reduce(
      (total, channel) => total + channel ** 2,
      0,
    );
    const projectedCoverage = (png) => {
      const coverage = new Float32Array(png.width * png.height);
      for (let offset = 0; offset < png.data.length; offset += 4) {
        const projected = [png.data[offset], png.data[offset + 1], png.data[offset + 2]].reduce(
          (total, channel, index) =>
            total + (channel - background[index]) * foregroundVector[index],
          0,
        );
        coverage[offset / 4] = Math.min(1, Math.max(0, projected / foregroundMagnitudeSquared));
      }
      return coverage;
    };
    const browserContext = typeof page.context === 'function' ? page.context() : null;
    if (typeof browserContext?.newPage !== 'function') return false;
    const expectedDrawings = [evidence.drawing];
    if (evidence.neutral3DScrollTarget) {
      expectedDrawings.push({ ...evidence.drawing, ...evidence.neutral3DScrollTarget });
    }
    const renderExpectedPng = async (drawing) => {
      let expectedPage = null;
      try {
        expectedPage = await browserContext.newPage();
        const sourceViewport = typeof page.viewportSize === 'function' ? page.viewportSize() : null;
        await expectedPage.setViewportSize(
          sourceViewport ?? {
            width: evidence.clip.x + evidence.clip.width,
            height: evidence.clip.y + evidence.clip.height,
          },
        );
        await expectedPage.setContent('<!doctype html><html><body></body></html>');
        const rendered = await expectedPage.evaluate(async (payload) => {
          const { background, baseHref, clip, drawing, fontFaceRules, foreground } = payload;
          document.documentElement.style.cssText = 'margin:0;padding:0;overflow:hidden';
          const base = document.createElement('base');
          base.href = baseHref;
          document.head.append(base);
          if (fontFaceRules.length > 0) {
            const fontStyles = document.createElement('style');
            fontStyles.textContent = fontFaceRules.join('\n');
            document.head.append(fontStyles);
          }
          document.body.style.cssText = [
            'margin:0',
            'padding:0',
            'overflow:hidden',
            `background:rgb(${background.join(',')})`,
          ].join(';');
          const usesTargetLayer =
            drawing.targetFilter !== 'none' ||
            drawing.targetIsolation === 'isolate' ||
            drawing.targetTransform !== 'none' ||
            drawing.targetWillChange !== 'auto';
          const targetLayer = document.createElement('div');
          Object.assign(targetLayer.style, {
            background:
              drawing.targetBackground ??
              (drawing.targetTransparent ? 'transparent' : `rgb(${background.join(',')})`),
            border: '0',
            filter: drawing.targetFilter,
            height: `${drawing.targetHeight}px`,
            isolation: drawing.targetIsolation,
            left: `${drawing.targetLeft}px`,
            margin: '0',
            padding: '0',
            pointerEvents: 'none',
            position: 'absolute',
            top: `${drawing.targetTop}px`,
            transform: drawing.targetTransform,
            width: `${drawing.targetWidth}px`,
            willChange: drawing.targetWillChange,
          });
          const span = document.createElement('span');
          span.textContent = drawing.text;
          Object.assign(span.style, {
            border: '0',
            color: `rgb(${foreground.join(',')})`,
            direction: 'ltr',
            display: 'inline-block',
            filter: drawing.filter,
            fontFamily: drawing.fontFamily,
            fontKerning: drawing.fontKerning,
            fontSize: drawing.fontSize,
            fontStretch: drawing.fontStretch,
            fontStyle: drawing.fontStyle,
            fontVariant: drawing.fontVariant,
            fontVariantCaps: drawing.fontVariantCaps,
            fontWeight: drawing.fontWeight,
            left: '0px',
            letterSpacing: drawing.letterSpacing,
            lineHeight: drawing.lineHeight,
            margin: '0',
            padding: '0',
            position: 'absolute',
            textRendering: drawing.textRendering,
            top: '0px',
            whiteSpace: 'pre',
            wordSpacing: drawing.wordSpacing,
          });
          if (usesTargetLayer) {
            targetLayer.append(span);
            document.body.append(targetLayer);
          } else {
            document.body.append(span);
          }
          await document.fonts?.load?.(drawing.font, drawing.text);
          await document.fonts?.ready;
          if (fontFaceRules.length > 0 && !document.fonts?.check?.(drawing.font, drawing.text)) {
            return false;
          }
          const range = document.createRange();
          try {
            range.selectNodeContents(span);
            const initial = range.getBoundingClientRect();
            const expectedLeft = clip.x + drawing.left;
            const expectedTop = clip.y + drawing.top;
            span.style.left = `${expectedLeft - initial.left}px`;
            span.style.top = `${expectedTop - initial.top}px`;
            const aligned = range.getBoundingClientRect();
            return (
              Math.abs(aligned.left - expectedLeft) <= 0.1 &&
              Math.abs(aligned.top - expectedTop) <= 0.1 &&
              Math.abs(aligned.width - drawing.width) <= 0.5
            );
          } finally {
            range.detach?.();
          }
        }, {
          background,
          baseHref: page.url(),
          clip: evidence.clip,
          drawing,
          fontFaceRules: evidence.fontFaceRules,
          foreground,
        });
        if (!rendered) return null;
        const expectedScreenshot = await expectedPage.screenshot({
          animations: 'allow',
          caret: 'initial',
          clip: evidence.clip,
          scale: 'css',
          type: 'png',
        });
        return PNG.sync.read(expectedScreenshot);
      } finally {
        await expectedPage?.close().catch(() => {});
      }
    };
    const expectedPngs = [];
    for (let index = 0; index < expectedDrawings.length; index += 1) {
      const expectedPng = await renderExpectedPng(expectedDrawings[index]);
      if (
        !expectedPng ||
        expectedPng.width !== evidence.clip.width ||
        expectedPng.height !== evidence.clip.height
      ) {
        if (index === 0) return false;
        continue;
      }
      expectedPngs.push(expectedPng);
    }
    const screenshot = await page.screenshot({
      animations: 'allow',
      caret: 'initial',
      clip: evidence.clip,
      scale: 'css',
      type: 'png',
    });
    const png = PNG.sync.read(screenshot);
    const matchesExpectedPng = (expectedPng) => {
      const expectedCoverage = projectedCoverage(expectedPng);
    const foregroundMask = new Uint8Array(png.width * png.height);
    const foregroundCoverage = projectedCoverage(png);
    let foregroundPixels = 0;
    const foregroundColumns = new Set();
    const foregroundRows = new Set();
    const expectedCoverageNearby = (x, y) => {
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        const candidateY = y + offsetY;
        if (candidateY < 0 || candidateY >= png.height) continue;
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const candidateX = x + offsetX;
          if (candidateX < 0 || candidateX >= png.width) continue;
          if (expectedCoverage[candidateY * png.width + candidateX] >= 0.125) return true;
        }
      }
      return false;
    };
    for (let offset = 0; offset < png.data.length; offset += 4) {
      const pixelIndex = offset / 4;
      const coverage = foregroundCoverage[pixelIndex];
      const pixel = [png.data[offset], png.data[offset + 1], png.data[offset + 2]];
      const residual = Math.sqrt(
        pixel.reduce((total, channel, index) => {
          const projectedChannel = background[index] + foregroundVector[index] * coverage;
          return total + (channel - projectedChannel) ** 2;
        }, 0),
      );
      const x = pixelIndex % png.width;
      const y = Math.floor(pixelIndex / png.width);
      if (
        coverage >= 0.25 &&
        (expectedCoverageNearby(x, y) || residual <= Math.max(12, separation * 0.12))
      ) {
        foregroundMask[offset / 4] = 1;
        foregroundPixels += 1;
        foregroundColumns.add(pixelIndex % png.width);
        foregroundRows.add(Math.floor(pixelIndex / png.width));
      }
    }
    if (
      png.width !== evidence.clip.width ||
      png.height !== evidence.clip.height ||
      foregroundPixels < Math.max(3, evidence.glyphs * 3) ||
      foregroundColumns.size < Math.min(png.width, Math.max(2, Math.ceil(evidence.glyphs * 1.5))) ||
      foregroundRows.size < Math.min(png.height, 3)
    ) {
      return false;
    }
    const countMaskComponents = () => {
      const visited = new Uint8Array(foregroundMask.length);
      let components = 0;
      const queue = [];
      for (let start = 0; start < foregroundMask.length; start += 1) {
        if (!foregroundMask[start] || visited[start]) continue;
        components += 1;
        visited[start] = 1;
        queue.push(start);
        while (queue.length > 0) {
          const current = queue.pop();
          const currentX = current % png.width;
          const currentY = Math.floor(current / png.width);
          for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
            for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
              if (offsetX === 0 && offsetY === 0) continue;
              const x = currentX + offsetX;
              const y = currentY + offsetY;
              if (x < 0 || x >= png.width || y < 0 || y >= png.height) continue;
              const index = y * png.width + x;
              if (foregroundMask[index] && !visited[index]) {
                visited[index] = 1;
                queue.push(index);
              }
            }
          }
        }
      }
      return components;
    };
    const coefficientOfVariation = (counts) => {
      const mean = counts.reduce((total, value) => total + value, 0) / counts.length;
      if (mean <= 0) return 0;
      const variance =
        counts.reduce((total, value) => total + (value - mean) ** 2, 0) / counts.length;
      return Math.sqrt(variance) / mean;
    };
    const columnCounts = Array(png.width).fill(0);
    const rowCounts = Array(png.height).fill(0);
    for (let pixelIndex = 0; pixelIndex < foregroundMask.length; pixelIndex += 1) {
      if (!foregroundMask[pixelIndex]) continue;
      columnCounts[pixelIndex % png.width] += 1;
      rowCounts[Math.floor(pixelIndex / png.width)] += 1;
    }
    const foregroundComponents = countMaskComponents();
    const columnVariation = coefficientOfVariation(columnCounts);
    const rowVariation = coefficientOfVariation(rowCounts);
    const expectedReferenceCore = [];
    const expectedReferenceInk = [];
    for (let pixelIndex = 0; pixelIndex < expectedCoverage.length; pixelIndex += 1) {
      if (expectedCoverage[pixelIndex] >= 0.125) expectedReferenceInk.push(pixelIndex);
      if (expectedCoverage[pixelIndex] >= 0.5) expectedReferenceCore.push(pixelIndex);
    }
    if (
      expectedReferenceCore.length < 3 ||
      expectedReferenceInk.length < expectedReferenceCore.length
    ) {
      return false;
    }
    const expectedGlyphs = evidence.expectedGlyphs.map(({ end, start }) => {
      const owns = (pixelIndex) => {
        const centerX = (pixelIndex % png.width) + 0.5;
        return centerX >= start && centerX < end;
      };
      return {
        core: expectedReferenceCore.filter(owns),
        end,
        start,
      };
    });
    if (expectedGlyphs.some(({ core }) => core.length === 0)) return false;
    const expectedInkMask = new Uint8Array(png.width * png.height);
    for (const pixelIndex of expectedReferenceInk) expectedInkMask[pixelIndex] = 1;
    const nearby = (mask, x, y, radius = 1) => {
      for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        const candidateY = y + offsetY;
        if (candidateY < 0 || candidateY >= png.height) continue;
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          const candidateX = x + offsetX;
          if (candidateX < 0 || candidateX >= png.width) continue;
          if (mask[candidateY * png.width + candidateX]) return true;
        }
      }
      return false;
    };
    const similarity = (start, end, shiftX, shiftY) => {
      let dot = 0;
      let expectedSquare = 0;
      let actualSquare = 0;
      let expectedTotal = 0;
      let actualTotal = 0;
      let sharedTotal = 0;
      let rowDot = 0;
      let expectedRowSquare = 0;
      let actualRowSquare = 0;
      const expectedGrid = Array(15).fill(0);
      const actualGrid = Array(15).fill(0);
      for (let y = 0; y < png.height; y += 1) {
        let expectedRow = 0;
        let actualRow = 0;
        for (let x = 0; x < png.width; x += 1) {
          const centerX = x + 0.5;
          if (centerX < start || centerX >= end) continue;
          const shiftedX = x + shiftX;
          const shiftedY = y + shiftY;
          const actual =
            shiftedX >= 0 && shiftedX < png.width && shiftedY >= 0 && shiftedY < png.height
              ? foregroundCoverage[shiftedY * png.width + shiftedX]
              : 0;
          const expected = expectedCoverage[y * png.width + x];
          dot += expected * actual;
          expectedSquare += expected ** 2;
          actualSquare += actual ** 2;
          expectedTotal += expected;
          actualTotal += actual;
          sharedTotal += Math.min(expected, actual);
          expectedRow += expected;
          actualRow += actual;
          const columnBin = Math.min(
            2,
            Math.max(0, Math.floor(((centerX - start) / Math.max(1, end - start)) * 3)),
          );
          const rowBin = Math.min(4, Math.floor((y / png.height) * 5));
          const gridIndex = rowBin * 3 + columnBin;
          expectedGrid[gridIndex] += expected;
          actualGrid[gridIndex] += actual;
        }
        rowDot += expectedRow * actualRow;
        expectedRowSquare += expectedRow ** 2;
        actualRowSquare += actualRow ** 2;
      }
      const gridDot = expectedGrid.reduce(
        (total, value, index) => total + value * actualGrid[index],
        0,
      );
      const expectedGridSquare = expectedGrid.reduce((total, value) => total + value ** 2, 0);
      const actualGridSquare = actualGrid.reduce((total, value) => total + value ** 2, 0);
      return {
        cosine:
          expectedSquare > 0 && actualSquare > 0
            ? dot / Math.sqrt(expectedSquare * actualSquare)
            : 0,
        dice:
          expectedTotal + actualTotal > 0
            ? (2 * sharedTotal) / (expectedTotal + actualTotal)
            : 0,
        gridCosine:
          expectedGridSquare > 0 && actualGridSquare > 0
            ? gridDot / Math.sqrt(expectedGridSquare * actualGridSquare)
            : 0,
        rowCosine:
          expectedRowSquare > 0 && actualRowSquare > 0
            ? rowDot / Math.sqrt(expectedRowSquare * actualRowSquare)
            : 0,
      };
    };
    const zeroShiftGlobal = similarity(0, png.width, 0, 0);
    const zeroShiftGlyphs = expectedGlyphs.map((glyph) =>
      similarity(glyph.start - 0.6, glyph.end + 0.6, 0, 0),
    );
    if (
      zeroShiftGlobal.cosine < 0.995 ||
      zeroShiftGlobal.dice < 0.96 ||
      zeroShiftGlobal.gridCosine < 0.995 ||
      zeroShiftGlobal.rowCosine < 0.995 ||
      zeroShiftGlyphs.some(
        ({ cosine, dice, gridCosine, rowCosine }) =>
          cosine < 0.99 || dice < 0.95 || gridCosine < 0.99 || rowCosine < 0.99,
      )
    ) {
      return false;
    }
    let exactGlyphMatch = false;
    for (let shiftY = -4; shiftY <= 4; shiftY += 1) {
      for (let shiftX = -2; shiftX <= 2; shiftX += 1) {
        let matchedCore = 0;
        for (const pixelIndex of expectedReferenceCore) {
          const x = (pixelIndex % png.width) + shiftX;
          const y = Math.floor(pixelIndex / png.width) + shiftY;
          if (nearby(foregroundMask, x, y)) matchedCore += 1;
        }
        let matchedForeground = 0;
        for (let pixelIndex = 0; pixelIndex < foregroundMask.length; pixelIndex += 1) {
          if (!foregroundMask[pixelIndex]) continue;
          const x = (pixelIndex % png.width) - shiftX;
          const y = Math.floor(pixelIndex / png.width) - shiftY;
          if (nearby(expectedInkMask, x, y)) matchedForeground += 1;
        }
        const recall = matchedCore / expectedReferenceCore.length;
        const precision = matchedForeground / foregroundPixels;
        const f1 = recall + precision > 0 ? (2 * recall * precision) / (recall + precision) : 0;
        let minimumBandRecall = 1;
        let minimumGlyphCosine = 1;
        let minimumGlyphDice = 1;
        let minimumGlyphGridCosine = 1;
        let minimumGlyphRowCosine = 1;
        for (const glyph of expectedGlyphs) {
          let matchedGlyphCore = 0;
          for (const pixelIndex of glyph.core) {
            const x = (pixelIndex % png.width) + shiftX;
            const y = Math.floor(pixelIndex / png.width) + shiftY;
            if (nearby(foregroundMask, x, y)) matchedGlyphCore += 1;
          }
          const glyphRecall = matchedGlyphCore / glyph.core.length;
          const glyphSimilarity = similarity(glyph.start - 0.6, glyph.end + 0.6, shiftX, shiftY);
          minimumGlyphCosine = Math.min(minimumGlyphCosine, glyphSimilarity.cosine);
          minimumGlyphDice = Math.min(minimumGlyphDice, glyphSimilarity.dice);
          minimumGlyphGridCosine = Math.min(
            minimumGlyphGridCosine,
            glyphSimilarity.gridCosine,
          );
          minimumGlyphRowCosine = Math.min(
            minimumGlyphRowCosine,
            glyphSimilarity.rowCosine,
          );
          const glyphRows = glyph.core.map((pixelIndex) => Math.floor(pixelIndex / png.width));
          const firstRow = Math.min(...glyphRows);
          const lastRow = Math.max(...glyphRows);
          const bandHeight = Math.max(1, (lastRow - firstRow + 1) / 3);
          for (let band = 0; band < 3; band += 1) {
            const bandStart = firstRow + band * bandHeight;
            const bandEnd = band === 2 ? lastRow + 1 : firstRow + (band + 1) * bandHeight;
            const bandCore = glyph.core.filter((pixelIndex) => {
              const row = Math.floor(pixelIndex / png.width);
              return row >= bandStart && row < bandEnd;
            });
            if (bandCore.length === 0) continue;
            let matchedBand = 0;
            for (const pixelIndex of bandCore) {
              const x = (pixelIndex % png.width) + shiftX;
              const y = Math.floor(pixelIndex / png.width) + shiftY;
              if (nearby(foregroundMask, x, y)) matchedBand += 1;
            }
            minimumBandRecall = Math.min(minimumBandRecall, matchedBand / bandCore.length);
          }
          if (glyphRecall < 0.55) minimumBandRecall = 0;
        }
        const globalSimilarity = similarity(0, png.width, shiftX, shiftY);
        if (
          recall >= 0.99 &&
          precision >= 0.999 &&
          f1 >= 0.99 &&
          globalSimilarity.cosine >= 0.97 &&
          globalSimilarity.dice >= 0.9 &&
          minimumGlyphCosine >= 0.96 &&
          minimumGlyphDice >= 0.82 &&
          minimumGlyphGridCosine >= 0.97 &&
          minimumGlyphRowCosine >= 0.97 &&
          minimumBandRecall >= 0.7
        ) {
          exactGlyphMatch = true;
        }
      }
    }
      return (
        exactGlyphMatch &&
        foregroundComponents >= 1 &&
        foregroundComponents <= evidence.glyphs * 3 &&
        columnVariation >= 0.2 &&
        rowVariation >= 0.2
      );
    };
    return expectedPngs.some(matchesExpectedPng);
  } catch {
    return false;
  }
}

async function exactRenderedRoleTarget(page, effect) {
  const targets = page.getByRole(effect.role, { name: effect.name, exact: true });
  const targetCount = Math.min(await targets.count(), 50);
  const paintedCandidates = page.getByText(effect.text ?? effect.name, { exact: true });
  const paintedCount = Math.min(await paintedCandidates.count(), 50);
  let renderedOccurrence = 0;
  for (let targetIndex = 0; targetIndex < targetCount; targetIndex += 1) {
    const target = targets.nth(targetIndex);
    if (!(await target.isVisible().catch(() => false))) continue;
    let targetMatched = false;
    for (let paintedIndex = 0; paintedIndex < paintedCount; paintedIndex += 1) {
      const painted = paintedCandidates.nth(paintedIndex);
      if (!(await painted.isVisible().catch(() => false))) continue;
      let paintedHandle = null;
      try {
        paintedHandle = await painted.elementHandle();
        if (!paintedHandle) continue;
        targetMatched = await target.evaluate((targetElement, payload) => {
          const { paintedElement, expectedText } = payload;
          if (
            targetElement !== paintedElement &&
            !targetElement.contains(paintedElement)
          ) {
            return false;
          }
          const safeFilterOpacity = (value) => {
            const normalized = String(value || '').trim().toLowerCase();
            if (!normalized || normalized === 'none') return 1;
            const opacityPattern =
              /opacity\(\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*(%)?\s*\)/gi;
            let product = 1;
            let count = 0;
            for (const match of normalized.matchAll(opacityPattern)) {
              const parsed = Number(match[1]);
              if (!Number.isFinite(parsed)) return null;
              count += 1;
              product *= Math.min(1, Math.max(0, match[2] ? parsed / 100 : parsed));
            }
            const unsupported = normalized.replace(opacityPattern, '').trim();
            return count > 0 && unsupported === '' ? product : null;
          };
          const paintAlpha = (value) => {
            const normalized = String(value || '').trim().toLowerCase();
            if (!normalized || normalized === 'transparent' || normalized === 'none') return 0;
            if (!/^rgba?\(/.test(normalized)) return 1;
            const components = normalized.match(/[+-]?(?:\d+\.?\d*|\.\d+)%?/g) ?? [];
            const hasAlpha =
              normalized.includes('/') ||
              (normalized.startsWith('rgba(') && components.length > 3);
            if (!hasAlpha) return 1;
            const token = components[3] ?? '1';
            const alpha = token.endsWith('%')
              ? Number(token.slice(0, -1)) / 100
              : Number(token);
            return Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 0;
          };
          const parsedPaint = (value) => {
            const normalized = String(value || '').trim().toLowerCase();
            if (!/^rgba?\(/.test(normalized)) return null;
            const components = normalized.match(/[+-]?(?:\d+\.?\d*|\.\d+)%?/g) ?? [];
            if (components.length < 3) return null;
            const channels = components.slice(0, 3).map((token) =>
              Math.round(
                token.endsWith('%')
                  ? (Number(token.slice(0, -1)) / 100) * 255
                  : Number(token),
              ),
            );
            if (channels.some((channel) => !Number.isFinite(channel))) return null;
            return { alpha: paintAlpha(normalized), channels, rgb: channels.join(',') };
          };
          const blendChannels = (foreground, alpha, background) =>
            foreground.map((channel, index) => channel * alpha + background[index] * (1 - alpha));
          const relativeLuminance = (channels) => {
            const linear = channels.map((channel) => {
              const value = channel / 255;
              return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
            });
            return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
          };
          const contrastRatio = (first, second) => {
            const firstLuminance = relativeLuminance(first);
            const secondLuminance = relativeLuminance(second);
            return (
              (Math.max(firstLuminance, secondLuminance) + 0.05) /
              (Math.min(firstLuminance, secondLuminance) + 0.05)
            );
          };
          const preservesTextOrientation = (value) => {
            const normalized = String(value || '').trim().toLowerCase();
            if (!normalized || normalized === 'none') return true;
            const approximately = (actual, expected) =>
              Number.isFinite(actual) && Math.abs(actual - expected) <= 0.000001;
            const parseMatrix = (prefix, length) => {
              if (!normalized.startsWith(`${prefix}(`) || !normalized.endsWith(')')) return null;
              const values = normalized
                .slice(prefix.length + 1, -1)
                .split(',')
                .map((token) => Number(token.trim()));
              return values.length === length && values.every(Number.isFinite) ? values : null;
            };
            const matrix = parseMatrix('matrix', 6);
            if (matrix) {
              return (
                approximately(matrix[0], 1) &&
                approximately(matrix[1], 0) &&
                approximately(matrix[2], 0) &&
                approximately(matrix[3], 1)
              );
            }
            const matrix3d = parseMatrix('matrix3d', 16);
            if (!matrix3d) return false;
            const identityIndexes = new Set([0, 5, 10, 15]);
            return matrix3d.every((entry, index) => {
              if ([12, 13, 14].includes(index)) return Number.isFinite(entry);
              return approximately(entry, identityIndexes.has(index) ? 1 : 0);
            });
          };
          const preservesIndividualOrientation = (style) => {
            const rotate = String(style.rotate || 'none').trim().toLowerCase();
            if (rotate !== 'none' && !/^[+-]?0+(?:\.0+)?(?:deg|grad|rad|turn)?$/.test(rotate)) {
              return false;
            }
            const scale = String(style.scale || 'none').trim().toLowerCase();
            if (scale === 'none') return true;
            const components = scale.split(/\s+/).map(Number);
            return (
              components.length >= 1 &&
              components.length <= 3 &&
              components.every((entry) => Number.isFinite(entry) && Math.abs(entry - 1) <= 0.000001)
            );
          };
          const renderedRect = (element, subjectRect = null, clipOwnOverflow = false) => {
            const rect = subjectRect ?? element.getBoundingClientRect?.();
            if (!rect || rect.width < 1 || rect.height < 1) return null;
            let left = Math.max(0, rect.left);
            let top = Math.max(0, rect.top);
            let right = Math.min(window.innerWidth, rect.right);
            let bottom = Math.min(window.innerHeight, rect.bottom);
            let cumulativeOpacity = 1;
            for (let current = element; current; current = current.parentElement) {
              const style = getComputedStyle(current);
              if (
                current.hidden === true ||
                style.display === 'none' ||
                style.visibility === 'hidden' ||
                style.visibility === 'collapse' ||
                style.contentVisibility === 'hidden'
              ) {
                return null;
              }
              const opacity = Number(style.opacity);
              if (Number.isFinite(opacity)) {
                cumulativeOpacity *= Math.min(1, Math.max(0, opacity));
              }
              const filteredOpacity = safeFilterOpacity(style.filter);
              if (filteredOpacity === null) return null;
              cumulativeOpacity *= filteredOpacity;
              if (cumulativeOpacity < 0.1) return null;
              if (!preservesTextOrientation(style.transform)) return null;
              if (!preservesIndividualOrientation(style)) return null;
              if (String(style.offsetPath || 'none').trim().toLowerCase() !== 'none') return null;
              if (String(style.perspective || 'none').trim().toLowerCase() !== 'none') return null;
              const clipPath = String(style.clipPath || style.webkitClipPath || 'none').trim();
              const legacyClip = String(style.clip || 'auto').trim();
              const mask = String(style.maskImage || style.webkitMaskImage || 'none').trim();
              const maskBorder = String(
                style.maskBorderSource ||
                  style.webkitMaskBoxImageSource ||
                  style.webkitMaskBoxImage ||
                  'none',
              ).trim();
              if (
                clipPath !== 'none' ||
                legacyClip !== 'auto' ||
                mask !== 'none' ||
                maskBorder !== 'none'
              ) {
                return null;
              }
              const ancestorRect = current.getBoundingClientRect?.();
              if (ancestorRect && (current !== element || clipOwnOverflow)) {
                const overflowX = style.overflowX || style.overflow;
                const overflowY = style.overflowY || style.overflow;
                if (['auto', 'clip', 'hidden', 'scroll'].includes(overflowX)) {
                  left = Math.max(left, ancestorRect.left);
                  right = Math.min(right, ancestorRect.right);
                }
                if (['auto', 'clip', 'hidden', 'scroll'].includes(overflowY)) {
                  top = Math.max(top, ancestorRect.top);
                  bottom = Math.min(bottom, ancestorRect.bottom);
                }
              }
              if (right - left < 2 || bottom - top < 2) return null;
            }
            const visibleArea = (right - left) * (bottom - top);
            const visibleRatio = visibleArea / (rect.width * rect.height);
            return visibleRatio >= 0.1
              ? {
                  left,
                  top,
                  right,
                  bottom,
                  width: right - left,
                  height: bottom - top,
                  visibleRatio,
                }
              : null;
          };
          const targetVisibleRect = renderedRect(targetElement);
          if (!targetVisibleRect || !renderedRect(paintedElement)) return false;
          const readableTextPaint = (element) => {
            const style = getComputedStyle(element);
            const fontSize = Number.parseFloat(String(style.fontSize || ''));
            if (!Number.isFinite(fontSize) || fontSize < 8) return false;
            if ((style.fontSizeAdjust || 'none') !== 'none') return false;
            const fontStretch = String(style.fontStretch || '100%').trim().toLowerCase();
            if (fontStretch !== 'normal' && Math.abs(Number.parseFloat(fontStretch) - 100) > 0.000001) {
              return false;
            }
            if ((style.writingMode || 'horizontal-tb') !== 'horizontal-tb') return false;
            const letterSpacing = String(style.letterSpacing || 'normal').trim().toLowerCase();
            if (letterSpacing !== 'normal') {
              const parsedLetterSpacing = Number.parseFloat(letterSpacing);
              if (!Number.isFinite(parsedLetterSpacing) || parsedLetterSpacing < 0) return false;
            }
            for (let current = element; current; current = current.parentElement) {
              const currentStyle = getComputedStyle(current);
              if (
                (currentStyle.textTransform && currentStyle.textTransform !== 'none') ||
                (currentStyle.webkitTextSecurity && currentStyle.webkitTextSecurity !== 'none') ||
                !preservesTextOrientation(currentStyle.transform) ||
                currentStyle.textOverflow === 'ellipsis' ||
                (currentStyle.webkitLineClamp && currentStyle.webkitLineClamp !== 'none') ||
                !['normal', 'isolate'].includes(currentStyle.unicodeBidi || 'normal') ||
                (currentStyle.direction && currentStyle.direction !== 'ltr')
              ) {
                return false;
              }
              if (current === targetElement) break;
            }
            const tag = element.tagName?.toLowerCase?.();
            let foreground = style.webkitTextFillColor || style.color;
            let channelOpacity = 1;
            if (tag === 'text' || tag === 'tspan') {
              foreground = style.fill;
              channelOpacity = Number(style.fillOpacity);
              if (paintAlpha(foreground) < 0.1 && paintAlpha(style.stroke) >= 0.1) {
                foreground = style.stroke;
                channelOpacity = Number(style.strokeOpacity);
              }
            }
            if (
              paintAlpha(foreground) < 0.1 ||
              (Number.isFinite(channelOpacity) && channelOpacity < 0.1)
            ) {
              return false;
            }
            const foregroundPaint = parsedPaint(foreground);
            if (!foregroundPaint) return false;
            const ancestry = [];
            for (let current = element; current; current = current.parentElement) {
              const currentStyle = getComputedStyle(current);
              ancestry.push({ element: current, style: currentStyle });
              const zoom = Number(currentStyle.zoom || 1);
              if (!Number.isFinite(zoom) || Math.abs(zoom - 1) > 0.000001) return false;
              if ((currentStyle.outlineStyle || 'none') !== 'none') return false;
              if ((currentStyle.mixBlendMode || 'normal') !== 'normal') return false;
              if ((currentStyle.textDecorationLine || 'none') !== 'none') return false;
              const strokeWidth = String(currentStyle.webkitTextStrokeWidth || '0px').trim();
              const parsedStrokeWidth = Number.parseFloat(strokeWidth);
              if (!Number.isFinite(parsedStrokeWidth) || parsedStrokeWidth !== 0) return false;
              const opacity = Number(currentStyle.opacity);
              if (!Number.isFinite(opacity) || Math.abs(opacity - 1) > 0.000001) return false;
              const filteredOpacity = safeFilterOpacity(currentStyle.filter);
              if (filteredOpacity === null || Math.abs(filteredOpacity - 1) > 0.000001) return false;
              if (String(currentStyle.backgroundImage || 'none').trim() !== 'none') return false;
            }
            let backgroundChannels = [255, 255, 255];
            let backgroundCoverageAlpha = 0;
            for (const { style: currentStyle } of ancestry.reverse()) {
              const background = parsedPaint(currentStyle.backgroundColor);
              if (!background || background.alpha <= 0) continue;
              backgroundCoverageAlpha =
                background.alpha + backgroundCoverageAlpha * (1 - background.alpha);
              backgroundChannels = blendChannels(
                background.channels,
                background.alpha,
                backgroundChannels,
              );
            }
            if (backgroundCoverageAlpha < 0.999999) return false;
            const effectiveChannelOpacity = Number.isFinite(channelOpacity)
              ? Math.min(1, Math.max(0, channelOpacity))
              : 1;
            const foregroundAlpha = foregroundPaint.alpha * effectiveChannelOpacity;
            const renderedForeground = blendChannels(
              foregroundPaint.channels,
              foregroundAlpha,
              backgroundChannels,
            );
            return contrastRatio(renderedForeground, backgroundChannels) >= 3;
          };
          const textNodes = [];
          const collectTextNodes = (node) => {
            for (const child of node.childNodes ?? []) {
              if (child.nodeType === 3 && child.textContent?.length) textNodes.push(child);
              else if (child.nodeType === 1) collectTextNodes(child);
            }
          };
          collectTextNodes(paintedElement);
          const normalizeText = (value) =>
            String(value ?? '')
              .replace(/[\u2060\u200B\u200C\u200D\uFEFF]/g, '')
              .replace(/\s+/g, ' ')
              .trim();
          if (
            normalizeText(paintedElement.innerText ?? paintedElement.textContent) !==
            normalizeText(expectedText)
          ) {
            return false;
          }
          const pointerTransparentOccluderAt = (owner, x, y) => {
            const couldPaint = (element) => {
              let cumulativeOpacity = 1;
              for (let current = element; current; current = current.parentElement) {
                const currentStyle = getComputedStyle(current);
                if (
                  current.hidden === true ||
                  currentStyle.display === 'none' ||
                  currentStyle.visibility === 'hidden' ||
                  currentStyle.visibility === 'collapse' ||
                  currentStyle.contentVisibility === 'hidden'
                ) {
                  return false;
                }
                const opacity = Number(currentStyle.opacity);
                if (Number.isFinite(opacity)) {
                  cumulativeOpacity *= Math.min(1, Math.max(0, opacity));
                }
                const filteredOpacity = safeFilterOpacity(currentStyle.filter);
                if (filteredOpacity !== null) cumulativeOpacity *= filteredOpacity;
                if (cumulativeOpacity < 0.1) return false;
              }
              return true;
            };
            const splitPaintList = (value) => {
              const entries = [];
              let depth = 0;
              let start = 0;
              const source = String(value || 'none');
              for (let index = 0; index < source.length; index += 1) {
                if (source[index] === '(') depth += 1;
                else if (source[index] === ')') depth = Math.max(0, depth - 1);
                else if (source[index] === ',' && depth === 0) {
                  entries.push(source.slice(start, index).trim());
                  start = index + 1;
                }
              }
              entries.push(source.slice(start).trim());
              return entries.filter((entry) => entry && entry !== 'none');
            };
            const shadowPaintsPoint = (value, candidateRect, allowSpread) =>
              splitPaintList(value).some((shadow) => {
                if (/\binset\b/i.test(shadow)) return false;
                const lengths = [...shadow.matchAll(/([+-]?(?:\d+\.?\d*|\.\d+))px/gi)].map(
                  (match) => Number(match[1]),
                );
                if (lengths.length < 2 || lengths.some((entry) => !Number.isFinite(entry))) {
                  return true;
                }
                const [offsetX, offsetY, blur = 0, spread = 0] = lengths;
                const expansion = Math.max(0, blur * 2 + (allowSpread ? spread : 0));
                return (
                  x >= candidateRect.left + offsetX - expansion &&
                  x <= candidateRect.right + offsetX + expansion &&
                  y >= candidateRect.top + offsetY - expansion &&
                  y <= candidateRect.bottom + offsetY + expansion
                );
              });
            const outlinePaintsPoint = (style, candidateRect) => {
              if ((style.outlineStyle || 'none') === 'none') return false;
              const outlineWidth = Number.parseFloat(String(style.outlineWidth || '0'));
              const outlineOffset = Number.parseFloat(String(style.outlineOffset || '0'));
              if (!Number.isFinite(outlineWidth) || !Number.isFinite(outlineOffset)) return true;
              if (outlineWidth <= 0) return false;
              const expansion = Math.max(0, outlineWidth + outlineOffset);
              const outsideBorderBox =
                x < candidateRect.left ||
                x > candidateRect.right ||
                y < candidateRect.top ||
                y > candidateRect.bottom;
              return (
                outsideBorderBox &&
                x >= candidateRect.left - expansion &&
                x <= candidateRect.right + expansion &&
                y >= candidateRect.top - expansion &&
                y <= candidateRect.bottom + expansion
              );
            };
            const filterPaintsPoint = (value, candidateRect) => {
              const normalized = String(value || 'none').trim().toLowerCase();
              if (!normalized || normalized === 'none') return false;
              const functions = [];
              for (let index = 0; index < normalized.length; ) {
                while (/\s/.test(normalized[index] || '')) index += 1;
                const nameStart = index;
                while (/[a-z-]/.test(normalized[index] || '')) index += 1;
                const name = normalized.slice(nameStart, index);
                if (!name || normalized[index] !== '(') return true;
                const argsStart = index + 1;
                let depth = 1;
                index += 1;
                while (index < normalized.length && depth > 0) {
                  if (normalized[index] === '(') depth += 1;
                  else if (normalized[index] === ')') depth -= 1;
                  index += 1;
                }
                if (depth !== 0) return true;
                functions.push({ name, args: normalized.slice(argsStart, index - 1) });
              }
              let bounds = {
                left: candidateRect.left,
                top: candidateRect.top,
                right: candidateRect.right,
                bottom: candidateRect.bottom,
              };
              for (const entry of functions) {
                const lengths = [...entry.args.matchAll(/([+-]?(?:\d+\.?\d*|\.\d+))px/gi)].map(
                  (match) => Number(match[1]),
                );
                if (entry.name === 'blur') {
                  const radius = lengths[0];
                  if (!Number.isFinite(radius)) return true;
                  const expansion = Math.max(0, radius * 2);
                  bounds = {
                    left: bounds.left - expansion,
                    top: bounds.top - expansion,
                    right: bounds.right + expansion,
                    bottom: bounds.bottom + expansion,
                  };
                } else if (entry.name === 'drop-shadow') {
                  if (lengths.length < 2 || lengths.some((length) => !Number.isFinite(length))) {
                    return true;
                  }
                  const [offsetX, offsetY, blur = 0] = lengths;
                  const expansion = Math.max(0, blur * 2);
                  const shadowBounds = {
                    left: bounds.left + offsetX - expansion,
                    top: bounds.top + offsetY - expansion,
                    right: bounds.right + offsetX + expansion,
                    bottom: bounds.bottom + offsetY + expansion,
                  };
                  bounds = {
                    left: Math.min(bounds.left, shadowBounds.left),
                    top: Math.min(bounds.top, shadowBounds.top),
                    right: Math.max(bounds.right, shadowBounds.right),
                    bottom: Math.max(bounds.bottom, shadowBounds.bottom),
                  };
                }
              }
              return (
                x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom
              );
            };
            const isProvablyBehindOwner = (candidate, owner) => {
              try {
                const candidateTopLayer =
                  candidate.closest?.(':popover-open, :modal') ||
                  (document.fullscreenElement?.contains(candidate)
                    ? document.fullscreenElement
                    : null);
                const ownerTopLayer =
                  owner.closest?.(':popover-open, :modal') ||
                  (document.fullscreenElement?.contains(owner) ? document.fullscreenElement : null);
                if (candidateTopLayer !== ownerTopLayer) {
                  if (ownerTopLayer && !candidateTopLayer) return true;
                  if (candidateTopLayer && !ownerTopLayer) return false;
                  const paintOrder = document.elementsFromPoint(x, y);
                  const ownerIndex = paintOrder.findIndex(
                    (element) =>
                      element === ownerTopLayer || ownerTopLayer?.contains?.(element),
                  );
                  const candidateIndex = paintOrder.findIndex(
                    (element) =>
                      element === candidateTopLayer || candidateTopLayer?.contains?.(element),
                  );
                  return ownerIndex >= 0 && candidateIndex > ownerIndex;
                }
              } catch {
                return false;
              }
              const createsStackingContext = (element, style) => {
                if (element === document.documentElement) return true;
                const position = String(style.position || 'static');
                const zIndex = String(style.zIndex || 'auto');
                const parentDisplay = String(
                  element.parentElement ? getComputedStyle(element.parentElement).display : '',
                );
                const isFlexOrGridItem = /^(?:inline-)?(?:flex|grid)$/.test(parentDisplay);
                const contain = String(style.contain || 'none');
                const willChange = String(style.willChange || 'auto')
                  .split(',')
                  .map((entry) => entry.trim());
                return (
                  ['fixed', 'sticky'].includes(position) ||
                  ((position !== 'static' || isFlexOrGridItem) && zIndex !== 'auto') ||
                  Number(style.opacity || '1') < 1 ||
                  String(style.transform || 'none') !== 'none' ||
                  String(style.scale || 'none') !== 'none' ||
                  String(style.rotate || 'none') !== 'none' ||
                  String(style.translate || 'none') !== 'none' ||
                  String(style.filter || 'none') !== 'none' ||
                  String(style.backdropFilter || style.webkitBackdropFilter || 'none') !== 'none' ||
                  String(style.perspective || 'none') !== 'none' ||
                  String(style.clipPath || style.webkitClipPath || 'none') !== 'none' ||
                  String(style.maskImage || style.webkitMaskImage || 'none') !== 'none' ||
                  String(
                    style.maskBorderSource ||
                      style.webkitMaskBoxImageSource ||
                      style.webkitMaskBoxImage ||
                      'none',
                  ) !== 'none' ||
                  String(style.isolation || 'auto') === 'isolate' ||
                  String(style.mixBlendMode || 'normal') !== 'normal' ||
                  String(style.containerType || 'normal') !== 'normal' ||
                  /\b(?:layout|paint|strict|content)\b/.test(contain) ||
                  willChange.some((entry) =>
                    [
                      'transform',
                      'scale',
                      'rotate',
                      'translate',
                      'opacity',
                      'filter',
                      'perspective',
                      'clip-path',
                      'mask',
                    ].includes(entry),
                  )
                );
              };
              const contextChain = (element) => {
                const ancestry = [];
                for (let current = element; current; current = current.parentElement) {
                  ancestry.unshift(current);
                }
                return ancestry.filter((current) =>
                  createsStackingContext(current, getComputedStyle(current)),
                );
              };
              const candidateChain = contextChain(candidate);
              const ownerChain = contextChain(owner);
              let index = 0;
              while (
                index < candidateChain.length &&
                index < ownerChain.length &&
                candidateChain[index] === ownerChain[index]
              ) {
                index += 1;
              }
              if (index >= candidateChain.length || index >= ownerChain.length) return false;
              const zOrder = (element) => {
                const parsed = Number.parseInt(String(getComputedStyle(element).zIndex || 'auto'), 10);
                return Number.isFinite(parsed) ? parsed : 0;
              };
              return zOrder(candidateChain[index]) < zOrder(ownerChain[index]);
            };
            const measuredPseudoRects = (candidate, pseudo, pseudoStyle) => {
              if (
                !document.createElement ||
                !candidate.insertBefore ||
                !candidate.append ||
                !candidate.setAttribute ||
                !candidate.removeAttribute ||
                !document.head?.append ||
                !pseudoStyle?.item ||
                !pseudoStyle?.getPropertyValue
              ) {
                return null;
              }
              const probe = document.createElement('span');
              probe.setAttribute('aria-hidden', 'true');
              for (let index = 0; index < pseudoStyle.length; index += 1) {
                const property = pseudoStyle.item(index);
                if (property) {
                  probe.style.setProperty(property, pseudoStyle.getPropertyValue(property), 'important');
                }
              }
              const content = String(pseudoStyle.content || '').trim();
              if (/^"(?:[^"\\]|\\.)*"$/.test(content)) {
                try {
                  probe.textContent = JSON.parse(content);
                } catch {
                  return null;
                }
              } else if (/^'(?:[^'\\]|\\.)*'$/.test(content)) {
                probe.textContent = content.slice(1, -1);
              } else if (!['', 'none', 'normal'].includes(content)) {
                return null;
              }
              const neutralPaint = {
                animation: 'none',
                'background-color': 'transparent',
                'background-image': 'none',
                'border-color': 'transparent',
                'box-shadow': 'none',
                color: 'transparent',
                content: 'normal',
                filter: 'none',
                opacity: '1',
                outline: 'none',
                'pointer-events': 'none',
                'text-decoration': 'none',
                'text-shadow': 'none',
                transition: 'none',
                visibility: 'visible',
                '-webkit-backdrop-filter': 'none',
              };
              for (const [property, value] of Object.entries(neutralPaint)) {
                probe.style.setProperty(property, value, 'important');
              }
              const marker = 'data-work0-pseudo-measure';
              const markerValue = pseudo === '::before' ? 'before' : 'after';
              const hadMarker = candidate.hasAttribute?.(marker) === true;
              const previousMarker = candidate.getAttribute?.(marker);
              const suppressionStyle = document.createElement('style');
              suppressionStyle.textContent =
                `[${marker}="${markerValue}"]::${markerValue}{content:none!important;display:none!important}`;
              try {
                candidate.setAttribute(marker, markerValue);
                document.head.append(suppressionStyle);
                const suppressedPseudo = getComputedStyle(candidate, pseudo);
                if (
                  suppressedPseudo.display !== 'none' ||
                  !['none', 'normal', ''].includes(
                    String(suppressedPseudo.content || 'none').trim(),
                  )
                ) {
                  return null;
                }
                if (pseudo === '::before') candidate.insertBefore(probe, candidate.firstChild);
                else candidate.append(probe);
                const rects = [...probe.getClientRects()].map((rect) => ({
                  bottom: rect.bottom,
                  height: rect.height,
                  left: rect.left,
                  right: rect.right,
                  top: rect.top,
                  width: rect.width,
                }));
                if (rects.length > 0) return rects;
                const rect = probe.getBoundingClientRect?.();
                return rect
                  ? [
                      {
                        bottom: rect.bottom,
                        height: rect.height,
                        left: rect.left,
                        right: rect.right,
                        top: rect.top,
                        width: rect.width,
                      },
                    ]
                  : null;
              } finally {
                probe.remove?.();
                suppressionStyle.remove?.();
                if (hadMarker) candidate.setAttribute(marker, previousMarker ?? '');
                else candidate.removeAttribute(marker);
              }
            };
            const pseudoOccludesPoint = (candidate, visiblePseudos, candidateCanCoverOwner) => {
              if (
                !candidate.setAttribute ||
                !candidate.removeAttribute ||
                !document.createElement ||
                !document.head?.append
              ) {
                return true;
              }
              const marker = 'data-work0-pseudo-probe';
              const hadMarker = candidate.hasAttribute?.(marker) === true;
              const previousMarker = candidate.getAttribute?.(marker);
              const probeStyle = document.createElement('style');
              probeStyle.textContent =
                `[${marker}="active"]::before,[${marker}="active"]::after{pointer-events:auto!important}`;
              let hitTestOccludes = false;
              let overrideFailures = [];
              try {
                candidate.setAttribute(marker, 'active');
                document.head.append(probeStyle);
                overrideFailures = visiblePseudos.filter(
                  ({ pseudo }) => getComputedStyle(candidate, pseudo).pointerEvents !== 'auto',
                );
                const topmost = document.elementsFromPoint(x, y)[0];
                hitTestOccludes = Boolean(
                  topmost && (topmost === candidate || candidate.contains(topmost)),
                );
              } finally {
                probeStyle.remove?.();
                if (hadMarker) candidate.setAttribute(marker, previousMarker ?? '');
                else candidate.removeAttribute(marker);
              }
              if (hitTestOccludes) return true;
              if (!candidateCanCoverOwner) return false;
              for (const { pseudo, pseudoStyle } of overrideFailures) {
                const pseudoRects = measuredPseudoRects(candidate, pseudo, pseudoStyle);
                if (
                  !pseudoRects ||
                  pseudoRects.some(
                    (rect) =>
                      x >= rect.left &&
                      x <= rect.right &&
                      y >= rect.top &&
                      y <= rect.bottom,
                  )
                ) {
                  return true;
                }
              }
              return false;
            };
            const candidates = document.querySelectorAll?.('body *') ?? [];
            for (const candidate of candidates) {
              if (candidate === owner || candidate.contains(owner)) continue;
              const style = getComputedStyle(candidate);
              const rawCandidateRect = candidate.getBoundingClientRect?.();
              const candidateCouldPaint = couldPaint(candidate);
              const candidateCanCoverOwner = !isProvablyBehindOwner(candidate, owner);
              if (
                candidateCouldPaint &&
                candidateCanCoverOwner &&
                rawCandidateRect &&
                (filterPaintsPoint(style.filter, rawCandidateRect) ||
                  (String(style.backdropFilter || style.webkitBackdropFilter || 'none').trim() !==
                    'none' &&
                    x >= rawCandidateRect.left &&
                    x <= rawCandidateRect.right &&
                    y >= rawCandidateRect.top &&
                    y <= rawCandidateRect.bottom))
              ) {
                return true;
              }
              if (candidateCouldPaint) {
                const visiblePseudos = [];
                for (const pseudo of ['::before', '::after']) {
                  const pseudoStyle = getComputedStyle(candidate, pseudo);
                  const content = String(pseudoStyle.content || 'none').trim();
                  if (
                    !['none', 'normal', ''].includes(content) &&
                    pseudoStyle.display !== 'none' &&
                    pseudoStyle.visibility !== 'hidden' &&
                    Number(pseudoStyle.opacity || '1') > 0 &&
                    safeFilterOpacity(pseudoStyle.filter) !== 0
                  ) {
                    visiblePseudos.push({ pseudo, pseudoStyle });
                    const hasExternalPaint =
                      String(pseudoStyle.filter || 'none').trim() !== 'none' ||
                      String(pseudoStyle.boxShadow || 'none').trim() !== 'none' ||
                      String(pseudoStyle.textShadow || 'none').trim() !== 'none' ||
                      (pseudoStyle.outlineStyle || 'none') !== 'none';
                    if (hasExternalPaint && candidateCanCoverOwner) {
                      const pseudoRects = measuredPseudoRects(candidate, pseudo, pseudoStyle);
                      if (
                        !pseudoRects ||
                        pseudoRects.some(
                          (pseudoRect) =>
                            filterPaintsPoint(pseudoStyle.filter, pseudoRect) ||
                            shadowPaintsPoint(pseudoStyle.boxShadow, pseudoRect, true) ||
                            shadowPaintsPoint(pseudoStyle.textShadow, pseudoRect, false) ||
                            outlinePaintsPoint(pseudoStyle, pseudoRect),
                        )
                      ) {
                        return true;
                      }
                    }
                  }
                }
                if (
                  visiblePseudos.length > 0 &&
                  pseudoOccludesPoint(candidate, visiblePseudos, candidateCanCoverOwner)
                ) {
                  return true;
                }
              }
              if (
                candidateCouldPaint &&
                candidateCanCoverOwner &&
                rawCandidateRect &&
                (shadowPaintsPoint(style.boxShadow, rawCandidateRect, true) ||
                  shadowPaintsPoint(style.textShadow, rawCandidateRect, false))
              ) {
                return true;
              }
              if (
                candidateCanCoverOwner &&
                rawCandidateRect &&
                outlinePaintsPoint(style, rawCandidateRect)
              ) {
                return true;
              }
              if (style.pointerEvents !== 'none') continue;
              const candidateRect = rawCandidateRect;
              if (
                !candidateRect ||
                !candidateCouldPaint ||
                candidateRect.width < 1 ||
                candidateRect.height < 1 ||
                x < candidateRect.left ||
                x > candidateRect.right ||
                y < candidateRect.top ||
                y > candidateRect.bottom
              ) {
                continue;
              }
              if (!candidate.style?.setProperty) return true;
              const previousValue = candidate.style.getPropertyValue('pointer-events');
              const previousPriority = candidate.style.getPropertyPriority('pointer-events');
              try {
                candidate.style.setProperty('pointer-events', 'auto', 'important');
                const topmost = document.elementsFromPoint(x, y)[0];
                if (topmost && (topmost === candidate || candidate.contains(topmost))) return true;
              } finally {
                if (previousValue) {
                  candidate.style.setProperty(
                    'pointer-events',
                    previousValue,
                    previousPriority,
                  );
                } else {
                  candidate.style.removeProperty('pointer-events');
                }
              }
            }
            return false;
          };
          const visibleText = textNodes
            .filter((node) => {
              const owner = node.parentElement;
              if (!owner || !readableTextPaint(owner)) return false;
              for (let current = owner; current; current = current.parentElement) {
                for (const pseudo of ['::before', '::after']) {
                  const pseudoStyle = getComputedStyle(current, pseudo);
                  const content = String(pseudoStyle.content || 'none').trim();
                  if (
                    !['none', 'normal', ''].includes(content) &&
                    pseudoStyle.display !== 'none' &&
                    pseudoStyle.visibility !== 'hidden' &&
                    Number(pseudoStyle.opacity || '1') > 0 &&
                    safeFilterOpacity(pseudoStyle.filter) !== 0
                  ) {
                    return false;
                  }
                }
              }
              const range = document.createRange();
              try {
                range.selectNodeContents(node);
                const rects = [...range.getClientRects()].filter(
                  (rect) => rect.width >= 1 && rect.height >= 1,
                );
                const expectedNodeGlyphCount = [...normalizeText(node.textContent)].filter(
                  (character) => !/\s/.test(character),
                ).length;
                if (
                  rects.some((rect) => rect.height < 8) ||
                  rects.reduce((total, rect) => total + rect.width, 0) <
                    expectedNodeGlyphCount * 2
                ) {
                  return false;
                }
                return rects.length > 0 && rects.every((rect) => {
                  const visibleRect = renderedRect(owner, rect, true);
                  if (
                    !visibleRect ||
                    visibleRect.visibleRatio < 0.999 ||
                    typeof document.elementsFromPoint !== 'function'
                  ) {
                    return false;
                  }
                  const overlapLeft = Math.max(visibleRect.left, targetVisibleRect.left);
                  const overlapTop = Math.max(visibleRect.top, targetVisibleRect.top);
                  const overlapRight = Math.min(visibleRect.right, targetVisibleRect.right);
                  const overlapBottom = Math.min(visibleRect.bottom, targetVisibleRect.bottom);
                  const overlapArea =
                    Math.max(0, overlapRight - overlapLeft) *
                    Math.max(0, overlapBottom - overlapTop);
                  if (overlapArea / (visibleRect.width * visibleRect.height) < 0.999) return false;
                  const insetX = Math.min(1, visibleRect.width / 4);
                  const insetY = Math.min(1, visibleRect.height / 4);
                  const points = [
                    [visibleRect.left + visibleRect.width / 2, visibleRect.top + visibleRect.height / 2],
                    [visibleRect.left + insetX, visibleRect.top + insetY],
                    [visibleRect.right - insetX, visibleRect.top + insetY],
                    [visibleRect.left + insetX, visibleRect.bottom - insetY],
                    [visibleRect.right - insetX, visibleRect.bottom - insetY],
                  ];
                  return points.every(([x, y]) => {
                    const topmost = document.elementsFromPoint(x, y)[0];
                    return Boolean(
                      topmost === owner && !pointerTransparentOccluderAt(owner, x, y),
                    );
                  });
                });
              } finally {
                range.detach?.();
              }
            })
            .map((node) => node.textContent ?? '')
            .join('');
          return normalizeText(visibleText) === normalizeText(expectedText);
        }, {
          paintedElement: paintedHandle,
          expectedText: effect.text ?? effect.name,
        });
        if (targetMatched) {
          const targetHandle =
            typeof page.screenshot === 'function' ? await target.elementHandle() : null;
          try {
            targetMatched =
              (typeof page.screenshot !== 'function' || Boolean(targetHandle)) &&
              (await screenshotConfirmsPaintedText(
                page,
                paintedHandle,
                targetHandle,
                effect.text ?? effect.name,
              ));
          } finally {
            await targetHandle?.dispose?.().catch(() => {});
          }
        }
        if (targetMatched) break;
      } catch {
        // Keep looking: unrelated, detached, clipped, or transparent text is not evidence.
      } finally {
        await paintedHandle?.dispose?.().catch(() => {});
      }
    }
    if (!targetMatched) continue;
    renderedOccurrence += 1;
    if (renderedOccurrence === effect.occurrence) return target;
  }
  return null;
}

export async function locateExactNavigationTarget(page, item) {
  if (item.locator.strategy === 'role') {
    const target = await visibleLocatorAt(
      page.getByRole(item.locator.role, { name: item.locator.name, exact: true }),
      item.occurrence,
    );
    if (!target) return null;
    const paintedCandidates = page.getByText(item.label, { exact: true });
    const count = Math.min(await paintedCandidates.count(), 50);
    for (let index = 0; index < count; index += 1) {
      const painted = paintedCandidates.nth(index);
      if (!(await painted.isVisible().catch(() => false))) continue;
      let paintedHandle = null;
      try {
        paintedHandle = await painted.elementHandle();
        if (!paintedHandle) continue;
        const bound = await target.evaluate((targetElement, paintedElement) => {
          if (
            targetElement === paintedElement ||
            targetElement.contains(paintedElement) ||
            paintedElement.contains(targetElement)
          ) {
            return true;
          }
          let common = targetElement;
          let targetDepth = 0;
          while (common && !common.contains(paintedElement) && targetDepth <= 2) {
            common = common.parentElement;
            targetDepth += 1;
          }
          let cursor = paintedElement;
          let paintedDepth = 0;
          while (cursor && cursor !== common && paintedDepth <= 1) {
            cursor = cursor.parentElement;
            paintedDepth += 1;
          }
          if (!common || cursor !== common || targetDepth > 2 || paintedDepth > 1) return false;
          const targetRect = targetElement.getBoundingClientRect();
          const paintedRect = paintedElement.getBoundingClientRect();
          const horizontalOverlap =
            Math.min(targetRect.right, paintedRect.right) -
            Math.max(targetRect.left, paintedRect.left);
          const verticalOverlap =
            Math.min(targetRect.bottom, paintedRect.bottom) -
            Math.max(targetRect.top, paintedRect.top);
          return horizontalOverlap > 0 && verticalOverlap > 0;
        }, paintedHandle);
        if (bound) return target;
      } catch {
        // Keep looking: a detached duplicate label is not target evidence.
      } finally {
        await paintedHandle?.dispose?.().catch(() => {});
      }
    }
    return null;
  }

  const painted = await visibleLocatorAt(
    page.getByText(item.label, { exact: true }),
    item.occurrence,
  );
  if (!painted) return null;
  const roleSelector =
    item.locator.role === 'button'
      ? 'self::button or @role="button"'
      : item.locator.role === 'link'
        ? 'self::a or @role="link"'
        : '@role="tab"';
  const target = painted.locator(`xpath=ancestor-or-self::*[${roleSelector}][1]`);
  if (
    (await target.count()) === 0 ||
    !(await target
      .first()
      .isVisible()
      .catch(() => false))
  ) {
    return null;
  }
  if (typeof target.and !== 'function') return null;
  const exactRoleTarget = target.and(
    page.getByRole(item.locator.role, { name: item.locator.name, exact: true }),
  );
  if (
    (await exactRoleTarget.count()) !== 1 ||
    !(await exactRoleTarget
      .first()
      .isVisible()
      .catch(() => false))
  ) {
    return null;
  }
  return exactRoleTarget.first();
}

export async function exactNavigationEffectPassed(page, item) {
  if (item.effect.type === 'selected') {
    const target = await locateExactNavigationTarget(page, item);
    if (!target) return false;
    return (await target.getAttribute('aria-selected')) === String(item.effect.value);
  }
  if (item.effect.type === 'visible') {
    return Boolean(await exactRenderedRoleTarget(page, item.effect));
  }
  const options = item.effect.name ? { name: item.effect.name, exact: true } : undefined;
  const target = await visibleLocatorAt(
    page.getByRole(item.effect.role, options),
    item.effect.occurrence,
  );
  return target ? (await target.inputValue().catch(() => null)) === item.effect.value : false;
}

function attachNavigationProbeHealth(page, baseUrl, sourceUrl) {
  attachFontResponseEvidence(page);
  const health = createShotHealth();
  const networkTracker = createShotNetworkTracker();
  const blockedRequests = new WeakSet();
  let blockedMutation = false;
  page.on('console', (message) => {
    recordShotConsole(health, message);
  });
  page.on('pageerror', () => recordShotFailure(health, 'page-error'));
  page.on('request', (request) => networkTracker.start(request, health));
  page.on('requestfailed', (request) => {
    if (blockedRequests.has(request)) networkTracker.finish(request);
    else networkTracker.fail(request);
  });
  page.on('requestfinished', (request) => networkTracker.finish(request));
  page.on('response', (response) => {
    const request = response.request();
    let expectedDeepLink404 = false;
    try {
      expectedDeepLink404 =
        response.status() === 404 &&
        response.url() === sourceUrl &&
        request.isNavigationRequest() &&
        request.frame() === page.mainFrame();
    } catch {
      expectedDeepLink404 = false;
    }
    networkTracker.response(request, baseUrl, response.url(), response.status(), {
      ignoreAsset404: expectedDeepLink404,
    });
  });
  return {
    health,
    blockedRequests,
    markBlockedMutation(request) {
      blockedMutation = true;
      blockedRequests.add(request);
    },
    mutationWasBlocked() {
      return blockedMutation;
    },
    resetBlockedMutation() {
      blockedMutation = false;
    },
  };
}

export function navigationProbeFailureCode(baseUrl, health, mutationBlocked) {
  if (mutationBlocked) return 'mutation-blocked';
  if ((Number(health?.pendingRequests) || 0) > 0) return 'source-health';
  return shotFailureCodes({ baseUrl, ...health }).length ? 'source-health' : null;
}

export function isCaptureNoticeReadRequest(request, noticeReadOrigin, setupPhase) {
  if (setupPhase !== true || !request || typeof noticeReadOrigin !== 'string') return false;
  try {
    const expected = new URL(noticeReadOrigin);
    const actual = new URL(request.url());
    return (
      request.method() === 'POST' &&
      actual.origin === expected.origin &&
      actual.pathname === '/rest/v1/user_notice_reads'
    );
  } catch {
    return false;
  }
}

export async function verifyPostNavigationEffect(
  page,
  { baseUrl, route, postNavigation, health, mutationWasBlocked },
  hooks = {},
) {
  const checkEffect =
    hooks.checkEffect ??
    ((effect) => exactNavigationEffectPassed(page, { effect }));
  const findRenderedRoleTarget =
    hooks.findRenderedRoleTarget ??
    ((effect) => exactRenderedRoleTarget(page, effect));
  const waitForIdle = hooks.waitForIdle ?? (() => waitForShotNetworkIdle(page, health));
  const settle = hooks.settle ?? ((milliseconds) => page.waitForTimeout(milliseconds));
  const routeMatches = () => {
    try {
      validateFinalUrl(baseUrl, route, page.url());
      return true;
    } catch {
      return false;
    }
  };
  const healthFailure = async () => {
    try {
      await waitForIdle();
    } catch {
      return 'source-health';
    }
    return navigationProbeFailureCode(baseUrl, health, mutationWasBlocked());
  };

  let effectPassed = await checkEffect(postNavigation.effect);
  if (!effectPassed && postNavigation.reveal) {
    const reveal = postNavigation.reveal;
    const revealTarget = await findRenderedRoleTarget({
      role: reveal.role,
      name: reveal.name,
      text: reveal.name,
      occurrence: reveal.occurrence,
    });
    if (!revealTarget) return { passed: false, evidence: null, failure: 'reveal-target' };
    try {
      await revealTarget.click({ timeout: 5000 });
    } catch {
      return { passed: false, evidence: null, failure: 'click-failed' };
    }
    await settle(350);
    if (!routeMatches()) return { passed: false, evidence: null, failure: 'route-mismatch' };
    const revealFailure = await healthFailure();
    if (revealFailure) return { passed: false, evidence: null, failure: revealFailure };
    effectPassed = await checkEffect(postNavigation.effect);
  }
  if (!effectPassed) return { passed: false, evidence: null, failure: 'effect-mismatch' };
  if (!routeMatches()) return { passed: false, evidence: null, failure: 'route-mismatch' };
  const finalFailure = await healthFailure();
  if (finalFailure) return { passed: false, evidence: null, failure: finalFailure };
  if (!routeMatches()) return { passed: false, evidence: null, failure: 'route-mismatch' };
  const finalNetworkRevision = Number(health?.networkRevision) || 0;
  if (!(await checkEffect(postNavigation.effect))) {
    return { passed: false, evidence: null, failure: 'effect-mismatch' };
  }
  await settle(50);
  if (!routeMatches()) return { passed: false, evidence: null, failure: 'route-mismatch' };
  if (
    (Number(health?.pendingRequests) || 0) > 0 ||
    (Number(health?.networkRevision) || 0) !== finalNetworkRevision
  ) {
    return { passed: false, evidence: null, failure: 'source-health' };
  }
  const postEffectFailure = navigationProbeFailureCode(baseUrl, health, mutationWasBlocked());
  if (postEffectFailure) {
    return { passed: false, evidence: null, failure: postEffectFailure };
  }
  if (!routeMatches()) return { passed: false, evidence: null, failure: 'route-mismatch' };
  if (!(await checkEffect(postNavigation.effect))) {
    return { passed: false, evidence: null, failure: 'effect-mismatch' };
  }
  if (!routeMatches()) return { passed: false, evidence: null, failure: 'route-mismatch' };
  if (
    (Number(health?.pendingRequests) || 0) > 0 ||
    (Number(health?.networkRevision) || 0) !== finalNetworkRevision
  ) {
    return { passed: false, evidence: null, failure: 'source-health' };
  }
  const acceptanceFailure = navigationProbeFailureCode(baseUrl, health, mutationWasBlocked());
  if (acceptanceFailure) {
    return { passed: false, evidence: null, failure: acceptanceFailure };
  }
  return {
    passed: true,
    evidence: `exact-route+${postNavigation.effect.type}-effect`,
  };
}

async function probeExactNavigationItem(sourcePage, baseUrl, sourceRoute, item, noticeReadOrigin) {
  const probe = await sourcePage.context().newPage();
  const sourceUrl = resolveHostedAppUrl(baseUrl, sourceRoute);
  const probeHealth = attachNavigationProbeHealth(probe, baseUrl, sourceUrl);
  let setupPhase = true;
  let stage = 'probe-setup';
  try {
    await probe.route('**/*', async (route) => {
      const request = route.request();
      if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
        await route.continue();
        return;
      }
      if (isCaptureNoticeReadRequest(request, noticeReadOrigin, setupPhase)) {
        await route.fulfill({ status: 201, contentType: 'application/json', body: '' });
        return;
      }
      probeHealth.markBlockedMutation(request);
      await route.abort('blockedbyclient');
    });
    stage = 'source-route';
    const response = await probe.goto(sourceUrl, {
      waitUntil: 'load',
      timeout: 90000,
    });
    if (!response || response.status() >= 400) {
      await probe.goto(resolveHostedAppUrl(baseUrl, '/'), {
        waitUntil: 'load',
        timeout: 90000,
      });
      await probe.waitForTimeout(1200);
      await navigateHostedAppRoute(probe, baseUrl, sourceRoute);
    }
    await waitForSettledPage(probe);
    await waitForShotNetworkIdle(probe, probeHealth.health);
    await probe.waitForTimeout(300);
    await dismissNoticeOverlay(probe);
    await dismissCaptureOverlays(probe);
    await waitForShotNetworkIdle(probe, probeHealth.health);
    validateFinalUrl(baseUrl, sourceRoute, probe.url());
    const sourceFailure = navigationProbeFailureCode(
      baseUrl,
      probeHealth.health,
      probeHealth.mutationWasBlocked(),
    );
    if (sourceFailure) {
      return { passed: false, evidence: null, failure: sourceFailure };
    }

    stage = 'painted-label';
    const painted = await visibleLocatorAt(
      probe.getByText(item.label, { exact: true }),
      item.occurrence,
    );
    if (!painted) return { passed: false, evidence: null, failure: 'painted-label' };
    stage = 'action-target';
    const target = await locateExactNavigationTarget(probe, item);
    if (!target) return { passed: false, evidence: null, failure: 'action-target' };
    setupPhase = false;
    probeHealth.resetBlockedMutation();
    stage = 'click-failed';
    await target.click({ timeout: 5000 });

    if (item.kind === 'route') {
      stage = 'route-mismatch';
      await probe.waitForURL(
        (url) => {
          try {
            validateFinalUrl(baseUrl, item.to, url.href);
            return true;
          } catch {
            return false;
          }
        },
        { timeout: 10000 },
      );
      validateFinalUrl(baseUrl, item.to, probe.url());
      await probe.waitForTimeout(350);
      stage = 'source-health';
      await waitForShotNetworkIdle(probe, probeHealth.health);
      const routeFailure = navigationProbeFailureCode(
        baseUrl,
        probeHealth.health,
        probeHealth.mutationWasBlocked(),
      );
      if (routeFailure) return { passed: false, evidence: null, failure: routeFailure };
      if (item.postNavigation) {
        return verifyPostNavigationEffect(probe, {
          baseUrl,
          route: item.to,
          postNavigation: item.postNavigation,
          health: probeHealth.health,
          mutationWasBlocked: () => probeHealth.mutationWasBlocked(),
        });
      }
      return { passed: true, evidence: 'exact-route' };
    }

    await probe.waitForTimeout(350);
    validateFinalUrl(baseUrl, sourceRoute, probe.url());
    stage = 'source-health';
    await waitForShotNetworkIdle(probe, probeHealth.health);
    const actionFailure = navigationProbeFailureCode(
      baseUrl,
      probeHealth.health,
      probeHealth.mutationWasBlocked(),
    );
    if (actionFailure) return { passed: false, evidence: null, failure: actionFailure };
    const passed = await exactNavigationEffectPassed(probe, item);
    return {
      passed,
      evidence: passed ? `${item.effect.type}-effect` : null,
      ...(passed ? {} : { failure: 'effect-mismatch' }),
    };
  } catch {
    return { passed: false, evidence: null, failure: stage };
  } finally {
    await probe.close().catch(() => {});
  }
}

export async function dismissCaptureOverlays(page) {
  for (let pass = 0; pass < CAPTURE_OVERLAY_MAX_PASSES; pass += 1) {
    let clicked = false;
    const scope = page.locator(CAPTURE_OVERLAY_SCOPE_SELECTOR);
    if ((await scope.count()) > 0) {
      for (const label of CAPTURE_OVERLAY_LABELS) {
        const button = scope.getByRole('button', { name: label, exact: true });
        clicked = await clickFirstOverlayCandidate(button);
        if (!clicked) {
          clicked = await clickFirstOverlayCandidate(allowlistedTextAction(scope, label));
        }
        if (clicked) {
          break;
        }
      }
    }
    await page.waitForTimeout(
      clicked ? CAPTURE_OVERLAY_DISMISS_SETTLE_MS : CAPTURE_OVERLAY_RECHECK_MS,
    );
  }
  await page.waitForTimeout(500);
}

export async function dismissNoticeOverlay(page) {
  for (let pass = 0; pass < CAPTURE_OVERLAY_MAX_PASSES; pass += 1) {
    const scope = page.locator(CAPTURE_OVERLAY_SCOPE_SELECTOR);
    let clicked = false;
    const scopeCount = Math.min(await scope.count(), 10);
    for (let index = 0; index < scopeCount && !clicked; index += 1) {
      const candidate = scope.nth(index);
      const close = candidate.getByRole('button', { name: '공지 닫기', exact: true });
      if ((await close.count()) === 0) continue;
      clicked = await clickFirstOverlayCandidate(close);
      if (!clicked) {
        clicked = await clickFirstOverlayCandidate(
          candidate.getByRole('button', { name: '확인', exact: true }),
        );
      }
    }
    await page.waitForTimeout(
      clicked ? CAPTURE_OVERLAY_DISMISS_SETTLE_MS : CAPTURE_OVERLAY_RECHECK_MS,
    );
  }
  await page.waitForTimeout(500);
}

async function scoreOne({
  page,
  id,
  route,
  baseUrl,
  ramp,
  navFile,
  deviations,
  manualEvidence,
  activeShot,
  noticeReadOrigin,
}) {
  await navigateHostedAppRoute(page, baseUrl, route);
  await waitForSettledPage(page);
  await waitForShotNetworkIdle(page, activeShot);
  let failureCodes = shotFailureCodes({ baseUrl, ...activeShot });
  if (failureCodes.length) throw new CaptureContractError(failureCodes);
  await dismissCaptureOverlays(page);
  await waitForShotNetworkIdle(page, activeShot);
  validateFinalUrl(baseUrl, route, page.url());
  failureCodes = shotFailureCodes({ baseUrl, ...activeShot });
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
      reviewedPass: false,
      unmeasured: ['A', 'B', 'C', 'D', 'E'],
      error: 'page-not-settled',
    };
  }

  const manualReviewAxes = [];
  const requireManualReview = (axis) => {
    if (!manualReviewAxes.includes(axis)) manualReviewAxes.push(axis);
  };
  const applyDeviation = (axis, score) => {
    if (!exempt(id, axis, deviations)) return score;
    requireManualReview(axis);
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
  const C = null;
  const cWhy = '축 꺼짐 — 눈금이 화면을 구별 못 함(자기 짝 찾기 0/6, 무작위 1/6보다 낮음)';

  const navigationSpec = navFile?.[id];
  let navigation;
  if (Array.isArray(navigationSpec)) {
    navigation = scoreNavigationLabels(
      navigationSpec,
      app.interactive,
      exemptItems(id, 'D', deviations),
      { baseUrl },
    );
  } else if (navigationSpec?.version === 2) {
    const contract = normalizeNavigationContract(navigationSpec, baseUrl);
    const results = await runExactNavigationChecks(contract, (item) =>
      probeExactNavigationItem(page, baseUrl, route, item, noticeReadOrigin),
    );
    navigation = scoreExactNavigationResults(
      contract,
      results,
      exemptItems(id, 'D', deviations),
      manualEvidence,
    );
  } else {
    navigation = scoreNavigationLabels(null, app.interactive, [], { baseUrl });
  }
  if (navigation.requiresManualReview) requireManualReview('D');
  const D = applyDeviation('D', navigation.score);

  const copy = reference
    ? scoreCopyCoverage(
        referenceCopyTexts(reference),
        app.texts,
        app.groups,
        exemptItems(id, 'E', deviations),
      )
    : null;
  if (copy?.requiresManualReview) requireManualReview('E');
  const E = applyDeviation('E', copy?.score ?? null);

  await page.waitForTimeout(100);
  await waitForShotNetworkIdle(page, activeShot);
  const finalFailureCodes = shotFailureCodes({ baseUrl, ...activeShot });
  if (finalFailureCodes.length) throw new CaptureContractError(finalFailureCodes);

  const raw = { A, B, C, D, E };
  const { scores, total, unmeasured } = renormalizeScores(raw);
  const reviewedManualAxes = reviewedNavigationAxes(id, deviations, navigation);
  return {
    id,
    route,
    ...scores,
    total,
    automaticPass: isAutomaticPass(total, unmeasured, manualReviewAxes),
    reviewedPass: isReviewedPass(total, unmeasured, manualReviewAxes, reviewedManualAxes),
    unmeasured,
    manualReviewAxes,
    reviewedManualAxes,
    missD: navigation.missing,
    missE: copy?.missing ?? [],
    offTop: tokenPixels.offTop,
    details: { navigation, copy },
    why: {
      A: `curves ${app.curves} · rounds ${app.rounds} · blur ${app.blurs} · alpha ${app.alphas}`,
      B:
        tokenPixels.paintedPixels > 0
          ? `token pixels ${round1(tokenPixels.ratio * 100)}% (${tokenPixels.inRampPixels}/${tokenPixels.paintedPixels})${
              tokenPixels.offTop.length
                ? ` · off-ramp ${tokenPixels.offTop.map((entry) => `${entry.hex} ${entry.pixels}`).join(' / ')}`
                : ''
            }`
          : 'no painted pixels',
      C: cWhy,
      D: formatNavigationWhy(navigation),
      E: copy
        ? `declared ${copy.declared} · measured ${copy.total} · exempt ${copy.exempted} · missing ${copy.missing.length}${
            copy.missing.length
              ? ` → ${copy.missing
                  .slice(0, 8)
                  .map((text) => text.slice(0, 24))
                  .join(' / ')}`
              : ''
          }${copy.requiresManualReview ? ' · manual review: item deviations exceed half' : ''}`
        : 'reference structure missing',
    },
  };
}

function readJson(file, fallback) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
}

async function loginForQa(page, baseUrl, runtimeEnv) {
  const env = readFileSync(path.join(REPO, '.env.test'), 'utf8');
  const email = (/^QA_TEST_EMAIL=(.*)$/m.exec(env) ?? [])[1]?.trim();
  const password = (/^QA_TEST_PASSWORD=(.*)$/m.exec(env) ?? [])[1]?.trim();
  await fillQaLogin(page, { baseUrl, email, password, env: runtimeEnv });
}

export async function main(args = process.argv.slice(2), env = process.env, dataDir = DATA) {
  let screensFile;
  let routesFile;
  let tokens;
  let navFile;
  let deviations;
  try {
    screensFile = readJson(path.join(dataDir, 'screens.json'), { screens: [] });
    routesFile = readJson(path.join(dataDir, 'app-routes.json'), {});
    tokens = readJson(path.join(dataDir, 'tokens.json'), {});
    navFile = readJson(path.join(dataDir, 'nav.json'), {});
    deviations = readJson(path.join(dataDir, 'deviations.json'), { deviations: [] });
  } catch {
    console.error('invalid input manifest');
    return 2;
  }
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
  if (!validateStage1NavigationContracts(classification.stats.stage1, navFile, baseUrl)) {
    console.error('invalid Stage 1 navigation contract');
    return 2;
  }
  let ramps;
  try {
    ramps = new Map(
      targetIds.map((id) => [id, tokenRamp(tokens, id, classification.targetIds)]),
    );
  } catch {
    console.error('invalid token ramp contract');
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
  const output = env.SCORE_OUT || path.join(DATA, 'score.json');
  const rows = [];
  let manualEvidenceByScreen = new Map();
  let markerTime;
  let determinismScript;
  try {
    markerTime = resolveCaptureMarkerTime(env, environmentAttestation.printedAt);
    determinismScript = makeCaptureDeterminismScript(markerTime);
  } catch {
    console.error('FIXED_ISO must be a valid date');
    return 2;
  }
  let browser;
  let browserVersion;
  try {
    browser = await chromium.launch(browserLaunchOptions(env, chromium));
    browserVersion = validateBrowserRuntime(browser);
    const context = await browser.newContext(captureContextOptions());
    const page = await context.newPage();
    let activeShot = createShotHealth({
      noticeReadOrigin: environmentAttestation.previewEnv.EXPO_PUBLIC_SUPABASE_URL,
    });
    const networkTracker = createShotNetworkTracker();
    page.on('console', (message) => {
      recordShotConsole(activeShot, message);
    });
    page.on('pageerror', () => {
      recordShotFailure(activeShot, 'page-error');
    });
    page.on('request', (request) => {
      networkTracker.start(request, activeShot);
    });
    page.on('requestfailed', (request) => {
      networkTracker.fail(request);
    });
    page.on('requestfinished', (request) => {
      networkTracker.finish(request);
    });
    page.on('response', (response) => {
      networkTracker.response(response.request(), baseUrl, response.url(), response.status());
    });
    await page.goto(resolveHostedAppUrl(baseUrl, '/'), { waitUntil: 'load', timeout: 90000 });
    await page.waitForTimeout(2500);
    await waitForShotNetworkIdle(page, activeShot);
    const bootstrapFailureCodes = shotFailureCodes({ baseUrl, ...activeShot });
    if (bootstrapFailureCodes.length) throw new CaptureContractError(bootstrapFailureCodes);
    const servedExport = await attestServedExport(
      page,
      environmentAttestation.previewEnv,
      environmentAttestation.receipt,
    );
    try {
      const contracts = Object.fromEntries(
        targetIds
          .filter((id) => navFile?.[id]?.version === 2)
          .map((id) => [id, normalizeNavigationContract(navFile[id], baseUrl)]),
      );
      manualEvidenceByScreen = loadManualEffectEvidence(env, {
        contracts,
        targetIds,
        exportSha256: servedExport.exportSha256,
        exportedAt: servedExport.exportedAt,
        now: Date.now(),
      });
    } catch {
      console.error('invalid manual effect evidence');
      return 2;
    }
    await waitForShotNetworkIdle(page, activeShot);
    await page.addScriptTag({ content: makeCaptureInitScript(markerTime) });
    await loginForQa(page, baseUrl, env);
    await waitForShotNetworkIdle(page, activeShot);
    const loginFailureCodes = shotFailureCodes({ baseUrl, ...activeShot });
    if (loginFailureCodes.length) throw new CaptureContractError(loginFailureCodes);
    // Dismissing the authenticated notice is capture setup, not screen evidence.
    // A duplicate append-only read may return HTTP 409 and Chromium reports that
    // handled response as a console error. Tolerate only that classified conflict;
    // every other setup health failure remains fatal. The dismissal also seeds the
    // shared local read mirror before fresh exact-navigation probe pages open.
    await dismissNoticeOverlay(page);
    await dismissCaptureOverlays(page);
    await waitForShotNetworkIdle(page, activeShot);
    const setupFailureCodes = captureSetupFailureCodes(baseUrl, activeShot);
    if (setupFailureCodes.length) throw new CaptureContractError(setupFailureCodes);
    activeShot = createShotHealth();
    // Auth and hydration use real time. Target components then mount through
    // the client router after deterministic Date/random are installed.
    await page.addScriptTag({ content: determinismScript });

    for (const id of targetIds) {
      const route = routesFile.routes[id];
      activeShot = createShotHealth();
      try {
        rows.push(
          await scoreOne({
            page,
            id,
            route,
            baseUrl,
            ramp: ramps.get(id),
            navFile,
            deviations,
            manualEvidence: manualEvidenceByScreen.get(id) ?? null,
            activeShot,
            noticeReadOrigin: environmentAttestation.previewEnv.EXPO_PUBLIC_SUPABASE_URL,
          }),
        );
      } catch (error) {
        rows.push({
          id,
          route,
          total: null,
          automaticPass: false,
          reviewedPass: false,
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
    manualEffectEvidenceAttested: manualEvidenceByScreen.size > 0,
    browserVersion,
    navigationContract: 'data/nav.json',
    weights: WEIGHTS,
    rows,
  };
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  const exitCode = reportExitCode(report);
  const passed = rows.filter((row) => row.automaticPass === true).length;
  const reviewed = rows.filter((row) => row.reviewedPass === true).length;
  console.log(`scored ${rows.length} · >=98 automatic ${passed} · reviewed ${reviewed}`);
  return exitCode;
}

const invoked =
  process.argv[1] && samePlatformPath(process.argv[1], fileURLToPath(import.meta.url));
if (invoked) process.exitCode = await main();
