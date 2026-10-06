// 로컬 문턱을 옮긴 것이 동작을 바꾸지 않았는가, 그리고 서버가 같은 파일을 읽을 수 있는가 (0220).
//
// `answer-gate.ts` 는 `stuck.ts` 의 isNonAnswer 와 `continuity.ts` 의 answerDisposition ·
// canCreditAnswer 를 옮겨 온 파일이다. openai-proxy 가 판정 원장의 local_gate 를 이 파일로
// 다시 계산하므로 (1) 옮기기 전과 같은 답을 내야 하고 (2) Deno 가 풀 수 없는 import 가 없어야 한다.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  GATE_LAYERS,
  answerLengthBucket,
  canCreditAnswer,
  isNonAnswer,
  localGate,
  type GateLayer,
} from "../answer-gate";
import { canCreditAnswer as viaContinuity, answerDisposition as dispositionViaContinuity } from "../continuity";
import { isNonAnswer as viaStuck } from "../stuck";
import { DRILL_LAYERS } from "../probe";

/** 옮기기 전 `continuity.ts` 의 canCreditAnswer 본문 그대로(오라클). */
function originalCanCredit(text: string, layer: GateLayer, locale: "en" | "ko"): boolean {
  if (dispositionViaContinuity(text, locale) !== "answer") return false;
  const compact = text.replace(/[\s\p{P}\p{S}]+/gu, "").toLowerCase();
  if (/^(네|예|응|아니|아니요|음|어|yes|no|ok|okay|yeah|hmm|sure)$/.test(compact)) return false;
  if (compact.length < 2) return false;
  if (layer === "feeling") return true;
  return compact.length >= (locale === "ko" ? 8 : 14);
}

const CORPUS: readonly [string, "en" | "ko"][] = [
  ["모르겠어요", "ko"],
  ["잘 모르겠는데", "ko"],
  ["네", "ko"],
  ["응.", "ko"],
  ["슬펐어", "ko"],
  ["운동장이요", "ko"],
  ["시험 망쳤어요", "ko"],
  ["나는 혼자다", "ko"],
  ["그날 비가 와서 혼자 운동장에 남아 있었어요", "ko"],
  ["그만할래요", "ko"],
  ["패스", "ko"],
  ["모르겠다는 게 아니라 사실 그때 진짜 무서웠어", "ko"],
  ["ㅋ", "ko"],
  ["I don't know", "en"],
  ["no idea", "en"],
  ["sad", "en"],
  ["the playground", "en"],
  ["I failed the exam that spring", "en"],
  ["ok", "en"],
  ["skip", "en"],
  ["I'd rather not talk about it", "en"],
  ["We moved house when I was nine and I missed my friends", "en"],
  ["x", "en"],
];

describe("answer-gate: 옮긴 문턱은 옮기기 전과 같은 답을 낸다", () => {
  it("층 이름은 probe.ts 의 DRILL_LAYERS 와 같다", () => {
    expect([...GATE_LAYERS]).toEqual([...DRILL_LAYERS]);
  });

  it("예전 이름(stuck · continuity)으로 부르면 같은 함수다", () => {
    expect(viaStuck).toBe(isNonAnswer);
    expect(viaContinuity).toBe(canCreditAnswer);
  });

  it.each(CORPUS)("canCreditAnswer(%p) 가 옮기기 전 본문과 같다", (text, locale) => {
    for (const layer of GATE_LAYERS) {
      expect([layer, canCreditAnswer(text, layer, locale)]).toEqual([layer, originalCanCredit(text, layer, locale)]);
    }
  });

  it.each(CORPUS)("localGate(%p) 의 pass 는 canCreditAnswer 와 정확히 같다", (text, locale) => {
    for (const layer of GATE_LAYERS) {
      expect([layer, localGate(text, layer, locale) === "pass"]).toEqual([layer, canCreditAnswer(text, layer, locale)]);
    }
  });
});

describe("answer-gate: 못 넘은 이유를 가른다 (원장 local_gate)", () => {
  it.each([
    ["모르겠어요", "fact", "ko", "non_answer"],
    ["네", "feeling", "ko", "non_answer"],
    ["그만할래요", "fact", "ko", "non_answer"],
    ["운동장이요", "fact", "ko", "short"],
    ["시험 망쳤어요", "meaning", "ko", "short"],
    ["슬펐어", "feeling", "ko", "pass"],
    ["그날 비가 와서 혼자 남아 있었어요", "fact", "ko", "pass"],
    ["the playground", "fact", "en", "short"],
    ["sad", "feeling", "en", "pass"],
    ["I don't know", "belief", "en", "non_answer"],
  ] as const)("%p · %p · %p -> %p", (text, layer, locale, expected) => {
    expect(localGate(text, layer, locale)).toBe(expected);
  });

  it("겨냥한 층이 없으면 감정층이 아닌 층의 문턱을 쓴다", () => {
    expect(localGate("슬펐어", null, "ko")).toBe("short");
    expect(localGate("그날 비가 와서 혼자 남아 있었어요", null, "ko")).toBe("pass");
  });
});

describe("answer-gate: 길이 구간 (원장 answer_len_bucket)", () => {
  it.each([
    ["", 0], ["abcd", 0], ["abcde", 1], ["abcdefg", 1], ["abcdefgh", 2],
    ["abcdefghijklm", 2], ["abcdefghijklmn", 3], ["시험 망쳤어요", 1], ["  a b  c d e!!", 1],
  ] as const)("%p -> %p", (text, bucket) => {
    expect(answerLengthBucket(text)).toBe(bucket);
  });
});

describe("Deno 가 읽는 두 파일에는 import 가 없다", () => {
  // openai-proxy 는 `../../../src/lib/interview/<file>.ts` 로 이 파일들을 읽는다. Deno 는
  // 확장자 없는 상대 import 를 풀지 못해 배포가 깨진다(lexicon.ts · untrusted.ts 와 같은 규율).
  it.each(["answer-gate.ts", "verdict-ledger.ts"])("%s", (file) => {
    const src = readFileSync(join(__dirname, "..", file), "utf8");
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toMatch(/\brequire\(/);
    expect(src).not.toMatch(/^\s*export\s[^;]*\sfrom\s/m);
  });
});
