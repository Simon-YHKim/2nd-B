// 홈 별자리에 실제로 그려지는 일곱 — **여섯 생활 도메인 + 프로필**.
//
// ⚠ `DOMAIN_STARS`(domain-stars.ts)와 **다르다.** 그쪽은 도메인 일곱이라
// 일곱 번째가 `collect`(담아내기)인데, 담아내기는 데이터 도메인이라 홈에
// 안 그린다. 홈의 일곱 번째는 `profile` 이다.
//
// 이 목록이 `ConstellationHome.tsx` 안에만 있어서 다른 화면이 "홈과 같은 일곱"
// 을 보여주려면 좌표까지 들고 있는 컴포넌트를 import 해야 했다. 좌표는 그
// 컴포넌트가 계속 갖고, **누가 일곱인지**만 여기로 뺀다.
//
// Simon 결정 2026-08-21: 북극성 화면의 "나를 아는 일곱 가지" 자리가 폐기되는
// 심리 구인 대신 **이 일곱**을 보여준다.

import { DOMAIN_STARS, type DomainId } from "./domain-stars";

export type HomeStarId = DomainId | "profile";

/** 홈에 그려지는 순서 그대로. 좌표는 `ConstellationHome` 이 갖는다. */
export const HOME_STAR_IDS: readonly HomeStarId[] = [
  "career",
  "finance",
  "relation",
  "growth",
  "health",
  "recreation",
  "profile",
] as const;

/** 홈에 안 그리는 도메인. 지금은 담아내기 하나다. */
export const NON_HOME_DOMAINS: readonly DomainId[] = DOMAIN_STARS.map((d) => d.id).filter(
  (id): id is DomainId => !(HOME_STAR_IDS as readonly string[]).includes(id),
);

export function isHomeStarId(value: string): value is HomeStarId {
  return (HOME_STAR_IDS as readonly string[]).includes(value);
}
