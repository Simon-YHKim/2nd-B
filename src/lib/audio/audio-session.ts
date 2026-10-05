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
 * playsInSilentMode 는 이 호출 이전의 동작을 플랫폼마다 그대로 둔다 (게이트 r1, PR #2036).
 * Android 는 SDK 기본값 true 다. false 면 벨소리 모드가 일반이 아닐 때 play() 가 그냥 돌아가서
 * (AudioModule.kt `Function("play")` 의 shouldPlayInSilentMode 검사) 진동·무음에서 효과음이 전부
 * 사라진다. 이 앱은 그런 적이 없다. iOS 는 false 다. 이 조합이 `.ambient` 가 되고, 모드를 정하기
 * 전의 시스템 기본 `.soloAmbient` 처럼 무음 스위치를 따른다. 무음·진동에서 효과음을 낼지는
 * Simon 확인 대기다. 바꾸려면 이 값 한 칸만 고치면 된다.
 *
 * 미디어 버튼 세션(ExpoAudioBasicMediaSession)은 여기서 끌 수 없다. expo-audio 56 은 플레이어마다
 * MediaSession 을 무조건 만들고(AudioPlayer.kt buildBasicMediaSession) JS 옵션이 없다.
 */
export const EFFECTS_AUDIO_MODE: Readonly<
  Pick<AudioMode, "interruptionMode" | "shouldPlayInBackground" | "playsInSilentMode">
> = Object.freeze({
  interruptionMode: "mixWithOthers",
  shouldPlayInBackground: false,
  playsInSilentMode: Platform.OS === "android",
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
