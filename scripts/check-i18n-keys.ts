// C7: enforce key parity across every shipped locale. EN is the canonical
// source; every other locales/<code>/ folder must mirror its namespace files
// and keys exactly (O-R2 language-pack infra: a pack ships complete or not
// at all - a partial folder would silently fall back per-key and rot).
// Fails CI when:
//   - a locale folder is missing a namespace file EN has (or has extras)
//   - a key exists in EN but is missing from a locale (or vice versa)
//   - any value is an empty string

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const ROOT = process.cwd();
const LOCALES = join(ROOT, "locales");
const CANONICAL = "en";

type FlatMap = Record<string, string>;

function flatten(obj: unknown, prefix = "", out: FlatMap = {}): FlatMap {
  if (obj === null || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
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

const localeDirs = readdirSync(LOCALES).filter((entry) =>
  statSync(join(LOCALES, entry)).isDirectory(),
);
if (!localeDirs.includes(CANONICAL)) {
  console.error(`C7 i18n key check FAILED: canonical locales/${CANONICAL}/ is missing`);
  process.exit(1);
}
const otherLocales = localeDirs.filter((d) => d !== CANONICAL).sort();

const enBundles = load(join(LOCALES, CANONICAL));
const failures: string[] = [];

for (const en of enBundles) {
  for (const [key, value] of Object.entries(en.flat)) {
    if (value === "") failures.push(`[${en.ns}] empty value in ${CANONICAL}: ${key}`);
  }
}

for (const localeCode of otherLocales) {
  const bundles = load(join(LOCALES, localeCode));
  const ns = new Set(bundles.map((b) => b.ns));
  const enNs = new Set(enBundles.map((b) => b.ns));
  for (const n of enNs) if (!ns.has(n)) failures.push(`Missing namespace in ${localeCode}/: ${n}`);
  for (const n of ns) if (!enNs.has(n)) failures.push(`Extra namespace in ${localeCode}/ (not in ${CANONICAL}): ${n}`);

  for (const en of enBundles) {
    const other = bundles.find((b) => b.ns === en.ns);
    if (!other) continue;
    for (const key of Object.keys(en.flat)) {
      if (!(key in other.flat)) failures.push(`[${en.ns}] missing in ${localeCode}: ${key}`);
    }
    for (const key of Object.keys(other.flat)) {
      if (!(key in en.flat)) failures.push(`[${en.ns}] missing in ${CANONICAL} (extra in ${localeCode}): ${key}`);
      if (other.flat[key] === "") failures.push(`[${en.ns}] empty value in ${localeCode}: ${key}`);
    }
  }
}

if (failures.length > 0) {
  console.error("C7 i18n key check FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

const totalKeys = enBundles.reduce((sum, b) => sum + Object.keys(b.flat).length, 0);
console.log(
  `C7 PASS  i18n keys aligned across ${[CANONICAL, ...otherLocales].join("+")} (${totalKeys} keys, ${enBundles.length} namespaces, ${localeDirs.length} locales)`,
);
