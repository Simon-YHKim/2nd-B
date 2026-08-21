// 짧은 자기보고 3종 — 가치관 · 강점 · 동기 (Simon 2026-08-18, D5 후속).
//
// ## 왜 이 파일이 생겼나
//
// "심리검사를 실제 실행할 수 있는 수준으로 완벽하게" 라는 요청에 맞춰 상태를
// 세어 봤더니, BFI-44(44문항)·IPIP-NEO(120)·RLSS(6)·MBTI(32)에는 테스트가 있고
// **이 셋만 0개**였다. 화면에는 이미 연결돼 있으니 "안 돌아가는" 상태는 아니고,
// **틀려도 아무도 모르는** 상태였다. 채점은 조용히 틀리는 종류의 코드다.
//
// ## 무엇을 지키나
//
// 세 모듈은 같은 모양을 공유한다(values → strengths → motivation 순으로 서로를
// 본떠 만들었다). 그래서 같은 성질을 같은 방식으로 검사한다:
//
//   1) 문항이 실제로 답할 수 있는 문장인가 (양 로케일)
//   2) 채점이 정규화 규칙을 지키는가 (1~6 → 0~100)
//   3) 쓰레기 입력이 점수를 만들지 않는가
//   4) **신뢰도가 1.0 에 닿지 않는가** — 이게 가장 중요하다
//
// (4)를 따로 두는 이유: 이 셋은 검증된 독점 도구가 아니라 짧은 자기보고다.
// 각 모듈 헤더가 그렇게 적고 있고, 열두 문항으로 여섯 방향을 재면서 "확신 100%"
// 를 표시하면 그 정직성이 화면에서 무너진다. 정직한 밝기 규칙과 같은 얘기다.
import {
  MOTIVATION_ITEMS,
  scoreMotivation,
  type MotivationResponses,
} from "../motivation-survey";
import { STRENGTH_ITEMS, scoreStrengths, type StrengthsResponses } from "../strengths-survey";
import { VALUE_ITEMS, scoreValues, type ValuesResponses } from "../values-survey";

/** 세 설문의 공통 모양. 같은 검사를 세 번 쓰지 않기 위해 표로 묶는다. */
const SURVEYS = [
  { name: "가치관", items: VALUE_ITEMS, score: (r: ValuesResponses) => scoreValues(r) },
  { name: "강점", items: STRENGTH_ITEMS, score: (r: StrengthsResponses) => scoreStrengths(r) },
  { name: "동기", items: MOTIVATION_ITEMS, score: (r: MotivationResponses) => scoreMotivation(r) },
] as const;

function allAt(items: readonly { id: number }[], value: number): Record<number, number> {
  const out: Record<number, number> = {};
  for (const it of items) out[it.id] = value;
  return out;
}

describe.each(SURVEYS)("$name 설문", ({ items, score }) => {
  it("문항이 비어 있지 않다 (양 로케일)", () => {
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.ko.trim().length).toBeGreaterThan(4);
      expect(item.en.trim().length).toBeGreaterThan(4);
      // 부제는 채점에 영향이 없지만 비어 있으면 화면이 허전해진다.
      expect(item.subtitleKo.trim().length).toBeGreaterThan(0);
      expect(item.subtitleEn.trim().length).toBeGreaterThan(0);
    }
  });

  it("문항 번호가 겹치지 않는다", () => {
    // 겹치면 한 응답이 두 항목에 들어가 점수가 조용히 부풀거나 사라진다.
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("무응답이면 아무것도 완료되지 않는다", () => {
    const r = score({});
    expect(r.answered).toBe(0);
    expect(r.complete).toBe(false);
  });

  it("전부 답하면 완료로 잡힌다", () => {
    const r = score(allAt(items, 4));
    expect(r.answered).toBe(items.length);
    expect(r.complete).toBe(true);
  });

  it("범위 밖 응답은 세지 않는다", () => {
    // 0·7·NaN·문자열이 점수에 들어가면 척도 자체가 무의미해진다.
    const bad: Record<number, number> = {};
    for (const it of items) bad[it.id] = 0;
    expect(score(bad).answered).toBe(0);

    const over: Record<number, number> = {};
    for (const it of items) over[it.id] = 7;
    expect(score(over).answered).toBe(0);

    const nan: Record<number, number> = {};
    for (const it of items) nan[it.id] = Number.NaN;
    expect(score(nan).answered).toBe(0);
  });

  it("최저·최고 응답이 0 과 100 으로 정규화된다", () => {
    const low = score(allAt(items, 1));
    const high = score(allAt(items, 6));
    const lowVals = scoreValuesOf(low);
    const highVals = scoreValuesOf(high);
    expect(Math.max(...lowVals)).toBe(0);
    expect(Math.min(...highVals)).toBe(100);
  });

  it("신뢰도가 1.0 에 닿지 않는다", () => {
    // 짧은 자기보고다. 다 채워도 "확신함" 이 되면 안 된다 - 각 모듈 헤더가
    // 스스로 "검증된 독점 도구가 아니다" 라고 적고 있고, 화면이 그와 다른
    // 인상을 주면 그 문장이 무의미해진다.
    const full = score(allAt(items, 6));
    expect(full.confidence).toBeGreaterThan(0);
    expect(full.confidence).toBeLessThan(1);
  });

  it("덜 답할수록 신뢰도가 낮다", () => {
    const half: Record<number, number> = {};
    items.slice(0, Math.max(1, Math.floor(items.length / 2))).forEach((it) => {
      half[it.id] = 5;
    });
    expect(score(half).confidence).toBeLessThan(score(allAt(items, 5)).confidence);
  });
});

/** 세 결과 타입이 점수 배열의 키 이름을 각자 다르게 쓴다. 숫자만 뽑는다. */
function scoreValuesOf(result: unknown): number[] {
  const r = result as { scores?: { score: number }[]; needs?: { score: number }[] };
  const rows = r.scores ?? r.needs ?? [];
  return rows.map((x) => x.score);
}
