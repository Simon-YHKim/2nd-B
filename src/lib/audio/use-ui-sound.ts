import { useCallback, useEffect, useRef } from "react";
import { useAudioPlayer } from "expo-audio";
import { reportUiSoundError, type UiSoundOptions } from "./ui-sound-player";

/** Native keeps expo-audio's session/release behavior and cancels queued seeks. */
export function useUiSound(source: number | string, options: UiSoundOptions): () => void {
  const { volume, playbackRate = 1, minIntervalMs, updateIntervalMs = 500 } = options;
  const player = useAudioPlayer(source, {
    downloadFirst: true,
    keepAudioSessionActive: false,
    updateInterval: updateIntervalMs,
  });
  const lifecycle = useRef({ active: false, generation: 0 });
  const lastPlayedAt = useRef(Number.NEGATIVE_INFINITY);
  useEffect(() => {
    lifecycle.current = { active: true, generation: lifecycle.current.generation + 1 };
    player.volume = volume;
    player.playbackRate = playbackRate;
    return () => {
      lifecycle.current = { active: false, generation: lifecycle.current.generation + 1 };
    };
  }, [player, volume, playbackRate]);

  return useCallback(() => {
    const now = Date.now();
    if (!lifecycle.current.active || now - lastPlayedAt.current < minIntervalMs) return;
    lastPlayedAt.current = now;
    const generation = lifecycle.current.generation;
    void player.seekTo(0).then(() => {
      if (lifecycle.current.active && lifecycle.current.generation === generation) player.play();
    }).catch(reportUiSoundError);
  }, [player, minIntervalMs]);
}
