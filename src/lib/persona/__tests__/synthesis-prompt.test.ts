import { personaSynthesisSystem } from "../synthesis-prompt";

describe("personaSynthesisSystem", () => {
  test("encodes the honest-mirror directives (ground, pattern-not-verdict, balanced, tentative)", () => {
    const p = personaSynthesisSystem("en");
    expect(p).toMatch(/ONLY in the entries/i); // grounding
    expect(p).toMatch(/Never invent/i); // anti-fabrication
    expect(p).toMatch(/PATTERN IN THE ENTRIES/i); // pattern, not flattering verdict
    expect(p).toMatch(/Do NOT simply agree/i); // anti-sycophancy
    expect(p).toMatch(/tentative|calibrated/i); // calibrated uncertainty
    expect(p).toMatch(/across cultures/i); // cross-cultural, no unique-greatness flattery
  });

  test("targets the user's language", () => {
    expect(personaSynthesisSystem("ko")).toMatch(/Korean/);
    expect(personaSynthesisSystem("en")).toMatch(/English/);
  });

  test("stays free of clinical vocabulary (lexicon policy)", () => {
    const both = personaSynthesisSystem("en") + personaSynthesisSystem("ko");
    expect(both).not.toMatch(/diagnos|therap|clinical|disorder|depress|anxiet/i);
  });
});
