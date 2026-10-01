export const FIRST_RECORD_COACH_PARAM = "first-record";

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
