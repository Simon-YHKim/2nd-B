import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import { advanceFirstRecordCoach, type FirstRecordCoachStep } from "../first-record-coach";

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

function harness(initialStep: CoachStep, firstRecordCoach = true) {
  const state = { coachStep: initialStep, saved: false, error: false, saving: false };
  const createRecord = jest.fn<Promise<SaveResult>, [unknown]>().mockResolvedValue({});
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
    mode: "text",
    textFormat: "memo",
    text: "  A first saved note  ",
    setSaving: (value: boolean) => { state.saving = value; },
    setSaved: (value: boolean) => { state.saved = value; },
    setError: (value: boolean) => { state.error = value; },
    setCrisis,
    setFourw: jest.fn(),
    EMPTY_FOURW: {},
    setText: jest.fn(),
    setTodos: jest.fn(),
    AccessibilityInfo: { announceForAccessibility },
    t: (key: string) => key,
    console: { warn: jest.fn() },
  };
  return {
    state, createRecord, markCoachmarksSeen, setCoachStep, setCrisis, announceForAccessibility,
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
