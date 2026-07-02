import fs from "node:fs";
import path from "node:path";

import { DEEP_SPACE_DOCK_PATHS, PRIMARY_TAB_PATHS } from "../tabs";

/**
 * Dock-registration drift guard.
 *
 * Every route file that renders the deep-space dock shell must be registered in
 * PRIMARY_TAB_PATHS or DEEP_SPACE_DOCK_PATHS — that registry is what hides the
 * floating BackArrow chip (and reserves the status-header headroom). This drift
 * has now recurred three times as new dock screens landed unregistered:
 * /wiki (#662), /people /career /rest (#681), then /brightness /ipip-neo
 * /ratifications /rlss /share-card (this guard's first catch). A spot-pin test
 * can't keep up, so this derives the truth from the source instead.
 *
 * Scope: routes whose OWN file contains `<DeepSpaceScreen active=` (the pattern
 * every recurrence used). Screens that mount the shell indirectly through a
 * component (e.g. `/` via DeepSpaceShell, /wiki via DeepSpaceWikiScreen) are
 * covered by the spot pins in tabs.test.ts — this guard only ever ADDS
 * detection, so indirect misses never make it weaker than before.
 */
const APP_DIR = path.resolve(__dirname, "../../../app");

function dockRenderingRoutes(): string[] {
  return fs
    .readdirSync(APP_DIR)
    .filter((f) => f.endsWith(".tsx"))
    .filter((f) => {
      const src = fs.readFileSync(path.join(APP_DIR, f), "utf8");
      return src.includes("<DeepSpaceScreen active=");
    })
    .map((f) => (f === "index.tsx" ? "/" : `/${f.replace(/\.tsx$/, "")}`));
}

describe("deep-space dock registration drift guard", () => {
  test("every route file that renders DeepSpaceScreen is registered as a tab or dock path", () => {
    const registered = new Set<string>([...PRIMARY_TAB_PATHS, ...DEEP_SPACE_DOCK_PATHS]);
    const missing = dockRenderingRoutes().filter((route) => !registered.has(route));
    expect(missing).toEqual([]);
  });

  test("the scan itself sees the dock screens (guard is not scanning thin air)", () => {
    // If the render pattern or app dir moves, this fails loudly instead of the
    // main assertion silently passing on an empty scan.
    expect(dockRenderingRoutes().length).toBeGreaterThanOrEqual(10);
  });
});
