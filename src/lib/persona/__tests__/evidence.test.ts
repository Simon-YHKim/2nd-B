import {
  recordKindToType,
  evidenceRoute,
  evidenceTypeLabel,
  evidenceDateLabel,
  toEvidenceShard,
  sourceKindToType,
  sourceToEvidenceShard,
  mergeEvidence,
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
  test("each type maps to its real (non-retired) destination", () => {
    expect(evidenceRoute("journal")).toBe("/capture");
    expect(evidenceRoute("audit")).toBe("/audit");
    expect(evidenceRoute("interview")).toBe("/interview");
    expect(evidenceRoute("wiki")).toBe("/wiki");
    expect(evidenceRoute("imagine")).toBe("/secondb?mode=divergent");
    expect(evidenceRoute("capture")).toBe("/capture");
  });
  test("never emits a retired redirect route", () => {
    const types = ["journal", "interview", "audit", "wiki", "imagine", "capture"] as const;
    for (const t of types) {
      const r = evidenceRoute(t);
      expect(r).not.toMatch(/^\/journal\b/);
      expect(r).not.toMatch(/^\/imagine\b/);
      expect(r).not.toMatch(/^\/mbti\b/);
    }
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
    expect(s).toMatchObject({ id: "r1", type: "journal", title: "아침 산책", route: "/capture" });
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

describe("sourceKindToType", () => {
  test("imagine tag wins", () => {
    expect(sourceKindToType("inbox", ["imagine"])).toBe("imagine");
  });
  test("self_knowledge → capture", () => {
    expect(sourceKindToType("self_knowledge")).toBe("capture");
  });
  test("external clips → wiki", () => {
    expect(sourceKindToType("article")).toBe("wiki");
    expect(sourceKindToType("paper")).toBe("wiki");
    expect(sourceKindToType("inbox")).toBe("wiki");
  });
});

describe("sourceToEvidenceShard", () => {
  test("uses title when present", () => {
    const s = sourceToEvidenceShard(
      { id: "s1", kind: "self_knowledge", title: "메모 한 줄", captured_at: "2026-05-12T00:00:00Z" },
      "ko",
    );
    expect(s).toMatchObject({ id: "s1", type: "capture", title: "메모 한 줄", route: "/capture" });
  });
  test("falls back to type label when title empty", () => {
    const s = sourceToEvidenceShard(
      { id: "s2", kind: "article", title: "", captured_at: "2026-05-12T00:00:00Z" },
      "ko",
    );
    expect(s.title).toBe("지식 창고");
  });
});

describe("mergeEvidence", () => {
  test("merges records + sources sorted by recency, tagging origin", () => {
    const merged = mergeEvidence(
      [{ id: "r1", kind: "journal", topic: "오래된 일기", created_at: "2026-05-10T00:00:00Z" }],
      [{ id: "s1", kind: "self_knowledge", title: "최근 메모", captured_at: "2026-05-20T00:00:00Z" }],
      "ko",
    );
    expect(merged.map((m) => m.id)).toEqual(["s1", "r1"]);
    expect(merged[0]).toMatchObject({ origin: "source", type: "capture" });
    expect(merged[1]).toMatchObject({ origin: "record", type: "journal" });
  });
  test("handles empty streams", () => {
    expect(mergeEvidence([], [], "en")).toEqual([]);
  });
  test("tags each shard with its village domain (from tags + title)", () => {
    const merged = mergeEvidence(
      [{ id: "r1", kind: "journal", topic: "커리어 목표", created_at: "2026-05-10T00:00:00Z", tags: ["work"] }],
      [{ id: "s1", kind: "article", title: "영화 추천", captured_at: "2026-05-20T00:00:00Z", tags: ["taste", "film"] }],
      "ko",
    );
    const domainById = Object.fromEntries(merged.map((m) => [m.id, m.domain]));
    expect(domainById.r1).toBe("work");
    expect(domainById.s1).toBe("taste");
  });
});
