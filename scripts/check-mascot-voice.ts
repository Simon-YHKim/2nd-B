// Copy-law CI gate for the USER-ADDRESSED mascot voice (D-21 + its persona-sim gate).
//
// DECISIONS D-21 (Simon GO): re-register every user-addressed mascot string from
// warm / first-person / presence to OBSERVATIONAL + SOURCED + user-owned. The voice
// stays humane and second-person - not a cold clerk, not a cold oracle. This is
// child-welfare copy: the persona-sim gate (PROTOCOL §26 4-axis cross) walked the
// first-run + core loop and signed off on the re-voiced strings. This script makes
// that decision durable: it FAILS CI if a user-addressed mascot string regresses
// toward companion/presence framing (Wall 1) or makes an unsourced claim about the
// user (Wall 2).
//
// Scope (the user-addressed surface ONLY):
//   - locales/<lang>/secondb.json :: heroSpeech.* , personaHero.speech ,
//     personas.*.greeting , personas.gadi.systemHint   (across en, ko, es, id, pt)
//   - src/lib/chat/personas.ts :: the gadi persona `role` (inline literals)
//
// Two walls with different scope:
//   - Wall 1 (anti-presence/companion) scans EVERY user-addressed string above,
//     because presence/companion framing is never wanted in any of them. It is
//     negation-aware: a prohibitive instruction that NAMES the forbidden behavior
//     in order to forbid it (e.g. gadi.systemHint "do not ... friend or companion"
//     / "친구·동반자처럼 굴지 마세요") is the safety-correct copy, not a regression.
//   - Wall 2 (anti-oracle + require sourcing) is scoped TIGHTLY to the four keys
//     D-21 re-registered to be observational + sourced + user-owned:
//       heroSpeech.default , personaHero.speech ,
//       personas.secondb.greeting , personas.gadi.greeting
//     These are the strings that make a claim ABOUT the user. The other personas'
//     greetings and the heroSpeech status lines (sending/divergent) are NOT part
//     of the D-21 re-voice and stay out of Wall 2 (they are pre-existing approved
//     copy; failing them here would be scope creep).
//
// Out of scope (deliberately NOT scanned):
//   - src/lib/graph/monologues.ts and the secondb.json `monologues` namespace:
//     first-person SELF-TALK with NO addressee, so no parasocial vector (exempt).
//   - The 5 hard safety rails and the crisis hand-off voice.
//   - src/lib/characters.ts graph-character roles (about-page display, not chat
//     copy addressed to the user) - that surface keeps its own register and is
//     governed by the WorldviewConceptCoherence check.
//   - secondb.json `heroSpeech.sending` / `heroSpeech.divergent`: these are
//     first-person STATUS monologues with no addressee/claim; scanned by Wall 1
//     (presence) but exempt from Wall 2 (they make no claim about the user).
//
// Complements (does not duplicate) check-anti-anthro.ts (D-19, companion-attachment
// + over-claiming across ALL locale strings). This gate is tighter and adds the
// REQUIRE-sourcing half (Wall 2) that D-19 does not enforce.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const LOCALES = ["en", "ko", "es", "id", "pt"] as const;

// Wall 1 - anti-presence / companion. A user-addressed mascot string must not
// adopt presence ("I'm here" / 여기 있어요), shared-gaze co-presence (같이/함께
// 들여다, "together, gently"), warm-guide self-labeling, or friend/companion
// framing. Applies to EVERY scanned string (greetings, hero, role, systemHint).
const WALL1_PRESENCE =
  /\bI'm here\b|here for you|여기 있어요|같이 들여다|함께 들여다|따뜻한 길잡이|warm (relationship )?guide|동반자|친구처럼|together, gently/i;

// A presence/companion match inside a PROHIBITION (do not / 마세요 / 말고 / 않 /
// never) is the safety-correct copy, not a regression - the systemHint must name
// the forbidden behavior to forbid it. Treat such matches as exempt.
const NEGATION_NEAR = /\b(?:do not|don['’]?t|never|no)\b|마세요|말고|않|굴지\s?마/i;

// Wall 2 - anti-oracle + REQUIRE sourcing. A greeting/hero string that makes a
// claim ABOUT the user (a statement, not a bare question) must co-present a
// record-sourcing token, so the mascot speaks from the user's own records rather
// than as an oracle. A string that is purely a question (no declarative claim)
// passes - there is nothing to source.
const SOURCING_TOKEN = /records|기록|patterns|모습|패턴/i;

// The exact key set D-21 re-registered to observational+sourced. Wall 2 applies
// ONLY to these (keyed by the `where` suffix), to avoid scope creep onto
// pre-existing approved copy.
const WALL2_KEYS = new Set([
  "heroSpeech.default",
  "personaHero.speech",
  "personas.secondb.greeting",
  "personas.gadi.greeting",
]);

/** A "claim" = the string contains at least one declarative sentence (not purely interrogative). */
function makesClaim(text: string): boolean {
  // Split into sentence-ish fragments on . ! ? 。 plus Korean enders. A fragment
  // that has word content and does NOT end in a question mark is a declarative claim.
  const fragments = text.split(/(?<=[.!?。?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const units = fragments.length > 0 ? fragments : [text.trim()];
  return units.some((u) => /[A-Za-z가-힣]/.test(u) && !/[?？]$/.test(u));
}

interface Target {
  where: string; // human-readable location for the error
  key: string; // the dotted key suffix (e.g. "personas.gadi.greeting"), "" for the inline role
  text: string;
}

function get(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((v, k) => {
    if (!v || typeof v !== "object") return undefined;
    return (v as Record<string, unknown>)[k];
  }, obj);
}

const targets: Target[] = [];

// 1) Locale JSON: the user-addressed keys across all 5 shipped locales.
for (const lang of LOCALES) {
  const rel = `locales/${lang}/secondb.json`;
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
  } catch (e) {
    console.error(`Mascot-voice check: cannot parse ${rel}: ${(e as Error).message}`);
    process.exit(1);
  }
  // heroSpeech.* (all hero strings - Wall 1 presence-scanned; Wall 2 only for .default)
  const hero = get(json, "heroSpeech");
  if (hero && typeof hero === "object") {
    for (const [k, v] of Object.entries(hero as Record<string, unknown>)) {
      if (typeof v === "string")
        targets.push({ where: `${rel} :: heroSpeech.${k}`, key: `heroSpeech.${k}`, text: v });
    }
  }
  // personaHero.speech
  const personaHero = get(json, "personaHero.speech");
  if (typeof personaHero === "string")
    targets.push({ where: `${rel} :: personaHero.speech`, key: "personaHero.speech", text: personaHero });
  // personas.*.greeting (every persona's user-facing greeting - Wall 1 all; Wall 2 only secondb+gadi)
  const personas = get(json, "personas");
  if (personas && typeof personas === "object") {
    for (const [pid, p] of Object.entries(personas as Record<string, unknown>)) {
      const greeting = get(p, "greeting");
      if (typeof greeting === "string")
        targets.push({ where: `${rel} :: personas.${pid}.greeting`, key: `personas.${pid}.greeting`, text: greeting });
    }
  }
  // personas.gadi.systemHint (the re-voiced persona instruction - Wall 1 only, negation-aware)
  const gadiHint = get(json, "personas.gadi.systemHint");
  if (typeof gadiHint === "string")
    targets.push({ where: `${rel} :: personas.gadi.systemHint`, key: "personas.gadi.systemHint", text: gadiHint });
}

// 2) personas.ts: the gadi persona `role` inline literals (en + ko).
{
  const rel = "src/lib/chat/personas.ts";
  const src = readFileSync(join(ROOT, rel), "utf8");
  // Find the gadi block and pull its role: { en: "...", ko: "..." } literals.
  const gadiIdx = src.indexOf('id: "gadi"');
  if (gadiIdx >= 0) {
    const roleIdx = src.indexOf("role:", gadiIdx);
    const slice = roleIdx >= 0 ? src.slice(roleIdx, roleIdx + 200) : "";
    for (const m of slice.matchAll(/"([^"]+)"/g)) {
      const lit = m[1]!;
      if (lit === "en" || lit === "ko") continue; // object keys, not values
      targets.push({ where: `${rel} :: gadi.role`, key: "", text: lit });
    }
  }
}

const failures: string[] = [];
for (const t of targets) {
  // Wall 1: presence/companion framing - but a match inside a prohibition is the
  // safety-correct copy naming the forbidden behavior, so exempt negated matches.
  if (WALL1_PRESENCE.test(t.text) && !NEGATION_NEAR.test(t.text)) {
    failures.push(`[Wall 1 presence/companion] ${t.where}\n      "${t.text.slice(0, 120)}"`);
  }
  // Wall 2: only the four D-21 re-registered claim-bearing keys must be sourced.
  if (WALL2_KEYS.has(t.key) && makesClaim(t.text) && !SOURCING_TOKEN.test(t.text)) {
    failures.push(`[Wall 2 unsourced claim] ${t.where}\n      "${t.text.slice(0, 120)}"`);
  }
}

if (failures.length > 0) {
  console.error("Mascot-voice copy-law FAILED (D-21 + persona-sim gate: observational, sourced, user-owned):");
  for (const f of failures) console.error("  - " + f);
  console.error(
    "\nUser-addressed mascot copy must not regress to presence/companion framing (Wall 1),\n" +
      "and any claim about the user must speak from their own records/patterns (Wall 2).\n" +
      "First-person monologues (src/lib/graph/monologues.ts) are exempt - they have no addressee.",
  );
  process.exit(1);
}

console.log(
  `Mascot-voice PASS  scanned ${targets.length} user-addressed mascot strings ` +
    `(${LOCALES.length} locales + gadi role) for presence/companion + unsourced-claim regressions (D-21)`,
);
