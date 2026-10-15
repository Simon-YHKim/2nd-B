import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { createNativeUiSoundPlayer, type UiSoundControl, type UiSoundOptions } from "./ui-sound-player";
import { useUiSoundLifecycle } from "./use-ui-sound-lifecycle";

/** Native keeps expo-audio's session/release behavior and cancels queued seeks. */
export function useUiSound(source: number | string, options: UiSoundOptions): () => void {
  return useUiSoundControl(source, options).play;
}

/** Own a prepared player across several cues, with explicit per-cue cancellation. */
export function useUiSoundControl(source: number | string, options: UiSoundOptions): UiSoundControl {
  const { volume, playbackRate = 1, minIntervalMs, updateIntervalMs = 500 } = options;
  const player = useAudioPlayer(source, {
    // SDK downloadFirst creates a null-source player then asynchronously replaces
    // it. Resolve bundled assets now so each source owns a separate player, and
    // wait for that player's loaded event before seeking or playing.
    downloadFirst: false,
    keepAudioSessionActive: false,
    updateInterval: updateIntervalMs,
  });
  const status = useAudioPlayerStatus(player);
  const control = useRef<ReturnType<typeof createNativeUiSoundPlayer> | null>(null);
  const owner = useRef<typeof player | null>(null);
  const stop = useCallback(() => control.current?.stop(), []);
  const allowed = useUiSoundLifecycle(stop);
  // Layout cleanup invalidates seeks and pauses before the SDK's passive release.
  useLayoutEffect(() => {
    player.volume = volume;
    player.setPlaybackRate(playbackRate);
    const controller = createNativeUiSoundPlayer({
      rewind: () => player.seekTo(0), play: () => player.play(), pause: () => player.pause(),
    }, minIntervalMs);
    owner.current = player;
    control.current = controller;
    controller.setReady(player.isLoaded);
    return () => {
      control.current = null; owner.current = null; controller.dispose();
    };
  }, [player, volume, playbackRate, minIntervalMs]);
  // useEvent retains the previous emitter's status on source changes. Read this
  // player's readiness; the status object only signals a native update.
  useEffect(() => { control.current?.setReady(player.isLoaded); }, [player, status]);

  const warned = useRef(false);
  const play = useCallback(() => {
    if (!allowed()) return;
    if (owner.current !== player || !control.current) {
      if (!warned.current) { warned.current = true; console.warn("[ui-sound] cue skipped: player not attached"); }
      return;
    }
    // 아직 안 불러졌으면 재생기가 줄을 세워 두고 불러지는 순간 낸다. 그 대기가 끝나지 않는 경우를 찾으려고
    // 한 번만 남긴다(2026-10-06 에뮬레이터 진단).
    if (!player.isLoaded && !warned.current) { warned.current = true; console.warn("[ui-sound] cue queued before its player loaded"); }
    control.current.play();
  }, [allowed, player]);
  return useMemo(() => ({ play, stop }), [play, stop]);
}
