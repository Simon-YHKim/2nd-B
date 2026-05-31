import { PERSONAS, getPersona, personaIds } from "../personas";
import { FORBIDDEN_TERMS } from "@/lib/safety/lexicon";

const WORKER_IDS = ["secondb", "momo", "lulu", "archi", "vela", "gadi", "lumi"] as const;

describe("PERSONAS", () => {
  test("has all seven workers", () => {
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
    expect(getPersona("lulu").name.en).toBe("Lulu");
  });
  test("falls back to SecondB for unknown / null", () => {
    expect(getPersona(null).id).toBe("secondb");
    expect(getPersona("nope").id).toBe("secondb");
  });
});
