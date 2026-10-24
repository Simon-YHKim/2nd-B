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
import { createAuthStorageRuntime, captureAuthSessionExpectation, runWithWebAuthMutationContext } from "./src/lib/auth/session-mutation";
import { activateExpectedWebInterviewSession, signOutExpectedWebInterviewSession,
  signOutExpectedWebInterviewSessionInsideMutation, signOutEmptyWebInterviewSession,
  signOutEmptyWebInterviewSessionInsideMutation, resolveWebInterviewSignOut, resolveWebInterviewSignOutInsideMutation } from "./src/lib/auth/web-interview-signout";
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
    if (fault === "upgrade-abort-after-store") request.addEventListener("upgradeneeded", () => {
      const db = request.result; const create = db.createObjectStore.bind(db);
      db.createObjectStore = (...args) => {
        const store = create(...args);
        if (args[0] === "logoutIntents") { trace.push("upgrade:store-created:abort"); request.transaction.abort(); }
        return store;
      };
    });
    request.addEventListener("success", () => {
      const db = request.result;
      const original = db.transaction.bind(db);
      db.transaction = (...args) => {
        h.transactions++;
        const tx = original(...args);
        trace.push("D:start:" + tx.mode);
        h.mark?.("D");
        tx.addEventListener("complete", () => trace.push("D:complete:" + tx.mode));
        tx.addEventListener("abort", () => trace.push("D:abort"));
        if (fault === "abort") queueMicrotask(() => tx.abort());
        if (fault === "delayed-complete") Object.defineProperty(tx, "oncomplete", {
          configurable: true,
          set(callback) { tx.addEventListener("complete", (event) => setTimeout(() => callback.call(tx, event), 100)); },
        });
        if (fault === "prepare-request-abort" || fault === "prepare-delayed-complete") {
          let preparing = false;
          if (fault === "prepare-delayed-complete") Object.defineProperty(tx, "oncomplete", {
            configurable: true, set(callback) { tx.addEventListener("complete", (event) => {
              if (preparing) setTimeout(() => callback.call(tx, event), 100); else callback.call(tx, event);
            }); },
          });
          const store = tx.objectStore.bind(tx);
          tx.objectStore = (name) => {
            const object = store(name);
            if (name === "logoutIntents") {
              const put = object.put.bind(object);
              object.put = (...args) => {
                preparing = true; const req = put(...args);
                req.addEventListener("success", () => {
                  trace.push("prepare:request-success");
                  if (fault === "prepare-request-abort") tx.abort();
                });
                return req;
              };
            }
            return object;
          };
        }
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
        if (fault === "read-request-abort") {
          const store = tx.objectStore.bind(tx);
          tx.objectStore = (name) => {
            const object = store(name);
            if (name === "bodies") {
              const keys = object.getAllKeys.bind(object);
              object.getAllKeys = (...args) => {
                const req = keys(...args);
                req.addEventListener("success", () => { trace.push("read:success:before-abort"); tx.abort(); });
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
      const tx = db.transaction([...db.objectStoreNames], "readonly");
      const intent = db.objectStoreNames.contains("logoutIntents") ? tx.objectStore("logoutIntents").getAll() : null;
      const c = tx.objectStore("control").getAll();
      const b = tx.objectStore("bodies").getAllKeys();
      tx.oncomplete = () => resolve({ control: c.result[0] ?? null, bodyCount: b.result.length, intent: intent?.result[0] ?? null, version: db.version });
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
async function mutate(fn, h = state.h) {
  const db = await openDb(h.name);
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction([...db.objectStoreNames], "readwrite");
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
  const h = { project, transactions: 0, idCalls: 0, sdkPublic: 0, publicScopes: [], sdkCalls: 0, sdkFailure: false, sdkGate: false, callbackDeferred: false };
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
      h.mark?.("SDK");
      if (h.sdkGate) { trace.push("SDK:waiting"); await new Promise((resolve) => { h.releaseSdk = resolve; }); }
      return h.sdkFailure ? new Response(JSON.stringify({ message: "synthetic rejection" }), { status: 500 }) : new Response(null, { status: 204 });
    } });
  const publicSignOut = h.client.signOut.bind(h.client);
  h.client.signOut = (options) => { h.sdkPublic++; h.publicScopes.push(options?.scope); return publicSignOut(options); };
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
async function logoutEmpty(h = state.h) {
  try { return { ok: true, result: await signOutEmptyWebInterviewSession(h.client, h.runtime, h.lifecycle, h.expected) }; }
  catch (error) { return { ok: false, code: error.code ?? error.name }; }
}
function fixtureIntent(h = state.h, id = "fixture-original", scope = "local") {
  return { v: 1, kind: "web-interview-logout", ownerId: h.ticket.ownerId, sessionId: h.ticket.sessionId,
    storageGeneration: h.ticket.storageGeneration, activeRevision: h.ticket.revision, logoutId: id, scope };
}
function newRequest(h = state.h) {
  return { kind: "new", scope: "local", createLogoutId(ticket) {
    h.idCalls++; h.original = { expected: { ...h.expected }, ticket: { ...ticket }, logoutId: "fixture-original", scope: "local" };
    return h.original.logoutId;
  } };
}
async function resolveLogout(kind = "resume", original, h = state.h) {
  try {
    const request = kind === "new" ? newRequest(h) : { kind: "resume", emptyScope: "global", ...(original ? { original } : {}) };
    return { ok: true, result: await resolveWebInterviewSignOut(h.client, h.runtime, h.lifecycle, h.expected, request) };
  } catch (error) { return { ok: false, code: error.code ?? error.name }; }
}
async function createV1(mode, h = state.h) {
  h.ticket = { ...h.identity, revision: 7 };
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open(h.name, 1);
    r.onupgradeneeded = () => {
      const c = r.result.createObjectStore("control");
      const b = r.result.createObjectStore("bodies", { keyPath: ["ownerId", "sessionId", "storageGeneration"] });
      if (mode === "schema") c.createIndex("unknown", "ownerId");
      if (mode !== "empty" && mode !== "orphan") c.put(mode === "undefined" ? undefined : {
        ...h.ticket, v: 1, phase: mode === "inactive" ? "inactive" : "active",
        revision: mode === "inactive" ? 8 : 7, logoutId: mode === "inactive" ? "fixture-original" : null,
        ...(mode === "field" ? { unknown: true } : {}),
      }, "current");
      if (mode !== "empty" && mode !== "inactive") b.put({ ...h.identity, payload: "synthetic legacy fixture" });
    };
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  db.close();
}
async function legacyBytes(h = state.h) {
  const db = await openDb(h.name);
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction(["control", "bodies"], "readonly");
    const c = tx.objectStore("control").getAll(); const ck = tx.objectStore("control").getAllKeys();
    const b = tx.objectStore("bodies").getAll(); const bk = tx.objectStore("bodies").getAllKeys();
    tx.oncomplete = () => resolve(JSON.stringify([c.result, ck.result, b.result, bk.result])); tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}
async function startDetached(stage) {
  const h = state.h;
  let reached;
  const entered = new Promise((resolve) => { reached = resolve; });
  h.mark = (point) => {
    if ((stage.startsWith("D") && point === "D") || (stage.startsWith("SDK") && point === "SDK")) {
      h.reached = true; reached();
    }
  };
  if (stage === "snapshot" || stage === "final-snapshot") {
    let reads = 0;
    const get = h.runtime.storage.getItem.bind(h.runtime.storage);
    h.runtime.storage.getItem = async (key) => {
      const result = await get(key);
      if (key === h.runtime.storageKey && ++reads === (stage === "snapshot" ? 1 : 2)) {
        h.reached = true; reached();
        await new Promise((resolve) => { h.releaseRead = resolve; });
      }
      return result;
    };
  }
  if (stage.startsWith("D")) await hold(h);
  if (stage.startsWith("SDK")) h.sdkGate = true;
  h.detached = h.runtime.runMutation(async (context) => {
    const child = stage.endsWith("purge")
      ? signOutExpectedWebInterviewSessionInsideMutation(h.client, h.runtime, context, h.lifecycle, h.expected, h.ticket, "fixture-logout")
      : signOutEmptyWebInterviewSessionInsideMutation(h.client, h.runtime, context, h.lifecycle, h.expected);
    void child.catch((error) => { h.childError = error.name; });
    await entered;
    h.callbackReturned = true; // Deliberately leave the helper running.
  }, { requireCrossTab: true }).then(() => ({ ok: true }), (error) => ({ ok: false, code: error.name }));
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
window.qa = { resolveWebInterviewSignOut, resolveWebInterviewSignOutInsideMutation, fixtureIntent, newRequest, resolveLogout, createV1, legacyBytes, runWithWebAuthMutationContext, state, trace, setup, read, seed, mutate, logout, logoutEmpty, startDetached, hold, openDb, setFault, syntheticSession,
  captureAuthSessionExpectation, createWebInterviewLifecycle, activateExpectedWebInterviewSession, signOutExpectedWebInterviewSession,
  signOutExpectedWebInterviewSessionInsideMutation, signOutEmptyWebInterviewSession, signOutEmptyWebInterviewSessionInsideMutation };
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
            // A genuine newer upgrade removes a required store; the v2 adapter must fail.
            const db = await new Promise((resolve, reject) => { const r = indexedDB.open(h.name, 3); r.onupgradeneeded = () => r.result.deleteObjectStore("control"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); db.close();
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
    await check("B0a actual inspector distinguishes fresh empty, active body0, inactive and corruption", async () => {
      for (const mode of ["empty", "active-empty", "inactive", "orphan", "extra-control"]) {
        await page.evaluate((key) => qa.setup(key), "t16-b0-inspect-" + mode);
        const r = await page.evaluate(async (mode) => {
          const h = qa.state.h;
          if (mode === "inactive") await h.lifecycle.purge(h.ticket, "fixture-logout");
          else await qa.mutate((tx) => {
            if (mode !== "orphan") tx.objectStore("bodies").clear();
            if (mode === "empty" || mode === "orphan") tx.objectStore("control").clear();
            if (mode === "extra-control") tx.objectStore("control").put({ unknown: true }, "other");
          });
          let observation;
          try { observation = (await h.lifecycle.inspect()).kind; } catch (e) { observation = e.code; }
          const outcome = await qa.logoutEmpty();
          return { observation, outcome, rows: await qa.read(), calls: h.sdkCalls };
        }, mode);
        assert.equal(r.observation, mode === "empty" ? "empty" : mode === "active-empty" ? "active" : mode === "inactive" ? "inactive" : "unconfirmed");
        assert.equal(r.outcome.ok, mode === "empty");
        assert.equal(r.calls, mode === "empty" ? 1 : 0);
        if (mode === "empty") assert.deepEqual(r.outcome.result, { kind: "auth-only" });
        if (mode === "orphan") assert.equal(r.rows.bodyCount, 1);
      }
      return { actualSchemaAndRows: true, cases: 5 };
    });
    await check("B0a initial empty auth-only preserves legacy, rotated stable, and known-null auth", async () => {
      for (const mode of ["legacy", "legacy-rotation", "stable-rotation", "null", "cleared"]) {
        await page.evaluate((key) => qa.setup(key, { activate: false }), "t16-b0-auth-" + mode);
        const r = await page.evaluate(async (mode) => {
          const h = qa.state.h;
          if (mode.startsWith("legacy")) localStorage.setItem(h.runtime.storageKey, JSON.stringify(qa.syntheticSession("fixture-a", "")));
          if (mode === "null") localStorage.removeItem(h.runtime.storageKey);
          h.expected = await qa.captureAuthSessionExpectation(h.client, h.runtime);
          if (mode.endsWith("rotation")) localStorage.setItem(h.runtime.storageKey, JSON.stringify(qa.syntheticSession("fixture-a", mode === "legacy-rotation" ? "" : "fixture-session-a", 2)));
          if (mode === "cleared") localStorage.removeItem(h.runtime.storageKey);
          const outcome = await qa.logoutEmpty();
          return { outcome, calls: h.sdkCalls, events: qa.trace.filter((v) => v === "event:SIGNED_OUT:sync").length, tx: h.transactions };
        }, mode);
        assert.equal(r.outcome.ok, mode !== "legacy-rotation");
        if (mode === "legacy-rotation") { assert.equal(r.calls, 0); assert.equal(r.tx, 0); }
        else assert(r.events > 0);
      }
      return { cases: 5, sdkAndStorageReal: true };
    });
    await check("B0a readonly request success, denied, and late completion cannot authorize SDK", async () => {
      for (const fault of ["read-request-abort", "denied", "delayed-complete"]) {
        await page.evaluate((key) => qa.setup(key, { activate: false }), "t16-b0-fault-" + fault);
        const r = await page.evaluate(async (fault) => {
          const h = qa.state.h; qa.setFault(fault, fault === "delayed-complete" ? 40 : 4000);
          const outcome = await qa.logoutEmpty();
          await new Promise((resolve) => setTimeout(resolve, 130));
          return { outcome, calls: h.sdkCalls, trace: qa.trace.slice(), authPresent: (await h.client.getSession()).data.session !== null };
        }, fault);
        assert.equal(r.outcome.ok, false); assert.equal(r.calls, 0); assert.equal(r.authPresent, true);
        if (fault === "read-request-abort") assert(r.trace.includes("read:success:before-abort"));
      }
      return { actualReadAbort: true, faultInjectionCases: 3 };
    });
    await check("B0a two pages: fresh empty retains M through SDK and blocks activation", async () => {
      await page.evaluate(() => qa.setup("t16-b0-empty-tabs", { activate: false }));
      await other.evaluate(() => qa.setup("t16-b0-empty-tabs", { seed: false, activate: false }));
      await page.evaluate(() => { const h = qa.state.h; h.sdkGate = true; h.pending = qa.logoutEmpty(); });
      await page.waitForFunction(() => qa.trace.includes("SDK:waiting"));
      await other.evaluate(() => {
        const h = qa.state.h;
        h.activation = qa.activateExpectedWebInterviewSession(h.client, h.runtime, h.lifecycle, h.expected, "new-generation", null)
          .then(() => ({ ok: true }), (e) => ({ ok: false, code: e.name }));
      });
      await other.waitForFunction(async () => (await navigator.locks.query()).pending.some((v) => v.name.startsWith("secondbrain:auth-mutation:")));
      assert.equal(await other.evaluate(() => qa.state.h.transactions), 0);
      await page.evaluate(() => qa.state.h.releaseSdk());
      assert.equal((await page.evaluate(() => qa.state.h.pending)).ok, true);
      assert.equal((await other.evaluate(() => qa.state.h.activation)).ok, false);
      assert.equal((await page.evaluate(() => qa.read())).control, null);
      return { realPages: 2, queuedWebLockObserved: true, activationAfterLogoutRejected: true };
    });
    await check("B0a SDK failure retry rereads D and cannot reuse old empty across activation", async () => {
      await page.evaluate(() => qa.setup("t16-b0-empty-retry", { activate: false }));
      const r = await page.evaluate(async () => {
        const h = qa.state.h; const oldObservation = await h.lifecycle.inspect();
        h.sdkFailure = true; const first = await qa.logoutEmpty(); h.sdkFailure = false;
        h.ticket = await qa.activateExpectedWebInterviewSession(h.client, h.runtime, h.lifecycle, h.expected, h.identity.storageGeneration, null);
        await qa.seed(); const retry = await qa.logoutEmpty();
        return { oldObservation, first, retry, calls: h.sdkCalls, rows: await qa.read() };
      });
      assert.equal(r.oldObservation.kind, "empty"); assert.equal(r.first.ok, false); assert.equal(r.retry.ok, false);
      assert.equal(r.calls, 1); assert.equal(r.rows.bodyCount, 1); assert.equal(r.rows.control.phase, "active");
      return { cachedObservationHasNoConsumer: true };
    });
    await check("B0a copied and previous real-M contexts cannot inspect or sign out", async () => {
      await page.evaluate(() => qa.setup("t16-b0-stale-context", { activate: false }));
      const r = await page.evaluate(async () => {
        const h = qa.state.h; const outcomes = []; let old;
        await h.runtime.runMutation(async (ctx) => {
          old = ctx;
          try { await qa.signOutEmptyWebInterviewSessionInsideMutation(h.client, h.runtime, { ...ctx }, h.lifecycle, h.expected); outcomes.push("success"); }
          catch (e) { outcomes.push(e.name); }
        }, { requireCrossTab: true });
        await h.runtime.runMutation(async () => {
          try { await qa.signOutEmptyWebInterviewSessionInsideMutation(h.client, h.runtime, old, h.lifecycle, h.expected); outcomes.push("success"); }
          catch (e) { outcomes.push(e.name); }
        }, { requireCrossTab: true });
        return { outcomes, tx: h.transactions, calls: h.sdkCalls };
      });
      assert.deepEqual(r.outcomes, ["AuthMutationContextUnavailableError", "AuthMutationContextUnavailableError"]);
      assert.equal(r.tx, 0); assert.equal(r.calls, 0);
      return { realContextMinting: true, rejectedCases: 2 };
    });
    await check("B0a synchronous return closes queued D and actual helper registration", async () => {
      for (const mode of ["direct-D", "auth-only", "explicit", "throw"]) {
        await page.evaluate(([key, bound]) => qa.setup(key, { activate: bound }), ["t16-b0-sync-" + mode, mode !== "auth-only"]);
        const r = await page.evaluate(async (mode) => {
          const h = qa.state.h; let child; let dispatched = 0; let reads = 0;
          const originalRead = h.client.getSession.bind(h.client);
          h.client.getSession = (...args) => { reads++; return originalRead(...args); };
          let outerResult; let outerError; let childError;
          try {
            outerResult = await h.runtime.runMutation((context) => {
              queueMicrotask(() => {
                if (mode === "direct-D" || mode === "throw") child = qa.runWithWebAuthMutationContext(h.runtime, context, async (guard) => {
                  guard(); dispatched++; const receipt = await h.lifecycle.purge(h.ticket, "late-id"); guard(); return receipt;
                });
                else if (mode === "auth-only") child = qa.signOutEmptyWebInterviewSessionInsideMutation(h.client, h.runtime, context, h.lifecycle, h.expected);
                else child = qa.signOutExpectedWebInterviewSessionInsideMutation(h.client, h.runtime, context, h.lifecycle, h.expected, h.ticket, "late-id");
                void child.catch(() => undefined);
              });
              if (mode === "throw") throw new Error("original-sync-error");
              return "ordinary";
            }, { requireCrossTab: true });
          } catch (e) { outerError = e.message; }
          try { await child; } catch (e) { childError = e.name; }
          return { outerResult, outerError, childError, reads, dispatched, tx: h.transactions, calls: h.sdkCalls,
            rows: mode === "auth-only" ? null : await qa.read() };
        }, mode);
        assert.equal(r.childError, "AuthMutationContextUnavailableError");
        assert.equal(r.reads, 0); assert.equal(r.dispatched, 0); assert.equal(r.tx, 0); assert.equal(r.calls, 0);
        if (mode === "throw") assert.equal(r.outerError, "original-sync-error"); else assert.equal(r.outerResult, "ordinary");
        if (r.rows) { assert.equal(r.rows.control.phase, "active"); assert.equal(r.rows.bodyCount, 1); }
      }
      return { realDAndHelpers: true, cases: 4, lateRegistration: 0 };
    });
    await check("B0a thenable getter reentry is closed and nested actual SDK retains M", async () => {
      await page.evaluate(() => qa.setup("t16-b0-thenable", { activate: false }));
      await other.evaluate(() => qa.setup("t16-b0-thenable", { activate: false, seed: false }));
      await page.evaluate(() => {
        const h = qa.state.h; h.sdkGate = true; h.getterReads = 0; h.getterDispatched = 0;
        h.pending = h.runtime.runMutation((context) => Object.defineProperty({}, "then", { get() {
          h.getterReads++;
          h.getterChild = qa.runWithWebAuthMutationContext(h.runtime, context, () => { h.getterDispatched++; });
          void h.getterChild.catch((e) => { h.getterError = e.name; });
          return (resolve) => {
            resolve(qa.signOutEmptyWebInterviewSessionInsideMutation(h.client, h.runtime, context, h.lifecycle, h.expected));
            throw new Error("ignored after resolve");
          };
        } }), { requireCrossTab: true });
      });
      await page.waitForFunction(() => qa.trace.includes("SDK:waiting"));
      await other.evaluate(() => { const h = qa.state.h; h.next = h.runtime.runMutation(() => { h.nextEntered = true; }, { requireCrossTab: true }); });
      await other.waitForFunction(async () => (await navigator.locks.query()).pending.some((v) => v.name.startsWith("secondbrain:auth-mutation:")));
      assert.equal(await other.evaluate(() => Boolean(qa.state.h.nextEntered)), false);
      const r = await page.evaluate(async () => {
        const h = qa.state.h; h.releaseSdk(); const outcome = await h.pending;
        return { outcome, getterReads: h.getterReads, getterDispatched: h.getterDispatched, getterError: h.getterError, calls: h.sdkCalls };
      });
      await other.evaluate(() => qa.state.h.next);
      assert.deepEqual(r.outcome, { kind: "auth-only" }); assert.equal(r.getterReads, 1); assert.equal(r.getterDispatched, 0);
      assert.equal(r.getterError, "AuthMutationContextUnavailableError"); assert.equal(r.calls, 1);
      return { realPages: 2, realSdk: true, getterReads: 1, queuedWebLockObserved: true };
    });
    for (const stage of ["snapshot", "D-empty", "D-purge", "final-snapshot", "SDK-empty", "SDK-purge"]) {
      await check(`B0a unawaited helper drains real M during ${stage}`, async () => {
        const project = "t16-b0-drain-" + stage.toLowerCase();
        await page.evaluate(([project, bound]) => qa.setup(project, { activate: bound }), [project, stage.endsWith("purge")]);
        // Ensure the initial empty schema exists before an actual held D transaction.
        if (stage === "D-empty") await page.evaluate(() => qa.state.h.lifecycle.inspect());
        await other.evaluate((project) => qa.setup(project, { seed: false, activate: false }), project);
        await page.evaluate((stage) => qa.startDetached(stage), stage);
        await page.waitForFunction(() => qa.state.h.reached && qa.state.h.callbackReturned);
        assert.equal(await page.evaluate(async () => (await navigator.locks.query()).held.some((v) => v.name.startsWith("secondbrain:auth-mutation:"))), true);
        await other.evaluate(() => { const h = qa.state.h; h.next = h.runtime.runMutation(() => { h.nextEntered = true; }, { requireCrossTab: true }); });
        await other.waitForFunction(async () => (await navigator.locks.query()).pending.some((v) => v.name.startsWith("secondbrain:auth-mutation:")));
        assert.equal(await other.evaluate(() => Boolean(qa.state.h.nextEntered)), false);
        const outcome = await page.evaluate(async (stage) => {
          const h = qa.state.h;
          if (stage.startsWith("D")) { h.releaseHold(); await h.holdDone; }
          else if (stage.startsWith("SDK")) h.releaseSdk(); else h.releaseRead();
          return await h.detached;
        }, stage);
        assert.equal(outcome.ok, false); assert.equal(outcome.code, "AuthMutationContextUnavailableError");
        await other.evaluate(() => qa.state.h.next);
        assert.equal(await page.evaluate(() => qa.state.h.sdkCalls), stage.startsWith("SDK") ? 1 : 0);
        if (stage === "D-purge") {
          const rows = await page.evaluate(() => qa.read()); assert.equal(rows.bodyCount, 0); assert.equal(rows.control.phase, "inactive");
        }
        return { realPages: 2, realSdkAndIdb: true, queuedWebLockObserved: true, sdkAlreadyStarted: stage.startsWith("SDK") };
      });
    }
    await check("B0b v1 empty/active/inactive upgrade preserves exact legacy rows and rejects old adapter", async () => {
      for (const mode of ["empty", "active", "inactive"]) {
        await page.evaluate((key) => qa.setup(key, { activate: false }), "t16-b0b-v1-" + mode);
        const r = await page.evaluate(async (mode) => {
          const h = qa.state.h; await qa.createV1(mode); const before = await qa.legacyBytes();
          const old = await qa.openDb(h.name, 1); old.onversionchange = () => old.close();
          const observed = await h.lifecycle.inspect(); const after = await qa.legacyBytes();
          let oldError; try { (await qa.openDb(h.name, 1)).close(); } catch (e) { oldError = e.name; }
          const outcome = mode === "inactive" ? await qa.resolveLogout() : null;
          return { unchanged: before === after, kind: observed.kind, oldError, outcome, rows: await qa.read(), sdk: h.sdkPublic };
        }, mode);
        assert.equal(r.unchanged, true); assert.equal(r.kind, mode); assert.equal(r.rows.version, 2);
        assert.equal(r.rows.intent, null); assert.equal(r.oldError, "VersionError"); assert.equal(r.sdk, 0);
        if (mode === "inactive") assert.equal(r.outcome.code, "unconfirmed-missing-origin");
      }
      return { actualUpgrade: true, legacyPayloadNotRewritten: true, cases: 3 };
    });
    await check("B0b malformed v1 upgrade aborts before adding intent store", async () => {
      for (const mode of ["schema", "field", "orphan", "undefined"]) {
        await page.evaluate((key) => qa.setup(key, { activate: false }), "t16-b0b-invalid-v1-" + mode);
        const r = await page.evaluate(async (mode) => {
          const h = qa.state.h; await qa.createV1(mode); const before = await qa.legacyBytes();
          const outcome = await qa.resolveLogout("new"); const after = await qa.legacyBytes();
          const db = await qa.openDb(h.name); const info = { version: db.version, stores: [...db.objectStoreNames] }; db.close();
          return { outcome, unchanged: before === after, info, ids: h.idCalls, sdk: h.sdkPublic };
        }, mode);
        assert.equal(r.outcome.ok, false); assert.equal(r.unchanged, true); assert.equal(r.info.version, 1);
        assert.deepEqual(r.info.stores, ["bodies", "control"]); assert.equal(r.ids, 0); assert.equal(r.sdk, 0);
      }
      return { actualUpgradeAbort: true, cases: 4 };
    });
    await check("B0b partial versionchange creation abort rolls schema and rows back", async () => {
      await page.evaluate(() => qa.setup("t16-b0b-upgrade-partial", { activate: false }));
      const r = await page.evaluate(async () => {
        const h = qa.state.h; await qa.createV1("active"); const before = await qa.legacyBytes();
        qa.setFault("upgrade-abort-after-store"); const outcome = await qa.resolveLogout("new");
        const after = await qa.legacyBytes(); const db = await qa.openDb(h.name);
        const version = db.version, stores = [...db.objectStoreNames]; db.close();
        return { outcome, unchanged: before === after, version, stores, sdk: h.sdkPublic, trace: qa.trace.slice() };
      });
      assert.equal(r.outcome.ok, false); assert.equal(r.unchanged, true); assert.equal(r.version, 1);
      assert.deepEqual(r.stores, ["bodies", "control"]); assert.equal(r.sdk, 0); assert(r.trace.includes("upgrade:store-created:abort"));
      return { realVersionchangeRollback: true, injectedAbortAfterStoreCreation: true };
    });
    await check("B0b blocked v1 upgrade rejects and late unblock cannot create schema", async () => {
      await page.evaluate(() => qa.setup("t16-b0b-upgrade-blocked", { activate: false }));
      const r = await page.evaluate(async () => {
        const h = qa.state.h; await qa.createV1("active"); const before = await qa.legacyBytes();
        const blocker = await qa.openDb(h.name, 1); qa.setFault(undefined, 40);
        const outcome = await qa.resolveLogout("new"); blocker.close();
        await new Promise((yes) => setTimeout(yes, 80)); const after = await qa.legacyBytes();
        const rows = await qa.read(); return { outcome, unchanged: before === after, rows, sdk: h.sdkPublic, ids: h.idCalls };
      });
      assert.equal(r.outcome.ok, false); assert.equal(r.unchanged, true); assert.equal(r.rows.version, 1);
      assert.equal(r.rows.intent, null); assert.equal(r.sdk, 0); assert.equal(r.ids, 0);
      return { actualBlockedUpgrade: true, lateSchemaMutation: 0 };
    });
    await check("B0b new request fixes ID before prepare and preserves A active/inactive revisions", async () => {
      for (const bodies of [0, 1]) {
        await page.evaluate((key) => qa.setup(key), "t16-b0b-new-" + bodies);
        const r = await page.evaluate(async (bodies) => {
          const h = qa.state.h; if (!bodies) await qa.mutate((tx) => tx.objectStore("bodies").clear());
          let preparedRows; const prepare = h.lifecycle.prepareIntent.bind(h.lifecycle);
          h.lifecycle.prepareIntent = async (intent) => { const result = await prepare(intent); preparedRows = await qa.read(); return result; };
          const outcome = await qa.resolveLogout("new"); return { outcome, preparedRows, rows: await qa.read(), ids: h.idCalls, sdk: h.sdkPublic, scopes: h.publicScopes };
        }, bodies);
        assert.equal(r.outcome.ok, true); assert.equal(r.outcome.result.kind, "draft-purged");
        assert.equal(r.preparedRows.control.phase, "active"); assert.equal(r.preparedRows.control.logoutId, null); assert.equal(r.preparedRows.control.revision, 1);
        assert.equal(r.preparedRows.bodyCount, bodies); assert.equal(r.preparedRows.intent.logoutId, "fixture-original");
        assert.equal(r.rows.control.phase, "inactive"); assert.equal(r.rows.control.revision, 2); assert.equal(r.rows.bodyCount, 0);
        assert.equal(r.rows.intent.activeRevision, 1); assert.equal(r.ids, 1); assert.equal(r.sdk, 1); assert.deepEqual(r.scopes, ["local"]);
      }
      return { cases: 2, prepareIsNotPurge: true, originalRevisionPreserved: true };
    });
    await check("B0b prepare request abort and delayed ACK never continue to purge or SDK", async () => {
      for (const fault of ["prepare-request-abort", "prepare-delayed-complete"]) {
        await page.evaluate((key) => qa.setup(key), "t16-b0b-" + fault);
        const r = await page.evaluate(async (fault) => {
          const h = qa.state.h; qa.setFault(fault, fault.endsWith("complete") ? 40 : 4000);
          const outcome = await qa.resolveLogout("new"); await new Promise((yes) => setTimeout(yes, 130));
          const rows = await qa.read(); const sdkBefore = h.sdkPublic; const trace = qa.trace.slice();
          qa.setFault(undefined); const retry = await qa.resolveLogout("resume", h.original);
          return { outcome, rows, sdkBefore, retry, final: await qa.read(), ids: h.idCalls, trace };
        }, fault);
        assert.equal(r.outcome.ok, false); assert.equal(r.rows.control.phase, "active"); assert.equal(r.rows.bodyCount, 1); assert.equal(r.sdkBefore, 0);
        assert.equal(r.rows.intent !== null, fault.endsWith("complete")); assert(r.trace.includes("prepare:request-success"));
        assert.equal(r.retry.ok, true); assert.equal(r.final.control.logoutId, "fixture-original"); assert.equal(r.final.control.revision, 2); assert.equal(r.ids, 1);
      }
      return { actualRequestAbort: true, actualCommitWithLateAck: true, exactOriginRetry: true };
    });
    await check("B0b queued prepare copies input and returned ACK cannot rewrite the original intent", async () => {
      await page.evaluate(() => qa.setup("t16-b0b-prepare-copy"));
      const r = await page.evaluate(async () => {
        const h = qa.state.h; await qa.hold(); const input = qa.fixtureIntent();
        const pending = h.lifecycle.prepareIntent(input);
        input.ownerId = "changed-owner"; input.logoutId = "changed-id"; input.scope = "global";
        h.releaseHold(); await h.holdDone; const ack = await pending;
        ack.logoutId = "changed-ack"; ack.scope = "global";
        const before = await qa.read(); const outcome = await qa.resolveLogout();
        return { before, outcome, after: await qa.read(), scopes: h.publicScopes, ids: h.idCalls };
      });
      assert.equal(r.before.intent.ownerId, "fixture-a"); assert.equal(r.before.intent.logoutId, "fixture-original"); assert.equal(r.before.intent.scope, "local");
      assert.equal(r.before.control.logoutId, null); assert.equal(r.before.bodyCount, 1); assert.equal(r.outcome.ok, true);
      assert.equal(r.after.control.logoutId, "fixture-original"); assert.deepEqual(r.scopes, ["local"]); assert.equal(r.ids, 0);
      return { actualQueuedD: true, copiedInputAndOutput: true };
    });
    await check("B0b unsupported or denied IDB never becomes auth-only or starts new ID", async () => {
      for (const mode of ["unsupported", "denied"]) {
        await page.evaluate((key) => qa.setup(key, { activate: false }), "t16-b0b-unavailable-" + mode);
        const r = await page.evaluate(async (mode) => {
          const h = qa.state.h;
          if (mode === "unsupported") h.lifecycle = qa.createWebInterviewLifecycle({ storageKey: h.runtime.storageKey, indexedDB: null });
          else qa.setFault("denied");
          const outcome = await qa.resolveLogout("new");
          return { outcome, ids: h.idCalls, sdk: h.sdkPublic };
        }, mode);
        assert.equal(r.outcome.ok, false); assert.equal(r.ids, 0); assert.equal(r.sdk, 0);
      }
      return { cases: 2, unavailableIsNotEmpty: true };
    });
    await check("B0b two pages serialize conflicting intent CAS without overwriting the first ID", async () => {
      await page.evaluate(() => qa.setup("t16-b0b-intent-cas"));
      await other.evaluate(() => qa.setup("t16-b0b-intent-cas", { activate: false, seed: false }));
      const ticket = await page.evaluate(() => qa.state.h.ticket);
      await other.evaluate((ticket) => { qa.state.h.ticket = ticket; }, ticket);
      await page.evaluate(() => qa.hold());
      await page.evaluate(() => { const h = qa.state.h; h.prepare = h.lifecycle.prepareIntent(qa.fixtureIntent(h, "first-id")).then(() => "ok", (e) => e.code); });
      await page.waitForFunction(() => qa.state.h.transactions > 0);
      await other.evaluate(() => { const h = qa.state.h; h.prepare = h.lifecycle.prepareIntent(qa.fixtureIntent(h, "second-id")).then(() => "ok", (e) => e.code); });
      await other.waitForFunction(() => qa.state.h.transactions > 0);
      await page.evaluate(async () => { qa.state.h.releaseHold(); await qa.state.h.holdDone; });
      assert.equal(await page.evaluate(() => qa.state.h.prepare), "ok"); assert.equal(await other.evaluate(() => qa.state.h.prepare), "conflict");
      const r = await page.evaluate(async () => {
        const h = qa.state.h; let scopeError; try { await h.lifecycle.prepareIntent(qa.fixtureIntent(h, "first-id", "global")); } catch (e) { scopeError = e.code; }
        return { scopeError, rows: await qa.read(), sdk: h.sdkPublic };
      });
      assert.equal(r.scopeError, "conflict"); assert.equal(r.rows.intent.logoutId, "first-id"); assert.equal(r.rows.intent.scope, "local");
      assert.equal(r.rows.control.logoutId, null); assert.equal(r.rows.bodyCount, 1); assert.equal(r.sdk, 0);
      return { realPages: 2, actualTransactionQueue: true, immutableIdAndScope: true };
    });
    await check("B0b durable active/inactive resume keeps original scope and rejects explicit scope escalation", async () => {
      for (const phase of ["active", "inactive"]) {
        await page.evaluate((key) => qa.setup(key), "t16-b0b-resume-" + phase);
        const r = await page.evaluate(async (phase) => {
          const h = qa.state.h; await h.lifecycle.prepareIntent(qa.fixtureIntent());
          if (phase === "inactive") await h.lifecycle.purge(h.ticket, "fixture-original", "local");
          let wrongScope; try { await qa.signOutExpectedWebInterviewSession(h.client, h.runtime, h.lifecycle, h.expected, h.ticket, "fixture-original", "global"); } catch (e) { wrongScope = e.code; }
          const before = await qa.read(); const sdkBefore = h.sdkPublic;
          const outcome = await qa.resolveLogout(); return { wrongScope, before, sdkBefore, outcome, rows: await qa.read(), ids: h.idCalls, scopes: h.publicScopes };
        }, phase);
        assert.equal(r.wrongScope, "conflict"); assert.equal(r.before.control.phase, phase); assert.equal(r.sdkBefore, 0);
        assert.equal(r.outcome.ok, true); assert.equal(r.rows.control.revision, 2); assert.equal(r.rows.intent.activeRevision, 1);
        assert.equal(r.ids, 0); assert.deepEqual(r.scopes, ["local"]);
      }
      return { cases: 2, originalScopeRequired: true, inactiveUsesOriginalActiveRevision: true };
    });
    await check("B0b bound foreign/new-session/legacy/unknown auth keeps body and intent; known-null resumes", async () => {
      for (const mode of ["foreign", "new-session", "legacy", "unknown", "null"]) {
        await page.evaluate((key) => qa.setup(key), "t16-b0b-auth-" + mode);
        const r = await page.evaluate(async (mode) => {
          const h = qa.state.h; await h.lifecycle.prepareIntent(qa.fixtureIntent());
          if (mode === "null") localStorage.removeItem(h.runtime.storageKey);
          else if (mode !== "unknown") localStorage.setItem(h.runtime.storageKey, JSON.stringify(qa.syntheticSession(mode === "foreign" ? "fixture-b" : "fixture-a", mode === "legacy" ? "" : "different-session")));
          h.expected = await qa.captureAuthSessionExpectation(h.client, h.runtime);
          if (mode === "unknown") h.runtime.storage.getItem = async () => { throw new Error("synthetic unknown auth read"); };
          const outcome = await qa.resolveLogout(); return { outcome, rows: await qa.read(), ids: h.idCalls, sdk: h.sdkPublic };
        }, mode);
        assert.equal(r.outcome.ok, mode === "null"); assert.equal(r.sdk, mode === "null" ? 1 : 0); assert.equal(r.ids, 0);
        assert.equal(r.rows.bodyCount, mode === "null" ? 0 : 1); assert.equal(r.rows.intent.logoutId, "fixture-original");
      }
      return { cases: 5, noOwnerGuessing: true };
    });
    await check("B0b active unknown and legacy inactive never invent a restart ID", async () => {
      for (const phase of ["active", "inactive"]) for (const cleared of [false, true]) {
        await page.evaluate((key) => qa.setup(key), "t16-b0b-missing-" + phase + cleared);
        const r = await page.evaluate(async ([phase, cleared]) => {
          const h = qa.state.h; if (phase === "inactive") await h.lifecycle.purge(h.ticket, "fixture-original");
          if (cleared) { localStorage.removeItem(h.runtime.storageKey); h.expected = await qa.captureAuthSessionExpectation(h.client, h.runtime); }
          const outcome = await qa.resolveLogout(); return { outcome, rows: await qa.read(), ids: h.idCalls, sdk: h.sdkPublic };
        }, [phase, cleared]);
        assert.equal(r.outcome.code, "unconfirmed-missing-origin"); assert.equal(r.rows.control.phase, phase);
        assert.equal(r.rows.intent, null); assert.equal(r.ids, 0); assert.equal(r.sdk, 0);
      }
      return { cases: 4, restartWithoutOriginIsNotNewAction: true };
    });
    await check("B0b corrupt/orphan/undefined/extra-key intents cannot be consumed or cleared", async () => {
      for (const mode of ["orphan", "field", "revision", "undefined", "extra-key"]) {
        await page.evaluate((key) => qa.setup(key), "t16-b0b-corrupt-" + mode);
        const r = await page.evaluate(async (mode) => {
          const h = qa.state.h;
          await qa.mutate((tx) => {
            if (mode === "orphan") { tx.objectStore("bodies").clear(); tx.objectStore("control").clear(); }
            tx.objectStore("logoutIntents").put(mode === "undefined" ? undefined : { ...qa.fixtureIntent(),
              ...(mode === "field" ? { unknown: true } : {}), ...(mode === "revision" ? { activeRevision: 3 } : {}) }, mode === "extra-key" ? "other" : "current");
          });
          const before = await qa.legacyBytes(); const outcome = await qa.resolveLogout();
          return { outcome, unchanged: before === await qa.legacyBytes(), sdk: h.sdkPublic, ids: h.idCalls };
        }, mode);
        assert.equal(r.outcome.ok, false); assert.equal(r.unchanged, true); assert.equal(r.sdk, 0); assert.equal(r.ids, 0);
      }
      return { cases: 5, exactIntentSchemaRequired: true };
    });
    await check("B0b SDK failure keeps intent/receipt and retry uses the original ID without revision growth", async () => {
      await page.evaluate(() => qa.setup("t16-b0b-sdk-retry"));
      const r = await page.evaluate(async () => {
        const h = qa.state.h; h.sdkFailure = true; const first = await qa.resolveLogout("new"); const before = await qa.read();
        h.sdkFailure = false; const retry = await qa.resolveLogout("resume", h.original);
        return { first, before, retry, after: await qa.read(), ids: h.idCalls, sdk: h.sdkPublic, scopes: h.publicScopes };
      });
      assert.equal(r.first.ok, false); assert.equal(r.before.control.phase, "inactive"); assert.equal(r.before.bodyCount, 0);
      assert.equal(r.retry.ok, true); assert.deepEqual(r.before, r.after); assert.equal(r.ids, 1); assert.equal(r.sdk, 2);
      assert.deepEqual(r.scopes, ["local", "local"]);
      return { localReceiptIdempotent: true, sdkRedeliveryNotExactlyOnce: true };
    });
    await check("B0b new generation removes matching intent atomically and old retry preserves new body", async () => {
      await page.evaluate(() => qa.setup("t16-b0b-activation"));
      await other.evaluate(() => qa.setup("t16-b0b-activation", { activate: false, seed: false }));
      const info = await page.evaluate(async () => {
        const h = qa.state.h; await h.lifecycle.prepareIntent(qa.fixtureIntent());
        let activeError; try { await qa.activateExpectedWebInterviewSession(h.client, h.runtime, h.lifecycle, h.expected, "new-generation", null); } catch (e) { activeError = e.code; }
        h.sdkFailure = true; h.original = { expected: h.expected, ticket: h.ticket, logoutId: "fixture-original", scope: "local" };
        await qa.resolveLogout(); const receipt = (await qa.read()).control;
        return { activeError, receipt: { ownerId: receipt.ownerId, sessionId: receipt.sessionId, storageGeneration: receipt.storageGeneration, revision: receipt.revision, phase: receipt.phase, logoutId: receipt.logoutId } };
      });
      assert.equal(info.activeError, "conflict");
      await other.evaluate(async (receipt) => {
        const h = qa.state.h; h.ticket = await qa.activateExpectedWebInterviewSession(h.client, h.runtime, h.lifecycle, h.expected, "new-generation", receipt);
        await qa.seed();
      }, info.receipt);
      const r = await page.evaluate(async () => {
        const h = qa.state.h; const before = await qa.read(); const sdkBefore = h.sdkPublic; const retry = await qa.resolveLogout("resume", h.original);
        return { before, retry, after: await qa.read(), sdkBefore, sdkAfter: h.sdkPublic };
      });
      assert.equal(r.before.control.phase, "active"); assert.equal(r.before.control.revision, 3); assert.equal(r.before.intent, null);
      assert.equal(r.before.bodyCount, 1); assert.equal(r.retry.ok, false); assert.deepEqual(r.before, r.after); assert.equal(r.sdkBefore, r.sdkAfter);
      return { realPages: 2, activationAndIntentDeleteAtomic: true, staleGenerationPreserved: true };
    });
    await check("B0b unawaited prepared operation drains real M but cannot purge after callback end", async () => {
      await page.evaluate(() => qa.setup("t16-b0b-prepared-drain"));
      await other.evaluate(() => qa.setup("t16-b0b-prepared-drain", { activate: false, seed: false }));
      await page.evaluate(() => {
        const h = qa.state.h; let reached; const entered = new Promise((yes) => { reached = yes; });
        const prepare = h.lifecycle.prepareIntent.bind(h.lifecycle);
        h.lifecycle.prepareIntent = async (intent) => { const result = await prepare(intent); h.reached = true; reached(); await new Promise((yes) => { h.releasePrepare = yes; }); return result; };
        h.pending = h.runtime.runMutation(async (context) => {
          void qa.resolveWebInterviewSignOutInsideMutation(h.client, h.runtime, context, h.lifecycle, h.expected, qa.newRequest());
          await entered; h.callbackReturned = true;
        }, { requireCrossTab: true }).then(() => ({ ok: true }), (e) => ({ ok: false, code: e.name }));
      });
      await page.waitForFunction(() => qa.state.h.reached && qa.state.h.callbackReturned);
      await other.evaluate(() => { const h = qa.state.h; h.next = h.runtime.runMutation(() => { h.nextEntered = true; }, { requireCrossTab: true }); });
      await other.waitForFunction(async () => (await navigator.locks.query()).pending.some((v) => v.name.startsWith("secondbrain:auth-mutation:")));
      assert.equal(await other.evaluate(() => Boolean(qa.state.h.nextEntered)), false);
      const r = await page.evaluate(async () => {
        const h = qa.state.h; h.releasePrepare(); const outcome = await h.pending;
        return { outcome, rows: await qa.read(), sdk: h.sdkPublic };
      });
      await other.evaluate(() => qa.state.h.next);
      assert.equal(r.outcome.code, "AuthMutationContextUnavailableError"); assert.equal(r.rows.control.phase, "active");
      assert.equal(r.rows.bodyCount, 1); assert.equal(r.rows.intent.logoutId, "fixture-original"); assert.equal(r.sdk, 0);
      return { realPages: 2, preparedIntentIsNotPurgeReceipt: true, registeredTaskDrained: true };
    });
    for (const cut of ["before-prepare", "queued-prepare", "after-prepare", "after-purge", "SDK-pending", "after-SDK"]) {
      await check(`B0b owned SIGKILL/restart resumes original intent at ${cut}`, async () => {
        const project = "t16-b0b-crash-" + cut.toLowerCase();
        const info = await page.evaluate((project) => qa.setup(project), project);
        if (cut === "after-SDK") assert.equal((await page.evaluate(() => qa.resolveLogout("new"))).ok, true);
        else {
          await page.evaluate(async (cut) => {
            const h = qa.state.h;
            if (cut === "SDK-pending") h.sdkGate = true;
            else {
              const method = cut === "after-purge" ? "purge" : "prepareIntent";
              const original = h.lifecycle[method].bind(h.lifecycle);
              h.lifecycle[method] = async (...args) => {
                if (cut === "queued-prepare") { await qa.hold(); h.cutReached = true; return original(...args); }
                if (cut === "before-prepare") { h.cutReached = true; await new Promise(() => {}); }
                const result = await original(...args); h.cutReached = true; await new Promise(() => {}); return result;
              };
            }
            h.pending = qa.resolveLogout("new");
          }, cut);
          await page.waitForFunction((cut) => cut === "SDK-pending" ? qa.trace.includes("SDK:waiting") : qa.state.h.cutReached, cut);
          if (cut === "queued-prepare") await page.waitForFunction(() => qa.state.h.transactions >= 2);
        }
        await crash(); await start();
        await page.evaluate((project) => qa.setup(project, { activate: false, seed: false }), project);
        const r = await page.evaluate(async () => {
          const h = qa.state.h; const before = await qa.read(); const outcome = await qa.resolveLogout();
          return { before, outcome, after: await qa.read(), ids: h.idCalls, sdk: h.sdkPublic, scopes: h.publicScopes };
        });
        const prepared = cut !== "before-prepare" && cut !== "queued-prepare";
        assert.equal(r.ids, 0); assert.equal(r.before.intent !== null, prepared); assert.equal(r.outcome.ok, prepared);
        if (!prepared) { assert.equal(r.outcome.code, "unconfirmed-missing-origin"); assert.equal(r.after.bodyCount, 1); assert.equal(r.sdk, 0); }
        else {
          assert.equal(r.before.intent.logoutId, "fixture-original"); assert.equal(r.before.intent.activeRevision, 1); assert.equal(r.before.intent.scope, "local");
          assert.equal(r.after.control.logoutId, "fixture-original"); assert.equal(r.after.control.revision, 2); assert.equal(r.after.bodyCount, 0);
          assert.equal(r.sdk, 1); assert.deepEqual(r.scopes, ["local"]);
        }
        return { dedicatedProfile: true, signal: "SIGKILL", durableOriginPresent: prepared, idsAfterRestart: 0,
          limitation: "OS process termination, not hardware power loss; queued prepare cannot commit before held D" };
      });
    }
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
    const artifact = { scope: "dormant stages A/B0a/B0b; actual IDB2 durable intent; synthetic bodies only; no production auth/UI/writer", browser: await browser.version(),
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
