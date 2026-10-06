import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from "react";
import { AppState } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { GLOBAL_CUE_SOUNDS, type AppCue } from "./app-cues";
import { GLOBAL_CUE_IDS, onGlobalCue, type GlobalCueId } from "./global-cues";
import { createNativeUiSoundPlayer } from "./ui-sound-player";

type Controller = ReturnType<typeof createNativeUiSoundPlayer>;

/** 소리 하나를 준비해 두는 재생기. 화면 포커스를 보지 않는다(루트에 붙어 있으므로). */
function useCuePlayer(cue: AppCue): MutableRefObject<Controller | null> {
  const player = useAudioPlayer(cue.source, { downloadFirst: false, keepAudioSessionActive: false, updateInterval: 500 });
  const status = useAudioPlayerStatus(player);
  const control = useRef<Controller | null>(null);
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
  return control;
}

/** 루트 레이아웃에 하나만 둔다. 화면 포커스와 무관하게 끝까지 내되, 앱이 전경이 아니면 내지 않고
 * 백그라운드로 가면 멈춘다. 효과음 스위치는 재생기 안에서 이미 본다. 훅 순서가 고정되도록
 * 소리마다 한 줄씩 부른다(GLOBAL_CUE_IDS 와 같은 순서). */
export function useGlobalCueHost(): void {
  const controls: Record<GlobalCueId, MutableRefObject<Controller | null>> = {
    onboardingWelcome: useCuePlayer(GLOBAL_CUE_SOUNDS.onboardingWelcome),
    polarisRatified: useCuePlayer(GLOBAL_CUE_SOUNDS.polarisRatified),
    quantSaved: useCuePlayer(GLOBAL_CUE_SOUNDS.quantSaved),
    planPurchased: useCuePlayer(GLOBAL_CUE_SOUNDS.planPurchased),
    rewardCredited: useCuePlayer(GLOBAL_CUE_SOUNDS.rewardCredited),
  };
  const latest = useRef(controls);
  latest.current = controls;
  useEffect(() => {
    const off = onGlobalCue((id) => {
      if (AppState.currentState === "active") latest.current[id].current?.play();
    });
    const app = AppState.addEventListener("change", (state) => {
      if (state !== "active") for (const id of GLOBAL_CUE_IDS) latest.current[id].current?.stop();
    });
    return () => { off(); app.remove(); };
  }, []);
}
