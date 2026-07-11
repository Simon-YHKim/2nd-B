import fs from "node:fs";
import path from "node:path";

import { BACK_ARROW_HIDDEN_PATHS, DEEP_SPACE_DOCK_PATHS, PRIMARY_TAB_PATHS } from "../tabs";

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
 * Scope (4th recurrence upgrade, a2z audit 2026-07-11): the old scan matched
 * the single-line literal `<DeepSpaceScreen active=` in the route's OWN file,
 * which missed (a) multiline JSX — seen.tsx/beyond.tsx put `active=` on the
 * next line — and (b) delegated renders (/records → DeepSpaceRecordsScreen,
 * /growth → WeeklyGrowthScreen, ...). Both slipped seven live dock screens
 * past the registry. The scan now matches `<DeepSpaceScreen` multiline-safe
 * AND treats "imports from @/screens/deepspace/** and renders a *Screen
 * component" as a dock render. Routes that import those modules without
 * rendering a dock shell (e.g. /privacy: bare-window sub-screen by design)
 * are listed in NON_DOCK_ROUTES with the reason.
 */
const APP_DIR = path.resolve(__dirname, "../../../app");

// Routes the delegation heuristic flags that intentionally do NOT hide the
// floating BackArrow chip. Keep each entry justified — an unjustified entry
// here recreates the double-back-control bug this guard exists to prevent.
const NON_DOCK_ROUTES = new Set<string>([
  // Shell-wrapped design sub-screens (DeepSpaceDesignScreens.tsx `Shell`):
  // a bare radius window with NO dock and NO top bar that reserves
  // insets.top + 52 headroom precisely so the floating chip can sit there —
  // the chip IS their back affordance.
  "/discover",
  "/formats",
  "/insights",
  "/manual",
  "/permissions",
  "/privacy",
  "/research",
  "/review",
  "/srs",
  "/support",
  "/theme",
  // Dev-facing mock phone-frame galleries (own ScrollView, no dock): the chip
  // is their only way back.
  "/deepspace-flowmap",
  "/deepspace-hub",
]);

function dockRenderingRoutes(): string[] {
  return fs
    .readdirSync(APP_DIR)
    .filter((f) => f.endsWith(".tsx"))
    .filter((f) => {
      const src = fs.readFileSync(path.join(APP_DIR, f), "utf8");
      if (/<DeepSpaceScreen[\s/>]/.test(src)) return true;
      const importsDeepSpaceScreens = /from\s+["']@\/screens\/deepspace\//.test(src);
      const rendersScreenJsx = /<[A-Z]\w*Screen[\s/>]/.test(src);
      return importsDeepSpaceScreens && rendersScreenJsx;
    })
    .map((f) => (f === "index.tsx" ? "/" : `/${f.replace(/\.tsx$/, "")}`))
    .filter((route) => !NON_DOCK_ROUTES.has(route));
}

describe("deep-space dock registration drift guard", () => {
  test("every route file that renders DeepSpaceScreen is registered as a tab or dock path", () => {
    // BACK_ARROW_HIDDEN_PATHS counts as registered: the chip is hidden there
    // outright (home roots / pre-auth / one-shot onboarding), so a dock render
    // on those routes can't produce the double-back-control bug.
    const registered = new Set<string>([
      ...PRIMARY_TAB_PATHS,
      ...DEEP_SPACE_DOCK_PATHS,
      ...BACK_ARROW_HIDDEN_PATHS,
    ]);
    const missing = dockRenderingRoutes().filter((route) => !registered.has(route));
    expect(missing).toEqual([]);
  });

  test("the scan itself sees the dock screens (guard is not scanning thin air)", () => {
    // If the render pattern or app dir moves, this fails loudly instead of the
    // main assertion silently passing on an empty scan.
    expect(dockRenderingRoutes().length).toBeGreaterThanOrEqual(10);
  });
});
