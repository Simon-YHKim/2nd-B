import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import {
  createOpeningSoundPlayer,
  type OpeningAudioSources,
  type OpeningSoundBank,
  type OpeningSoundCue,
} from "./opening-sound-player";

// Bundled sources resolve immediately; downloadFirst's null-source replacement
// must not merge the independent owners in this small overlap pool.
const OPTIONS = { downloadFirst: false, keepAudioSessionActive: false, updateInterval: 100 };

/** Six short players retain fixed-pitch ratchet overlap without a media loop. */
export function useOpeningSounds(sources: OpeningAudioSources) {
  const grassA = useAudioPlayer(sources.grassA, OPTIONS);
  const grassB = useAudioPlayer(sources.grassB, OPTIONS);
  const ratchetA = useAudioPlayer(sources.ratchet, OPTIONS);
  const ratchetB = useAudioPlayer(sources.ratchet, OPTIONS);
  const ratchetC = useAudioPlayer(sources.ratchet, OPTIONS);
  const ping = useAudioPlayer(sources.ping, OPTIONS);
  useAudioPlayerStatus(grassA);
  useAudioPlayerStatus(grassB);
  useAudioPlayerStatus(ratchetA);
  useAudioPlayerStatus(ratchetB);
  useAudioPlayerStatus(ratchetC);
  useAudioPlayerStatus(ping);
  const players = useMemo(() => ({ grassA, grassB, ratchetA, ratchetB, ratchetC, ping }), [grassA, grassB, ratchetA, ratchetB, ratchetC, ping]);
  const control = useRef<ReturnType<typeof createOpeningSoundPlayer> | null>(null);
  const enabledRef = useRef(true);
  const [enabled, updateEnabled] = useState(true);

  // Cancel queued seeks before expo-audio's passive cleanup releases players.
  useLayoutEffect(() => {
    const voice = (player: typeof grassA) => ({
      rewind: async () => { if (player.isLoaded) await player.seekTo(0); },
      play: (volume: number) => { if (!player.isLoaded) return; player.volume = volume; player.setPlaybackRate(1); player.play(); },
      pause: () => player.pause(),
    });
    const bank: OpeningSoundBank = {
      grassA: [voice(players.grassA)], grassB: [voice(players.grassB)],
      ratchet: [voice(players.ratchetA), voice(players.ratchetB), voice(players.ratchetC)],
      ping: [voice(players.ping)],
    };
    const owner = createOpeningSoundPlayer(bank, enabledRef.current);
    owner.setActive(AppState.currentState !== "background" && AppState.currentState !== "inactive");
    control.current = owner;
    return () => { control.current = null; owner.dispose(); };
  }, [players]);

  useEffect(() => {
    const listener = AppState.addEventListener("change", state => control.current?.setActive(state === "active"));
    return () => listener.remove();
  }, []);

  const setEnabled = useCallback((value: boolean) => {
    enabledRef.current = value;
    control.current?.setEnabled(value);
    updateEnabled(value);
  }, []);
  const stop = useCallback(() => control.current?.stop(), []);
  const play = useCallback((cue: OpeningSoundCue) => control.current?.play(cue), []);
  const unlock = useCallback(async () => { setEnabled(true); return true; }, [setEnabled]);
  // Status subscriptions trigger rendering; readiness belongs to each current
  // player rather than an emitter's retained status object on source changes.
  return { enabled, setEnabled, play, stop, unlock, ready: Object.values(players).every(player => player.isLoaded) };
}
