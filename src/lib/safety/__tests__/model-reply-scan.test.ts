import { classifyInput, classifyInputAnyLocale } from "../classifier";
import { hasCrisisRiskContext } from "../crisis-context";
import { CRISIS_TERMS } from "../lexicon";
import {
  KO_CRISIS_TERM_CODES,
  MODEL_REPLY_BENIGN_OVERLAPS,
  classifyModelReply,
  maskModelReplyOverlaps,
  modelReplyTermCategories,
} from "../model-reply-scan";

// Simon 2026-10-13: Q-261013-34 and the three legal choices D1-D3. The gate matches Korean terms as
// bare substrings, so an ordinary model reply was replaced by the crisis template (Z45). A model reply
// may overlook a closed list of unrelated words; what the user wrote is scanned exactly as before.

const ADULT = { minor: false, benignOverlaps: true } as const;

// What an assistant writes. Each sentence holds a gate term's letters inside another word, and
// nothing else in it is a gate term or a risk-context word.
const ORDINARY_REPLIES: [string, string][] = [
  ["오늘의 작은 다짐이 되어 줄 거예요.", "짐이 되"],
  ["그 한 줄이 내일의 마음가짐이 되기도 합니다.", "짐이 되"],
  ["바른 몸가짐이 되도록 천천히 해 보세요.", "짐이 되"],
  ["더 이상 살펴보지 않아도 되는 항목입니다.", "더 이상 살"],
];

// Replies that must still be replaced, with the overlaps allowed.
const STILL_REPLACED: string[] = [
  "더 이상 살고 싶지 않아",
  "유서를 썼어",
  "가족에게 짐이 되는 것 같아",
  // A listed word does not hide the same term standing elsewhere.
  "작은 다짐이 되겠지만, 유서를 남기고 싶다는 말은 가볍게 넘기지 마세요.",
  "다짐이 되지 못해 모두에게 짐이 되는 기분이라고 하셨죠.",
  "더 이상 살펴볼 것도 없고 더 이상 살 이유도 없다고 느끼시는군요.",
  // Left out of the list on purpose (legal review 2026-10-13).
  "자살예방상담전화 109로 연락해 보세요.",
  "죽고 싶을 만큼 힘드셨겠어요.",
  "마지막 인사를 전하고 싶다는 말씀이군요.",
  "다음 생에는 더 잘하고 싶다는 마음이군요.",
  "그 일은 이번 주 안에 끝낼 거라고 적어 두셨네요.",
  "그 숙제는 얼른 끝내고 싶다고 하셨죠. 그리고 다 끝내고 싶다고도 하셨어요.",
  // Dropped by the independent review of this change: a prefix, and a word a missing space makes.
  "유서 깊은 도시를 걸어 보는 것도 좋겠습니다.",
  "유서\n깊숙이 숨겨 뒀어.",
  "사유서를 내야 한다면 먼저 초안을 적어 보세요.",
  "이유서를 남기고 떠난다고 적으셨네요.",
];

// A listed word next to a risk-context word: the existing exceptions stay strict here, and so does
// this one. One sentence per entry of the list.
const RISK_CONTEXT_NEXT_TO_A_LISTED_WORD: string[] = [
  "삶을 포기하겠다는 다짐이 되었어.",
  "그 약을 모으는 것이 마음가짐이 되었다고 하셨죠.",
  "옥상에 서는 것이 몸가짐이 되었다는 말씀이군요.",
  "더 이상 살펴볼 계획도 없다고 하셨어요.",
  // Ordinary, and still replaced: the risk-context test favors false positives.
  "내일 계획에 작은 다짐이 되어 줄 거예요.",
];

describe("the closed list", () => {
  it("is exactly these four entries", () => {
    expect([...MODEL_REPLY_BENIGN_OVERLAPS]).toEqual(["다짐이 되", "마음가짐이 되", "몸가짐이 되", "더 이상 살펴"]);
  });

  it("holds no form of the two finish terms (D2) and nothing built on the will term", () => {
    for (const overlap of MODEL_REPLY_BENIGN_OVERLAPS) {
      expect(overlap).not.toMatch(/끝내|끝낼|유서/);
    }
  });

  it("lists only words that really contain a gate term, and no bare gate term", () => {
    for (const overlap of MODEL_REPLY_BENIGN_OVERLAPS) {
      expect(CRISIS_TERMS.ko.some((term) => overlap.includes(term))).toBe(true);
      expect(CRISIS_TERMS.ko).not.toContain(overlap);
    }
  });

  it("masks in place: the scan copy keeps the normalized length", () => {
    for (const [reply] of ORDINARY_REPLIES) {
      const normalized = reply.normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
      expect(maskModelReplyOverlaps(reply)).toHaveLength(normalized.length);
    }
  });
});

describe("classifyModelReply", () => {
  test.each(ORDINARY_REPLIES)("an ordinary reply is no longer replaced: %s", (reply, term) => {
    // Control: the strict scan really matches this sentence, through the term named here.
    const strict = classifyInput(reply, "ko");
    expect(strict.zone).toBe("red");
    expect(strict.matched).toContain(term);
    expect(hasCrisisRiskContext(reply)).toBe(false);
    expect(classifyModelReply(reply, "ko", ADULT).zone).not.toBe("red");
  });

  test.each(STILL_REPLACED)("a crisis term standing on its own still replaces the reply: %s", (reply) => {
    const result = classifyModelReply(reply, "ko", ADULT);
    expect(result.zone).toBe("red");
    expect(result.categories).toEqual(["crisis"]);
    expect(result.crisisRouting?.number).toBe("109");
  });

  test.each(RISK_CONTEXT_NEXT_TO_A_LISTED_WORD)("risk context left in the reply keeps the strict answer: %s", (reply) => {
    expect(classifyModelReply(reply, "ko", ADULT)).toEqual(classifyInput(reply, "ko", { minor: false }));
    expect(classifyModelReply(reply, "ko", ADULT).zone).toBe("red");
  });

  it("reports only the terms that still stand after masking", () => {
    const result = classifyModelReply("더 이상 살펴볼 것도 없고 가족에게 짐이 되는 것 같다고 하셨죠.", "ko", ADULT);
    expect(result.zone).toBe("red");
    expect(result.matched).toEqual(["짐이 되"]);
  });

  test.each(ORDINARY_REPLIES)("the overlaps are off for a minor (D1): %s", (reply) => {
    const minor = { minor: true, benignOverlaps: true } as const;
    expect(classifyModelReply(reply, "ko", minor)).toEqual(classifyInput(reply, "ko", { minor: true }));
    expect(classifyModelReply(reply, "ko", minor).crisisRouting?.number).toBe("1388");
  });

  test.each(ORDINARY_REPLIES)("unknown age is treated as a minor: %s", (reply) => {
    expect(classifyModelReply(reply, "ko", { benignOverlaps: true })).toEqual(classifyInput(reply, "ko"));
    expect(classifyModelReply(reply, "ko", { benignOverlaps: true }).zone).toBe("red");
  });

  test.each(ORDINARY_REPLIES)("the overlaps are off unless the caller allows them: %s", (reply) => {
    const strict = classifyInput(reply, "ko", { minor: false });
    expect(classifyModelReply(reply, "ko", { minor: false })).toEqual(strict);
    expect(classifyModelReply(reply, "ko", { minor: false, benignOverlaps: false })).toEqual(strict);
    expect(classifyModelReply(reply, "ko").zone).toBe("red");
  });

  it("answers exactly as the strict scan does for text that was not red", () => {
    for (const text of ["오늘은 산책을 20분 해 보세요.", "", "   ", "기록을 세 개 남기셨네요."]) {
      expect(classifyModelReply(text, "ko", ADULT)).toEqual(classifyInput(text, "ko", { minor: false }));
    }
  });

  it("changes nothing for spellings the gate does not match today", () => {
    // These spacing variants are outside the gate's exact terms, before and after this change.
    for (const text of ["더이상 살 이유를 모르겠다고 하셨죠.", "가족에게 짐 이 되는 기분이라고 하셨죠."]) {
      expect(classifyModelReply(text, "ko", ADULT).zone).toBe(classifyInput(text, "ko").zone);
    }
  });
});

describe("what the user wrote is scanned as before", () => {
  test.each(ORDINARY_REPLIES)("the same sentence typed by the user still routes: %s", (text) => {
    expect(classifyInput(text, "ko").zone).toBe("red");
    expect(classifyInput(text, "ko", { minor: false }).zone).toBe("red");
    expect(classifyInputAnyLocale(text, "ko").zone).toBe("red");
    expect(classifyInputAnyLocale(text, "en").zone).toBe("red");
  });

  it("classifyInput takes no option that turns the overlaps on", () => {
    const sneaky = { minor: false, benignOverlaps: true } as { minor: boolean };
    expect(classifyInput("오늘의 작은 다짐이 되어 줄 거예요.", "ko", sneaky).zone).toBe("red");
  });
});

describe("the exported risk-context test", () => {
  it("is the one the existing exceptions sit behind", () => {
    expect(hasCrisisRiskContext("삶을 포기하겠다는 말")).toBe(true);
    expect(hasCrisisRiskContext("유서")).toBe(true);
    expect(hasCrisisRiskContext("I have a plan")).toBe(true);
    expect(hasCrisisRiskContext("오늘의 작은 다짐")).toBe(false);
  });
});

describe("the fixed numbers (D3)", () => {
  it("number every Korean gate term 1 to 19, in the gate's own order", () => {
    expect(Object.keys(KO_CRISIS_TERM_CODES)).toEqual([...CRISIS_TERMS.ko]);
    expect(Object.values(KO_CRISIS_TERM_CODES)).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));
  });

  it("turn matched terms into ascending category entries and nothing else", () => {
    expect(modelReplyTermCategories(["짐이 되", "유서"])).toEqual(["crisis_term:13", "crisis_term:15"]);
    expect(modelReplyTermCategories(["유서", "유서"])).toEqual(["crisis_term:13"]);
    expect(modelReplyTermCategories([])).toEqual([]);
  });

  it("give no entry to anything that is not a numbered Korean term", () => {
    expect(modelReplyTermCategories(["suicide", "want to die"])).toEqual([]);
    expect(modelReplyTermCategories(["constructor", "toString", "__proto__", "0", "20", "다짐이 되"])).toEqual([]);
  });

  it("carry no text: every entry is the prefix and a number from 1 to 19", () => {
    for (const entry of modelReplyTermCategories([...CRISIS_TERMS.ko])) {
      expect(entry).toMatch(/^crisis_term:(?:[1-9]|1[0-9])$/);
    }
    expect(modelReplyTermCategories([...CRISIS_TERMS.ko])).toHaveLength(19);
  });
});
