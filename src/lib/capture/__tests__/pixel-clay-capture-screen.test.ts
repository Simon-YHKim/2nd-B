import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../../..");

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("PIXEL-CLAY /capture screen contract", () => {
  const route = read("src/app/capture.tsx");
  const renderer = read("src/components/deep-space/DeepSpaceViews.tsx");

  test("keeps the production route on the shared shell without legacy companion chrome", () => {
    expect(route).toContain('<DeepSpaceScreen active="capture" header="none" variant="windowed">');
    expect(route).toContain("<CaptureView firstRecordCoach={firstRecordCoach} />");
  });

  // 2026-09-30 (Simon): five tiles became three - 사진 and 음성 left the row, and
  // a photo now attaches to 글 (both formats) instead. The tiles still come from
  // the canon JSON, which dropped the two ids in the same change.
  test("matches the reference hierarchy with three tiles and two text formats", () => {
    expect(renderer).toContain("CAPTURE_MODE_ROW.map");
    expect(renderer).toContain('accessibilityRole="tablist"');
    expect(renderer).toContain('accessibilityRole="radiogroup"');
    expect(renderer).toContain('useState<CaptureTextFormat>("fourw")');
    expect(renderer).toContain('t("capture:modes.memo.label")');
    expect(renderer).toContain('t("capture:modes.fourw.label")');
    expect(renderer).toContain("<PixelSurface");
    expect(renderer).not.toContain("<Text style={styles.capTitle}");
    expect(renderer).not.toContain("<View style={styles.capBanner}");
  });

  test("preserves real persistence, safety, error, and Android input contracts", () => {
    expect(renderer).toContain('tag = "fourw"');
    expect(renderer).toContain('tag = "memo"');
    expect(renderer).toContain("await createRecord({");
    expect(renderer).toContain('res.followup?.zone === "red"');
    expect(renderer).toContain("setError(true)");
    expect(renderer).toContain("automaticallyAdjustKeyboardInsets");
    expect(renderer).toContain("onSubmitEditing={() => whatRef.current?.focus()}");
    expect(renderer).toContain("minHeight: 44");
  });

  test("the tile row has no 사진/음성 and no way back to them (2026-09-30)", () => {
    const canonModes = (JSON.parse(read("public/proto/data/core/capture-modes.json")) as {
      modes: { id: string }[];
    }).modes.map((mode) => mode.id);
    expect(canonModes).toEqual(["text", "link", "todo"]);
    expect(renderer).toContain('type CaptureMode = "text" | "link" | "todo";');
    expect(renderer).not.toContain('mode === "photo"');
    expect(renderer).not.toContain('mode === "voice"');
    expect(renderer).not.toContain('f("photoOpen")');
    expect(renderer).not.toContain('f("voiceOpen")');
  });

  test("글 carries photos in both formats and stores them with the record", () => {
    const capture = renderer.slice(
      renderer.indexOf("export function CaptureView"),
      renderer.indexOf("// ── 세컨비 / Chat"),
    );
    // One strip, rendered inside the memo form and inside the 4W1H form, and
    // hidden until the photo bucket exists (record-photos-server-gate.test.ts).
    expect(capture.split("{photoStrip}").length - 1).toBe(2);
    expect(capture).toContain("const photoStrip = !RECORD_PHOTOS_ENABLED ? null : (");
    expect(capture).toContain('pickAttachmentImage("library")');
    expect(capture).toContain("await uploadRecordPhotos(userId, attached)");
    expect(capture).toContain("recordPhotosPayload(uploaded)");
    expect(capture).toContain("removeRecordPhotoObjects(uploaded.map((photo) => photo.path))");
    // Stored, never read by an AI: no OCR or model call on this screen.
    expect(capture).not.toContain("ocrImageAsset");
    expect(capture).not.toContain("callLlm(");
  });

  test("to-do fields grow with their text instead of overlapping the rows below", () => {
    const todoInput = renderer.slice(
      renderer.indexOf("const CaptureTodoInput"),
      renderer.indexOf("export function CaptureView"),
    );
    expect(todoInput).toContain("multiline");
    expect(todoInput).toContain("onContentSizeChange");
    expect(todoInput).toContain("clampTodoInputHeight(");
    expect(todoInput).toContain("scrollEnabled={todoInputScrolls(height)}");
    expect(todoInput).toContain('submitBehavior="submit"');
    expect(renderer).toContain("<CaptureTodoInput");
    expect(renderer).toContain("onSubmitEditing={() => submitTodoAt(i)}");
    // Top-aligned rows: a wrapped to-do keeps its checkbox on the first line.
    expect(renderer).toMatch(/capTodoRow: \{[^}]*alignItems: "flex-start"/);
  });
});
