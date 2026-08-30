import { readFileSync } from "node:fs";
import { join } from "node:path";

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
    expect(src).toContain("const GRAPH_RECORD_LIMIT = 96;");
    expect(src).toContain("filtered.slice(0, GRAPH_RECORD_LIMIT)");
    expect(src).toContain("graphCount < filtered.length");
    expect(src).not.toContain("setRecords(merged.slice(");
  });

  it("uses the PIXEL-CLAY rail and integer rect graph cells with 44dp controls", () => {
    expect(src).toContain('from "@/components/pixel/PixelPressable"');
    expect(src).toContain('from "@/components/pixel/PixelSurface"');
    expect(graph).toContain("sampledEdgeCells(");
    expect(graph).toContain("<Rect key={j}");
    expect(graph).not.toContain("<Line");
    expect(graph).toContain("width: 44, minHeight: 44");
    expect(graph).toContain("root: { flex: 1, minHeight: 0 }");
    expect(graph).toContain("const hitTargetSize = (44 * span) / canvasExtent;");
    expect(graph).toContain('fill="transparent"');
    expect(graph).toContain("accessible");
    expect(graph).toContain("accessibilityLabel={node.label}");
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
    expect(src).toContain("addImportHistory({");
    // Revoke actually withdraws (delete rows + remove log), not a local filter.
    expect(src).toContain("deleteSourcesByIds(userId, entry.sourceIds)");
    expect(src).toContain("removeImportHistory(entry.id)");
    expect(src).not.toContain("xs.filter((x) => x.id !== h.id)");
  });
});
