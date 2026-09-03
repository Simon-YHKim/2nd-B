// 이 사람에게 **해당되는 자리**가 무엇인가.
//
// ⚠ 2026-08-24 에 역할이 바뀌었다. 예전 이 파일은 나이에서 **시기 목록 자체를
// 만들었다**(스물다섯 4개 · 마흔여섯 6개, 사람마다 칸 수가 달랐다). 이제 자리는
// **별 일곱으로 고정**이다 — 별자리는 모양이 있어야 하고, 칸이 사람마다 늘었다
// 줄었다 하면 그건 별자리가 아니다.
//
// 그래서 여기가 하는 일은 하나로 좁아졌다: **아직 살지 않은 자리를 가려낸다.**
// 스물다섯 살에게 "30대 이후"는 지어내라는 말이므로 들어가지 못하게 한다.
// 별은 그대로 있되 어둡고 잠긴다 — 없애지 않는 이유는, 앞으로 살 시간이
// 별자리에 보이는 편이 정직하기 때문이다.
//
// 주제 별(직장·지금)은 나이와 무관하므로 **언제나 해당된다.**

import { SEVEN_STARS, isUnlived, type SevenStarId } from "../persona/seven-stars";
import { LIFE_PERIODS, type LifePeriod } from "./probe";

const LEGACY_PERIODS: Readonly<Record<string, LifePeriod>> = {
  childhood: "infancy",
  teens: "school",
  "20s": "twenties",
  thirties: "later",
  forties: "later",
  fifties: "later",
  sixties: "later",
  seventies: "later",
  current: "now",
};

function firstPeriodParam(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

function canonicalPeriod(value: string): LifePeriod | null {
  if ((LIFE_PERIODS as readonly string[]).includes(value)) return value as LifePeriod;
  return LEGACY_PERIODS[value] ?? null;
}

export type InterviewRoutePeriodResolution =
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "locked"; period: LifePeriod }
  | { kind: "ok"; period: LifePeriod };

/** 나이에 상관없이 열려 있는 자리 + 이미 살아온 자리. 순서는 별 순서 그대로. */
export function livedPeriods(age: number | null): LifePeriod[] {
  const out: LifePeriod[] = [];
  for (const star of SEVEN_STARS) {
    if (star.period === null) continue; // 프로필 — 인터뷰가 없다
    if (isUnlived(star.id, age)) continue; // 아직 안 온 시기
    out.push(star.period);
  }
  return out;
}

/** 아직 살지 않아 잠긴 별들. 화면이 어둡게 그리고 눌러도 안 열리게 한다. */
export function lockedStars(age: number | null): SevenStarId[] {
  return SEVEN_STARS.filter((s) => isUnlived(s.id, age)).map((s) => s.id);
}

/**
 * 인터뷰 라우트가 받은 값을 정본 시기로 해석하고 나이 잠금까지 한 번에 판정한다.
 *
 * 누락·오류를 `now` 로 바꾸지 않는다. 어느 시기인지 모르는 요청은 선택 화면으로,
 * 아직 살지 않은 시기는 이유를 밝히는 잠금 화면으로 보내야 하기 때문이다.
 * `age === null` 은 다른 별 화면과 같은 fail-open 정책을 따른다(`isUnlived`).
 */
export function resolveInterviewRoutePeriod(
  raw: string | string[] | undefined,
  age: number | null,
): InterviewRoutePeriodResolution {
  const value = firstPeriodParam(raw);
  if (typeof value !== "string" || value.length === 0) return { kind: "missing" };

  const period = canonicalPeriod(value);
  if (period === null) return { kind: "invalid" };
  if (isUnlived(period, age)) return { kind: "locked", period };
  return { kind: "ok", period };
}

/**
 * 라우트 파라미터로 온 문자열을 자리로 해석한다.
 *
 * 옛 링크(`?period=teens|20s|childhood|thirties|current`)가 기록·북마크에 남아
 * 있으므로 새 자리로 옮겨준다. 모르는 값은 조용히 `now` 로 떨어진다 -- 지금은
 * 누구에게나 열려 있는 자리라 안전한 기본값이다. 새 화면 라우팅은 이 호환 함수가
 * 아니라 `resolveInterviewRoutePeriod` 를 써서 누락·오류를 구분한다.
 */
export function parsePeriodParam(raw: string | string[] | undefined): LifePeriod {
  const value = firstPeriodParam(raw);
  if (typeof value !== "string") return "now";
  return canonicalPeriod(value) ?? "now";
}
