#!/usr/bin/env node
/**
 * PIXEL-CLAY five-axis scorer.
 *
 * A consumes route-level measurements made from the rendered DOM. B reads the
 * captured PNG with pngjs. C compares the normalized depth-3 section order,
 * count and relative heights. D compares the declared {label,to} route edges
 * with rendered interactive destinations. E keeps capture-app's text score.
 *
 * nav.json contains labels, not destination routes. Until nav-routes.json is
 * present, D fails closed instead of treating label presence as route proof.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT = path.join(HERE, '..');
const AXIS_MAX = Object.freeze({ A: 30, B: 25, C: 20, D: 15, E: 10 });
const INVISIBLE = /[\u2060\u200B\u200C\u200D\uFEFF]/g;
const EXTRA_PALETTE = ['#060912', '#070A13'];

const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const normText = (value) => String(value ?? '').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();

function countDataEntries(value) {
  return Object.keys(value ?? {}).filter((key) => key !== '_note').length;
}

export function deriveManifestStats(screens, routesFile) {
  return {
    total: screens.length,
    portTrue: screens.filter((screen) => screen.port === true).length,
    portFalse: screens.filter((screen) => screen.port === false).length,
    deferred: screens.filter((screen) => screen.port === 'deferred').length,
    stage1: screens.filter((screen) => screen.port === true && screen.stage === 1).map((screen) => screen.id),
    mapped: countDataEntries(routesFile?.routes),
    unmeasurable: countDataEntries(routesFile?.unmeasurable),
    unmapped: countDataEntries(routesFile?.unmapped),
  };
}

function normalizeHex(hex) {
  const value = String(hex).toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(value)) return value;
  if (/^#[0-9A-F]{3}$/.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  return null;
}

export function paletteFromTokens(tokens) {
  const palette = new Set(EXTRA_PALETTE);
  for (const value of Object.values(tokens?.vars ?? {})) {
    for (const match of String(value).matchAll(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?/g)) {
      const color = normalizeHex(match[0]);
      if (color) palette.add(color);
    }
  }
  return palette;
}

export function readPngHistogram(file, options = {}) {
  const png = PNG.sync.read(readFileSync(file));
  if ((options.width && png.width !== options.width) || (options.height && png.height !== options.height)) {
    throw new Error(`${file}: expected ${options.width}x${options.height}, got ${png.width}x${png.height}`);
  }
  if (options.requireOpaque) {
    let translucent = 0;
    for (let index = 3; index < png.data.length; index += 4) {
      if (png.data[index] !== 255) translucent += 1;
    }
    if (translucent) throw new Error(`${file}: ${translucent} non-opaque pixels violate the capture contract`);
  }
  const counts = new Map();
  for (let index = 0; index < png.data.length; index += 4) {
    if (png.data[index + 3] === 0) continue;
    const color = `#${[png.data[index], png.data[index + 1], png.data[index + 2]]
      .map((part) => part.toString(16).padStart(2, '0'))
      .join('')}`.toUpperCase();
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([color, pixels]) => ({ color, pixels }))
    .sort((left, right) => left.color.localeCompare(right.color));
}

export function scorePixelDiscipline(metrics = {}) {
  const required = ['curves', 'round', 'blur', 'alpha'];
  const missing = required.filter(
    (key) => !Object.hasOwn(metrics, key)
      || typeof metrics[key] !== 'number'
      || !Number.isFinite(metrics[key])
      || !Number.isInteger(metrics[key])
      || metrics[key] < 0,
  );
  const values = Object.fromEntries(
    required.map((key) => [key, missing.includes(key) ? 0 : metrics[key]]),
  );
  const violations = Object.values(values).reduce((sum, value) => sum + value, 0);
  const deductions = missing.length ? [`missing rendered DOM metrics: ${missing.join(', ')}`] : [];
  deductions.push(...Object.entries(values)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => `${key}=${value}: -${value * 6}`));
  return {
    score: missing.length ? 0 : round2(Math.max(0, AXIS_MAX.A - violations * 6)),
    max: AXIS_MAX.A,
    violations,
    missing,
    values,
    deductions,
  };
}

export function scoreTokenFidelity(histogram, palette) {
  const rows = Array.isArray(histogram)
    ? histogram
    : Object.entries(histogram ?? {}).map(([color, pixels]) => ({ color, pixels }));
  const totalPixels = rows.reduce((sum, row) => sum + Math.max(0, Number(row.pixels) || 0), 0);
  const outside = rows.filter((row) => !palette.has(normalizeHex(row.color)));
  const outsidePixels = outside.reduce((sum, row) => sum + Math.max(0, Number(row.pixels) || 0), 0);
  const ratio = totalPixels ? (totalPixels - outsidePixels) / totalPixels : 0;
  const deductions = [];
  if (!totalPixels) deductions.push('no painted pixels were measured');
  if (outsidePixels) deductions.push(`${outsidePixels} painted pixels outside the token palette`);
  return {
    score: round2(ratio * AXIS_MAX.B),
    max: AXIS_MAX.B,
    ratio,
    totalPixels,
    outsidePixels,
    outsideColors: outside.slice(0, 20),
    deductions,
  };
}

function sectionNodes(root, maxDepth = 3) {
  const nodes = [];
  const firstText = (node) => {
    if (normText(node?.text)) return normText(node.text);
    for (const child of node?.kids ?? []) {
      const found = firstText(child);
      if (found) return found;
    }
    return '';
  };
  const walk = (node, depth) => {
    if (!node || depth > maxDepth) return;
    if (depth > 0 && Array.isArray(node.box) && node.box[0] > 0 && node.box[1] > 0) {
      const semantic = normText(node.sectionKey ?? node.role ?? node.ariaLabel) || firstText(node);
      nodes.push({
        signature: `${String(node.tag ?? 'unknown')}|${semantic || `children:${node.kids?.length ?? 0}`}`,
        height: Number(node.box[1]) || 0,
      });
    }
    for (const child of node.kids ?? []) walk(child, depth + 1);
  };
  walk(root, 0);
  return nodes;
}

function lcsLength(left, right) {
  const previous = new Array(right.length + 1).fill(0);
  for (const leftValue of left) {
    let diagonal = 0;
    for (let index = 1; index <= right.length; index += 1) {
      const saved = previous[index];
      previous[index] = leftValue === right[index - 1]
        ? diagonal + 1
        : Math.max(previous[index], previous[index - 1]);
      diagonal = saved;
    }
  }
  return previous[right.length];
}

export function scoreStructure(refTree, appTree) {
  const ref = sectionNodes(refTree);
  const app = sectionNodes(appTree);
  const largestCount = Math.max(ref.length, app.length);
  const orderRatio = largestCount
    ? lcsLength(ref.map((node) => node.signature), app.map((node) => node.signature)) / largestCount
    : 1;
  const countRatio = largestCount ? Math.min(ref.length, app.length) / largestCount : 1;
  const refHeight = Number(refTree?.box?.[1]) || 1;
  const appHeight = Number(appTree?.box?.[1]) || 1;
  let heightsWithinTolerance = 0;
  for (let index = 0; index < Math.min(ref.length, app.length); index += 1) {
    const expected = ref[index].height / refHeight;
    const actual = app[index].height / appHeight;
    const relativeError = expected === 0 ? (actual === 0 ? 0 : Infinity) : Math.abs(actual - expected) / expected;
    if (relativeError <= 0.1) heightsWithinTolerance += 1;
  }
  const heightRatio = largestCount ? heightsWithinTolerance / largestCount : 1;
  const score = round2(orderRatio * 10 + countRatio * 5 + heightRatio * 5);
  const deductions = [];
  if (orderRatio < 1) deductions.push(`section order match ${round2(orderRatio * 100)}%`);
  if (countRatio < 1) deductions.push(`section count match ${round2(countRatio * 100)}%`);
  if (heightRatio < 1) deductions.push(`relative height tolerance match ${round2(heightRatio * 100)}%`);
  return {
    score,
    max: AXIS_MAX.C,
    orderRatio,
    countRatio,
    heightRatio,
    refSections: ref.length,
    appSections: app.length,
    deductions,
  };
}

function normalizeRoute(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  const isAbsolute = /^[a-z][a-z\d+.-]*:/i.test(raw) || raw.startsWith('//');
  try {
    const url = new URL(raw, 'https://secondb.local');
    const route = (url.pathname.replace(/^\/2nd-B(?=\/|$)/, '') || '/') + url.search + url.hash;
    if (!isAbsolute) return route;
    return url.origin === 'null' ? url.href : `${url.origin}${route}`;
  } catch {
    return null;
  }
}

export function scoreNavigation(declared, actual) {
  const rawExpected = declared ?? [];
  if (rawExpected.length === 0) {
    return { score: AXIS_MAX.D, max: AXIS_MAX.D, ratio: 1, matched: 0, declared: 0, measurable: true, deductions: [] };
  }
  const expected = rawExpected.map((entry) => ({
    label: normText(entry?.label),
    to: normalizeRoute(entry?.to),
  }));
  if (expected.some((entry) => !entry.label || !entry.to)) {
    return {
      score: 0,
      max: AXIS_MAX.D,
      ratio: 0,
      matched: 0,
      declared: expected.length,
      measurable: false,
      deductions: ['navigation destination contract is missing'],
    };
  }
  const rendered = (actual ?? [])
    .filter((entry) => entry?.interactive === true)
    .map((entry) => ({ label: normText(entry.text), to: normalizeRoute(entry.to) }));
  const remaining = [...rendered];
  let matched = 0;
  let wrongDestination = 0;
  for (const edge of expected) {
    const exact = remaining.findIndex((candidate) => candidate.label === edge.label && candidate.to === edge.to);
    if (exact >= 0) {
      matched += 1;
      remaining.splice(exact, 1);
      continue;
    }
    if (remaining.some((candidate) => candidate.label === edge.label && candidate.to !== edge.to)) wrongDestination += 1;
  }
  const total = expected.length;
  const ratio = total ? matched / total : 1;
  const deductions = [];
  if (wrongDestination) deductions.push(`${wrongDestination} navigation controls have the wrong destination`);
  if (matched !== total) deductions.push(`${total - matched} declared navigation routes were not verified`);
  return {
    score: round2(ratio * AXIS_MAX.D),
    max: AXIS_MAX.D,
    ratio,
    matched,
    declared: total,
    measurable: true,
    deductions,
  };
}

export function scoreCopy(textMatchPct) {
  const valid = typeof textMatchPct === 'number'
    && Number.isFinite(textMatchPct)
    && textMatchPct >= 0
    && textMatchPct <= 100;
  const pct = valid ? clamp(textMatchPct, 0, 100) : 0;
  return {
    score: round2(pct * 0.1),
    max: AXIS_MAX.E,
    textMatchPct: pct,
    deductions: valid ? (pct === 100 ? [] : [`copy coverage ${round2(pct)}%`]) : ['copy coverage artifact is invalid'],
  };
}

export function scoreScreen(screenId, input, deviations = []) {
  const results = {
    A: scorePixelDiscipline(input.metrics),
    B: scoreTokenFidelity(input.histogram, input.palette),
    C: scoreStructure(input.refStructure, input.appStructure),
    D: scoreNavigation(input.declaredNav, input.actualNav),
    E: scoreCopy(input.textMatchPct),
  };
  const deductions = [];
  const humanReviewAxes = [];
  const manualReviewAxes = [];
  const details = {};

  for (const axis of Object.keys(AXIS_MAX)) {
    const entries = deviations.filter((entry) => entry.screen === screenId && entry.axis === axis);
    const valid = entries.filter((entry) => typeof entry.why === 'string' && entry.why.trim());
    const invalid = entries.length - valid.length;
    const raw = results[axis];
    if (valid.length) {
      raw.score = raw.max;
      manualReviewAxes.push(axis);
    }
    if (invalid) {
      raw.score = round2(Math.max(0, raw.score - invalid));
      deductions.push(`${axis}: ${invalid} deviation(s) have empty why and are not exempt`);
    }
    if (!valid.length) deductions.push(...raw.deductions.map((reason) => `${axis}: ${reason}`));
    if (entries.length > AXIS_MAX[axis] / 2) humanReviewAxes.push(axis);
    details[axis] = { ...raw, deviations: valid };
  }

  const scores = Object.fromEntries(Object.keys(AXIS_MAX).map((axis) => [axis, details[axis].score]));
  return {
    ...scores,
    total: round2(Object.values(scores).reduce((sum, score) => sum + score, 0)),
    automaticPass: manualReviewAxes.length === 0
      && Object.values(scores).reduce((sum, score) => sum + score, 0) >= 98,
    deductions,
    humanReviewAxes,
    manualReviewAxes,
    details,
  };
}

function descendantText(node) {
  const parts = [];
  if (node?.text) parts.push(node.text);
  for (const child of node?.kids ?? []) {
    const text = descendantText(child);
    if (text) parts.push(text);
  }
  return normText(parts.join(' '));
}

function flattenInteractive(node, output = []) {
  if (!node) return output;
  if (node.tag === 'button' || node.tag === 'a' || node.interactive === true) {
    output.push({
      text: descendantText(node),
      to: node.to ?? node.href ?? node.route ?? null,
      interactive: true,
    });
  }
  for (const child of node.kids ?? []) flattenInteractive(child, output);
  return output;
}

class UsageError extends Error {}

function parseArgs(args) {
  const allowed = new Set(['app-out', 'out', 'curves', 'radius', 'alpha', 'screens']);
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith('--')) throw new UsageError(`unexpected argument: ${value}`);
    const key = value.slice(2);
    if (!allowed.has(key)) throw new UsageError(`unknown option: --${key}`);
    const next = args[index + 1];
    if (!next || next.startsWith('--')) throw new UsageError(`--${key} requires a value`);
    parsed[key] = next;
    index += 1;
  }
  if (!parsed['app-out'] || !parsed.out) throw new UsageError('--app-out and --out are required');
  return parsed;
}

function readJson(file, fallback = null) {
  return file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
}

function rowsByRoute(file, fields) {
  const rows = readJson(file, []);
  return new Map((Array.isArray(rows) ? rows : []).map((row) => [row.route, Object.fromEntries(fields.map((field) => [field, row[field]]))]));
}

function mergeRouteMetrics(route, maps) {
  return Object.assign({}, ...maps.map((map) => map.get(route) ?? {}));
}

export function buildScoreReport({ appOut, curvesFile, radiusFile, alphaFile, screensFilter }) {
  const screensFile = readJson(path.join(KIT, 'data', 'screens.json'), { screens: [] });
  const routesFile = readJson(path.join(KIT, 'data', 'app-routes.json'), {});
  const navFile = readJson(
    path.join(KIT, 'data', 'nav-routes.json'),
    readJson(path.join(KIT, 'data', 'nav.json'), {}),
  );
  const tokens = readJson(path.join(KIT, 'data', 'tokens.json'), {});
  const deviationsFile = readJson(path.join(KIT, 'data', 'deviations.json'), { deviations: [] });
  const appReport = readJson(path.join(appOut, 'app-report.json'), { compare: [] });
  const copyById = new Map((appReport.compare ?? []).map((row) => [row.id, row.textMatchPct]));
  const palette = paletteFromTokens(tokens);
  const metricMaps = [
    rowsByRoute(curvesFile, ['curves']),
    rowsByRoute(radiusFile, ['round', 'blur']),
    rowsByRoute(alphaFile, ['alpha']),
  ];
  const only = screensFilter ? new Set(screensFilter.split(',').map((id) => id.trim()).filter(Boolean)) : null;
  const known = new Set(
    screensFile.screens
      .filter((screen) => screen.port === true && routesFile.routes?.[screen.id])
      .map((screen) => screen.id),
  );
  const unknownScreens = only ? [...only].filter((id) => !known.has(id)) : [];
  const targets = screensFile.screens.filter(
    (screen) => screen.port === true && routesFile.routes?.[screen.id] && (!only || only.has(screen.id)),
  );
  const scores = [];

  for (const screen of targets) {
    const route = routesFile.routes[screen.id];
    const screenshot = path.join(appOut, `${screen.id}.png`);
    const refStructure = readJson(path.join(KIT, 'data', 'structure', `${screen.id}.json`));
    const appStructure = readJson(path.join(appOut, 'structure', `${screen.id}.json`));
    const missing = [
      !existsSync(screenshot) && 'screenshot',
      !refStructure && 'reference structure',
      !appStructure && 'app structure',
      copyById.get(screen.id) == null && 'copy result',
    ].filter(Boolean);
    if (missing.length) {
      scores.push({ id: screen.id, route, error: `missing ${missing.join(', ')}` });
      continue;
    }
    try {
      const scored = scoreScreen(screen.id, {
        metrics: mergeRouteMetrics(route, metricMaps),
        histogram: readPngHistogram(screenshot, { width: 390, height: 820, requireOpaque: true }),
        palette,
        refStructure,
        appStructure,
        declaredNav: navFile[screen.id] ?? [],
        actualNav: flattenInteractive(appStructure),
        textMatchPct: copyById.get(screen.id),
      }, deviationsFile.deviations ?? []);
      scores.push({ id: screen.id, route, ...scored });
    } catch (error) {
      scores.push({ id: screen.id, route, error: `${screenshot}: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  return {
    schemaVersion: 1,
    manifest: deriveManifestStats(screensFile.screens, routesFile),
    scoring: {
      threshold: 98,
      axes: AXIS_MAX,
      navigationContract: existsSync(path.join(KIT, 'data', 'nav-routes.json'))
        ? 'data/nav-routes.json'
        : 'missing: nav.json has labels only, so D fails closed',
    },
    inputs: {
      appOut: path.resolve(appOut),
      curvesFile: curvesFile ? path.resolve(curvesFile) : null,
      radiusFile: radiusFile ? path.resolve(radiusFile) : null,
      alphaFile: alphaFile ? path.resolve(alphaFile) : null,
    },
    selection: { requested: only ? [...only] : null, unknownScreens, targetCount: targets.length },
    scores,
  };
}

export function reportExitCode(report) {
  const selection = report?.selection;
  const scores = Array.isArray(report?.scores) ? report.scores : [];
  if (!selection || !Number.isInteger(selection.targetCount) || selection.targetCount <= 0) return 2;
  if (!Array.isArray(selection.unknownScreens) || selection.unknownScreens.length > 0) return 2;
  if (scores.length !== selection.targetCount) return 1;
  return scores.some((row) => row?.error || row?.automaticPass !== true) ? 1 : 0;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error('usage: node score.mjs --app-out <capture dir> --out <report.json> [--curves file --radius file --alpha file --screens ids]');
    process.exitCode = 2;
    return;
  }
  let report;
  try {
    report = buildScoreReport({
      appOut: path.resolve(args['app-out']),
      curvesFile: args.curves ? path.resolve(args.curves) : null,
      radiusFile: args.radius ? path.resolve(args.radius) : null,
      alphaFile: args.alpha ? path.resolve(args.alpha) : null,
      screensFilter: args.screens,
    });
    writeFileSync(path.resolve(args.out), `${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }
  const exitCode = reportExitCode(report);
  if (exitCode === 2) {
    console.error(`invalid screen selection: ${report.selection.unknownScreens.join(', ') || 'no targets'}`);
    process.exitCode = 2;
    return;
  }
  const completed = report.scores.filter((row) => row.error == null);
  const passed = completed.filter((row) => row.automaticPass === true);
  console.log(`scored ${completed.length}/${report.scores.length} · >=98 ${passed.length}`);
  for (const row of report.scores) {
    if (row.error) console.error(`  ${row.id.padEnd(16)} ERROR ${row.error}`);
    else console.log(`  ${row.id.padEnd(16)} A${row.A} B${row.B} C${row.C} D${row.D} E${row.E} = ${row.total}`);
  }
  process.exitCode = exitCode;
}

const invoked = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invoked) await main();
