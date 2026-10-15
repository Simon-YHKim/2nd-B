import { areSoundEffectsOn, onSoundEffectsChange, reportUiSoundError } from './ui-sound-player';

/** The media engine loops a recorded, fixed-period WAV. No JS tick timer.
 *  The sound effects switch (Q-261005-02) silences the loop and stops a running
 *  one; the caller's haptic pulse is separate and keeps following the motion. */
export function createMotionSoundPlayer(driver: {
  rewind: () => Promise<void>;
  play: () => void | Promise<void>;
  pause: () => void;
}) {
  let moving = false, ready = false, disposed = false, generation = 0;
  const pause = () => { generation++; driver.pause(); };
  const start = async () => {
    const ticket = ++generation;
    try {
      await driver.rewind();
      if (!disposed && moving && ready && areSoundEffectsOn() && ticket === generation) await driver.play();
    } catch (error) { reportUiSoundError(error); }
  };
  const unsubscribe = onSoundEffectsChange(on => {
    if (disposed || !moving || !ready) return;
    if (on) void start(); else pause();
  });
  return {
    setMoving(value: boolean) {
      if (disposed || moving === value) return;
      moving = value;
      if (!value) pause(); else if (ready) void start();
    },
    setReady(value: boolean) {
      if (disposed || ready === value) return;
      ready = value;
      if (moving) { if (value) void start(); else pause(); }
    },
    dispose() {
      if (disposed) return;
      disposed = true; moving = false; unsubscribe(); pause();
    },
  };
}
