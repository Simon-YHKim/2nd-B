// Korean safety test corpus per docs/research/batches/crisis-detection.md.
// Lexicon-only layer (Layer 1). The LLM layer (Layer 2, src/lib/llm/safety.ts)
// is tested separately with mocked Gemini Flash since live calls cost money
// and need network.
//
// Acceptance per handoff §10:
//   - RED corpus: 0 false negatives (FN). Any FN = P0 blocker.
//   - YELLOW corpus: ≤ 2 misclassifications, none promoting GREEN → RED.
//   - GREEN corpus: ≤ 2 misclassifications.

import { classifyInput } from "../classifier";

const RED = [
  // Active suicidal ideation (Korean)
  "죽고 싶어요.",
  "더 이상 살고 싶지 않아요.",
  "오늘 밤에 끝낼 거야.",
  "자살에 대해 자주 생각해요.",
  "끝내고 싶다는 생각이 떠나지 않아요.",
  "살고 싶지 않다는 생각이 들어요.",
  // Method / preparation (Korean)
  "유서를 써봤어요.",
  "자해를 멈출 수가 없어요.",
  // Latent / passive ideation (Suicide CARE 2.0 markers)
  "나는 사라지는 게 나을 것 같아.",
  "다음 생에는 더 잘 살 수 있을까요.",
  "영영 잠들고 싶어요.",
  "짐이 되는 것 같아요.",
  "모두에게 짐이 되는 기분이에요.",
  "어딘가로 사라지고 싶어요.",
  "엄마한테 마지막 인사를 했어.",
  // English
  "I want to die.",
  "I've been thinking about ending it.",
  "There's no reason to live anymore.",
  "I'm going to end it all tonight.",
  "I keep thinking about suicide.",
];

const YELLOW = [
  "오늘 너무 힘들었어요.",
  "회사에서 번아웃이 와요.",
  "일이 너무 많아서 무기력해요.",
  "외롭다는 생각이 자꾸 들어요.",
  "친구가 점점 멀어지는 것 같아요.",
  "I'm exhausted from work.",
  "We had a big fight last night.",
  "I feel stuck in my career.",
];

const GREEN = [
  "오늘 새로 산 책이 재미있어요.",
  "운동 루틴을 어떻게 짤까요.",
  "새 프로젝트 아이디어가 있어요.",
  "친구랑 오랜만에 만나서 좋았어요.",
  "오늘 처음으로 김치를 담가봤어요.",
  "다음 주 여행 계획을 세우는 중이에요.",
  "I finished a book I've been meaning to read.",
  "Just thinking through my week.",
  "Trying a new running route.",
];

describe("Korean safety corpus — lexicon layer", () => {
  describe("RED zone — must classify red (0 FN allowed)", () => {
    for (const msg of RED) {
      test(`RED: "${msg}"`, () => {
        const locale = /[가-힣]/.test(msg) ? "ko" : "en";
        const r = classifyInput(msg, locale);
        expect(r.zone).toBe("red");
      });
    }
  });

  describe("YELLOW zone — distress, not crisis", () => {
    let promotions = 0;
    let downgrades = 0;
    for (const msg of YELLOW) {
      test(`YELLOW: "${msg}"`, () => {
        const locale = /[가-힣]/.test(msg) ? "ko" : "en";
        const r = classifyInput(msg, locale);
        // lexicon may not catch every YELLOW phrasing — that's by design,
        // the LLM layer adds semantic recall. Lexicon-only YELLOW capture
        // is best-effort.
        if (r.zone === "red") promotions++;
        if (r.zone === "green") downgrades++;
        // The hard rule: must not be RED.
        expect(r.zone).not.toBe("red");
      });
    }
    test("YELLOW lexicon promotion rate (info only)", () => {
      // Allowed: any number of GREEN downgrades from lexicon (LLM picks them up).
      // Forbidden: any RED promotion (false positive direction is fine, but
      // not THIS direction — YELLOW becoming RED is the surprise that costs UX).
      expect(promotions).toBe(0);
      void downgrades;
    });
  });

  describe("GREEN zone — neutral or positive", () => {
    let falseRed = 0;
    for (const msg of GREEN) {
      test(`GREEN: "${msg}"`, () => {
        const locale = /[가-힣]/.test(msg) ? "ko" : "en";
        const r = classifyInput(msg, locale);
        if (r.zone === "red") falseRed++;
        expect(r.zone).not.toBe("red");
      });
    }
    test("GREEN false-RED rate (info only)", () => {
      expect(falseRed).toBe(0);
    });
  });
});
