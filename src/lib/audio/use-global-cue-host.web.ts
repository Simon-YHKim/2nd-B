import { useEffect, useRef } from "react";
import { Asset } from "expo-asset";
import { ONBOARDING_WELCOME_CUE } from "./app-cues";
import { onGlobalCue } from "./global-cues";
import { createUiSoundPlayer } from "./ui-sound-player";

/** 웹: 페이지가 보일 때만 내고, 탭이 가려지면 멈춘다. 온보딩 끝은 버튼을 누른 순간이라 브라우저의
 * 자동 재생 제한에 걸리지 않는다. */
export function useGlobalCueHost(): void {
  const sound = useRef<ReturnType<typeof createUiSoundPlayer> | null>(null);
  useEffect(() => {
    if (typeof Audio === "undefined") return;
    const cue = ONBOARDING_WELCOME_CUE;
    const asset = Asset.fromModule(cue.source);
    const media = new Audio(asset.localUri ?? asset.uri);
    media.preload = "auto";
    const player = createUiSoundPlayer(media, { volume: cue.volume, minIntervalMs: cue.minIntervalMs });
    sound.current = player;
    const off = onGlobalCue((id) => {
      if (id === "onboardingWelcome" && !document.hidden) void sound.current?.play();
    });
    const hide = () => { if (document.hidden) sound.current?.stop(); };
    document.addEventListener("visibilitychange", hide);
    return () => {
      off(); document.removeEventListener("visibilitychange", hide);
      sound.current = null; player.dispose();
    };
  }, []);
}
