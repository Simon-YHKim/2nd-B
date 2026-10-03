import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import ts from "typescript";

const { renderToStaticMarkup } = require("react-dom/server") as { renderToStaticMarkup: (element: React.ReactNode) => string };
const ROOT = path.resolve(__dirname, "../../..");
const SCREEN = path.join(ROOT, "src/components/ui/LoadingScreen.tsx");
const ENGINE = path.join(ROOT, "src/lib/opening/hustlek-approved.ts");
const END = 10119.523809523811;
type Plan = { phase: "story" | "waiting-ready" | "ready" | "done"; shouldContinue: boolean };
type Clock = { elapsed: () => number; start: () => void; pause: () => void };
type Module = {
  openingStateAt: (input: { elapsedMs: number; readyAtMs: number | null; tapAtMs: number | null; reducedMotion: boolean }) => Plan;
  createOpeningClock: (now?: () => number) => Clock;
  createOpeningTicker: (clock: Pick<Clock, "elapsed">, onTick: (elapsed: number) => void) => () => void;
  deliverContinueOnce: (gate: { current: boolean }, onContinue?: () => void) => void;
  LoadingScreen: React.ComponentType<{ ready?: boolean; onContinue?: () => void }>;
};

function loadEngine() {
  const loaded = { exports: {} as Record<string, unknown> };
  const output = ts.transpileModule(readFileSync(ENGINE, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const ids = new Map<string, number>();
  const requireAsset = (id: string) => {
    if (id.endsWith(".json")) return JSON.parse(readFileSync(path.resolve(path.dirname(ENGINE), id), "utf8"));
    if (!/\.(png|wav)$/.test(id)) throw new Error("Unexpected approved opening dependency: " + id);
    if (!ids.has(id)) ids.set(id, ids.size + 1);
    return ids.get(id);
  };
  new Function("require", "module", "exports", output)(requireAsset, loaded, loaded.exports);
  return loaded.exports;
}

function host(tag: string) {
  return function Host({ children, style, testID, ...props }: React.PropsWithChildren<Record<string, unknown>>) {
    const flat = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;
    return React.createElement(tag, {
      style: flat, "data-testid": testID,
      "aria-label": props.accessibilityLabel, "aria-hidden": props.accessibilityElementsHidden,
      role: props.accessibilityRole, disabled: tag === "button" ? props.disabled : undefined,
      "data-source": props.source, "data-transition": props.transition, "data-cache": props.cachePolicy,
    }, children);
  };
}

function loadScreen(platform: "ios" | "web" = "ios"): Module {
  const loaded = { exports: {} as Module }, engine = loadEngine();
  const output = ts.transpileModule(readFileSync(SCREEN, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const requireScreen = (id: string): unknown => {
    if (id === "react" || id === "react/jsx-runtime") return require(id);
    if (id === "react-native") return { AppState: { currentState: "active", addEventListener: jest.fn(() => ({ remove: jest.fn() })) }, Platform: { OS: platform }, Pressable: host("button"), View: host("section"), StyleSheet: { create: (value: unknown) => value, absoluteFillObject: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 } }, useWindowDimensions: () => ({ width: 390, height: 844 }) };
    if (id === "expo-image") return { Image: Object.assign(host("picture"), { prefetch: jest.fn().mockResolvedValue(true) }) };
    if (id === "expo-asset") return { Asset: { loadAsync: jest.fn().mockResolvedValue([]) } };
    if (id === "expo-status-bar") return { StatusBar: host("status-bar") };
    if (id === "react-native-safe-area-context") return { useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) };
    if (id === "react-i18next") return { useTranslation: () => ({ t: (key: string) => key }) };
    if (id === "@/components/ui/PlainText") return { PlainText: host("span") };
    if (id === "@/lib/motion/use-reduced-motion") return { useReducedMotionPref: () => false };
    if (id === "@/lib/audio/use-opening-sounds") return { useOpeningSounds: () => ({ enabled: platform !== "web", ready: true, setEnabled: jest.fn(), play: jest.fn(), stop: jest.fn(), unlock: jest.fn().mockResolvedValue(true) }) };
    if (id === "@/lib/opening/hustlek-approved") return engine;
    if (id === "@/lib/theme/tokens") return { deepSpace: { bgEdge: "#000", accentDim: "#123", textHi: "#fff", textMuted: "#aaa" }, typography: { sizes: { xs: 12 } } };
    if (id === "@/theme/typography") return { fontFamilies: { pixelKo: "Galmuri11" } };
    throw new Error("Unexpected loading runtime dependency: " + id);
  };
  new Function("require", "module", "exports", output)(requireScreen, loaded, loaded.exports);
  return loaded.exports;
}

function stateAt(time: number, patch: Partial<{ readyAtMs: number | null; tapAtMs: number | null; reducedMotion: boolean }> = {}) {
  return loadScreen().openingStateAt({ elapsedMs: time, readyAtMs: 0, tapAtMs: null, reducedMotion: false, ...patch });
}

describe("approved opening readiness", () => {
  test("normal completion waits for every approved beat instead of the retired four seconds", () => {
    expect(stateAt(4000)).toEqual({ phase: "story", shouldContinue: false });
    expect(stateAt(END - 0.001)).toEqual({ phase: "story", shouldContinue: false });
    expect(stateAt(END)).toEqual({ phase: "done", shouldContinue: true });
  });

  test("unresolved app readiness never times out into the app, including a skip request", () => {
    for (const time of [9000, END, 30000, 600000]) {
      expect(stateAt(time, { readyAtMs: null }).shouldContinue).toBe(false);
      expect(stateAt(time, { readyAtMs: null, tapAtMs: 500 })).toEqual({ phase: "waiting-ready", shouldContinue: false });
    }
    expect(stateAt(END + 100, { readyAtMs: END + 500 })).toEqual({ phase: "waiting-ready", shouldContinue: false });
    expect(stateAt(END + 500, { readyAtMs: END + 500 })).toEqual({ phase: "done", shouldContinue: true });
  });

  test("an explicit skip is immediate once auth and profile are ready", () => {
    expect(stateAt(500, { tapAtMs: 500 })).toEqual({ phase: "done", shouldContinue: true });
    expect(stateAt(500, { readyAtMs: 600, tapAtMs: 500 }).shouldContinue).toBe(false);
    expect(stateAt(600, { readyAtMs: 600, tapAtMs: 500 }).shouldContinue).toBe(true);
  });

  test("reduced motion holds a static final scene for 1200ms and still waits for readiness", () => {
    expect(stateAt(1199, { reducedMotion: true }).shouldContinue).toBe(false);
    expect(stateAt(1200, { reducedMotion: true })).toEqual({ phase: "done", shouldContinue: true });
    expect(stateAt(30000, { reducedMotion: true, readyAtMs: null })).toEqual({ phase: "waiting-ready", shouldContinue: false });
  });

  test("tap and automatic completion cannot deliver the continuation twice", () => {
    const module = loadScreen(), gate = { current: false }, continued = jest.fn();
    module.deliverContinueOnce(gate, continued); module.deliverContinueOnce(gate, continued);
    expect(continued).toHaveBeenCalledTimes(1); expect(gate.current).toBe(true);
  });
});

describe("opening playback clock", () => {
  test("background pause excludes hidden time and repeated start preserves elapsed time", () => {
    let now = 1000;
    const clock = loadScreen().createOpeningClock(() => now);
    expect(clock.elapsed()).toBe(0); clock.start(); now += 250; clock.start(); expect(clock.elapsed()).toBe(250);
    clock.pause(); now += 60000; expect(clock.elapsed()).toBe(250); clock.pause(); expect(clock.elapsed()).toBe(250);
    clock.start(); now += 150; expect(clock.elapsed()).toBe(400); clock.pause(); expect(clock.elapsed()).toBe(400);
  });

  test("16ms ticker cleanup removes its timer and cannot continue ticking after unmount", () => {
    jest.useFakeTimers(); jest.setSystemTime(1000);
    try {
      const module = loadScreen(), clock = module.createOpeningClock(), tick = jest.fn(); clock.start();
      const cancel = module.createOpeningTicker(clock, tick); jest.advanceTimersByTime(48);
      expect(tick.mock.calls.map(([elapsed]) => elapsed)).toEqual([16, 32, 48]);
      cancel(); clock.pause(); expect(jest.getTimerCount()).toBe(0); jest.advanceTimersByTime(1000); expect(tick).toHaveBeenCalledTimes(3);
    } finally { jest.useRealTimers(); }
  });
});

describe("approved opening screen", () => {
  test.each(["ios", "web"] as const)("%s uses approved images with no visible buttons, tap anywhere to skip", platform => {
    const module = loadScreen(platform), markup = renderToStaticMarkup(React.createElement(module.LoadingScreen, { ready: true }));
    expect(markup).toContain('data-testid="hustlek-approved-opening"');
    expect(markup).toContain('data-testid="opening-background"'); expect(markup).toContain('data-testid="opening-telescope"');
    expect(markup).toContain('data-testid="opening-polaris"'); expect(markup).not.toContain('data-testid="opening-sound"'); expect(markup).toContain('data-testid="opening-skip"');
    expect(markup).not.toContain("<svg");
    const source = readFileSync(SCREEN, "utf8");
    expect(source).toContain('from "expo-image"'); expect(source).toContain('cachePolicy="memory-disk"'); expect(source).toContain("transition={0}");
    expect(source).toContain("soundRef.current.stop()"); expect(source).toContain("clock.current.pause()"); expect(source).not.toContain("hustlek-opening-v2.json");
  });

  test("all five loading namespaces retain PolaScope, parity, and current-main B wording", () => {
    const languages = ["en", "ko", "es", "pt", "id"];
    const namespaces = languages.map(language => JSON.parse(readFileSync(path.join(ROOT, "locales", language, "common.json"), "utf8")).loadingGate as Record<string, string>);
    for (const namespace of namespaces) {
      expect(Object.keys(namespace).sort()).toEqual(Object.keys(namespaces[0]).sort());
      for (const key of ["hint", "open", "opening", "loading"]) expect(namespace[key]).toContain("PolaScope");
      for (const key of ["skip", "skipHint", "retry"]) expect(namespace[key].length).toBeGreaterThan(0);
    }
    expect(namespaces[1].enterHint).toBe("두 번 탭하면 메인 화면으로 이동합니다.");
  });
});
