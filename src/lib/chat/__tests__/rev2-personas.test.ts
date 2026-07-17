import {
  REV2_PERSONA_IDS,
  rev2PersonaAccent,
  rev2PersonaHint,
  rev2PersonaMode,
  rev2PersonaName,
  rev2PersonaRole,
} from "../rev2-personas";
import { m3 } from "@/lib/theme/m3";

describe("rev2 세컨비 personas (PRD v2.0)", () => {
  test("exactly the three m3 personas, 2nd-B first (the default)", () => {
    expect([...REV2_PERSONA_IDS]).toEqual(["secondb", "meta", "twi"]);
    expect([...REV2_PERSONA_IDS].sort()).toEqual(Object.keys(m3.persona).sort());
  });

  test("2nd-B keeps the shipped default voice (hint = null, no regression)", () => {
    expect(rev2PersonaHint("secondb", "en")).toBeNull();
    expect(rev2PersonaHint("secondb", "ko")).toBeNull();
  });

  test("메타비/트위비 carry distinct localized voice hints", () => {
    for (const id of ["meta", "twi"] as const) {
      for (const locale of ["en", "ko"] as const) {
        const hint = rev2PersonaHint(id, locale);
        expect(hint).toBeTruthy();
        expect(hint!.length).toBeGreaterThan(20);
      }
    }
    expect(rev2PersonaHint("meta", "en")).not.toBe(rev2PersonaHint("twi", "en"));
    expect(rev2PersonaHint("meta", "ko")).not.toBe(rev2PersonaHint("meta", "en"));
  });

  test("names and roles resolve in both system locales", () => {
    for (const id of REV2_PERSONA_IDS) {
      for (const locale of ["en", "ko"] as const) {
        expect(rev2PersonaName(id, locale).length).toBeGreaterThan(0);
        expect(rev2PersonaRole(id, locale).length).toBeGreaterThan(0);
      }
    }
    expect(rev2PersonaName("meta", "ko")).toBe("메타비");
    expect(rev2PersonaName("twi", "ko")).toBe("트위비");
  });

  test("트위비 owns the divergent engine mode; the others stay analytic", () => {
    expect(rev2PersonaMode("twi")).toBe("divergent");
    expect(rev2PersonaMode("secondb")).toBe("analytic");
    expect(rev2PersonaMode("meta")).toBe("analytic");
  });

  test("accents come from m3.persona (three distinct)", () => {
    const accents = REV2_PERSONA_IDS.map((id) => rev2PersonaAccent(id));
    expect(new Set(accents).size).toBe(3);
    expect(rev2PersonaAccent("secondb")).toBe(m3.persona.secondb.accent);
  });
});
