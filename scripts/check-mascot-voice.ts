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
  "rev2.secondb.desc",
  "rev2.meta.desc",
  "rev2.twi.desc",
]);
// ⚠ 2026-10-05 (Simon 결정 Q-261004-14 A): 옛 캐릭터 명부(personas.*)가 로케일에서
//   나갔다. 그 자리에 있던 감시 대상은 지우지 않고 배송 대화의 같은 자리로 옮겼다
//   (약화 금지):
//   - personas.secondb/gadi.greeting(화자가 사용자에게 건네는 한 줄, Wall 2)
//       -> rev2.*.desc. 배송 대화의 페르소나 띠가 사용자에게 보이는 그 한 줄이다.
//   - personas.*.greeting(Wall 1 전부) -> 위 셋 + empty(빈 대화의 첫 안내).
//     empty 는 es/id/pt 문장이 따옴표로 끝나 Wall 2 의 물음표 규칙이 못 읽어서
//     Wall 1 만 본다(2026-10-05 실측).
//   - personas.gadi.systemHint(지시문, Wall 1) -> rev2.meta/twi.systemHint.
//     배송 대화가 실제로 프롬프트에 넣는 페르소나 지시문은 이 둘뿐이다
//     (rev2PersonaHint("secondb") 는 null).
//   - personas.ts 의 gadi role 리터럴 블록은 대상 파일이 없어져 은퇴했다.

interface Target {
  where: string; // human-readable location for the error
  key: string; // the dotted key suffix (e.g. "rev2.meta.desc")
  text: string;
}

function get(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((v, k) => {
    if (!v || typeof v !== "object") return undefined;
    return (v as Record<string, unknown>)[k];
  }, obj);
}

const targets: Target[] = [];
const missing: string[] = [];

function push(rel: string, json: unknown, key: string): void {
  const value = get(json, key);
  // 대상 키가 사라지면 조용히 0건 통과하지 않는다 - 그게 이 가드가 지키던 것을
  // 잃는 가장 쉬운 길이다.
  if (typeof value !== "string") {
    missing.push(`${rel} :: ${key}`);
    return;
  }
  targets.push({ where: `${rel} :: ${key}`, key, text: value });
}

// Locale JSON: the user-addressed keys across all 5 shipped locales.
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
  push(rel, json, "personaHero.speech");
  // The shipped chat's opening line and each persona's banner line.
  push(rel, json, "empty");
  for (const id of ["secondb", "meta", "twi"]) push(rel, json, `rev2.${id}.desc`);
  // The persona instructions the shipped chat actually sends (Wall 1, negation-aware).
  for (const id of ["meta", "twi"]) push(rel, json, `rev2.${id}.systemHint`);
}

const failures: string[] = missing.map((m) => `[missing watched key] ${m}`);
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
  // Wall 2: only the WALL2_KEYS claim-bearing keys must be sourced.
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
      "First-person self-talk is exempt - it has no addressee.",
  );
  process.exit(1);
}

console.log(
  `Mascot-voice PASS  scanned ${targets.length} user-addressed mascot strings ` +
    `(${LOCALES.length} locales: hero lines, chat opening line, persona banners, persona instructions) ` +
    `for presence/companion + unsourced-claim regressions (D-21)`,
);
