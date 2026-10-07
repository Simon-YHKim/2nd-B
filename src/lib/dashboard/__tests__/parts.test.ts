// Daily board part registry (PS-DASH-001 v2.1, W1 completion condition 1 and the layout rules).
import { DASHBOARD_THRESHOLD_IDS } from "../../sufficiency/registry";
import { SOURCES } from "../contract";
import {
  ADD_WIDGET_SLOT,
  PAGE1_ORDER,
  PAGE2_ORDER,
  PARTS,
  PART_IDS,
  RETIRED_PART_IDS,
  boardLayout,
  partById,
  type PartId,
  type PartState,
} from "../parts";

const W1_REQUIRED: readonly PartId[] = ["P-01", "P-02", "P-03", "P-04", "P-06", "P-07", "P-08", "P-09", "M-02", "M-04", "M-05"];

describe("declarations", () => {
  it("one declaration per id, P-05 retired into P-04", () => {
    // Declaration order is free; page order is PAGE1_ORDER / PAGE2_ORDER.
    expect(PARTS.map((p) => p.id).sort()).toEqual([...PART_IDS].sort());
    expect(new Set(PART_IDS).size).toBe(PART_IDS.length);
    expect(PART_IDS).not.toContain("P-05" as PartId);
    expect(RETIRED_PART_IDS).toEqual(["P-05"]);
  });

  it.each(W1_REQUIRED)("%s has a contract type, a threshold key and an empty-state code", (id) => {
    const part = partById(id);
    expect(part.stage).toBe("W1");
    expect(part.payload).not.toBe("none");
    expect(part.threshold).not.toBeNull();
    expect(DASHBOARD_THRESHOLD_IDS).toContain(part.threshold);
    expect(part.emptyReasons.length).toBeGreaterThan(0);
  });

  it("every threshold key a part names exists, and every dashboard threshold is used", () => {
    const named = PARTS.map((p) => p.threshold).filter((t): t is NonNullable<typeof t> => t !== null);
    for (const key of named) expect(DASHBOARD_THRESHOLD_IDS).toContain(key);
    const unused = DASHBOARD_THRESHOLD_IDS.filter((id) => id !== "dash.custom" && !named.includes(id));
    expect(unused).toEqual([]);
  });

  it("empty-state codes are unique per part and point at a dashboard copy key", () => {
    for (const part of PARTS) {
      const codes = part.emptyReasons.map((r) => r.code);
      expect(new Set(codes).size).toBe(codes.length);
      for (const r of part.emptyReasons) expect(r.copyKey).toBe(`dashboard.${part.id}.empty.${r.code}`);
    }
  });

  it("a part that shows a seat's output can carry an ai line", () => {
    for (const part of PARTS) if (part.producedBy) expect(part.bases).toContain("ai");
  });
});

describe("AI transfer column", () => {
  it("a part with a flow-2 source is read by no seat", () => {
    for (const part of PARTS) {
      if (part.sources.some((s) => SOURCES[s].flow === "flow2")) expect(part.readBySeats).toEqual([]);
    }
  });

  it("device sources are only read by inbox_triage (excerpt fields, see contract)", () => {
    for (const part of PARTS) {
      if (part.sources.some((s) => SOURCES[s].flow === "device")) {
        for (const seat of part.readBySeats) expect(seat).toBe("inbox_triage");
      }
    }
  });

  it("RD-261007-09: P-03 feeds daily_note and day_summary", () => {
    expect(partById("P-03").readBySeats).toEqual(expect.arrayContaining(["daily_note", "day_summary"]));
  });

  it("custom composition uses no AI seat (Q-261007-36)", () => {
    for (const part of PARTS.filter((p) => p.placement === "template" || p.id === "P-09")) {
      expect(part.readBySeats).toEqual([]);
      expect(part.producedBy).toBeNull();
      expect(part.bases).not.toContain("ai");
    }
  });
});

describe("layout comes from declarations and states only", () => {
  const all = (over: Partial<Record<PartId, string>> = {}): PartState[] =>
    PART_IDS.map((id) => ({ id, empty: over[id] ?? null }));

  it("fixed order with data everywhere; page 2 ends with the add slot", () => {
    const { page1, page2 } = boardLayout(all());
    expect(page1.map((v) => v.id)).toEqual([...PAGE1_ORDER]);
    expect(page2.map((v) => v.id)).toEqual([...PAGE2_ORDER, ADD_WIDGET_SLOT]);
  });

  it("a hidden part leaves no gap, a locked part stays as a dashed slot, an empty one shows its sentence", () => {
    const { page1, page2 } = boardLayout(all({ "P-08": "nothingChanged", "P-06": "notConnected", "P-03": "nothingScheduled" }));
    expect(page2.map((v) => v.id)).toEqual(["P-06", "P-07", ADD_WIDGET_SLOT]);
    expect(page2[0]).toEqual({ id: "P-06", mode: "locked", copyKey: "dashboard.P-06.empty.notConnected" });
    expect(page1.find((v) => v.id === "P-03")).toEqual({
      id: "P-03",
      mode: "sentence",
      copyKey: "dashboard.P-03.empty.nothingScheduled",
    });
  });

  it("the add slot survives even when every page-2 part hides", () => {
    const { page2 } = boardLayout(all({ "P-06": "tooFewDays", "P-07": "noEntriesThisMonth", "P-08": "nothingChanged" }));
    expect(page2.map((v) => v.id)).toEqual(["P-07", ADD_WIDGET_SLOT]);
    const none = boardLayout(all({ "P-06": "notAdult", "P-08": "nothingChanged" }), []);
    expect(none.page2[none.page2.length - 1]).toEqual({ id: ADD_WIDGET_SLOT, mode: "add" });
  });

  it("approved custom widgets go after the page-2 parts, templates only", () => {
    const { page2 } = boardLayout(all(), ["M-02", "P-01", "M-05"]);
    expect(page2.map((v) => v.id)).toEqual([...PAGE2_ORDER, "M-02", "M-05", ADD_WIDGET_SLOT]);
  });

  it("an unknown empty code is an error, not a silent hide", () => {
    expect(() => boardLayout(all({ "P-01": "rain" }))).toThrow(/no empty reason rain/);
  });
});
