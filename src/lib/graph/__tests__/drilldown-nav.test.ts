import {
  CORE_CHARACTER,
  drilldownCharacterForCore,
  drilldownDataForCore,
  drilldownDepthStyle,
  enterCoreDrilldown,
  exitDrilldown,
  isPatternCoreId,
  resolveDrilldownSelectedDataId,
  selectDrilldownData,
} from "../drilldown-nav";
import { VILLAGE_UI } from "@/lib/village-ui";
import { cosmic } from "@/lib/theme/tokens";

describe("drilldown navigation state", () => {
  const data = [
    { id: "growth-1", parentId: "work" },
    { id: "growth-2", parentId: "work" },
    { id: "bond-1", parentId: "relation" },
  ];

  test("enters a Pattern Core drilldown with the first matching data node selected", () => {
    const state = enterCoreDrilldown("work", drilldownDataForCore("work", data).map((node) => node.id));
    expect(state).toEqual({ mode: "core", coreId: "work", selectedDataId: "growth-1" });
  });

  test("selects Pattern Data inside an open drilldown", () => {
    const state = enterCoreDrilldown("work", ["growth-1", "growth-2"]);
    expect(selectDrilldownData(state, "growth-2")).toEqual({
      mode: "core",
      coreId: "work",
      selectedDataId: "growth-2",
    });
  });

  test("returns to the overview state", () => {
    expect(exitDrilldown()).toEqual({ mode: "overview" });
  });

  test("repairs selected data when the previous node leaves the core", () => {
    expect(resolveDrilldownSelectedDataId("missing", drilldownDataForCore("work", data))).toBe("growth-1");
    expect(resolveDrilldownSelectedDataId("growth-2", drilldownDataForCore("work", data))).toBe("growth-2");
    expect(resolveDrilldownSelectedDataId("missing", [])).toBeNull();
  });
});

describe("drilldown core mapping", () => {
  test("recognizes only the Pattern Core ids", () => {
    expect(isPatternCoreId("work")).toBe(true);
    expect(isPatternCoreId("relation")).toBe(true);
    expect(isPatternCoreId("knowledge")).toBe(true);
    expect(isPatternCoreId("records")).toBe(true);
    expect(isPatternCoreId("taste")).toBe(true);
    expect(isPatternCoreId("rhythm")).toBe(true);
    expect(isPatternCoreId("core")).toBe(false);
    expect(isPatternCoreId("wiki-daily")).toBe(false);
  });

  test("maps each Pattern Core to its canonical character", () => {
    expect(CORE_CHARACTER).toEqual({
      work: "archi",
      relation: "gadi",
      knowledge: "lulu",
      records: "momo",
      taste: "lumi",
      rhythm: "archi",
    });
    expect(drilldownCharacterForCore("work")).toBe("archi");
  });

  test("locks Narrative Core drilldown to Momo and monochrome retint", () => {
    expect(CORE_CHARACTER.records).toBe("momo");
    expect(drilldownCharacterForCore("records")).toBe("momo");
    expect(VILLAGE_UI.records.worker).toBe("momo");
    expect(VILLAGE_UI.records.accent).toBe(cosmic.moonWhite);
    expect(VILLAGE_UI.records.accent).not.toBe(cosmic.dreamPink);
    expect(VILLAGE_UI.records.accent).not.toBe(cosmic.soulViolet);
    expect(VILLAGE_UI.records.accent).not.toBe(cosmic.guardRose);
  });

  test("reuses depth style while making non-focused graph objects recede", () => {
    const focused = drilldownDepthStyle("focusedCore", 2);
    const receded = drilldownDepthStyle("receded", 2);
    expect(focused.opacity).toBeGreaterThan(receded.opacity);
    expect(focused.saturate).toBeGreaterThan(receded.saturate);
    expect(focused.scale).toBeGreaterThan(receded.scale);
  });
});
