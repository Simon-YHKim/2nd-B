import { recentRecordTrend, selectDashboardPriority, upcomingRoutineDays } from "../summary";
import type { DashboardData } from "../model";
import type { OpsRoutine } from "../../ops/routines";

const now = new Date(2026, 8, 26, 10);
const empty: DashboardData = {
  ownerId: "owner", readAt: now.toISOString(), records: { ok: true, value: [] }, interviews: { ok: true, value: [] },
  routines: { ok: true, value: [] }, completions: { ok: true, value: [] }, imports: { ok: true, value: [] },
  health: { ok: true, value: [] }, healthEnabled: false, notifications: { ok: true, value: { permission: "unavailable", scheduled: 0 } },
};

test("unread data never becomes an inferred action or a zero-valued trend", () => {
  expect(selectDashboardPriority(null, now)).toBeNull();
  expect(selectDashboardPriority({ ...empty, records: { ok: false } }, now)?.kind).toBe("unavailable");
  expect(recentRecordTrend({ ...empty, records: { ok: false } }, now)).toBeNull();
});

test("the seven-day radar counts only accepted recurring routines", () => {
  const routine = {
    id: "daily", user_id: "owner", domain_id: "daily_focus", title: "Walk", reason: null,
    recurrence: "daily", weekday: null, reminder_time: "09:00", duration_minutes: 20, checklist: [],
    active: true, created_at: now.toISOString(),
  } as OpsRoutine;
  const data: DashboardData = { ...empty, routines: { ok: true, value: [routine,
    { ...routine, id: "weekly", recurrence: "weekly", weekday: now.getDay() },
    { ...routine, id: "one-off", recurrence: "none" },
    { ...routine, id: "inactive", active: false },
  ] } };
  const week = upcomingRoutineDays(data, now);
  expect(week).toHaveLength(7);
  expect(week[0]).toMatchObject({ count: 2 });
  expect(week.slice(1).map((day) => day.count)).toEqual([1, 1, 1, 1, 1, 1]);
  expect(upcomingRoutineDays({ ...data, routines: { ok: false } }, now)).toEqual([]);
});

test("the lead action comes from an accepted due routine, not the latest interview excerpt", () => {
  const due = { id: "due", user_id: "owner", domain_id: "daily_focus", title: "Read ten minutes", reason: null,
    recurrence: "daily", weekday: null, reminder_time: "09:00", duration_minutes: 10, checklist: [],
    active: true, created_at: now.toISOString() } as OpsRoutine;
  const data: DashboardData = { ...empty, routines: { ok: true, value: [due] },
    interviews: { ok: true, value: [{ id: "i", kind: "audit_response", body: "A private answer", tags: ["interview"], created_at: now.toISOString() }] } };
  expect(selectDashboardPriority(data, now)).toEqual({ kind: "dueRoutine", route: "/reminders", evidence: "Read ten minutes" });
  expect(selectDashboardPriority({ ...data, routines: { ok: false } }, now)).toEqual({ kind: "unavailable", route: null, evidence: null });
});

test("empty evidence invites an interview; existing words invite planning", () => {
  expect(selectDashboardPriority(empty, now)?.kind).toBe("startInterview");
  expect(selectDashboardPriority({ ...empty, records: { ok: true, value: [{ id: "r", kind: "note", body: "My note", tags: [], created_at: now.toISOString() }] } }, now)?.kind).toBe("planRoutine");
});

test("record trend reports a bounded seven-day window and preserves read failures", () => {
  expect(recentRecordTrend({ ...empty, records: { ok: false } }, now)).toBeNull();
  const records = Array.from({ length: 80 }, (_, index) => ({ id: String(index), kind: "note", body: "saved", tags: [], created_at: now.toISOString() }));
  const trend = recentRecordTrend({ ...empty, records: { ok: true, value: records } }, now);
  expect(trend?.days).toHaveLength(7);
  expect(trend?.days[6]).toMatchObject({ count: 80 });
  expect(trend?.limited).toBe(true);
});
