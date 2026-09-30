// 라쳇 햅틱: 소리의 딸깍임마다 짧고 약한 진동 한 번 (Simon 2026-10-01).
//
// 값 테스트는 박자 · 간격 · 플랫폼을, 소스 테스트는 "소리가 나는 모든 곳에
// 진동이 붙어 있는가"를 본다. 렌더 테스트는 막혀 있다(RN 0.85).

import { readFileSync } from "node:fs";
import { join } from "node:path";

jest.mock("react-native", () => ({ Platform: { OS: "android" }, Vibration: { vibrate: jest.fn() } }));

import { Vibration } from "react-native";

import {
  RATCHET_CLICK_MS,
  RATCHET_PULSE_MS,
  createRatchetLoop,
  createRatchetTick,
  ratchetHapticsSupported,
  ratchetPulse,
} from "../ratchet-haptics";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");

describe("the beat matches the ratchet sound", () => {
  test("observatory-ratchet.wav loops every 160 ms, so the haptic does too", () => {
    const wav = readFileSync(join(process.cwd(), "assets/audio/observatory-ratchet.wav"));
    const rate = wav.readUInt32LE(24);
    const channels = wav.readUInt16LE(22);
    const bits = wav.readUInt16LE(34);
    const dataAt = wav.indexOf("data");
    const bytes = wav.readUInt32LE(dataAt + 4);
    const ms = (bytes / (channels * (bits / 8)) / rate) * 1000;
    expect(Math.round(ms)).toBe(RATCHET_CLICK_MS);
  });

  test("a pulse is short and weak: 10 ms, well under one click", () => {
    expect(RATCHET_PULSE_MS).toBe(10);
    expect(RATCHET_PULSE_MS).toBeLessThan(RATCHET_CLICK_MS / 8);
  });
});

describe("platforms", () => {
  test("Android and web pulse; iOS stays silent (its Vibration ignores the duration)", () => {
    expect(ratchetHapticsSupported("android")).toBe(true);
    expect(ratchetHapticsSupported("web")).toBe(true);
    expect(ratchetHapticsSupported("ios")).toBe(false);
  });

  test("a pulse asks for exactly RATCHET_PULSE_MS", () => {
    ratchetPulse();
    expect(Vibration.vibrate).toHaveBeenLastCalledWith(RATCHET_PULSE_MS);
  });
});

describe("loop while the camera moves", () => {
  test("pulses at once, then every click, and stops cleanly", () => {
    const pulse = jest.fn();
    let tickFn: (() => void) | null = null;
    const cleared: unknown[] = [];
    const loop = createRatchetLoop(pulse, {
      setInterval: ((fn: () => void, ms: number) => {
        expect(ms).toBe(RATCHET_CLICK_MS);
        tickFn = fn;
        return 7 as unknown as ReturnType<typeof setInterval>;
      }) as never,
      clearInterval: ((id: unknown) => cleared.push(id)) as never,
    });
    loop.set(true);
    expect(pulse).toHaveBeenCalledTimes(1);
    loop.set(true); // repeated "moving" does not stack a second timer
    tickFn!();
    tickFn!();
    expect(pulse).toHaveBeenCalledTimes(3);
    loop.set(false);
    loop.set(false);
    expect(cleared).toEqual([7]);
  });
});

describe("one-shot tick", () => {
  test("throttled like the tick sound (160 ms)", () => {
    const pulse = jest.fn();
    let now = 1000;
    const tick = createRatchetTick(pulse, () => now);
    tick();
    now += 100;
    tick();
    now += 60;
    tick();
    expect(pulse).toHaveBeenCalledTimes(2);
  });
});

describe("every ratchet sound carries the haptic", () => {
  test("the loop hook starts and stops the haptic with the sound", () => {
    const src = read("src/lib/audio/use-motion-sound.ts");
    expect(src).toMatch(/const setMoving = useCallback\(\(moving: boolean\) => \{\n\s+setSound\(moving\);\n\s+haptics\.current\?\.set\(moving\);/);
    expect(src).toMatch(/useEffect\(\(\) => \(\) => haptics\.current\?\.set\(false\), \[\]\);/);
    // The sound is only ever driven through setMoving.
    expect(src.match(/setSound\(/g)).toHaveLength(1);
  });

  test("every telescope tick sound also pulses", () => {
    const src = read("src/components/deep-space/TelescopeControls.tsx");
    const sounds = src.match(/playTick\(\)/g) ?? [];
    const withHaptic = src.match(/playTick\(\); hapticTick\.current\?\.\(\);/g) ?? [];
    expect(sounds.length).toBeGreaterThan(0);
    expect(withHaptic.length).toBe(sounds.length);
  });

  test("Android declares VIBRATE (a normal permission, no prompt)", () => {
    const app = JSON.parse(read("app.json")) as { expo: { android: { permissions: string[] } } };
    expect(app.expo.android.permissions).toContain("android.permission.VIBRATE");
  });
});
