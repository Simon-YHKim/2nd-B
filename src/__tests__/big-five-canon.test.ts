import fs from "node:fs";
import path from "node:path";

/**
 * Locks the canon wiring of the Big Five (BFI-44) screen.
 *
 * The validated 44-item questionnaire is the ONLY writer of the `bfi`-tagged
 * record that `loadLatestBfi` reads and that `buildPersona`'s `traitsSource:
 * "bfi"` branch needs. Before this fix the deep-space (= shipped default) lens
 * rendered a read-only trait view whose empty-state CTA routed to `/interview`,
 * which never writes `bfi` — so a deep-space-only user could never populate the
 * Big Five lens and the persona silently degraded to the journal heuristic.
 *
 * Source-discipline test (read the source, assert the invariant) mirroring
 * ui-mode-flags.test.ts / deep-space-canon-no-legacy.test.ts, so it needs no
 * React Native render mocks and stays robust across deep-space churn.
 *
 * NOTE: this lives in src/__tests__ (NOT src/app/__tests__) on purpose — anything
 * under src/app is bundled by expo-router's require.context, and this file's
 * `node:fs` import breaks the native/OTA Hermes bundle. It reads big-five.tsx by
 * repo-relative path, so its location does not matter.
 */
const SRC = fs.readFileSync(path.resolve(__dirname, "../app/big-five.tsx"), "utf8");

describe("big-five canon wiring discipline", () => {
  test("the bfi-tagged questionnaire writer still exists", () => {
    expect(SRC).toMatch(/tags:\s*\[\s*"big_five",\s*"bfi",\s*"assessment"\s*\]/);
  });

  test("the questionnaire is one shell-agnostic component mounted in BOTH tracks", () => {
    expect(SRC).toMatch(/function BigFiveSurvey\(/);
    // legacy wraps it in the premium shell...
    expect(SRC).toMatch(/<PremiumAppShell>\s*<BigFiveSurvey/);
    // ...and canon mounts the SAME survey inside the deep-space dock.
    expect(SRC).toMatch(/<DeepSpaceScreen active="lens">\s*<BigFiveSurvey/);
  });

  test("the deep-space lens launches the real survey, never /interview", () => {
    // the empty-state CTA enters the questionnaire in-place...
    expect(SRC).toMatch(/onStart=\{\(\)\s*=>\s*setTaking\(true\)\}/);
    // ...and the dead CTA that pushed to /interview (which never writes bfi) is
    // gone. Targets the wiring, not the word — the comment may still cite it.
    expect(SRC).not.toMatch(/router\.push\(["']\/interview["']\)/);
  });
});
