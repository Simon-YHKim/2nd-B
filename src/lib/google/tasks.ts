// Google Tasks IN-bound connector (import hub, G2 follow-up). Same shape as the
// Calendar connector: a GIS access token (tasks.readonly) -> fetch the default
// task list -> map active to-dos to import proposals (할 일 -> 기록) reviewed via
// propose->ratify. Read-only, on-device, no LLM (no C1/C3/C9), $0, no new dep.
//
// Tasks don't fit the .ics calendar pipeline, so this builds the ImportOutcome
// directly (type-only dependency on the import types — no runtime coupling). The
// pure functions are unit-tested.

import { GOOGLE_TASKS_READONLY_SCOPE } from "./gisToken";
import type { ImportOutcome, ImportProposal } from "../import/proposals";

export { GOOGLE_TASKS_READONLY_SCOPE };

const TASKS_ENDPOINT = "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks";
const MAX_TASKS = 250;

export interface GoogleTask {
  title: string;
}

/** Defensive parse of the Tasks API response (`{ items: [...] }`) → active tasks. */
export function parseGoogleTasks(json: unknown): GoogleTask[] {
  const items =
    json && typeof json === "object" && Array.isArray((json as { items?: unknown }).items)
      ? (json as { items: unknown[] }).items
      : Array.isArray(json)
        ? (json as unknown[])
        : [];
  const out: GoogleTask[] = [];
  for (const item of items) {
    if (out.length >= MAX_TASKS) break;
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (row.status === "completed") continue; // active to-dos only
    const title = typeof row.title === "string" ? row.title.trim() : "";
    if (!title) continue; // Tasks returns empty-title placeholder rows
    out.push({ title });
  }
  return out;
}

/** Map tasks → an ImportOutcome (proposals + summary) for the review step. */
export function googleTasksToOutcome(tasks: ReadonlyArray<GoogleTask>): ImportOutcome {
  const proposals: ImportProposal[] = tasks.map((task, i) => ({
    id: `gtask-${i}`,
    label: task.title,
    sub: "할 일 → 기록",
    sensitive: false,
  }));
  // To-dos aren't appointments/places/health; count them in `events` (the same
  // slot calendar events use), so the review summary stays consistent.
  return { proposals, summary: { appointments: 0, places: 0, events: proposals.length, health: 0, notes: 0, watches: 0, transactions: 0, raw: 0 } };
}

export type TasksFetchError = "no_token" | "fetch_failed" | "bad_response";

/** Fetch active to-dos from the default task list with a GIS access token. */
export async function fetchTasks(accessToken: string, opts: { signal?: AbortSignal } = {}): Promise<GoogleTask[]> {
  if (!accessToken) throw "no_token" as TasksFetchError;
  const url = `${TASKS_ENDPOINT}?showCompleted=false&maxResults=100`;
  let res: Response;
  try {
    res = await fetch(url, {
      signal: opts.signal,
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
  } catch {
    throw "fetch_failed" as TasksFetchError;
  }
  if (!res.ok) throw "fetch_failed" as TasksFetchError;
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw "bad_response" as TasksFetchError;
  }
  return parseGoogleTasks(json);
}
