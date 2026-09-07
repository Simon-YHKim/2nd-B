// DESIGN.md: no em dashes (U+2014) in user-facing strings.
//
// This used to guard the locale bundles only. That is where most copy lives, but
// not all of it: a literal written straight into a component or a copy module in
// src/ was unguarded, and the 2026-09-07 sweep found eight of them - including
// the crisis hotline lines, which are the most-read safety strings in the app.
//
// So src/ is scanned too, and the scan is fail-closed: every source file counts
// as user copy unless it appears in EXCLUDED below with a reason. A new file is
// covered the day it is written, which is the opposite of an allowlist that rots.
//
// Only string literals, template literals and JSX text are inspected. Comments
// are not AST nodes, so they cannot produce a hit - this repo has produced four
// separate false-positive findings from grepping comment text.
//
// Fix by using a regular hyphen with spaces, or by restructuring the sentence.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const LOCALES = join(ROOT, "locales");
const SRC = join(ROOT, "src");
const EM_DASH = "—";

/**
 * Source files whose strings are not read by a user, with the reason each is
 * out of scope. Anything absent from this list is treated as user copy.
 */
const EXCLUDED: Readonly<Record<string, string>> = {
  "src/lib/interview/probe.ts": "LLM prompt text and layer descriptions sent to the model, never rendered",
  "src/lib/wiki/context-pack.ts": "prompt context headings and rules sent to the model",
  "src/lib/knowledge/loader.ts": "prompt scaffolding for the knowledge fallback",
  "src/lib/knowledge/retrieve.ts": "prompt scaffolding for retrieval",
  "src/lib/ops/recommend.ts": "routine-suggestion prompt text",
  "src/lib/records/create.ts": "record-classification prompt text",
  "src/lib/persona/seven-proposal-context.ts": "proposal prompt scaffolding",
  "src/lib/persona/build.ts": "persona export document headings, generated for the model and the export file, not a screen",
  "src/lib/dev/screen-index.ts": "developer notes in the dev screen registry, shown only behind the dev tier",
  "src/lib/safety/ingest-policy.ts": "internal policy reason strings recorded in decisions, not shown",
  "src/lib/safety/crisis-eval-corpus.ts": "evaluation corpus annotations",
  "src/lib/news/parse.ts": "HTML entity decoding table",
  "src/lib/build-info.ts": "build channel constant",
  "src/lib/supabase/auth.ts": "Error message for a programming fault, not surfaced as copy",
};

function jsonFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) jsonFiles(full, out);
    else if (entry.endsWith(".json")) out.push(full);
  }
  return out;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== "__tests__") sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function walk(value: unknown, path: string, file: string, hits: string[]): void {
  if (typeof value === "string") {
    if (value.includes(EM_DASH)) hits.push(`${relative(ROOT, file)} :: ${path}`);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      walk(v, path ? `${path}.${k}` : k, file, hits);
    }
  }
}

/** Em dashes inside rendered string nodes. Comments are structurally excluded. */
function sourceHits(file: string): string[] {
  const source = readFileSync(file, "utf8");
  if (!source.includes(EM_DASH)) return [];
  const ast = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const hits: string[] = [];
  const at = (node: ts.Node) => ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
  const record = (node: ts.Node, text: string) => {
    if (text.includes(EM_DASH)) hits.push(`${relative(ROOT, file).replace(/\\/g, "/")}:${at(node)}`);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) record(node, node.text);
    else if (ts.isTemplateExpression(node)) {
      record(node, node.head.text);
      for (const span of node.templateSpans) record(node, span.literal.text);
    } else if (ts.isJsxText(node) && node.text.trim()) record(node, node.text);
    node.forEachChild(visit);
  };
  visit(ast);
  return hits;
}

const hits: string[] = [];
for (const file of jsonFiles(LOCALES)) {
  walk(JSON.parse(readFileSync(file, "utf8")), "", file, hits);
}

let scanned = 0;
for (const file of sourceFiles(SRC)) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  if (Object.hasOwn(EXCLUDED, rel)) continue;
  scanned += 1;
  hits.push(...sourceHits(file));
}

// An exclusion that no longer names a real file is a stale exemption, and a
// stale exemption is how a guard quietly stops guarding.
const stale = Object.keys(EXCLUDED).filter((rel) => {
  try {
    return !statSync(join(ROOT, rel)).isFile();
  } catch {
    return true;
  }
});

if (hits.length > 0 || stale.length > 0) {
  if (hits.length > 0) {
    console.error(
      "Em dash (U+2014) found in user-facing strings - DESIGN.md forbids em dashes in UI strings. Use a hyphen + space:",
    );
    for (const h of hits) console.error("  - " + h);
  }
  if (stale.length > 0) {
    console.error("Stale entries in the em dash exclusion list (file no longer exists):");
    for (const s of stale) console.error("  - " + s);
  }
  process.exit(1);
}
console.log(
  `DESIGN PASS  no em dashes (U+2014) in locale strings or in ${scanned} scanned source files (${Object.keys(EXCLUDED).length} declared non-copy modules skipped)`,
);
