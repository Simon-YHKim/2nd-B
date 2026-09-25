import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import ts from "typescript";

const ROOT = resolve(__dirname, "../../../..");
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const options = { volume: 0.2, playbackRate: 0.8, minIntervalMs: 0 };

function host(platform: "ios" | "android" | "web") {
  let cursor = 0;
  const slots: any[] = [];
  const queued: any[] = [];
  const listeners = new Map<string, Set<() => void>>();
  const media: any[] = [];
  const downloads: Array<() => void> = [];
  const events: string[] = [];
  const status = { override: null as any };
  const captureState = { reducedMotion: false, completed: 0, cancelled: 0 };
  const animations: Array<{ complete: (result: { finished: boolean }) => void; stopped: boolean }> = [];
  let focused = true;
  const memo = (create: () => any, deps: any[]) => {
    const at = cursor++;
    const old = slots[at];
    if (!old || deps.some((value, i) => value !== old.deps[i])) slots[at] = { value: create(), deps };
    return slots[at].value;
  };
  const effect = (kind: "layout" | "passive", create: () => any, deps: any[] = []) => {
    const at = cursor++;
    const old = slots[at];
    if (!old || deps.some((value, i) => value !== old.deps[i])) {
      slots[at] = { kind, create, deps, cleanup: old?.cleanup };
      queued.push(slots[at]);
    }
  };
  const react = {
    useMemo: memo, useRef: (value: any) => memo(() => ({ current: value }), []),
    useCallback: (value: any, deps: any[]) => memo(() => value, deps),
    useEffect: (create: () => any, deps: any[]) => effect("passive", create, deps),
    useLayoutEffect: (create: () => any, deps: any[]) => effect("layout", create, deps),
  };
  const add = (key: string, listener: () => void) => {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key)!.add(listener);
    return { remove: () => listeners.get(key)!.delete(listener) };
  };
  const app = { currentState: "active", addEventListener: (key: string, fn: () => void) => add(`app:${key}`, fn) };
  const doc = { hidden: false, hasFocus: () => true,
    addEventListener: (key: string, fn: () => void) => add(`doc:${key}`, fn),
    removeEventListener: (key: string, fn: () => void) => listeners.get(`doc:${key}`)?.delete(fn) };
  const win = { addEventListener: add, removeEventListener: (key: string, fn: () => void) => listeners.get(key)?.delete(fn) };
  class Media {
    source: any; isLoaded = false; playing = false; released = false;
    id = media.length; volume = 1; playbackRate = 1; currentTime = 0;
    seek: (() => Promise<void>) | null = null;
    get currentStatus() { return { isLoaded: this.isLoaded }; }
    constructor(source: any) { this.source = source; media.push(this); }
    async seekTo() { if (this.released) throw new Error("seek after release"); await this.seek?.(); }
    play() { if (this.released) throw new Error("play after release"); events.push(`play:${this.id}:${this.source?.uri ?? this.source}`); this.playing = platform === "web" || this.isLoaded; return Promise.resolve(); }
    pause() { if (this.released) throw new Error("pause after release"); events.push(`pause:${this.id}`); this.playing = false; }
    // Installed iOS replaceCurrentSource pauses, then resumes only wasPlaying.
    replace(source: any) { const wasPlaying = this.playing; this.source = source; this.isLoaded = true; this.playing = wasPlaying; }
    release() { events.push(`release:${this.id}`); this.released = true; this.playing = false; }
    removeAttribute() {}
    load() {}
  }
  const sdkFile = resolve(ROOT, "node_modules/expo-audio/src/ExpoAudio.ts");
  const sdkSource = readFileSync(sdkFile, "utf8");
  const ast = ts.createSourceFile(sdkFile, sdkSource, ts.ScriptTarget.Latest, true);
  const declaration = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "useAudioPlayer")!;
  const compiled = ts.transpileModule(declaration.getText(ast).replace(/^export /, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const sdkHook = new Function("useMemo", "useEffect", "useReleasingSharedObject", "AudioModule", "resolveSource", "resolveSourceWithDownload", `${compiled};return useAudioPlayer;`)(
    react.useMemo, react.useEffect,
    (create: () => any, deps: any[]) => {
      const player = memo(create, deps);
      effect("passive", () => () => player.release(), [player]);
      return player;
    }, { AudioPlayer: Media }, (source: any) => ({ uri: `asset:${source}` }),
    (source: any) => new Promise((done) => downloads.push(() => done({ uri: `asset:${source}` }))),
  );
  const navigation = { isFocused: () => focused };
  const cache = new Map<string, any>();
  function load(file: string): any {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    cache.set(file, module.exports);
    const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const requireLocal = (name: string): any => {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx: (type: any, props: any) => ({ type, props }), jsxs: (type: any, props: any) => ({ type, props }) };
      if (name === "react-native") return {
        Platform: { OS: platform }, AppState: app,
        View: "View", StyleSheet: { create: (styles: any) => styles, absoluteFill: {} },
        Animated: { View: "AnimatedView", Value: class { interpolate(value: any) { return value; } setValue() {} },
          timing: () => { const animation = { complete: (_result: { finished: boolean }) => {}, stopped: false }; animations.push(animation);
            return { start: (complete: typeof animation.complete) => { animation.complete = complete; }, stop: () => { animation.stopped = true; } }; } },
        BackHandler: { addEventListener: (key: string, fn: () => void) => add(key, fn) },
      };
      if (name === "react-i18next") return { useTranslation: () => ({ t: (key: string) => key }) };
      if (name === "@/lib/motion/use-reduced-motion") return { useReducedMotionPref: () => captureState.reducedMotion };
      if (name === "@/lib/motion/pixel-physical") return { pixelStepsFor: () => undefined };
      if (name.endsWith(".wav")) return 2;
      if (name === "expo-router") return { useNavigation: () => navigation, useFocusEffect: (fn: () => any) => effect("passive", () => {
        const cleanup = fn();
        const subscription = add("route:blur", cleanup);
        return () => { subscription.remove(); cleanup?.(); };
      }, [fn]) };
      if (name === "expo-audio") return { useAudioPlayer: sdkHook, useAudioPlayerStatus: (player: Media) => status.override ?? player.currentStatus };
      if (name === "expo-asset") return { Asset: { fromModule: (source: number) => ({ uri: `asset:${source}` }) } };
      const base = name.startsWith("@/") ? resolve(ROOT, "src", name.slice(2)) : resolve(dirname(file), name);
      const target = [platform === "web" && `${base}.web.ts`, `${base}.ts`, `${base}.tsx`].find((path) => path && existsSync(path));
      if (!target) throw new Error(`Unexpected import ${name}`);
      return load(target);
    };
    new Function("require", "module", "exports", "window", "document", "Audio", code)(requireLocal, module, module.exports, win, doc, Media);
    return module.exports;
  }
  const hook = load(resolve(ROOT, `src/lib/audio/use-ui-sound${platform === "web" ? ".web" : ""}.ts`)).useUiSound;
  const commit = () => {
    for (const kind of ["layout", "passive"]) {
      for (const value of queued.filter((entry) => entry.kind === kind)) value.cleanup?.();
      for (const value of queued.filter((entry) => entry.kind === kind)) value.cleanup = value.create();
    }
    queued.length = 0;
  };
  return {
    media, downloads, events, app, doc, status, captureState, animations,
    render(source = 1, settings = options) { cursor = 0; const play = hook(source, settings); commit(); return play; },
    renderCapture(active = false) {
      cursor = 0;
      const { StarCapture } = load(resolve(ROOT, "src/components/deep-space/StarCapture.tsx"));
      const view = StarCapture({ active, onComplete: () => { captureState.completed++; }, onCancel: () => { captureState.cancelled++; } });
      commit(); return view;
    },
    emit(key: string, value: unknown = app.currentState) {
      if (key === "route:blur") focused = false;
      for (const fn of listeners.get(key) ?? []) (fn as any)(value);
    },
    unmount() { for (const kind of ["layout", "passive"]) for (const value of slots.filter((entry) => entry?.kind === kind)) value.cleanup?.(); },
  };
}

test("native cold shutter waits for the actual source, then plays once", async () => {
  const h = host("ios"); const play = h.render();
  play(); await flush();
  expect(h.events.filter((event) => event.startsWith("play:"))).toEqual([]);
  h.downloads.forEach((finish) => finish()); await flush();
  h.media[0].isLoaded = true; h.render(); await flush();
  expect(h.media[0].playing).toBe(true);
  expect(h.events.filter((event) => event.startsWith("play:"))).toHaveLength(1);
});

test.each(["ios", "web"] as const)("%s prepares one silent shutter player for a journey and reuses it for capture", async (platform) => {
  const h = host(platform);
  expect(h.renderCapture(false)).toBeNull();
  expect(h.media).toHaveLength(1); expect(h.animations).toHaveLength(0);
  h.media[0].isLoaded = true; h.renderCapture(false); await flush();
  expect(h.events.filter((event) => event.startsWith("play:"))).toEqual([]);
  expect(h.renderCapture(true)).not.toBeNull(); await flush();
  expect(h.media).toHaveLength(1);
  expect(h.events.filter((event) => event.startsWith("play:"))).toHaveLength(1);
  h.renderCapture(true); await flush();
  expect(h.animations).toHaveLength(1);
  expect(h.events.filter((event) => event.startsWith("play:"))).toHaveLength(1);
  expect(h.renderCapture(false)).toBeNull();
  expect(h.media[0].playing).toBe(false); expect(h.animations[0].stopped).toBe(true);
  h.animations[0].complete({ finished: true });
  expect(h.captureState.completed).toBe(0);
  h.renderCapture(true); await flush();
  expect(h.media).toHaveLength(1);
  expect(h.events.filter((event) => event.startsWith("play:"))).toHaveLength(2);
});

test.each(["hardwareBackPress", "app:change", "blur", "keydown"])("capture %s cancels its pending audio and completion", async (event) => {
  const h = host(event === "hardwareBackPress" ? "android" : "web");
  h.renderCapture(false); h.media[0].isLoaded = true; h.renderCapture(true); await flush();
  h.app.currentState = "background";
  h.emit(event, event === "keydown" ? { key: "Escape", preventDefault() {} } : "background");
  expect(h.media[0].playing).toBe(false); expect(h.captureState.cancelled).toBe(1);
  h.animations[0].complete({ finished: true });
  expect(h.captureState.completed).toBe(0);
});

test("an unavailable native shutter never delays navigation or plays after capture cleanup", async () => {
  const h = host("ios"); h.renderCapture(false); h.renderCapture(true);
  h.animations[0].complete({ finished: true });
  expect(h.captureState.completed).toBe(1);
  h.renderCapture(false); h.media[0].isLoaded = true; h.renderCapture(false); await flush();
  expect(h.events.filter((event) => event.startsWith("play:"))).toEqual([]);
});

test.each(["ios", "web"] as const)("%s journey unmount cancels the active exposure and delayed audio", async (platform) => {
  const h = host(platform); h.renderCapture(false); h.media[0].isLoaded = true;
  let finish!: () => void;
  if (platform === "ios") h.media[0].seek = () => new Promise<void>((resolve) => { finish = resolve; });
  h.renderCapture(true); h.emit("route:blur"); h.unmount(); finish?.(); await flush();
  h.animations[0].complete({ finished: true });
  expect(h.captureState.completed).toBe(0); expect(h.media[0].playing).toBe(false);
  if (platform === "ios") {
    expect(h.events.filter((event) => event.startsWith("play:"))).toEqual([]);
    expect(h.events.indexOf("pause:0")).toBeLessThan(h.events.indexOf("release:0"));
  }
});

test("reduced motion stays silent during preparation and completes capture immediately", async () => {
  const h = host("web"); h.captureState.reducedMotion = true;
  expect(h.renderCapture(false)).toBeNull(); expect(h.captureState.completed).toBe(0);
  expect(h.renderCapture(true)).toBeNull(); await flush();
  expect(h.captureState.completed).toBe(1); expect(h.animations).toHaveLength(0);
  expect(h.events.filter((event) => event.startsWith("play:"))).toEqual([]);
});

test("native source changes cannot play the previous loaded clip", async () => {
  const h = host("ios"); h.render(1); h.downloads.forEach((finish) => finish()); await flush();
  h.media[0].isLoaded = true; h.render(1);
  const next = h.render(2); next(); await flush();
  expect(h.events.filter((event) => event.startsWith("play:"))).toEqual([]);
  const current = h.media.at(-1); current.isLoaded = true; h.render(2); await flush();
  expect(h.events.filter((event) => event.startsWith("play:"))).toEqual([`play:${current.id}:asset:2`]);
});

test("a retained loaded status from the old SDK emitter cannot ready the new source", async () => {
  const h = host("ios"); h.render(1); h.media[0].isLoaded = true; h.render(1);
  // expo useEvent retains its useState value until the new emitter sends an event.
  h.status.override = { id: h.media[0].id, isLoaded: true };
  const play = h.render(2); play(); await flush();
  expect(h.events.filter((event) => event.startsWith("play:"))).toEqual([]);
  h.media[1].isLoaded = true;
  h.status.override = { id: h.media[1].id, isLoaded: true }; h.render(2); await flush();
  expect(h.events.filter((event) => event.startsWith("play:"))).toEqual(["play:1:asset:2"]);
});

test.each(["blur", "route:blur", "app:change", "doc:visibilitychange"])("web one-shot stops immediately on %s and does not replay on return", async (event) => {
  const h = host("web"); const play = h.render(); play(); await flush();
  expect(h.media[0].playing).toBe(true);
  h.app.currentState = "background"; h.doc.hidden = true; h.emit(event);
  expect(h.media[0].playing).toBe(false);
  h.app.currentState = "active"; h.doc.hidden = false; h.emit("focus"); h.emit("app:change"); h.emit("doc:visibilitychange");
  expect(h.media[0].playing).toBe(false);
});

test("native blur discards a queued cold cue and return does not resurrect it", async () => {
  const h = host("ios"); const play = h.render(); play(); h.emit("route:blur");
  h.downloads.forEach((finish) => finish()); await flush(); h.media[0].isLoaded = true; h.render(); await flush();
  expect(h.events.filter((event) => event.startsWith("play:"))).toEqual([]);
});

test("native unmount pauses before SDK release and drops a delayed seek", async () => {
  const h = host("ios"); h.render(); h.media[0].isLoaded = true; const play = h.render();
  let finish!: () => void; h.media[0].seek = () => new Promise<void>((resolve) => { finish = resolve; });
  play(); h.unmount(); finish(); await flush();
  expect(h.events.indexOf("pause:0")).toBeGreaterThanOrEqual(0);
  expect(h.events.indexOf("pause:0")).toBeLessThan(h.events.indexOf("release:0"));
  expect(h.events.filter((event) => event.startsWith("play:"))).toEqual([]);
});

test.each(["ios", "android"] as const)("%s background cancels a pending seek without replay on resume", async (platform) => {
  const h = host(platform); h.render(); h.media[0].isLoaded = true; const play = h.render();
  let finish!: () => void; h.media[0].seek = () => new Promise<void>((resolve) => { finish = resolve; });
  play(); h.app.currentState = "background"; h.emit("app:change"); finish(); await flush();
  h.app.currentState = "active"; h.emit("app:change"); await flush();
  expect(h.events).toContain("pause:0");
  expect(h.events.filter((event) => event.startsWith("play:"))).toEqual([]);
});

test("Android notification blur discards a cold cue and focus permits only a fresh request", async () => {
  const h = host("android"); const play = h.render(); play(); h.emit("app:blur");
  h.media[0].isLoaded = true; h.render(); play(); await flush();
  expect(h.events.filter((event) => event.startsWith("play:"))).toEqual([]);
  h.emit("app:focus"); await flush();
  expect(h.events.filter((event) => event.startsWith("play:"))).toEqual([]);
  play(); await flush();
  expect(h.events.filter((event) => event.startsWith("play:"))).toHaveLength(1);
});

test("web visibility restoration does not reopen a separately blurred window", async () => {
  const h = host("web"); const play = h.render(); h.emit("blur");
  h.doc.hidden = false; h.emit("doc:visibilitychange"); play(); await flush();
  expect(h.events.filter((event) => event.startsWith("play:"))).toEqual([]);
  h.emit("focus"); play(); await flush();
  expect(h.events.filter((event) => event.startsWith("play:"))).toHaveLength(1);
});

test("web unmount disposes once and a retained callback cannot restart it", async () => {
  const h = host("web"); const play = h.render(); play(); await flush(); h.unmount(); play(); await flush();
  expect(h.media[0].playing).toBe(false);
  expect(h.events.filter((event) => event.startsWith("play:"))).toHaveLength(1);
});

test.each(["pointercancel", "keydown"])("web %s cancels the current one-shot", async (event) => {
  const h = host("web"); h.render()(); await flush(); h.emit(event, { key: "Escape" });
  expect(h.media[0].playing).toBe(false);
});

test("native source change cancels an old pending seek and stale callback", async () => {
  const h = host("ios"); h.render(1); h.media[0].isLoaded = true; const oldPlay = h.render(1);
  let finish!: () => void; h.media[0].seek = () => new Promise<void>((resolve) => { finish = resolve; });
  oldPlay(); h.render(2); h.media[1].isLoaded = true; h.render(2); oldPlay(); finish(); await flush();
  expect(h.events.filter((event) => event.startsWith("play:"))).toEqual([]);
  expect(h.events.indexOf("pause:0")).toBeLessThan(h.events.indexOf("release:0"));
});

test("native volume, playback rate and minimum interval remain effective", async () => {
  const clock = jest.spyOn(Date, "now").mockReturnValue(1000);
  try {
    const h = host("ios"); const settings = { ...options, minIntervalMs: 160 };
    h.render(1, settings); h.media[0].isLoaded = true; const play = h.render(1, settings);
    expect(h.media[0].volume).toBe(options.volume); expect(h.media[0].playbackRate).toBe(options.playbackRate);
    play(); await flush(); clock.mockReturnValue(1159); play(); await flush();
    expect(h.events.filter((event) => event.startsWith("play:"))).toHaveLength(1);
    clock.mockReturnValue(1160); play(); await flush();
    expect(h.events.filter((event) => event.startsWith("play:"))).toHaveLength(2);
  } finally { clock.mockRestore(); }
});
