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

const norm = (value) =>
  String(value ?? '')
    .replace(/[\u2060\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const tight = (value) => norm(value).split(' ').join('');
const SEP = String.fromCharCode(1);
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
  if (
    Object.keys(env).some((key) => WORK0_RESERVED_ENV.has(key.toUpperCase()))
  ) {
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
  validateServedExportSources(servedFiles, previewEnv, receipt, servedAttestation, scriptContract);
}

export function createShotHealth() {
  return { failureCodes: [], pendingRequests: 0, networkRevision: 0 };
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

export function recordShotResponse(health, baseUrl, responseUrl, status) {
  if (status !== 404) return;
  try {
    const base = parseBaseUrl(baseUrl);
    const response = new URL(responseUrl);
    if (
      response.origin === base.origin &&
      (response.pathname === '/2nd-B' || response.pathname.startsWith('/2nd-B/'))
    ) {
      recordShotFailure(health, 'asset-404');
    }
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
    if (failed && Number.isInteger(responseStatus) && responseStatus >= 200 && responseStatus < 300) {
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
    response(request, baseUrl, responseUrl, status) {
      if (owners.has(request) && Number.isInteger(status)) responseStatuses.set(request, status);
      recordShotResponse(owners.get(request), baseUrl, responseUrl, status);
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
    const raw = match[1].split(/\s+round\s+/i)[0].trim().split(/\s+/);
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
    const hasAlpha = normalized.includes('/') || (normalized.startsWith('rgba(') && components.length > 3);
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
    if (
      cumulativeOpacity < 0.1 ||
      (!isRoot && (width < 2 || height < 2 || visibleRatio < 0.1))
    )
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
        textNodeRects(node, fallbackRect).some((rect) =>
          renderedRect(element, isRoot, rect, true),
        ),
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

export function scoreNavigationLabels(declared, appTexts, appGroups = [], exempted = []) {
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
      missing: [],
    };
  }
  const skipped = new Set(exempted.map(tight).filter(Boolean));
  const scored = declared.filter((label) => !skipped.has(tight(label)));
  const textBlob = [...appTexts, ...appGroups].map(tight).filter(Boolean).join(SEP);
  const missing = [];
  let matched = 0;
  for (const label of scored) {
    const normalized = tight(label).replace(/[…·]+$/u, '');
    const probe = normalized.slice(0, Math.max(2, Math.min(normalized.length, 8)));
    if (probe && textBlob.includes(probe)) matched += 1;
    else missing.push(label);
  }
  const ratio = scored.length ? matched / scored.length : 1;
  return {
    score: ratio * WEIGHTS.D,
    max: WEIGHTS.D,
    measurable: true,
    ratio,
    matched,
    declared: declared.length,
    measured: scored.length,
    exempted: declared.length - scored.length,
    missing,
  };
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
  const skipped = new Set(exempted.map(tight).filter(Boolean));
  const expected = (Array.isArray(referenceTexts) ? referenceTexts : [])
    .map(tight)
    .filter((text) => text && !skipped.has(text));
  const rendered = [...appTexts, ...appGroups].map(tight).filter(Boolean);
  const missing = expected.filter((text) => !rendered.some((actual) => actual.includes(text)));
  const matched = expected.length - missing.length;
  const ratio = expected.length ? matched / expected.length : 1;
  return {
    matched,
    total: expected.length,
    ratio,
    score: ratio * WEIGHTS.E,
    exempted: skipped.size,
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
  return rows.some((row) => row?.error || row?.automaticPass !== true) ? 1 : 0;
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
    const raw = match[1].split(/\s+round\s+/i)[0].trim().split(/\s+/);
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
    const hasAlpha = normalized.includes('/') || (normalized.startsWith('rgba(') && components.length > 3);
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

export async function dismissCaptureOverlays(page) {
  const labels = ['다시 보지 않기', '건너뛰기', '알겠습니다', '오늘은 그만 보겠습니다'];
  for (let pass = 0; pass < 3; pass += 1) {
    let clicked = false;
    for (const label of labels) {
      const candidate = page.getByText(label, { exact: false });
      if ((await candidate.count()) === 0) continue;
      clicked = await candidate
        .first()
        .click()
        .then(() => true)
        .catch(() => false);
      if (clicked) {
        await page.waitForTimeout(800);
        break;
      }
    }
    if (!clicked) break;
  }
  await page.waitForTimeout(500);
}

async function scoreOne({ page, id, route, baseUrl, ramp, navFile, deviations, activeShot }) {
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
      unmeasured: ['A', 'B', 'C', 'D', 'E'],
      error: 'page-not-settled',
    };
  }

  const manualReviewAxes = [];
  const applyDeviation = (axis, score) => {
    if (!exempt(id, axis, deviations)) return score;
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
  const C = null;
  const cWhy =
    '축 꺼짐 — 눈금이 화면을 구별 못 함(자기 짝 찾기 0/6, 무작위 1/6보다 낮음)';

  const declared = Array.isArray(navFile?.[id]) ? navFile[id] : null;
  const navigation = scoreNavigationLabels(
    declared,
    app.texts,
    app.groups,
    exemptItems(id, 'D', deviations),
  );
  const D = applyDeviation('D', navigation.score);

  const copy = reference
    ? scoreCopyCoverage(
        referenceCopyTexts(reference),
        app.texts,
        app.groups,
        exemptItems(id, 'E', deviations),
      )
    : null;
  const E = applyDeviation('E', copy?.score ?? null);

  await page.waitForTimeout(100);
  await waitForShotNetworkIdle(page, activeShot);
  const finalFailureCodes = shotFailureCodes({ baseUrl, ...activeShot });
  if (finalFailureCodes.length) throw new CaptureContractError(finalFailureCodes);

  const raw = { A, B, C, D, E };
  const { scores, total, unmeasured } = renormalizeScores(raw);
  return {
    id,
    route,
    ...scores,
    total,
    automaticPass: isAutomaticPass(total, unmeasured, manualReviewAxes),
    unmeasured,
    manualReviewAxes,
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
                ? ` · off-ramp ${tokenPixels.offTop
                    .map((entry) => `${entry.hex} ${entry.pixels}`)
                    .join(' / ')}`
                : ''
            }`
          : 'no painted pixels',
      C: cWhy,
      D: navigation.measurable
        ? `declared ${navigation.declared} · measured ${navigation.measured} · exempt ${navigation.exempted} · missing ${navigation.missing.length}${
            navigation.missing.length ? ` → ${navigation.missing.slice(0, 8).join(' / ')}` : ''
          }`
        : 'nav declaration missing',
      E: copy
        ? `measured ${copy.total} · exempt ${copy.exempted} · missing ${copy.missing.length}${
            copy.missing.length
              ? ` → ${copy.missing
                  .slice(0, 8)
                  .map((text) => text.slice(0, 24))
                  .join(' / ')}`
              : ''
          }`
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
    let activeShot = createShotHealth();
    const networkTracker = createShotNetworkTracker();
    page.on('console', (message) => {
      if (message.type() === 'error') recordShotFailure(activeShot, 'console-error');
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
    await attestServedExport(
      page,
      environmentAttestation.previewEnv,
      environmentAttestation.receipt,
    );
    await waitForShotNetworkIdle(page, activeShot);
    await page.addScriptTag({ content: makeCaptureInitScript(markerTime) });
    await loginForQa(page, baseUrl, env);
    await waitForShotNetworkIdle(page, activeShot);
    const loginFailureCodes = shotFailureCodes({ baseUrl, ...activeShot });
    if (loginFailureCodes.length) throw new CaptureContractError(loginFailureCodes);
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
            ramp: tokenRamp(tokens),
            navFile,
            deviations,
            activeShot,
          }),
        );
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
    browserVersion,
    navigationContract: 'data/nav.json',
    weights: WEIGHTS,
    rows,
  };
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  const exitCode = reportExitCode(report);
  const passed = rows.filter((row) => row.automaticPass === true).length;
  console.log(`scored ${rows.length} · >=98 automatic ${passed}`);
  return exitCode;
}

const invoked =
  process.argv[1] && samePlatformPath(process.argv[1], fileURLToPath(import.meta.url));
if (invoked) process.exitCode = await main();
