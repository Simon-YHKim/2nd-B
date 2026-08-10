// check:i18n-untranslated -- catches a locale value that is still the English
// source string.
//
// WHY. check:i18n-keys compares KEY parity and flags empty values, so a locale
// can carry every key and still ship English text. That is exactly what happened
// in PR #1207: ten new keys were written into es/id/pt with the English source
// on the assumption that those locales are maintained as EN copies. They are
// not -- auth.json is genuinely translated in all three, and the gap only
// surfaced when a human read the file (#1214).
//
// WHAT IS EXEMPT, and why the exemptions are not a loophole:
//
//   1. safety.json and consent.json. These ARE deliberate EN copies for every
//      non-reviewed locale, and check:safety-consent-locale asserts that. Both
//      files are skipped here so the two gates cannot contradict each other.
//
//   2. Values that are only interpolation, digits, punctuation or currency
//      ("{{n}}x", "7-12", "$9.99 / mo", "https://"). There is nothing to
//      translate, and they change often enough that listing them would rot.
//
//   3. scripts/i18n-identical-allowlist.json. Reviewed 2026-08-11: every entry
//      is a proper noun (2nd-Brain, SecondB, Wiki, Google Calendar, Big Five,
//      IPIP-NEO-120, Voyager, North Star, Pomodoro ...) or a word that is
//      genuinely spelled the same in the target language (es/pt "Manual",
//      "Error", "Mentor"; id "Data", "Museum", "Format", "Status"). Translating
//      those would be a regression, not a fix.
//
// Adding a key to the allowlist is a deliberate act: if a NEW string lands in a
// locale still holding the English source, this fails and the fix is to
// translate it, not to append to the list.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const LOCALES = join(ROOT, "locales");
const CANONICAL = "en";
const SKIP_FILES = new Set(["safety.json", "consent.json"]);
const MIN_LENGTH = 4;

const allowlist = new Set<string>(
  JSON.parse(readFileSync(join(ROOT, "scripts", "i18n-identical-allowlist.json"), "utf8")) as string[],
);

// Only interpolation / digits / symbols / currency / units: nothing to translate.
const TOKEN_ONLY = /^[\s\d\p{P}\p{S}]*(\{\{[^}]+\}\}[\s\d\p{P}\p{S}]*)*$/u;

function flatten(value: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (value === null || typeof value !== "object") return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else if (typeof v === "string") out[key] = v;
  }
  return out;
}

const locales = readdirSync(LOCALES).filter((d) => d !== CANONICAL);
const namespaces = readdirSync(join(LOCALES, CANONICAL)).filter(
  (f) => f.endsWith(".json") && !SKIP_FILES.has(f),
);

const failures: string[] = [];
let compared = 0;

for (const file of namespaces) {
  const en = flatten(JSON.parse(readFileSync(join(LOCALES, CANONICAL, file), "utf8")));
  const ns = file.replace(/\.json$/, "");
  for (const locale of locales) {
    let other: Record<string, string>;
    try {
      other = flatten(JSON.parse(readFileSync(join(LOCALES, locale, file), "utf8")));
    } catch {
      continue; // key parity is check:i18n-keys' job, not this gate's
    }
    for (const [key, value] of Object.entries(en)) {
      if (value.length < MIN_LENGTH) continue;
      if (TOKEN_ONLY.test(value)) continue;
      if (allowlist.has(`${ns}:${key}`)) continue;
      compared++;
      if (other[key] === value) failures.push(`[${ns}] ${locale} still holds the en source: ${key} = ${JSON.stringify(value)}`);
    }
  }
}

if (failures.length > 0) {
  console.error("i18n untranslated FAILED  a locale value is still the English source:");
  for (const f of failures) console.error("  - " + f);
  console.error(
    "\nTranslate the string. Only append to scripts/i18n-identical-allowlist.json when the " +
      "value is a proper noun or is genuinely identical in that language.",
  );
  process.exit(1);
}

console.log(
  `i18n untranslated PASS  ${compared} translatable values across ${locales.length} locales ` +
    `(${allowlist.size} reviewed identical-by-design, safety/consent skipped)`,
);
