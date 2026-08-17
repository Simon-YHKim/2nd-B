// 오늘의 두 가지 — 비서 홈이 무엇을 보여줄지 고르는 규칙 (Simon 2026-08-18, D6).
//
// ## 어디서 왔는가
//
// Simon 이 cowork 개인 대시보드를 만들 때 쓴 프롬프트의 원리를 가져왔다:
//
//   "접근할 수 있는 것을 살펴보고, 추적하기에 **가장 유용한 두 가지**를 선택해서
//    지금 바로 실시간으로 작동하는 버전을. **샘플 데이터로 채운 항목은 표시**하고,
//    무엇을 바꿀지 물어봐 주세요."
//
// 그대로 옮기지 않고 이 앱의 규칙에 맞춰 재구성했다(Simon 지시). 옮긴 것과 바꾼
// 것은 아래와 같다.
//
// ## 그대로 가져온 것
//
// **두 개만 고른다.** 위젯을 벽처럼 깔지 않는다. 이 앱에는 이미 같은 규칙이
// 있다 - "화면 하나에 메시지 하나, 상세는 탭 이후". 도구 8개는 방금 붙인 격자로
// 한 탭 거리에 있으니, 홈이 할 일은 나열이 아니라 **선별**이다.
//
// **접근할 수 있는 것을 먼저 살펴본다.** 후보를 고정해 두고 비어 있으면 빈 카드를
// 그리는 방식이 아니라, 데이터가 있는 것만 후보가 된다.
//
// ## 바꾼 것 (여기가 더 정직하다)
//
// 원본은 "샘플 데이터로 채운 항목은 **표시**하라" 였다. 이 앱에서는 한 걸음 더
// 간다 - **샘플을 아예 넣지 않는다.** 대신 그 자리에 "무엇을 하면 여기가 채워지는지"
// 를 말한다.
//
// 이유: 이 앱의 불변식이 정직한 밝기다. 없는 것을 그럴듯하게 채워 두면 사용자는
// 자기가 가진 것보다 많이 가진 것처럼 느끼고, 그건 별 밝기를 부풀리는 것과 같은
// 종류의 거짓말이다. 라벨을 붙인 가짜보다 **빈 자리와 다음 한 걸음**이 낫다.
//
// ## LLM 을 쓰지 않는다
//
// 고르는 일에 추론이 필요하지 않다. 무엇이 있고 언제 마지막으로 손댔는지만 보면
// 된다. 홈은 열 때마다 도는 화면이라 여기에 모델을 붙이면 가장 비싼 자리가 된다
// (비용·effort 를 자리마다 최적화한다는 원칙). 순수 함수라 테스트도 싸다.

/** 비서가 읽을 수 있는 후보 하나의 현재 상태. 화면이 아니라 데이터를 기술한다. */
export interface PickCandidate {
  id: PickId;
  /** 이 사용자에게 이 소스에 실제 행이 있는가. 없으면 후보가 아니다. */
  hasData: boolean;
  /** 오늘 안에 할 일이 걸려 있는가 (오늘의 루틴, 임박한 목표 등). */
  dueToday?: boolean;
  /** 마지막으로 이 소스에 무언가 일어난 시각. 없으면 오래된 것으로 본다. */
  lastActivityAt?: number | null;
}

export const PICK_IDS = ["routine", "milestone", "reading", "meals", "records", "esm"] as const;
export type PickId = (typeof PICK_IDS)[number];

/** 홈이 한 번에 보여주는 개수. 늘리고 싶어지면 위 헤더의 이유를 먼저 읽을 것. */
export const PICK_COUNT = 2;

export interface TodayPicks {
  /** 실제로 보여줄 카드. 최대 PICK_COUNT 개. 데이터가 없으면 비어 있다. */
  picks: PickId[];
  /**
   * 자리가 남았을 때 "이걸 하면 여기가 채워집니다" 로 안내할 후보.
   *
   * 가짜 카드가 아니다 - 화면은 이걸 **빈 자리의 다음 걸음**으로 그려야 하고,
   * 데이터가 있는 것처럼 그리면 안 된다.
   */
  suggestions: PickId[];
}

/**
 * 후보 하나의 점수. 높을수록 먼저.
 *
 * 오늘 걸린 것 > 최근에 손댄 것. 시간이 걸린 일은 늦으면 의미가 없어지고,
 * 손을 놓은 지 오래된 것은 오늘 갑자기 중요해지지 않는다.
 */
function score(c: PickCandidate, now: number): number {
  if (!c.hasData) return -1;
  let s = 0;
  if (c.dueToday) s += 1000;
  const last = c.lastActivityAt ?? null;
  if (last != null) {
    const days = Math.max(0, (now - last) / 86_400_000);
    // 최근일수록 높게, 하지만 오늘 걸린 것을 넘지 못하게 상한을 둔다.
    s += Math.max(0, 100 - days);
  }
  return s;
}

/**
 * 오늘 보여줄 두 가지를 고른다.
 *
 * 순수 함수다 - `now` 를 인자로 받는 이유는 테스트 때문만이 아니라, 홈이 열릴
 * 때마다 같은 입력에 같은 답을 내야 하기 때문이다. 무작위로 돌려 보여주면
 * "왜 이게 떴지" 에 답할 수 없다.
 */
export function pickToday(candidates: readonly PickCandidate[], now: number): TodayPicks {
  const eligible = candidates.filter((c) => c.hasData);
  const ranked = [...eligible].sort((a, b) => {
    const d = score(b, now) - score(a, now);
    // 동점이면 고정 순서로 - 열 때마다 자리가 바뀌면 사용자가 위치를 못 외운다.
    return d !== 0 ? d : PICK_IDS.indexOf(a.id) - PICK_IDS.indexOf(b.id);
  });

  const picks = ranked.slice(0, PICK_COUNT).map((c) => c.id);

  // 남은 자리는 **가짜로 채우지 않는다.** 데이터가 없는 후보를 "이걸 하면
  // 채워집니다" 로 안내할 뿐이다. 순서는 고정 - 매번 다른 것을 권하면 권유가
  // 아니라 잡음이 된다.
  const empty = PICK_IDS.filter((id) => !candidates.some((c) => c.id === id && c.hasData));
  const suggestions = empty.slice(0, Math.max(0, PICK_COUNT - picks.length));

  return { picks, suggestions };
}

/**
 * 이 화면이 지금 진짜 데이터만 보여주고 있는가.
 *
 * 화면이 아니라 결과를 검사한다. 샘플을 넣지 않는다는 약속을 코드로 확인할 수
 * 있어야 그 약속이 유지된다.
 */
export function picksAreAllReal(result: TodayPicks, candidates: readonly PickCandidate[]): boolean {
  return result.picks.every((id) => candidates.some((c) => c.id === id && c.hasData));
}
