// '보여지는 나' 화면이 그릴 행을 만든다 — 자기보고와 지인 집계를 합류시키는 곳.
//
// ── 왜 이 모듈이 생겼나 (2026-08-26) ────────────────────────────────────────
//
// 피어 문항이 3개에서 5개로 늘어(#1392) 지인이 개방성·신경성까지 답하는데,
// 화면은 한 줄도 그리지 않았다. 렌더 루프가 observableSelf()의 3특성을 돌면서
// 집계를 "조회만" 했기 때문이다 — 집계에만 있는 특성은 루프에 없으니 없는 것과
// 같았다.
//
// 고치는 방향으로 둘이 있었고, 이쪽을 골랐다:
//
//   (a) OBSERVABLE_TRAITS 를 5로 늘린다  → 안 된다. 그 배열은 SOKA(Vazire 2010)
//       상 "밖에서 읽히는 특질"이라는 과학적 주장을 이름에 지고 있다. 5로 늘리면
//       지인이 0명인 사용자에게도 신경성·개방성이 '밖에서 가장 잘 보이는 나'로
//       그려진다. 코드로 막을 수 없는 정직성 위반이다.
//   (b) 온 것을 그린다                    → 이쪽. 지인 집계는 실제 타인 보고이므로
//       "측정된 것을 측정된 만큼" 보여주는 것이 밝기 정직성 원칙과 같은 규율이다.
//
// 그래서 표시 행은 두 구획으로 갈린다:
//   observable — SOKA 3특질. 자기보고 막대(+ 집계가 있으면 타인 막대).
//   peerOnly   — 집계에만 온 특질(개방성·신경성). 타인 막대만, 자기보고는
//                있으면 함께. SOKA 주장 밖이라는 것이 구획으로 드러난다.
//
// ⚠ 키별 min-N: 0146 이후 t5_seen_aggregate 는 특성마다 따로 3명을 세고 미달
// 키는 행 자체를 안 준다. 그래서 "부분 집합"이 정상 응답이고, 빈 구획은 버그가
// 아니다. 게이트를 낮춰 채우려 들지 말 것 — 재식별 방지선이다.

import { bfiMeanToPercent, TRAIT_LABEL_EN, TRAIT_LABEL_KO, type BigFiveTrait } from "./bfi";
import { OBSERVABLE_TRAITS, type BfiMeans } from "./observable-self";

/** t5_seen_aggregate 한 행. peer/invite.ts 의 SeenAggregateRow 와 같은 모양. */
export interface SeenAggregateInput {
  trait: string;
  avg_score: number;
  informant_count: number;
}

export interface SeenRow {
  trait: BigFiveTrait;
  label: string;
  /** 자기보고 0-100. Big Five 미완료면 null — 타인 막대만 그린다. */
  selfPercent: number | null;
  /** 지인 합산 0-100. 이 특성의 응답자가 min-N 미달이면 null. */
  otherPercent: number | null;
  /** 이 특성에 답한 지인 수(키별). 없으면 0. */
  informantCount: number;
}

export interface SeenRows {
  /** SOKA 3특질 — 자기보고가 있을 때만 채워진다. */
  observable: SeenRow[];
  /** 집계에만 온 나머지 특질. SOKA 주장 밖이라 구획을 나눈다. */
  peerOnly: SeenRow[];
  /** 자기보고와 타인 보고가 겹치는 특성이 하나라도 있는가(간극 읽기 조건). */
  hasGap: boolean;
  /** 표시용 응답자 수 — 키별 최대. 0146 주석대로 보수적(작거나 같음). */
  informantCount: number;
}

const ALL_TRAITS: readonly BigFiveTrait[] = [
  "extraversion",
  "conscientiousness",
  "agreeableness",
  "neuroticism",
  "openness",
];

function isBigFiveTrait(raw: string): raw is BigFiveTrait {
  return (ALL_TRAITS as readonly string[]).includes(raw);
}

/**
 * 표시 행을 만든다. 순수 함수 — 화면은 이 결과만 그린다.
 *
 * 정렬은 구획 안에서 타인 → 자기 순으로 큰 값이 위. 타인 값이 이 화면의
 * 주인공이고(이 화면의 제목이 '보여지는 나'다), 타인 값이 없는 행은 자기보고로
 * 정렬한다.
 */
export function buildSeenRows(
  means: BfiMeans | null,
  aggregate: readonly SeenAggregateInput[],
  locale: "en" | "ko",
): SeenRows {
  const labels = locale === "ko" ? TRAIT_LABEL_KO : TRAIT_LABEL_EN;

  const other = new Map<BigFiveTrait, { percent: number; count: number }>();
  for (const row of aggregate) {
    if (!isBigFiveTrait(row.trait)) continue; // 미지 키는 조용히 버린다(스키마 방어).
    other.set(row.trait, {
      percent: bfiMeanToPercent(row.avg_score),
      count: Math.max(0, Math.trunc(row.informant_count)),
    });
  }

  const row = (trait: BigFiveTrait): SeenRow => {
    const o = other.get(trait);
    return {
      trait,
      label: labels[trait],
      selfPercent: means ? bfiMeanToPercent(means[trait]) : null,
      otherPercent: o ? o.percent : null,
      informantCount: o ? o.count : 0,
    };
  };

  const byValue = (a: SeenRow, b: SeenRow): number =>
    (b.otherPercent ?? b.selfPercent ?? 0) - (a.otherPercent ?? a.selfPercent ?? 0);

  // observable 구획은 자기보고가 있을 때만 존재한다 — 자기보고 없이 SOKA 3특질만
  // 따로 세우면 "밖에서 잘 보이는 나"라는 제목 아래 타인 수치만 남아 구획의
  // 의미가 사라진다. 그 경우 세 특질도 peerOnly 로 내려가 한 덩어리로 그려진다.
  const observable = means
    ? OBSERVABLE_TRAITS.map(row).sort(byValue)
    : [];

  const shownInObservable = new Set(observable.map((r) => r.trait));
  // peerOnly 는 **온 것만** 그린다. 지인 응답이 없는 신경성·개방성을 자기보고만으로
  // 세우는 것은 (a)안이 저지르는 바로 그 오류다 — SOKA 가 뺀 특질을 이 화면에
  // 되살리는 셈이 된다.
  const peerOnly = ALL_TRAITS.filter((t) => !shownInObservable.has(t))
    .map(row)
    .filter((r) => r.otherPercent !== null)
    .sort(byValue);

  const hasGap = [...observable, ...peerOnly].some(
    (r) => r.selfPercent !== null && r.otherPercent !== null,
  );

  const counts = [...other.values()].map((o) => o.count);
  const informantCount = counts.length > 0 ? Math.max(...counts) : 0;

  return { observable, peerOnly, hasGap, informantCount };
}

/** gap_synthesize 프롬프트에 넣을 줄. 두 값이 다 있는 행만 — 없는 값은 못 견준다. */
export function seenGapLines(rows: SeenRows): string {
  return [...rows.observable, ...rows.peerOnly]
    .filter((r) => r.selfPercent !== null && r.otherPercent !== null)
    .map((r) => `${r.label}: self ${r.selfPercent}%, others ${r.otherPercent}%`)
    .join("; ");
}
