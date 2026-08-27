#!/usr/bin/env node
/**
 * Capture the live app at the PIXEL-CLAY reference viewport.
 * Invalid env, selection, route, page health, or final URL fails closed.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  attestServedExport,
  browserLaunchOptions,
  captureExportEnv,
  captureEnvReceiptPath,
  captureContextOptions,
  CaptureContractError,
  captureFailureCodes,
  createCaptureEnvReceipt,
  createServedExportAttestation,
  createShotHealth,
  createShotNetworkTracker,
  digestPage,
  dismissCaptureOverlays,
  fillQaLogin,
  isDeviceChromeText,
  loadCaptureEnvAttestation,
  makeCaptureDeterminismScript,
  makeCaptureInitScript,
  navigateHostedAppRoute,
  previewEnvLines,
  previewEnvJson,
  readPreviewProfileEnv,
  recordShotFailure,
  resolveHostedAppUrl,
  resolveCaptureMarkerTime,
  resolvePlaywright,
  servedExportMarkerBody,
  shotFailureCodes,
  sourceBodySha256,
  validateFinalUrl,
  validateManifestClassification,
  validateCaptureEnvReceiptMetadata,
  validateBrowserRuntime,
  waitForShotNetworkIdle,
  waitForSettledPage,
} from './score.mjs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT = path.join(HERE, '..');
const REPO = path.join(KIT, '..', '..');
const INVISIBLE = /[\u2060\u200B\u200C\u200D\uFEFF]/g;

function readJson(file, fallback) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
}

function qaCreds(env) {
  if (env.QA_EMAIL && env.QA_PASSWORD) {
    return { email: env.QA_EMAIL, password: env.QA_PASSWORD };
  }
  const raw = readFileSync(path.join(REPO, '.env.test'), 'utf8');
  const read = (key) => (raw.match(new RegExp(`^${key}=(.*)$`, 'm')) ?? [])[1]?.trim();
  return { email: read('QA_TEST_EMAIL'), password: read('QA_TEST_PASSWORD') };
}

function flatten(node, output = []) {
  if (!node) return output;
  if (node.text && !isDeviceChromeText(node.text)) {
    output.push({
      text: node.text.replace(INVISIBLE, ''),
      width: node.box?.[0] ?? 0,
      height: node.box?.[1] ?? 0,
    });
  }
  for (const child of node.kids ?? []) flatten(child, output);
  return output;
}

function captureTargets(manifest, routesFile, requested) {
  const classification = validateManifestClassification(manifest.screens, routesFile);
  if (!classification.valid) {
    return { valid: false, classification, targetIds: [], invalidSelection: [] };
  }
  const selected = requested
    ? [
        ...new Set(
          requested
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean),
        ),
      ]
    : null;
  const invalidSelection = selected
    ? selected.filter((id) => !classification.targetIds.includes(id))
    : [];
  const targetIds = selected ?? classification.targetIds;
  return {
    valid: invalidSelection.length === 0 && targetIds.length > 0,
    classification,
    targetIds,
    invalidSelection,
  };
}

function exportWebFromReceipt(env) {
  let previewEnv;
  let receipt;
  try {
    previewEnv = readPreviewProfileEnv(env);
    receipt = JSON.parse(readFileSync(captureEnvReceiptPath(env), 'utf8'));
    validateCaptureEnvReceiptMetadata(receipt, previewEnv);
  } catch {
    throw new CaptureContractError('environment-attestation');
  }
  const output = env.CAPTURE_EXPORT_DIR
    ? path.resolve(env.CAPTURE_EXPORT_DIR)
    : path.join(REPO, 'Output', `work0-live-export-${receipt.receiptId}`);
  if (existsSync(output)) {
    throw new CaptureContractError('environment-attestation');
  }
  const outputParent = path.dirname(output);
  mkdirSync(outputParent, { recursive: true });
  const staging = path.join(outputParent, `.work0-export-${receipt.receiptId}-${randomUUID()}`);
  if (existsSync(staging)) throw new CaptureContractError('environment-attestation');

  const expoCli = env.EXPO_CLI_PATH
    ? path.resolve(env.EXPO_CLI_PATH)
    : require.resolve('expo/bin/cli');
  if (!existsSync(expoCli)) throw new CaptureContractError('capture-failed');
  const cleanRuntime = Object.fromEntries(
    Object.entries(env).filter(([key]) => !key.startsWith('EXPO_PUBLIC_')),
  );
  const result = spawnSync(
    process.execPath,
    [expoCli, 'export', '--platform', 'web', '--clear', '--output-dir', staging],
    {
      cwd: REPO,
      env: {
        ...cleanRuntime,
        EXPO_NO_DOTENV: '1',
        ...captureExportEnv(previewEnv, receipt),
      },
      stdio: 'inherit',
    },
  );
  if (result.status !== 0) throw new CaptureContractError('capture-failed');

  const markerPath = path.join(staging, 'work0-export-marker.js');
  const indexPath = path.join(staging, 'index.html');
  if (existsSync(markerPath) || !existsSync(indexPath)) {
    throw new CaptureContractError('environment-attestation');
  }
  const markerBody = servedExportMarkerBody(receipt);
  writeFileSync(markerPath, markerBody);
  const indexHtml = readFileSync(indexPath, 'utf8');
  if (!/<\/head>/i.test(indexHtml)) throw new CaptureContractError('environment-attestation');
  const finalIndexHtml = indexHtml.replace(
    /<\/head>/i,
    '<script defer src="/2nd-B/work0-export-marker.js"></script></head>',
  );
  writeFileSync(indexPath, finalIndexHtml);

  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new CaptureContractError('environment-attestation');
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile()) {
        const body = readFileSync(absolute);
        files.push({
          path: path.relative(staging, absolute).split(path.sep).join('/'),
          sha256: sourceBodySha256(body),
        });
      }
    }
  };
  visit(staging);
  const inlineScripts = [
    ...finalIndexHtml.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi),
  ].map((match) => sourceBodySha256(match[1]));
  writeFileSync(
    path.join(staging, 'work0-export-attestation.json'),
    `${JSON.stringify(createServedExportAttestation(receipt, files, inlineScripts), null, 2)}\n`,
  );
  // A same-parent rename publishes the complete export in one step. If a
  // concurrent process wins the destination, this fails without overwriting it.
  renameSync(staging, output);
}

export async function main(args = process.argv.slice(2), env = process.env) {
  const command = args.length === 1 ? args[0] : null;
  const printFormat = command === '--print-env=json' ? 'json' : 'posix';
  const isPrintEnv =
    command === '--print-env' || command === '--print-env=posix' || command === '--print-env=json';
  const isExportWeb = command === '--export-web';
  if (args.length > 0 && !isPrintEnv && !isExportWeb) {
    console.error('invalid arguments');
    return 2;
  }
  if (isPrintEnv) {
    try {
      const previewEnv = readPreviewProfileEnv(env);
      const receipt = createCaptureEnvReceipt(previewEnv);
      const receiptPath = captureEnvReceiptPath(env);
      mkdirSync(path.dirname(receiptPath), { recursive: true });
      writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
      process.stdout.write(
        printFormat === 'json'
          ? `${previewEnvJson(previewEnv, receipt)}\n`
          : `${previewEnvLines(previewEnv, receipt).join('\n')}\n`,
      );
      return 0;
    } catch {
      console.error('invalid preview env');
      return 2;
    }
  }
  if (isExportWeb) {
    try {
      exportWebFromReceipt(env);
      console.log('web export attested');
      return 0;
    } catch (error) {
      console.error('web export failed');
      return captureFailureCodes(error).includes('environment-attestation') ? 2 : 1;
    }
  }

  let manifest;
  let routesFile;
  try {
    manifest = readJson(path.join(KIT, 'data', 'screens.json'), { screens: [] });
    routesFile = readJson(path.join(KIT, 'data', 'app-routes.json'), {});
  } catch {
    console.error('invalid manifest classification');
    return 2;
  }
  const targetSelection = captureTargets(manifest, routesFile, env.SCREENS);
  if (!targetSelection.valid) {
    const reason = targetSelection.classification.valid
      ? 'invalid screen selection'
      : 'invalid manifest classification';
    console.error(reason);
    return 2;
  }

  const baseUrl = env.BASE_URL;
  if (!baseUrl) {
    console.error('BASE_URL required');
    return 1;
  }
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
  const output = env.OUT || path.join(REPO, '.app-shots');
  const unmeasurable = { ...(routesFile.unmeasurable ?? {}) };
  delete unmeasurable._note;
  let initScript;
  let determinismScript;
  try {
    const markerTime = resolveCaptureMarkerTime(env, environmentAttestation.printedAt);
    initScript = makeCaptureInitScript(markerTime);
    determinismScript = makeCaptureDeterminismScript(markerTime);
  } catch {
    console.error('FIXED_ISO must be a valid date');
    return 2;
  }

  mkdirSync(output, { recursive: true });
  mkdirSync(path.join(output, 'structure'), { recursive: true });
  const report = {
    schemaVersion: 1,
    baseUrl: new URL(baseUrl).origin,
    shots: [],
    compare: [],
    environmentAttested: true,
    browserVersion: null,
    unmeasurable,
  };
  let browser;
  try {
    browser = await chromium.launch(browserLaunchOptions(env, chromium));
    report.browserVersion = validateBrowserRuntime(browser);
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

    const { email, password } = qaCreds(env);
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
    await page.addScriptTag({ content: initScript });
    await fillQaLogin(page, { baseUrl, email, password, env });
    await waitForShotNetworkIdle(page, activeShot);
    const loginFailureCodes = shotFailureCodes({ baseUrl, ...activeShot });
    if (loginFailureCodes.length) throw new CaptureContractError(loginFailureCodes);
    await page.addScriptTag({ content: determinismScript });

    for (const id of targetSelection.targetIds) {
      const route = routesFile.routes[id];
      activeShot = createShotHealth();
      try {
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

        const digest = await page.evaluate(digestPage);
        const screenshot = await page.screenshot();
        await page.waitForTimeout(100);
        await waitForShotNetworkIdle(page, activeShot);
        const finalFailureCodes = shotFailureCodes({ baseUrl, ...activeShot });
        if (finalFailureCodes.length) throw new CaptureContractError(finalFailureCodes);

        writeFileSync(path.join(output, `${id}.png`), screenshot);
        writeFileSync(
          path.join(output, 'structure', `${id}.json`),
          `${JSON.stringify(digest, null, 1)}\n`,
        );
        const referencePath = path.join(KIT, 'data', 'structure', `${id}.json`);
        if (existsSync(referencePath)) {
          const reference = flatten(JSON.parse(readFileSync(referencePath, 'utf8')));
          const app = flatten(digest);
          const appText = new Set(app.map((entry) => entry.text));
          const matched = reference.filter((entry) => appText.has(entry.text)).length;
          report.compare.push({
            id,
            route,
            refNodes: reference.length,
            appNodes: app.length,
            textMatched: matched,
            textMatchPct: reference.length ? Math.round((matched / reference.length) * 100) : null,
          });
        }
        report.shots.push({ id, route, ok: true });
        process.stdout.write(`${id} `);
      } catch (error) {
        report.shots.push({
          id,
          route,
          ok: false,
          failureCodes: captureFailureCodes(error),
        });
        process.stdout.write(`${id}(FAIL) `);
      } finally {
        activeShot = null;
      }
    }
    process.stdout.write('\n');
  } catch {
    console.error('capture failed');
    return 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  writeFileSync(path.join(output, 'app-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const failed = report.shots.filter((shot) => !shot.ok);
  console.log(`app captures ${report.shots.length - failed.length}/${report.shots.length}`);
  return failed.length ? 1 : 0;
}

const invoked =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invoked) process.exitCode = await main();
