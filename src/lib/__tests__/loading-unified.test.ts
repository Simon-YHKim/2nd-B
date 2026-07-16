// One wait, everywhere.
//
// Loading your own data used to look like a different app depending on which
// screen you were on:
//   - a blinking pixel-dot matrix   (PremiumLoadingState, ~39 screens — a
//                                    leftover of the legacy cosmic-pixel skin)
//   - a bare cyan ActivityIndicator (the live sign-in/sign-up/reset screens,
//                                    top-aligned on a blank background because
//                                    ddsStyles.center has no flex:1 and the early
//                                    return skips AuthShell)
//   - the breathing 세컨비 head      (InlineLoader / DeepSpaceLoader "dots" — what
//                                    the constellation home actually shows)
//
// The head loader is now the single wait. DeepSpaceLoader's own header already
// claimed it "replaces the bare ActivityIndicator across deep-space screens";
// these guards make that true instead of aspirational.
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
const inlineLoader = read("src/components/ui/InlineLoader.tsx");

describe("every data wait is the 세컨비 head loader", () => {
  test("the scanner is actually reading the files (not vacuously passing)", () => {
    expect(premiumFeedback).toContain("export function PremiumLoadingState");
    expect(ddsAuth.length).toBeGreaterThan(1000);
    expect(loader).toContain("export function DeepSpaceLoader");
  });

  test("PremiumLoadingState renders the head loader, not the pixel glyph", () => {
    // ~39 screens route through this one function, so it is the whole ballgame.
    expect(premiumFeedback).toMatch(
      /export function PremiumLoadingState[\s\S]{0,240}<DeepSpaceLoader variant="dots"/,
    );
    expect(premiumFeedback).not.toContain("PixelLoadingGlyph");
    expect(premiumFeedback).not.toContain("LOADING_DOT_PATTERN");
  });

  test("InlineLoader is still the same head loader (the home's wait)", () => {
    expect(inlineLoader).toContain('<DeepSpaceLoader variant="dots"');
  });

  test("the live auth screens show the branded loader, not a bare spinner", () => {
    expect(ddsAuth).toContain("<InlineLoader />");
    // Nothing may reintroduce a raw spinner here -- not even the import.
    expect(ddsAuth).not.toContain("ActivityIndicator");
  });

  test("the head loader honours the reduce-motion pref", () => {
    // The pixel glyph it replaced checked this pref. Promoting the head loader
    // app-wide must not quietly drop that promise.
    expect(loader).toContain("useReducedMotionPref");
  });
});
