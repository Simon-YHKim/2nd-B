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
    expect(RECORDS_SRC).toContain("recordRouteParamsById(id, graphSourceRecords)");
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

    // Re-pinned 2026-09-13 (P1, Simon's decision at 22:26): the legacy handoff stopped
    // promising a highlight on the archived graph and now opens the piece's life area,
    // the same rule as the shipped detail. That button and the line computing its area
    // are the only changes in this slice (7,931 -> 8,001 chars); the shipped detail got
    // the same button with its own pins in saved-piece-opens-its-area.test.ts.
    //
    // Re-pinned 2026-09-14 (P1 follow-up): the shipped detail's area button now follows the
    // /capture record save and opens collect too, and this legacy half keeps the same rule.
    // The line computing its area and the comment above it are the only changes in this
    // slice (8,001 -> 8,049 chars). Verified before re-pinning: the old digest recomputes
    // from the parent commit, so only the intended lines moved.
    expect(sha256(legacy)).toBe("bb2b22568ffc222d8da8059bd6f13c68a1f481cb58d1990bb3b1a212112b3ee5");
    expect(sha256(records)).toBe(
      // Re-pinned in the integration merge. This PR computed the digest against a
      // records screen that predates #1521 (bounded graph rendering, its own
      // ListHeaderComponent). Verified before changing: the merged records slice is
      // byte-identical to #1521's, so this still proves the detail extraction left
      // the neighbouring renderer alone -- only the baseline moved.
      // Polaris role-card integration intentionally changes the neighboring
      // records renderer; pin its new exact slice so future unrelated edits
      // still require an explicit review.
      "9be2bc0fba47aaacdb791b0366fb0ea218a3c4236e9f3b278630450aeaf526d7",
    );
    // Re-pinned 2026-09-20 (R48): the wiki screen now honours a ?focusPageId= that names
    // a page outside the 200-row slice it loads -- the RAG citation path can cite one,
    // and the old effect dropped it silently. Slice 8,406 -> 10,217 chars / 177 -> 217
    // lines (+1,811 / +40): a `useRef` and a `getWikiPageById` import specifier, the
    // rewritten focus effect and its two new state holders, a `listedPages` memo, and
    // three call sites reading that memo instead of `pages` -- plus their comments.
    //
    // Re-pinned again 2026-09-20 (R49): the row that effect fetches is now carried with
    // the account it was fetched for, the honour guard is keyed on the (account, id)
    // pair instead of the id alone, and the default-open row is chosen from what the
    // view can actually draw rather than from any non-null id. Slice 10,217 -> 11,609
    // chars / 217 -> 237 lines (+1,392 / +20), all of it inside those three edits and
    // their comments. Verified before re-pinning: the R48 digest below recomputes
    // byte-for-byte from HEAD's copy of this file, so this change is the only delta in
    // the slice.
    //   git show HEAD:src/screens/deepspace/dds-wiki-records-screens.tsx
    //     | slice from "export function DeepSpaceWikiScreen()" -> sha256
    //     = 0b269d67992b803d9c6093032b2101b7d373c6c6cb811d0522d372e1f14eae19  (matches)
    expect(sha256(wiki)).toBe("677ed103ab26600b77ae9084ce8fa5c67dd71940b9cec7151298aeac0c0bf870");
  });
});
