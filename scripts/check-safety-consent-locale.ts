// check:safety-consent-locale -- enforces the EN-only human-review gate for the
// two legally/safety material namespaces (F2).
//
// Policy (index.ts / locales.ts / lexicon.ts comments, 2026-06-11): crisis (safety)
// and cross-border-consent (consent) copy is NEVER machine-translated -- a beta pack
// ships those two namespaces as EN copies until a HUMAN reviews a translation. But
// the es/pt/id packs had shipped localized safety.json + consent.json anyway (a
// Spanish-UI crisis user saw unreviewed MT crisis routing; the overseas-transfer
// PIPA ack was MT). check:i18n-keys only checks KEY parity, not VALUES, so it never
// caught this. This gate asserts VALUE equality to EN for every non-reviewed locale.
//
// A locale earns its own safety/consent copy only by being added to
// HUMAN_REVIEWED_LOCALES here -- a conscious, reviewable edit, never a silent drift.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const LOCALES = join(ROOT, "locales");
const GATED_NS = ["safety", "consent"] as const;
// en = canonical; ko = human-reviewed (the app's two first-class locales).
const HUMAN_REVIEWED_LOCALES = new Set(["en", "ko"]);

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== "object") return false;
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => Object.prototype.hasOwnProperty.call(bo, k) && deepEqual(ao[k], bo[k]));
}

const errors: string[] = [];
for (const ns of GATED_NS) {
  const enPath = join(LOCALES, "en", `${ns}.json`);
  const en = JSON.parse(readFileSync(enPath, "utf8"));
  for (const loc of readdirSync(LOCALES)) {
    if (HUMAN_REVIEWED_LOCALES.has(loc)) continue;
    const p = join(LOCALES, loc, `${ns}.json`);
    if (!statSync(join(LOCALES, loc)).isDirectory() || !existsSync(p)) continue;
    const val = JSON.parse(readFileSync(p, "utf8"));
    if (!deepEqual(en, val)) {
      errors.push(
        `locales/${loc}/${ns}.json is not identical to locales/en/${ns}.json. ` +
          `${ns} copy is never machine-translated; ship it as the EN copy until a human ` +
          `review lands, then add "${loc}" to HUMAN_REVIEWED_LOCALES in this script.`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error("SAFETY/CONSENT LOCALE FAIL  unreviewed crisis/consent translation shipped (F2):");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(
  "SAFETY/CONSENT LOCALE PASS  safety.json + consent.json are EN copies for every non-reviewed locale",
);
