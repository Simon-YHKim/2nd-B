// Simon 2026-10-14 (Q-261014-90 가): a Korean gate term written with a space also counts when it is
// typed without one. Before this, "다 끝내고싶어" passed the input check and reached the model:
// the matcher folds whitespace runs to one space but never removes them, and the letter-gap gate
// (crisis-obfuscation.ts) leaves "끝내고 싶" out on purpose.
//
// This file is about the fully joined form of each spaced term. The text's own spaces are never
// removed. The proxies' copies are held to the same answers in crisis-terms-proxy-parity.test.ts.
// 2026-10-15 (Q-261015-80): the partly joined forms and the two emphatic terms (20 · 21) came after;
// they are tested in crisis-half-joined-emphatic.test.ts.
import { classifyInput, matchesJoinedKoTerm } from "../classifier";
import { CRISIS_TERMS } from "../lexicon";
import { checkModelReplyOverlaps, KO_CRISIS_TERM_CODES } from "../model-reply-scan";
import { BENIGN_CRISIS_CONTEXTS, RISK_OR_UNRESOLVED_CRISIS_CONTEXTS } from "./crisis-context.fixtures";

const SPACED = CRISIS_TERMS.ko.filter((term) => term.includes(" "));
const joinedOf = (term: string): string => term.replace(/ /g, "");

test("the spaced terms this covers, from the list", () => {
  expect(SPACED).toEqual([
    "죽고 싶", "살고 싶지 않", "사라지고 싶", "더 이상 살", "끝내고 싶", "끝낼 거", "목숨을 끊",
    "스스로 목숨", "마지막 인사", "짐이 되", "없어지는 게 나아", "사라지는 게 나", "다음 생에는", "영영 잠들고 싶",
    // Appended by Q-261015-80 (terms 20 and 21).
    "끝내 버리고 싶", "끝내 버릴",
  ]);
  // The first nineteen terms and their fixed numbers are what they were.
  expect(Object.keys(KO_CRISIS_TERM_CODES)).toEqual([...CRISIS_TERMS.ko]);
  expect(CRISIS_TERMS.ko).toHaveLength(21);
});

test.each([
  ["다 끝내고싶어", false, "KR_109"],
  ["사는 게 의미가 없어. 다 끝내고싶어", false, "KR_109"],
  ["학원 끝나고 그냥 다 끝내고싶다 진짜", true, "KR_1388"],
] as const)("the reported sentence is red: %s", (text, minor, hotline) => {
  const result = classifyInput(text, "ko", { minor });
  expect(result.zone).toBe("red");
  expect(result.matched).toEqual(["끝내고 싶"]);
  expect(result.crisisRouting?.hotline).toBe(hotline);
});

test.each(SPACED)("the joined form of %s is red and is reported under a listed term", (term) => {
  const joined = joinedOf(term);
  const result = classifyInput(`그냥 ${joined}`, "ko");
  expect(result.zone).toBe("red");
  // A joined form that is a term of its own (죽고싶, 끝낼거) is reported as that term.
  expect(result.matched).toEqual([CRISIS_TERMS.ko.includes(joined) ? joined : term]);
  for (const name of result.matched) expect(KO_CRISIS_TERM_CODES[name]).toBeGreaterThan(0);
});

test("the text's own spaces are kept, so a match cannot reach across a word boundary", () => {
  const text = "그게 마지막인 사진이야";
  // Taking every space out of the text would have made this red ("마지막인사" + "진").
  expect(text.replace(/\s/g, "").includes(joinedOf("마지막 인사"))).toBe(true);
  expect(classifyInput(text, "ko").zone).toBe("green");
  expect(matchesJoinedKoTerm(text, "마지막 인사")).toBe(false);
});

test("a term without a space gets no second form", () => {
  expect(matchesJoinedKoTerm("자살", "자살")).toBe(false);
  expect(matchesJoinedKoTerm("죽고싶어", "죽고 싶")).toBe(false); // left to "죽고싶" itself
  expect(classifyInput("죽고싶어", "ko").matched).toEqual(["죽고싶"]);
});

// The work-statement exception and the denials read the joined spelling exactly as the spaced one.
function joinedVariant(text: string): string {
  let out = text;
  for (const term of SPACED) out = out.split(term).join(joinedOf(term));
  return out;
}

test.each([
  ["과제를 다 끝내고 싶어", "green"],
  ["일을 다 끝내고 싶어", "green"],
  ["과제를 다 끝낼 거야", "green"],
  ["일 다 끝내고 싶어. 나 자신도", "red"],
  ["오늘 안에 일을 다 끝내고 싶어", "red"],
] as const)("a work sentence and its joined spelling get the same verdict: %s", (spaced, zone) => {
  const joined = joinedVariant(spaced);
  expect(joined).not.toBe(spaced);
  expect(classifyInput(spaced, "ko").zone).toBe(zone);
  expect(classifyInput(joined, "ko").zone).toBe(zone);
});

test("every crisis-context fixture keeps its verdict when its spaced terms are joined", () => {
  const changed: string[] = [];
  const drift: string[] = [];
  for (const text of [...BENIGN_CRISIS_CONTEXTS, ...RISK_OR_UNRESOLVED_CRISIS_CONTEXTS]) {
    const joined = joinedVariant(text);
    if (joined === text) continue;
    changed.push(text);
    for (const locale of ["ko", "en"] as const) {
      if (classifyInput(joined, locale).zone !== classifyInput(text, locale).zone) drift.push(`${locale}: ${text}`);
    }
  }
  // Sight control: the fixtures do hold spaced terms to join.
  expect(changed.length).toBeGreaterThanOrEqual(10);
  expect(drift).toEqual([]);
});

test("a model reply that quotes a joined term is not let through as a mere overlap", () => {
  const opts = { benignOverlaps: true, minor: false } as const;
  for (const reply of ["다 끝내고싶다는 마음이 드시는군요.", "다 끝내고 싶다는 마음이 드시는군요."]) {
    const check = checkModelReplyOverlaps(reply, "ko", opts);
    expect([reply, check.strict.zone, check.candidate]).toEqual([reply, "red", false]);
  }
  // The closed list still works as before for the spaced word it lists.
  expect(checkModelReplyOverlaps("작은 다짐이 되어 줄 거예요.", "ko", opts).candidate).toBe(true);
});
