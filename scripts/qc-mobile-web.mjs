#!/usr/bin/env node
/**
 * Windows-friendly iPhone-width QC harness.
 *
 * This is the local fallback when a real iOS Simulator is unavailable. It
 * exports the Expo web build, serves it with the production /2nd-B base path,
 * and, when Playwright is available, checks mobile overflow and 44px targets.
 *
 * Env:
 *   OUT       export dir (default Output/qc-mobile-web)
 *   PORT      local server port (default 8145)
 *   VIEWPORT  "WxH" (default 390x844)
 *   ROUTES    comma-separated route list override
 *   PW_PATH   optional Playwright module path
 *   PW_CHROME optional Chromium executable path
 *
 * Flags:
 *   --serve   keep the local server alive after export/QC for manual browser QC
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, statSync, createReadStream, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);
const OUT = path.resolve(process.env.OUT || "Output/qc-mobile-web");
const PORT = Number(process.env.PORT || 8145);
const BASE_PATH = "/2nd-B";
const WAIT_MS = Number(process.env.WAIT_MS || 500);
const [VW, VH] = (process.env.VIEWPORT || "390x844").split("x").map(Number);
const KEEP_OPEN = process.argv.includes("--serve") || process.env.KEEP_OPEN === "1";

const DEFAULT_ROUTES = [
  "/",
  "/sign-in",
  "/sign-up",
  "/reset-password",
  "/complete-profile",
  "/permissions",
  "/manual",
  "/capture",
  "/secondb",
  "/deepspace-home",
  "/deepspace-hub",
  "/core-brain",
  "/persona",
  "/big-five",
  "/interview",
  "/esm",
  "/attachment",
  "/imagine",
  "/audit",
  "/theme",
  "/plans",
  "/discover",
  "/growth",
  "/reading",
  "/reminders",
  "/milestones",
  "/integrations",
  "/side-project",
  "/deepspace-flowmap",
];

const ROUTES = process.env.ROUTES
  ? process.env.ROUTES.split(",").map((r) => r.trim()).filter(Boolean)
  : DEFAULT_ROUTES;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function run(command, args) {
  return new Promise((resolve, reject) => {
    const executable = process.platform === "win32" ? "cmd.exe" : command;
    const spawnArgs = process.platform === "win32" ? ["/d", "/s", "/c", command, ...args] : args;
    const child = spawn(executable, spawnArgs, { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited ${code}`));
    });
  });
}

function resolveTarget(url) {
  const parsed = new URL(url, `http://127.0.0.1:${PORT}`);
  let pathname = decodeURIComponent(parsed.pathname);
  if (pathname.startsWith(BASE_PATH)) pathname = pathname.slice(BASE_PATH.length) || "/";
  let target = path.normalize(path.join(OUT, pathname));
  if (!target.startsWith(OUT)) return null;
  if (existsSync(target) && statSync(target).isDirectory()) target = path.join(target, "index.html");
  if (!existsSync(target)) target = path.join(OUT, "index.html");
  return target;
}

function startServer() {
  const server = createServer((req, res) => {
    const target = resolveTarget(req.url || "/");
    if (!target) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    const ext = path.extname(target);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    createReadStream(target).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once("error", (error) => {
      if (error && error.code === "EADDRINUSE") {
        reject(new Error(`Port ${PORT} is already in use. Stop the existing QC server or set PORT to another value.`));
        return;
      }
      reject(error);
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

function resolvePlaywright() {
  const candidates = [
    process.env.PW_PATH,
    "playwright",
    "/opt/node22/lib/node_modules/playwright/index.js",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const mod = require(candidate);
      const chromium = mod.chromium || mod.default?.chromium;
      if (chromium) return chromium;
    } catch {
      /* try next */
    }
  }
  return null;
}

function resolveChromeExecutable() {
  if (process.env.PW_CHROME) return process.env.PW_CHROME;
  const remoteGuess = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  return existsSync(remoteGuess) ? remoteGuess : undefined;
}

async function runBrowserQc(baseUrl) {
  const chromium = resolvePlaywright();
  if (!chromium) {
    return {
      skipped: true,
      reason: "Playwright not found. Set PW_PATH or install Playwright to enable automated browser QC.",
      routes: [],
    };
  }

  const browser = await chromium.launch({
    executablePath: resolveChromeExecutable(),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: VW, height: VH },
    deviceScaleFactor: 2,
    isMobile: true,
    ignoreHTTPSErrors: true,
  });

  const results = [];
  for (const route of ROUTES) {
    const page = await context.newPage();
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(`PAGEERROR: ${err.message}`));

    const entry = { route, status: "ok", finalUrl: "", errors, tinyTargets: [], overflow: false, text: "" };
    try {
      await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 60000 });
      await page.waitForTimeout(WAIT_MS);
      entry.finalUrl = page.url();
      const metrics = await page.evaluate(() => {
        const controls = Array.from(
          document.querySelectorAll("button,a,input,textarea,select,[role='button'],[role='link'],[role='switch'],[role='checkbox'],[tabindex]:not([tabindex='-1'])"),
        ).map((el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return {
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute("role") || "",
            label: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 80),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            visible: rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden",
          };
        }).filter((item) => item.visible);
        return {
          innerWidth: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth,
          tinyTargets: controls.filter((item) => item.tag !== "input" && item.tag !== "textarea" && (item.width < 44 || item.height < 44)),
          text: (document.body.textContent || "").trim().replace(/\s+/g, " ").slice(0, 240),
        };
      });
      entry.overflow = metrics.scrollWidth > metrics.innerWidth || metrics.bodyScrollWidth > metrics.innerWidth;
      entry.tinyTargets = metrics.tinyTargets;
      entry.text = metrics.text;
      if (entry.overflow || entry.tinyTargets.length || entry.errors.length) entry.status = "fail";
    } catch (err) {
      entry.status = "error";
      entry.errors.push(err.message);
    }
    await page.close();
    results.push(entry);
    const tag = entry.status === "ok" ? "ok" : entry.status;
    console.log(`[${tag}] ${route} tiny=${entry.tinyTargets.length} overflow=${entry.overflow} errors=${entry.errors.length}`);
  }

  await browser.close();
  return { skipped: false, routes: results };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  console.log(`Exporting Expo web build to ${path.relative(process.cwd(), OUT)}`);
  await run("npx", ["expo", "export", "--platform", "web", "--output-dir", OUT]);

  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${PORT}${BASE_PATH}`;
  console.log(`Serving QC build at ${baseUrl}`);

  try {
    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl,
      viewport: { width: VW, height: VH },
      result: await runBrowserQc(baseUrl),
    };
    const reportPath = path.join(OUT, "qc-report.json");
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    if (report.result.skipped) {
      console.log(`Browser QC skipped: ${report.result.reason}`);
      console.log(KEEP_OPEN ? `Open ${baseUrl} and inspect at ${VW}x${VH}.` : `Run npm run qc:mobile-web:serve to keep ${baseUrl} open for manual QC.`);
      console.log(`Report: ${path.relative(process.cwd(), reportPath)}`);
      if (KEEP_OPEN) await waitForShutdown();
      return;
    }

    const failures = report.result.routes.filter((item) => item.status !== "ok");
    console.log(`QC complete: ${report.result.routes.length} routes, ${failures.length} failures.`);
    console.log(`Report: ${path.relative(process.cwd(), reportPath)}`);
    if (KEEP_OPEN) await waitForShutdown();
    if (failures.length) process.exitCode = 1;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function waitForShutdown() {
  console.log("QC server is still running. Press Ctrl+C to stop.");
  return new Promise((resolve) => {
    const done = () => resolve();
    process.once("SIGINT", done);
    process.once("SIGTERM", done);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
