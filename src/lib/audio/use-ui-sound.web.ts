import { useCallback, useEffect, useMemo, useRef } from "react";
import { Asset } from "expo-asset";
import { createUiSoundPlayer, type UiSoundControl, type UiSoundOptions } from "./ui-sound-player";
import { useUiSoundLifecycle } from "./use-ui-sound-lifecycle";

/** A local element per mounted sound; no global error or prototype handlers. */
export function useUiSound(source: number | string, options: UiSoundOptions): () => void {
  return useUiSoundControl(source, options).play;
}

/** Preparation never plays; the mounted owner can stop each attempt explicitly. */
export function useUiSoundControl(source: number | string, options: UiSoundOptions): UiSoundControl {
  const sound = useRef<ReturnType<typeof createUiSoundPlayer> | null>(null);
  const stop = useCallback(() => sound.current?.stop(), []);
  const allowed = useUiSoundLifecycle(stop);
  const { volume, playbackRate, minIntervalMs } = options;
  useEffect(() => {
    if (typeof Audio === "undefined") return;
    const asset = Asset.fromModule(source);
    const media = new Audio(asset.localUri ?? asset.uri);
    media.preload = "auto";
    const player = createUiSoundPlayer(media, { volume, playbackRate, minIntervalMs });
    sound.current = player;
    return () => {
      sound.current = null;
      player.dispose();
    };
  }, [source, volume, playbackRate, minIntervalMs]);

  const play = useCallback(() => { if (allowed()) void sound.current?.play(); }, [allowed]);
  return useMemo(() => ({ play, stop }), [play, stop]);
}
