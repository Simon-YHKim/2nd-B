import { useCallback, useEffect, useRef } from 'react';
import { Asset } from 'expo-asset';
import { createMotionSoundPlayer } from './motion-sound-player';

/** Public static asset, decoded once; loop cadence is independent of render FPS. */
export function useLoopMedia(source: number | string, volume: number) {
  const desired = useRef(false);
  const control = useRef<ReturnType<typeof createMotionSoundPlayer> | null>(null);
  useEffect(() => {
    if (typeof Audio === 'undefined') return;
    const asset = Asset.fromModule(source);
    const media = new Audio(asset.localUri ?? asset.uri);
    media.preload = 'auto'; media.volume = volume; media.loop = true;
    const controller = createMotionSoundPlayer({
      rewind: async () => { media.currentTime = 0; },
      play: () => media.play(), pause: () => media.pause(),
    });
    control.current = controller;
    controller.setReady(true); controller.setMoving(desired.current);
    return () => {
      control.current = null; controller.dispose();
      media.removeAttribute('src'); media.load();
    };
  }, [source, volume]);
  return useCallback((moving: boolean) => { desired.current = moving; control.current?.setMoving(moving); }, []);
}
