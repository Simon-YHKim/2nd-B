// Simon 2026-10-15 01:51 (Q-261015-80 가): the input word gate also reads
//  1. the decision's four terms with only SOME of their spaces left out ("살고싶지 않아", "더 이상살기
//     싫어"), and the new emphatic term likewise. A list by name (KO_PARTIAL_SPACING_TERMS): every other
//     spaced term keeps the two spellings of Q-261014-90, fully spaced and fully joined.
//  2. the emphatic forms of two terms, appended as terms 20 and 21: 끝내 버리고 싶 · 끝내 버릴. They take
//     the work-statement exception on the same condition as 끝내고 싶 · 끝낼 거, in a layer that never
//     changes what the plain forms' exception did (#2519 review r1).
// 끝낼게 · 끝내려고 · 끝낼래 were left out. The text's own spaces are never removed. The samples are the
// table the decision was made on (crisis-half-joined.fixtures.ts); the proxies are held to the same
// answers in crisis-terms-proxy-parity.test.ts.
import {
  classifyInput,
  classifyInputAnyLocale,
  KO_PARTIAL_SPACING_TERMS,
  koSpacingForms,
  koTermSpellings,
  matchesJoinedKoTerm,
} from "../classifier";
import { CRISIS_TERMS } from "../lexicon";
import { checkModelReplyOverlaps, KO_CRISIS_TERM_CODES } from "../model-reply-scan";
import { BENIGN_CRISIS_CONTEXTS, RISK_OR_UNRESOLVED_CRISIS_CONTEXTS } from "./crisis-context.fixtures";
import {
  DAILY_SAMPLE,
  EMPHATIC_WORK_PAIRS,
  LEFT_OUT_ENDINGS,
  MIXED_WORK_SENTENCES,
  NEWLY_CAUGHT_CRISIS,
  OUT_OF_SCOPE_PARTIAL,
} from "./crisis-half-joined.fixtures";

test("partly joined spellings are read for the decision's four terms and the new emphatic one, by name", () => {
  expect(KO_PARTIAL_SPACING_TERMS).toEqual(["살고 싶지 않", "더 이상 살", "없어지는 게 나아", "사라지는 게 나", "끝내 버리고 싶"]);
  for (const term of KO_PARTIAL_SPACING_TERMS) expect(CRISIS_TERMS.ko).toContain(term);
  // The one other term with two spaces is not on the list and keeps its two spellings.
  expect(CRISIS_TERMS.ko.filter((term) => term.split(" ").length > 2 && !KO_PARTIAL_SPACING_TERMS.includes(term))).toEqual(["영영 잠들고 싶"]);
  expect(koTermSpellings("영영 잠들고 싶")).toEqual(["영영 잠들고 싶", "영영잠들고싶"]);
  expect(CRISIS_TERMS.ko.slice(19)).toEqual(["끝내 버리고 싶", "끝내 버릴"]);
  expect(CRISIS_TERMS.ko).toHaveLength(21);
});

test("koSpacingForms keeps or leaves out each space on its own; koTermSpellings uses it for listed terms only", () => {
  expect(koSpacingForms("더 이상 살")).toEqual(["더 이상 살", "더 이상살", "더이상 살", "더이상살"]);
  expect(koSpacingForms("죽고 싶")).toEqual(["죽고 싶", "죽고싶"]);
  expect(koSpacingForms("자살")).toEqual(["자살"]);
  expect(koTermSpellings("더 이상 살")).toEqual(koSpacingForms("더 이상 살"));
  expect(koTermSpellings("끝내 버릴")).toEqual(["끝내 버릴", "끝내버릴"]);
  expect(koTermSpellings("자살")).toEqual(["자살"]);
});

describe.each(KO_PARTIAL_SPACING_TERMS)("every spelling of %s", (term) => {
  test.each(koSpacingForms(term))("%s is red and reported as the listed term", (form) => {
    const result = classifyInput(`그냥 ${form}`, "ko");
    expect(result.zone).toBe("red");
    expect(result.matched).toEqual([term]);
  });
});

test.each(OUT_OF_SCOPE_PARTIAL)("a partly joined spelling of a term off the list stays green: %s", (text) => {
  expect(classifyInputAnyLocale(text, "ko").zone).toBe("green");
});

test("a term off the list is still read fully spaced and fully joined", () => {
  expect(classifyInput("그냥 영영 잠들고 싶어", "ko").matched).toEqual(["영영 잠들고 싶"]);
  expect(classifyInput("그냥 영영잠들고싶어", "ko").matched).toEqual(["영영 잠들고 싶"]);
});

test.each(MIXED_WORK_SENTENCES)("an emphatic work sentence never lets a plain form through that main stopped: %s", (text) => {
  // Each of these is red on main through its plain form; the emphatic layer must leave it red.
  const result = classifyInput(text, "ko");
  expect(result.zone).toBe("red");
  expect(result.matched.some((term) => term === "끝내고 싶" || term === "끝낼 거" || term === "끝낼거")).toBe(true);
});

test.each(NEWLY_CAUGHT_CRISIS)("the decision's crisis sample is red, 109 for an adult and 1388 first for a minor: %s", (text) => {
  const adult = classifyInput(text, "ko", { minor: false });
  const minor = classifyInput(text, "ko", { minor: true });
  expect([adult.zone, adult.crisisRouting?.hotline]).toEqual(["red", "KR_109"]);
  expect([minor.zone, minor.crisisRouting?.hotline]).toEqual(["red", "KR_1388"]);
  // On an English screen too.
  expect(classifyInputAnyLocale(text, "en").zone).toBe("red");
  for (const name of adult.matched) expect(KO_CRISIS_TERM_CODES[name]).toBeGreaterThan(0);
});

test("the emphatic forms are reported as terms 20 and 21", () => {
  expect(classifyInput("그냥 다 끝내버리고 싶어", "ko").matched).toEqual(["끝내 버리고 싶"]);
  expect(classifyInput("아무도 모르게\n다 끝내 버리고싶어", "ko").matched).toEqual(["끝내 버리고 싶"]);
  expect(classifyInput("나 그냥 끝내버릴 거야", "ko").matched).toEqual(["끝내 버릴"]);
  expect([KO_CRISIS_TERM_CODES["끝내 버리고 싶"], KO_CRISIS_TERM_CODES["끝내 버릴"]]).toEqual([20, 21]);
});

test.each(LEFT_OUT_ENDINGS)("an ending the decision left out stays outside the word gate: %s", (text) => {
  expect(classifyInput(text, "ko").zone).toBe("green");
});

test("the daily sample gets the table's answer: 24 red, the other 29 green", () => {
  expect(DAILY_SAMPLE).toHaveLength(53);
  expect(DAILY_SAMPLE.filter(([, red]) => red)).toHaveLength(24);
  const wrong = DAILY_SAMPLE.filter(([text, red]) => (classifyInput(text, "ko").zone === "red") !== red).map(([text]) => text);
  expect(wrong).toEqual([]);
});

test.each(EMPHATIC_WORK_PAIRS)("the work exception reads the emphatic forms as it reads the plain ones: %s", (text, red) => {
  expect(classifyInput(text, "ko").zone === "red").toBe(red);
});

test("the plain forms' work verdicts are what they were", () => {
  expect(classifyInput("과제를 빨리 끝내고 싶어", "ko").zone).toBe("green");
  expect(classifyInput("과제를 다 끝낼 거야", "ko").zone).toBe("green");
  expect(classifyInput("다 끝내고 싶어", "ko").zone).toBe("red");
});

test("the text's own spaces are kept: letters moved across a space are not a spelling of the term", () => {
  expect(matchesJoinedKoTerm("더이 상 살기 싫어", "더 이상 살")).toBe(false);
  expect(matchesJoinedKoTerm("그게 마지막인 사진이야", "마지막 인사")).toBe(false);
  expect(classifyInput("그게 마지막인 사진이야", "ko").zone).toBe("green");
});

test("model replies: a listed word is the same word in every spelling, and a partly joined term still stops a reply", () => {
  const opts = { benignOverlaps: true, minor: false } as const;
  for (const reply of ["더 이상 살펴볼게요.", "더이상 살펴볼게요.", "더 이상살펴볼게요.", "더이상살펴볼게요."]) {
    const check = checkModelReplyOverlaps(reply, "ko", opts);
    expect([reply, check.strict.zone, check.candidate]).toEqual([reply, "red", true]);
  }
  for (const reply of ["살고싶지 않다는 마음이 드시는군요.", "다 끝내버리고 싶다는 마음이 드시는군요.", "더이상 살펴볼게요. 더이상 살 이유가 없다고 하셨죠."]) {
    const check = checkModelReplyOverlaps(reply, "ko", opts);
    expect([reply, check.strict.zone, check.candidate]).toEqual([reply, "red", false]);
  }
});

test("every crisis-context fixture keeps its verdict", () => {
  // These fixtures were written before this change; their verdicts are the contract the
  // exceptions keep. None of them may flip.
  for (const text of BENIGN_CRISIS_CONTEXTS) expect([text, classifyInput(text, "ko").zone]).not.toEqual([text, "red"]);
  for (const text of RISK_OR_UNRESOLVED_CRISIS_CONTEXTS) {
    expect([text, [classifyInput(text, "ko").zone, classifyInput(text, "en").zone].includes("red")]).toEqual([text, true]);
  }
});
