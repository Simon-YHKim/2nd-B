import type { ImportHistoryEntry } from "../import/history";
import type { OpsRoutine, OpsRoutineLog } from "../ops/routines";
import type { HealthSampleRow } from "../supabase/health";

export type ReadResult<T> = { ok: true; value: T } | { ok: false };
export interface DashboardRecord {
  id: string;
  kind: string;
  body: string | null;
  tags: string[] | null;
  created_at: string;
}
export interface DashboardData {
  ownerId: string;
  readAt: string;
  records: ReadResult<DashboardRecord[]>;
  interviews: ReadResult<DashboardRecord[]>;
  routines: ReadResult<OpsRoutine[]>;
  completions: ReadResult<OpsRoutineLog[]>;
  imports: ReadResult<ImportHistoryEntry[]>;
  health: ReadResult<HealthSampleRow[]>;
  healthEnabled: boolean;
  notifications: ReadResult<{ permission: string; scheduled: number }>;
}

export const LIFE_AREAS = ["career", "finance", "growth", "relation", "health", "recreation"] as const;
export type LifeArea = (typeof LIFE_AREAS)[number];

export function countAreaRecords(records: readonly DashboardRecord[], area: LifeArea): number {
  return records.filter((record) => record.tags?.includes(`domain:${area}`)).length;
}

/** The accepted routine remains the source, never an invented task from an interview. */
export function todayAgenda(routines: readonly OpsRoutine[], logs: readonly OpsRoutineLog[], now: Date) {
  const day = localDate(now);
  const completed = new Set(logs.filter((log) => log.completed_on === day).map((log) => log.routine_id));
  return routines
    .filter((routine) => routine.active && (routine.recurrence === "daily" ||
      (routine.recurrence === "weekly" && routine.weekday === now.getDay())))
    .map((routine) => ({ ...routine, completed: completed.has(routine.id) }))
    .sort((a, b) => Number(a.completed) - Number(b.completed) ||
      timeOrder(a.reminder_time) - timeOrder(b.reminder_time) || a.id.localeCompare(b.id));
}

function timeOrder(value: string | null): number {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) return Infinity;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

export function localDate(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function routineActionRoute(domainId: string): string {
  switch (domainId) {
    case "daily_focus": return "/focus";
    case "reading_list": return "/reading";
    case "language_practice": return "/srs";
    case "career_check":
    case "learning_goals": return "/milestones";
    case "money_check": return "/ledger";
    case "side_project": return "/side-project";
    case "simple_meals":
    case "weekly_meals": return "/meals";
    case "exercise_routine":
    case "exercise_ideas":
    case "health_routine": return "/star/health";
    default: return "/ops";
  }
}

export const DASHBOARD_SOURCES = [
  { id: "calendar", glyph: "event", mode: "import", keys: ["google", "calendar"], route: "/import-hub" },
  { id: "location", glyph: "hub", mode: "import", keys: ["takeout"], route: "/import-hub", adultOnly: true },
  { id: "health", glyph: "favorite", mode: "health", keys: ["health"], route: "/import" },
  { id: "garmin", glyph: "timer", mode: "health_bridge", keys: [], route: "/import", adultOnly: true },
  { id: "tasks", glyph: "check", mode: "import", keys: ["google-tasks"], route: "/import-hub" },
  { id: "kakao", glyph: "bubble", mode: "import", keys: ["kakao"], route: "/import-hub", adultOnly: true },
  { id: "sms", glyph: "bubble", mode: "import", keys: ["sms"], route: "/import-hub", adultOnly: true },
  { id: "instagram", glyph: "camera", mode: "manual", keys: [], route: "/capture" },
  { id: "facebook", glyph: "person", mode: "manual", keys: [], route: "/capture" },
  { id: "x", glyph: "description", mode: "manual", keys: [], route: "/capture" },
  { id: "nike", glyph: "timer", mode: "manual", keys: [], route: "/capture" },
  { id: "line", glyph: "bubble", mode: "manual", keys: [], route: "/capture" },
  { id: "whatsapp", glyph: "bubble", mode: "manual", keys: [], route: "/capture" },
] as const;
export type DashboardSource = (typeof DASHBOARD_SOURCES)[number];
export type SourceStatus = "manual" | "healthBridge" | "empty" | "imported" | "off" | "unknown" | "restricted";

/** Import history proves an import on THIS device, not a live or authorized connection. */
export function sourceState(source: DashboardSource, data: DashboardData, isMinor: boolean | null): {
  status: SourceStatus; lastImport: string | null;
} {
  if ("adultOnly" in source && source.adultOnly && isMinor !== false) return { status: "restricted", lastImport: null };
  // OS health history does not retain the original device/app identity here.
  // Never present another device's samples as a verified Garmin import.
  if (source.mode === "health_bridge") return { status: "healthBridge", lastImport: null };
  if (source.mode === "manual") return { status: "manual", lastImport: null };
  if (source.mode === "health" && !data.health.ok) return { status: "unknown", lastImport: null };
  if (source.mode === "health" && !data.healthEnabled) return { status: "off", lastImport: null };
  const history = data.imports.ok ? data.imports.value : [];
  const dates = history.filter((entry) => (source.keys as readonly string[]).includes(entry.sourceKey))
    .map((entry) => entry.atIso).filter(validDate);
  if (source.mode === "health" && data.health.ok) dates.push(...realHealthSamples(data.health.value).map((sample) => sample.created_at).filter(validDate));
  const lastImport = dates.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
  if (lastImport) return { status: "imported", lastImport };
  const failed = !data.imports.ok || (source.mode === "health" && !data.health.ok);
  return { status: failed ? "unknown" : "empty", lastImport: null };
}

function validDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

/** Legacy mock rows must never become evidence of the person's activity. */
export function realHealthSamples(samples: readonly HealthSampleRow[]): HealthSampleRow[] {
  return samples.filter((sample) => ["manual", "healthkit", "health_connect"].includes(sample.source) &&
    Number.isFinite(sample.value) && sample.value >= 0 && validDate(sample.started_at))
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
}
