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
 * playsInSilentMode:false 는 무음·진동 모드에서 효과음을 내지 않는다는 뜻이다. 이 기본값은
 * Simon 확인 대기다. 바꾸려면 이 상수 한 칸만 고치면 된다.
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
