import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { createOpeningSoundPlayer, type OpeningSoundBank, type OpeningSoundCue } from "../opening-sound-player";

const ROOT = path.resolve(__dirname, "../../../..");
const cue = (key = "grass:0", patch: Partial<OpeningSoundCue> = {}): OpeningSoundCue => ({ sourceId: "grass", variantIndex: 0, volume: 0.2, atMs: 0, key, ...patch });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

function voice() {
  return { rewind: jest.fn<Promise<void>, []>().mockResolvedValue(undefined), play: jest.fn(), pause: jest.fn() };
}
function bank(): OpeningSoundBank {
  return { grassA: [voice()], grassB: [voice()], ratchet: [voice(), voice(), voice()], ping: [voice()] };
}

describe("opening sound owner", () => {
  test("fixed variants, per-cue volume, and three ratchet voices preserve rapid click cues", async () => {
    const voices = bank(), player = createOpeningSoundPlayer(voices);
    player.play(cue("left"));
    player.play(cue("right", { variantIndex: 1 }));
    for (let index = 0; index < 3; index++) player.play(cue("ratchet:" + index, { sourceId: "ratchet", atMs: index * 53.3333, volume: 0.2 }));
    player.play(cue("ping", { sourceId: "ping", volume: 0.1 }));
    await flush();
    expect(voices.grassA[0].play).toHaveBeenCalledWith(0.2);
    expect(voices.grassB[0].play).toHaveBeenCalledWith(0.2);
    for (const driver of voices.ratchet) expect(driver.play).toHaveBeenCalledTimes(1);
    expect(voices.ping[0].play).toHaveBeenCalledWith(0.1);
  });

  test.each(["stop", "dispose", "mute", "background"])("%s cancels a queued seek before it can revive playback", async command => {
    const voices = bank(), player = createOpeningSoundPlayer(voices);
    let resolveSeek!: () => void;
    voices.grassA[0].rewind = jest.fn(() => new Promise<void>(resolve => { resolveSeek = resolve; }));
    player.play(cue());
    if (command === "mute") player.setEnabled(false);
    else if (command === "background") player.setActive(false);
    else player[command as "stop" | "dispose"]();
    resolveSeek(); await flush();
    expect(voices.grassA[0].play).not.toHaveBeenCalled();
    for (const driver of Object.values(voices).flat()) expect(driver.pause).toHaveBeenCalledTimes(1);
  });

  test("a newer cue on the same voice invalidates an older unresolved seek", async () => {
    const voices = bank(), player = createOpeningSoundPlayer(voices);
    let resolveOld!: () => void;
    (voices.grassA[0].rewind as jest.Mock).mockImplementationOnce(() => new Promise<void>(resolve => { resolveOld = resolve; }));
    player.play(cue("old")); player.play(cue("new"));
    await flush(); resolveOld(); await flush();
    expect(voices.grassA[0].play).toHaveBeenCalledTimes(1);
  });

  test("muting and background suppress new cues; stop permits an explicit replay", async () => {
    const voices = bank(), player = createOpeningSoundPlayer(voices, false);
    player.play(cue()); await flush(); expect(voices.grassA[0].play).not.toHaveBeenCalled();
    player.setEnabled(true); player.setActive(false); player.play(cue()); await flush();
    expect(voices.grassA[0].play).not.toHaveBeenCalled();
    player.setActive(true); player.play(cue()); player.play(cue()); await flush();
    expect(voices.grassA[0].play).toHaveBeenCalledTimes(1);
    player.stop(); player.play(cue()); await flush(); expect(voices.grassA[0].play).toHaveBeenCalledTimes(2);
    player.dispose(); player.dispose(); player.play(cue("later")); await flush();
    expect(voices.grassA[0].play).toHaveBeenCalledTimes(2);
  });

  test.each([0, -1, 1.01, NaN, Infinity])("invalid or silent volume %s does not acquire a voice", async volume => {
    const voices = bank(), player = createOpeningSoundPlayer(voices);
    player.play(cue("silent", { volume })); await flush(); expect(voices.grassA[0].rewind).not.toHaveBeenCalled();
  });
});

function platformFixture(platform: "native" | "web") {
  const effects: Array<() => void | (() => void)> = [], layouts: Array<() => void | (() => void)> = [];
  const players: Array<ReturnType<typeof voice> & { seekTo: jest.Mock; volume: number; playbackRate: number; isLoaded: boolean; setPlaybackRate: jest.Mock }> = [];
  const elements: Array<ReturnType<typeof media>> = [];
  const listeners = new Map<string, () => void>();
  const document = { hidden: false, addEventListener: jest.fn((key: string, listener: () => void) => listeners.set(key, listener)), removeEventListener: jest.fn((key: string) => listeners.delete(key)) };
  const appState = { currentState: "active", addEventListener: jest.fn((_key: string, listener: (state: string) => void) => { appListener = listener; return { remove: jest.fn() }; }) };
  let appListener: ((state: string) => void) | null = null;
  function media() { return { volume: 1, playbackRate: 1, currentTime: 0, preload: "", play: jest.fn<Promise<void>, []>().mockResolvedValue(undefined), pause: jest.fn(), removeAttribute: jest.fn(), load: jest.fn() }; }
  const audioConstructor = function () { const element = media(); elements.push(element); return element; };
  const output = ts.transpileModule(readFileSync(path.join(ROOT, "src/lib/audio/use-opening-sounds" + (platform === "web" ? ".web" : "") + ".ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const loaded = { exports: {} as { useOpeningSounds: (sources: { grassA: number; grassB: number; ratchet: number; ping: number }) => { enabled: boolean; ready: boolean; play: (cue: OpeningSoundCue) => void; stop: () => void; setEnabled: (value: boolean) => void; unlock: () => Promise<boolean> } } };
  const customRequire = (id: string) => {
    if (id === "react") return { useCallback: (fn: unknown) => fn, useMemo: (fn: () => unknown) => fn(), useRef: (current: unknown) => ({ current }), useState: (value: unknown) => [value, jest.fn()], useEffect: (fn: typeof effects[0]) => effects.push(fn), useLayoutEffect: (fn: typeof effects[0]) => layouts.push(fn) };
    if (id === "react-native") return { AppState: appState };
    if (id === "expo-audio") return { useAudioPlayer: () => { const player = { ...voice(), seekTo: jest.fn<Promise<void>, []>().mockResolvedValue(undefined), volume: 1, playbackRate: 1, isLoaded: true, setPlaybackRate: jest.fn() }; players.push(player); return player; }, useAudioPlayerStatus: () => ({ isLoaded: true }) };
    if (id === "expo-asset") return { Asset: { fromModule: (id: number) => ({ uri: "/assets/" + id + ".wav" }) } };
    if (id === "./opening-sound-player") return { createOpeningSoundPlayer };
    if (id === "./ui-sound-player") return require("../ui-sound-player");
    throw new Error("Unexpected opening audio dependency: " + id);
  };
  new Function("require", "module", "exports", "Audio", "document", output)(customRequire, loaded, loaded.exports, audioConstructor, document);
  const hook = loaded.exports.useOpeningSounds({ grassA: 1, grassB: 2, ratchet: 3, ping: 4 });
  const cleanups = [...layouts, ...effects].map(effect => effect()).filter(Boolean) as Array<() => void>;
  return { hook, players, elements, document, visibility: () => listeners.get("visibilitychange")?.(), appState: (state: string) => appListener?.(state), cleanup: () => cleanups.forEach(cleanup => cleanup()) };
}

describe("opening platform lifecycle", () => {
  test("native defaults on, uses six fixed-pitch players, and releases through layout cleanup", async () => {
    const fixture = platformFixture("native");
    expect(fixture.hook.enabled).toBe(true); expect(fixture.hook.ready).toBe(true); expect(fixture.players).toHaveLength(6);
    fixture.hook.play(cue()); await flush(); expect(fixture.players[0].play).toHaveBeenCalledTimes(1);
    expect(fixture.players[0].volume).toBe(0.2); expect(fixture.players[0].setPlaybackRate).toHaveBeenCalledWith(1);
    fixture.appState("background"); fixture.hook.play(cue("hidden")); await flush(); expect(fixture.players[0].play).toHaveBeenCalledTimes(1);
    fixture.appState("active"); fixture.hook.play(cue("returned")); await flush(); expect(fixture.players[0].play).toHaveBeenCalledTimes(2);
    fixture.cleanup(); fixture.hook.play(cue("unmounted")); await flush(); expect(fixture.players[0].play).toHaveBeenCalledTimes(2);
    const source = readFileSync(path.join(ROOT, "src/lib/audio/use-opening-sounds.ts"), "utf8");
    expect(source).toContain("useLayoutEffect(() =>"); expect(source).toContain("owner.dispose()"); expect(source).toContain("keepAudioSessionActive: false"); expect(source).toContain("downloadFirst: false");
  });

  test("web starts muted and primes all media in the explicit unlock call", async () => {
    const fixture = platformFixture("web"); expect(fixture.hook.enabled).toBe(false);
    fixture.hook.play(cue()); await flush(); expect(fixture.elements.every(element => element.play.mock.calls.length === 0)).toBe(true);
    const unlocked = fixture.hook.unlock(); expect(fixture.elements).toHaveLength(6);
    expect(fixture.elements.every(element => element.volume === 0 && element.play.mock.calls.length === 1)).toBe(true);
    await expect(unlocked).resolves.toBe(true); fixture.hook.play(cue()); await flush();
    expect(fixture.elements[0].volume).toBe(0.2); expect(fixture.elements[0].playbackRate).toBe(1); expect(fixture.elements[0].play).toHaveBeenCalledTimes(2);
    fixture.document.hidden = true; fixture.visibility(); fixture.hook.play(cue("hidden")); await flush(); expect(fixture.elements[0].play).toHaveBeenCalledTimes(2);
    fixture.cleanup(); for (const element of fixture.elements) { expect(element.removeAttribute).toHaveBeenCalledWith("src"); expect(element.load).toHaveBeenCalledTimes(1); }
  });

  test("web stop cancels a pending gesture unlock and cannot enable stale media", async () => {
    const fixture = platformFixture("web"); let resolve!: () => void;
    fixture.elements[0].play.mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
    const unlocking = fixture.hook.unlock(); fixture.hook.stop(); resolve(); await expect(unlocking).resolves.toBe(false);
    fixture.hook.play(cue()); await flush(); expect(fixture.elements[0].play).toHaveBeenCalledTimes(1); fixture.cleanup();
  });
});
