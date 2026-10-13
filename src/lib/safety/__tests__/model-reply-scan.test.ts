import { classifyInput, classifyInputAnyLocale } from "../classifier";
import { hasCrisisRiskContext } from "../crisis-context";
import { CRISIS_TERMS } from "../lexicon";
import {
  KO_CRISIS_TERM_CODES,
  MODEL_REPLY_BENIGN_OVERLAPS,
  checkModelReplyOverlaps,
  gateTermsLeft,
  maskModelReplyOverlaps,
  modelReplyTermCategories,
  replySwapCategories,
  CRISIS_EVENT_CATEGORY_LIMIT,
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

// Real crisis replies the strict scan catches ONLY through a listed word's letters. A word list
// cannot tell these from the ordinary replies above, which is why nothing here decides green.
const CAUGHT_ONLY_BY_A_LISTED_WORD: string[] = [
  "내일이면 나는 이 세상에 없을 거라는 마지막 다짐이 되었어.",
  "내일이면 나는 이 세상에 없을 거라는 마음가짐이 되었어.",
  "내일이면 나는 이 세상에 없을 사람의 몸가짐이 되었어.",
  "내일이면 나는 이 세상에 없을 테니 더 이상 살펴볼 필요 없어.",
];

// A listed word next to a sentence one of the whole-message exceptions would fit once the listed
// word is blanked. The bare term test sees the other gate term, so these are not candidates.
const A_LISTED_WORD_NEXT_TO_ANOTHER_GATE_TERM: string[] = [
  "다짐이 되 자살할 생각은 없어",
  "다짐이 되 숙제를 끝내고 싶어",
  "마음가짐이 되 자해 안 해",
  "더 이상 살펴 일을 끝낼 거야",
  "몸가짐이 되 i want to die",
];

describe("checkModelReplyOverlaps", () => {
  test.each(ORDINARY_REPLIES)("an ordinary reply is a candidate, and its strict answer stays red: %s", (reply, term) => {
    const check = checkModelReplyOverlaps(reply, "ko", ADULT);
    expect(check.candidate).toBe(true);
    expect(check.strict).toEqual(classifyInput(reply, "ko", { minor: false }));
    expect(check.strict.zone).toBe("red");
    expect(check.strict.matched).toContain(term);
    expect(hasCrisisRiskContext(reply)).toBe(false);
  });

  test.each(CAUGHT_ONLY_BY_A_LISTED_WORD)("a candidate is not a verdict, the strict answer of a real crisis reply is untouched: %s", (reply) => {
    const check = checkModelReplyOverlaps(reply, "ko", ADULT);
    expect(check.strict).toEqual(classifyInput(reply, "ko", { minor: false }));
    expect(check.strict.zone).toBe("red");
    expect(check.strict.crisisRouting?.number).toBe("109");
  });

  test.each(STILL_REPLACED)("a gate term standing on its own is never a candidate: %s", (reply) => {
    const check = checkModelReplyOverlaps(reply, "ko", ADULT);
    expect(check.candidate).toBe(false);
    expect(check.strict).toEqual(classifyInput(reply, "ko", { minor: false }));
    expect(check.strict.zone).toBe("red");
  });

  test.each(RISK_CONTEXT_NEXT_TO_A_LISTED_WORD)("risk context left in the reply is never a candidate: %s", (reply) => {
    const check = checkModelReplyOverlaps(reply, "ko", ADULT);
    expect(check.candidate).toBe(false);
    expect(check.strict).toEqual(classifyInput(reply, "ko", { minor: false }));
    expect(check.strict.zone).toBe("red");
  });

  test.each(A_LISTED_WORD_NEXT_TO_ANOTHER_GATE_TERM)("blanking a listed word never makes a whole-message exception fit: %s", (reply) => {
    const check = checkModelReplyOverlaps(reply, "ko", ADULT);
    expect(check.candidate).toBe(false);
    expect(check.strict).toEqual(classifyInput(reply, "ko", { minor: false }));
    expect(gateTermsLeft(maskModelReplyOverlaps(reply)).length).toBeGreaterThan(0);
  });

  it("never alters the strict answer, whatever the options", () => {
    const texts = [...ORDINARY_REPLIES.map(([reply]) => reply), ...STILL_REPLACED, ...CAUGHT_ONLY_BY_A_LISTED_WORD, "오늘은 산책을 20분 해 보세요.", ""];
    for (const text of texts) {
      for (const opts of [ADULT, { minor: true, benignOverlaps: true }, { benignOverlaps: true }, { minor: false }, {}] as const) {
        expect(checkModelReplyOverlaps(text, "ko", opts).strict).toEqual(classifyInput(text, "ko", { minor: opts.minor }));
      }
    }
  });

  test.each(ORDINARY_REPLIES)("no candidate for a minor (D1): %s", (reply) => {
    const check = checkModelReplyOverlaps(reply, "ko", { minor: true, benignOverlaps: true });
    expect(check.candidate).toBe(false);
    expect(check.strict.crisisRouting?.number).toBe("1388");
  });

  test.each(ORDINARY_REPLIES)("unknown age is treated as a minor: %s", (reply) => {
    expect(checkModelReplyOverlaps(reply, "ko", { benignOverlaps: true }).candidate).toBe(false);
  });

  test.each(ORDINARY_REPLIES)("no candidate unless the caller allows the overlaps: %s", (reply) => {
    expect(checkModelReplyOverlaps(reply, "ko", { minor: false }).candidate).toBe(false);
    expect(checkModelReplyOverlaps(reply, "ko", { minor: false, benignOverlaps: false }).candidate).toBe(false);
    expect(checkModelReplyOverlaps(reply, "ko").candidate).toBe(false);
  });

  it("no candidate for text that was not red", () => {
    for (const text of ["오늘은 산책을 20분 해 보세요.", "", "   ", "기록을 세 개 남기셨네요."]) {
      expect(checkModelReplyOverlaps(text, "ko", ADULT).candidate).toBe(false);
    }
  });

  it("changes nothing for spellings the gate does not match today", () => {
    // These spacing variants are outside the gate's exact terms, before and after this change.
    for (const text of ["더이상 살 이유를 모르겠다고 하셨죠.", "가족에게 짐 이 되는 기분이라고 하셨죠."]) {
      const check = checkModelReplyOverlaps(text, "ko", ADULT);
      expect(check.strict).toEqual(classifyInput(text, "ko", { minor: false }));
      expect(check.candidate).toBe(false);
    }
  });
});

describe("gateTermsLeft", () => {
  it("is the bare term test of both languages, with no whole-message exception", () => {
    expect(gateTermsLeft("자살할 생각은 없어")).toEqual(["자살"]);
    expect(gateTermsLeft("숙제를 끝내고 싶어")).toEqual(["끝내고 싶"]);
    expect(gateTermsLeft("i want to die")).toEqual(["want to die", "i want to die"]);
    expect(gateTermsLeft("the wantedtodie file")).toEqual([]);
    expect(gateTermsLeft("오늘의 작은       어 줄 거예요.")).toEqual([]);
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

describe("replySwapCategories", () => {
  it("is what the classifier reported, the marker, then the numbers", () => {
    expect(replySwapCategories(["lexicon_match"], ["짐이 되"])).toEqual(["lexicon_match", "output_swap", "crisis_term:15"]);
    expect(replySwapCategories([], [])).toEqual(["output_swap"]);
    expect(replySwapCategories(["active_ideation_no_method"], [])).toEqual(["active_ideation_no_method", "output_swap"]);
  });

  it("gives the same list for the same reply, whatever order the terms were found in", () => {
    const a = replySwapCategories(["lexicon_match"], ["유서", "자살"]);
    const b = replySwapCategories(["lexicon_match"], ["자살", "유서"]);
    expect(a).toEqual(["lexicon_match", "output_swap", "crisis_term:1", "crisis_term:13"]);
    expect(b).toEqual(a);
  });

  it("drops duplicates, including a marker the classifier already reported", () => {
    expect(replySwapCategories(["lexicon_match", "lexicon_match", "output_swap"], ["자살", "자살"])).toEqual([
      "lexicon_match",
      "output_swap",
      "crisis_term:1",
    ]);
  });

  it("never passes the server's limit, and the numbers are what gives way", () => {
    const everyTerm = [...CRISIS_TERMS.ko];
    const list = replySwapCategories(["lexicon_match"], everyTerm);
    expect(list).toHaveLength(CRISIS_EVENT_CATEGORY_LIMIT);
    expect(list.slice(0, 2)).toEqual(["lexicon_match", "output_swap"]);
    expect(list.slice(2)).toEqual(Array.from({ length: 14 }, (_, i) => `crisis_term:${i + 1}`));
  });

  it("keeps the marker even when the classifier alone reports more than the limit", () => {
    const many = Array.from({ length: 30 }, (_, i) => `reported_${i}`);
    const list = replySwapCategories(many, ["자살"]);
    expect(list).toHaveLength(CRISIS_EVENT_CATEGORY_LIMIT);
    expect(list[CRISIS_EVENT_CATEGORY_LIMIT - 1]).toBe("output_swap");
    expect(list.slice(0, 15)).toEqual(many.slice(0, 15));
  });

  it("every entry is short enough for the server (1 to 64 characters) and carries no text of the reply", () => {
    for (const entry of replySwapCategories(["lexicon_match"], [...CRISIS_TERMS.ko])) {
      expect(entry.length).toBeGreaterThan(0);
      expect(entry.length).toBeLessThanOrEqual(64);
      for (const term of CRISIS_TERMS.ko) expect(entry).not.toContain(term);
    }
  });
});
