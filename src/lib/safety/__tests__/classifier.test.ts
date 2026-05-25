import { classifyInput, containsForbiddenLexicon } from "../classifier";

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

  test("KR crisis term routes to KR_1393", () => {
    const r = classifyInput("요즘 자살에 대해 자주 생각해요.", "ko");
    expect(r.zone).toBe("red");
    expect(r.crisisRouting?.hotline).toBe("KR_1393");
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

describe("containsForbiddenLexicon", () => {
  test("returns matched terms for EN", () => {
    expect(containsForbiddenLexicon("see a therapy professional", "en")).toContain("therapy");
  });
  test("returns empty array when none match", () => {
    expect(containsForbiddenLexicon("hello world", "en")).toEqual([]);
  });
});
