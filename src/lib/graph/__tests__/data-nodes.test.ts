import { retainStableDataNodes, sameDataNodes, sourceRowsToDataNodes } from "@/lib/graph/data-nodes";
import { areNavGraphPropsEqual } from "@/lib/graph/navgraph-memo";

describe("graph data node stability", () => {
  it("keeps the previous dataNodes ref when source content is unchanged", () => {
    const first = sourceRowsToDataNodes([
      {
        id: "source-1",
        title: "Budget thoughts",
        tags: ["work", "money"],
        frontmatter: { summary: "A short note" },
      },
    ]);
    const second = sourceRowsToDataNodes([
      {
        id: "source-1",
        title: "Budget thoughts",
        tags: ["work", "money"],
        frontmatter: { summary: "A short note" },
      },
    ]);

    expect(second).not.toBe(first);
    expect(retainStableDataNodes(first, second)).toBe(first);
  });

  it("returns a new ref when graph-visible content changes", () => {
    const first = sourceRowsToDataNodes([
      {
        id: "source-1",
        title: "Budget thoughts",
        tags: ["work", "money"],
        frontmatter: { summary: "A short note" },
      },
    ]);
    const changed = sourceRowsToDataNodes([
      {
        id: "source-1",
        title: "Budget thoughts",
        tags: ["relation", "money"],
        frontmatter: { summary: "A short note" },
      },
    ]);

    expect(sameDataNodes(first, changed)).toBe(false);
    expect(retainStableDataNodes(first, changed)).toBe(changed);
  });
});

describe("NavGraph memo comparator", () => {
  it("skips rerendering for equal node content and stable callbacks", () => {
    const onFirstInteraction = jest.fn();
    const onActiveChange = jest.fn();
    const prev = {
      locale: "en" as const,
      dataNodes: [{ id: "source-1", title: "Budget thoughts", parentId: "work", tags: ["work"], summary: "A" }],
      highlightId: null,
      glowNodeId: "records",
      onFirstInteraction,
      onActiveChange,
    };
    const next = {
      ...prev,
      dataNodes: [{ id: "source-1", title: "Budget thoughts", parentId: "work", tags: ["work"], summary: "A" }],
    };

    expect(areNavGraphPropsEqual(prev, next)).toBe(true);
  });

  it("rerenders when the same node id changes visible content", () => {
    const prev = {
      locale: "ko" as const,
      dataNodes: [{ id: "source-1", title: "예산", parentId: "work", tags: ["work"], summary: "A" }],
      highlightId: null,
      glowNodeId: null,
    };
    const next = {
      ...prev,
      dataNodes: [{ id: "source-1", title: "관계", parentId: "relation", tags: ["relation"], summary: "A" }],
    };

    expect(areNavGraphPropsEqual(prev, next)).toBe(false);
  });
});
