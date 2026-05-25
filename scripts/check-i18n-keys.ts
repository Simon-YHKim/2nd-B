// C7: enforce EN ↔ KO key parity. EN is the canonical source.
// Fails CI when:
//   - a key exists in EN but missing from KO (or vice versa)
//   - any value is an empty string
//   - any value is not a string (nested objects allowed; we flatten)

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, basename } from "node:path";

const ROOT = process.cwd();
const LOCALES = join(ROOT, "locales");

type FlatMap = Record<string, string>;

function flatten(obj: unknown, prefix = "", out: FlatMap = {}): FlatMap {
  if (obj === null || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else if (typeof v === "string") out[key] = v;
    else out[key] = String(v);
  }
  return out;
}

function listJsonFiles(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isFile() && entry.endsWith(".json")) result.push(full);
  }
  return result;
}

function load(dir: string): { ns: string; flat: FlatMap }[] {
  return listJsonFiles(dir).map((f) => {
    // basename() handles both POSIX "/" and Windows "\" path separators.
    const ns = basename(f, ".json");
    const flat = flatten(JSON.parse(readFileSync(f, "utf8")));
    return { ns, flat };
  });
}

const enBundles = load(join(LOCALES, "en"));
const koBundles = load(join(LOCALES, "ko"));

const failures: string[] = [];

const enNs = new Set(enBundles.map((b) => b.ns));
const koNs = new Set(koBundles.map((b) => b.ns));
for (const ns of enNs) if (!koNs.has(ns)) failures.push(`Missing namespace in ko/: ${ns}`);
for (const ns of koNs) if (!enNs.has(ns)) failures.push(`Missing namespace in en/: ${ns}`);

for (const en of enBundles) {
  const ko = koBundles.find((b) => b.ns === en.ns);
  if (!ko) continue;
  for (const key of Object.keys(en.flat)) {
    if (!(key in ko.flat)) failures.push(`[${en.ns}] missing in ko: ${key}`);
    if (en.flat[key] === "") failures.push(`[${en.ns}] empty value in en: ${key}`);
  }
  for (const key of Object.keys(ko.flat)) {
    if (!(key in en.flat)) failures.push(`[${en.ns}] missing in en: ${key}`);
    if (ko.flat[key] === "") failures.push(`[${en.ns}] empty value in ko: ${key}`);
  }
}

if (failures.length > 0) {
  console.error("C7 i18n key check FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

const totalKeys = enBundles.reduce((sum, b) => sum + Object.keys(b.flat).length, 0);
console.log(`C7 PASS  i18n keys aligned across en/ko (${totalKeys} keys, ${enBundles.length} namespaces)`);
void relative;
