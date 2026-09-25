export interface UiSoundOptions {
  volume: number;
  playbackRate?: number;
  minIntervalMs: number;
  updateIntervalMs?: number;
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
  let pending = false;
  let lastPlayedAt = Number.NEGATIVE_INFINITY;
  media.volume = options.volume;
  media.playbackRate = options.playbackRate ?? 1;

  return {
    async play(): Promise<void> {
      const now = Date.now();
      if (disposed || pending || now - lastPlayedAt < options.minIntervalMs) return;
      lastPlayedAt = now;
      pending = true;
      try {
        media.currentTime = 0;
        await media.play();
      } catch (error) {
        reportUiSoundError(error);
      } finally {
        pending = false;
      }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      media.pause();
      media.removeAttribute("src");
      media.load();
    },
  };
}
