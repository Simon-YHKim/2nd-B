import { useEffect } from "react";
import { Asset } from "expo-asset";
import { GLOBAL_CUE_SOUNDS } from "./app-cues";
import { GLOBAL_CUE_IDS, onGlobalCue, type GlobalCueId } from "./global-cues";
import { createUiSoundPlayer } from "./ui-sound-player";

/** 웹: 페이지가 보일 때만 내고, 탭이 가려지면 멈춘다. 모두 사용자가 누른 직후의 소리라 브라우저의
 * 자동 재생 제한에 걸리지 않는다. */
export function useGlobalCueHost(): void {
  useEffect(() => {
    if (typeof Audio === "undefined") return;
    const players = {} as Record<GlobalCueId, ReturnType<typeof createUiSoundPlayer>>;
    for (const id of GLOBAL_CUE_IDS) {
      const cue = GLOBAL_CUE_SOUNDS[id];
      const asset = Asset.fromModule(cue.source);
      const media = new Audio(asset.localUri ?? asset.uri);
      media.preload = "auto";
      players[id] = createUiSoundPlayer(media, { volume: cue.volume, minIntervalMs: cue.minIntervalMs });
    }
    const off = onGlobalCue((id) => { if (!document.hidden) void players[id].play(); });
    const hide = () => { if (document.hidden) for (const id of GLOBAL_CUE_IDS) players[id].stop(); };
    document.addEventListener("visibilitychange", hide);
    return () => {
      off(); document.removeEventListener("visibilitychange", hide);
      for (const id of GLOBAL_CUE_IDS) players[id].dispose();
    };
  }, []);
}
