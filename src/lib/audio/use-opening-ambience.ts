import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useAudioPlayer } from "expo-audio";
import { OPENING_AMBIENCE_VOLUME, createOpeningAmbience } from "./opening-ambience";
import { onSoundEffectsChange } from "./ui-sound-player";

const OPENING_AMBIENCE = require("../../../assets/audio/opening-ambience.wav");

/** 폰 앱의 오프닝 배경음. start(오프닝 경과 ms) · stop 두 가지만 내놓는다. */
export function useOpeningAmbience(): { start: (atMs: number) => void; stop: () => void } {
  const player = useAudioPlayer(OPENING_AMBIENCE, { downloadFirst: false, keepAudioSessionActive: false, updateInterval: 500 });
  const control = useRef<ReturnType<typeof createOpeningAmbience> | null>(null);
  useLayoutEffect(() => {
    player.volume = OPENING_AMBIENCE_VOLUME;
    const owner = createOpeningAmbience({
      loaded: () => player.isLoaded,
      seekTo: (seconds) => player.seekTo(seconds),
      play: () => player.play(),
      pause: () => player.pause(),
    });
    control.current = owner;
    return () => { control.current = null; owner.dispose(); };
  }, [player]);
  // 효과음을 끄면 나고 있던 배경음도 바로 멈춘다(다른 오프닝 소리와 같다).
  useEffect(() => onSoundEffectsChange((on) => { if (!on) control.current?.stop(); }), []);
  const start = useCallback((atMs: number) => control.current?.start(atMs), []);
  const stop = useCallback(() => control.current?.stop(), []);
  return useMemo(() => ({ start, stop }), [start, stop]);
}
