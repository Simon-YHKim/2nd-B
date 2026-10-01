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
// The source inventory follows relative imports. It matches referenced public
// objects from migrations and drafts, plus known computed RPC names. The live
// query checks the source signature, named arguments, service_role EXECUTE and
// added columns used by Edge writes, not merely a same-named object.
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

// The capacity helper assembles these two names at runtime. Reject any new
// interpolated RPC name until its finite expansion is reviewed here.
const DYNAMIC_RPCS = new Map([
  ["`${transition}_llm_proxy_capacity`", ["settle_llm_proxy_capacity", "release_llm_proxy_capacity"]],
]);

function argumentsAfterOpenParen(sql, start) {
  let depth = 1;
  let quote = "";
  const parts = [];
  let partStart = start;
  for (let index = start; index < sql.length; index += 1) {
    const char = sql[index];
    if (quote) {
      if (char === quote) {
        if (sql[index + 1] === quote) index += 1;
        else quote = "";
      }
      continue;
    }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if ((char === "," && depth === 1) || depth === 0) {
      parts.push(sql.slice(partStart, index).trim());
      partStart = index + 1;
    }
    if (depth === 0) return parts.filter(Boolean);
  }
  fail("unclosed-function-arguments");
}

function functionContract(sql, start) {
  const parameters = argumentsAfterOpenParen(sql, start);
  const types = [];
  const argNames = [];
  for (const parameter of parameters) {
    const withoutDefault = parameter.replace(/\s+(?:default\b|=)[\s\S]*$/i, "").trim();
    const mode = withoutDefault.match(/^(inout|out|in|variadic)\s+/i)?.[1]?.toLowerCase();
    if (mode === "out") continue;
    const declaration = withoutDefault.replace(/^(?:inout|out|in|variadic)\s+/i, "");
    const match = declaration.match(/^([a-z_][a-z0-9_]*)\s+([\s\S]+)$/i);
    if (!match || !IDENT.test(match[1])) fail(`unsupported-function-argument-${declaration.slice(0, 80)}`);
    const type = match[2].trim().replace(/\s+/g, " ").replace(/\(\s*\d+(?:\s*,\s*\d+)?\s*\)/g, "");
    if (!/^[a-z_][a-z0-9_.\[\] ]*$/i.test(type)) fail(`unsupported-function-type-${type.slice(0, 80)}`);
    argNames.push(match[1].toLowerCase());
    types.push(type.toLowerCase());
  }
  return { signature: types.join(","), argNames };
}

// Public functions and tables the migrations leave defined, in file order.
export function definedObjects() {
  const functions = new Set();
  const tables = new Set();
  const columns = new Set();
  const functionContracts = new Map();
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
  const alterTablePattern = /alter\s+table\s+(?:if\s+exists\s+)?public\.([a-z_][a-z0-9_]*)\s+([\s\S]*?);/gi;
  const columnActionPattern = /\b(add|drop)\s+column\s+(?:if\s+(?:not\s+)?exists\s+)?([a-z_][a-z0-9_]*)/gi;
  for (const { file, draft } of files) {
    const sql = readFileSync(file, "utf8").replace(/--[^\n]*/g, "");
    const events = [];
    for (const [regex, set, add] of patterns) {
      if (draft && !add) continue;
      for (const match of sql.matchAll(regex)) {
        if (match[2] && match[2].toLowerCase() !== "public") continue; // other schemas
        const contract = set === functions && add ? functionContract(sql, match.index + match[0].length) : null;
        events.push({ at: match.index, set, add, name: match[3].toLowerCase(), contract });
      }
    }
    for (const match of sql.matchAll(alterTablePattern)) {
      for (const action of match[2].matchAll(columnActionPattern)) {
        const add = action[1].toLowerCase() === "add";
        if (!draft || add) {
          events.push({ at: match.index + action.index, set: columns, add, name: `${match[1].toLowerCase()}.${action[2].toLowerCase()}` });
        }
      }
    }
    for (const event of events.sort((a, b) => a.at - b.at)) {
      if (event.add) event.set.add(event.name);
      else event.set.delete(event.name);
      if (event.set === functions) {
        if (!event.add) functionContracts.delete(event.name);
        else {
          const contracts = functionContracts.get(event.name) ?? new Map();
          contracts.set(event.contract.signature, { name: event.name, ...event.contract });
          functionContracts.set(event.name, contracts);
        }
      }
    }
  }
  return { functions, tables, columns, functionContracts };
}

export function dependencies(slug) {
  if (!SLUG.test(slug)) fail("invalid-function-slug");
  const mentioned = new Set();
  const sources = sourceFiles(slug).map((file) => readFileSync(file, "utf8"));
  for (const source of sources) {
    for (const name of quotedIdentifiers(source)) mentioned.add(name);
    for (const match of source.matchAll(/\b(?:rpc|executeRpc)\s*\(\s*(`[^`]*\$\{[^`]*`)/g)) {
      const names = DYNAMIC_RPCS.get(match[1]);
      if (!names) fail(`unreviewed-dynamic-rpc-${slug}`);
      for (const name of names) mentioned.add(name);
    }
  }
  const defined = definedObjects();
  const functions = [...mentioned].filter((name) => defined.functions.has(name)).sort();
  const functionContracts = functions.flatMap((name) => {
    const contracts = defined.functionContracts.get(name);
    if (!contracts?.size) fail(`function-contract-missing-${name}`);
    return [...contracts.values()];
  });
  const columns = [...defined.columns].filter((qualified) => {
    const [table, column] = qualified.split(".");
    const tableUse = new RegExp(`\\.from\\s*\\(\\s*['"]${table}['"]\\s*\\)`);
    const columnUse = new RegExp(`\\b${column}\\s*:`);
    return sources.some((source) => tableUse.test(source) && columnUse.test(source));
  }).sort();
  return {
    functions,
    tables: [...mentioned].filter((n) => defined.tables.has(n)).sort(),
    columns,
    functionContracts,
  };
}

export function requestBody(deps) {
  const rows = [
    ...deps.functionContracts.map(({ name, signature, argNames }) => ({ kind: "function", name, signature, arg_names: argNames })),
    ...deps.tables.map((name) => ({ kind: "table", name })),
    ...deps.columns.map((name) => ({ kind: "column", name })),
  ];
  for (const row of rows) {
    const identifiers = row.kind === "column" ? row.name.split(".") : [row.name];
    if (!identifiers.every((identifier) => IDENT.test(identifier))) fail(`invalid-identifier-${row.name}`);
  }
  const json = JSON.stringify(rows);
  const query = [
    "select req.kind, case when req.kind = 'function'",
    "  then req.name || '(' || req.signature || ')' else req.name end as name,",
    "  case req.kind",
    "    when 'function' then exists (",
    "      select 1 from pg_catalog.pg_proc p",
    "      join pg_catalog.pg_namespace n on n.oid = p.pronamespace",
    "      where n.nspname = 'public' and p.proname = req.name",
    "        and p.oid = pg_catalog.to_regprocedure('public.' || pg_catalog.quote_ident(req.name) || '(' || req.signature || ')')",
    "        and coalesce(pg_catalog.to_jsonb(p.proargnames[1:p.pronargs]), '[]'::jsonb) = req.arg_names",
    "        and pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE'))",
    "    when 'table' then exists (",
    "      select 1 from pg_catalog.pg_class c",
    "      join pg_catalog.pg_namespace n on n.oid = c.relnamespace",
    "      where n.nspname = 'public' and c.relname = req.name and c.relkind in ('r', 'p'))",
    "    when 'column' then exists (",
    "      select 1 from pg_catalog.pg_attribute a",
    "      join pg_catalog.pg_class c on c.oid = a.attrelid",
    "      join pg_catalog.pg_namespace n on n.oid = c.relnamespace",
    "      where n.nspname = 'public' and c.relname = pg_catalog.split_part(req.name, '.', 1)",
    "        and a.attname = pg_catalog.split_part(req.name, '.', 2) and a.attnum > 0 and not a.attisdropped)",
    "  end as present",
    `from pg_catalog.jsonb_to_recordset($deps$${json}$deps$::jsonb) as req(kind text, name text, signature text, arg_names jsonb)`,
    "order by req.kind, req.name",
  ].join("\n");
  return { query };
}

export function verify(deps, response) {
  if (!Array.isArray(response)) return { ok: false, reason: "response-not-array" };
  const expected = [
    ...deps.functionContracts.map(({ name, signature }) => `function:${name}(${signature})`),
    ...deps.tables.map((name) => `table:${name}`),
    ...deps.columns.map((name) => `column:${name}`),
  ];
  const present = new Set();
  const seen = new Set();
  for (const row of response) {
    if (!row || typeof row.kind !== "string" || typeof row.name !== "string") {
      return { ok: false, reason: "response-row-shape" };
    }
    const key = `${row.kind}:${row.name}`;
    if (seen.has(key)) return { ok: false, reason: "response-duplicate-dependency" };
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
    process.stdout.write(`${slug}: ${deps.functionContracts.length} function(s), ${deps.tables.length} table(s), and ${deps.columns.length} column(s) present\n`);
  } else {
    fail(`unknown-mode-${mode}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
