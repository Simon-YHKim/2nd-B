import { readFileSync } from "fs";
import { resolve } from "path";

const root = resolve(__dirname, "../../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("first-record coach wiring", () => {
  test("home points at the live SecondB head and opens the coached capture route", () => {
    const shell = read("src/components/deep-space/DeepSpaceShell.tsx");
    const home = read("src/components/deep-space/ConstellationHome.tsx");

    expect(shell).toContain("coachHeadTargetRef={coachHeadTargetRef}");
    expect(shell).toContain('params: { coach: FIRST_RECORD_COACH_PARAM }');
    expect(home).toContain("ref={coachHeadTargetRef}");
    expect(home).toContain("if (coachFirstRecord)");
    expect(home).toContain("onCoachHeadPress?.()");
  });

  test("the spotlight leaves a real transparent hole over the target", () => {
    const overlay = read("src/components/deep-space/FirstRecordCoachmark.tsx");

    expect(overlay).toContain('pointerEvents="box-none"');
    expect(overlay).toContain("<DitherPanel");
    expect(overlay).toContain("styles.targetFrame");
    expect(overlay).not.toContain("backgroundColor: cmAlpha");
  });

  test("capture coaches memo, input, and the real save result in order", () => {
    const route = read("src/app/capture.tsx");
    const capture = read("src/components/deep-space/DeepSpaceViews.tsx");

    expect(route).toContain("<CaptureView firstRecordCoach={firstRecordCoach} />");
    expect(capture).toContain('advanceFirstRecordCoach(current, "memo-selected")');
    expect(capture).toContain('advanceFirstRecordCoach(current, "input-confirmed")');
    expect(capture).toContain('advanceFirstRecordCoach(current, "save-succeeded")');
    expect(capture.indexOf("await createRecord")).toBeLessThan(
      capture.indexOf('advanceFirstRecordCoach(current, "save-succeeded")'),
    );
    expect(capture).toContain("markCoachmarksSeen()");
  });

  test("save completion immediately closes a home overlay kept alive by the router", () => {
    const gate = read("src/lib/onboarding/coachmarks-gate.ts");

    expect(gate).toContain("publishCoachmarksDue(false)");
    expect(gate).toContain("coachmarkListeners.add(listener)");
    expect(gate).toContain("coachmarkListeners.delete(listener)");
  });
});
