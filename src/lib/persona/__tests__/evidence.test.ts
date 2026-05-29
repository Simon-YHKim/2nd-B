import {
  recordKindToType,
  evidenceRoute,
  evidenceTypeLabel,
  evidenceDateLabel,
  toEvidenceShard,
} from "../evidence";

describe("recordKindToType", () => {
  test("journal kind", () => {
    expect(recordKindToType("journal")).toBe("journal");
  });
  test("audit_response splits interview vs audit by tag", () => {
    expect(recordKindToType("audit_response", ["interview"])).toBe("interview");
    expect(recordKindToType("audit_response", ["life_audit"])).toBe("audit");
  });
  test("self_knowledge → capture", () => {
    expect(recordKindToType("self_knowledge")).toBe("capture");
  });
  test("tags steer imagine / wiki", () => {
    expect(recordKindToType("note", ["imagine"])).toBe("imagine");
    expect(recordKindToType("note", ["wiki"])).toBe("wiki");
  });
  test("unknown falls back to capture", () => {
    expect(recordKindToType("note")).toBe("capture");
  });
});

describe("evidenceRoute", () => {
  test("each type maps to a real route", () => {
    expect(evidenceRoute("journal")).toBe("/journal");
    expect(evidenceRoute("audit")).toBe("/audit");
    expect(evidenceRoute("interview")).toBe("/interview");
    expect(evidenceRoute("wiki")).toBe("/wiki");
    expect(evidenceRoute("imagine")).toBe("/imagine");
    expect(evidenceRoute("capture")).toBe("/capture");
  });
});

describe("evidenceTypeLabel", () => {
  test("localized", () => {
    expect(evidenceTypeLabel("journal", "ko")).toBe("오늘의 조각");
    expect(evidenceTypeLabel("journal", "en")).toBe("Journal");
  });
});

describe("evidenceDateLabel", () => {
  test("invalid date is empty", () => {
    expect(evidenceDateLabel("not-a-date", "ko")).toBe("");
  });
  test("valid date renders", () => {
    expect(evidenceDateLabel("2026-05-12T00:00:00Z", "en").length).toBeGreaterThan(0);
  });
});

describe("toEvidenceShard", () => {
  test("uses topic as title when present", () => {
    const s = toEvidenceShard(
      { id: "r1", kind: "journal", topic: "아침 산책", created_at: "2026-05-12T00:00:00Z" },
      "ko",
    );
    expect(s).toMatchObject({ id: "r1", type: "journal", title: "아침 산책", route: "/journal" });
    expect(s.dateLabel.length).toBeGreaterThan(0);
  });
  test("falls back to the type label when topic is empty", () => {
    const s = toEvidenceShard(
      { id: "r2", kind: "journal", topic: "  ", created_at: "2026-05-12T00:00:00Z" },
      "ko",
    );
    expect(s.title).toBe("오늘의 조각");
  });
});
