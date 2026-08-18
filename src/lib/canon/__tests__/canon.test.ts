// Integrity contract for the proto_rev2 JSON canon consumed by the app.
// Mirrors design/proto_rev2/tools/validate-data.mjs at the app boundary:
// if a canon edit breaks these invariants, the app-side consumers
// (and the /proto/ live prototype) would misroute or drop screens.

import fs from "fs";
import path from "path";

import {
  canonCanvas,
  canonManifestFiles,
  canonNav,
  canonRoots,
  canonRoutedScreens,
  canonScreens,
  canonStars,
  canonStats,
  canonUnroutedScreens,
  getCanonScreen,
} from "../index";

const REPO = path.resolve(__dirname, "../../../..");
const APP_DIR = path.join(REPO, "src/app");

/** expo-router route ids under src/app, matching how the canon's `route` field
 *  is written: path relative to src/app, no extension, forward slashes.
 *  `_layout` / `+html` / `+not-found` are router plumbing, not screens. */
function appRoutes(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "__tests__") continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(p);
      } else if (e.name.endsWith(".tsx") && !e.name.startsWith("_") && !e.name.startsWith("+")) {
        out.push(path.relative(APP_DIR, p).replace(/\\/g, "/").replace(/\.tsx$/, ""));
      }
    }
  };
  walk(APP_DIR);
  return out.sort();
}

describe("proto_rev2 canon integrity", () => {
  it("keeps the 390x820 pixel-contract canvas", () => {
    expect(canonCanvas).toEqual({ w: 390, h: 820 });
  });

  it("registers 58 screens with unique ids", () => {
    expect(canonScreens).toHaveLength(58);
    expect(new Set(canonScreens.map((s) => s.id)).size).toBe(58);
  });

  it("uses only known layout kinds", () => {
    for (const s of canonScreens) {
      expect(["immersive", "museumLike", "windowed"]).toContain(s.layout);
    }
  });

  // NOTE: this only checks the NAME's shape. Whether the component is really
  // exported to `window` by some sb-*.jsx is checked by
  // design/proto_rev2/tools/validate-data.mjs (`npm run check:canon-data`),
  // which reads the prototype sources this test cannot see.
  it("names a window component for every screen", () => {
    for (const s of canonScreens) {
      expect(s.component).toMatch(/^[A-Z][A-Za-z0-9]*$/);
    }
  });

  it("titles every non-root screen (top app bar contract)", () => {
    for (const s of canonScreens) {
      if (!s.root) expect(typeof s.title).toBe("string");
    }
  });

  it("keeps the 5 nav tabs pointing at root screens, in order", () => {
    const rootIds = canonRoots().map((s) => s.id);
    expect(canonNav.map((t) => t.id)).toEqual(rootIds);
    expect(rootIds).toEqual(["home", "capture", "chat", "records", "settings"]);
  });

  it("routes every constellation star to a registered screen", () => {
    expect(canonStars).toHaveLength(8);
    for (const star of canonStars) {
      expect(getCanonScreen(star.route)).toBeDefined();
    }
  });

  // ── canon ↔ app wiring (added 2026-08-18) ───────────────────────────
  // Before these, the registry described the PROTOTYPE only: `component`
  // resolves to an sb-*.jsx window export, and nothing in it referred to the
  // React Native app. So the suite could be green while the canon and the app
  // said different things about the same screen. `route` closes that.

  it("declares route or null explicitly for every screen", () => {
    for (const s of canonScreens) {
      // `undefined` means someone added a screen and skipped the decision.
      expect(typeof s.route === "string" || s.route === null).toBe(true);
      if (typeof s.route === "string") expect(s.route.length).toBeGreaterThan(0);
    }
  });

  it("points every routed screen at a real route module", () => {
    const missing = canonRoutedScreens()
      .filter((s) => !fs.existsSync(path.join(APP_DIR, `${s.route}.tsx`)))
      .map((s) => `${s.id} -> src/app/${s.route}.tsx`);
    expect(missing).toEqual([]);
  });

  it("maps each app route at most once", () => {
    const routes = canonRoutedScreens().map((s) => s.route);
    expect(routes.length).toBe(new Set(routes).size);
  });

  it("keeps the prototype-only gap visible", () => {
    // These screens exist in the prototype but have no app counterpart. Not a
    // bug — the honest gap. Shrink it by shipping the screen and setting its
    // route; grow it only by adding a prototype screen on purpose.
    expect(canonUnroutedScreens().map((s) => s.id).sort()).toEqual([
      "audit-full",
      "datareview",
      "dobgate",
      "domains",
      "exhibit",
      "healthdata",
      "healthinput",
      "lifeinput",
      "relcontacts",
      "reward",
      "triage",
      "widget",
    ]);
  });

  it("names every app route the canon does not cover", () => {
    const covered = new Set(canonRoutedScreens().map((s) => s.route));
    const uncovered = appRoutes().filter((r) => !covered.has(r)).sort();
    // Adding a screen to src/app without a canon entry lands here. That is
    // allowed — but it must be a decision, so the gap is pinned.
    //
    // 2026-08-19: this pinned a bare COUNT (`toBe(51)`) until now, which could
    // not tell "one route removed, another added" from "nothing changed" —
    // substitution passed silently. That is the same failure the canon route
    // contract (#1242) was built to end, so the count became a list. Register
    // the screen in the canon, or add its name here in the same commit.
    expect(uncovered).toEqual([
      "(auth)/consent-notice",
      "(auth)/oauth-callback",
      "(auth)/privacy-policy",
      "(auth)/refund",
      "(auth)/sign-up",
      "(auth)/terms",
      "account",
      "beyond",
      "brightness",
      "canon",
      "capture-full",
      "career",
      "change-password",
      "community",
      "community/[room]",
      "community/join/[token]",
      "data",
      "deepspace-flowmap",
      "deepspace-home",
      "deepspace-hub",
      "deepspace-preview",
      "dev-screens",
      "discover",
      "esm",
      "formats",
      "graph",
      "growth",
      "import-hub",
      "insights",
      "ipip-neo",
      "jarvis",
      "ledger",
      "mbti",
      "meals",
      "milestones",
      "notices",
      "onboarding",
      "peer-invites",
      "peer/[token]",
      "persona",
      "profile-details",
      "reading",
      "reasoning",
      "review",
      "rlss",
      "side-project",
      "srs",
      "subscription",
      "theme",
      "trinity",
      "ttfv",
      "wiki",
    ]);
  });

  it("exposes the full pack manifest", () => {
    const stats = canonStats();
    expect(stats.packs).toBeGreaterThanOrEqual(31);
    for (const path of Object.values(canonManifestFiles)) {
      expect(path).toMatch(/^data\/.+\.json$/);
    }
    expect(stats.byLayout.immersive).toBe(2);
    expect(stats.byLayout.museumLike).toBe(3);
    expect(stats.byLayout.windowed).toBe(53);
  });
});
