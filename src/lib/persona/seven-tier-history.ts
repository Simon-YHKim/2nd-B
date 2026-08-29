// 새 일곱의 등급 변화를 원장에 남기고 되읽는다 (`star_tier_history`, 0045/0060).
//
// ── 왜 접두사를 붙이는가 ─────────────────────────────────────────────────────
//
// **글자가 같은데 뜻이 다른 id 가 있다.** 옛 자기이해 축의 `now` 는 "지금의 나"
// (Big Five 특성 상태)이고, 새 별의 `now` 는 "지금"(현재의 나를 알아가는 자리)다.
// `star_tier_history.star_id` 는 제약 없는 text 라 둘이 같은 칸에 섞인다.
//
// 섞이면 조용히 틀린다 -- 옛 축의 등급이 새 별을 밝히고, 8주 그래프는 두 체계를
// 한 줄에 겹쳐 그린다. 예외도 안 나고 화면도 안 죽는다. 그냥 **틀린 숫자**가 뜬다.
//
// 그래서 새 체계는 `seven:` 을 달고 쓴다. DDL 이 필요 없고(자유 텍스트),
// 옛 행 1050 건을 건드리지 않으며(운영 실측 2026-08-24: ratify 0건 · rebuild 945건 ·
// 사용자 3명), 되돌리기도 접두사를 떼면 끝이다.
//
// 옛 행의 은퇴는 4단계(stars.ts 정리)에서 한다. 값을 바꾸는 마이그레이션은
// 읽는 쪽을 같은 PR 에서 다 옮길 때만 안전하다.
//
// ── L5 는 여기서만 나온다 ────────────────────────────────────────────────────
//
// 아무리 깊게 파도 커버리지로는 L4 까지다(`levelFromCells`). L5 로 가는 길은
// 비준(propose->ratify) 하나뿐이고, 그 규율을 지키는 자리가 `loadSevenRatified` 다.
//
// ⚠ 운영 실측: `evidence_origin='ratify'` 행은 **아직 0건**이다. 즉 지금까지
// 아무도 L5 에 도달한 적이 없다. 이 함수는 그 길이 열렸을 때를 위한 것이지,
// 이미 있는 데이터를 읽는 것이 아니다.

import { activationMilestone, captureEvent, starLit } from "../analytics";
import { getSupabaseClient } from "../supabase/client";
import type { LadderLevel } from "./brightness";
import { sanitizeCitations } from "./record-star-tiers";
import { SEVEN_STARS, isSevenStarId, type SevenStarId } from "./seven-stars";
import { northStarBrightness, type HeadlineStarId } from "./north-star";

export const SEVEN_TIER_PREFIX = "seven:";

/** 원장에 적히는 키. 옛 축과 절대 겹치지 않는다. */
export type SevenTierKey = `seven:${SevenStarId}`;

export function tierKey(id: SevenStarId): SevenTierKey {
  return `${SEVEN_TIER_PREFIX}${id}` as SevenTierKey;
}

/** 원장의 star_id 를 새 별로 되돌린다. 새 체계가 아니면 `null`. */
export function parseTierKey(starId: string): SevenStarId | null {
  if (!starId.startsWith(SEVEN_TIER_PREFIX)) return null;
  const id = starId.slice(SEVEN_TIER_PREFIX.length);
  return isSevenStarId(id) ? id : null;
}

/**
 * 지금 등급을 원장에 남기고 성공 여부를 돌려준다. 호출자는 대화를 계속할지,
 * 저장 실패를 보여줄지 문맥에 맞게 결정한다.
 *
 * ⚠ `recordStarTiers` 를 재사용하지 않는다. 그쪽의 activation_milestone 은
 * **옛 일곱**의 id 목록과 `soulCoreBrightness` 로 계산한다 -- 새 키를 넘기면
 * 조용히 전부 기본값으로 읽혀 마일스톤이 틀린 숫자로 나간다. 공유하려고
 * 그 함수를 구부리는 것보다, 새 체계가 자기 것을 쓰는 편이 안전하다.
 * (마일스톤 자체는 4단계에서 새 일곱 기준으로 다시 본다.)
 *
 * star_lit 은 여기서도 쏜다 -- 별이 처음 밝아지는 순간은 새 체계에서도
 * 똑같이 의미가 있다.
 */
export async function recordSevenTiers(
  userId: string,
  levels: Partial<Record<SevenStarId, LadderLevel>>,
  origin: "rebuild" | "ratify" | "interview" = "interview",
  // 비준 인용(0060). 쓰기 경계에서 sanitize 하므로 모델이 지어낸 문자열은
  // 원장에 도달하지 못한다 -- record-star-tiers 의 규율 그대로.
  citations?: readonly string[],
): Promise<boolean> {
  if (!userId) return false;
  const entries = Object.entries(levels) as [SevenStarId, LadderLevel][];
  if (entries.length === 0) return false;
  try {
    const supabase = getSupabaseClient();
    // 직전 등급. 진짜로 오른 별에만 star_lit 을 쏘기 위해서다. 못 읽으면
    // 이벤트만 조용해지고 기록은 그대로 남는다.
    const prior = new Map<SevenStarId, number>();
    try {
      const { data } = await supabase
        .from("star_tier_history")
        .select("star_id, level, recorded_at")
        .eq("user_id", userId)
        .order("recorded_at", { ascending: false })
        .limit(100);
      for (const r of (data ?? []) as { star_id: string; level: number }[]) {
        const id = parseTierKey(r.star_id);
        if (id && !prior.has(id)) prior.set(id, r.level);
      }
    } catch {
      // 직전 값 없이 간다 -- 전부 기본 L1 로 본다.
    }

    const cleanCitations = sanitizeCitations(citations);
    const { error } = await supabase.from("star_tier_history").insert(
      entries.map(([id, level]) => ({
        user_id: userId,
        star_id: tierKey(id),
        level,
        evidence_origin: origin,
        ...(cleanCitations ? { evidence_citations: cleanCitations } : {}),
      })),
    );
    if (error) return false;

    for (const [id, level] of entries) {
      if (level > (prior.get(id) ?? 1)) {
        captureEvent(starLit({ star_id: tierKey(id), ladder_level: level, source: "journal" }));
      }
    }

    // activation_milestone -- 옛 체계(record-star-tiers)에서 이사해 온 지표
    // (2026-08-25, 옛 축 rebuild 쓰기 중지와 같은 PR). 일곱이 다 전달될 때만
    // (인터뷰 저장 경로가 그렇다) 켜진 별 수가 늘었는지 본다.
    //
    // ⚠ 밝기 값은 soulCoreBrightness(옛 축 집계)가 아니라 북극성 규칙
    // (northStarBrightness -- 프로필 제외 여섯 평균)이다. 이벤트 필드 이름
    // soul_core_brightness 는 GA4 지표 연속성 때문에 유지한다 -- 이름이
    // 아니라 값의 정의가 바뀌었고, 그게 이 이사의 내용이다.
    if (entries.length >= 7) {
      const LIT = 2;
      const priorLit = SEVEN_STARS.filter((s) => (prior.get(s.id) ?? 1) >= LIT).length;
      const nextLit = entries.filter(([, level]) => level >= LIT).length;
      if (nextLit > priorLit) {
        const headline: Partial<Record<HeadlineStarId, LadderLevel>> = {};
        for (const [id, level] of entries) {
          if (id !== "profile") headline[id as HeadlineStarId] = level;
        }
        captureEvent(
          activationMilestone({
            stars_lit_count: nextLit,
            soul_core_brightness: northStarBrightness(headline),
          }),
        );
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * 비준으로 서 있는 등급. 계산값이 이보다 낮아도 여기까지 끌어올린다.
 *
 * 최신 우선으로 읽어 별마다 첫 행이 서 있는 등급이다(나중 비준이 앞을 덮는다).
 * 실패하면 `{}` -- 열려 있게 실패한다. 못 읽었다고 등급을 낮추면 사용자가
 * 이미 비준한 것을 빼앗는 꼴이 된다.
 */
export async function loadSevenRatified(
  userId: string,
): Promise<Partial<Record<SevenStarId, LadderLevel>>> {
  const out: Partial<Record<SevenStarId, LadderLevel>> = {};
  if (!userId) return out;
  try {
    const { data } = await getSupabaseClient()
      .from("star_tier_history")
      .select("star_id, level, evidence_origin, recorded_at")
      .eq("user_id", userId)
      .eq("evidence_origin", "ratify")
      .order("recorded_at", { ascending: false });
    for (const r of (data ?? []) as { star_id: string; level: number }[]) {
      const id = parseTierKey(r.star_id);
      if (!id || out[id] !== undefined) continue;
      const lvl = Math.min(5, Math.max(1, Math.round(r.level))) as LadderLevel;
      out[id] = lvl;
    }
  } catch {
    // 열려 있게 실패한다.
  }
  return out;
}
