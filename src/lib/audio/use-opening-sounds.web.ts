import { useCallback, useEffect, useRef, useState } from "react";
import { Asset } from "expo-asset";
import {
  createOpeningSoundPlayer,
  type OpeningAudioSources,
  type OpeningSoundBank,
  type OpeningSoundCue,
} from "./opening-sound-player";
import { reportUiSoundError } from "./ui-sound-player";

/** Web stays silent until this local media bank is primed by a user gesture. */
export function useOpeningSounds(sources: OpeningAudioSources) {
  const [enabled, updateEnabled] = useState(false);
  const enabledRef = useRef(false);
  const control = useRef<ReturnType<typeof createOpeningSoundPlayer> | null>(null);
  const mediaBank = useRef<HTMLAudioElement[]>([]);
  const generation = useRef(0);

  useEffect(() => {
    if (typeof Audio === "undefined") return;
    const media = (source: number | string) => {
      const asset = Asset.fromModule(source);
      const element = new Audio(asset.localUri ?? asset.uri);
      element.preload = "auto";
      element.playbackRate = 1;
      mediaBank.current.push(element);
      return {
        rewind: async () => { element.currentTime = 0; },
        play: (volume: number) => { element.volume = volume; element.playbackRate = 1; return element.play(); },
        pause: () => element.pause(),
      };
    };
    const bank: OpeningSoundBank = {
      grassA: [media(sources.grassA)], grassB: [media(sources.grassB)],
      ratchet: [media(sources.ratchet), media(sources.ratchet), media(sources.ratchet)],
      ping: [media(sources.ping)],
    };
    const owner = createOpeningSoundPlayer(bank, enabledRef.current);
    owner.setActive(typeof document === "undefined" || !document.hidden);
    control.current = owner;
    const visibility = () => {
      if (document.hidden) generation.current += 1;
      owner.setActive(!document.hidden);
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      generation.current += 1;
      control.current = null;
      owner.dispose();
      document.removeEventListener("visibilitychange", visibility);
      for (const element of mediaBank.current) { element.removeAttribute("src"); element.load(); }
      mediaBank.current = [];
    };
  }, [sources.grassA, sources.grassB, sources.ratchet, sources.ping]);

  const stop = useCallback(() => { generation.current += 1; control.current?.stop(); }, []);
  const unlock = useCallback(async () => {
    const owner = control.current;
    const elements = [...mediaBank.current];
    if (!owner || !elements.length || document.hidden) return false;
    const ticket = ++generation.current;
    owner.setEnabled(false);
    // Start every muted play synchronously inside the caller's click gesture.
    const results = await Promise.all(elements.map(element => {
      element.volume = 0;
      try { return element.play().then(() => true).catch(error => { reportUiSoundError(error); return false; }); }
      catch (error) { reportUiSoundError(error); return Promise.resolve(false); }
    }));
    if (ticket !== generation.current || owner !== control.current) return false;
    for (const element of elements) { element.pause(); element.currentTime = 0; }
    const allowed = results.every(Boolean);
    enabledRef.current = allowed;
    owner.setEnabled(allowed);
    updateEnabled(allowed);
    return allowed;
  }, []);
  const setEnabled = useCallback((value: boolean) => {
    if (value) { void unlock(); return; }
    enabledRef.current = false;
    stop();
    control.current?.setEnabled(false);
    updateEnabled(false);
  }, [stop, unlock]);
  const play = useCallback((cue: OpeningSoundCue) => control.current?.play(cue), []);
  return { enabled, setEnabled, play, stop, unlock, ready: true };
}
