import { findCopyLexiconHits } from "../lib/lexicon-copy";
import { classifyInput, containsAnalysisForbidden, containsForbiddenLexicon } from "../../src/lib/safety/classifier";

describe("copy lexicon context", () => {
  test.each([
    "This is not therapy and therapy is what we provide.",
    "This is not therapy: therapy is available here.",
  ])("checks every occurrence rather than only the first denial: %s", (text) => {
    expect(findCopyLexiconHits(text, "en").forbidden).toContain("therapy");
  });

  test.each([
    "The server is not ready. This app is scientifically proven.",
    "No login required; this app is clinically validated.",
    "This is not only scientifically proven but also easy to use.",
    'const copy = { guard: "Never diagnose", claim: "scientifically proven" };',
    "Never diagnose, but we offer a psychological evaluation.",
    "Never diagnose although our diagnosis is definitive.",
  ])("an unrelated denial cannot conceal an EN claim: %s", (text) => {
    expect(findCopyLexiconHits(text, "en").analysis.length).toBeGreaterThan(0);
  });

  test.each([
    "로그인이 없어도 돼요. 당신은 비정상이에요.",
    "걱정하지 마세요. 당신에게 장애가 있어요.",
    "당신은 똑똑한 사람이에요. 의심할 필요는 없어요.",
    'const copy = { notice: "문제가 없어요", claim: "임상적으로 검증된 방법" };',
    "치료는 제공하고 진단은 금지합니다.",
  ])("an unrelated denial cannot conceal a KO claim: %s", (text) => {
    expect(findCopyLexiconHits(text, "ko").analysis.length).toBeGreaterThan(0);
  });

  test.each([
    "Never diagnose or claim therapeutic outcomes.",
    "Do not provide therapy or claim healing.",
    "This app is not a diagnosis or treatment service.",
    "Tailor the response without labeling or diagnosing the person.",
  ])("an explicit EN prohibition or disclosure passes: %s", (text) => {
    expect(findCopyLexiconHits(text, "en")).toEqual({ forbidden: [], analysis: [] });
  });

  test.each([
    "임상적으로 검증된 효과라고 말하지 마세요.",
    "심리치료나 심리상담을 제공하지 않습니다.",
    "치료·처방은 금지합니다.",
    "임상 진단·치료 표현은 쓰지 마.",
    '상품 설명에 "더 똑똑한 AI" 류 문구를 쓰지\n마라.',
  ])("an explicit KO prohibition or disclosure passes: %s", (text) => {
    expect(findCopyLexiconHits(text, "ko")).toEqual({ forbidden: [], analysis: [] });
  });

  test.each([
    ["en", "Use the same visual treatment for the cards."],
    ["en", "Network diagnosis helps find a connection error."],
    ["ko", "서버 상태는 정상이에요."],
    ["ko", "도전 정신과 끈기를 적었어요."],
    ["ko", "네트워크에 장애가 있어요."],
    ["ko", "코드에 결함이 있어요."],
    ["ko", "문제 대처방안을 정리해요."],
  ] as const)("precise technical or lexical context passes (%s): %s", (locale, text) => {
    expect(findCopyLexiconHits(text, locale)).toEqual({ forbidden: [], analysis: [] });
  });

  test.each([
    ["en", "Use visual treatment. Our treatment heals you."],
    ["en", "Network diagnosis works, and our diagnosis is definitive."],
    ["ko", "서버 상태는 정상이에요. 당신은 비정상이에요."],
    ["ko", "도전 정신과 끈기. 정신과 진단명을 알려드려요."],
    ["ko", "네트워크에 장애가 있어요. 당신에게 장애가 있어요."],
    ["ko", "코드에 결함이 있어요. 당신에게 결함이 있어요."],
    ["ko", "대처방안을 적고 처방을 제공합니다."],
  ] as const)("technical wording cannot exempt another occurrence (%s): %s", (locale, text) => {
    const hits = findCopyLexiconHits(text, locale);
    expect(hits.forbidden.length + hits.analysis.length).toBeGreaterThan(0);
  });

  test("CI context handling does not relax raw runtime output or input checks", () => {
    expect(containsForbiddenLexicon("Do not provide therapy", "en")).toContain("therapy");
    expect(containsAnalysisForbidden("서버 상태는 정상이에요", "ko")).toContain("정상이");
    expect(classifyInput("우울증에 대해 적었어요", "ko").zone).toBe("yellow");
    expect(classifyInput("죽고 싶어요", "ko").zone).toBe("red");
  });

  test("multi-word terms still match across a prose line break", () => {
    expect(findCopyLexiconHits("This app provides mental\nhealth services.", "en").forbidden).toContain("mental health");
    expect(findCopyLexiconHits("This app is clinically\nvalidated.", "en").analysis).toContain("clinically validated");
    expect(findCopyLexiconHits("This app is clinically  validated.", "en").analysis).toContain("clinically validated");
    expect(findCopyLexiconHits("This app provides mental\thealth services.", "en").forbidden).toContain("mental health");
  });
});
