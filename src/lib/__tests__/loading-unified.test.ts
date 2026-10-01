// One North Star wait, everywhere.
//
// Loading your own data used to look like a different app depending on which
// screen you were on:
//   - a blinking pixel-dot matrix   (PremiumLoadingState, ~39 screens — a
//                                    leftover of the legacy cosmic-pixel skin)
//   - a bare cyan ActivityIndicator (the live sign-in/sign-up/reset screens,
//                                    top-aligned on a blank background because
//                                    ddsStyles.center has no flex:1 and the early
//                                    return skips AuthShell)
//   - the breathing 세컨비 head      (InlineLoader / DeepSpaceLoader "dots")
//
// The North Star loader is now the single wait. DeepSpaceLoader is the shared
// choke point for InlineLoader and PremiumLoadingState, so changing it updates
// every route/data wait instead of leaving a cold-refresh exception behind.
//
// NOTE: the boot screen (ui/LoadingScreen.tsx) is deliberately NOT covered — it
// is the one-time first-entry experience (typewriter + tap to open), not a
// data wait.

import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..");
/** Normalize CRLF: the repo checks out CRLF on Windows, and a scanner that
 *  silently matches nothing still reports PASS -- worse than no scanner. */
const read = (f: string): string => readFileSync(join(ROOT, f), "utf8").replace(/\r\n/g, "\n");

const premiumFeedback = read("src/components/premium/feedback.tsx");
const ddsAuth = read("src/screens/deepspace/dds-auth-screens.tsx");
const loader = read("src/components/deepspace/DeepSpaceLoader.tsx");
const loadingPolaris = read("src/components/deepspace/LoadingPolaris.tsx");
const inlineLoader = read("src/components/ui/InlineLoader.tsx");
const backgroundDock = read("src/components/deepspace/BackgroundTaskDock.tsx");
const reasoning = read("src/app/reasoning.tsx");

describe("every data wait is the North Star loader", () => {
  test("the scanner is actually reading the files (not vacuously passing)", () => {
    expect(premiumFeedback).toContain("export function PremiumLoadingState");
    expect(ddsAuth.length).toBeGreaterThan(1000);
    expect(loader).toContain("export function DeepSpaceLoader");
  });

  test("PremiumLoadingState renders the shared loader, not the pixel glyph", () => {
    // ~39 screens route through this one function, so it is the whole ballgame.
    expect(premiumFeedback).toMatch(
      /export function PremiumLoadingState[\s\S]{0,240}<DeepSpaceLoader variant="dots"/,
    );
    expect(premiumFeedback).not.toContain("PixelLoadingGlyph");
    expect(premiumFeedback).not.toContain("LOADING_DOT_PATTERN");
  });

  test("InlineLoader is still the same shared loader", () => {
    expect(inlineLoader).toContain('<DeepSpaceLoader variant="dots"');
  });

  test("every DeepSpaceLoader variant uses Polaris and none uses the mascot head", () => {
    expect(loader).toContain('import { LoadingPolaris } from "@/components/deepspace/LoadingPolaris"');
    expect(loader.match(/<LoadingPolaris\b/g)).toHaveLength(3);
    expect(loader).not.toContain("SecondbHead");
  });

  test("background and long-running task indicators use the same Polaris", () => {
    expect(backgroundDock).toContain("<LoadingPolaris");
    expect(backgroundDock).not.toContain("SecondbHead");
    expect(reasoning).toMatch(/phase === "running"[\s\S]{0,240}<LoadingPolaris/);
  });

  test("the live auth screens show the branded loader, not a bare spinner", () => {
    expect(ddsAuth).toContain("<InlineLoader />");
    // Nothing may reintroduce a raw spinner here -- not even the import.
    expect(ddsAuth).not.toContain("ActivityIndicator");
  });

  test("the Polaris loader fills, twinkles, and honours the reduce-motion pref", () => {
    // The pixel glyph it replaced checked this pref. Promoting the head loader
    // app-wide must not quietly drop that promise.
    expect(loadingPolaris).toContain("useReducedMotionPref");
    expect(loadingPolaris).toContain("Animated.timing(fillProgress");
    expect(loadingPolaris).toContain("Animated.loop(");
    expect(loadingPolaris).toContain("twinkleLoop.stop()");
  });
});
