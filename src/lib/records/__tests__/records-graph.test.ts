import {
  buildRecordsGraph,
  recordDomain,
  type GraphRecord,
} from "../records-graph";

function rec(id: string, domain: string, tags: string[] = []): GraphRecord {
  return { id, topic: `t-${id}`, tags: [`domain:${domain}`, ...tags] };
}

describe("recordDomain", () => {
  it("reads the reserved domain: tag", () => {
    expect(recordDomain(["domain:career", "goals"])).toBe("career");
  });
  it("falls back to collect when absent or unknown", () => {
    expect(recordDomain(["goals"])).toBe("collect");
    expect(recordDomain(["domain:not-a-star"])).toBe("collect");
    expect(recordDomain(null)).toBe("collect");
  });
});

describe("buildRecordsGraph", () => {
  it("returns just the polaris node for an empty corpus", () => {
    const g = buildRecordsGraph([]);
    expect(g.nodes).toEqual([{ id: "polaris", kind: "polaris", label: "North Star" }]);
    expect(g.edges).toEqual([]);
  });

  it("only renders domain stars that carry records (default)", () => {
    const g = buildRecordsGraph([rec("r1", "career"), rec("r2", "health")]);
    const domainNodes = g.nodes.filter((n) => n.kind === "domain").map((n) => n.domain);
    expect(domainNodes.sort()).toEqual(["career", "health"]);
    // spine + branch edges present, no cross links (no shared user tags)
    expect(g.edges.filter((e) => e.kind === "spine").length).toBe(2);
    expect(g.edges.filter((e) => e.kind === "branch").length).toBe(2);
    expect(g.edges.filter((e) => e.kind === "link").length).toBe(0);
  });

  it("renders all 7 stars with includeEmptyDomains", () => {
    const g = buildRecordsGraph([rec("r1", "career")], { includeEmptyDomains: true });
    expect(g.nodes.filter((n) => n.kind === "domain").length).toBe(7);
  });

  it("draws a cross-domain link only when records in DIFFERENT domains share a user tag", () => {
    const g = buildRecordsGraph([
      rec("r1", "career", ["burnout"]),
      rec("r2", "health", ["burnout"]),
    ]);
    const links = g.edges.filter((e) => e.kind === "link");
    expect(links.length).toBe(1);
    expect(links[0]).toMatchObject({ a: "r1", b: "r2", kind: "link", tag: "burnout" });
  });

  it("does NOT link records that share a tag but sit in the SAME domain", () => {
    const g = buildRecordsGraph([
      rec("r1", "career", ["burnout"]),
      rec("r2", "career", ["burnout"]),
    ]);
    expect(g.edges.filter((e) => e.kind === "link").length).toBe(0);
  });

  it("ignores the reserved domain: tag when computing links (only user tags count)", () => {
    // two different-domain records whose ONLY commonality is the domain namespace
    // must not link (their domain: tags differ, and there are no user tags).
    const g = buildRecordsGraph([rec("r1", "career"), rec("r2", "health")]);
    expect(g.edges.filter((e) => e.kind === "link").length).toBe(0);
  });

  it("attaches every record to its domain star via a branch edge", () => {
    const g = buildRecordsGraph([rec("r1", "growth")]);
    expect(g.edges).toContainEqual({ a: "domain:growth", b: "r1", kind: "branch" });
    expect(g.nodes.find((n) => n.id === "r1")).toMatchObject({ kind: "record", domain: "growth" });
  });

  it("respects maxLinks", () => {
    // 3 career + 3 health records all sharing tag 'x' → 9 cross-domain pairs, cap at 2
    const recs: GraphRecord[] = [];
    for (let i = 0; i < 3; i++) recs.push(rec(`c${i}`, "career", ["x"]));
    for (let i = 0; i < 3; i++) recs.push(rec(`h${i}`, "health", ["x"]));
    const g = buildRecordsGraph(recs, { maxLinks: 2 });
    expect(g.edges.filter((e) => e.kind === "link").length).toBe(2);
  });

  it("localizes star + polaris labels", () => {
    const g = buildRecordsGraph([rec("r1", "career")], { locale: "ko" });
    expect(g.nodes.find((n) => n.kind === "polaris")!.label).toBe("북극성");
    expect(g.nodes.find((n) => n.domain === "career" && n.kind === "domain")!.label).toBe("커리어");
  });
});

describe("injected labels", () => {
  test("labels option overrides polaris, star, and untitled fallbacks", () => {
    const g = buildRecordsGraph(
      [
        { id: "r1", tags: ["domain:career"] },
        { id: "r2", topic: "달리기", tags: ["domain:health"] },
      ],
      {
        labels: {
          polaris: "Estrella Polar",
          star: (id) => `estrella:${id}`,
          untitled: "(sin título)",
        },
      },
    );
    const byId = new Map(g.nodes.map((n) => [n.id, n.label]));
    expect(byId.get("polaris")).toBe("Estrella Polar");
    expect(byId.get("domain:career")).toBe("estrella:career");
    expect(byId.get("r1")).toBe("(sin título)");
    expect(byId.get("r2")).toBe("달리기");
  });

  test("without labels the ko/en fallback is unchanged", () => {
    const g = buildRecordsGraph([{ id: "r1", tags: ["domain:career"] }], { locale: "ko" });
    const byId = new Map(g.nodes.map((n) => [n.id, n.label]));
    expect(byId.get("polaris")).toBe("북극성");
    expect(byId.get("r1")).toBe("(제목 없음)");
  });
});
