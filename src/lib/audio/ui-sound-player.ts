export interface UiSoundOptions {
  volume: number;
  playbackRate?: number;
  minIntervalMs: number;
  updateIntervalMs?: number;
}

export interface UiSoundControl {
  play: () => void;
  stop: () => void;
}

export function reportUiSoundError(error: unknown): void {
  const name = typeof error === "object" && error !== null && "name" in error ? error.name : undefined;
  if (name === "AbortError" || name === "NotAllowedError") return;
  console.warn("[ui-sound] Playback failed", error);
}

type SoundMedia = Pick<HTMLAudioElement, "volume" | "playbackRate" | "currentTime" | "play" | "pause" | "removeAttribute" | "load">;

/** Own the actual media.play() Promise. expo-audio's web play() discards it,
 * so catching the wrapper cannot handle a pause during pending playback. */
export function createUiSoundPlayer(media: SoundMedia, options: UiSoundOptions) {
  let disposed = false;
  let generation = 0;
  let pending: number | null = null;
  let lastPlayedAt = Number.NEGATIVE_INFINITY;
  media.volume = options.volume;
  media.playbackRate = options.playbackRate ?? 1;
  const stop = () => { generation++; pending = null; media.pause(); };

  return {
    async play(): Promise<void> {
      const now = Date.now();
      if (disposed || pending !== null || now - lastPlayedAt < options.minIntervalMs) return;
      lastPlayedAt = now;
      const ticket = ++generation;
      pending = ticket;
      try {
        media.currentTime = 0;
        await media.play();
      } catch (error) {
        reportUiSoundError(error);
      } finally {
        if (pending === ticket) pending = null;
      }
    },
    stop,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      stop();
      media.removeAttribute("src");
      media.load();
    },
  };
}

/** Queue at most one cue while its own native source loads. Stop permanently
 * invalidates that request and any outstanding seek, without replay on focus. */
export function createNativeUiSoundPlayer(driver: {
  rewind: () => Promise<void>;
  play: () => void;
  pause: () => void;
}, minIntervalMs: number) {
  let ready = false, queued = false, disposed = false, generation = 0;
  let pending: number | null = null;
  let lastPlayedAt = Number.NEGATIVE_INFINITY;
  const start = async () => {
    if (!ready || !queued || disposed) return;
    queued = false;
    const ticket = ++generation;
    pending = ticket;
    try {
      await driver.rewind();
      if (!disposed && ready && ticket === generation) driver.play();
    } catch (error) { reportUiSoundError(error); }
    finally { if (pending === ticket) pending = null; }
  };
  const stop = () => { generation++; queued = false; pending = null; driver.pause(); };
  return {
    play() {
      const now = Date.now();
      if (disposed || queued || pending !== null || now - lastPlayedAt < minIntervalMs) return;
      lastPlayedAt = now; queued = true; void start();
    },
    setReady(value: boolean) {
      if (disposed || ready === value) return;
      ready = value;
      if (value) void start(); else stop();
    },
    stop,
    dispose() { if (disposed) return; disposed = true; stop(); },
  };
}
