import { useCallback, useEffect, useRef } from "react";
import { Asset } from "expo-asset";
import { createUiSoundPlayer, type UiSoundOptions } from "./ui-sound-player";

/** A local element per mounted sound; no global error or prototype handlers. */
export function useUiSound(source: number | string, options: UiSoundOptions): () => void {
  const sound = useRef<ReturnType<typeof createUiSoundPlayer> | null>(null);
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

  return useCallback(() => { void sound.current?.play(); }, []);
}
