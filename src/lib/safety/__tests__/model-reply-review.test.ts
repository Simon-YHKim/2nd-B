import { classifyInputAnyLocale } from "../classifier";
import { MODEL_REPLY_BENIGN_OVERLAPS } from "../model-reply-scan";
import { isClearModelReplyVerdict, isValidModelReplyVerdict, MODEL_REPLY_REWORDINGS, prepareModelReplyReview, rewordModelReplyOverlaps } from "../model-reply-review";
import corpus from "../eval/model-reply-overlap-corpus.json";

const adult = { minor: false, benignOverlaps: true };

test("a valid conservative verdict is distinct from a malformed response", () => {
  expect(isValidModelReplyVerdict({ zone: "red", confidence: 0.2, triggers: [] })).toBe(true);
  expect(isValidModelReplyVerdict({ zone: "yellow", confidence: 1, triggers: [] })).toBe(true);
  expect(isValidModelReplyVerdict({ zone: "red" })).toBe(false);
  expect(isValidModelReplyVerdict({ zone: "unknown", confidence: 1, triggers: [] })).toBe(false);
  expect(isValidModelReplyVerdict({ zone: "green", confidence: 1.001, triggers: [] })).toBe(false);
});

test("the measured set has 50 crisis and 50 ordinary candidates, with strict controls kept separately", () => {
  expect(corpus.red).toHaveLength(50);
  expect(corpus.normal).toHaveLength(50);
  expect(new Set([...corpus.red, ...corpus.normal]).size).toBe(100);
  for (const reply of [...corpus.red, ...corpus.normal]) {
    for (const locale of ["en", "ko"] as const) {
      expect(classifyInputAnyLocale(reply, locale, { minor: false }).zone).toBe("red");
      expect(prepareModelReplyReview(reply, locale, adult)).not.toBeNull();
      expect(prepareModelReplyReview(reply, locale, { minor: true, benignOverlaps: true })).toBeNull();
    }
  }
  expect(corpus.strictControls).toHaveLength(16);
  for (const control of corpus.strictControls) {
    expect(prepareModelReplyReview(control.text, "ko", adult)).toBeNull();
  }
});

test("the four fixed substitutions preserve the original and cover only the approved list", () => {
  expect(MODEL_REPLY_REWORDINGS.map(([from]) => from)).toEqual(MODEL_REPLY_BENIGN_OVERLAPS);
  expect(MODEL_REPLY_REWORDINGS.map(([, to]) => to)).toEqual(["결심이 되", "마음 자세가 되", "몸 자세가 되", "더는 살펴"]);
  const reply = "작은 다짐이 되어 줄 거예요. 더 이상 살펴보지 않아도 됩니다.";
  expect(prepareModelReplyReview(reply, "ko", adult)).toBe("작은 결심이 되어 줄 거예요. 더는 살펴보지 않아도 됩니다.");
  expect(classifyInputAnyLocale(reply, "ko").zone).toBe("red");
});

test.each(["마지막", "마 지 막", "마\n지\t막"])("the entire reply excludes %s even in ordinary context", (last) => {
  expect(prepareModelReplyReview(`작은 다짐이 되어 줍니다. ${last} 항목을 읽어 보세요.`, "ko", adult)).toBeNull();
});

test.each([
  { minor: true, benignOverlaps: true }, { benignOverlaps: true },
  { minor: false }, { minor: false, benignOverlaps: false },
])("requires known adult and explicit conversation eligibility: %j", (options) => {
  expect(prepareModelReplyReview("작은 다짐이 되어 줄 거예요.", "ko", options)).toBeNull();
});

test.each([
  "다짐이되어 줄 거예요. 약을 이미 많이 먹었어",
  "더이상 살펴보지 않아도 돼요. 유서를 썼어",
  "마음가짐이 되어 줍니다. quiero suicidarme",
  "몸가짐이 되어 줍니다. i want to die",
  "작은 다짐이 되어 줍니다. 삶을 포기했어",
])("does not send a remaining crisis marker or risk context: %s", (reply) => {
  expect(prepareModelReplyReview(reply, "ko", adult)).toBeNull();
});

test("joined spellings use the same fixed substitutions", () => {
  expect(rewordModelReplyOverlaps("다짐이되 마음가짐이되 몸가짐이되 더이상살펴"))
    .toBe("결심이 되 마음 자세가 되 몸 자세가 되 더는 살펴");
});

test.each([0.8, 0.99, 1])("accepts complete green confidence %s", (confidence) => {
  expect(isClearModelReplyVerdict({ zone: "green", confidence, triggers: [] })).toBe(true);
});

test.each([
  null, [], {}, { zone: "green" },
  { zone: "yellow", triggers: [], confidence: 1 }, { zone: "red", triggers: [], confidence: 1 },
  { zone: "GREEN", triggers: [], confidence: 1 }, { zone: "green", triggers: [1], confidence: 1 },
  { zone: "green", triggers: [], confidence: 0.799 }, { zone: "green", triggers: [], confidence: 1.001 },
  { zone: "green", triggers: [], confidence: NaN }, { zone: "green", triggers: [], confidence: Infinity },
  { zone: "green", triggers: [], confidence: "1" },
])("fails closed on uncertain or malformed verdict: %j", (verdict) => {
  expect(isClearModelReplyVerdict(verdict)).toBe(false);
});
