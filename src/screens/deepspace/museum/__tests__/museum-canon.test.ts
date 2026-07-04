// Canon-completeness contract for the AI 뮤지엄 timeline (rev2 sb-museum):
// the app must render the FULL 43-event canon (25 base + 18 MZ_EXTRA) with a
// detail entry, ref labels/glyphs, and an overlap-free mzPlace layout. If a
// canon edit or a data-module refactor breaks these invariants, the timeline
// would drop events or the detail sheet would open empty.

import { canonMuseum } from "@/lib/canon";
import {
  MUSEUM,
  MUSEUM_BY_YEAR,
  MUSEUM_REF_ICON,
  MUSEUM_REF_LABEL,
  MZ,
  MZ_CANVAS_W,
  museumDetailById,
  placeMuseumNodes,
} from "../museum-timeline-data";

describe("museum canon merge (base + MZ_EXTRA)", () => {
  it("merges the base events with canon extra into the 43-event timeline", () => {
    expect(canonMuseum.events).toHaveLength(25);
    expect(canonMuseum.extra).toHaveLength(18);
    expect(MUSEUM).toHaveLength(43);
  });

  it("keeps every id unique across the merge", () => {
    expect(new Set(MUSEUM.map((e) => e.id)).size).toBe(43);
  });

  it("sorts the merged timeline by year (prototype module-scope sort)", () => {
    for (let i = 1; i < MUSEUM.length; i++) {
      expect(MUSEUM[i].year).toBeGreaterThanOrEqual(MUSEUM[i - 1].year);
    }
  });

  it("orders the sheet stepping by year, then lane", () => {
    expect(MUSEUM_BY_YEAR).toHaveLength(43);
    for (let i = 1; i < MUSEUM_BY_YEAR.length; i++) {
      const a = MUSEUM_BY_YEAR[i - 1];
      const b = MUSEUM_BY_YEAR[i];
      expect(a.year < b.year || (a.year === b.year && a.lane <= b.lane)).toBe(true);
    }
  });

  it("resolves every rel link inside the merged set", () => {
    const ids = new Set(MUSEUM.map((e) => e.id));
    for (const e of MUSEUM) {
      for (const rid of e.rel) expect(ids.has(rid)).toBe(true);
    }
  });
});

describe("museum detail canon (MZ_DETAIL)", () => {
  it("has a detail entry for all 43 event ids (100% hit-rate)", () => {
    const misses = MUSEUM.filter((e) => museumDetailById(e.id) === undefined).map((e) => e.id);
    expect(misses).toEqual([]);
    expect(Object.keys(canonMuseum.detail)).toHaveLength(43);
  });

  it("shapes every detail entry: long copy + [label, value] fact pairs", () => {
    for (const e of MUSEUM) {
      const d = museumDetailById(e.id);
      expect(typeof d?.long).toBe("string");
      expect(d?.long?.length).toBeGreaterThan(0);
      expect(Array.isArray(d?.facts)).toBe(true);
      for (const f of d?.facts ?? []) {
        expect(f).toHaveLength(2);
        expect(typeof f[0]).toBe("string");
        expect(typeof f[1]).toBe("string");
      }
      expect(typeof d?.cause).toBe("string");
      expect(typeof d?.effect).toBe("string");
    }
  });

  it("covers every ref kind in use with a refKo label and a refIcon glyph", () => {
    const kinds = new Set(MUSEUM.flatMap((e) => e.refs.map((r) => r.kind)));
    expect(kinds.size).toBeGreaterThan(0);
    for (const kind of kinds) {
      expect(MUSEUM_REF_LABEL[kind]).toBeTruthy();
      expect(MUSEUM_REF_ICON[kind]).toBeTruthy();
    }
  });
});

describe("museum mzPlace geometry at 43 events", () => {
  const placed = placeMuseumNodes(MUSEUM);
  const minGap = MZ.NODE_W + 8;

  it("places every event", () => {
    expect(placed.size).toBe(43);
  });

  it("never overlaps two nodes in the same lane row (prototype nudge)", () => {
    (["world", "ai"] as const).forEach((lane) => {
      ([0, 1] as const).forEach((row) => {
        const xs = MUSEUM.filter((e) => e.lane === lane)
          .map((e) => placed.get(e.id))
          .filter((p) => p !== undefined && p.row === row)
          .map((p) => (p as { x: number }).x)
          .sort((a, b) => a - b);
        for (let i = 1; i < xs.length; i++) {
          expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(minGap);
        }
      });
    });
  });

  it("keeps every node inside the canvas and its lane band", () => {
    for (const e of MUSEUM) {
      const p = placed.get(e.id);
      expect(p).toBeDefined();
      if (!p) continue;
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x + MZ.NODE_W).toBeLessThanOrEqual(MZ_CANVAS_W);
      if (e.lane === "world") expect(p.y + MZ.NODE_H).toBeLessThanOrEqual(MZ.AXIS);
      else expect(p.y).toBeGreaterThanOrEqual(MZ.AXIS);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y + MZ.NODE_H).toBeLessThanOrEqual(MZ.TH);
    }
  });
});
