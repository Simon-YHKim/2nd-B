import type { SafetyZone } from "@/lib/safety/classifier";

// 효과음 3차의 재생 여부 (Simon Q-261006-01~06). 소리 파일이 없는 순수 함수라 테스트가 그대로 부른다.
// 효과음 스위치 · 화면 포커스 · 앱 전경 여부는 useUiSound 가 이미 보고, 여기서는 그 밖의
// "울리면 안 되는 순간"만 막는다.

/** 정상 답장일 때만. 위기 응답은 status "ok" 로 오므로 안전 구역을 따로 본다. 하루 한도 ·
 * 오류 문구는 이 함수까지 오지 않는다(호출부가 정상 분기에서만 부른다). */
export function replyCueAllowed(input: { zone: SafetyZone | undefined; recording: boolean }): boolean {
  return input.zone !== "red" && !input.recording;
}

/** 사람이 직접 저장한 기록만. 위기 판정이 난 메모, 녹음 중, 세컨비 자동 담기는 무음이다
 * (자동 담기는 답장 소리 바로 뒤에 겹친다). */
export function saveCueAllowed(input: { crisis: boolean; recording: boolean; automatic?: boolean }): boolean {
  return !input.crisis && !input.recording && input.automatic !== true;
}

/** 시기 별 비준이 실제로 저장됐고, 그 별이 그 전에는 L5 가 아니었을 때만. 옛 자기이해 축
 * 비준(`kind: "star"`)과 거절 · 저장 실패, 이미 L5 인 별을 다시 비준한 경우는 무음이다. */
export function ratifyL5CueAllowed(input: {
  decision: "ratify" | "decline";
  targetKind: string | undefined;
  persisted: boolean;
  wasL5Before: boolean;
}): boolean {
  return input.decision === "ratify" && input.targetKind === "sevenStar" && input.persisted && !input.wasL5Before;
}

/** 사람이 폰을 올리거나 내렸을 때만. 대시보드로 가면서 내려가는 것, 홈을 떠나며 되돌아가는
 * 것, 상태가 그대로인 재정착, 움직임 줄이기(움직임에 붙은 소리)는 무음이다. */
export function pocketPhoneCueAllowed(input: {
  wasRaised: boolean;
  raised: boolean;
  byUser: boolean;
  reducedMotion: boolean;
}): boolean {
  return input.byUser && input.wasRaised !== input.raised && !input.reducedMotion;
}
