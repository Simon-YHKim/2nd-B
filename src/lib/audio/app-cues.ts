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

export { pocketPhoneCueAllowed, ratifyL5CueAllowed, replyCueAllowed, saveCueAllowed } from "./app-cue-gates";
