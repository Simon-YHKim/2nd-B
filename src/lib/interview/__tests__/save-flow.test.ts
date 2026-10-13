import { readFileSync } from "fs";
import { join } from "path";

import { createSaveFlow, probeAction } from "../save-flow";

const ok = (): Promise<void> => Promise.resolve();
const fail = (): Promise<void> => Promise.reject(new Error("network"));

describe("a verdict that comes back after the conversation was ended", () => {
  test("red is acted on even then", () => {
    expect(probeAction("red", true)).toBe("crisis");
    expect(probeAction("red", false)).toBe("crisis");
  });

  test("anything else is dropped once the conversation ended", () => {
    expect(probeAction("green", true)).toBe("drop");
    expect(probeAction("yellow", true)).toBe("drop");
  });

  test("a live conversation goes on", () => {
    expect(probeAction("green", false)).toBe("continue");
    expect(probeAction("yellow", false)).toBe("continue");
  });
});

describe("leaving without saving waits for a verdict that is still out", () => {
  test("nothing out, nothing tried: leaving is open", () => {
    expect(createSaveFlow().canLeaveUnsaved()).toBe(true);
  });

  test("closed while a request is out, open again when it settles", () => {
    const flow = createSaveFlow();
    const settled = flow.verdictPending();
    expect(flow.awaitingVerdict()).toBe(true);
    expect(flow.canLeaveUnsaved()).toBe(false);
    settled();
    expect(flow.awaitingVerdict()).toBe(false);
    expect(flow.canLeaveUnsaved()).toBe(true);
  });

  test("two requests out: both must settle, and settling one twice counts once", () => {
    const flow = createSaveFlow();
    const first = flow.verdictPending();
    const second = flow.verdictPending();
    first();
    first();
    expect(flow.canLeaveUnsaved()).toBe(false);
    second();
    expect(flow.canLeaveUnsaved()).toBe(true);
  });

  test("the late red case end to end: the user ended, the verdict arrives red", async () => {
    const flow = createSaveFlow();
    let arrive: (zone: string) => void = () => undefined;
    const verdict = new Promise<string>((resolve) => { arrive = resolve; });
    const settled = flow.verdictPending();
    // The user ends the conversation here and the save screen opens.
    const ended = true;
    expect(flow.canLeaveUnsaved()).toBe(false);
    arrive("red");
    const action = probeAction(await verdict, ended);
    settled();
    expect(action).toBe("crisis");
  });
});

describe("keeping the story", () => {
  test("record, then coverage", async () => {
    const flow = createSaveFlow();
    const order: string[] = [];
    const result = await flow.keep({
      writeRecord: async () => { order.push("record"); return false; },
      addCoverage: async () => { order.push("coverage"); },
    });
    expect(result).toBe("kept");
    expect(order).toEqual(["record", "coverage"]);
  });

  test("once a save was tried, leaving unsaved is closed for good", async () => {
    const flow = createSaveFlow();
    expect(flow.saveTried()).toBe(false);
    await flow.keep({ writeRecord: async () => false, addCoverage: ok });
    expect(flow.saveTried()).toBe(true);
    expect(flow.canLeaveUnsaved()).toBe(false);
  });

  test("the coverage step fails: the record exists, so leaving is closed and a retry does not write it again", async () => {
    const flow = createSaveFlow();
    const writeRecord = jest.fn(async () => false);
    expect(await flow.keep({ writeRecord, addCoverage: fail })).toBe("failed");
    expect(flow.canLeaveUnsaved()).toBe(false);

    const addCoverage = jest.fn(ok);
    expect(await flow.keep({ writeRecord, addCoverage })).toBe("kept");
    expect(writeRecord).toHaveBeenCalledTimes(1);
    expect(addCoverage).toHaveBeenCalledTimes(1);
  });

  test("the record step fails: it may still have landed, so leaving stays closed; a retry writes", async () => {
    const flow = createSaveFlow();
    const addCoverage = jest.fn(ok);
    expect(await flow.keep({ writeRecord: () => Promise.reject(new Error("timeout")), addCoverage })).toBe("failed");
    expect(addCoverage).not.toHaveBeenCalled();
    expect(flow.canLeaveUnsaved()).toBe(false);

    const writeRecord = jest.fn(async () => false);
    expect(await flow.keep({ writeRecord, addCoverage })).toBe("kept");
    expect(writeRecord).toHaveBeenCalledTimes(1);
  });

  test("a red save stops before the coverage, and the next attempt is checked again", async () => {
    const flow = createSaveFlow();
    const addCoverage = jest.fn(ok);
    const writeRecord = jest.fn(async () => true);
    expect(await flow.keep({ writeRecord, addCoverage })).toBe("crisis");
    expect(addCoverage).not.toHaveBeenCalled();
    expect(flow.canLeaveUnsaved()).toBe(false);

    expect(await flow.keep({ writeRecord, addCoverage })).toBe("crisis");
    expect(writeRecord).toHaveBeenCalledTimes(2);
  });
});

// The screen is not rendered here (render tests are blocked in this repo). What is checked from
// the source is only that the screen hands these decisions to the module above.
const SCREEN = readFileSync(join(__dirname, "..", "..", "..", "app", "interview.tsx"), "utf8").replace(/\r\n/g, "\n");

function between(start: string, end: string): string {
  const from = SCREEN.indexOf(start);
  expect(from).toBeGreaterThan(-1);
  const to = SCREEN.indexOf(end, from);
  expect(to).toBeGreaterThan(from);
  return SCREEN.slice(from, to);
}

describe("the screen uses it", () => {
  test("a question request is counted before it goes out and settled whatever happens", () => {
    const ask = between("const ask = useCallback(", "\n  );\n");
    const begin = ask.indexOf("const verdictIn = saveFlow.current.verdictPending();");
    const tryAt = ask.indexOf("try {");
    expect(begin).toBeGreaterThan(-1);
    expect(begin).toBeLessThan(tryAt);
    const last = ask.slice(ask.lastIndexOf("} finally {"));
    expect(last).toContain("verdictIn();");
    expect(last).toContain("setVerdictWait(saveFlow.current.awaitingVerdict());");
  });

  test("the verdict is read before the conversation's end is", () => {
    const ask = between("const ask = useCallback(", "\n  );\n");
    const after = ask.slice(ask.indexOf("await nextProbe("));
    expect(after).toContain("const after = probeAction(probe.zone, ended.current);");
    const crisis = after.indexOf('if (after === "crisis")');
    const drop = after.indexOf('if (after === "drop") return;');
    expect(crisis).toBeGreaterThan(-1);
    expect(drop).toBeGreaterThan(crisis);
    // The old order: the end of the conversation was checked first and the verdict was lost.
    expect(after.slice(0, crisis)).not.toContain("if (ended.current) return;");
  });

  test("saving goes through the flow, record first", () => {
    const keep = between("async function keepIt()", "\n  }\n");
    expect(keep).toContain("setSaveTried(true);");
    expect(keep).toContain("await saveFlow.current.keep({");
    const record = keep.indexOf("writeRecord: async () => {");
    const coverage = keep.indexOf("addCoverage: () => {");
    expect(record).toBeGreaterThan(-1);
    expect(coverage).toBeGreaterThan(record);
    expect(keep.slice(record, coverage)).toContain("await createRecord({");
    expect(keep.slice(coverage)).toContain("return addCoverage(userId, delta);");
    // Nothing writes outside the two steps.
    expect(keep.split("createRecord(").length - 1).toBe(1);
    expect(keep.split("addCoverage(userId").length - 1).toBe(1);
  });

  test("leaving unsaved asks the flow, and the button is gone once a save was tried", () => {
    const leave = between("function leaveUnsaved()", "\n  }\n");
    expect(leave).toContain("if (saving || !saveFlow.current.canLeaveUnsaved()) return;");
    const done = /\{done \?[\s\S]*?\) : \(/.exec(SCREEN)?.[0] ?? "";
    expect(done).toMatch(/\{saveTried \? null : \(\s*<MdButton\s+label=\{t\("drill\.discard"\)\}/);
    expect(done).toContain("disabled={saving || verdictWait || crisis.visible}");
  });
});
