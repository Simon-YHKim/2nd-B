#!/usr/bin/env node
'use strict';

// Local source inventory only. No network, Supabase, deployment or secret access.
// Usage (after the reviewed changes are committed):
//   node scripts/qa/build-server-first-manifest.cjs --commit <full-40-hex-SHA>
//   ... --commit <SHA> --include <additional/repo/path> [--include <another/path>]
//   ... --self-test                 # in-memory fixtures; no production manifest
// This package never rewrites the historical f39652ac manifest or existing output bytes.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const ts = require('typescript');

const REPO = path.resolve(__dirname, '../..');
const BASELINE_REL = 'docs/qa/manifests/server-first-f39652ac.json';
const BASELINE_COMMIT = 'f39652acbe642f5807d54ad2df1b1547d300be3f';
const ENTRYPOINTS = [
  'claude-proxy', 'delete-account', 'gemini-proxy', 'oauth-naver', 'openai-proxy',
  'paddle-webhook', 'rewarded-ssv', 'rss-proxy', 'service-consent',
  'subscription-manage', 'xai-proxy',
].map(name => `supabase/functions/${name}/index.ts`);
const HISTORY = [
  '0008_personas.sql', '0031_consent_records.sql', '0062_consent_changes.sql',
  '0086_require_email_confirmation.sql', '0118_billing_refund_reconciliation.sql',
  '0130_safety_notice_ack.sql', '0134_credit_ledger.sql', '0135_credit_cutover.sql',
].map(name => `db/migrations/${name}`);
const CONSENT = [
  'supabase/functions/service-consent/index.ts',
  'supabase/functions/_shared/llm-consent.ts',
  'db/migration-drafts/UNNUMBERED_llm_service_consent_management.sql',
  'db/migration-drafts/tests/llm-service-consent-management-contract.sql',
  'db/migration-drafts/tests/llm-consent-snapshot-contract.sql',
  'src/lib/llm/__tests__/service-consent-edge.test.ts',
  'src/lib/llm/__tests__/llm-proxy-consent-boundary.test.ts',
  'src/lib/llm/__tests__/llm-proxy-consent-execution.test.ts',
  'src/lib/llm/__tests__/consent-failover.test.ts',
  'src/lib/llm/boundary.ts',
  'src/lib/privacy/service-consent.ts',
  'src/lib/privacy/__tests__/service-consent.test.ts',
  'src/lib/privacy/__tests__/service-consent-screen.test.ts',
  'src/app/service-consent.tsx',
  'src/components/consent/ServiceConsentLink.tsx',
  'docs/qa/SERVICE-CONSENT-260926.md',
];
// Explicit root-owned readiness delta observed 2026-09-26. Do not read git status
// at generation time: that would mix mutable worktree content into the package.
const READINESS = [
  'db/README.md',
  'docs/qa/ERASURE-FORWARD-260926.md',
  'db/migration-drafts/UNNUMBERED_service_contract_erasure_registry.sql',
  'db/migration-drafts/service-contract-erasure-entries.json',
  'db/migration-drafts/tests/service-contract-erasure-registry.sql',
  'db/migration-drafts/UNNUMBERED_polaris_generation_allowance.sql',
  'scripts/erasure-registry-forward.ts',
  'scripts/__tests__/erasure-registry-forward.test.ts',
  'scripts/__tests__/erasure-registry-guard.test.ts',
  'scripts/__tests__/supabase-security-drafts.test.ts',
  'scripts/check-erasure-registry.ts',
  'scripts/generate-erasure-registry.ts',
  'scripts/test-polaris-sql.mjs',
  'src/lib/privacy/__tests__/erasure-registry-migration.test.ts',
];
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function repoPath(value) {
  if (typeof value !== 'string' || !value || /[\\\0\r\n:]/.test(value) ||
      value.startsWith('/') || value.startsWith('../') ||
      path.posix.normalize(value) !== value || value === '..' || value === '.') {
    throw new Error(`Not a canonical repository-relative path: ${JSON.stringify(value)}`);
  }
  return value;
}

function parseArgs(args) {
  if (args.length === 1 && args[0] === '--self-test') return { selfTest: true };
  let commit;
  const includes = [];
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag !== '--commit' && flag !== '--include') throw new Error(`Unknown argument: ${flag}`);
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--commit') {
      if (commit) throw new Error('Specify --commit exactly once');
      if (!/^[a-f0-9]{40}$/i.test(value)) throw new Error('--commit requires a full 40-hex commit SHA, not HEAD, a branch, tag or abbreviation');
      commit = value.toLowerCase();
    } else includes.push(repoPath(value));
  }
  if (!commit) throw new Error('Required: --commit <full-40-hex-commit-SHA>; no mutable default');
  return { commit, includes: [...new Set(includes)].sort(compare) };
}

function git(args) {
  return cp.execFileSync('git', ['-C', REPO, ...args], {
    encoding: null, maxBuffer: 64 * 1024 * 1024, timeout: 30000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function gitReader(commit) {
  if (typeof commit !== 'string' || !/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error('Pinned reader requires an explicit full commit SHA');
  }
  if (git(['cat-file', '-t', commit]).toString('utf8').trim() !== 'commit') {
    throw new Error('The supplied object is not a commit');
  }
  const tree = new Map();
  for (const row of git(['ls-tree', '-r', '-z', '--full-tree', commit]).toString('utf8').split('\0').filter(Boolean)) {
    const match = /^(\d+) (\w+) ([a-f0-9]+)\t([\s\S]+)$/.exec(row);
    if (!match) throw new Error('Malformed git ls-tree output');
    tree.set(match[4], { mode: match[1], type: match[2], oid: match[3] });
  }
  const cache = new Map();
  return {
    has: rel => tree.has(rel),
    read(rel) {
      repoPath(rel);
      const item = tree.get(rel);
      if (!item || item.type !== 'blob') throw new Error(`Missing pinned blob: ${commit}:${rel}`);
      if (item.mode !== '100644' && item.mode !== '100755') throw new Error(`Symlink/non-regular source is not supported: ${rel}`);
      if (!cache.has(rel)) {
        // Buffer all the way through: no UTF-8 conversion/newline normalization
        // enters file hashes. AST decoding below is an independent read view.
        const bytes = git(['show', `${commit}:${rel}`]);
        cache.set(rel, { bytes, git_blob: item.oid, git_mode: item.mode });
      }
      return cache.get(rel);
    },
  };
}

function importEdges(rel, bytes) {
  if (rel.endsWith('.json')) return [];
  if (!/\.(?:[cm]?[jt]sx?)$/.test(rel)) throw new Error(`Unsupported local dependency extension: ${rel}`);
  const source = ts.createSourceFile(rel, bytes.toString('utf8'), ts.ScriptTarget.Latest, true);
  if (source.parseDiagnostics.length) {
    throw new Error(`TypeScript parse failed for ${rel}: ${ts.flattenDiagnosticMessageText(source.parseDiagnostics[0].messageText, ' ')}`);
  }
  const edges = [];
  function add(node, expression, kind) {
    const pos = source.getLineAndCharacterOfPosition(node.getStart(source));
    if (!expression || !(ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))) {
      throw new Error(`Computed/unresolved ${kind} at ${rel}:${pos.line + 1}`);
    }
    if (!expression.text) throw new Error(`Empty ${kind} at ${rel}:${pos.line + 1}`);
    edges.push({ from: rel, line: pos.line + 1, kind, specifier: expression.text });
  }
  function walk(node) {
    if (ts.isImportDeclaration(node)) add(node, node.moduleSpecifier, node.importClause?.isTypeOnly ? 'import-type' : 'import');
    else if (ts.isExportDeclaration(node) && node.moduleSpecifier) add(node, node.moduleSpecifier, node.isTypeOnly ? 'export-type' : 'export');
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node, node.moduleReference.expression, node.isTypeOnly ? 'import-equals-type' : 'import-equals');
    } else if (ts.isImportTypeNode(node)) {
      add(node, ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined, node.isTypeOf ? 'typeof-import' : 'import-type-expression');
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) add(node, node.arguments[0], 'dynamic-import');
      else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') add(node, node.arguments[0], 'require');
      else if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'require' &&
               ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'module') {
        add(node, node.arguments[0], 'module-require');
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(source);
  return edges;
}

function collectClosure(entrypoints, reader, addFile) {
  const seen = new Set();
  const imports = [];
  function visit(rel) {
    if (seen.has(rel)) return;
    seen.add(rel);
    addFile(rel, 'edge_import_closure');
    for (const edge of importEdges(rel, reader.read(rel).bytes)) {
      const spec = edge.specifier;
      if (spec.startsWith('./') || spec.startsWith('../')) {
        const resolved = repoPath(path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec)));
        if (/[?#]/.test(spec) || !reader.has(resolved)) {
          throw new Error(`Unresolved pinned local import at ${rel}:${edge.line}: ${JSON.stringify(spec)}`);
        }
        imports.push({ ...edge, resolution: 'local', path: resolved });
        visit(resolved);
      } else if (/^(?:https?:\/\/|jsr:|npm:|node:)/.test(spec)) {
        // Recorded, never fetched. This does not prove external bundle integrity.
        imports.push({ ...edge, resolution: 'external', downloaded: false });
      } else {
        // Import maps / file URLs / absolute paths cannot be resolved against
        // the pinned tree by this tool. Fail rather than silently omit a file.
        throw new Error(`Unresolved/unsupported import specifier at ${rel}:${edge.line}: ${JSON.stringify(spec)}`);
      }
    }
  }
  entrypoints.forEach(visit);
  imports.sort((a, b) => compare(a.from, b.from) || a.line - b.line || compare(a.kind, b.kind) || compare(a.specifier, b.specifier));
  return { files: [...seen].sort(compare), imports };
}

function build(options) {
  const baselineBytes = fs.readFileSync(path.join(REPO, BASELINE_REL));
  const baseline = JSON.parse(baselineBytes.toString('utf8'));
  if (baseline.source_commit !== BASELINE_COMMIT || !Array.isArray(baseline.files) || baseline.files.length !== 94 ||
      new Set(baseline.files.map(row => row.path)).size !== 94) throw new Error('Expected the pinned f39652ac, 94-file baseline manifest');
  const reader = gitReader(options.commit);
  const groups = new Map();
  function add(rel, group) {
    repoPath(rel);
    reader.read(rel); // Missing uncommitted seeds must fail, not be skipped.
    if (!groups.has(rel)) groups.set(rel, new Set());
    groups.get(rel).add(group);
  }
  for (const row of baseline.files) {
    add(row.path, 'baseline_f39652ac_inventory');
    for (const group of row.groups || []) add(row.path, group);
  }
  HISTORY.forEach(rel => add(rel, 'historical_prerequisite_anchor'));
  CONSENT.forEach(rel => add(rel, 'service_consent_followup'));
  READINESS.forEach(rel => add(rel, 'erasure_readiness_followup'));
  options.includes.forEach(rel => add(rel, 'explicit_additional_seed'));
  ENTRYPOINTS.forEach(rel => add(rel, 'edge_entrypoint'));
  const closure = collectClosure(ENTRYPOINTS, reader, add);
  const files = [...groups].sort(([a], [b]) => compare(a, b)).map(([rel, labels]) => {
    const item = reader.read(rel);
    return { path: rel, git_blob: item.git_blob, git_mode: item.git_mode,
      bytes: item.bytes.length, sha256: sha256(item.bytes), groups: [...labels].sort(compare) };
  });
  const inventory = files.map(row => `${row.path}\0${row.sha256}\n`).join('');
  return {
    schema_version: 2,
    source_commit: options.commit,
    source_pr: 'https://github.com/Simon-YHKim/2nd-B/pull/1865',
    package_status: 'Local source inventory only; not delivery, deployment, activation or production verification evidence',
    hash_contract: 'SHA-256 over exact raw git show <explicit commit>:<path> blob bytes; no text or newline normalization',
    reproduction: { script: 'scripts/qa/build-server-first-manifest.cjs', script_sha256: sha256(fs.readFileSync(__filename)),
      typescript_version: ts.version, explicit_additional_seeds: options.includes,
      output_reproducibility: 'Deterministic for the same explicit commit, baseline bytes, script and TypeScript version; no current timestamp or worktree source input' },
    baseline_inventory: { path: BASELINE_REL, source_commit: BASELINE_COMMIT, files: 94, manifest_sha256: sha256(baselineBytes),
      use: 'Path inventory only; every listed file is read again from source_commit, never copied from the old package' },
    historical_anchors: HISTORY,
    edge_entrypoints: ENTRYPOINTS,
    edge_closure: { method: 'TypeScript AST: static import/export, import-equals, literal dynamic import, import type/typeof import, literal require',
      local_files: closure.files, imports: closure.imports,
      external_specifiers: [...new Set(closure.imports.filter(edge => edge.resolution === 'external').map(edge => edge.specifier))].sort(compare),
      limitations: 'External dependencies are not downloaded or validated; not a deployed Deno bundle. Computed imports, unresolved local paths and import-map/bare aliases are errors. SQL/function calls and non-import runtime assets are not inferred.' },
    inventory_sha256: sha256(Buffer.from(inventory, 'utf8')),
    inventory_hash_format: 'UTF-8 concat of path + NUL + raw-file-sha256 + LF, sorted by path code units',
    file_count: files.length,
    files,
  };
}

function selfTest() {
  let count = 0;
  const check = fn => { fn(); count++; };
  const fixture = (source, more = {}) => {
    const data = new Map(Object.entries({ 'edge/index.ts': source, ...more }).map(([key, value]) => [key, Buffer.from(value)]));
    return collectClosure(['edge/index.ts'], { has: key => data.has(key), read: key => {
      if (!data.has(key)) throw new Error(`Missing fixture ${key}`);
      return { bytes: data.get(key) };
    } }, () => {});
  };
  check(() => assert.throws(() => parseArgs([]), /Required/));
  for (const value of ['HEAD', 'main', '7c3ad6ab', 'a'.repeat(39)]) check(() => assert.throws(() => parseArgs(['--commit', value]), /40-hex/));
  check(() => assert.equal(parseArgs(['--commit', 'A'.repeat(40)]).commit, 'a'.repeat(40)));
  check(() => assert.throws(() => parseArgs(['--commit', 'a'.repeat(40), '--include', '../escape.ts']), /canonical/));
  check(() => assert.throws(() => parseArgs(['--commit', 'a'.repeat(40), '--commit', 'b'.repeat(40)]), /exactly once/));
  check(() => assert.throws(() => gitReader('HEAD'), /explicit full commit/));
  check(() => {
    const result = fixture('import type { T } from "./a.ts"; export type { T } from "./a.ts"; type U = import("./a.ts").T; type V = typeof import("./a.ts"); const x = import(`./a.ts`); import "npm:fixture@1";', {
      'edge/a.ts': 'import "./index.ts"; export type T = string;',
    });
    assert.deepEqual(result.files, ['edge/a.ts', 'edge/index.ts']);
    for (const kind of ['import-type', 'export-type', 'import-type-expression', 'typeof-import', 'dynamic-import']) assert(result.imports.some(edge => edge.kind === kind));
    assert.equal(result.imports.filter(edge => edge.resolution === 'external').length, 1);
  });
  check(() => assert.throws(() => fixture('const p = import(name);'), /Computed/));
  check(() => assert.throws(() => fixture('const p = import(`./${name}.ts`);'), /Computed/));
  check(() => assert.throws(() => fixture('import "./absent.ts";'), /Unresolved pinned/));
  check(() => assert.throws(() => fixture('export * from "./absent.ts";'), /Unresolved pinned/));
  check(() => assert.throws(() => fixture('import "../../outside.ts";'), /canonical/));
  check(() => assert.throws(() => fixture('import "@/mutable-alias";'), /unsupported/));
  check(() => assert.throws(() => fixture('import "file:///mutable/file.ts";'), /unsupported/));
  check(() => assert.throws(() => fixture('const p = require(name);'), /Computed/));
  check(() => assert.throws(() => fixture('const p = module.require(name);'), /Computed/));
  check(() => assert.throws(() => fixture('import { from'), /parse failed/));
  check(() => {
    const result = fixture('import x = require("./a.ts"); const y = require("./data.json");', {
      'edge/a.ts': 'export const x = 1;', 'edge/data.json': '{"x":1}',
    });
    assert.equal(result.files.length, 3);
    assert(result.imports.some(edge => edge.kind === 'import-equals'));
  });
  check(() => assert.notEqual(sha256(Buffer.from('line\n')), sha256(Buffer.from('line\r\n'))));
  check(() => assert.throws(() => fixture('import "./asset.bin";', { 'edge/asset.bin': 'bytes' }), /Unsupported local dependency/));
  console.log(`SELF_TEST_PASS ${count} checks; in-memory fixtures only; no manifest generated`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) return selfTest();
  const manifest = build(options);
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  const target = path.join(REPO, 'docs', 'qa', 'manifests', `server-first-${options.commit.slice(0, 8)}.json`);
  if (fs.existsSync(target)) {
    if (!fs.readFileSync(target).equals(bytes)) throw new Error('Output exists with different bytes; refusing to overwrite an earlier package');
  } else fs.writeFileSync(target, bytes, { flag: 'wx' });
  console.log(JSON.stringify({ manifest: target, source_commit: options.commit, files: manifest.file_count,
    edge_entrypoints: manifest.edge_entrypoints.length, closure_files: manifest.edge_closure.local_files.length,
    external_specifiers: manifest.edge_closure.external_specifiers.length, manifest_sha256: sha256(bytes) }, null, 2));
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error(`MANIFEST_ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
module.exports = { parseArgs, importEdges, collectClosure, build };
