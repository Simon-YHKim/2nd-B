import { readFileSync } from "node:fs";
import path from "node:path";

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

describe("/research navigation stays coupled to the id space this adapter emits", () => {
  // The adapter sets page.id = record.id. The research screen's headline and
  // surprise cards navigate with those ids, so they must target /record/[id].
  // They used to hop through /wiki?focusPageId, which was right only while the
  // view was built from wiki_pages — against a record id the wiki screen finds
  // nothing and silently declines to expand, so the tap just looks dead.
  const SRC = readFileSync(
    path.join(__dirname, "..", "..", "..", "screens", "deepspace", "DeepSpaceDesignScreens.tsx"),
    "utf8",
  );
  const research = SRC.slice(SRC.indexOf("export function DeepSpaceResearchScreen"));
  const body = research.slice(0, research.indexOf("export function", 1));

  it("emits record ids as the page id", () => {
    const { pages } = recordsToResearchGraph([rec("rec-1", ["domain:career"])]);
    expect(pages[0]?.id).toBe("rec-1");
  });

  it("sends the research headline and surprise to /record/[id]", () => {
    expect(body).toContain('pathname: "/record/[id]", params: { id: view.headline!.id }');
    expect(body).toContain('pathname: "/record/[id]", params: { id: view.surprise!.fromId }');
  });

  it("no longer routes those ids into the wiki focus hop", () => {
    expect(body).not.toContain("focusPageId: view.headline");
    expect(body).not.toContain("focusPageId: view.surprise");
  });
});
