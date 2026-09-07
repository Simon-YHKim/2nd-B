// ⚠ NOT WIRED YET, and that is deliberate - "dormant is a decision".
//
// This module was written but never committed to any ref; it lived only in a
// shared worktree, where it would have been lost. It lands here on its own so
// the work is not lost twice, ahead of the screen wiring that will use it.
// Landing it and its tests separately keeps the diff readable and lets the
// wiring be reviewed against main's current pixel-clay account screen rather
// than against the worktree's pre-migration copy of it.
//
// Do not delete it for having no callers. Its caller is the next change.
//
// The state machine for one export attempt (idle -> preparing -> ready ->
// delivering), so no screen has to re-derive which phase it is in.
import { buildExportFilename, summarizeAccountExport, type AccountExport, type AccountExportSummary } from "./export";

export interface ExportSessionIO {
  request: (owner: string) => Promise<AccountExport>;
  deliver: (json: string, filename: string, isCurrent: () => boolean) => Promise<"download-started" | "share-sheet-closed" | "cancelled">;
  isCurrent: () => boolean;
}

export interface ExportSessionState {
  phase: "idle" | "preparing" | "ready" | "delivering" | "failed";
  summary: AccountExportSummary | null;
  note: "download-started" | "share-sheet-closed" | "cancelled" | "delivery-failed" | null;
}

export interface AccountExportSession {
  prepare: () => Promise<void>;
  deliver: () => Promise<void>;
  cancel: () => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ExportSessionState;
}

export function createAccountExportSession(owner: string | null, io: ExportSessionIO): AccountExportSession {
  let generation = 0;
  let busy = false;
  let prepared: { json: string; filename: string } | null = null;
  let state: ExportSessionState = { phase: "idle", summary: null, note: null };
  const listeners = new Set<() => void>();
  const publish = (next: ExportSessionState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const current = (ticket: number) => ticket === generation && io.isCurrent();
  return {
    getSnapshot: () => state,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    cancel: () => {
      generation += 1;
      busy = false;
      prepared = null;
      publish({ phase: "idle", summary: null, note: null });
    },
    prepare: async () => {
      if (!owner || busy || !io.isCurrent()) return;
      busy = true;
      const ticket = ++generation;
      prepared = null;
      publish({ phase: "preparing", summary: null, note: null });
      try {
        const bundle = await io.request(owner);
        if (!current(ticket)) return;
        // Keep only one compact serialisation in memory. Never cache account
        // contents in AsyncStorage; delivery retries do not refetch/rate-limit.
        prepared = { json: JSON.stringify(bundle), filename: buildExportFilename(bundle.exported_at) };
        publish({ phase: "ready", summary: summarizeAccountExport(bundle), note: null });
      } catch {
        if (current(ticket)) publish({ phase: "failed", summary: null, note: null });
      } finally {
        if (ticket === generation) busy = false;
      }
    },
    deliver: async () => {
      if (!prepared || busy || !io.isCurrent()) return;
      busy = true;
      const ticket = generation;
      const file = prepared;
      publish({ ...state, phase: "delivering", note: null });
      try {
        const note = await io.deliver(file.json, file.filename, () => current(ticket));
        if (current(ticket)) publish({ ...state, phase: "ready", note });
      } catch {
        if (current(ticket)) publish({ ...state, phase: "ready", note: "delivery-failed" });
      } finally {
        if (ticket === generation) busy = false;
      }
    },
  };
}
