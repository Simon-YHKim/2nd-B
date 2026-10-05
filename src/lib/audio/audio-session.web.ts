/**
 * 웹에는 오디오 포커스와 미디어 버튼 세션이 없고, expo-audio 웹의 setAudioModeAsync 도 빈 함수다.
 * 그래서 웹 번들은 expo-audio 를 이 경로로 끌어오지 않고 아무것도 하지 않는다 (QA 261004 D-02).
 * 녹음도 웹에서는 시작 전에 돌아가므로(capture.tsx · secondb.tsx 의 웹 안내) 녹음 모드는 없다.
 */
export function configureEffectsAudioSession(): Promise<void> {
  return Promise.resolve();
}

export function beginRecordingAudioMode(): Promise<void> {
  return Promise.resolve();
}

export function endRecordingAudioMode(): Promise<void> {
  return Promise.resolve();
}

export function restoreEffectsAfterRecording(): void {}

export function isRecordingAudioMode(): boolean {
  return false;
}
