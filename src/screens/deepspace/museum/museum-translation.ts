// AI 뮤지엄 — 캐논 위에 얹는 번역 층 (Simon 결정 2026-09-07, R24-MUSEUM-04 ②).
//
// 캐논 팩(`public/proto/data/screens/museum.json`)은 픽셀 계약이고 한국어
// 전용이다. 그 파일을 고치는 것은 이 층의 일이 아니다 — 캐논은 스냅샷으로
// 두고, 번역은 **id 로 짝지은 별도 파일**에 둔다.
//
// ⚠ 로케일 번들(`locales/en/…`)이 아닌 이유는 취향이 아니라 실측이다.
// `scripts/check-i18n-keys.ts:53-74` 가 `locales/en/` 에 있는 네임스페이스를
// **다섯 로케일 전부**에 요구한다. 여기에 넣으면 (1) es·pt·id 까지 11,643자를
// 번역해야 하고 (2) 한국어 사본을 로케일에 하나 더 두게 되는데 그 사본은
// 자기가 베껴 온 캐논과 **말없이 어긋날 수 있다**. 픽셀 계약이 있는 자리에서
// 사본은 비용이 아니라 위험이다.
//
// **부분 번역이 안전하도록 설계했다.** 번역이 없는 id 는 한국어로 떨어지고,
// 그 노드의 언어 표시도 한국어로 남는다. 즉 표시된 언어가 항상 실제로 그려진
// 언어다 — 절반만 번역된 타임라인이 보조기술에게 거짓말을 하지 않는다.
// 번역을 채우는 것은 이 파일을 건드리지 않는 순수 콘텐츠 작업이 된다.

import { CANON_MUSEUM_LANGUAGE } from "@/lib/canon/museum";

import translations from "./museum-timeline-en.json";
import type { MuseumDetail, MuseumEvent } from "./museum-timeline-data";

/** 번역이 존재하는 언어. 늘어나면 여기에 파일을 하나 더 붙인다. */
export type MuseumLanguage = "ko" | "en";

interface EventTranslation {
  title: string;
  sub: string;
  body: string;
  tags: string[];
  refs: string[];
  long: string;
  facts: string[][];
  cause: string;
  effect: string;
}

const EN = translations.events as Record<string, EventTranslation>;

export const MUSEUM_REF_KIND_LABEL_EN = translations.refKinds as Record<string, string>;

/**
 * 이 UI 로케일에서 이 사건이 실제로 그려질 언어.
 *
 * 로케일이 en 이어도 그 id 의 번역이 없으면 **ko** 다. 화면은 이 값을
 * `accessibilityLanguage` 에 그대로 넘긴다 — 그래서 표시가 항상 참이다.
 * 로케일과 언어를 같은 것으로 다루면 부분 번역이 곧 거짓 표시가 된다.
 */
export function museumContentLanguage(eventId: string, locale: string): MuseumLanguage {
  return locale.startsWith("en") && EN[eventId] ? "en" : CANON_MUSEUM_LANGUAGE;
}

/** 이 로케일에서 이 사건에 쓸 번역이 있는가. */
export function hasMuseumTranslation(eventId: string, locale: string): boolean {
  return museumContentLanguage(eventId, locale) !== CANON_MUSEUM_LANGUAGE;
}

/**
 * 사건 하나를 표시 언어로 푼다.
 *
 * 번역이 없으면 **원본 객체를 그대로** 돌려준다(사본이 아니다) — 화면이
 * 참조 동일성으로 재렌더를 거르는 자리가 있어서, 매번 새 객체를 만들면
 * 번역과 무관한 성능 변화를 끼워 넣게 된다.
 *
 * ⚠ `refs` 는 캐논이 `{kind,label}` 이고 번역 파일은 label 만 순서대로 갖는다.
 * 개수가 어긋나면 짝이 밀려 **엉뚱한 아이콘이 붙은 채로 렌더된다** — 예외도
 * 안 나고 화면도 안 죽는다. 그래서 개수가 다르면 그 사건의 refs 만 원본을
 * 쓴다(가드가 이 상태를 0건으로 유지한다).
 * `ylabel`·`icon`·`year`·`lane`·`rel` 은 번역 대상이 아니다 — 좌표와 배선이다.
 */
export function resolveMuseumEvent(event: MuseumEvent, locale: string): MuseumEvent {
  const t = museumContentLanguage(event.id, locale) === "en" ? EN[event.id] : undefined;
  if (!t) return event;
  return {
    ...event,
    title: t.title,
    sub: t.sub,
    body: t.body,
    tags: t.tags,
    refs:
      t.refs.length === event.refs.length
        ? event.refs.map((ref, index) => ({ kind: ref.kind, label: t.refs[index] }))
        : event.refs,
  };
}

/** 상세 시트를 표시 언어로 푼다. 규칙은 사건과 같다. */
export function resolveMuseumDetail(
  eventId: string,
  detail: MuseumDetail | undefined,
  locale: string,
): MuseumDetail | undefined {
  const t = museumContentLanguage(eventId, locale) === "en" ? EN[eventId] : undefined;
  if (!t || !detail) return detail;
  return { ...detail, long: t.long, facts: t.facts, cause: t.cause, effect: t.effect };
}

/** 참고자료 종류 라벨(논문/제품/사건/영상)도 로케일을 탄다. */
export function resolveMuseumRefKindLabel(kind: string, koLabel: string, locale: string): string {
  return locale.startsWith("en") ? MUSEUM_REF_KIND_LABEL_EN[kind] ?? koLabel : koLabel;
}

/** 진행률 — 번역이 얼마나 채워졌는지. 가드와 보고가 같은 수를 읽게 한다. */
export function museumTranslationCoverage(eventIds: string[]): {
  translated: number;
  total: number;
  missing: string[];
} {
  const missing = eventIds.filter((id) => !EN[id]);
  return { translated: eventIds.length - missing.length, total: eventIds.length, missing };
}

/** 가드 전용: 번역 파일이 실제로 담고 있는 id. */
export const MUSEUM_TRANSLATED_IDS: string[] = Object.keys(EN);
