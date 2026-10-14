export const FIRST_RECORD_COACH_PARAM = "first-record";
/** A replay asked for in settings. It ends in front of Save and writes nothing (Z72). */
export const FIRST_RECORD_REPLAY_PARAM = "first-record-replay";

export type FirstRecordCoachMode = "first" | "replay";

/** Which guide the capture route was opened with. Anything else is no guide. */
export function firstRecordCoachMode(param: unknown): FirstRecordCoachMode | null {
  if (param === FIRST_RECORD_COACH_PARAM) return "first";
  if (param === FIRST_RECORD_REPLAY_PARAM) return "replay";
  return null;
}

export type FirstRecordCoachStep = "format" | "input" | "save" | "done";

export type FirstRecordCoachEvent =
  | "memo-selected"
  | "input-confirmed"
  | "save-succeeded";

/**
 * The first-record guide advances only after the user performs the real task.
 * This keeps the coachmark from becoming another four-screen feature tour.
 */
export function advanceFirstRecordCoach(
  step: FirstRecordCoachStep,
  event: FirstRecordCoachEvent,
): FirstRecordCoachStep {
  // Saving a real record completes the task even if a guide button was skipped.
  if (event === "save-succeeded") return "done";
  if (step === "format" && event === "memo-selected") return "input";
  if (step === "input" && event === "input-confirmed") return "save";
  return step;
}
