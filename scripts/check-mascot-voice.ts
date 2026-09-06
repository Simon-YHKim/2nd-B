// User-addressed mascot copy: friendly language is allowed; attachment,
// exclusivity and unsupported personal claims are not (Simon, 2026-08-15).
// The matcher checks each sentence and reserves prohibition exemptions for
// systemHint fields. A greeting or action label needs no fabricated source.
// Self-talk, formal notices and crisis hand-offs retain their own policies.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mascotVoiceViolations } from "../src/lib/safety/mascot-voice";

const ROOT = process.cwd();
const LOCALES = ["en", "ko", "es", "id", "pt"] as const;
const WALL2_KEYS = new Set([
  "heroSpeech.default",
  "personaHero.speech",
  "personas.secondb.greeting",
  "personas.gadi.greeting",
]);

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
  const violations = mascotVoiceViolations(t.text, {
    requireSource: WALL2_KEYS.has(t.key),
    instruction: t.key.endsWith(".systemHint"),
  });
  if (violations.includes("attachment-or-overclaim")) {
    failures.push(`[Wall 1 presence/companion] ${t.where}\n      "${t.text.slice(0, 120)}"`);
  }
  // Wall 2: only the four D-21 re-registered claim-bearing keys must be sourced.
  if (violations.includes("unsourced-claim")) {
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
