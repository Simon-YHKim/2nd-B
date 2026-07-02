// P5a data-sovereignty guard: buildIdenExport's include filter must remove an
// excluded field from EVERY artifact (.iden text, HTML sheet, JSON) — a field
// the user toggled off never leaves the device in any format.

import { buildIdenExport } from "../iden-export";
import type { IdenDoc } from "../types";

const DOC: IdenDoc = {
  iden: "0.1",
  name: "tester",
  generated: "2026-07-02",
  oneLiner: "one line about me",
  fields: [
    { key: "traits", label: "Traits", viz: "radar", source: { kind: "measured", instrument: "BFI-44" } as never, data: { openness: 0.7, conscientiousness: 0.5, extraversion: 0.4, agreeableness: 0.6, neuroticism: 0.3 } },
    { key: "drivers", label: "Drivers", viz: "tags", source: { kind: "self_report" } as never, data: ["autonomy-marker-xyz"] },
  ],
};

describe("iden export include filter (P5a)", () => {
  test("default exports carry every field in all three artifacts", () => {
    const out = buildIdenExport(DOC, { locale: "en" });
    for (const artifact of [out.iden, out.html, out.json]) {
      expect(artifact).toContain("autonomy-marker-xyz");
    }
    expect(out.jsonFilename.endsWith(".json")).toBe(true);
    expect(out.chars.json).toBe(out.json.length);
  });

  test("an excluded field leaves in NO format", () => {
    const out = buildIdenExport(DOC, { locale: "en", include: ["traits"] });
    for (const artifact of [out.iden, out.html, out.json]) {
      expect(artifact).not.toContain("autonomy-marker-xyz");
    }
    // The kept field is still present.
    expect(out.json).toContain("traits");
  });

  test("json parses back to the filtered doc shape", () => {
    const out = buildIdenExport(DOC, { locale: "en", include: ["drivers"] });
    const parsed = JSON.parse(out.json) as IdenDoc;
    expect(parsed.fields.map((f) => f.key)).toEqual(["drivers"]);
    expect(parsed.name).toBe("tester");
  });

  test("the input doc is not mutated by filtering", () => {
    buildIdenExport(DOC, { locale: "en", include: [] });
    expect(DOC.fields).toHaveLength(2);
  });
});
