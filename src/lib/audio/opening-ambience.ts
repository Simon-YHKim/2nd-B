import { areSoundEffectsOn } from "./ui-sound-player";

// 오프닝 배경음 (Simon Q-261006-07 = amb-a 밤 풀밭 분위기음, 2026-10-06).
//
// 승인된 오프닝 묶음(hustlek-approved-261002)에는 넣지 않는다 - 그 묶음은 해시 · 파일 수 ·
// 생성기 출력이 바이트로 묶여 있다. 이 소리는 오프닝 옆의 별도 재생기로, 오프닝 시계가 움직일
// 때 그 시각 위치부터 나고 효과음이 멈추는 모든 자리에서 같이 멈춘다. 파일 자체가 오프닝 길이
// (10.12초)에 맞춰 1초 커지고 1.5초 작아지게 다듬어져 있다.
//
// 오프닝을 붙잡지 않는다: 시계가 출발할 때 아직 불러지지 않았으면 이번에는 조용히 건너뛴다
// (오프닝은 소리를 최대 1.5초만 기다리고, 이 소리는 그 기다림에 들어가지 않는다).

export const OPENING_AMBIENCE_VOLUME = 0.15;
export const OPENING_AMBIENCE_MS = 10120;

export interface OpeningAmbienceDriver {
  loaded(): boolean;
  seekTo(seconds: number): Promise<void>;
  play(): void;
  pause(): void;
}

export function createOpeningAmbience(driver: OpeningAmbienceDriver, durationMs = OPENING_AMBIENCE_MS) {
  let generation = 0;
  let disposed = false;
  const stop = () => { generation++; driver.pause(); };
  return {
    /** 오프닝 시계의 지금 위치(ms)부터 낸다. 이미 끝난 위치 · 효과음 끔 · 아직 불러지지 않음은 무음. */
    start(atMs: number): void {
      if (disposed || !areSoundEffectsOn() || !driver.loaded() || atMs < 0 || atMs >= durationMs) return;
      const ticket = ++generation;
      driver.seekTo(atMs / 1000).then(
        () => { if (!disposed && ticket === generation) driver.play(); },
        () => undefined,
      );
    },
    stop,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      stop();
    },
  };
}
