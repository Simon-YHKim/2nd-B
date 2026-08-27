#!/usr/bin/env node
/**
 * Capture the live app at the PIXEL-CLAY reference viewport.
 * Invalid env, selection, route, page health, or final URL fails closed.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  browserLaunchOptions,
  CaptureContractError,
  captureFailureCodes,
  digestPage,
  makeCaptureInitScript,
  previewEnvLines,
  resolveHostedAppUrl,
  resolvePlaywright,
  shotFailureCodes,
  validateFinalUrl,
  validateManifestClassification,
  waitForSettledPage,
} from './score.mjs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT = path.join(HERE, '..');
const REPO = path.join(KIT, '..', '..');
const INVISIBLE = /[\u2060\u200B\u200C\u200D\uFEFF]/g;
const DEVICE_CHROME = [/^\d{1,2}\s*[:.]\s*\d{2}$/];

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
  if (node.text && !DEVICE_CHROME.some((pattern) => pattern.test(node.text))) {
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
    ? [...new Set(requested.split(',').map((id) => id.trim()).filter(Boolean))]
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

export async function main(args = process.argv.slice(2), env = process.env) {
  if (args.length > 0 && !(args.length === 1 && args[0] === '--print-env')) {
    console.error('invalid arguments');
    return 2;
  }
  if (args[0] === '--print-env') {
    try {
      const easPath = env.EAS_FILE ? path.resolve(env.EAS_FILE) : path.join(REPO, 'eas.json');
      const eas = JSON.parse(readFileSync(easPath, 'utf8'));
      const lines = previewEnvLines(eas.build?.preview?.env ?? {});
      process.stdout.write(`${lines.join('\n')}\n`);
      return 0;
    } catch {
      console.error('invalid preview env');
      return 2;
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
  const output = env.OUT || path.join(REPO, '.app-shots');
  const unmeasurable = { ...(routesFile.unmeasurable ?? {}) };
  delete unmeasurable._note;
  const markerTime = env.FIXED_ISO ? new Date(env.FIXED_ISO).getTime() : Date.now();
  let initScript;
  try {
    initScript = makeCaptureInitScript(markerTime);
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
    unmeasurable,
  };
  let browser;
  try {
    browser = await chromium.launch(browserLaunchOptions(env));
    const context = await browser.newContext({
      viewport: { width: 390, height: 820 },
      deviceScaleFactor: 1,
    });
    await context.addInitScript(initScript);
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

    const { email, password } = qaCreds(env);
    if (!email || !password) throw new CaptureContractError('capture-failed');
    await page.goto(resolveHostedAppUrl(baseUrl, '/'), { waitUntil: 'load', timeout: 90000 });
    await page.waitForTimeout(2500);
    if (page.url().includes('/sign-in')) {
      await page.getByRole('textbox', { name: /이메일|email/i }).fill(email);
      await page.getByRole('textbox', { name: /비밀번호|password/i }).fill(password);
      await page.locator('button:has-text("로그인"), button:has-text("Sign in")').first().click();
      await page.waitForTimeout(5000);
    }
    if (page.url().includes('/sign-in')) {
      throw new CaptureContractError('unexpected-final-route');
    }

    for (const id of targetSelection.targetIds) {
      const route = routesFile.routes[id];
      activeShot = {
        responses: [],
        pageErrorCount: 0,
        consoleErrorCount: 0,
        requestFailedCount: 0,
      };
      try {
        await page.goto(resolveHostedAppUrl(baseUrl, route), {
          waitUntil: 'load',
          timeout: 60000,
        });
        await waitForSettledPage(page);
        validateFinalUrl(baseUrl, route, page.url());
        const failureCodes = shotFailureCodes({ baseUrl, ...activeShot });
        if (failureCodes.length) throw new CaptureContractError(failureCodes);

        const digest = await page.evaluate(digestPage);
        const screenshot = await page.screenshot();
        await page.waitForTimeout(100);
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

const invoked = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invoked) process.exitCode = await main();
