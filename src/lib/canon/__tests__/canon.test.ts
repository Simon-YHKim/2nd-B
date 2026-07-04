// Integrity contract for the proto_rev2 JSON canon consumed by the app.
// Mirrors design/proto_rev2/tools/validate-data.mjs at the app boundary:
// if a canon edit breaks these invariants, the app-side consumers
// (and the /proto/ live prototype) would misroute or drop screens.

import {
  canonCanvas,
  canonManifestFiles,
  canonNav,
  canonRoots,
  canonScreens,
  canonStars,
  canonStats,
  getCanonScreen,
} from "../index";

describe("proto_rev2 canon integrity", () => {
  it("keeps the 390x820 pixel-contract canvas", () => {
    expect(canonCanvas).toEqual({ w: 390, h: 820 });
  });

  it("registers 57 screens with unique ids", () => {
    expect(canonScreens).toHaveLength(57);
    expect(new Set(canonScreens.map((s) => s.id)).size).toBe(57);
  });

  it("uses only known layout kinds", () => {
    for (const s of canonScreens) {
      expect(["immersive", "museumLike", "windowed"]).toContain(s.layout);
    }
  });

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

  it("exposes the full pack manifest", () => {
    const stats = canonStats();
    expect(stats.packs).toBeGreaterThanOrEqual(31);
    for (const path of Object.values(canonManifestFiles)) {
      expect(path).toMatch(/^data\/.+\.json$/);
    }
    expect(stats.byLayout.immersive).toBe(2);
    expect(stats.byLayout.museumLike).toBe(3);
    expect(stats.byLayout.windowed).toBe(52);
  });
});
