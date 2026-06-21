// Global task-status store for the loading/transition system
// (Claude Design loading.dc.html). Pure React via useSyncExternalStore — no new
// dependency, no provider needed. A long task runs in the background while the
// user keeps using the app; a short task blocks briefly. Completion never
// auto-navigates — the user taps "결과 보기".
//
//   startTask({ title, tip, mode, etaSec, resultHref, run })
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
 */
export function startTask(opts: StartTaskOptions): void {
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
      // Only complete if this task is still the running one.
      if (state.phase === "running") set({ phase: "done" });
    });
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
  state = IDLE;
  emit();
}

/** Subscribe to the live task snapshot. */
export function useTaskStatus(): TaskSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
