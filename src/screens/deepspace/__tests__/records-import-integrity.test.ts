import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildRecordsGraph, type GraphRecord } from "../../../lib/records/records-graph";
import {
  MAX_RECORDS_PER_GRAPH_DOMAIN,
  RECORDS_GRAPH_EDGE_PRIMITIVE_BUDGET,
  RECORDS_GRAPH_GRID_STEP,
  RECORDS_GRAPH_MIN_CANVAS_EXTENT,
  RECORDS_GRAPH_NON_EDGE_PRIMITIVE_RESERVE,
  RECORDS_GRAPH_SVG_PRIMITIVE_BUDGET,
  budgetRecordsGraphEdgeCells,
  layoutRecordsGraph,
  selectRecordsForSafeGraph,
} from "../../../lib/records/records-graph-layout";

// Source-scan guards for the A-to-Z records/import data-integrity fixes. These
// screens are JSX-heavy and gate on real network/Supabase state, so — like the
// focus-refetch and advisor-followup contracts — we pin the load-bearing wiring
// in source rather than mounting the tree.

const ROOT = process.cwd();
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const RECORDS = "src/screens/deepspace/dds-wiki-records-screens.tsx";
const RECORDS_GRAPH = "src/components/deep-space/RecordsGraph.tsx";
const IMPORT_HUB = "src/screens/deepspace/import/ImportHubScreen.tsx";
const IMPORT_INBOX = "src/screens/deepspace/dds-import-inbox-screens.tsx";

describe("records screen honest error state + focus refetch + virtualized list", () => {
  const src = read(RECORDS);

  it("does not coerce a records-read failure to an empty list (false-empty)", () => {
    expect(src).not.toContain("listRecentRecords(userId).catch(() => [])");
    expect(src).toContain("recordsFailed = true");
    expect(src).toContain("setLoadError(true)");
  });

  it("renders a distinct error state with a retry, using both-locale keys", () => {
    expect(src).toContain('t("records.loadError")');
    expect(src).toContain('t("records.retry")');
    for (const locale of ["en", "ko"]) {
      const dict = JSON.parse(read(`locales/${locale}/deepspace.json`)).records;
      expect(typeof dict.loadError).toBe("string");
      expect(typeof dict.retry).toBe("string");
    }
  });

  it("refetches on focus via the shared helper (delete-then-back reflects here)", () => {
    expect(src).toContain('from "@/lib/nav/use-focus-refetch"');
    expect(src).toContain("useFocusRefetch(() => setReloadKey((k) => k + 1), Boolean(userId))");
  });

  it("virtualizes the list (FlatList) instead of mapping every row in a ScrollView", () => {
    expect(src).toContain("<FlatList");
    expect(src).toContain("ListEmptyComponent");
    expect(src).toContain("renderItem={renderRecord}");
    // The old synchronous full-list mount is gone.
    expect(src).not.toContain("filtered.map(");
    // Row is memoized so filter-chip taps do not re-render unchanged cards.
    expect(src).toContain("const RecordCard = memo(");
  });
});

describe("PIXEL-CLAY records root composition", () => {
  const src = read(RECORDS);
  const graph = read(RECORDS_GRAPH);

  it("opens on the real connection graph while keeping the complete FlatList one tap away", () => {
    expect(src).toContain('useState<"list" | "graph">("graph")');
    expect(src).toContain('onPress={() => setView("list")}');
    expect(src).toContain("<FlatList");
    expect(src).toContain("data={loadError ? [] : filtered}");
  });

  it("bounds only the visual graph, never the archive data source", () => {
    expect(src).toContain("selectRecordsForSafeGraph(filtered)");
    expect(src).toContain("graphCount < filtered.length");
    expect(src).toContain("accessibilityLabel={graphCountText}");
    expect(src).not.toContain("setRecords(merged.slice(");
  });

  it("uses the PIXEL-CLAY rail and integer rect graph cells with 44dp controls", () => {
    expect(src).toContain('from "@/components/pixel/PixelPressable"');
    expect(src).toContain('from "@/components/pixel/PixelSurface"');
    expect(graph).toContain("sampledEdgeCells(");
    expect(graph).toContain("return budgetRecordsGraphEdgeCells(nonLinks, tagLinks);");
    expect(graph).toContain("edgeCells.map((cell)");
    expect(graph).not.toContain("<G key={i}>");
    expect(graph).not.toContain("<Line");
    expect(graph).toContain("width: 44, minHeight: 44");
    expect(graph).toContain("root: { flex: 1, minHeight: 0 }");
    expect(graph).toContain("const hitTargetSize = (44 * span) / canvasExtent;");
    expect(graph).toContain('fill="transparent"');
    expect(graph).toContain("accessible");
    expect(graph).toContain("accessibilityLabel={node.label}");
    expect(graph).toContain('accessibilityRole="switch"');
    expect(graph).toContain("accessibilityState={{ checked: showTagLinks }}");
  });

  it("caps the whole SVG edge layer deterministically and gives non-links first claim", () => {
    expect(RECORDS_GRAPH_SVG_PRIMITIVE_BUDGET).toBe(1200);
    expect(RECORDS_GRAPH_NON_EDGE_PRIMITIVE_RESERVE).toBe(176);
    expect(RECORDS_GRAPH_EDGE_PRIMITIVE_BUDGET).toBe(1024);

    const nonLinks = Array.from({ length: 28 }, (_, edge) => ({
      cells: Array.from({ length: 32 }, (_, cell) => `non:${edge}:${cell}`),
    }));
    const tagLinks = Array.from({ length: 400 }, (_, edge) => ({
      cells: Array.from({ length: 16 }, (_, cell) => `tag:${edge}:${cell}`),
    }));
    const cells = budgetRecordsGraphEdgeCells(nonLinks, tagLinks);

    expect(cells).toHaveLength(RECORDS_GRAPH_EDGE_PRIMITIVE_BUDGET);
    expect(cells.slice(0, 28 * 32).every((cell) => cell.startsWith("non:"))).toBe(true);
    expect(cells.slice(28 * 32).every((cell) => cell.startsWith("tag:"))).toBe(true);
    expect(cells).toEqual(budgetRecordsGraphEdgeCells(nonLinks, tagLinks));
  });

  it("auto-labels only a sparse record graph and always labels the selected record", () => {
    expect(graph).toContain("const AUTO_RECORD_LABEL_LIMIT = 7;");
    expect(graph).toContain('graph.nodes.filter((node) => node.kind === "record").length');
    expect(graph).toContain("recordNodeCount <= AUTO_RECORD_LABEL_LIMIT");
    expect(graph).toContain("isPolaris || isDomain || isSelected ||");
  });

  it("selects three newest records per domain on non-overlapping 44dp lattice slots", () => {
    const domains = ["career", "finance", "growth", "relation", "health", "recreation", "collect"];
    const dense: GraphRecord[] = domains.flatMap((domain) =>
      Array.from({ length: 8 }, (_, index) => ({
        id: `${domain}:${index}`,
        topic: `${domain} ${index}`,
        tags: [`domain:${domain}`],
      })),
    );
    const selected = selectRecordsForSafeGraph(dense);

    expect(MAX_RECORDS_PER_GRAPH_DOMAIN).toBe(3);
    expect(selected).toHaveLength(domains.length * MAX_RECORDS_PER_GRAPH_DOMAIN);
    for (const domain of domains) {
      expect(selected.filter((record) => record.id.startsWith(`${domain}:`)).map((record) => record.id))
        .toEqual([`${domain}:0`, `${domain}:1`, `${domain}:2`]);
    }

    const graphData = buildRecordsGraph(selected);
    const positions = layoutRecordsGraph(graphData);
    const points = graphData.nodes.map((node) => positions[node.id]);
    const hitSpan = 44 / RECORDS_GRAPH_MIN_CANVAS_EXTENT;
    expect(RECORDS_GRAPH_GRID_STEP * RECORDS_GRAPH_MIN_CANVAS_EXTENT).toBeGreaterThanOrEqual(44);
    for (const point of points) {
      expect(point).toBeDefined();
      expect(Math.min(point.x, point.y, 1 - point.x, 1 - point.y)).toBeGreaterThanOrEqual(hitSpan / 2);
    }
    for (let a = 0; a < points.length; a += 1) {
      for (let b = a + 1; b < points.length; b += 1) {
        const axisGap = Math.max(
          Math.abs(points[a].x - points[b].x),
          Math.abs(points[a].y - points[b].y),
        );
        expect(axisGap + Number.EPSILON).toBeGreaterThanOrEqual(hitSpan);
      }
    }
  });
});

describe("import withdrawal integrity", () => {
  it("ImportHubScreen keeps the history entry when the source delete fails", () => {
    const src = read(IMPORT_HUB);
    // The swallow-then-remove path (delete fails but the log is dropped anyway,
    // stranding the rows as unrevokable) must be gone.
    expect(src).not.toContain("the history entry is still removed below");
    expect(src).toContain('setHistErr(t("revokeFailed"))');
    // The catch returns before removeImportHistory, so the entry survives.
    const remove = src.slice(src.indexOf("const removeHistory"), src.indexOf("// --- render"));
    expect(remove).toMatch(/catch\s*\{\s*setHistErr\(t\("revokeFailed"\)\);\s*return;/);
  });

  it("file imports are logged (revocable) and the revoke button deletes rows", () => {
    const src = read(IMPORT_INBOX);
    // handlePickFiles now records an import-history entry pointing at the created
    // source rows, so they show up in the import-hub withdrawal list.
    expect(src).toContain("createdIds.push(r.source.id)");
    // Per-user scoping (F-08): the history call carries userId, so B never sees
    // A's log on a shared device. The bare `addImportHistory({` form is the
    // pre-F-08 global-key regression and must stay gone.
    expect(src).toContain("addImportHistory(userId, {");
    expect(src).not.toContain("addImportHistory({");
    // Revoke actually withdraws (delete rows + remove log), not a local filter.
    expect(src).toContain("deleteSourcesByIds(userId, entry.sourceIds)");
    expect(src).toContain("removeImportHistory(userId, entry.id)");
    expect(src).not.toContain("xs.filter((x) => x.id !== h.id)");
  });
});
