import { useEffect, useLayoutEffect, useRef } from "react";
import { AppState } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { ONBOARDING_WELCOME_CUE } from "./app-cues";
import { onGlobalCue } from "./global-cues";
import { createNativeUiSoundPlayer } from "./ui-sound-player";

/** 루트 레이아웃에 하나만 둔다. 화면 포커스와 무관하게 끝까지 내되, 앱이 전경이 아니면 내지 않고
 * 백그라운드로 가면 멈춘다. 효과음 스위치는 재생기 안에서 이미 본다. */
export function useGlobalCueHost(): void {
  const cue = ONBOARDING_WELCOME_CUE;
  const player = useAudioPlayer(cue.source, { downloadFirst: false, keepAudioSessionActive: false, updateInterval: 500 });
  const status = useAudioPlayerStatus(player);
  const control = useRef<ReturnType<typeof createNativeUiSoundPlayer> | null>(null);
  useLayoutEffect(() => {
    player.volume = cue.volume;
    const controller = createNativeUiSoundPlayer({
      rewind: () => player.seekTo(0), play: () => player.play(), pause: () => player.pause(),
    }, cue.minIntervalMs);
    control.current = controller;
    controller.setReady(player.isLoaded);
    return () => { control.current = null; controller.dispose(); };
  }, [player, cue.volume, cue.minIntervalMs]);
  useEffect(() => { control.current?.setReady(player.isLoaded); }, [player, status]);
  useEffect(() => {
    const off = onGlobalCue((id) => {
      if (id === "onboardingWelcome" && AppState.currentState === "active") control.current?.play();
    });
    const app = AppState.addEventListener("change", (state) => { if (state !== "active") control.current?.stop(); });
    return () => { off(); app.remove(); };
  }, []);
}
