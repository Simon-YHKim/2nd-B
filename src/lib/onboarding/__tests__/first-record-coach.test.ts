import {
  FIRST_RECORD_COACH_PARAM,
  advanceFirstRecordCoach,
  type FirstRecordCoachStep,
} from "../first-record-coach";

describe("first-record coach state", () => {
  test("uses a stable route marker", () => {
    expect(FIRST_RECORD_COACH_PARAM).toBe("first-record");
  });

  test.each<FirstRecordCoachStep>(["format", "input", "save", "done"])(
    "a successful record save completes the guide from %s",
    (step) => {
      // The real save control remains usable before the guide's input-confirmed button.
      expect(advanceFirstRecordCoach(step, "save-succeeded")).toBe("done");
    },
  );

  test("advances only after the matching real action", () => {
    let step: FirstRecordCoachStep = "format";

    expect(advanceFirstRecordCoach(step, "input-confirmed")).toBe("format");
    step = advanceFirstRecordCoach(step, "memo-selected");
    expect(step).toBe("input");
    step = advanceFirstRecordCoach(step, "input-confirmed");
    expect(step).toBe("save");
    step = advanceFirstRecordCoach(step, "save-succeeded");
    expect(step).toBe("done");
    expect(advanceFirstRecordCoach(step, "memo-selected")).toBe("done");
  });
});
