// "뽁!" sound synth + scheduler for node spawn animation.
//
// Per user directive (2026-05-27): each constellation node spawn plays
// a short pop sound. We synthesize it at runtime with Web Audio API
// instead of shipping an mp3 — zero asset weight, free-tier friendly,
// and matches the "cell pop" feel (220Hz attack → 880Hz overshoot →
// fast exp decay).
//
// Platform behaviour:
//   - Web (GitHub Pages target — current primary distribution): full
//     Web Audio API synthesis.
//   - Native (Expo iOS/Android): silent. A future PR can layer expo-av
//     on top of this same interface without touching callers.
//
// Browser autoplay policy:
//   - Most browsers gate AudioContext until first user gesture. We
//     create the context lazily on the first play() call so the user's
//     "Yes, enter app" tap has already happened by then; if not, we
//     queue silently and the first interactive event resumes it.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof globalThis === "undefined") return null;
  // Web only — Native (React Native) has no AudioContext.
  const W = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = W.AudioContext ?? W.webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    try {
      ctx = new Ctor();
    } catch {
      ctx = null;
    }
  }
  return ctx;
}

/**
 * Play one "뽁!" pop sound. Safe to call from any thread / platform —
 * on native it no-ops silently.
 *
 * @param pitch  base frequency in Hz. Higher tier = higher pitch, so
 *   the 4-tier ripple has a musical descent (tier 1 = ~520, tier 4 = ~220).
 * @param volume 0..1. Defaults to 0.18 so a constellation full of pops
 *   doesn't get fatiguing.
 */
export function playPop(pitch = 440, volume = 0.18): void {
  const c = getCtx();
  if (!c) return;
  // Resume if suspended (autoplay policy). Promise is fire-and-forget;
  // the very first call after page load may be silent, but every
  // subsequent call after the user has tapped Yes will land.
  if (c.state === "suspended") {
    try { void c.resume(); } catch { /* ignore */ }
  }
  const t0 = c.currentTime;
  const dur = 0.14;

  // Pitch envelope: short 880 → pitch sweep gives the "뽁" articulation.
  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(pitch * 2, t0);
  osc.frequency.exponentialRampToValueAtTime(pitch * 0.8, t0 + dur);

  // Amplitude envelope: ~3ms attack, exp decay.
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  // Soft lowpass to take the synth edge off.
  const filt = c.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.value = 4000;

  osc.connect(filt);
  filt.connect(gain);
  gain.connect(c.destination);

  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Map a tier (1..4) to a pitch the synth uses. Tier 1 highest, fades down. */
export function pitchForTier(tier: 1 | 2 | 3 | 4): number {
  switch (tier) {
    case 1: return 660;
    case 2: return 520;
    case 3: return 400;
    case 4: return 300;
  }
}
