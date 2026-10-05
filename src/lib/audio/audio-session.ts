import { Platform } from "react-native";
import { setAudioModeAsync, type AudioMode } from "expo-audio";

/**
 * 효과음 전용 오디오 세션. 앱 시작 때 한 번, 네이티브에서만 건다 (QA 261004 D-02).
 *
 * 왜: expo-audio 56 Android 는 interruptionMode 가 한 번도 설정되지 않으면 play() 때마다
 * AUDIOFOCUS_GAIN_TRANSIENT 를 요청한다(AudioModule.kt requestAudioFocus 의 `?:` 폴백).
 * 그래서 오프닝과 UI 효과음이 날 때마다 다른 앱의 음악이 잠깐 멈췄다(포커스 요청은 logcat 실측,
 * 음악 정지는 Android 포커스 계약에서 나온 추론). `mixWithOthers` 면 Android 는 포커스 요청
 * 자체를 건너뛴다. `duckOthers` 는 GAIN_TRANSIENT_MAY_DUCK 요청이 남아서 장식 효과음에는
 * 맞지 않는다. iOS 에서는 이 조합이 `.ambient` 카테고리가 된다(다른 앱 소리와 섞이고 무음
 * 스위치를 따른다).
 *
 * ⚠ Android 의 setAudioModeAsync 는 부분 갱신이 아니라 전체 덮어쓰기다. 빠진 interruptionMode 는
 * null 로, 곧 GAIN_TRANSIENT 로 되돌아간다. 그래서 녹음 경로(capture.tsx, secondb.tsx)도
 * interruptionMode 를 명시한다. audio-session.test.ts 가 src 의 모든 호출을 읽어 지킨다.
 *
 * playsInSilentMode 는 두 플랫폼 모두 false 다. Simon 결정 Q-261004-37 = A(10-04 20:47,
 * "효과음은 무음 모드에서 나지 않는다 · 뒤집는 조건: 없음")를 Q-261005-01 = A(10-05)가 다시
 * 확인했다. 게이트 r1(PR #2036)은 그 결정을 모른 채 Android 를 SDK 기본값 true 로 두었었다.
 * Android 는 false 면 벨소리 모드가 일반이 아닐 때 play() 가 그냥 돌아간다(AudioModule.kt
 * `Function("play")` 의 shouldPlayInSilentMode 검사). 그래서 진동 · 무음에서는 오프닝을 포함한
 * 모든 효과음이 나지 않는다. 그것이 결정의 내용이다. iOS 는 이 조합이 `.ambient` 가 되어 무음
 * 스위치를 따른다.
 *
 * ⚠ 녹음 경로(capture.tsx · secondb.tsx)는 녹음 전에 playsInSilentMode true 로 모드를 덮어쓰고
 * 되돌리지 않는다. 그래서 음성 녹음을 한 번 하면 앱을 다시 켤 때까지 무음에서도 효과음이 난다.
 * 녹음 뒤 이 모드로 되돌리는 일은 2차 작업으로 남겼다(Q-261005-01 후속).
 *
 * 미디어 버튼 세션(ExpoAudioBasicMediaSession)은 여기서 끌 수 없다. expo-audio 56 은 플레이어마다
 * MediaSession 을 무조건 만들고(AudioPlayer.kt buildBasicMediaSession) JS 옵션이 없다.
 */
export const EFFECTS_AUDIO_MODE: Readonly<
  Pick<AudioMode, "interruptionMode" | "shouldPlayInBackground" | "playsInSilentMode">
> = Object.freeze({
  interruptionMode: "mixWithOthers",
  shouldPlayInBackground: false,
  playsInSilentMode: false,
});

let configured: Promise<void> | null = null;

/** 부팅 때 한 번만 실제로 호출한다. 다시 불러도 첫 호출의 Promise 를 돌려준다. 실패해도 던지지 않는다. */
export function configureEffectsAudioSession(): Promise<void> {
  if (Platform.OS === "web") return Promise.resolve();
  if (!configured) {
    configured = setAudioModeAsync({ ...EFFECTS_AUDIO_MODE }).catch((error: unknown) => {
      console.warn("[audio-session] setAudioModeAsync failed", error);
    });
  }
  return configured;
}
