import { areSoundEffectsOn } from "./ui-sound-player";

// 오프닝 배경음 (Simon Q-261006-07 = amb-a 밤 풀밭 분위기음, 2026-10-06).
//
// 승인된 오프닝 묶음(hustlek-approved-261002)에는 넣지 않는다 - 그 묶음은 해시 · 파일 수 ·
// 생성기 출력이 바이트로 묶여 있다. 이 소리는 오프닝 옆의 별도 재생기로, 오프닝 시계가 움직일
// 때 그 시각 위치부터 나고 효과음이 멈추는 모든 자리에서 같이 멈춘다. 파일 자체가 오프닝 길이
// (10.12초)에 맞춰 1초 커지고 1.5초 작아지게 다듬어져 있다.
//
// 오프닝을 붙잡지 않는다: 이 소리는 오프닝의 1.5초 소리 기다림에 들어가지 않는다. 시계가 출발할 때
// 아직 불러지지 않았으면 시작 요청을 기억해 두었다가, 불러지는 순간 그 사이 흐른 만큼 앞의 위치에서
// 시작한다(2026-10-06 에뮬레이터: 건너뛰기만 하던 첫 판은 오프닝 3.4초 지점에서야 붙었다).
// 멈춤이 오면 기억도 지운다.

export const OPENING_AMBIENCE_VOLUME = 0.15;
export const OPENING_AMBIENCE_MS = 10120;

export interface OpeningAmbienceDriver {
  loaded(): boolean;
  seekTo(seconds: number): Promise<void>;
  play(): void;
  pause(): void;
}

export function createOpeningAmbience(
  driver: OpeningAmbienceDriver,
  durationMs = OPENING_AMBIENCE_MS,
  now: () => number = Date.now,
) {
  let generation = 0;
  let disposed = false;
  let pending: { atMs: number; requestedAt: number } | null = null;
  const stop = () => { generation++; pending = null; driver.pause(); };
  const begin = (atMs: number) => {
    if (disposed || !areSoundEffectsOn() || atMs < 0 || atMs >= durationMs) return;
    const ticket = ++generation;
    driver.seekTo(atMs / 1000).then(
      () => { if (!disposed && ticket === generation) driver.play(); },
      () => undefined,
    );
  };
  return {
    /** 오프닝 시계의 지금 위치(ms)부터 낸다. 이미 끝난 위치 · 효과음 끔은 무음. 아직 불러지지
     * 않았으면 기억해 두고 onLoaded 에서 따라잡는다. */
    start(atMs: number): void {
      if (disposed) return;
      if (!driver.loaded()) { pending = { atMs, requestedAt: now() }; return; }
      pending = null;
      begin(atMs);
    },
    /** 소리 파일이 막 불러졌을 때. 기억해 둔 시작이 있으면 그 사이 흐른 만큼 앞의 위치에서 낸다. */
    onLoaded(): void {
      if (disposed || !pending) return;
      const { atMs, requestedAt } = pending;
      pending = null;
      begin(atMs + Math.max(0, now() - requestedAt));
    },
    stop,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      stop();
    },
  };
}
