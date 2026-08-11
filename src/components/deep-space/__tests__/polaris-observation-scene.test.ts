import fs from "node:fs";
import path from "node:path";

jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("react-native", () => ({
  AppState: { addEventListener: jest.fn(), currentState: "active" },
  Platform: { select: ({ default: fallback }: { default: unknown }) => fallback },
  StyleSheet: { absoluteFill: {}, create: (styles: unknown) => styles },
  View: () => null,
  useWindowDimensions: () => ({ width: 320, height: 640 }),
}));
jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: { View: () => null },
  Easing: { linear: jest.fn() },
  Extrapolation: { CLAMP: "clamp" },
  cancelAnimation: jest.fn(),
  interpolate: jest.fn(),
  useAnimatedStyle: jest.fn(),
  useDerivedValue: jest.fn(),
  useSharedValue: jest.fn(),
  withRepeat: jest.fn(),
  withTiming: jest.fn(),
}));

import {
  POLARIS_OBSERVATION_DURATION_MS,
  getPolarisObservationPhase,
} from "../PolarisObservationScene";

const SOURCE = fs.readFileSync(path.resolve(__dirname, "../PolarisObservationScene.tsx"), "utf8");

describe("PolarisObservationScene", () => {
  test.each([
    [0, "fade-in"],
    [800, "establish"],
    [2_200, "enter"],
    [4_800, "setup"],
    [7_200, "observe"],
    [9_000, "focus"],
    [11_600, "flash"],
    [12_300, "fade-out"],
    [POLARIS_OBSERVATION_DURATION_MS, "fade-out"],
  ] as const)("maps %i ms to %s", (timeMs, phase) => {
    expect(getPolarisObservationPhase(timeMs)).toBe(phase);
  });

  test("keeps the cutscene on one lifecycle-safe UI-thread clock", () => {
    expect(SOURCE).toContain("useSharedValue(0)");
    expect(SOURCE).toContain('AppState.addEventListener("change"');
    expect(SOURCE).toContain("cancelAnimation(clock)");
    expect(SOURCE).toContain("useReducedMotionPref()");
  });

  test("uses theme tokens instead of component color literals", () => {
    expect(SOURCE).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(SOURCE).not.toMatch(/rgba?\(/i);
    expect(SOURCE).toContain("deepSpace.bgEdge");
  });
});
