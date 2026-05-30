import {
  WORLD,
  WORLD_CENTER,
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

// Normalize an angle delta into [-PI, PI].
function angleDelta(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const MENU: MenuLike[] = [
  { id: "now", tier: 2, parentId: "core" },
  { id: "past", tier: 2, parentId: "core" },
  { id: "wiki", tier: 2, parentId: "core" },
  { id: "imagine", tier: 2, parentId: "core" },
  { id: "wiki-daily", tier: 3, parentId: "wiki" },
  { id: "wiki-pro", tier: 3, parentId: "wiki" },
  { id: "past-teens", tier: 3, parentId: "past" },
  { id: "insights", tier: 3, parentId: "now" },
];

const VP = { width: 600, height: 800 };

describe("fit math", () => {
  it("contains the world (square-fit for a half-scale viewport)", () => {
    // min(600/1200, 800/1600) = 0.5, * 0.92 padding
    expect(fitScale(VP)).toBeCloseTo(0.46, 6);
  });

  it("centers the world: world center maps to viewport center", () => {
    const s = worldToScreen(WORLD_CENTER, VP);
    expect(s.x).toBeCloseTo(VP.width / 2, 6);
    expect(s.y).toBeCloseTo(VP.height / 2, 6);
  });

  it("fitTranslate centers the scaled world", () => {
    const s = fitScale(VP);
    const t = fitTranslate(VP, s);
    expect(t.x).toBeCloseTo((VP.width - WORLD.width * s) / 2, 6);
    expect(t.y).toBeCloseTo((VP.height - WORLD.height * s) / 2, 6);
  });

  it("maps the world's top-left toward the viewport (origin offset)", () => {
    const s = worldToScreen({ x: 0, y: 0 }, VP);
    expect(s.x).toBeLessThan(VP.width / 2);
    expect(s.y).toBeLessThan(VP.height / 2);
  });
});

describe("worldMenuPositions", () => {
  const pos = worldMenuPositions(MENU, "core");

  it("places the center at the world center", () => {
    expect(pos.get("core")).toEqual({ x: WORLD_CENTER.x, y: WORLD_CENTER.y, angle: 0, sector: -1 });
  });

  it("places every menu node plus the center", () => {
    expect(pos.size).toBe(MENU.length + 1);
  });

  it("starts the first tier-2 node at the top of the ring", () => {
    const now = pos.get("now")!;
    expect(now.x).toBeCloseTo(WORLD_CENTER.x, 6);
    expect(now.y).toBeLessThan(WORLD_CENTER.y); // above center
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

describe("worldDataPositions", () => {
  const menuPos = worldMenuPositions(MENU, "core");
  const data = Array.from({ length: 60 }, (_, i) => ({ id: `d${i}`, parentId: "wiki-daily" as const }));

  it("caps the number of placed shards", () => {
    const out = worldDataPositions(data, menuPos, "wiki-daily", 40);
    expect(out.size).toBe(40);
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
    const out = worldDataPositions([{ id: "x" }], menuPos, "wiki-daily");
    expect(out.get("x")!.parentId).toBe("wiki-daily");
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

describe("equal sectors + confinement (graph-ux-overhaul #5)", () => {
  // Six real domains, each with a couple of children.
  const SIX: MenuLike[] = [
    { id: "work", tier: 2, parentId: "core" },
    { id: "relation", tier: 2, parentId: "core" },
    { id: "knowledge", tier: 2, parentId: "core" },
    { id: "records", tier: 2, parentId: "core" },
    { id: "imagine", tier: 2, parentId: "core" },
    { id: "taste", tier: 2, parentId: "core" },
    { id: "k1", tier: 3, parentId: "knowledge" },
    { id: "k2", tier: 3, parentId: "knowledge" },
    { id: "r1", tier: 3, parentId: "relation" },
  ];
  const pos = worldMenuPositions(SIX, "core");

  it("assigns each domain its own sector index", () => {
    const sectors = ["work", "relation", "knowledge", "records", "imagine", "taste"].map((id) => pos.get(id)!.sector);
    expect(new Set(sectors).size).toBe(6);
  });

  it("keeps tier-3 children within their parent's sector half-width", () => {
    const half = sectorHalfWidth(6);
    for (const [child, parent] of [["k1", "knowledge"], ["k2", "knowledge"], ["r1", "relation"]] as const) {
      const c = pos.get(child)!;
      const p = pos.get(parent)!;
      expect(c.sector).toBe(p.sector);
      expect(Math.abs(angleDelta(c.angle, p.angle))).toBeLessThanOrEqual(half);
    }
  });

  it("confines tier-4 shards to their domain's sector", () => {
    const half = sectorHalfWidth(6);
    const data = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, parentId: "knowledge" }));
    const out = worldDataPositions(data, pos, "knowledge", 40, 6);
    const parentAngle = pos.get("knowledge")!.angle;
    for (const p of out.values()) {
      const ang = Math.atan2(p.y - WORLD_CENTER.y, p.x - WORLD_CENTER.x);
      expect(Math.abs(angleDelta(ang, parentAngle))).toBeLessThanOrEqual(half);
    }
  });

  it("sectorFocus returns a focus point for a domain, null for center", () => {
    expect(sectorFocus(pos.get("core"), 6)).toBeNull();
    const f = sectorFocus(pos.get("knowledge"), 6);
    expect(f).not.toBeNull();
    expect(f!.halfWidth).toBeCloseTo(sectorHalfWidth(6), 6);
  });
});
