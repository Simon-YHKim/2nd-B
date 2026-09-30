import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import { advanceFirstRecordCoach, type FirstRecordCoachStep } from "../first-record-coach";
import { recordPhotosPayload, type RecordPhotoRef } from "../../capture/record-photos";

// Execute the actual save/skip handlers without loading the native renderer or
// database. The guide transition is imported from production, not reproduced.
const file = resolve(__dirname, "../../../components/deep-space/DeepSpaceViews.tsx");
const ast = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const capture = ast.statements.find(
  (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "CaptureView",
);
if (!capture?.body) throw new Error("CaptureView declaration is missing");
const save = capture.body.statements.find(
  (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "savePiece",
);
const skip = capture.body.statements
  .filter(ts.isVariableStatement)
  .flatMap((statement) => [...statement.declarationList.declarations])
  .find((node) => ts.isIdentifier(node.name) && node.name.text === "stopCoach");
if (!save?.body || !skip?.initializer) throw new Error("CaptureView save/skip handlers are missing");

const compile = (source: string) => ts.transpileModule(`(${source})`, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const saveCode = compile(save.getText(ast));
const skipCode = compile(skip.initializer.getText(ast));

type CoachStep = FirstRecordCoachStep | null;
type SaveResult = { followup?: { zone: "green" | "red" } };

function harness(
  initialStep: CoachStep,
  firstRecordCoach = true,
  extra: { photos?: { uri: string; base64: string }[]; mode?: string } = {},
) {
  const state = { coachStep: initialStep, saved: false, error: false, saving: false };
  const createRecord = jest.fn<Promise<SaveResult>, [unknown]>().mockResolvedValue({});
  // 2026-09-30: savePiece uploads 글 photos before the insert and clears them
  // after. The payload builder is the production one; the I/O is stubbed.
  const uploaded: RecordPhotoRef[] = (extra.photos ?? []).map((_, i) => ({
    path: `qa-user/photo-0000000000000${i}aa.jpg`,
    mime: "image/jpeg",
  }));
  const uploadRecordPhotos = jest.fn().mockResolvedValue(uploaded);
  const removeRecordPhotoObjects = jest.fn().mockResolvedValue(uploaded.length);
  const clearPhotos = jest.fn();
  const markCoachmarksSeen = jest.fn();
  const setCrisis = jest.fn();
  const announceForAccessibility = jest.fn();
  const setCoachStep = jest.fn((next: CoachStep | ((current: CoachStep) => CoachStep)) => {
    state.coachStep = typeof next === "function" ? next(state.coachStep) : next;
  });
  const scope = {
    firstRecordCoach,
    // React closures retain the render's initial value while functional state
    // updates read the latest value, including skip during an awaited save.
    coachStep: initialStep,
    setCoachStep,
    advanceFirstRecordCoach,
    markCoachmarksSeen,
    createRecord,
    userId: "qa-user",
    canSave: true,
    isMinor: false,
    locale: "ko",
    mode: extra.mode ?? "text",
    // 2026-09-30: the 메모/4W1H radio (textFormat) became the 4W1H toggle;
    // off is the plain memo this harness has always saved.
    fourwOn: false,
    text: "  A first saved note  ",
    setSaving: (value: boolean) => { state.saving = value; },
    setSaved: (value: boolean) => { state.saved = value; },
    setError: (value: boolean) => { state.error = value; },
    setCrisis,
    setFourw: jest.fn(),
    EMPTY_FOURW: {},
    setText: jest.fn(),
    setTodos: jest.fn(),
    photos: extra.photos ?? [],
    uploadRecordPhotos,
    recordPhotosPayload,
    removeRecordPhotoObjects,
    clearPhotos,
    cleanTodos: ["first to-do"],
    AccessibilityInfo: { announceForAccessibility },
    t: (key: string) => key,
    console: { warn: jest.fn() },
  };
  return {
    state, createRecord, markCoachmarksSeen, setCoachStep, setCrisis, announceForAccessibility,
    uploadRecordPhotos, removeRecordPhotoObjects, clearPhotos, uploaded,
    save: runInNewContext(saveCode, scope) as () => Promise<void>,
    skip: runInNewContext(skipCode, scope) as () => void,
  };
}

describe("first-record coach follows the real record save", () => {
  test.each<FirstRecordCoachStep>(["input", "save"])(
    "saving from %s completes the guide and records dismissal",
    async (step) => {
      const run = harness(step);
      await run.save();

      expect(run.createRecord).toHaveBeenCalledWith(expect.objectContaining({
        body: "A first saved note", kind: "note", tags: ["memo"],
      }));
      expect(run.state).toEqual({ coachStep: "done", saved: true, error: false, saving: false });
      expect(run.markCoachmarksSeen).toHaveBeenCalledTimes(1);
      expect(run.announceForAccessibility).toHaveBeenCalledWith("ds.capture.saved");
    },
  );

  test("a failed save leaves the guide available without marking it complete", async () => {
    const run = harness("input");
    run.createRecord.mockRejectedValueOnce(new Error("save unavailable"));
    await run.save();

    expect(run.state).toEqual({ coachStep: "input", saved: false, error: true, saving: false });
    expect(run.markCoachmarksSeen).not.toHaveBeenCalled();
    expect(run.setCoachStep).not.toHaveBeenCalled();
    expect(run.announceForAccessibility).toHaveBeenCalledWith("ds.capture.saveError");
  });

  test.each<FirstRecordCoachStep>(["input", "save"])(
    "skipping during a pending save from %s keeps the guide closed after success",
    async (step) => {
      const run = harness(step);
      let finishSave!: (result: SaveResult) => void;
      run.createRecord.mockReturnValueOnce(new Promise((resolveSave) => { finishSave = resolveSave; }));
      const saving = run.save();

      expect(run.state.saving).toBe(true);
      expect(run.state.saved).toBe(false);
      expect(run.markCoachmarksSeen).not.toHaveBeenCalled();
      run.skip();
      expect(run.state.coachStep).toBeNull();
      finishSave({});
      await saving;

      expect(run.state).toEqual({ coachStep: null, saved: true, error: false, saving: false });
    },
  );

  test("an ordinary save does not mark an unrelated guide complete", async () => {
    const run = harness(null, false);
    await run.save();

    expect(run.state).toEqual({ coachStep: null, saved: true, error: false, saving: false });
    expect(run.markCoachmarksSeen).not.toHaveBeenCalled();
    expect(run.setCoachStep).not.toHaveBeenCalled();
  });

  test.each<FirstRecordCoachStep>(["input", "save"])(
    "a red result from %s hides the guide while showing the safety message",
    async (step) => {
      const run = harness(step);
      run.createRecord.mockResolvedValueOnce({ followup: { zone: "red" } });
      await run.save();

      expect(run.setCrisis).toHaveBeenCalledWith({ visible: true, hotline: "KR_109" });
      expect(run.state).toEqual({ coachStep: null, saved: true, error: false, saving: false });
      expect(run.markCoachmarksSeen).toHaveBeenCalledTimes(1);
    },
  );
});

describe("글 photos ride on the real record save (2026-09-30)", () => {
  const picked = [
    { uri: "file:///cache/a.jpg", base64: "/9j/AAAA" },
    { uri: "file:///cache/b.jpg", base64: "/9j/BBBB" },
  ];

  test("photos are uploaded first and the record points at them", async () => {
    const run = harness(null, false, { photos: picked });
    await run.save();

    expect(run.uploadRecordPhotos).toHaveBeenCalledWith("qa-user", picked);
    expect(run.createRecord).toHaveBeenCalledWith(expect.objectContaining({
      tags: ["memo"],
      structured: { photos: run.uploaded },
    }));
    expect(run.clearPhotos).toHaveBeenCalledTimes(1);
    expect(run.removeRecordPhotoObjects).not.toHaveBeenCalled();
    expect(run.state.saved).toBe(true);
  });

  test("a failed insert removes the photos it had just uploaded", async () => {
    const run = harness(null, false, { photos: picked });
    run.createRecord.mockRejectedValueOnce(new Error("insert failed"));
    await run.save();

    expect(run.removeRecordPhotoObjects).toHaveBeenCalledWith(run.uploaded.map((photo) => photo.path));
    expect(run.clearPhotos).not.toHaveBeenCalled();
    expect(run.state).toEqual({ coachStep: null, saved: false, error: true, saving: false });
  });

  test("a failed upload never reaches the insert", async () => {
    const run = harness(null, false, { photos: picked });
    run.uploadRecordPhotos.mockRejectedValueOnce(new Error("storage down"));
    await run.save();

    expect(run.createRecord).not.toHaveBeenCalled();
    expect(run.state.error).toBe(true);
  });

  test("a note without photos saves with no structured payload and no Storage call", async () => {
    const run = harness(null, false);
    await run.save();

    expect(run.uploadRecordPhotos).not.toHaveBeenCalled();
    expect(run.createRecord.mock.calls[0]?.[0]).not.toHaveProperty("structured");
  });

  test("photos stay out of a to-do save", async () => {
    const run = harness(null, false, { photos: picked, mode: "todo" });
    await run.save();

    expect(run.uploadRecordPhotos).not.toHaveBeenCalled();
    expect(run.createRecord).toHaveBeenCalledWith(expect.objectContaining({ tags: ["todo"], body: "- first to-do" }));
    expect(run.createRecord.mock.calls[0]?.[0]).not.toHaveProperty("structured");
  });
});
