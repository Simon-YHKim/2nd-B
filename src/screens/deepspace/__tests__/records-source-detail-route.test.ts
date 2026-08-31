import crypto from "crypto";
import fs from "fs";
import path from "path";

const RECORDS_SRC = fs.readFileSync(
  path.resolve(__dirname, "..", "dds-wiki-records-screens.tsx"),
  "utf8",
);
const DETAIL_SRC = fs.readFileSync(
  path.resolve(__dirname, "..", "dds-record-detail-screen.tsx"),
  "utf8",
);
const GET_PIECE_SRC = fs.readFileSync(
  path.resolve(__dirname, "..", "..", "..", "lib", "records", "get-piece.ts"),
  "utf8",
);
const ROUTE_SRC = fs.readFileSync(
  path.resolve(__dirname, "..", "..", "..", "app", "record", "[id].tsx"),
  "utf8",
);

function normalized(source: string): string {
  return source.replace(/\r\n?/g, "\n");
}

function sliceBetween(source: string, start: string, end?: string): string {
  const clean = normalized(source);
  const startIndex = clean.indexOf(start);
  const endIndex = end ? clean.indexOf(end, startIndex) : clean.length;
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return clean.slice(startIndex, endIndex);
}

function sha256(source: string): string {
  return crypto.createHash("sha256").update(source).digest("hex");
}

describe("deep-space records source detail routing", () => {
  test("source rows keep their source id and origin for detail navigation", () => {
    expect(RECORDS_SRC).toContain('type RecordsOrigin = "record" | "source";');
    expect(RECORDS_SRC).toContain(
      "type RecordsTimelineRecord = TimelineRecord & { origin?: RecordsOrigin; sourceId?: string };",
    );
    expect(RECORDS_SRC).toContain("id: s.id");
    expect(RECORDS_SRC).toContain('origin: "source"');
    expect(RECORDS_SRC).toContain("sourceId: s.sourceId");
    expect(RECORDS_SRC).toContain("onPress={openRecord}");
    expect(RECORDS_SRC).toContain("params: recordRouteParams(record)");
    expect(RECORDS_SRC).toContain("recordRouteParamsById(id, records)");
    expect(RECORDS_SRC).toContain("r.id === id || r.sourceId === id");
  });

  test("the extracted detail screen reads the real owner-scoped record or source", () => {
    expect(RECORDS_SRC).toContain(
      'export { DeepSpaceRecordDetailScreen } from "./dds-record-detail-screen";',
    );
    expect(DETAIL_SRC).toContain(
      'const requestedOrigin = originValue === "source" ? "source" : null;',
    );
    expect(DETAIL_SRC).toContain("getPieceById(userId, recordId, requestedOrigin)");
    expect(DETAIL_SRC).toContain('const source = piece.origin === "source";');
    expect(GET_PIECE_SRC).toContain('.from("sources")');
    expect(GET_PIECE_SRC).toContain(
      '.select("id, kind, title, captured_at, tags, storage_path, frontmatter")',
    );
    expect(GET_PIECE_SRC).toContain('origin: "source"');
    expect(GET_PIECE_SRC).toContain('import { downloadRawClipping } from "../wiki/storage";');
    expect(GET_PIECE_SRC).toContain(
      "const body = await downloadRawClipping(s.storage_path).catch(() => fallback);",
    );
  });

  test("primary and related reads have separate finite states and stale guards", () => {
    expect(DETAIL_SRC).toContain('status: "loading"');
    expect(DETAIL_SRC).toContain('status: "timeout"');
    expect(DETAIL_SRC).toContain('status: "error"');
    expect(DETAIL_SRC).toContain('status: "missing"');
    expect(DETAIL_SRC).toContain('status: "ready"');
    expect(DETAIL_SRC).toContain("withReadTimeout(getPieceById");
    expect(DETAIL_SRC).toContain("error instanceof ReadTimeoutError");
    expect(DETAIL_SRC).toContain("identityRef.current === key");
    expect(DETAIL_SRC).toContain("if (!alive || !isCurrent(identity)) return;");
    expect(DETAIL_SRC).toContain("Promise.allSettled([tagRead, semanticRead])");
    expect(DETAIL_SRC).not.toMatch(/Promise\.all\(\[\s*[^\]]*getPieceById/);
    expect(DETAIL_SRC).toContain("relationFailed(related)");
  });

  test("auth, profile, owner, and route changes cannot expose a stale ready piece", () => {
    expect(DETAIL_SRC).toContain("if (authLoading)");
    expect(DETAIL_SRC).toContain('if (!userId) return <Redirect href="/sign-in" />');
    expect(DETAIL_SRC).toContain("if (hasProfile === null && !profileProbeFailed)");
    expect(DETAIL_SRC).toContain("if (profileProbeFailed)");
    expect(DETAIL_SRC).toContain(
      'if (hasProfile === false) return <Redirect href="/complete-profile" />',
    );
    expect(DETAIL_SRC).toContain("() => void refresh()");
    expect(DETAIL_SRC).toContain('{ status: "ready"; identity: string; piece: DetailPiece }');
    expect(DETAIL_SRC).toContain("primary.identity !== identity ||");
  });

  test("semantic neighbors are owner scoped and fail closed before the RPC", () => {
    expect(DETAIL_SRC).toContain("async function readEmbeddingPreference(userId: string)");
    expect(DETAIL_SRC).toContain('.from("users")');
    expect(DETAIL_SRC).toContain('.eq("id", userId)');
    expect(DETAIL_SRC).toContain("if (isMinor !== false || !isActive())");
    expect(DETAIL_SRC).toContain("recordsEmbeddingAllowed(isMinor, preference)");
    expect(DETAIL_SRC).toContain("() => semanticGuard.active && alive && isCurrent(identity)");
    expect(DETAIL_SRC).toContain("semanticGuard.active = false");
    const preferenceRead = DETAIL_SRC.indexOf(
      "const preference = await readEmbeddingPreference(userId);",
    );
    const semanticRead = DETAIL_SRC.indexOf("await relatedRecordsByEmbedding(userId, recordId, 6)");
    expect(preferenceRead).toBeGreaterThanOrEqual(0);
    expect(semanticRead).toBeGreaterThan(preferenceRead);
    expect(DETAIL_SRC).toContain('readyOrigin === "source"');
  });

  test("internal domain tags never become visible, editable, or logged", () => {
    expect(DETAIL_SRC).toContain("stripDomainTags(readyPiece?.tags ?? [])");
    expect(DETAIL_SRC).toContain("if (isDomainTag(tag))");
    expect(DETAIL_SRC).toContain("return [...stripDomainTags(tags), domainTagFor(target)]");
    expect(DETAIL_SRC).not.toContain("console.");
    expect(DETAIL_SRC).not.toMatch(/\(piece\.tags \?\? \[\]\)\.map\([^)]*<RNText/);
  });

  test("record mutations are explicit, locked, optimistic, and rolled back", () => {
    expect(DETAIL_SRC).toContain("locksRef.current.edit");
    expect(DETAIL_SRC).toContain("locksRef.current.tags");
    expect(DETAIL_SRC).toContain("locksRef.current.delete");
    expect(DETAIL_SRC).toContain("if (nextBody.length === 0 || nextBody ===");
    expect(DETAIL_SRC).toContain("updateReadyPiece({ ...previous, body: nextBody })");
    expect(DETAIL_SRC).toContain("updateReadyPiece(previous)");
    expect(DETAIL_SRC).toContain("visible={confirmingDelete}");
    expect(DETAIL_SRC).toContain("onPress={() => void handleDelete()}");
    expect(DETAIL_SRC).toContain("{source ? null : (");
    expect(DETAIL_SRC).toContain("await deleteRecord(userId, primary.piece.id)");
  });

  test("sources expose only an explicit promotion action and never promote on mount", () => {
    expect(DETAIL_SRC).toContain('primary.piece.origin !== "source"');
    expect(DETAIL_SRC).toContain("locksRef.current.promote");
    expect(DETAIL_SRC).toContain("onPress={() => void promoteToWiki()}");
    expect(DETAIL_SRC).toContain("await promotePendingUploads(userId)");
    expect(DETAIL_SRC).toContain("await generateSourcePage(userId, sourceId)");
    expect(DETAIL_SRC).not.toMatch(
      /useEffect\([\s\S]{0,800}(promotePendingUploads|generateSourcePage)/,
    );
  });

  test("assessment, structured content, and ordinary body keep distinct renderers", () => {
    expect(DETAIL_SRC).toContain("const assessment = assessmentInfo(piece)");
    expect(DETAIL_SRC).toContain("JSON.parse(body)");
    expect(DETAIL_SRC).toContain('t("deepspace:recordDetail.assessmentBody")');
    expect(DETAIL_SRC).toContain("const structured = parseStructured(piece.structured)");
    expect(DETAIL_SRC).toContain("structuredFieldLabel(");
    expect(DETAIL_SRC).toContain("<RNText selectable");
  });

  test("the migrated renderer uses Pixel primitives, Fabric-safe styles, and full-width actions", () => {
    expect(DETAIL_SRC).toContain("PixelSurface");
    expect(DETAIL_SRC).toContain("PixelPressable");
    expect(DETAIL_SRC).toContain("PixelGlyph");
    expect(DETAIL_SRC).toContain("minHeight: m3.minTouch");
    expect(DETAIL_SRC).toContain("fullWidth");
    expect(DETAIL_SRC).not.toContain("<Pressable");
    expect(DETAIL_SRC).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(DETAIL_SRC).not.toMatch(/rgba?\(/);
    expect(DETAIL_SRC).not.toMatch(/style=\{\([^)]*\)\s*=>/);
  });

  test("legacy route and neighboring records/wiki renderers remain byte-stable", () => {
    const legacy = sliceBetween(
      ROUTE_SRC,
      "function RecordDetailLegacy()",
      "\nexport default function RecordDetail()",
    );
    const records = sliceBetween(
      RECORDS_SRC,
      "export function DeepSpaceRecordsScreen()",
      "\nexport { DeepSpaceRecordDetailScreen",
    );
    const wiki = sliceBetween(RECORDS_SRC, "export function DeepSpaceWikiScreen()");

    expect(sha256(legacy)).toBe("764d8cc2792bcd5174803505d9e935e87e37784364c78d8c9eaed6044e257e31");
    expect(sha256(records)).toBe(
      "be3195bfef932e91b336966369f2e49a0a2529b9dfbe53c708178a86cf90c8a5",
    );
    expect(sha256(wiki)).toBe("caa3ad24cbf6497c7958454a0b68b239e0b9faebfa658980687de5cc0d75008a");
  });
});
