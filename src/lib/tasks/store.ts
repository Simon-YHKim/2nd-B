// Global task-status store for the loading/transition system
// (Claude Design loading.dc.html). Pure React via useSyncExternalStore — no new
// dependency, no provider needed. A long task runs in the background while the
// user keeps using the app; a short task blocks briefly. Completion never
// auto-navigates — the user taps "결과 보기".
//
//   startTask({ title, tip, mode, etaSec, resultHref, run })  // -> the task's id (0 = not started)
//   sendToBackground()   // C: "백그라운드에서 계속" — frees the screen
//   completeTask()       // run() resolves -> done -> CompletionToast
//   openResult()/dismiss()
//
// Tokens/copy live in the components; this file is state only.

import { useSyncExternalStore } from "react";

export type TaskMode = "blocking" | "background";
export type TaskPhase = "idle" | "running" | "done";

export interface TaskSnapshot {
  phase: TaskPhase;
  mode: TaskMode;
  title: string;
  tip?: string;
  etaSec?: number;
  /** Route to push when the user taps "결과 보기" on the completion toast. */
  resultHref?: string;
}

const IDLE: TaskSnapshot = { phase: "idle", mode: "background", title: "" };

let state: TaskSnapshot = IDLE;
// The dock holds one task and the snapshot does not say whose it is. Each started
// task gets a number, and the number of the task the dock holds now is kept here,
// so a task that was dismissed (and replaced by a newer one) cannot finish or
// clear the newer one.
let taskSeq = 0;
let currentTaskId = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function set(next: Partial<TaskSnapshot>) {
  state = { ...state, ...next };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function getSnapshot(): TaskSnapshot {
  return state;
}

export interface StartTaskOptions {
  title: string;
  tip?: string;
  mode?: TaskMode;
  etaSec?: number;
  resultHref?: string;
  /** The actual async work. Resolving flips the task to "done". */
  run: () => Promise<void>;
}

/**
 * Begin a task. Short work uses mode "blocking" (a full-screen loader the
 * screen renders); long work uses "background" (the global dock). When run()
 * settles, the task moves to "done" and the CompletionToast appears. Errors are
 * swallowed into "done" so the UI never gets stuck — surface failures in run().
 * Returns the task's id, or 0 when nothing was started (a task is already
 * running): in that case run() is never called.
 */
export function startTask(opts: StartTaskOptions): number {
  // One global task at a time: ignore a new start while one is running, so a
  // second tap can't overwrite the dock/toast and complete for the wrong task.
  if (state.phase === "running") return 0;
  const id = ++taskSeq;
  currentTaskId = id;
  set({
    phase: "running",
    mode: opts.mode ?? "background",
    title: opts.title,
    tip: opts.tip,
    etaSec: opts.etaSec,
    resultHref: opts.resultHref,
  });
  void Promise.resolve()
    .then(opts.run)
    .catch(() => {
      /* best-effort: still resolve to done so the user is never trapped */
    })
    .finally(() => {
      // Only complete if this task is still the dock's task. "running" alone is
      // not enough: this one may have been dismissed and a newer one started.
      if (currentTaskId === id && state.phase === "running") set({ phase: "done" });
    });
  return id;
}

/** C: move the current blocking task to the background so the screen is freed. */
export function sendToBackground(): void {
  if (state.phase === "running") set({ mode: "background" });
}

/** Force-complete (rarely needed; run() normally drives this). */
export function completeTask(): void {
  set({ phase: "done" });
}

/** Clear the task (after the toast is acted on or dismissed). */
export function dismissTask(): void {
  currentTaskId = 0;
  state = IDLE;
  emit();
}

/** Clear the dock only if it still holds this task. True when it did. */
export function dismissTaskById(id: number): boolean {
  if (id === 0 || currentTaskId !== id) return false;
  dismissTask();
  return true;
}

/** Clear a finished task's toast. A running task is left alone. True when cleared. */
export function dismissFinishedTask(): boolean {
  if (state.phase === "running") return false;
  dismissTask();
  return true;
}

/** Subscribe to the live task snapshot. */
export function useTaskStatus(): TaskSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
