import rules from "./dashboard-rules.json";
import { localDate, todayAgenda, type DashboardData } from "./model";

export type DashboardPriorityKind = "dueRoutine" | "allDone" | "planRoutine" | "startInterview" | "unavailable";
export interface DashboardPriority {
  kind: DashboardPriorityKind;
  route: string | null;
  evidence: string | null;
}

/** A next step from accepted work, never an AI claim inferred from a record excerpt. */
export function selectDashboardPriority(data: DashboardData | null, now: Date): DashboardPriority | null {
  if (!data) return null;
  if (!data.routines.ok || !data.completions.ok) return { kind: "unavailable", route: null, evidence: null };
  const agenda = todayAgenda(data.routines.value, data.completions.value, now);
  const due = agenda.find((item) => !item.completed);
  if (!due && !agenda.length && (!data.records.ok || !data.interviews.ok)) {
    return { kind: "unavailable", route: null, evidence: null };
  }
  const hasWords = data.records.ok && data.interviews.ok &&
    (data.records.value.some((item) => item.body?.trim()) || data.interviews.value.some((item) => item.body?.trim()));
  const candidates: Partial<Record<DashboardPriorityKind, DashboardPriority>> = {
    dueRoutine: due ? { kind: "dueRoutine", route: "/reminders", evidence: due.title } : undefined,
    allDone: agenda.length && !due ? { kind: "allDone", route: "/ops", evidence: null } : undefined,
    planRoutine: !agenda.length && hasWords ? { kind: "planRoutine", route: "/ops", evidence: null } : undefined,
    startInterview: !agenda.length && !hasWords ? { kind: "startInterview", route: "/me/now", evidence: null } : undefined,
  };
  for (const kind of rules.priorityOrder) {
    const candidate = candidates[kind as DashboardPriorityKind];
    if (candidate) return candidate;
  }
  return { kind: "unavailable", route: null, evidence: null };
}

export interface RecordTrendDay { key: string; date: Date; count: number }
export interface RecordTrend { days: RecordTrendDay[]; limited: boolean }

/** Counts saved records in the bounded read window. A full window is never called a total. */
export function recentRecordTrend(data: DashboardData | null, now: Date): RecordTrend | null {
  if (!data?.records.ok) return null;
  const days = Array.from({ length: rules.recordTrendDays }, (_, index) => {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (rules.recordTrendDays - index - 1));
    return { key: localDate(date), date, count: 0 };
  });
  const byDay = new Map(days.map((day) => [day.key, day]));
  for (const record of data.records.value) {
    const at = new Date(record.created_at);
    if (Number.isFinite(at.getTime())) {
      const day = byDay.get(localDate(at));
      if (day) day.count += 1;
    }
  }
  return { days, limited: data.records.value.length >= rules.recordReadLimit };
}

/** An honest seven-day outlook of accepted recurring routines, not imported calendar events. */
export function upcomingRoutineDays(data: DashboardData | null, now: Date): { date: Date; key: string; count: number }[] {
  if (!data?.routines.ok) return [];
  const routines = data.routines.value;
  return Array.from({ length: rules.upcomingDays }, (_, offset) => {
    const date = new Date(now);
    date.setDate(now.getDate() + offset);
    const count = todayAgenda(routines, [], date).length;
    return { date, key: localDate(date), count };
  });
}
