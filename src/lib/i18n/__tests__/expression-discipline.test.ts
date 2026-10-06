// Expression discipline on the minor-lock and brightness copy (QA 261006).
//
// WHY. CLAUDE.md "미성년 개방" fixes the wording rule for UI, store and
// marketing copy: no "감지" (detect), "보호" (protect) or "모니터링" (monitor).
// The app states facts only. The #2099 post-merge review (gate pm-tr1-astra,
// F2 and F3) found three places that broke it:
//
//   - privacy.recommend.minorLocked and privacy.semantic.minorLocked said the
//     switch was off "보호를 위해" / "for your protection", and #2099 carried
//     that purpose claim into es/pt/id;
//   - brightness.shiftNudge(Cited) opened with "최근 변화 감지" in Korean.
//
// Simon (2026-10-06, "권장 사항으로 진행하자") took the review's sentences.
// The lines now say what the switch is (off, cannot be turned on) and what
// changed, nothing about why the app watches or shields anyone.
//
// The guard covers the whole subtree of each minor-lock row on /privacy and the
// whole brightness pack, in all five locales, so a new line there cannot bring
// the claim back in another language.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const pack = (lng: string, ns: string) =>
  JSON.parse(readFileSync(join(ROOT, `locales/${lng}/${ns}.json`), "utf8")) as Record<string, unknown>;
const at = (node: unknown, key: string): unknown =>
  key.split(".").reduce<unknown>((n, part) => (n as Record<string, unknown> | undefined)?.[part], node);
function flatten(node: unknown, prefix: string, out: Record<string, string> = {}): Record<string, string> {
  if (typeof node === "string") out[prefix] = node;
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) flatten(v, `${prefix}.${k}`, out);
  return out;
}

/** Word stems of detect / protect / monitor in each shipped language. */
const FORBIDDEN: Record<string, RegExp> = {
  ko: /감지|보호|모니터링/,
  en: /detect|protect|monitor/i,
  es: /detect|proteg|protecc|monitor|vigil/i,
  pt: /detect|deteç|proteg|proteç|monitor|vigi/i,
  id: /deteksi|lindung|pantau|monitor/i,
};

/** Where the claim showed up, plus the rows that sit next to it. */
const GUARDED: { ns: string; root: string }[] = [
  { ns: "deepspace", root: "privacy.analytics" },
  { ns: "deepspace", root: "privacy.recommend" },
  { ns: "deepspace", root: "privacy.semantic" },
  { ns: "brightness", root: "" },
];

describe("expression discipline: minor locks and the brightness nudge state facts only", () => {
  it.each(Object.keys(FORBIDDEN))("%s has no detect / protect / monitor wording in the guarded copy", (lng) => {
    let checked = 0;
    for (const { ns, root } of GUARDED) {
      const p = pack(lng, ns);
      const node = root ? at(p, root) : p;
      expect({ lng, ns, root, present: node !== undefined }).toEqual({ lng, ns, root, present: true });
      for (const [key, value] of Object.entries(flatten(node, root || ns))) {
        checked++;
        expect({ lng, key, value, claims: FORBIDDEN[lng].test(value) }).toEqual({ lng, key, value, claims: false });
      }
    }
    // Both lock lines and both nudge lines are inside the guarded set.
    expect(checked).toBeGreaterThanOrEqual(4);
  });
});
