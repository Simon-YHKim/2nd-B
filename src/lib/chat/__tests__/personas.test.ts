import { PERSONAS, getPersona, personaIds } from "../personas";
import { FORBIDDEN_TERMS } from "@/lib/safety/lexicon";

const WORKER_IDS = ["secondb", "momo", "lulu", "archi", "gadi", "lumi"] as const;

describe("PERSONAS", () => {
  test("has all six workers (Vela retired)", () => {
    expect(personaIds().sort()).toEqual([...WORKER_IDS].sort());
  });

  test("every persona has bilingual name/role/greeting/systemHint", () => {
    for (const id of WORKER_IDS) {
      const p = PERSONAS[id];
      for (const field of ["name", "role", "greeting", "systemHint"] as const) {
        expect(p[field].en.trim().length).toBeGreaterThan(0);
        expect(p[field].ko.trim().length).toBeGreaterThan(0);
      }
      expect(p.id).toBe(id);
    }
  });

  test("no persona text uses forbidden clinical vocabulary", () => {
    const all = Object.values(PERSONAS)
      .flatMap((p) => [p.name, p.role, p.greeting, p.systemHint])
      .flatMap((f) => [f.en.toLowerCase(), f.ko.toLowerCase()]);
    const banned = [...FORBIDDEN_TERMS.en, ...FORBIDDEN_TERMS.ko].map((t) => t.toLowerCase());
    for (const text of all) {
      for (const term of banned) {
        expect(text).not.toContain(term);
      }
    }
  });
});

describe("getPersona", () => {
  test("resolves a known id", () => {
    expect(getPersona("lulu").name.en).toBe("Lumen");
  });
  test("falls back to SecondB for unknown / null", () => {
    expect(getPersona(null).id).toBe("secondb");
    expect(getPersona("nope").id).toBe("secondb");
  });
  test("falls back to SecondB for Object.prototype keys (no prototype-chain leak)", () => {
    // `id` is a raw external string (deep-link param); prototype keys must not
    // resolve to Object.prototype members via the `in` operator.
    for (const key of ["toString", "constructor", "hasOwnProperty", "__proto__", "valueOf"]) {
      expect(getPersona(key).id).toBe("secondb");
    }
  });
});
