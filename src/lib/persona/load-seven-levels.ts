// 북두칠성 일곱의 밝기 — 그리고 그 평균인 북극성.
//
// ⚠ 이름 주의: **`load-star-levels.ts` 와 다른 파일이다.** 그쪽은 `stars.ts` 의
// 심리 구인 7축(지금의 나·회상·…)을 읽는 옛 로더이고, 여기는 **새 북두칠성 일곱**
// (프로필·영유아기·학창시절·20대·30대 이후·직장·지금)을 읽는다. 옛 로더는 북극성
// 화면이 아직 쓰므로 살아 있다 -- 정리는 4단계(stars.ts 정리)에서 한다.
//
// ⚠ 2026-08-24 신설. 예전에는 `load-domain-levels.ts` 가 도메인 등급과 북극성
// 밝기를 **한꺼번에** 돌려줬다. 별이 생활 도메인에서 **나를 알아가는 자리**로
// 바뀌면서 둘이 서로 다른 것이 됐다 -- 도메인은 대시보드가 계속 쓰고, 별 밝기는
// 여기가 만든다.
//
// ── 밝기가 무엇을 뜻하는가 ───────────────────────────────────────────────────
//
// **그 자리를 얼마나 팠는가.** 인터뷰가 (시기 × 층) 행렬로 세고 있고(0143),
// 한 자리에서 다섯 층 중 몇 층을 열었는지가 곧 그 별의 밝기다.
//
// 이건 이 저장소에서 **처음으로 계기가 있는 밝기**다. 도메인 별 밝기는 "그 영역을
// 얼마나 아는가"였는데 재는 방법이 흐렸다. 이제는 셀 수 있다.
//
// **L5 는 여기서 나오지 않는다.** 비준(propose->ratify)만이 L5 로 가는 길이라는
// 규율은 그대로다 -- 아무리 깊게 파도 자동으로는 L4 까지다.
//
// 프로필은 인터뷰가 없다. 항목을 얼마나 채웠는지가 밝기다(Simon 결정 5 = A,
// `loadProfileStarLevel`).

import { getSupabaseClient } from "../supabase/client";
import { loadCoverage } from "../interview/coverage-store";
import { DRILL_LAYERS } from "../interview/probe";
import { SEVEN_STARS, type SevenStarId } from "./seven-stars";
import { northStarBrightness, type HeadlineStarId } from "./north-star";
import { loadProfileStarLevel } from "./load-profile-star";
import { loadSevenRatified } from "./seven-tier-history";
import type { LadderLevel } from "./brightness";

/**
 * 판 칸 수 -> 등급. 다섯 층 중 몇 층을 열었는가.
 *
 * L5 는 없다 -- 비준으로만 간다. 그래서 다 파도 L4 에서 멈춘다.
 */
export function levelFromCells(cells: number): LadderLevel {
  if (cells >= 4) return 4;
  if (cells >= 2) return 3;
  if (cells >= 1) return 2;
  return 1;
}

export interface SevenLevels {
  starLevels: Record<SevenStarId, LadderLevel>;
  northStarBrightness: number;
}

/** 전부 L1 인 기본값. 읽기가 실패해도 화면이 뜨게 한다 -- 어두운 것은 거짓말이 아니다. */
function allDim(): Record<SevenStarId, LadderLevel> {
  const out = {} as Record<SevenStarId, LadderLevel>;
  for (const s of SEVEN_STARS) out[s.id] = 1;
  return out;
}

export async function loadSevenLevels(userId: string): Promise<SevenLevels> {
  const levels = allDim();
  if (!userId) return { starLevels: levels, northStarBrightness: northStarBrightness({}) };

  const [coverage, profileLevel, ratified] = await Promise.all([
    loadCoverage(userId).catch(() => null),
    loadProfileStarLevel(userId).catch(() => 1 as LadderLevel),
    loadSevenRatified(userId).catch(() => ({})),
  ]);

  for (const star of SEVEN_STARS) {
    if (star.period === null) {
      levels[star.id] = profileLevel;
      continue;
    }
    if (!coverage) continue; // 못 읽었으면 어두운 채로 둔다
    let cells = 0;
    for (const l of DRILL_LAYERS) if (coverage[star.period][l] > 0) cells += 1;
    levels[star.id] = levelFromCells(cells);
  }

  // 비준으로 서 있는 등급까지 끌어올린다. **내리지는 않는다** -- 계산이 낮게
  // 나왔다고 사용자가 이미 비준한 것을 빼앗으면, 밝기가 뒤로 간 사용자는
  // 자기가 뭘 잃었는지 알 길이 없다. 그리고 L5 는 오직 이 길로만 온다.
  //
  // ⚠ 이 여덟 줄은 #1377 에서 한 번 사라진 적이 있다 -- 변이 검증의 복구
  // 명령(git checkout)이 변이만이 아니라 배선까지 되돌렸고, 배선을 박는
  // 검사가 없어서 아무도 몰랐다. 그래서 지금은 seven-ratify-wiring.test.ts
  // 가 이 파일에 리프트가 실재하는지를 지킨다.
  for (const [id, level] of Object.entries(ratified) as [SevenStarId, LadderLevel][]) {
    if (levels[id] !== undefined && level > levels[id]) levels[id] = level;
  }

  // 북극성은 **그리는 것만** 평균한다(캐논 polarisBrightness). 프로필은 빠진다 --
  // 나를 설명하는 자리이지 증거가 아니라서, 넣으면 페르소나가 부분적으로
  // 자기 자신의 평균이 된다.
  const forHeadline: Partial<Record<HeadlineStarId, LadderLevel>> = {};
  for (const star of SEVEN_STARS) {
    if (star.id === "profile") continue;
    forHeadline[star.id as HeadlineStarId] = levels[star.id];
  }
  return { starLevels: levels, northStarBrightness: northStarBrightness(forHeadline) };
}

/** 읽기 전에 캐시를 비운다. 인터뷰를 담은 직후 홈이 옛 밝기를 보이지 않게. */
export function invalidateSevenLevels(): void {
  // 지금은 캐시가 없다. 자리를 만들어 두는 이유는, 도메인 쪽이 캐시를 갖고 있어서
  // 이쪽도 곧 필요해질 때 호출부를 다시 고치지 않기 위해서다.
  void getSupabaseClient;
}
