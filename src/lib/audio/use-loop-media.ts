import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { createMotionSoundPlayer } from './motion-sound-player';

/** Native media owns looping; a loaded event cannot revive a stopped camera. */
export function useLoopMedia(source: number | string, volume: number) {
  const player = useAudioPlayer(source, { downloadFirst: true, keepAudioSessionActive: false, updateInterval: 100 });
  const status = useAudioPlayerStatus(player);
  const desired = useRef(false);
  const control = useRef<ReturnType<typeof createMotionSoundPlayer> | null>(null);
  // Dispose before expo-audio's passive cleanup releases the native object.
  useLayoutEffect(() => {
    player.volume = volume; player.loop = true;
    const controller = createMotionSoundPlayer({
      rewind: () => player.seekTo(0), play: () => player.play(), pause: () => player.pause(),
    });
    control.current = controller;
    controller.setReady(player.isLoaded);
    controller.setMoving(desired.current);
    return () => { control.current = null; controller.dispose(); };
  }, [player, volume]);
  useEffect(() => { control.current?.setReady(status.isLoaded); }, [player, status.isLoaded]);
  return useCallback((moving: boolean) => { desired.current = moving; control.current?.setMoving(moving); }, []);
}
