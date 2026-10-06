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

/** 마일스톤 칩이 '완료'로 바뀌는 탭에서만(Q-261006-15). 칩은 할 일 → 진행 → 완료 → 할 일을 돌아서,
 * 완료에서 다시 누르는 것(되돌리기)과 진행으로 가는 것은 무음이다. */
export function milestoneDoneCueAllowed(input: { from: string; to: string }): boolean {
  return input.to === "done" && input.from !== "done";
}

/** 온보딩을 끝까지 넘겨 앱으로 들어갈 때만(Q-261006-06). 건너뛰기를 눌렀거나 로그인 · 가입
 * 화면으로 넘어가는 출구는 무음이다(아직 아무것도 시작하지 않았다). */
export function welcomeCueAllowed(input: { destination: string; skipped: boolean }): boolean {
  return input.destination === "/" && !input.skipped;
}

/** 별이 밝아졌는지(Q-261006-02). 마지막으로 본 밝기와 비교해 L1~L4 안에서 오른 별이 있으면 한 번
 * 울린다. 여러 별이 한꺼번에 올라도 한 번이다.
 *
 * - 기록은 **내리지 않는다.** 커버리지 읽기는 실패해도 0 을 돌려줘서 실패한 읽기가 전부 L1 로
 *   보인다. 그때 낮춰 적으면 다음 정상 읽기가 거짓 상승이 된다.
 * - L5 는 비준 소리(Q-261006-01)의 몫이라 울리지 않고 기록만 올린다.
 * - 처음 보는 사용자(기록 없음)와 처음 보는 별은 기록만 한다.
 * - 움직임에 붙은 소리라 움직임 줄이기면 무음이다. 기록은 그래도 올린다. */
export function brightenCue(
  seen: Readonly<Record<string, number>> | null,
  now: Readonly<Record<string, number>>,
  reducedMotion: boolean,
): { play: boolean; next: Record<string, number> } {
  const next: Record<string, number> = { ...(seen ?? {}) };
  let rose = false;
  for (const [id, level] of Object.entries(now)) {
    const before = next[id];
    if (before !== undefined && level <= before) continue;
    if (seen !== null && before !== undefined && level <= 4) rose = true;
    next[id] = level;
  }
  return { play: rose && !reducedMotion, next };
}
