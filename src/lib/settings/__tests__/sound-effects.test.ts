import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { areSoundEffectsOn } from "../../audio/ui-sound-player";
import {
  DEFAULT_SOUND_EFFECTS,
  SOUND_EFFECTS_KEY,
  __resetSoundEffectsForTests,
  isSoundEffectsEnabled,
  parseSoundEffects,
  setSoundEffects,
} from "../sound-effects";

// Node test env: pin the web path with an in-memory localStorage shim (same as lite-mode.test).
const store = new Map<string, string>();
beforeAll(() => {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  };
});
afterAll(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});
beforeEach(() => {
  store.clear();
  __resetSoundEffectsForTests();
});

describe("sound effects preference (Q-261005-02 = A)", () => {
  test("defaults to on", () => {
    expect(DEFAULT_SOUND_EFFECTS).toBe(true);
    expect(isSoundEffectsEnabled()).toBe(true);
    expect(areSoundEffectsOn()).toBe(true);
  });

  test("round-trips through storage and drives the players' switch", () => {
    setSoundEffects(false);
    expect(store.get(SOUND_EFFECTS_KEY)).toBe("off");
    expect(isSoundEffectsEnabled()).toBe(false);
    expect(areSoundEffectsOn()).toBe(false);
    setSoundEffects(true);
    expect(store.get(SOUND_EFFECTS_KEY)).toBe("on");
    expect(areSoundEffectsOn()).toBe(true);
  });

  test("garbage stored values fall back to on instead of throwing", () => {
    store.set(SOUND_EFFECTS_KEY, "weird");
    expect(parseSoundEffects("weird")).toBeNull();
    expect(isSoundEffectsEnabled()).toBe(true);
  });

  test("a stored 'off' reaches the players when the module loads", () => {
    store.set(SOUND_EFFECTS_KEY, "off");
    jest.isolateModules(() => {
      const players = require("../../audio/ui-sound-player") as typeof import("../../audio/ui-sound-player");
      require("../sound-effects");
      expect(players.areSoundEffectsOn()).toBe(false);
    });
  });
});

describe("where the switch lives", () => {
  const root = resolve(__dirname, "../../../..");
  const read = (path: string) => readFileSync(resolve(root, path), "utf8");

  test("the theme screen shows the toggle next to reduce motion", () => {
    const screen = read("src/screens/deepspace/DeepSpaceDesignScreens.tsx");
    const theme = screen.slice(screen.indexOf("export function DeepSpaceThemeScreen"), screen.indexOf("export { DeepSpacePlansScreen }"));
    expect(theme).toContain("const { soundEffects, setSoundEffects } = useSoundEffects();");
    expect(theme).toContain('<Toggle label={t("theme.soundEffects")} on={soundEffects} onPress={() => setSoundEffects(!soundEffects)} />');
    expect(theme.indexOf('t("theme.reduceMotion")')).toBeLessThan(theme.indexOf('t("theme.soundEffects")'));
  });

  test("the root layout loads the stored value at module scope, before the opening mounts", () => {
    const layout = read("src/app/_layout.tsx");
    const call = layout.indexOf("\nensureSoundEffectsHydration();");
    expect(layout).toContain('import { ensureSoundEffectsHydration } from "@/lib/settings/sound-effects";');
    expect(call).toBeGreaterThan(-1);
    expect(call).toBeLessThan(layout.indexOf("export default function RootLayout"));
  });

  test("the opening has no sound toggle of its own (10-03 decision stays)", () => {
    expect(read("src/components/ui/LoadingScreen.tsx")).not.toContain("useSoundEffects");
  });
});
