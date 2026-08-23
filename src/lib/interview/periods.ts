// 사용자가 **살아온 시기만** 인터뷰 칸으로 만든다 (Simon 결정, 2026-08-24).
//
// 배경. 저장소에 시기 목록이 두 벌 있었고 서로 달랐다.
//
//   - 엔진(`probe.ts`)  : childhood / teens / twenties / thirties / current
//                         2026-05-27 드릴다운 설계 문서와 같은 목록. 시기별 씨앗
//                         질문이 이미 쓰여 있다. 그런데 **40대 이상이 없다.**
//   - 화면(`/audit`)    : 유아기(0–6) / 아동기(7–12) / 청소년기 / 청년기 / 현재
//                         레퍼런스 앱 클론에서 온 타임라인. 씨앗 질문이 없고
//                         **29세~현재 사이가 통째로 빈다.**
//
// 둘 다 고정 목록이라서 같은 병을 앓았다 — 19살에게 30대 칸을 보여주고,
// 46살에게는 30대 다음이 곧장 '지금'이었다. 그래서 목록을 고정하지 않고
// **나이에서 만든다.**
//
// 근거. `docs/research/batches/narrative-identity.md` 의 Age Range Coverage 가
// 0–12(limited) · 13–17 · 18–29(peak) · 30–49 · 50–64 · 65+ 까지 잡는다. 고정
// 5칸은 그 절반에서 끊긴다. 또 같은 문서가 0–12 를 "limited"라고 못박으므로
// 화면 쪽이 그걸 유아기/아동기 **둘로 쪼갠 것은 구인이 감당 못 하는 정밀도**다.
// 그래서 12세 이전은 엔진대로 한 칸으로 둔다.
//
// 규칙 셋.
//   1. 살아 들어간 칸만 만든다.
//   2. 아직 지나는 중인 칸은 **오늘 나이까지 잘라서** 보여준다 (40대 -> 40–45).
//   3. 마지막은 항상 '지금'이다.

import { type LifePeriod } from "./probe";

export interface PeriodSlot {
  id: LifePeriod;
  /** 이 칸이 시작되는 나이. `current` 는 시작이 없다(null). */
  from: number | null;
  /** 이 칸이 끝나는 나이. 아직 지나는 중이면 오늘 나이로 잘린다.
   *  `current` 는 끝이 없다(null). */
  to: number | null;
}

/** 나이 경계. `to` 는 그 나이를 **포함**한다. 순서가 곧 화면 순서다. */
const AGE_BANDS: { id: LifePeriod; from: number; to: number }[] = [
  { id: "childhood", from: 0, to: 11 },
  { id: "teens", from: 12, to: 19 },
  { id: "twenties", from: 20, to: 29 },
  { id: "thirties", from: 30, to: 39 },
  { id: "forties", from: 40, to: 49 },
  { id: "fifties", from: 50, to: 59 },
  { id: "sixties", from: 60, to: 69 },
  { id: "seventies", from: 70, to: 79 },
];

/** 80세 이상은 `seventies` 다음에 새 칸을 만들지 않고 '지금'이 받는다.
 *  칸을 무한히 늘리는 대신 여기서 멈추는 것이 의도다 — `Coverage` 가
 *  `Record<LifePeriod, ...>` 라서 union 이 곧 행렬 폭이 된다. */
export const OLDEST_BAND_CEILING = 79;

/** 나이를 모를 때 쓰는 칸. 가입 하한이 14세라 **누구나 지나온** 둘만 둔다.
 *  살지 않은 시기를 물어보는 쪽이, 지나온 시기를 빼먹는 쪽보다 나쁘다. */
const UNKNOWN_AGE_SLOTS: LifePeriod[] = ["childhood", "teens", "current"];

/**
 * 이 사용자에게 해당되는 시기를 순서대로 준다. 마지막은 항상 `current`.
 *
 * `age` 가 null 이면(프로필 프로브 실패나 birth_date 이상) 안전한 최소 집합으로
 * 떨어진다. 스키마상 `birth_date` 는 NOT NULL 이므로 정상 경로에서는 안 온다.
 */
export function periodsForAge(age: number | null): PeriodSlot[] {
  if (age === null || !Number.isFinite(age) || age < 0) {
    return UNKNOWN_AGE_SLOTS.map((id) => {
      const band = AGE_BANDS.find((b) => b.id === id);
      return band ? { id, from: band.from, to: band.to } : { id, from: null, to: null };
    });
  }
  const slots: PeriodSlot[] = [];
  for (const band of AGE_BANDS) {
    if (age < band.from) break; // 아직 살지 않은 칸 — 여기서부터는 전부 미래다
    slots.push({ id: band.id, from: band.from, to: Math.min(band.to, age) });
  }
  slots.push({ id: "current", from: null, to: null });
  return slots;
}

/** `periodsForAge` 의 id 만. `narrativeStarLevel` 처럼 분모가 필요한 쪽이 쓴다. */
export function periodIdsForAge(age: number | null): LifePeriod[] {
  return periodsForAge(age).map((s) => s.id);
}

/** 라우트 파라미터로 온 문자열을 시기로 해석한다.
 *
 *  옛 화면이 `?period=teens|20s` 를 썼으므로 `20s` 를 계속 받는다 — 그 링크가
 *  기록·북마크에 남아 있다. 모르는 값은 조용히 `current` 로 떨어진다. */
export function parsePeriodParam(raw: string | string[] | undefined): LifePeriod {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string") return "current";
  if (v === "20s") return "twenties"; // 옛 링크
  const known = AGE_BANDS.some((b) => b.id === v) || v === "current";
  return known ? (v as LifePeriod) : "current";
}
