// 렌즈 자율도 L1~L3 — "이 결정을 세컨비가 혼자 정해도 되는 정도".
//
// ⚠ 밝기(L1~L5, `persona/brightness.ts`)와 **다른 축이다.** 밝기는 "이 영역을
// 내가 얼마나 아는가"고, 자율도는 "이 결정을 맡겨도 되는가"다. 같은 화면에
// 나란히 두면 헷갈리므로 이름도 타입도 갈라 놨다.
//
//   L1  매번 묻는다        — 세컨비가 값을 안 채우고 사용자가 고른다
//   L2  선택지 두 개를 낸다 — 세컨비가 좁혀 오고 사용자가 고른다
//   L3  기본값을 채워 온다  — 세컨비가 정하고 사용자는 필요하면 되돌린다
//
// **오르는 유일한 경로는 예측 적중이다.** 사용 횟수도, 화면을 몇 번 열었는지도
// 아니다 -- 그게 감사에서 걸린 원래 문제(등급이 구인이 아니라 입력 횟수를 쟀다)라
// 여기서는 결과(outcome)만 받는다.

export type Autonomy = 1 | 2 | 3;

/**
 * 한 번의 결과.
 *
 *  hit      -- 세컨비가 채운 값대로 됐다
 *  miss     -- 그대로 되지는 않았다 (그냥 안 맞은 것)
 *  reverted -- 사용자가 **되돌렸다**. 맞고 틀리고의 문제가 아니라 "네가 정하지 마"다
 */
export type LensOutcome = "hit" | "miss" | "reverted";

export interface AutonomyState {
  level: Autonomy;
  /** 연속 적중 수. 승급하면 0 으로 돌아간다. */
  streak: number;
}

/** 승급에 필요한 연속 적중 수. */
export const PROMOTE_AFTER = 3;

export const INITIAL_AUTONOMY: AutonomyState = { level: 1, streak: 0 };

/**
 * 다음 상태. 순수 함수다 -- 저장은 호출부가 한다.
 *
 * 규칙 셋:
 *  1. `reverted` 는 **즉시 한 단계 강등**하고 연속 적중을 지운다. 되돌림은
 *     미스보다 강한 신호다. 사용자가 손으로 고쳤다는 뜻이니까.
 *  2. `hit` 이 {@link PROMOTE_AFTER} 번 연속이면 한 단계 승급하고 streak 을 지운다.
 *  3. `miss` 는 강등하지 않는다. streak 만 지운다 -- 한 번 빗나갔다고 권한을
 *     뺏으면 L3 이 사실상 도달 불가가 되고, 그러면 사다리가 장식이 된다.
 */
export function nextAutonomy(state: AutonomyState, outcome: LensOutcome): AutonomyState {
  if (outcome === "reverted") {
    return { level: demote(state.level), streak: 0 };
  }
  if (outcome === "miss") {
    return { level: state.level, streak: 0 };
  }
  const streak = state.streak + 1;
  if (streak >= PROMOTE_AFTER) return { level: promote(state.level), streak: 0 };
  return { level: state.level, streak };
}

function promote(level: Autonomy): Autonomy {
  return level === 3 ? 3 : ((level + 1) as Autonomy);
}

function demote(level: Autonomy): Autonomy {
  return level === 1 ? 1 : ((level - 1) as Autonomy);
}

/**
 * 이 자율도에서 세컨비가 값을 **채워도 되는가**. 화면이 이걸 보고 갈라진다:
 * false 면 빈칸으로 두고 묻는다.
 */
export function mayPrefill(level: Autonomy): boolean {
  return level === 3;
}

/** 선택지를 몇 개 낼 것인가. L1 은 안 내고, L2 는 둘, L3 은 기본값 하나. */
export function optionCount(level: Autonomy): 0 | 1 | 2 {
  if (level === 1) return 0;
  return level === 2 ? 2 : 1;
}
