// Keeping a finished interview, or leaving it unsaved (A-Z first-use check Z64).
//
// The save screen has two buttons since Z64. "Don't save" is only true while nothing has been
// written and nothing is still being judged, so that state lives here, where it can be run in a
// test, and the screen only mirrors it.
//
//   1. A verdict still out. The user can end the conversation while the last answer is with the
//      model. If that verdict comes back red, the hotline must still be shown, and leaving
//      before it arrives would skip both it and the save-time check. So leaving waits.
//   2. A save that was tried. The record is written before the coverage. When the second step
//      fails the record already exists, and when the first one times out it may. From the first
//      attempt on the story can no longer be "not saved", and a retry must not write it twice.

export type ProbeAction = "crisis" | "drop" | "continue";

/**
 * What to do with a question request that came back.
 *
 * Red comes first: the conversation may have been ended while the request was in flight, and
 * an ended conversation drops the question, never the verdict.
 */
export function probeAction(zone: string, ended: boolean): ProbeAction {
  if (zone === "red") return "crisis";
  return ended ? "drop" : "continue";
}

export type KeepResult = "kept" | "crisis" | "failed";

export interface KeepSteps {
  /** Writes the record. Resolves true when the save-time safety pass came back red. */
  writeRecord: () => Promise<boolean>;
  /** Adds what this conversation dug to the coverage matrix. */
  addCoverage: () => Promise<void>;
}

export interface SaveFlow {
  /** A question request went out. Call the returned function once it has settled. */
  verdictPending: () => () => void;
  awaitingVerdict: () => boolean;
  /** True from the first save attempt on, whatever came of it. */
  saveTried: () => boolean;
  canLeaveUnsaved: () => boolean;
  keep: (steps: KeepSteps) => Promise<KeepResult>;
}

export function createSaveFlow(): SaveFlow {
  let pending = 0;
  let tried = false;
  let recordWritten = false;
  return {
    verdictPending() {
      pending += 1;
      let settled = false;
      return () => {
        if (settled) return;
        settled = true;
        pending -= 1;
      };
    },
    awaitingVerdict: () => pending > 0,
    saveTried: () => tried,
    canLeaveUnsaved: () => !tried && pending === 0,
    async keep(steps) {
      tried = true;
      try {
        if (!recordWritten) {
          // A red save shows the hotline and stops, as it did before this module: the next
          // attempt runs the same check again.
          if (await steps.writeRecord()) return "crisis";
          recordWritten = true;
        }
        await steps.addCoverage();
        return "kept";
      } catch {
        return "failed";
      }
    },
  };
}
