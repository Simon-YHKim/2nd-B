// 화면이 바뀌어도 끝까지 나야 하는 소리 (효과음 3차, 2026-10-06).
//
// 화면 안의 useUiSound 는 그 화면이 포커스를 잃거나 사라지면 소리를 끊는다. 온보딩 끝처럼
// 누르는 순간 router.replace 로 화면이 바뀌는 자리는 그래서 소리가 바로 잘린다. 그런 소리는
// 여기 요청만 남기고, 루트 레이아웃의 GlobalCueHost 하나가 받아서 낸다.

// onboardingWelcome: 온보딩 끝(Q-261006-06) · polarisRatified: 북극성 문장 저장 · 역할 카드 비준(Q-08 · 09,
// L5 소리) · quantSaved: 자기 검사 완료(Q-10, 저장 소리) · planPurchased: 플랜 구매(Q-12) ·
// rewardCredited: 광고 보상 지급(Q-13). 모두 저장 직후 화면이 바뀌거나 모달 위에서 나는 소리다.
export const GLOBAL_CUE_IDS = ["onboardingWelcome", "polarisRatified", "quantSaved", "planPurchased", "rewardCredited"] as const;
export type GlobalCueId = (typeof GLOBAL_CUE_IDS)[number];

const listeners = new Set<(id: GlobalCueId) => void>();

export function requestGlobalCue(id: GlobalCueId): void {
  for (const listener of listeners) listener(id);
}

export function onGlobalCue(listener: (id: GlobalCueId) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
