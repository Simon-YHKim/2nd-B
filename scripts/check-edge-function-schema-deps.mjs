#!/usr/bin/env node
// Edge deploy gate: the database objects a function names must already exist
// in production before the function ships.
//
// Why this exists. On 2026-09-26 production was missing 17 numbered migrations
// that main had carried since 2026-09-08 (0171-0187 minus 0172/0177, plus 0189
// and 0190). The deployed functions were built on 2026-09-07/08 and called none
// of them, so production worked. But main's Edge code had started calling them
// on 2026-09-13 (reserve_llm_proxy_capacity, consume_llm_proxy_purpose_quota,
// consume_oauth_naver_rate_limit, ...), and those calls fail closed. One
// workflow_dispatch of main would have taken the LLM proxies and Naver sign-in
// down. Migrations go first, the function second; this gate makes that order
// something the deploy checks rather than something a person remembers.
//
// What counts as a dependency. A quoted identifier in the function's source
// (index.ts plus every file it reaches through relative imports) that
// names a public function or table created by db/migrations or
// db/migration-drafts. Call syntax is not parsed on purpose: the proxies reach
// RPCs through wrappers (executeRpc('name'), client.rpc(name, args)) that a
// call-shape match would miss. A name dropped by a later migration no longer
// counts as defined.
//
// Modes:
//   list   <slug>                  JSON { functions: [...], tables: [...] }
//   query  <slug>                  Management API request body (read-only SQL)
//   verify <slug> <response.json>  exit 1 unless every dependency is present
//
// EDGE_SCHEMA_DEPS_ROOT overrides the repository root (tests only).

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ERROR = "::error title=Edge deploy schema gate::";
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;

const root = process.env.EDGE_SCHEMA_DEPS_ROOT
  ? path.resolve(process.env.EDGE_SCHEMA_DEPS_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const functionsDir = path.join(root, "supabase", "functions");

function fail(message) {
  process.stderr.write(`${ERROR}${message}\n`);
  process.exit(1);
}

// Source files reachable from the function entry through relative imports.
export function sourceFiles(slug) {
  const entry = path.join(functionsDir, slug, "index.ts");
  if (!existsSync(entry)) fail(`function-entry-missing-${slug}`);
  const seen = new Set();
  const queue = [entry];
  const specifier = /(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(specifier)) {
      // Functions may import shared repository code (the proxies read
      // src/lib/safety/lexicon.ts); the deploy bundles it, so follow it. Only
      // a path that leaves the repository is refused.
      const target = path.resolve(path.dirname(file), match[1]);
      const inside = path.relative(root, target);
      if (inside.startsWith("..") || path.isAbsolute(inside)) fail(`import-escapes-repository-${match[1]}`);
      if (existsSync(target) && statSync(target).isFile()) queue.push(target);
    }
  }
  return [...seen].sort();
}

function quotedIdentifiers(text) {
  const names = new Set();
  for (const match of text.matchAll(/(['"`])([a-z_][a-z0-9_]{0,62})\1/g)) names.add(match[2]);
  return names;
}

// Public functions and tables the migrations leave defined, in file order.
export function definedObjects() {
  const functions = new Set();
  const tables = new Set();
  // Drafts only add names: a draft's DROP has not happened anywhere yet, and
  // letting it delete a live name would silently exempt that name from the gate.
  const files = [];
  for (const [dir, draft] of [["db/migrations", false], ["db/migration-drafts", true]]) {
    const full = path.join(root, dir);
    if (!existsSync(full)) continue;
    for (const name of readdirSync(full).filter((n) => n.endsWith(".sql")).sort()) {
      files.push({ file: path.join(full, name), draft });
    }
  }
  const obj = String.raw`(?:(public)\.|(\w+)\.)?"?([a-z_][a-z0-9_]*)"?`;
  const patterns = [
    [new RegExp(String.raw`create\s+(?:or\s+replace\s+)?function\s+${obj}\s*\(`, "gi"), functions, true],
    [new RegExp(String.raw`drop\s+function\s+(?:if\s+exists\s+)?${obj}`, "gi"), functions, false],
    [new RegExp(String.raw`create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?${obj}`, "gi"), tables, true],
    [new RegExp(String.raw`drop\s+table\s+(?:if\s+exists\s+)?${obj}`, "gi"), tables, false],
  ];
  for (const { file, draft } of files) {
    const sql = readFileSync(file, "utf8").replace(/--[^\n]*/g, "");
    const events = [];
    for (const [regex, set, add] of patterns) {
      if (draft && !add) continue;
      for (const match of sql.matchAll(regex)) {
        if (match[2] && match[2].toLowerCase() !== "public") continue; // other schemas
        events.push({ at: match.index, set, add, name: match[3].toLowerCase() });
      }
    }
    for (const event of events.sort((a, b) => a.at - b.at)) {
      if (event.add) event.set.add(event.name);
      else event.set.delete(event.name);
    }
  }
  return { functions, tables };
}

export function dependencies(slug) {
  if (!SLUG.test(slug)) fail("invalid-function-slug");
  const mentioned = new Set();
  for (const file of sourceFiles(slug)) {
    for (const name of quotedIdentifiers(readFileSync(file, "utf8"))) mentioned.add(name);
  }
  const defined = definedObjects();
  return {
    functions: [...mentioned].filter((n) => defined.functions.has(n)).sort(),
    tables: [...mentioned].filter((n) => defined.tables.has(n)).sort(),
  };
}

export function requestBody(deps) {
  const rows = [
    ...deps.functions.map((name) => ({ kind: "function", name })),
    ...deps.tables.map((name) => ({ kind: "table", name })),
  ];
  for (const row of rows) if (!IDENT.test(row.name)) fail(`invalid-identifier-${row.name}`);
  const json = JSON.stringify(rows);
  const query = [
    "select req.kind, req.name,",
    "  case req.kind",
    "    when 'function' then exists (",
    "      select 1 from pg_catalog.pg_proc p",
    "      join pg_catalog.pg_namespace n on n.oid = p.pronamespace",
    "      where n.nspname = 'public' and p.proname = req.name)",
    "    when 'table' then pg_catalog.to_regclass('public.' || pg_catalog.quote_ident(req.name)) is not null",
    "  end as present",
    `from pg_catalog.jsonb_to_recordset($deps$${json}$deps$::jsonb) as req(kind text, name text)`,
    "order by req.kind, req.name",
  ].join("\n");
  return { query };
}

export function verify(deps, response) {
  if (!Array.isArray(response)) return { ok: false, reason: "response-not-array" };
  const expected = [
    ...deps.functions.map((name) => `function:${name}`),
    ...deps.tables.map((name) => `table:${name}`),
  ];
  const present = new Set();
  const seen = new Set();
  for (const row of response) {
    if (!row || typeof row.kind !== "string" || typeof row.name !== "string") {
      return { ok: false, reason: "response-row-shape" };
    }
    const key = `${row.kind}:${row.name}`;
    seen.add(key);
    if (row.present === true) present.add(key);
  }
  if (seen.size !== expected.length || expected.some((key) => !seen.has(key))) {
    return { ok: false, reason: "response-does-not-cover-every-dependency" };
  }
  const missing = expected.filter((key) => !present.has(key));
  return missing.length === 0 ? { ok: true, missing } : { ok: false, reason: "missing-in-production", missing };
}

function main() {
  const [mode, slug, responsePath] = process.argv.slice(2);
  if (!slug) fail("usage: list|query|verify <slug> [response.json]");
  const deps = dependencies(slug);
  if (mode === "list") {
    process.stdout.write(`${JSON.stringify(deps)}\n`);
  } else if (mode === "query") {
    process.stdout.write(`${JSON.stringify(requestBody(deps))}\n`);
  } else if (mode === "verify") {
    if (!responsePath) fail("response-path-required");
    let response;
    try {
      response = JSON.parse(readFileSync(responsePath, "utf8"));
    } catch {
      fail("response-json-required");
    }
    const result = verify(deps, response);
    if (!result.ok) {
      const detail = result.missing?.length ? `: ${result.missing.join(", ")}` : "";
      fail(`${result.reason}${detail}. Apply the migrations that create these first, then deploy.`);
    }
    process.stdout.write(`${slug}: ${deps.functions.length} function(s) and ${deps.tables.length} table(s) present\n`);
  } else {
    fail(`unknown-mode-${mode}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
