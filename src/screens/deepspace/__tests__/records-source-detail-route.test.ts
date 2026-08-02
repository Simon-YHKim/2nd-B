import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "..", "dds-wiki-records-screens.tsx"), "utf8");
const GET_PIECE_SRC = fs.readFileSync(path.resolve(__dirname, "..", "..", "..", "lib", "records", "get-piece.ts"), "utf8");

describe("deep-space records source detail routing", () => {
  test("source rows keep their source id and origin for detail navigation", () => {
    expect(SRC).toContain('type RecordsOrigin = "record" | "source";');
    expect(SRC).toContain('type RecordsTimelineRecord = TimelineRecord & { origin?: RecordsOrigin; sourceId?: string };');
    expect(SRC).toContain("id: s.id");
    expect(SRC).toContain('origin: "source"');
    expect(SRC).toContain("sourceId: s.sourceId");
    expect(SRC).toContain("onPress={openRecord}");
    expect(SRC).toContain('params: recordRouteParams(record)');
    expect(SRC).toContain("recordRouteParamsById(id, records)");
    expect(SRC).toContain("r.id === id || r.sourceId === id");
  });

  test("the detail screen reads sources when origin=source", () => {
    expect(SRC).toContain('const isSource = origin === "source";');
    expect(SRC).toContain("const recordPromise = getPieceById(userId, recordId, origin);");
    expect(GET_PIECE_SRC).toContain('.from("sources")');
    expect(GET_PIECE_SRC).toContain('.select("id, kind, title, captured_at, tags, storage_path, frontmatter")');
    expect(GET_PIECE_SRC).toContain('origin: "source"');
    expect(SRC).toContain("if (!userId || !recordId || isSource) return;");
    expect(SRC).toContain("if (isSource || !tag || !userId || !record || !recordId) return;");
    expect(SRC).toContain("if (isSource || !userId || !record || !recordId) return;");
    expect(SRC).toContain("if (isSource || !record) return;");
    expect(SRC).toMatch(/\{isSource \? null : addingTag \? \(/);
    expect(SRC).toMatch(/\{isSource \? null : \(\s+<View style=\{styles\.ctaRow\}>/);
  });

  test("source detail renders saved markdown body with inline fallback", () => {
    expect(GET_PIECE_SRC).toContain('import { downloadRawClipping } from "../wiki/storage";');
    expect(GET_PIECE_SRC).toContain("function sourceBodyFallback(frontmatter: Record<string, unknown> | null): string | null");
    expect(GET_PIECE_SRC).toContain("const fallback = sourceBodyFallback(s.frontmatter);");
    expect(GET_PIECE_SRC).toContain("const body = await downloadRawClipping(s.storage_path).catch(() => fallback);");
    expect(GET_PIECE_SRC).toContain("body,");
  });

  test("semantic related state is cleared before source or consent-gated detail reads", () => {
    expect(SRC).toMatch(/setSemanticIds\(new Set\(\)\);\s+if \(!userId \|\| !recordId \|\| isSource\) return;/);
    expect(SRC).toMatch(
      /if \(!recordsEmbeddingAllowed\(false, prefs\.records_embedding\)\) \{\s+if \(alive\) setSemanticIds\(new Set\(\)\);\s+return;\s+\}/,
    );
  });

  test("related-record read failures do not hide the focal detail record", () => {
    expect(SRC).toContain("const relatedPromise = listRecentRecords(userId).catch(() => [] as TimelineRecord[]);");
    expect(SRC).toContain("Promise.all([recordPromise, relatedPromise])");
  });
});
