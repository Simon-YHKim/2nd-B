// What the short capture screen (CaptureView) was holding when the user left it
// (A-Z first-use check, Z79: writing vanished after a visit to another tab).
//
// Session memory only (nav/view-memory): never written to disk and dropped when
// the account changes. The full intake keeps its own stored drafts in ./draft.ts.
// Attached photos are not kept; the screen releases them when it unmounts.
import { captureAccountOwnerLease } from "../auth/account-epoch";
import { readViewMemory, writeViewMemory } from "../nav/view-memory";
import type { FourWFields } from "./fourw";

export interface CaptureViewDraft {
  mode: "text" | "link" | "todo";
  fourwOn: boolean;
  text: string;
  fourw: FourWFields;
  todos: string[];
}

const KEY = "capture-view-draft";

function hasTyped(draft: CaptureViewDraft): boolean {
  return [draft.text, ...Object.values(draft.fourw), ...draft.todos].some((value) => value.trim().length > 0);
}

/** The unsaved writing this owner left on the screen, if any. */
export function readCaptureViewDraft(ownerId: string | null): CaptureViewDraft | undefined {
  if (!ownerId || !captureAccountOwnerLease(ownerId)) return undefined;
  return readViewMemory<CaptureViewDraft | null>(KEY) ?? undefined;
}

/** Nothing typed means nothing kept, so an empty screen opens the way it always did. */
export function keepCaptureViewDraft(ownerId: string | null, draft: CaptureViewDraft): void {
  if (!ownerId || !captureAccountOwnerLease(ownerId)) return;
  writeViewMemory<CaptureViewDraft | null>(KEY, hasTyped(draft) ? draft : null);
}

/** A saved note is no longer a draft, even if the screen was left while it was saving. */
export function forgetCaptureViewDraft(ownerId: string | null): void {
  if (!ownerId || !captureAccountOwnerLease(ownerId)) return;
  writeViewMemory<CaptureViewDraft | null>(KEY, null);
}
