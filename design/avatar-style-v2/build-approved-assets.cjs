#!/usr/bin/env node
/* Render the approved-style catalog with Chromium's SVG and canvas rasterizer. */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');

const ROOT = __dirname;
const SIZE = 512;
const REFERENCE = 'approved-human-reference.png';
const REFERENCE_SHA256 = '8746eede0db717630f9b8d280e49addf94affed43f98b59c80bc0925b361bd92';
const CHROME = process.env.AVATAR_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const COUNTS = { hair: 24, accessory: 20, face: 14, expression: 10, animal: 26, job: 44, garment: 6 };
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function assertPng(bytes, width, height, label) {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) ||
      bytes.readUInt32BE(16) !== width || bytes.readUInt32BE(20) !== height || bytes[24] !== 8 || bytes[25] !== 6) {
    throw new Error(`${label} must be a ${width}x${height} RGBA PNG`);
  }
}

function readReference() {
  const bytes = fs.readFileSync(path.join(ROOT, REFERENCE));
  if (sha256(bytes) !== REFERENCE_SHA256) throw new Error('Approved reference SHA-256 changed');
  assertPng(bytes, 1254, 1254, REFERENCE);
}

function catalog() {
  const exported = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, 'export-ops.cjs')], {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  }));
  global.window = {};
  require(path.join(ROOT, 'avatar64.js'));
  const A = global.window.PXAvatar64;
  if (!A || A.GRID !== 64 || exported.grid !== 64 || !Array.isArray(A.GARMENT) || A.GARMENT.length !== COUNTS.garment) {
    throw new Error('Avatar catalog or grid changed');
  }

  const base = exported.samples.find((item) => item.group === 'accessory' && item.id === 'none');
  if (!base) throw new Error('Missing base avatar specimen');
  const options = { ...base.spec };
  delete options.seed;
  delete options.v;
  const garments = A.GARMENT.map((item) => {
    const spec = A.spec(`avatar-style-v2/garment/${item.id}`, { ...options, garmentId: item.id });
    return { group: 'garment', id: item.id, ko: item.ko, en: item.en, spec, ops: A.ops(spec) };
  });
  const samples = exported.samples.concat(garments);
  const found = Object.fromEntries(Object.keys(COUNTS).map((group) => [group, 0]));
  const seen = new Set();
  for (const item of samples) {
    const key = `${item.group}/${item.id}`;
    if (!Object.hasOwn(found, item.group) || !/^[a-z0-9_-]+$/.test(item.id) || seen.has(key)) {
      throw new Error(`Invalid or duplicate catalog asset: ${key}`);
    }
    seen.add(key);
    found[item.group]++;
    if (!Array.isArray(item.ops) || item.ops.length === 0) throw new Error(`Empty avatar: ${key}`);
  }
  if (Object.keys(COUNTS).some((group) => found[group] !== COUNTS[group])) {
    throw new Error(`Catalog coverage changed: ${JSON.stringify(found)}`);
  }
  return { samples, palettes: exported.palettes };
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startChrome() {
  if (!fs.existsSync(CHROME)) throw new Error(`Chrome was not found: ${CHROME}`);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), '2ndb-avatar-assets-'));
  let chromeError = '';
  let launchError = null;
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--disable-extensions', '--disable-background-networking',
    '--no-first-run', '--no-default-browser-check', '--force-color-profile=srgb',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    '--remote-allow-origins=*', `--user-data-dir=${temp}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  chrome.on('error', (error) => { launchError = error; });
  chrome.stderr.on('data', (chunk) => { chromeError = (chromeError + chunk.toString()).slice(-2000); });

  const portFile = path.join(temp, 'DevToolsActivePort');
  try {
    let port = null;
    for (let attempt = 0; attempt < 300; attempt++) {
      if (launchError) throw launchError;
      if (chrome.exitCode !== null) throw new Error(`Chrome exited: ${chromeError}`);
      if (fs.existsSync(portFile)) {
        try {
          const value = Number(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]);
          if (Number.isSafeInteger(value) && value > 0) { port = value; break; }
        } catch (error) {
          // On Windows Chrome can briefly lock this file while writing it.
          if (!['EBUSY', 'EPERM', 'ENOENT'].includes(error.code)) throw error;
        }
      }
      await pause(50);
    }
    if (!port) throw new Error(`Timed out waiting for Chrome DevTools: ${chromeError}`);

    let target;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        target = await response.json();
        break;
      } catch (error) {
        if (attempt === 39) throw error;
        await pause(50);
      }
    }
    return { chrome, temp, target };
  } catch (error) {
    chrome.kill();
    const resolved = path.resolve(temp);
    if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('2ndb-avatar-assets-')) {
      try { fs.rmSync(resolved, { recursive: true, force: true }); } catch { /* Chrome may still be closing. */ }
    }
    throw error;
  }
}

async function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let id = 0;
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('Chrome DevTools WebSocket failed')), { once: true });
  });
  socket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (!pending.has(message.id)) return;
    const { resolve, reject, timer } = pending.get(message.id);
    clearTimeout(timer);
    pending.delete(message.id);
    if (message.error) reject(new Error(`Chrome DevTools: ${message.error.message}`));
    else resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(new Error('Chrome DevTools connection closed'));
    }
    pending.clear();
  });
  return {
    call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const callId = ++id;
        const timer = setTimeout(() => {
          pending.delete(callId);
          reject(new Error(`Chrome DevTools timed out: ${method}`));
        }, 30000);
        pending.set(callId, { resolve, reject, timer });
        try { socket.send(JSON.stringify({ id: callId, method, params })); }
        catch (error) { clearTimeout(timer); pending.delete(callId); reject(error); }
      });
    },
    close() { socket.close(); },
  };
}

async function rasterize(cdp, svg, label) {
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const expression = `(async () => {
    const image = new Image();
    image.src = ${JSON.stringify(dataUrl)};
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = ${SIZE}; canvas.height = ${SIZE};
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, ${SIZE}, ${SIZE});
    const rgba = context.getImageData(0, 0, ${SIZE}, ${SIZE}).data;
    let transparent = false, opaque = false;
    for (let at = 3; at < rgba.length; at += 4) {
      if (rgba[at] === 0) transparent = true;
      if (rgba[at] === 255) opaque = true;
      if (transparent && opaque) break;
    }
    if (!transparent || !opaque) throw new Error('Expected a visible avatar on transparent background');
    return canvas.toDataURL('image/png');
  })()`;
  const response = await cdp.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails || !response.result || typeof response.result.value !== 'string' ||
      !response.result.value.startsWith('data:image/png;base64,')) {
    throw new Error(`Chrome could not render ${label}: ${JSON.stringify(response.exceptionDetails || response.result)}`);
  }
  const bytes = Buffer.from(response.result.value.slice('data:image/png;base64,'.length), 'base64');
  assertPng(bytes, SIZE, SIZE, label);
  return bytes;
}

function listAssets(folder, output = []) {
  if (!fs.existsSync(folder)) return output;
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const target = path.join(folder, entry.name);
    if (entry.isDirectory()) listAssets(target, output);
    else if (entry.isFile()) output.push(path.relative(ROOT, target).replaceAll('\\', '/'));
  }
  return output;
}

function writeOrCheck(outputs, check) {
  const extras = listAssets(path.join(ROOT, 'assets')).filter((name) => !outputs.has(name));
  if (extras.length) throw new Error(`Unexpected generated assets: ${extras.join(', ')}`);
  if (check) {
    const mismatches = [];
    for (const [name, expected] of outputs) {
      const target = path.join(ROOT, name);
      if (!fs.existsSync(target) || !fs.readFileSync(target).equals(expected)) mismatches.push(name);
    }
    if (mismatches.length) throw new Error(`Generated files differ: ${mismatches.join(', ')}`);
    return;
  }
  for (const [name, bytes] of outputs) {
    const target = path.join(ROOT, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!fs.existsSync(target) || !fs.readFileSync(target).equals(bytes)) fs.writeFileSync(target, bytes);
  }
}

async function main() {
  if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== '--check')) {
    throw new Error('Usage: node build-approved-assets.cjs [--check]');
  }
  const check = process.argv[2] === '--check';
  readReference();
  const { samples, palettes } = catalog();
  const renderer = require(path.join(ROOT, 'approved-style-renderer.js'));
  let session;
  let cdp;
  try {
    session = await startChrome();
    cdp = await connect(session.target.webSocketDebuggerUrl);
    await cdp.call('Runtime.enable');
    const version = await cdp.call('Browser.getVersion');
    const outputs = new Map();
    const assets = [];
    for (const item of samples) {
      const relative = `assets/${item.group}/${item.id}.png`;
      const bytes = await rasterize(cdp, renderer.render(item.ops, SIZE), relative);
      outputs.set(relative, bytes);
      assets.push({ group: item.group, id: item.id, ko: item.ko, en: item.en, path: relative,
        sha256: sha256(bytes), bytes: bytes.length, spec: item.spec });
    }
    const manifest = {
      schema: '2ndb-avatar-style-assets/v2', grid: 64, renderSize: SIZE, pngColorType: 'RGBA',
      styleReference: REFERENCE, styleReferenceSha256: REFERENCE_SHA256,
      generator: 'avatar64.js', generatorSha256: sha256(fs.readFileSync(path.join(ROOT, 'avatar64.js'))),
      renderer: 'approved-style-renderer.js', rendererSha256: sha256(fs.readFileSync(path.join(ROOT, 'approved-style-renderer.js'))),
      catalogExporter: 'export-ops.cjs', catalogExporterSha256: sha256(fs.readFileSync(path.join(ROOT, 'export-ops.cjs'))),
      rasterizer: version.product, counts: COUNTS, palettes, assets,
    };
    outputs.set('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
    writeOrCheck(outputs, check);
    console.log(`${check ? 'Verified' : 'Built'} ${samples.length} approved-style RGBA assets at ${SIZE}x${SIZE}`);
  } finally {
    if (cdp) cdp.close();
    if (session) {
      session.chrome.kill();
      const resolved = path.resolve(session.temp);
      const tempRoot = path.resolve(os.tmpdir()) + path.sep;
      if (resolved.startsWith(tempRoot) && path.basename(resolved).startsWith('2ndb-avatar-assets-')) {
        for (let attempt = 0; attempt < 5; attempt++) {
          try { fs.rmSync(resolved, { recursive: true, force: true }); break; }
          catch { await pause(200); }
        }
      }
    }
  }
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
