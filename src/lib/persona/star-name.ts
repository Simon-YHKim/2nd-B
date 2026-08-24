// 원장에 적힌 별 id 하나를 사람이 읽는 이름으로 바꾼다.
//
// 원장(`star_tier_history`)에는 2026-08-24 이후 **두 체계가 섞여 있다** --
// 옛 자기이해 축(`now`·`recall`·`seen`…)과 새 일곱(`seven:now`·`seven:school`…).
// 화면마다 각자 이름을 찾으면 어느 화면은 옛 이름을, 어느 화면은 원시 id 를
// 보여주게 된다. 그래서 해석은 여기 한 곳이다.
//
// ⚠ `now` 는 두 체계에 **둘 다 있고 뜻이 다르다**(옛: 지금의 나 = 특성 상태,
// 새: 지금 = 현재의 나를 알아가는 자리). 접두사가 그 둘을 가른다.

import { SELF_UNDERSTANDING_STARS } from "./stars";
import type { StarId } from "./stars";
import { SEVEN_STARS, getSevenStar } from "./seven-stars";
import { parseTierKey } from "./seven-tier-history";

/** 새 체계의 별인가. 8주 그래프는 이걸로 옛 행을 걸러낸다. */
export function isSevenTierKey(starId: string): boolean {
  return parseTierKey(starId) !== null;
}

/**
 * `nameOf` 로 넘길 이름 해석기.
 *
 * `sevenName` 은 새 별의 i18n 이름을 주는 함수다(화면이 `t("ds.star.…")` 로
 * 넘긴다). 없으면 새 별은 id 로 표시된다 -- 틀린 이름보다 낫다.
 */
export function resolveStarName(
  starId: string,
  locale: "en" | "ko",
  sevenName?: (id: string) => string,
): string {
  const seven = parseTierKey(starId);
  if (seven) {
    const known = SEVEN_STARS.find((s) => s.id === seven);
    if (known && sevenName) return sevenName(known.key);
    return seven;
  }
  const old = SELF_UNDERSTANDING_STARS.find((s) => s.id === (starId as StarId));
  return old ? (locale === "ko" ? old.nameKo : old.nameEn) : starId;
}

/**
 * i18n 으로 이름을 붙이는 화면용 — `home` 네임스페이스의 키를 돌려준다.
 *
 * 새 별은 `ds.star.<key>`(다섯 로케일에 있음), 옛 축은 `ds.home.starName.<id>`.
 * 모르는 id 는 `null` -- 화면은 id 를 그대로 보여준다. 지어낸 이름보다 낫다.
 *
 * `resolveStarName` 과 나뉘어 있는 이유: 그쪽은 로케일 문자열(ko/en)로 즉답하는
 * 자리용이고, 다섯 로케일을 다 가진 화면은 이 키를 t() 에 넣는 쪽이 맞다.
 */
export function starNameKey(starId: string): string | null {
  const seven = parseTierKey(starId);
  if (seven) return `ds.star.${getSevenStar(seven).key}`;
  const old = SELF_UNDERSTANDING_STARS.find((s) => s.id === (starId as StarId));
  return old ? `ds.home.starName.${old.id}` : null;
}
