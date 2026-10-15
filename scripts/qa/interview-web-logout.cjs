#!/usr/bin/env node
/* Actual Chromium / IDB / Web Locks / pinned GoTrueClient regression.
 * Run from the repository root. No live auth, dependency install or app server.
 * Synthetic bodies below are fixtures, NOT a production writer/CAS claim. */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { build } = require("esbuild");
const { chromium } = require("playwright-core");

const root = path.resolve(__dirname, "../..");
const entry = String.raw`
import { GoTrueClient } from "@supabase/auth-js";
import { createAuthStorageRuntime, captureAuthSessionExpectation } from "./src/lib/auth/session-mutation";
import { activateExpectedWebInterviewSession, signOutExpectedWebInterviewSession } from "./src/lib/auth/web-interview-signout";
import { createWebInterviewLifecycle, webInterviewDatabaseName } from "./src/lib/interview/web-draft-lifecycle";

const trace = [];
const state = { h: null };
function syntheticSession(owner = "fixture-a", sid = "fixture-session-a", version = 1) {
  const now = Math.floor(Date.now() / 1000);
  const enc = (v) => btoa(JSON.stringify(v)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return { access_token: enc({ alg: "none" }) + "." + enc({ sub: owner, session_id: sid, exp: now + 3600, iat: now }) + ".fixture" + version,
    refresh_token: "fixture-refresh-" + version, token_type: "bearer", expires_in: 3600, expires_at: now + 3600,
    user: { id: owner, aud: "authenticated", role: "authenticated", email: "fixture@example.invalid", app_metadata: {}, user_metadata: {}, created_at: new Date(0).toISOString() } };
}
function observedFactory(h, fault) {
  return { open(name, version) {
    if (fault === "denied") throw new DOMException("synthetic denied", "SecurityError");
    const request = indexedDB.open(name, version);
    request.addEventListener("success", () => {
      const db = request.result;
      const original = db.transaction.bind(db);
      db.transaction = (...args) => {
        h.transactions++;
        const tx = original(...args);
        trace.push("D:start:" + tx.mode);
        tx.addEventListener("complete", () => trace.push("D:complete:" + tx.mode));
        tx.addEventListener("abort", () => trace.push("D:abort"));
        if (fault === "abort") queueMicrotask(() => tx.abort());
        if (fault === "delayed-complete") Object.defineProperty(tx, "oncomplete", {
          configurable: true,
          set(callback) { tx.addEventListener("complete", (event) => setTimeout(() => callback.call(tx, event), 100)); },
        });
        if (fault === "delete-request-abort") {
          const store = tx.objectStore.bind(tx);
          tx.objectStore = (name) => {
            const object = store(name);
            if (name === "bodies") {
              const remove = object.delete.bind(object);
              object.delete = (...args) => {
                const req = remove(...args);
                req.addEventListener("success", () => { trace.push("delete:success:before-abort"); tx.abort(); });
                return req;
              };
            }
            return object;
          };
        }
        return tx;
      };
    });
    return request;
  } };
}
async function openDb(name, version) {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, version);
    r.onerror = () => reject(r.error);
    r.onsuccess = () => resolve(r.result);
  });
}
async function read(h = state.h) {
  const db = await openDb(h.name);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(["control", "bodies"], "readonly");
      const c = tx.objectStore("control").getAll();
      const b = tx.objectStore("bodies").getAllKeys();
      tx.oncomplete = () => resolve({ control: c.result[0] ?? null, bodyCount: b.result.length });
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
async function mutate(fn, h = state.h) {
  const db = await openDb(h.name);
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["control", "bodies"], "readwrite");
      fn(tx);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
async function seed(h = state.h, ticket = h.ticket) {
  // Only fixture code writes payload. Product A has no body write/read method.
  await mutate((tx) => tx.objectStore("bodies").put({ ownerId: ticket.ownerId, sessionId: ticket.sessionId,
    storageGeneration: ticket.storageGeneration, payload: "synthetic fixture only" }), h);
}
async function setup(project, options = {}) {
  trace.length = 0;
  const h = { project, transactions: 0, sdkCalls: 0, sdkFailure: false, sdkGate: false, callbackDeferred: false };
  const runtimeOptions = { url: "https://" + project + ".supabase.co", storage: localStorage, web: true };
  if (options.locks === "missing") runtimeOptions.navigatorLocksAvailable = false;
  else runtimeOptions.navigatorLockRequest = async (name, options, callback) => {
    if (h.lockFault === "null") return callback(null);
    if (h.lockFault === "missing-callback") { h.lateLock = () => callback({ name, mode: "exclusive" }); return undefined; }
    return navigator.locks.request(name, options, async (lock) => {
      const kind = name.startsWith("lock:") ? "S" : "M";
      trace.push(kind + ":enter");
      try { return await callback(lock); }
      finally { trace.push(kind + ":exit"); }
    });
  };
  h.runtime = createAuthStorageRuntime(runtimeOptions);
  await h.runtime.ready();
  if (options.seed !== false) localStorage.setItem(h.runtime.storageKey, JSON.stringify(syntheticSession()));
  h.client = new GoTrueClient({ url: "https://" + project + ".supabase.co/auth/v1", headers: { apikey: "fixture-public" },
    storage: h.runtime.storage, storageKey: h.runtime.storageKey, lock: h.runtime.sdkLock, lockAcquireTimeout: -1,
    persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
    fetch: async (url) => {
      if (String(url).includes("grant_type=password")) { trace.push("SDK:signin"); return new Response(JSON.stringify(syntheticSession("fixture-b", "fixture-session-b")), { status: 200 }); }
      if (!String(url).includes("/logout")) throw new Error("Unexpected synthetic SDK route");
      h.sdkCalls++; trace.push("SDK:logout");
      if (h.sdkGate) { trace.push("SDK:waiting"); await new Promise((resolve) => { h.releaseSdk = resolve; }); }
      return h.sdkFailure ? new Response(JSON.stringify({ message: "synthetic rejection" }), { status: 500 }) : new Response(null, { status: 204 });
    } });
  h.expected = await captureAuthSessionExpectation(h.client, h.runtime);
  h.lifecycle = createWebInterviewLifecycle({ storageKey: h.runtime.storageKey, indexedDB: observedFactory(h), timeoutMs: options.timeoutMs ?? 4000 });
  h.name = webInterviewDatabaseName(h.runtime.storageKey);
  h.identity = { ownerId: "fixture-a", sessionId: "fixture-session-a", storageGeneration: "fixture-generation-a" };
  if (options.activate !== false) {
    h.ticket = await activateExpectedWebInterviewSession(h.client, h.runtime, h.lifecycle, h.expected, h.identity.storageGeneration, null);
    await seed(h);
  }
  await new Promise((initialized) => h.client.onAuthStateChange((event) => {
    if (event === "INITIAL_SESSION") { initialized(); return; }
    if (event !== "SIGNED_OUT") return;
    trace.push("event:SIGNED_OUT:sync");
    // The subscriber returns synchronously. Deferred work acquires M only after
    // the SDK notification promise can settle; never await M in this callback.
    setTimeout(() => { void h.runtime.runMutation(() => { h.callbackDeferred = true; trace.push("event:deferred:M"); }); }, 0);
  }));
  await h.runtime.runSdkUnlockedWriter(() => undefined);
  state.h = h;
  trace.length = 0; h.transactions = 0;
  return { storageKey: h.runtime.storageKey, name: h.name, ticket: h.ticket };
}
async function logout(h = state.h) {
  try { const receipt = await signOutExpectedWebInterviewSession(h.client, h.runtime, h.lifecycle, h.expected, h.ticket, "fixture-logout");
    return { ok: true, receipt }; }
  catch (error) { return { ok: false, code: error.code ?? error.name }; }
}
async function hold(h = state.h) {
  const db = await openDb(h.name);
  const tx = db.transaction(["control", "bodies"], "readwrite");
  let release = false;
  h.releaseHold = () => { release = true; };
  const done = new Promise((resolve, reject) => { tx.oncomplete = () => { trace.push("fixture:commit"); db.close(); resolve(); }; tx.onabort = () => { db.close(); reject(tx.error); }; });
  const pump = () => { const r = tx.objectStore("control").get("current"); r.onsuccess = () => { if (!release) pump(); }; };
  pump();
  h.holdDone = done;
}
function setFault(fault, timeoutMs = 4000) {
  const h = state.h;
  h.lifecycle = createWebInterviewLifecycle({ storageKey: h.runtime.storageKey, indexedDB: observedFactory(h, fault), timeoutMs });
}
window.qa = { state, trace, setup, read, seed, mutate, logout, hold, openDb, setFault, syntheticSession,
  createWebInterviewLifecycle, activateExpectedWebInterviewSession, signOutExpectedWebInterviewSession };
`;

async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "t16-web-logout-"));
  const results = [];
  let browserProcess;
  let browser;
  let context;
  let page;
  let other;
  const bundle = await build({ stdin: { contents: entry, resolveDir: root, sourcefile: "t16-fixture.ts", loader: "ts" }, bundle: true,
    write: false, platform: "browser", format: "iife", define: { "process.env.NODE_ENV": '"test"' },
    // These are lazy native-only imports. The browser has no require(); any
    // accidental native execution fails, rather than obtaining a fake store.
    external: ["@react-native-async-storage/async-storage", "expo-secure-store", "expo-crypto"] });
  const server = http.createServer((request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("content-type", "text/javascript"); response.end(bundle.outputFiles[0].text); }
    else { response.setHeader("content-type", "text/html"); response.end('<!doctype html><title>T16 isolated regression</title><script src="/fixture.js"></script>'); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function start() {
    browserProcess = spawn(process.env.CHROMIUM_PATH || "/usr/bin/chromium", ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
      "--disable-background-networking", "--disable-component-update", "--no-first-run", "--no-default-browser-check",
      "--remote-debugging-port=0", `--user-data-dir=${path.join(temp, "profile")}`, "about:blank"], { detached: true, stdio: ["ignore", "ignore", "pipe"] });
    const endpoint = await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(new Error("Owned Chromium startup timed out")), 20000);
      browserProcess.once("error", (error) => { clearTimeout(timer); reject(error); });
      browserProcess.stderr.on("data", (chunk) => {
        output += chunk;
        const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    browser = await chromium.connectOverCDP(endpoint);
    context = browser.contexts()[0];
    await context.route("**/*", (route) => route.request().url().startsWith(origin + "/") ? route.continue() : route.abort());
    page = await context.newPage(); other = await context.newPage();
    await Promise.all([page.goto(origin), other.goto(origin)]);
  }
  async function crash() {
    const owned = browserProcess;
    const exited = once(owned, "exit");
    process.kill(-owned.pid, "SIGKILL"); // Only the runner's dedicated process group.
    await exited;
    browserProcess = null;
    await browser.close().catch(() => {});
  }
  async function check(name, fn) {
    const detail = await fn();
    results.push({ name, pass: true, ...detail });
    console.log(`PASS ${name}`);
  }
  try {
    await start();
    await check("actual IDB commit precedes SDK, with M -> S -> D -> S", async () => {
      await page.evaluate(() => qa.setup("t16-normal"));
      const result = await page.evaluate(async () => { const outcome = await qa.logout(); return { outcome, rows: await qa.read(), trace: qa.trace.slice() }; });
      assert.equal(result.outcome.ok, true);
      assert.equal(result.rows.bodyCount, 0); assert.equal(result.rows.control.phase, "inactive");
      const trace = result.trace;
      assert(trace.indexOf("S:exit") < trace.indexOf("D:start:readwrite"));
      assert(trace.indexOf("D:complete:readwrite") < trace.indexOf("SDK:logout"));
      assert.equal(trace[0], "M:enter"); assert(trace.includes("event:SIGNED_OUT:sync"));
      await page.waitForFunction(() => qa.state.h.callbackDeferred);
      return { trace };
    });
    await check("two pages: actual IDB wait holds M, B sign-in waits until purge/SDK", async () => {
      await page.evaluate(() => qa.setup("t16-tabs"));
      await other.evaluate(() => qa.setup("t16-tabs", { seed: false, activate: false }));
      await page.evaluate(async () => { await qa.hold(); qa.state.h.pending = qa.logout(); });
      await page.waitForFunction(() => qa.trace.includes("D:start:readwrite"));
      await other.evaluate(() => { const h = qa.state.h; h.signing = h.runtime.runMutation(() => h.runtime.runSdkUnlockedWriter(() => h.client.signInWithPassword({ email: "fixture@example.invalid", password: "fixture" }))); });
      await other.waitForFunction(async () => (await navigator.locks.query()).pending.some((lock) => lock.name.startsWith("secondbrain:auth-mutation:")));
      assert.equal(await other.evaluate(() => qa.trace.includes("SDK:signin")), false);
      assert.equal(await page.evaluate(() => qa.state.h.sdkCalls), 0);
      await page.evaluate(async () => { qa.state.h.releaseHold(); await qa.state.h.holdDone; });
      assert.equal((await page.evaluate(() => qa.state.h.pending)).ok, true);
      const b = await other.evaluate(async () => { await qa.state.h.signing; return (await qa.state.h.client.getSession()).data.session.user.id; });
      assert.equal(b, "fixture-b");
      const rows = await page.evaluate(() => qa.read()); assert.equal(rows.bodyCount, 0);
      return { realPages: 2, queuedWebLockObserved: true, bodyCount: rows.bodyCount };
    });
    await check("same owner new session and different owner preserve body / SDK zero", async () => {
      for (const [owner, sid] of [["fixture-a", "different-session"], ["fixture-b", "fixture-session-b"]]) {
        await page.evaluate((key) => qa.setup(key), `t16-mismatch-${owner}`);
        const result = await page.evaluate(async ([owner, sid]) => { const h = qa.state.h; localStorage.setItem(h.runtime.storageKey, JSON.stringify(qa.syntheticSession(owner, sid))); const result = await qa.logout(); return { result, calls: h.sdkCalls, tx: h.transactions, rows: await qa.read() }; }, [owner, sid]);
        assert.equal(result.result.ok, false); assert.equal(result.calls, 0); assert.equal(result.tx, 0); assert.equal(result.rows.bodyCount, 1);
      }
      return { cases: 2 };
    });
    await check("stable session token rotation and exact already-cleared ticket", async () => {
      for (const mode of ["rotate", "cleared"]) {
        await page.evaluate((key) => qa.setup(key), `t16-${mode}`);
        const r = await page.evaluate(async (mode) => { const h = qa.state.h;
          if (mode === "cleared") localStorage.removeItem(h.runtime.storageKey);
          else localStorage.setItem(h.runtime.storageKey, JSON.stringify(qa.syntheticSession("fixture-a", "fixture-session-a", 2)));
          return { result: await qa.logout(), rows: await qa.read() }; }, mode);
        assert.equal(r.result.ok, true); assert.equal(r.rows.bodyCount, 0);
      }
      return { cases: 2 };
    });
    await check("missing/invalid/missing-callback Web Locks never reach D or SDK", async () => {
      for (const fault of ["missing", "null", "missing-callback"]) {
        await page.evaluate(async (fault) => { await qa.setup("t16-lock-" + fault, { activate: false, ...(fault === "missing" ? { locks: "missing" } : {}) }); const h = qa.state.h; h.ticket = { ...h.identity, revision: 1 }; h.lockFault = fault; }, fault);
        const r = await page.evaluate(async () => { const h = qa.state.h; const result = await qa.logout(); if (h.lateLock) await h.lateLock(); return { result, calls: h.sdkCalls, tx: h.transactions }; });
        assert.equal(r.result.ok, false); assert.equal(r.calls, 0); assert.equal(r.tx, 0);
      }
      return { cases: 3, faultInjection: "manager absence/invalid callback; native locking covered above" };
    });
    await check("required D, project binding and absent stable session fail closed", async () => {
      await page.evaluate(() => qa.setup("t16-required"));
      const r = await page.evaluate(async () => { const h = qa.state.h; const outcomes = [];
        for (const adapter of [undefined, { ...h.lifecycle, storageKey: "wrong" }]) {
          try { await qa.signOutExpectedWebInterviewSession(h.client, h.runtime, adapter, h.expected, h.ticket, "fixture-logout"); outcomes.push("success"); } catch (e) { outcomes.push(e.code); }
        }
        try { await qa.activateExpectedWebInterviewSession(h.client, h.runtime, h.lifecycle, { ...h.expected, sessionId: null }, "new", null); outcomes.push("success"); } catch (e) { outcomes.push(e.name); }
        return { outcomes, tx: h.transactions, calls: h.sdkCalls, rows: await qa.read() }; });
      assert(!r.outcomes.includes("success")); assert.equal(r.tx, 0); assert.equal(r.calls, 0); assert.equal(r.rows.bodyCount, 1);
      return { cases: 3 };
    });
    await check("orphan body, malformed control, and incomplete schema cannot ACK", async () => {
      for (const mode of ["orphan", "malformed", "extra-control", "inactive-body", "incomplete"]) {
        await page.evaluate((key) => qa.setup(key), `t16-damage-${mode}`);
        await page.evaluate(async (mode) => { const h = qa.state.h;
          if (mode === "incomplete") {
            // Genuine IndexedDB upgrade removes a required store; v1 open then fails.
            const db = await new Promise((resolve, reject) => { const r = indexedDB.open(h.name, 2); r.onupgradeneeded = () => r.result.deleteObjectStore("control"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); db.close();
          } else await qa.mutate((tx) => {
            if (mode === "orphan") tx.objectStore("control").delete("current");
            else if (mode === "extra-control") tx.objectStore("control").put({ unknown: true }, "other");
            else tx.objectStore("control").put(mode === "malformed" ? { wrong: true } : { ...h.ticket, v: 1, phase: "inactive", logoutId: "fixture-logout" }, "current");
          });
        }, mode);
        const r = await page.evaluate(async () => { const h = qa.state.h; const result = await qa.logout(); const db = await qa.openDb(h.name); const count = await new Promise((resolve) => { const tx = db.transaction("bodies"); const r = tx.objectStore("bodies").count(); tx.oncomplete = () => resolve(r.result); }); db.close(); return { result, count, calls: h.sdkCalls }; });
        assert.equal(r.result.ok, false); assert.equal(r.count, 1); assert.equal(r.calls, 0);
      }
      return { cases: 5 };
    });
    await check("actual abort including delete request success is never a commit ACK", async () => {
      for (const fault of ["abort", "delete-request-abort", "denied"]) {
        await page.evaluate((key) => qa.setup(key), `t16-${fault}`);
        const r = await page.evaluate(async (fault) => { qa.setFault(fault); const result = await qa.logout(); return { result, rows: await qa.read(), calls: qa.state.h.sdkCalls, trace: qa.trace.slice() }; }, fault);
        assert.equal(r.result.ok, false); assert.equal(r.rows.bodyCount, 1); assert.equal(r.rows.control.phase, "active"); assert.equal(r.calls, 0);
        if (fault === "delete-request-abort") assert(r.trace.includes("delete:success:before-abort"));
      }
      return { actualAbortCases: 2, injectedDeniedCases: 1 };
    });
    await check("timeout behind an actual queued IDB delete: late upgrade/open mutates zero", async () => {
      await page.evaluate(() => qa.setup("t16-late-open"));
      const r = await page.evaluate(async () => { const h = qa.state.h; const blocker = await qa.openDb(h.name);
        const removed = new Promise((resolve, reject) => { const d = indexedDB.deleteDatabase(h.name); d.onsuccess = resolve; d.onerror = () => reject(d.error); });
        qa.setFault(undefined, 40);
        const result = await qa.logout();
        blocker.close(); await removed;
        await new Promise((resolve) => setTimeout(resolve, 80));
        const exists = (await indexedDB.databases()).find((db) => db.name === h.name);
        return { result, tx: h.transactions, calls: h.sdkCalls, schemaVersion: exists?.version ?? null }; });
      assert.equal(r.result.ok, false); assert.equal(r.tx, 0); assert.equal(r.calls, 0); assert.equal(r.schemaVersion, null);
      return { actualBlockedQueue: true, lateSchemaCreation: false };
    });
    await check("committed D with delayed completion stays unknown; late callback SDK zero", async () => {
      await page.evaluate(() => qa.setup("t16-unknown-commit"));
      const r = await page.evaluate(async () => { const h = qa.state.h; qa.setFault("delayed-complete", 40);
        const result = await qa.logout(); const rows = await qa.read();
        await new Promise((resolve) => setTimeout(resolve, 140));
        qa.setFault(undefined);
        const receipt = await h.lifecycle.lookup(h.ticket, "fixture-logout");
        return { result, rows, receipt, calls: h.sdkCalls }; });
      assert.equal(r.result.ok, false); assert.equal(r.result.code, "unconfirmed"); assert.equal(r.rows.bodyCount, 0);
      assert.equal(r.rows.control.phase, "inactive"); assert.equal(r.calls, 0); assert.equal(r.receipt.logoutId, "fixture-logout");
      return { actualCommit: true, injectedLateCompletionDelivery: true, sdkCalls: 0 };
    });
    await check("queued D copies caller ticket and returned receipt cannot rewrite control", async () => {
      await page.evaluate(() => qa.setup("t16-copy"));
      const r = await page.evaluate(async () => { const h = qa.state.h; const original = { ...h.ticket }; await qa.hold();
        const input = { ...h.ticket }; const pending = h.lifecycle.purge(input, "fixture-logout");
        input.ownerId = "changed-after-call"; input.storageGeneration = "changed-after-call";
        h.releaseHold(); await h.holdDone;
        const receipt = await pending; receipt.logoutId = "changed-return";
        const stored = await h.lifecycle.lookup(original, "fixture-logout"); return { stored, rows: await qa.read() }; });
      assert.equal(r.stored.ownerId, "fixture-a"); assert.equal(r.stored.logoutId, "fixture-logout"); assert.equal(r.rows.bodyCount, 0);
      return { actualQueuedTransaction: true };
    });
    await check("empty registry and mismatched body tuple never become purge success", async () => {
      for (const mode of ["empty", "other-body"]) {
        await page.evaluate((key) => qa.setup(key), "t16-" + mode);
        const r = await page.evaluate(async (mode) => { const h = qa.state.h;
          await qa.mutate((tx) => { tx.objectStore("bodies").clear();
            if (mode === "empty") tx.objectStore("control").clear();
            else tx.objectStore("bodies").put({ ...h.identity, sessionId: "orphan-session", payload: "synthetic" });
          });
          const result = await qa.logout(); return { result, calls: h.sdkCalls, rows: await qa.read() }; }, mode);
        assert.equal(r.result.ok, false); assert.equal(r.calls, 0); assert.equal(r.rows.bodyCount, mode === "empty" ? 0 : 1);
      }
      return { cases: 2 };
    });
    await check("live legacy session without stable id cannot consume an old ticket", async () => {
      await page.evaluate(() => qa.setup("t16-live-legacy"));
      const r = await page.evaluate(async () => { const h = qa.state.h;
        localStorage.setItem(h.runtime.storageKey, JSON.stringify(qa.syntheticSession("fixture-a", "")));
        return { result: await qa.logout(), calls: h.sdkCalls, tx: h.transactions, rows: await qa.read() }; });
      assert.equal(r.result.ok, false); assert.equal(r.calls, 0); assert.equal(r.tx, 0); assert.equal(r.rows.bodyCount, 1);
      return { capturedIdDidNotReplaceMissingLiveId: true };
    });
    await check("idempotent receipt and explicit new generation reject old ticket", async () => {
      await page.evaluate(() => qa.setup("t16-idempotent"));
      const r = await page.evaluate(async () => { const h = qa.state.h;
        const receipt = await h.lifecycle.purge(h.ticket, "fixture-logout");
        const replay = await h.lifecycle.purge(h.ticket, "fixture-logout");
        const lookup = await h.lifecycle.lookup(h.ticket, "fixture-logout");
        const next = await h.lifecycle.activate({ ...h.identity, storageGeneration: "generation-next" }, receipt);
        await qa.seed(h, next);
        let old; try { await h.lifecycle.purge(h.ticket, "fixture-logout"); old = "success"; } catch (e) { old = e.code; }
        return { receipt, replay, lookup, old, rows: await qa.read() }; });
      assert.deepEqual(r.receipt, r.replay); assert.deepEqual(r.receipt, r.lookup); assert.equal(r.old, "conflict"); assert.equal(r.rows.bodyCount, 1); assert.equal(r.rows.control.storageGeneration, "generation-next");
      return { receiptReplayEqual: true, newGenerationPreserved: true };
    });
    await check("SDK rejection leaves committed inactive generation; same-id retry succeeds", async () => {
      await page.evaluate(() => qa.setup("t16-sdk-failure"));
      const r = await page.evaluate(async () => { const h = qa.state.h; h.sdkFailure = true; const first = await qa.logout(); const rows = await qa.read();
        h.sdkFailure = false; const retry = await qa.logout(); return { first, rows, retry, calls: h.sdkCalls }; });
      assert.equal(r.first.ok, false); assert.equal(r.rows.bodyCount, 0); assert.equal(r.rows.control.phase, "inactive"); assert.equal(r.retry.ok, true); assert.equal(r.calls, 2);
      return { noAutomaticActivation: true };
    });
    for (const cut of ["before-D", "during-D", "after-ACK-before-SDK-response", "after-SDK"]) {
      await check(`owned browser SIGKILL/restart ${cut}`, async () => {
        const project = "t16-restart-" + cut.toLowerCase();
        const info = await page.evaluate((project) => qa.setup(project), project);
        if (cut === "during-D") {
          await page.evaluate(async () => { await qa.hold(); qa.state.h.pending = qa.logout(); });
          await page.waitForFunction(() => qa.trace.includes("D:start:readwrite"));
        } else if (cut === "after-ACK-before-SDK-response") {
          await page.evaluate(() => { qa.state.h.sdkGate = true; qa.state.h.pending = qa.logout(); });
          await page.waitForFunction(() => qa.trace.includes("SDK:waiting"));
          assert.equal((await page.evaluate(() => qa.read())).bodyCount, 0);
        } else if (cut === "after-SDK") assert.equal((await page.evaluate(() => qa.logout())).ok, true);
        await crash(); await start();
        const rows = await page.evaluate(async (info) => qa.read({ name: info.name }), info);
        const committed = cut.startsWith("after-");
        assert.equal(rows.control.phase, committed ? "inactive" : "active");
        assert.equal(rows.bodyCount, committed ? 0 : 1);
        return { dedicatedProfile: true, signal: "SIGKILL", phaseAfterRestart: rows.control.phase, bodyCount: rows.bodyCount,
          limitation: "OS process termination, not storage hardware power loss; during-D is a queued transaction" };
      });
    }
    const artifact = { scope: "dormant stage A; synthetic bodies only; no production auth/UI/writer", browser: await browser.version(),
      sdk: require("@supabase/auth-js/package.json").version, results };
    if (process.env.T16_WEB_ARTIFACT) await fs.writeFile(process.env.T16_WEB_ARTIFACT, JSON.stringify(artifact, null, 2) + "\n");
    console.log(JSON.stringify({ passed: results.length, browser: artifact.browser, sdk: artifact.sdk }));
  } finally {
    if (browserProcess) await crash();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error.stack); process.exitCode = 1; });
