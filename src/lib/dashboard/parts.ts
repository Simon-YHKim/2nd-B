// Daily board part registry (PS-DASH-001 v2.1, redesign W0).
//
// One declaration per part: where it sits, what it reads, which threshold decides
// whether it shows, which empty states it has, and which W1 seat may read its
// data. Same pattern as src/lib/lenses/registry.ts: a declaration table that the
// tests keep honest. Layout, visibility and tone are pure functions of these
// declarations plus the part's current state; the screen does not decide, and no
// LLM picks or orders parts (DECISIONS 26.10.07 02:30 · Q-261007-36).
import type { DashboardThresholdId } from "../sufficiency/registry";
import type { Basis, BoardSeat, EmptyReason, LockCode, PayloadName, SourceId } from "./contract";

export const PART_IDS = [
  "P-01",
  "P-02",
  "P-03",
  "P-04",
  "P-06",
  "P-07",
  "P-08",
  "P-09",
  "M-01",
  "M-02",
  "M-03",
  "M-04",
  "M-05",
  "D-01",
  "S-01",
  "S-02",
  "S-03",
] as const;
export type PartId = (typeof PART_IDS)[number];

/** P-05 was merged into P-04 (one "to handle" queue, Q-261007-32). The number stays unused. */
export const RETIRED_PART_IDS = ["P-05"] as const;

export type Placement = "page1" | "page2" | "dock" | "screen" | "template";
/** row = 4x1 · card = 4x2 on the 4-column grid. */
export type PartSize = "row" | "card" | "dock" | "screen" | "template";

export interface PartDecl {
  readonly id: PartId;
  readonly placement: Placement;
  readonly size: PartSize;
  /** Stage that ships the part. W2 · W3 parts stay locked until researched and approved. */
  readonly stage: "W1" | "W2" | "W3";
  readonly sources: readonly SourceId[];
  /** Contract type the part renders (see contract.ts). */
  readonly payload: PayloadName;
  /** Display condition. null only for parts that are always present (dock, add-widget). */
  readonly threshold: DashboardThresholdId | null;
  readonly emptyReasons: readonly EmptyReason[];
  /** Bases a line in this part may carry; tone follows from basis. */
  readonly bases: readonly Basis[];
  /** W1 seats allowed to read this part's data (the "AI transfer" column). */
  readonly readBySeats: readonly BoardSeat[];
  /** W1 seat whose output this part shows, if any. */
  readonly producedBy: BoardSeat | null;
  /** Lock codes this part can show. The server enforces them; the part only names them. */
  readonly locks: readonly LockCode[];
}

const empty = (part: PartId, code: string, display: EmptyReason["display"]): EmptyReason => ({
  code,
  display,
  copyKey: `dashboard.${part}.empty.${code}`,
});

export const PARTS: readonly PartDecl[] = [
  {
    id: "P-01",
    placement: "page1",
    size: "row",
    stage: "W1",
    sources: ["weather", "air_quality"],
    payload: "WeatherRow",
    threshold: "dash.P-01",
    emptyReasons: [empty("P-01", "noPlace", "sentence"), empty("P-01", "weatherUnavailable", "sentence")],
    bases: ["fact"],
    readBySeats: ["daily_note", "day_summary"],
    producedBy: null,
    locks: [],
  },
  {
    id: "P-02",
    placement: "page1",
    size: "row",
    stage: "W1",
    sources: ["daily_note"],
    payload: "DailyNote",
    threshold: "dash.P-02",
    // No grounded note -> a fixed-pool sentence (basis rule), never a blank row.
    emptyReasons: [empty("P-02", "noGroundedNote", "sentence")],
    bases: ["ai", "rule"],
    readBySeats: [],
    producedBy: "daily_note",
    locks: ["consentOff"],
  },
  {
    id: "P-03",
    placement: "page1",
    size: "card",
    stage: "W1",
    // calendar_import arrives with S8c (W3); until then the part reads app data only.
    sources: ["app_reminders", "ops_routines", "ops_routine_logs", "dday", "calendar_import"],
    payload: "ReminderItem",
    threshold: "dash.P-03",
    emptyReasons: [empty("P-03", "nothingScheduled", "sentence")],
    bases: ["fact", "rule", "ai"],
    // RD-261007-09: reminders and routine completion may feed daily_note and day_summary.
    readBySeats: ["daily_note", "day_summary"],
    producedBy: null,
    locks: [],
  },
  {
    id: "P-04",
    placement: "page1",
    size: "row",
    stage: "W1",
    // W1 = in-app sources only. Notification (W2) and mail (W3) candidates are
    // locked for minors on the server.
    sources: ["inbox_queue", "app_reminders", "device_notifications", "device_mail"],
    payload: "InboxCard",
    threshold: "dash.P-04",
    emptyReasons: [empty("P-04", "queueEmpty", "sentence")],
    // Without the LLM consent the queue keeps the rule order and shows the original
    // title in grey (fact) instead of an AI action line.
    bases: ["ai", "fact", "rule"],
    readBySeats: ["inbox_triage"],
    producedBy: "inbox_triage",
    locks: ["minorServerLock", "integrationOff"],
  },
  {
    id: "P-09",
    placement: "page1",
    size: "row",
    stage: "W1",
    sources: ["custom_widgets", "widget_usage"],
    payload: "CustomWidget",
    threshold: "dash.P-09",
    emptyReasons: [empty("P-09", "noCustomWidget", "sentence")],
    bases: ["fact", "rule"],
    readBySeats: [],
    producedBy: null,
    locks: [],
  },
  {
    id: "P-06",
    placement: "page2",
    size: "card",
    stage: "W1",
    sources: ["health_samples", "diet"],
    payload: "HealthRow",
    threshold: "dash.P-06",
    emptyReasons: [
      empty("P-06", "notConnected", "locked"),
      empty("P-06", "consentOff", "locked"),
      empty("P-06", "notAdult", "hide"),
      empty("P-06", "tooFewDays", "hide"),
    ],
    bases: ["fact", "locked"],
    readBySeats: [], // flow 2: never to an LLM (Q14 · RD-261007-09)
    producedBy: null,
    locks: ["integrationOff", "consentOff", "notAdult"],
  },
  {
    id: "P-07",
    placement: "page2",
    size: "row",
    stage: "W1",
    sources: ["ops_ledger"],
    payload: "LedgerSummary",
    threshold: "dash.P-07",
    emptyReasons: [empty("P-07", "noEntriesThisMonth", "sentence")],
    bases: ["fact"],
    readBySeats: [], // flow 2
    producedBy: null,
    locks: [],
  },
  {
    id: "P-08",
    placement: "page2",
    size: "card",
    stage: "W1",
    sources: ["records", "fx_rates", "public_holidays", "now_playing"],
    payload: "ChangeLine",
    threshold: "dash.P-08",
    emptyReasons: [empty("P-08", "nothingChanged", "hide")],
    bases: ["fact", "rule"],
    readBySeats: [],
    producedBy: null,
    locks: [],
  },
  // Custom widget templates (Q-261007-36): rule-proposed, user-approved, no AI seat.
  {
    id: "M-01",
    placement: "template",
    size: "template",
    stage: "W3", // after E entity pages
    sources: ["records", "calendar_import"],
    payload: "CustomWidget",
    threshold: "dash.M-01",
    emptyReasons: [empty("M-01", "belowThreshold", "hide"), empty("M-01", "templateStopped", "hide")],
    bases: ["fact", "rule"],
    readBySeats: [],
    producedBy: null,
    locks: ["stageLocked"],
  },
  {
    id: "M-02",
    placement: "template",
    size: "template",
    stage: "W1",
    sources: ["ops_routines", "ops_routine_logs"],
    payload: "CustomWidget",
    threshold: "dash.M-02",
    emptyReasons: [empty("M-02", "belowThreshold", "hide"), empty("M-02", "templateStopped", "hide")],
    bases: ["fact", "rule"],
    readBySeats: [],
    producedBy: null,
    locks: [],
  },
  {
    id: "M-03",
    placement: "template",
    size: "template",
    stage: "W3", // needs the numeric-goal store first
    sources: ["records"],
    payload: "CustomWidget",
    threshold: "dash.M-03",
    emptyReasons: [empty("M-03", "belowThreshold", "hide"), empty("M-03", "templateStopped", "hide")],
    bases: ["fact", "rule"],
    readBySeats: [],
    producedBy: null,
    locks: ["stageLocked"],
  },
  {
    id: "M-04",
    placement: "template",
    size: "template",
    stage: "W1",
    sources: ["ops_ledger"],
    payload: "CustomWidget",
    threshold: "dash.M-04",
    emptyReasons: [empty("M-04", "belowThreshold", "hide"), empty("M-04", "templateStopped", "hide")],
    bases: ["fact", "rule"],
    readBySeats: [], // flow 2
    producedBy: null,
    locks: [],
  },
  {
    id: "M-05",
    placement: "template",
    size: "template",
    stage: "W1",
    sources: ["records"],
    payload: "CustomWidget",
    threshold: "dash.M-05",
    emptyReasons: [empty("M-05", "belowThreshold", "hide"), empty("M-05", "templateStopped", "hide")],
    bases: ["fact", "rule"],
    readBySeats: [],
    producedBy: null,
    locks: [],
  },
  {
    id: "D-01",
    placement: "dock",
    size: "dock",
    stage: "W1",
    sources: [],
    payload: "none",
    threshold: null,
    // The transcription slot of the dock stays locked until W2 is approved.
    emptyReasons: [empty("D-01", "transcriptionLocked", "locked")],
    bases: ["fact", "locked"],
    readBySeats: [],
    producedBy: null,
    locks: ["stageLocked"],
  },
  {
    id: "S-01",
    placement: "screen",
    size: "screen",
    stage: "W1",
    sources: ["day_summary"],
    payload: "DaySummary",
    threshold: "dash.S-01",
    emptyReasons: [empty("S-01", "noGroundedSummary", "sentence")],
    bases: ["ai", "fact", "rule"],
    readBySeats: [],
    producedBy: "day_summary",
    locks: ["consentOff"],
  },
  {
    id: "S-02",
    placement: "screen",
    size: "screen",
    stage: "W2",
    sources: [],
    payload: "none",
    threshold: null,
    emptyReasons: [empty("S-02", "stageLocked", "locked")],
    bases: ["ai", "fact", "locked"],
    readBySeats: [],
    producedBy: null,
    locks: ["stageLocked", "minorServerLock", "notAdult"],
  },
  {
    id: "S-03",
    placement: "screen",
    size: "screen",
    stage: "W1",
    sources: ["custom_widgets"],
    payload: "none",
    threshold: null,
    emptyReasons: [],
    bases: ["rule", "locked"],
    readBySeats: [],
    producedBy: null,
    locks: [],
  },
];

export function partById(id: PartId): PartDecl {
  const part = PARTS.find((p) => p.id === id);
  if (!part) throw new Error(`unknown part: ${id}`);
  return part;
}

// ── layout ─────────────────────────────────────────────────────────────────────

/** Fixed order. Page 2 ends with the approved custom widgets and then the always-present add slot. */
export const PAGE1_ORDER: readonly PartId[] = ["P-01", "P-02", "P-03", "P-04", "P-09"];
export const PAGE2_ORDER: readonly PartId[] = ["P-06", "P-07", "P-08"];
export const DOCK: PartId = "D-01";
export const ADD_WIDGET_SLOT = "add-widget" as const;

/** What the screen knows about a part right now. Computed by the W1 readers, never by the screen. */
export interface PartState {
  readonly id: PartId;
  /** Empty-reason code from the part's declaration, or null when the part has data. */
  readonly empty: string | null;
}

export type SlotView =
  | { readonly id: PartId; readonly mode: "data" | "sentence" | "locked"; readonly copyKey: string | null }
  | { readonly id: typeof ADD_WIDGET_SLOT; readonly mode: "add" };

function viewFor(id: PartId, states: ReadonlyMap<PartId, PartState>): SlotView | null {
  const part = partById(id);
  const state = states.get(id);
  if (!state || state.empty === null) return { id, mode: "data", copyKey: null };
  const reason = part.emptyReasons.find((r) => r.code === state.empty);
  if (!reason) throw new Error(`${id} has no empty reason ${state.empty}`);
  if (reason.display === "hide") return null;
  return { id, mode: reason.display, copyKey: reason.copyKey };
}

/**
 * Page layout from declarations and states only. A part whose state says "hide"
 * leaves no gap; page 2 always ends with the add-widget slot.
 */
export function boardLayout(
  states: readonly PartState[],
  approvedCustomWidgets: readonly PartId[] = [],
): { page1: SlotView[]; page2: SlotView[] } {
  const byId = new Map(states.map((s) => [s.id, s] as const));
  const page1 = PAGE1_ORDER.map((id) => viewFor(id, byId)).filter((v): v is SlotView => v !== null);
  const custom = approvedCustomWidgets.filter((id) => partById(id).placement === "template");
  const page2 = [...PAGE2_ORDER, ...custom]
    .map((id) => viewFor(id, byId))
    .filter((v): v is SlotView => v !== null);
  page2.push({ id: ADD_WIDGET_SLOT, mode: "add" });
  return { page1, page2 };
}
