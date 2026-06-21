import fs from "node:fs";
import path from "node:path";

/**
 * Guards against deep-space nav dead-ends: every route the shell dock pushes to
 * must resolve to a real expo-router screen under src/app. The dock (TAB_ROUTE in
 * DeepSpaceScreen.tsx) is the persistent navigation for the deep-space track, and
 * expo-router's Href is a broad string type, so a route renamed or removed out
 * from under the dock is a SILENT dead-end (no type error, no lint error) that
 * only surfaces as a blank screen at runtime.
 *
 * The route list is derived from the source (not hard-coded) so the guard tracks
 * the dock as the IA evolves; if TAB_ROUTE is refactored away the first test
 * fails loudly, forcing this guard to be updated alongside it. Mirrors the fs
 * source-discipline idiom of the sibling deep-space tests (no RN render mocks),
 * so it stays robust across the active deep-space churn.
 */
const DS_DIR = path.resolve(__dirname, "..");
const APP_DIR = path.resolve(__dirname, "../../../app");

const screenSrc = fs.readFileSync(path.join(DS_DIR, "DeepSpaceScreen.tsx"), "utf8");

function dockRoutes(): string[] {
  const block = screenSrc.match(/const TAB_ROUTE[\s\S]*?\};/)?.[0] ?? "";
  return [...block.matchAll(/"(\/[^"]*)"/g)].map((m) => m[1]);
}

function routeFileExists(route: string): boolean {
  const rel = route === "/" ? "index" : route.replace(/^\//, "");
  return (
    fs.existsSync(path.join(APP_DIR, `${rel}.tsx`)) ||
    fs.existsSync(path.join(APP_DIR, rel, "index.tsx"))
  );
}

describe("deep-space dock navigation contract", () => {
  test("the dock maps the home plus its primary destinations", () => {
    expect(dockRoutes().length).toBeGreaterThanOrEqual(4);
  });

  test("every dock route resolves to an expo-router screen (no dead-ends)", () => {
    const missing = dockRoutes().filter((route) => !routeFileExists(route));
    expect(missing).toEqual([]);
  });
});
