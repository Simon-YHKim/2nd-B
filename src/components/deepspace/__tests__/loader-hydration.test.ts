import { readFileSync } from "node:fs";
import path from "node:path";

// Source-level guard. The component itself cannot be render-tested here (RN 0.85
// + jest 29 leave `StyleSheet` undefined under the bare preset — see the repo's
// note on component render tests), so this pins the two properties that make the
// hydration fix work, and that a well-meaning refactor would quietly undo.
const SRC = readFileSync(
  path.join(__dirname, "..", "DeepSpaceLoader.tsx"),
  "utf8",
);

describe("DeepSpaceLoader hydration gate", () => {
  it("picks the copy through the hydration gate, not straight from i18n", () => {
    // Reading i18n.language directly on the first paint is what threw React #418
    // on every auth route: the served HTML carried the build-time locale and the
    // first client render carried the detected one.
    expect(SRC).toContain(
      "LOADER_COPY[hydrated ? loaderLocale(i18n.language) : STATIC_EXPORT_LOCALE]",
    );
    expect(SRC).not.toMatch(/const copy = LOADER_COPY\[loaderLocale\(i18n\.language\)\]/);
  });

  it("declares the static-export locale as the pre-hydration fallback", () => {
    // `expo export` prerenders with no localStorage and no device locale, so
    // detectLanguage() falls through to "en". The fallback has to match that or
    // the mismatch simply moves to a different string.
    expect(SRC).toMatch(/STATIC_EXPORT_LOCALE: LoaderLocale = "en"/);
  });

  it("starts hydrated on native so the app's own loading screen never flashes English", () => {
    // Native has no hydration step. Gating it there would trade a web console
    // error for a visible regression on every native load.
    expect(SRC).toContain('useState(Platform.OS !== "web")');
  });

  it("flips to hydrated after mount", () => {
    expect(SRC).toMatch(/useEffect\(\(\) => \{\s*setHydrated\(true\);\s*\}, \[\]\)/);
  });
});
