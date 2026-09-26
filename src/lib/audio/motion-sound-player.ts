import { reportUiSoundError } from './ui-sound-player';

/** The media engine loops a recorded, fixed-period WAV. No JS tick timer. */
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
      if (!disposed && moving && ready && ticket === generation) await driver.play();
    } catch (error) { reportUiSoundError(error); }
  };
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
      disposed = true; moving = false; pause();
    },
  };
}
