import {
  WORLD,
  WORLD_CENTER,
  rootPoint,
  fitScale,
  fitTranslate,
  worldToScreen,
  worldMenuPositions,
  worldDataPositions,
  sectorHalfWidth,
  sectorFocus,
  seeded,
  type MenuLike,
} from "../world-layout";

// Tree-redesign contract (2026-06-08): bottom-rooted, upward-growing crystalline
// tree. The Soul Core root sits near bottom-center; all Pattern Cores sit above
// the root; tier-3 children and data shards bloom upward off their parent.

const MENU: MenuLike[] = [
  { id: "work", tier: 2, parentId: "core" },
  { id: "relation", tier: 2, parentId: "core" },
  { id: "knowledge", tier: 2, parentId: "core" },
  { id: "records", tier: 2, parentId: "core" },
  { id: "taste", tier: 2, parentId: "core" },
  { id: "wiki-daily", tier: 3, parentId: "knowledge" },
  { id: "wiki-pro", tier: 3, parentId: "knowledge" },
  { id: "past-teens", tier: 3, parentId: "records" },
];

const VP = { width: 600, height: 800 };

describe("fit math", () => {
  it("contains the portrait world", () => {
    expect(fitScale(VP)).toBeCloseTo(
      Math.min(VP.width / WORLD.width, VP.height / WORLD.height) * 0.92,
      6,
    );
  });

  it("fitTranslate centers the scaled world", () => {
    const s = fitScale(VP);
    const t = fitTranslate(VP, s);
    expect(t.x).toBeCloseTo((VP.width - WORLD.width * s) / 2, 6);
    expect(t.y).toBeCloseTo((VP.height - WORLD.height * s) / 2, 6);
  });

  it("maps the world center to the viewport center", () => {
    const s = worldToScreen(WORLD_CENTER, VP);
    expect(s.x).toBeCloseTo(VP.width / 2, 6);
    expect(s.y).toBeCloseTo(VP.height / 2, 6);
  });
});

describe("worldMenuPositions (bottom-rooted tree)", () => {
  const pos = worldMenuPositions(MENU, "core");
  const root = rootPoint();

  it("anchors the root (Soul Core) near bottom-center, not world center", () => {
    const c = pos.get("core")!;
    expect(c.x).toBeCloseTo(root.x, 6);
    expect(c.y).toBeCloseTo(root.y, 6);
    expect(c.sector).toBe(-1);
    expect(c.y).toBeGreaterThan(WORLD.height * 0.5); // sits in the bottom area
  });

  it("places every menu node plus the root", () => {
    expect(pos.size).toBe(MENU.length + 1);
  });

  it("places ALL Pattern Cores above the root (canopy grows upward)", () => {
    for (const id of ["work", "relation", "knowledge", "records", "taste"]) {
      expect(pos.get(id)!.y).toBeLessThan(root.y);
    }
  });

  it("fans tier-3 children above their parent core, same sector", () => {
    for (const [child, parent] of [
      ["wiki-daily", "knowledge"],
      ["wiki-pro", "knowledge"],
      ["past-teens", "records"],
    ] as const) {
      expect(pos.get(child)!.y).toBeLessThan(pos.get(parent)!.y);
      expect(pos.get(child)!.sector).toBe(pos.get(parent)!.sector);
    }
  });

  it("assigns each core its own sector index", () => {
    const sectors = ["work", "relation", "knowledge", "records", "taste"].map(
      (id) => pos.get(id)!.sector,
    );
    expect(new Set(sectors).size).toBe(5);
  });

  it("keeps all nodes inside the world bounds", () => {
    for (const p of pos.values()) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(WORLD.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(WORLD.height);
    }
  });

  it("is deterministic across calls", () => {
    const again = worldMenuPositions(MENU, "core");
    expect(again.get("wiki-pro")).toEqual(pos.get("wiki-pro"));
  });
});

describe("worldDataPositions (upward bloom)", () => {
  const menuPos = worldMenuPositions(MENU, "core");
  const data = Array.from({ length: 60 }, (_, i) => ({ id: `d${i}`, parentId: "knowledge" as const }));

  it("caps the number of placed shards", () => {
    const out = worldDataPositions(data, menuPos, "knowledge", 40);
    expect(out.size).toBe(40);
  });

  it("blooms shards above their parent core", () => {
    const out = worldDataPositions(data, menuPos, "knowledge", 40);
    const parentY = menuPos.get("knowledge")!.y;
    for (const p of out.values()) {
      expect(p.y).toBeLessThan(parentY);
    }
  });

  it("keeps shards inside the world bounds", () => {
    const out = worldDataPositions(data, menuPos);
    for (const p of out.values()) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(WORLD.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(WORLD.height);
    }
  });

  it("records the resolved parent id", () => {
    const out = worldDataPositions([{ id: "x" }], menuPos, "knowledge");
    expect(out.get("x")!.parentId).toBe("knowledge");
  });

  it("is deterministic", () => {
    const a = worldDataPositions(data, menuPos, "knowledge", 40);
    const b = worldDataPositions(data, menuPos, "knowledge", 40);
    expect(b.get("d3")).toEqual(a.get("d3"));
  });
});

describe("seeded", () => {
  it("is stable and within [0,1)", () => {
    const a = seeded("node", 1);
    expect(a).toBe(seeded("node", 1));
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
  });
});

describe("sectorFocus (tree)", () => {
  const pos = worldMenuPositions(MENU, "core");

  it("returns null for the root, a focus for a core", () => {
    expect(sectorFocus(pos.get("core"), 5)).toBeNull();
    const f = sectorFocus(pos.get("knowledge"), 5);
    expect(f).not.toBeNull();
    expect(f!.halfWidth).toBeCloseTo(sectorHalfWidth(5), 6);
  });

  it("aims at or above the tapped core, not the world center", () => {
    const k = pos.get("knowledge")!;
    const f = sectorFocus(k, 5)!;
    expect(f.focus.y).toBeLessThanOrEqual(k.y);
  });
});
