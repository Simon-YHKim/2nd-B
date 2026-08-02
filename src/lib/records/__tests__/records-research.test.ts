import { recordsToResearchGraph } from "../records-research";
import type { GraphRecord } from "../records-graph";

const rec = (id: string, tags: string[], summary = ""): GraphRecord => ({
  id,
  topic: `topic-${id}`,
  summary,
  tags,
});

describe("recordsToResearchGraph", () => {
  it("turns records into pages, one per record", () => {
    const { pages } = recordsToResearchGraph([
      rec("a", ["domain:career"]),
      rec("b", ["domain:health"]),
    ]);
    expect(pages).toHaveLength(2);
    expect(pages.map((p) => p.id).sort()).toEqual(["a", "b"]);
  });

  it("never emits polaris or domain stars as pages", () => {
    // The graph carries scaffolding nodes; only real records are connectable
    // things the user made. Leaking a star in here would show up as a hub.
    const { pages } = recordsToResearchGraph([rec("a", ["domain:career"])]);
    expect(pages.every((p) => p.id === "a")).toBe(true);
  });

  it("counts only cross-domain shared-tag links, not spine/branch scaffolding", () => {
    // a and b sit in different domains and share the user tag "reading", so
    // that is a discovered connection. The polaris->star and star->record edges
    // that also exist in the graph must not inflate the count.
    const { edges } = recordsToResearchGraph([
      rec("a", ["domain:career", "reading"]),
      rec("b", ["domain:health", "reading"]),
    ]);
    expect(edges).toHaveLength(1);
    const [edge] = edges;
    expect([edge.from_page, edge.to_page].sort()).toEqual(["a", "b"]);
  });

  it("finds no connection when records share no user tag", () => {
    const { edges } = recordsToResearchGraph([
      rec("a", ["domain:career", "solo"]),
      rec("b", ["domain:health", "other"]),
    ]);
    expect(edges).toHaveLength(0);
  });

  it("carries the record's tags onto the page so clustering can group them", () => {
    const { pages } = recordsToResearchGraph([rec("a", ["domain:career", "reading"])]);
    expect(pages[0]?.tags).toContain("reading");
  });

  it("uses the record summary as the page body", () => {
    const { pages } = recordsToResearchGraph([rec("a", ["domain:career"], "  a thought  ")]);
    expect(pages[0]?.body_md).toBe("a thought");
  });

  it("returns an empty graph for no records instead of throwing", () => {
    expect(recordsToResearchGraph([])).toEqual({ pages: [], edges: [] });
  });

  it("emits a schema-valid wiki page kind", () => {
    const { pages } = recordsToResearchGraph([rec("a", ["domain:career"])]);
    expect(["source", "entity", "concept"]).toContain(pages[0]?.kind);
  });
});
