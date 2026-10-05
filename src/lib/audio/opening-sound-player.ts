import { areSoundEffectsOn, onSoundEffectsChange, reportUiSoundError } from "./ui-sound-player";

export interface OpeningAudioSources {
  grassA: number | string;
  grassB: number | string;
  ratchet: number | string;
  ping: number | string;
}

export interface OpeningSoundCue {
  sourceId: "grass" | "ratchet" | "ping";
  variantIndex: number;
  volume: number;
  atMs: number;
  key: string;
}

export interface OpeningSoundVoice {
  rewind: () => Promise<void>;
  play: (volume: number) => void | Promise<void>;
  pause: () => void;
}

export type OpeningSoundBank = Record<"grassA" | "grassB" | "ratchet" | "ping", OpeningSoundVoice[]>;

/** One owner invalidates pending seeks before pausing or releasing media. */
export function createOpeningSoundPlayer(bank: OpeningSoundBank, initiallyEnabled = true) {
  let enabled = initiallyEnabled;
  let active = true;
  let disposed = false;
  let generation = 0;
  const nextVoice = { grassA: 0, grassB: 0, ratchet: 0, ping: 0 };
  const tickets = new Map<OpeningSoundVoice, number>();
  const played = new Set<string>();
  const voices = Object.values(bank).flat();
  // The sound effects switch (Q-261005-02) silences the opening too and stops it mid-play.
  const unsubscribeEffects = onSoundEffectsChange(on => { if (!on && !disposed) stop(); });

  function stop() {
    generation += 1;
    played.clear();
    for (const voice of voices) {
      tickets.set(voice, (tickets.get(voice) ?? 0) + 1);
      try { voice.pause(); } catch (error) { reportUiSoundError(error); }
    }
  }

  return {
    setEnabled(value: boolean) {
      if (disposed) return;
      enabled = value;
      if (!value) stop();
    },
    setActive(value: boolean) {
      if (disposed) return;
      active = value;
      if (!value) stop();
    },
    play(cue: OpeningSoundCue) {
      if (disposed || !active || !enabled || !areSoundEffectsOn() || !Number.isFinite(cue.volume) || cue.volume <= 0 || cue.volume > 1 || played.has(cue.key)) return;
      const source = cue.sourceId === "grass" ? (cue.variantIndex === 1 ? "grassB" : "grassA") : cue.sourceId;
      const pool = bank[source];
      if (!pool?.length) return;
      played.add(cue.key);
      const voice = pool[nextVoice[source]++ % pool.length];
      const ticket = (tickets.get(voice) ?? 0) + 1;
      tickets.set(voice, ticket);
      const run = generation;
      void (async () => {
        try {
          await voice.rewind();
          if (!disposed && active && enabled && run === generation && ticket === tickets.get(voice)) await voice.play(cue.volume);
        } catch (error) { reportUiSoundError(error); }
      })();
    },
    stop,
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeEffects();
      stop();
    },
  };
}
