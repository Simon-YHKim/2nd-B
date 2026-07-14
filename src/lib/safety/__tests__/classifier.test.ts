import { classifyInput, classifyInputAnyLocale, containsForbiddenLexicon, crisisHotlines } from "../classifier";

describe("classifyInput", () => {
  test("empty input is green", () => {
    expect(classifyInput("", "en").zone).toBe("green");
    expect(classifyInput("   ", "ko").zone).toBe("green");
  });

  test("ordinary English content is green", () => {
    const r = classifyInput("I went for a walk and felt calm.", "en");
    expect(r.zone).toBe("green");
    expect(r.matched).toEqual([]);
  });

  test("ordinary Korean content is green", () => {
    const r = classifyInput("오늘은 산책을 했고 기분이 차분했어요.", "ko");
    expect(r.zone).toBe("green");
  });

  test("EN crisis term routes to GLOBAL_988", () => {
    const r = classifyInput("Sometimes I want to die.", "en");
    expect(r.zone).toBe("red");
    expect(r.crisisRouting?.hotline).toBe("GLOBAL_988");
    expect(r.categories).toContain("crisis");
  });

  test("EN multi-word crisis term still matches across non-space whitespace", () => {
    // The words split by a newline / double space / nbsp must not slip RED->GREEN.
    expect(classifyInput("I just want to\ndie", "en").zone).toBe("red");
    expect(classifyInput("i want to  die", "en").zone).toBe("red");
    expect(classifyInput("i want to die", "en").zone).toBe("red");
  });

  test("KO crisis term matches NFD-decomposed Hangul (pasted/imported input)", () => {
    // iOS/macOS clipboard and third-party clips can arrive NFD-decomposed while the
    // lexicon is authored NFC; both must classify RED.
    expect(classifyInput("죽고 싶어요".normalize("NFD"), "ko").zone).toBe("red");
    expect(classifyInput("죽고 싶어요".normalize("NFC"), "ko").zone).toBe("red");
  });

  test("KR adult crisis routes to KR_109 (1393 merged into 109 in 2024)", () => {
    const r = classifyInput("요즘 자살에 대해 자주 생각해요.", "ko");
    expect(r.zone).toBe("red");
    expect(r.crisisRouting?.hotline).toBe("KR_109");
  });

  test("KR minor crisis routes to youth line KR_1388", () => {
    const r = classifyInput("요즘 자살에 대해 자주 생각해요.", "ko", { minor: true });
    expect(r.zone).toBe("red");
    expect(r.crisisRouting?.hotline).toBe("KR_1388");
  });

  test("EN minor crisis stays on GLOBAL_988 (serves youth)", () => {
    const r = classifyInput("Sometimes I want to die.", "en", { minor: true });
    expect(r.zone).toBe("red");
    expect(r.crisisRouting?.hotline).toBe("GLOBAL_988");
  });

  test("EN forbidden lexicon downgrades to yellow, not red", () => {
    const r = classifyInput("My therapy session helped.", "en");
    expect(r.zone).toBe("yellow");
    expect(r.matched).toContain("therapy");
  });

  test("KR forbidden lexicon downgrades to yellow", () => {
    const r = classifyInput("정신건강에 대해 이야기하고 싶어요.", "ko");
    expect(r.zone).toBe("yellow");
    expect(r.matched).toContain("정신건강");
  });

  test("EN word boundary prevents false positive (chemotherapy)", () => {
    const r = classifyInput("She finished chemotherapy last year.", "en");
    expect(r.zone).toBe("green");
  });

  test("crisis takes precedence over forbidden lexicon", () => {
    const r = classifyInput("My therapy isn't helping and I want to die.", "en");
    expect(r.zone).toBe("red");
  });
});

describe("classifyInputAnyLocale (cross-locale crisis backstop)", () => {
  test("catches a KR crisis term written by an EN-UI user", () => {
    // Single-locale classifyInput(en) misses the ko phrase; the any-locale
    // backstop also checks the ko lexicon. The note-save crisis path and the
    // chat input path both rely on this so a crisis in the other language is
    // never dropped.
    expect(classifyInput("요즘 자살에 대해 자주 생각해요.", "en").zone).not.toBe("red");
    expect(classifyInputAnyLocale("요즘 자살에 대해 자주 생각해요.", "en").zone).toBe("red");
  });

  test("catches an EN crisis term written by a KR-UI user", () => {
    expect(classifyInput("Sometimes I want to die.", "ko").zone).not.toBe("red");
    expect(classifyInputAnyLocale("Sometimes I want to die.", "ko").zone).toBe("red");
  });

  test("primary-locale crisis still routes (no regression)", () => {
    expect(classifyInputAnyLocale("Sometimes I want to die.", "en").zone).toBe("red");
  });

  test("ordinary content stays green (no cross-locale false positive)", () => {
    expect(classifyInputAnyLocale("I went for a walk and felt calm.", "en").zone).toBe("green");
    expect(classifyInputAnyLocale("오늘은 산책을 했고 기분이 차분했어요.", "ko").zone).toBe("green");
  });
});

describe("containsForbiddenLexicon", () => {
  test("returns matched terms for EN", () => {
    expect(containsForbiddenLexicon("see a therapy professional", "en")).toContain("therapy");
  });
  test("returns empty array when none match", () => {
    expect(containsForbiddenLexicon("hello world", "en")).toEqual([]);
  });
});

describe("crisisHotlines (single source of truth)", () => {
  test("KO adult -> [109]", () => {
    expect(crisisHotlines("ko").map((h) => h.number)).toEqual(["109"]);
  });
  test("KO minor -> [1388, 109] (youth line first, then 109)", () => {
    expect(crisisHotlines("ko", true).map((h) => h.number)).toEqual(["1388", "109"]);
  });
  test("EN any age -> [988] (serves minors too)", () => {
    expect(crisisHotlines("en").map((h) => h.number)).toEqual(["988"]);
    expect(crisisHotlines("en", true).map((h) => h.number)).toEqual(["988"]);
  });
});
