import type { GlobalCueId } from "./global-cues";

// 효과음 3차 (Simon Q-261006-01~06, 2026-10-06). 소리는 agent-audio(Stable Audio 3
// small-sfx)로 만들고 Simon 이 미리듣기 보고서에서 골랐다. 출처 · 시드 · 프롬프트 · 다듬기
// 기록은 assets/audio/GENERATED-SOURCES.json 에 있다. 크기는 기존 UI 소리(0.08~0.2)에 맞췄고,
// 자주 나는 소리(기록 저장 · 세컨비 답장)를 가장 작게 둔다.
//
// 재생 여부는 app-cue-gates.ts 의 순수 함수가 정한다. 화면은 상태만 넘기고, 효과음 스위치 · 화면 포커스 ·
// 앱 전경 여부는 useUiSound 가 이미 본다. 여기서는 그 밖의 '울리면 안 되는 순간'만 막는다.

export interface AppCue {
  source: number;
  volume: number;
  minIntervalMs: number;
}

/** 비준으로 시기 별이 처음 L5 가 될 때 (Q-261006-01 = A, 2.2초 종소리). */
export const RATIFY_L5_CUE: AppCue = {
  source: require("../../../assets/audio/star-ratify-l5.wav"),
  volume: 0.15,
  minIntervalMs: 2200,
};

/** 기록을 저장했을 때 (Q-261006-03 = A, 68ms). */
export const RECORD_SAVE_CUE: AppCue = {
  source: require("../../../assets/audio/record-save.wav"),
  volume: 0.08,
  minIntervalMs: 400,
};

/** 세컨비 답장이 붙었을 때 (Q-261006-04 = B, 300ms). */
export const SECONDB_REPLY_CUE: AppCue = {
  source: require("../../../assets/audio/secondb-reply.wav"),
  volume: 0.08,
  minIntervalMs: 300,
};

/** 주머니 폰을 올리고 내릴 때 (Q-261006-05 = B, 59ms). */
export const POCKET_PHONE_CUE: AppCue = {
  source: require("../../../assets/audio/pocket-phone.wav"),
  volume: 0.1,
  minIntervalMs: 150,
};

/** 홈에 돌아왔을 때 별이 밝아져 있으면 (Q-261006-02 = B, 1.0초). */
export const STAR_BRIGHTEN_CUE: AppCue = {
  source: require("../../../assets/audio/star-brighten.wav"),
  volume: 0.12,
  minIntervalMs: 1000,
};

/** 온보딩을 마치고 앱으로 들어갈 때 (Q-261006-06 = B, 2.2초). 화면이 바로 바뀌므로 루트의
 * GlobalCueHost 가 낸다. */
export const ONBOARDING_WELCOME_CUE: AppCue = {
  source: require("../../../assets/audio/onboarding-welcome.wav"),
  volume: 0.12,
  minIntervalMs: 2200,
};

/** 유료 플랜이 실제로 열렸을 때 (Q-261006-12 = buy-a, 1.46초). */
export const PLAN_PURCHASE_CUE: AppCue = {
  source: require("../../../assets/audio/plan-purchase.wav"),
  volume: 0.14,
  minIntervalMs: 1500,
};

/** 광고 보상 크레딧이 실제로 지급됐을 때 (Q-261006-13 = coin-a, 200ms). 광고 소리 바로 뒤라 작게. */
export const REWARD_CREDIT_CUE: AppCue = {
  source: require("../../../assets/audio/reward-credit.wav"),
  volume: 0.08,
  minIntervalMs: 600,
};

/** 위키 연결을 확인했을 때 (Q-261006-14, 세컨비 답장 소리 재사용). 목록을 연달아 확인하면
 * 시끄러우니 1.5초 안의 두 번째는 건너뛴다. */
export const WIKI_LINK_CUE: AppCue = {
  source: SECONDB_REPLY_CUE.source,
  volume: 0.08,
  minIntervalMs: 1500,
};

/** 화면이 바뀌어도 끝까지 나야 하는 소리의 실제 파일. 루트의 GlobalCueHost 가 이 표대로 낸다. */
export const GLOBAL_CUE_SOUNDS: Record<GlobalCueId, AppCue> = {
  onboardingWelcome: ONBOARDING_WELCOME_CUE,
  polarisRatified: RATIFY_L5_CUE,
  quantSaved: RECORD_SAVE_CUE,
  planPurchased: PLAN_PURCHASE_CUE,
  rewardCredited: REWARD_CREDIT_CUE,
};

export {
  brightenCue,
  milestoneDoneCueAllowed,
  pocketPhoneCueAllowed,
  ratifyL5CueAllowed,
  replyCueAllowed,
  saveCueAllowed,
  welcomeCueAllowed,
} from "./app-cue-gates";
