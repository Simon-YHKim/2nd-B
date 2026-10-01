#!/usr/bin/env node
/**
 * Browser transport smoke for the real web analytics module. No account, DB,
 * Paddle, or GA4 property is used. Every outbound collection request is aborted.
 *
 * Run: node scripts/qa/ga4-network-smoke.cjs
 * PW_CHROME may override the local Chrome/Edge executable.
 */
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require("playwright-core");

const root = path.resolve(__dirname, "../..");
const measurementId = "G-0000000000"; // Synthetic, never an operator property.
const tagUrl = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
const csp = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8"))
  .headers[0].headers.find((header) => header.key === "Content-Security-Policy").value;

function chromePath() {
  const candidates = [
    process.env.PW_CHROME,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean);
  return candidates.find(existsSync);
}

async function bundleAnalytics() {
  const stubs = {
    "react-native": 'export const Platform = { OS: "web" }; export const NativeModules = {}; export const TurboModuleRegistry = { get: () => null };',
    "../env": `export const getEnv = () => ({ EXPO_PUBLIC_GA4_MEASUREMENT_ID: "${measurementId}" });`,
    "../supabase/client": `export const getSupabaseClient = () => ({ from: (table) => {
      if (table !== "runtime_flags") throw new Error("unexpected table: " + table);
      return { select: () => ({ in: async () => ({ data: [
        { key: "analytics_enabled", enabled: globalThis.__runtimeOn === true },
        { key: "clarity_enabled", enabled: false }
      ], error: null }) }) };
    } });`,
    "../auth/account-epoch": 'export const currentAccountEpoch = () => 0; export const currentAccountOwner = () => "local-adult"; export const subscribeAccountTransition = () => () => {};',
    "./clarity-native": "export const syncNativeClarity = () => {};",
  };
  const result = await build({
    stdin: {
      contents: `import * as analytics from "./src/lib/analytics/index.ts";
        import { createPaddleAnalyticsAttempt } from "./src/lib/analytics/paddle-conversions.ts";
        const adult = { isMinor: false, confirmedAdult: true, underDigitalConsentAge: false };
        globalThis.qa = {
          start: async (granted, minor = false) => {
            const gate = minor ? { isMinor: true, confirmedAdult: false } : adult;
            analytics.setAnalyticsConsent(granted, gate);
            await analytics.initAnalytics({ analyticsConsent: granted, ...gate });
          },
          view: (path) => analytics.captureEvent(analytics.pageView({ path })),
          revoke: () => analytics.setAnalyticsConsent(false, adult),
          sandbox: () => {
            const attempt = createPaddleAnalyticsAttempt({ tier: "brain", cadence: "monthly",
              priceId: "pri_01h00000000000000000000000", environment: "sandbox" });
            return [attempt.started(), attempt.completed({ name: "checkout.completed" })];
          }
        };`,
      resolveDir: root, sourcefile: "ga4-smoke-entry.ts", loader: "ts",
    },
    bundle: true, platform: "browser", format: "iife", target: "es2020", write: false,
    external: ["@react-native-firebase/analytics"], // Native branch cannot run in this web smoke.
    plugins: [{ name: "offline-runtime-fixtures", setup(context) {
      context.onResolve({ filter: /^(react-native|\.\.\/env|\.\.\/supabase\/client|\.\.\/auth\/account-epoch|\.\/clarity-native)$/ },
        (args) => ({ path: args.path, namespace: "qa-fixture" }));
      context.onLoad({ filter: /.*/, namespace: "qa-fixture" }, (args) =>
        ({ contents: stubs[args.path], loader: "js" }));
    } }],
  });
  return result.outputFiles[0].text;
}

function startServer(bundle) {
  const server = createServer((request, response) => {
    response.setHeader("Content-Security-Policy", csp);
    response.setHeader("Cache-Control", "no-store");
    if (request.url === "/bundle.js") {
      response.setHeader("Content-Type", "application/javascript; charset=utf-8");
      response.end(bundle);
    } else {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end('<!doctype html><meta charset="utf-8"><title>Local GA4 transport smoke</title><script src="/bundle.js"></script>');
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function waitFor(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function main() {
  const executablePath = chromePath();
  if (!executablePath) throw new Error("Chrome/Edge missing; set PW_CHROME");
  const bundle = await bundleAnalytics();
  const server = await startServer(bundle);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const summary = [];
  let browser;
  try {
    browser = await chromium.launch({ executablePath, headless: true });
    async function scenario(name, runtimeOn, granted, action, minor = false) {
      const context = await browser.newContext({ serviceWorkers: "block" });
      const collection = [];
      const tags = [];
      const errors = [];
      await context.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === origin) return route.continue();
        if (request.url() === tagUrl && request.method() === "GET" && request.resourceType() === "script") {
          tags.push(request.url());
          return route.continue(); // Read the official SDK only; never send data.
        }
        if (url.pathname.endsWith("/g/collect")) {
          const params = new URLSearchParams(url.search);
          if (request.postData()) for (const [key, value] of new URLSearchParams(request.postData())) params.set(key, value);
          collection.push({ event: params.get("en"), method: request.method() });
        }
        return route.abort("blockedbyclient"); // Includes every analytics endpoint.
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      const tagResponses = [];
      page.on("response", (response) => {
        if (response.url() === tagUrl) tagResponses.push(response.status());
      });
      try {
        await page.addInitScript((value) => { globalThis.__runtimeOn = value; }, runtimeOn);
        await page.goto(origin, { waitUntil: "load" });
        await page.evaluate(({ consent, isMinor }) => globalThis.qa.start(consent, isMinor),
          { consent: granted, isMinor: minor });
        await action({ page, collection, tags, tagResponses });
        assert.deepEqual(errors, [], `${name}: browser errors`);
        summary.push({ name, tags: tags.length, tagStatus: tagResponses[0] ?? null,
          collection: collection.map((request) => request.event) });
      } finally {
        await context.close();
      }
    }

    await scenario("consent-off", true, false, async ({ page, collection, tags }) => {
      assert.equal(await page.evaluate(() => globalThis.qa.view("/capture")), false);
      await page.waitForTimeout(700);
      assert.equal(tags.length, 0);
      assert.equal(collection.length, 0);
    });
    await scenario("runtime-off", false, true, async ({ page, collection, tags }) => {
      assert.equal(await page.evaluate(() => globalThis.qa.view("/capture")), false);
      await page.waitForTimeout(700);
      assert.equal(tags.length, 0);
      assert.equal(collection.length, 0);
    });
    await scenario("minor-consent-rejected", true, true, async ({ page, collection, tags }) => {
      assert.equal(await page.evaluate(() => globalThis.qa.view("/capture")), false);
      await page.waitForTimeout(700);
      assert.equal(tags.length, 0);
      assert.equal(collection.length, 0);
    }, true);
    await scenario("adult-consented-runtime-on", true, true, async ({ page, collection, tags, tagResponses }) => {
      await waitFor(() => tagResponses.length > 0, 15000, "gtag.js response");
      assert.equal(tagResponses[0], 200);
      assert.equal(tags.length, 1);
      assert.equal(await page.evaluate(() => globalThis.qa.view("/capture")), true);
      await waitFor(() => collection.some((request) => request.event === "page_view"), 15000, "page_view /g/collect attempt");
    });
    await scenario("revoke-before-event", true, true, async ({ page, collection, tagResponses }) => {
      await waitFor(() => tagResponses.length > 0, 15000, "gtag.js response");
      assert.equal(await page.evaluate(() => globalThis.qa.revoke()), true);
      assert.equal(await page.evaluate(() => globalThis.qa.view("/after-revoke")), false);
      await page.waitForTimeout(1000);
      assert.equal(collection.length, 0, "revoke emitted a collection request");
    });
    await scenario("paddle-sandbox", true, true, async ({ page, collection, tagResponses }) => {
      await waitFor(() => tagResponses.length > 0, 15000, "gtag.js response");
      assert.deepEqual(await page.evaluate(() => globalThis.qa.sandbox()), [false, false]);
      await page.waitForTimeout(1000);
      assert.equal(collection.length, 0, "sandbox emitted a collection request");
    });
    console.log(JSON.stringify({ status: "PASS", transport: "aborted before network", scenarios: summary }, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
