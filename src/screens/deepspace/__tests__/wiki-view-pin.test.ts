// The wiki list keeps only the top `maxPages` (12) pages by connection count. The GRAPH
// does not truncate -- it draws every page. So a sparsely-linked page was a visible node,
// and tapping it did:
//
//   onOpenPage={(id) => { setWikiView("list"); setExpandedId(id); }}
//
// ...which switched to a list that did not contain that page. The user asked to open
// something and landed on a list where it was not, with nothing expanded. The screen looked
// like it had ignored them.
//
// A page the user explicitly asked to open is now pinned into the list, ranking be damned.
// That is the whole point of asking.

import { buildDeepWikiView } from "../wiki-graph-view";
import type { WikiPageRow } from "@/lib/wiki/types";
import type { WikiEdge } from "../wiki-graph-view";

function page(id: string, tags: string[] = []): WikiPageRow {
  return {
    id,
    user_id: "u1",
    slug: id,
    title: id,
    body_md: `body of ${id}`,
    kind: "note",
    tags,
    source_id: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
  } as unknown as WikiPageRow;
}

/** `hub` is linked to by everyone; `lonely` is linked to by nobody. */
function graph(pageCount: number): { pages: WikiPageRow[]; edges: WikiEdge[] } {
  const pages = [page("hub"), ...Array.from({ length: pageCount - 2 }, (_, i) => page(`p${i}`)), page("lonely")];
  const edges: WikiEdge[] = pages
    .filter((p) => p.id !== "hub" && p.id !== "lonely")
    .map((p) => ({ from_page: p.id, to_page: "hub" }) as unknown as WikiEdge);
  return { pages, edges };
}

describe("a page the user opened is always in the list", () => {
  const MAX = 12;
  // 20 pages, so 8 fall outside the top-12 cut. `lonely` has zero connections, so it sorts
  // dead last -- exactly the page that used to vanish.
  const { pages, edges } = graph(20);

  test("without a pin, the list truncates and the lonely page is absent", () => {
    const view = buildDeepWikiView(pages, edges, { maxPages: MAX });
    expect(view.pages).toHaveLength(MAX);
    expect(view.pages.some((p) => p.id === "lonely")).toBe(false);
  });

  test("pinning the lonely page puts it in the list", () => {
    const view = buildDeepWikiView(pages, edges, { maxPages: MAX, pinnedId: "lonely" });
    expect(view.pages.some((p) => p.id === "lonely")).toBe(true);
  });

  test("the pin does not lengthen the list -- it displaces the last row", () => {
    const view = buildDeepWikiView(pages, edges, { maxPages: MAX, pinnedId: "lonely" });
    expect(view.pages).toHaveLength(MAX);
  });

  test("the pin does not evict the top-ranked page", () => {
    const view = buildDeepWikiView(pages, edges, { maxPages: MAX, pinnedId: "lonely" });
    expect(view.pages.some((p) => p.id === "hub")).toBe(true);
  });

  test("pinning a page that was already in the top-N changes nothing", () => {
    const without = buildDeepWikiView(pages, edges, { maxPages: MAX });
    const withPin = buildDeepWikiView(pages, edges, { maxPages: MAX, pinnedId: "hub" });
    expect(withPin.pages.map((p) => p.id)).toEqual(without.pages.map((p) => p.id));
  });

  test("an unknown pin id is simply ignored -- it does not blank the list", () => {
    const view = buildDeepWikiView(pages, edges, { maxPages: MAX, pinnedId: "does-not-exist" });
    expect(view.pages).toHaveLength(MAX);
  });

  test("a pin filtered out by the active tag is not resurrected", () => {
    // The graph is tag-filtered too, so this cannot normally happen -- but if it does, the
    // pin must not smuggle a page past the filter the user set.
    const tagged = [page("a", ["work"]), page("b", ["work"]), page("c", ["home"])];
    const view = buildDeepWikiView(tagged, [], { maxPages: MAX, activeTag: "work", pinnedId: "c" });
    expect(view.pages.map((p) => p.id).sort()).toEqual(["a", "b"]);
  });
});

// The screen must actually pass the pin, or the fix is a function nobody calls.
describe("the wiki screen pins the page it expanded", () => {
  const src = (
    require("fs").readFileSync(
      require("path").resolve(__dirname, "../dds-wiki-records-screens.tsx"),
      "utf8",
    ) as string
  ).replace(/\r\n/g, "\n");

  test("buildDeepWikiView receives expandedId as the pin", () => {
    expect(src).toMatch(/buildDeepWikiView\(pages, edges, \{ activeTag, pinnedId: expandedId \}\)/);
    // And expandedId is in the memo deps, or the pin would go stale the moment it mattered.
    expect(src).toMatch(/\[pages, edges, activeTag, expandedId\]/);
  });
});
