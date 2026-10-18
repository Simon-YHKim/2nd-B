import { classifyInput, classifyInputAnyLocale } from "../classifier";
import { hasCrisisRiskContext } from "../crisis-context";
import { CRISIS_EVENT_CATEGORY_LIMIT, recordableCrisisCategories } from "../crisis-event-categories";
import { ADDITIONAL_CRISIS_PHRASES, CRISIS_TERMS } from "../lexicon";
import {
  KO_CRISIS_TERM_CODES,
  MODEL_REPLY_BENIGN_OVERLAPS,
  checkModelReplyOverlaps,
  gateTermsLeft,
  maskModelReplyOverlaps,
  modelReplyTermCategories,
  replySwapCategories,
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
  test.each(Object.values(ADDITIONAL_CRISIS_PHRASES).flat())("additional-language red cannot become a closed-overlap candidate: %s", (phrase) => {
    for (const locale of ["en", "ko"] as const) {
      for (const variant of [phrase, phrase.toUpperCase().normalize("NFD").replace(/ /g, "\n\u00a0")]) {
        for (const reply of [variant, `오늘의 작은 다짐이 되어 줄 거예요. ${variant}`]) {
          const check = checkModelReplyOverlaps(reply, locale, ADULT);
          expect([check.strict.zone, check.candidate]).toEqual(["red", false]);
          expect(gateTermsLeft(maskModelReplyOverlaps(reply))).toContain(phrase);
        }
      }
    }
  });

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

// Review r1 on #2514: the strict answer read only the screen's language, so a Korean crisis reply on
// an English screen came back green and the two-language check after it never ran.
describe("the strict answer reads both languages whatever the screen's", () => {
  test.each([
    ["다 끝내고싶다는 마음이 드시는군요.", "en"],
    ["다 끝내고 싶다는 마음이 드시는군요.", "en"],
    ["죽고 싶다는 생각이 계속 드는군요.", "en"],
    ["You said you keep thinking you want to die.", "ko"],
  ] as const)("%s on the %s screen is red and never a candidate", (reply, locale) => {
    const check = checkModelReplyOverlaps(reply, locale, ADULT);
    expect(check.strict).toEqual(classifyInputAnyLocale(reply, locale, { minor: false }));
    expect([check.strict.zone, check.candidate]).toEqual(["red", false]);
  });

  test.each(ORDINARY_REPLIES)("an ordinary Korean reply on the English screen gets the Korean screen's answer: %s", (reply) => {
    const onEnglish = checkModelReplyOverlaps(reply, "en", ADULT);
    expect([onEnglish.strict.zone, onEnglish.candidate]).toEqual(["red", true]);
    expect(checkModelReplyOverlaps(reply, "en", { minor: true, benignOverlaps: true }).candidate).toBe(false);
  });
});

// Q-261014-90: the gate also matches a spaced term typed without its spaces, so each listed word is
// blanked in its joined spelling too. Same word, same answer, however it is spaced.
describe("a listed word typed without its space", () => {
  const joined = (reply: string): string => {
    let out = reply;
    for (const overlap of MODEL_REPLY_BENIGN_OVERLAPS) out = out.split(overlap).join(overlap.replace(/ /g, ""));
    return out;
  };

  test.each(ORDINARY_REPLIES)("spaced and joined get the same candidate answer: %s", (reply) => {
    const together = joined(reply);
    expect(together).not.toBe(reply);
    for (const text of [reply, together]) {
      const check = checkModelReplyOverlaps(text, "ko", ADULT);
      expect([text, check.strict.zone, check.candidate]).toEqual([text, "red", true]);
      expect(checkModelReplyOverlaps(text, "ko", { minor: true, benignOverlaps: true }).candidate).toBe(false);
    }
  });

  it("blanks only the listed word: a joined crisis term elsewhere in the reply still stops it", () => {
    for (const reply of ["오늘의 작은 다짐이되어 줄 거예요. 다 끝내고싶어", "더이상살펴보지 않아도 됩니다. 사라지고싶다는 말씀도요."]) {
      const check = checkModelReplyOverlaps(reply, "ko", ADULT);
      expect([reply, check.strict.zone, check.candidate]).toEqual([reply, "red", false]);
    }
  });

  it("the list and its four words are unchanged", () => {
    expect(MODEL_REPLY_BENIGN_OVERLAPS).toEqual(["다짐이 되", "마음가짐이 되", "몸가짐이 되", "더 이상 살펴"]);
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
  it("number every Korean gate term 1 to 21, in the gate's own order", () => {
    expect(Object.keys(KO_CRISIS_TERM_CODES)).toEqual([...CRISIS_TERMS.ko]);
    expect(Object.values(KO_CRISIS_TERM_CODES)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
    // Q-261015-80 appended two terms; the first nineteen kept their numbers.
    expect(KO_CRISIS_TERM_CODES["영영 잠들고 싶"]).toBe(19);
    expect(KO_CRISIS_TERM_CODES["끝내 버리고 싶"]).toBe(20);
    expect(KO_CRISIS_TERM_CODES["끝내 버릴"]).toBe(21);
  });

  it("write 20 and 21 too: 0260 widened the record's closed list to 21 (applied in production 2026-10-17)", () => {
    expect(modelReplyTermCategories(["끝내 버리고 싶", "끝내 버릴"])).toEqual(["crisis_term:20", "crisis_term:21"]);
    expect(modelReplyTermCategories(["끝내 버릴", "유서"])).toEqual(["crisis_term:13", "crisis_term:21"]);
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

  it("carry no text: every entry is the prefix and a number from 1 to 21", () => {
    for (const entry of modelReplyTermCategories([...CRISIS_TERMS.ko])) {
      expect(entry).toMatch(/^crisis_term:(?:[1-9]|1[0-9]|2[01])$/);
    }
    // 21 terms, all 21 recordable since 0260.
    expect(modelReplyTermCategories([...CRISIS_TERMS.ko])).toHaveLength(21);
  });

  it("write only numbers the record's closed list keeps, never one it turns into unlisted", () => {
    for (const entry of modelReplyTermCategories([...CRISIS_TERMS.ko])) {
      expect(recordableCrisisCategories(["output_swap", entry])).toEqual(["output_swap", entry]);
    }
  });

  // Review round one (PR #2610): 20 and 21 are recordable now, but still only on a replaced AI reply.
  it("keep no term number and no unlisted stand-in on a record of the user's own words (0254)", () => {
    expect(recordableCrisisCategories(["input_red", "crisis_term:20", "crisis_term:21", "free text"])).toEqual(["input_red"]);
    expect(recordableCrisisCategories(["interview_input_red", "crisis_term:21"])).toEqual(["interview_input_red"]);
  });
});

describe("replySwapCategories", () => {
  it("is what the classifier reported, the marker, then the numbers of the Korean terms in the reply", () => {
    expect(replySwapCategories(["lexicon_match"], "가족에게 짐이 되는 사람이라는 말은 사실이 아니에요.", false)).toEqual([
      "lexicon_match",
      "output_swap",
      "crisis_term:15",
    ]);
    expect(replySwapCategories([], "오늘은 산책을 20분 해 보세요.", false)).toEqual(["output_swap"]);
    expect(replySwapCategories(["active_ideation_no_method"], "you should end your life", false)).toEqual([
      "active_ideation_no_method",
      "output_swap",
    ]);
  });

  it("reads the Korean terms whatever the screen's language is, and for a minor too", () => {
    const reply = "자살이라는 낱말이 답에 들어갔습니다.";
    expect(replySwapCategories([], reply)).toEqual(["output_swap", "crisis_term:1"]);
    expect(replySwapCategories([], reply, true)).toEqual(["output_swap", "crisis_term:1"]);
    expect(replySwapCategories([], reply, false)).toEqual(["output_swap", "crisis_term:1"]);
  });

  // Review round one (PR #2610): the emphatic forms go through the real path (the reply is scanned,
  // the matched terms are numbered, cut to the record's room and normalised), not a hand-made list.
  it("records the emphatic forms 끝내 버리고 싶 and 끝내 버릴 as 20 and 21 from the reply itself (0260)", () => {
    expect(replySwapCategories([], "그냥 다 끝내 버리고 싶다는 말이 답에 들어갔습니다.", false)).toEqual([
      "output_swap",
      "crisis_term:20",
    ]);
    expect(replySwapCategories(["lexicon_match"], "오늘 밤 다 끝내 버릴 거라는 문장이 있었습니다.", false)).toEqual([
      "lexicon_match",
      "output_swap",
      "crisis_term:21",
    ]);
  });

  it("keeps all fifteen numbers 7 to 21 with the marker: exactly the record's sixteen entries", () => {
    const terms = Object.entries(KO_CRISIS_TERM_CODES).filter(([, code]) => code >= 7).map(([term]) => term);
    expect(terms).toHaveLength(15);
    const list = replySwapCategories([], terms.join(" / "), false);
    expect(list).toEqual(["output_swap", ...Array.from({ length: 15 }, (_, i) => `crisis_term:${i + 7}`)]);
    expect(list).toHaveLength(CRISIS_EVENT_CATEGORY_LIMIT);
  });

  it("gives the numbers in ascending order", () => {
    expect(replySwapCategories(["lexicon_match"], "유서 이야기와 자살 이야기가 함께 나왔습니다.", false)).toEqual([
      "lexicon_match",
      "output_swap",
      "crisis_term:1",
      "crisis_term:13",
    ]);
  });

  it("records nothing a classifier wrote freely", () => {
    const list = replySwapCategories(["사용자가 짐이 된다고 말함", "The reply tells the user to give up.", "active_ideation_no_method"], "가족에게 짐이 되는 사람", false);
    expect(list).toEqual(["unlisted", "active_ideation_no_method", "output_swap", "crisis_term:15"]);
    expect(JSON.stringify(list)).not.toContain("말함");
    expect(JSON.stringify(list)).not.toContain("give up");
  });

  it("drops duplicates", () => {
    expect(replySwapCategories(["lexicon_match", "lexicon_match"], "자살, 그리고 또 자살", false)).toEqual([
      "lexicon_match",
      "output_swap",
      "crisis_term:1",
    ]);
  });

  // Review round three: a classifier's answer is text a model wrote. It cannot name a source or a number.
  it("takes no marker, source name or term number from the classifier: only this function adds them", () => {
    const spoofed = ["crisis_term:7", "output_swap", "proxy_input_red", "input_red", "passive_ideation"];
    // The reply holds one term (number 15). Number 7 and the other source names came from the classifier.
    expect(replySwapCategories(spoofed, "가족에게 짐이 되는 사람", false)).toEqual([
      "unlisted",
      "passive_ideation",
      "output_swap",
      "crisis_term:15",
    ]);
    // A reply with no Korean term: the classifier's number does not appear at all.
    const none = replySwapCategories(["crisis_term:7"], "you should give up", false);
    expect(none).toEqual(["unlisted", "output_swap"]);
    expect(none.filter((entry) => entry === "output_swap")).toHaveLength(1);
  });

  it("at the limit keeps the marker and the numbers first, and what the classifier reported gives way", () => {
    // Everything a classifier can report: its twelve names and one stand-in for the rest.
    const reported = [
      "passive_ideation", "active_ideation_no_method", "active_ideation_with_method", "intent_no_plan", "intent_with_plan",
      "behavior_past", "behavior_preparation", "behavior_recent", "self_harm_non_suicidal", "crisis", "forbidden_lexicon",
      "lexicon_match", "some free text",
    ];
    // Two terms leave thirteen places: all thirteen fit.
    const twoTerms = replySwapCategories(reported, "유서 이야기와 자살 이야기가 함께 나왔습니다.", false);
    expect(twoTerms).toEqual([...reported.slice(0, 12), "unlisted", "output_swap", "crisis_term:1", "crisis_term:13"]);
    expect(twoTerms).toHaveLength(CRISIS_EVENT_CATEGORY_LIMIT);

    // Four terms leave eleven places: the marker and all four numbers stay, the names give way.
    const fourTerms = replySwapCategories(reported, CRISIS_TERMS.ko.slice(0, 4).join(" / "), false);
    expect(fourTerms).toEqual([
      ...reported.slice(0, 11),
      "output_swap",
      "crisis_term:1",
      "crisis_term:2",
      "crisis_term:3",
      "crisis_term:4",
    ]);
    expect(fourTerms).toHaveLength(CRISIS_EVENT_CATEGORY_LIMIT);
  });

  it("a reply holding every gate term keeps the marker and the fifteen lowest numbers", () => {
    const everyTerm = CRISIS_TERMS.ko.join(" / ");
    const list = replySwapCategories(["lexicon_match", "crisis"], everyTerm, false);
    expect(list).toHaveLength(CRISIS_EVENT_CATEGORY_LIMIT);
    expect(list).toEqual(["output_swap", ...Array.from({ length: 15 }, (_, i) => `crisis_term:${i + 1}`)]);
  });

  it("fifteen terms leave room for nothing but the marker, and fourteen leave one name", () => {
    const fifteen = CRISIS_TERMS.ko.slice(0, 15).join(" / ");
    expect(replySwapCategories(["lexicon_match"], fifteen, false)).toEqual([
      "output_swap",
      ...Array.from({ length: 15 }, (_, i) => `crisis_term:${i + 1}`),
    ]);
    const fourteen = CRISIS_TERMS.ko.slice(0, 14).join(" / ");
    expect(replySwapCategories(["lexicon_match", "crisis"], fourteen, false)).toEqual([
      "lexicon_match",
      "output_swap",
      ...Array.from({ length: 14 }, (_, i) => `crisis_term:${i + 1}`),
    ]);
  });

  it("carries no text of the reply", () => {
    const reply = CRISIS_TERMS.ko.join(" / ");
    for (const entry of replySwapCategories(["lexicon_match"], reply, false)) {
      for (const term of CRISIS_TERMS.ko) expect(entry).not.toContain(term);
    }
  });
});
