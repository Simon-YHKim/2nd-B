// 홈 별자리에 그려지는 일곱 = **북두칠성 일곱** (`persona/seven-stars.ts`).
//
// ⚠ 2026-08-24 에 통째로 바뀌었다. 예전에는 "여섯 생활 도메인 + 프로필"이었다
// (커리어·재정·관계·성장·건강·휴식 + 프로필). Simon 결정으로 **생활 도메인은
// 별자리에서 내려가 세컨비 대시보드로** 가고, 별은 **나를 알아가는 일곱 자리**가
// 됐다 — 프로필 · 영유아기 · 학창시절 · 20대 · 30대 이후 · 직장 · 지금.
//
// 이 파일은 호환을 위해 남긴다: 좌표를 가진 `ConstellationHome` 과 별 목록을
// 쓰는 다른 화면이 같은 목록을 보게 하는 것이 원래 목적이었고, 그 목적은 그대로다.

import { SEVEN_STAR_IDS, isSevenStarId, type SevenStarId } from "./seven-stars";

export type HomeStarId = SevenStarId;

/** 홈에 그려지는 순서 그대로. 좌표는 `ConstellationHome` 이 갖는다. */
export const HOME_STAR_IDS: readonly HomeStarId[] = SEVEN_STAR_IDS;

export function isHomeStarId(value: string): value is HomeStarId {
  return isSevenStarId(value);
}
