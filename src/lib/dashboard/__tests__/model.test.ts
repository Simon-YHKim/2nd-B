import { countAreaRecords, DASHBOARD_SOURCES, realHealthSamples, routineActionRoute, sourceState, todayAgenda, type DashboardData } from "../model";
import type { OpsRoutine, OpsRoutineLog } from "../../ops/routines";
import type { HealthSampleRow } from "../../supabase/health";

const now = new Date(2026, 8, 25, 10);
const routine = (id: string, reminder_time: string | null): OpsRoutine => ({
  id, reminder_time, user_id: "owner", domain_id: "daily_focus", title: id, reason: null,
  recurrence: "daily", weekday: null, duration_minutes: 20, checklist: [], active: true, created_at: now.toISOString(),
});
const empty: DashboardData = {
  ownerId: "owner", readAt: now.toISOString(), records: { ok: true, value: [] }, interviews: { ok: true, value: [] },
  routines: { ok: true, value: [] }, completions: { ok: true, value: [] }, imports: { ok: true, value: [] },
  health: { ok: true, value: [] }, healthEnabled: false, notifications: { ok: true, value: { permission: "unavailable", scheduled: 0 } },
};
const source = (id: string) => DASHBOARD_SOURCES.find((item) => item.id === id)!;

test("today shows only due, active routines, pending time first and completed last", () => {
  const items = [routine("untimed", null), routine("late", "18:00"), routine("early", "08:00"), routine("done", "07:00"),
    { ...routine("weekly", "09:00"), recurrence: "weekly" as const, weekday: now.getDay() },
    { ...routine("other-day", "09:00"), recurrence: "weekly" as const, weekday: (now.getDay() + 1) % 7 },
    { ...routine("once", "09:00"), recurrence: "none" as const }, { ...routine("inactive", "06:00"), active: false }];
  const logs = [{ routine_id: "done", completed_on: "2026-09-25" }, { routine_id: "early", completed_on: "2026-09-24" }] as OpsRoutineLog[];
  expect(todayAgenda(items, logs, now).map((item) => item.id)).toEqual(["early", "weekly", "late", "untimed", "done"]);
  expect(items[0].id).toBe("untimed");
});

test("life area counts come from actual domain tags, never interview volume or inferred keywords", () => {
  expect(countAreaRecords([
    { id: "a", kind: "audit_response", body: "money fitness career", tags: ["interview"], created_at: "" },
    { id: "b", kind: "note", body: null, tags: ["domain:health", "domain:health"], created_at: "" },
  ], "health")).toBe(1);
});

test("no history never claims a connection, including unsupported social and messaging sources", () => {
  for (const item of DASHBOARD_SOURCES) {
    expect(sourceState(item, empty, false).status).not.toBe("imported");
    expect(sourceState(item, empty, false).lastImport).toBeNull();
  }
  expect(sourceState(source("instagram"), empty, false).status).toBe("manual");
  expect(sourceState(source("health"), empty, false).status).toBe("off");
});

test("last import uses only that source's most recent valid local history date", () => {
  const imports = [
    { sourceKey: "google", atIso: "2026-09-21T00:00:00Z" },
    { sourceKey: "calendar", atIso: "2026-09-24T00:00:00Z" },
    { sourceKey: "sms", atIso: "2026-09-25T00:00:00Z" },
    { sourceKey: "google", atIso: "invalid" },
  ] as unknown as Extract<DashboardData["imports"], { ok: true }>["value"];
  expect(sourceState(source("calendar"), { ...empty, imports: { ok: true, value: imports } }, false))
    .toEqual({ status: "imported", lastImport: "2026-09-24T00:00:00Z" });
  expect(sourceState(source("sms"), { ...empty, imports: { ok: true, value: imports } }, true).status).toBe("restricted");
  expect(sourceState(source("location"), empty, null).status).toBe("restricted");
  expect(sourceState(source("calendar"), { ...empty, imports: { ok: false } }, false).status).toBe("unknown");
});

test("mock, invalid and unknown activity samples cannot become personal activity", () => {
  const sample = { id: "real", source: "healthkit", value: 500, started_at: "2026-09-25T00:00:00Z" } as HealthSampleRow;
  expect(realHealthSamples([sample, { ...sample, id: "fake", source: "mock" }, { ...sample, value: NaN }, { ...sample, value: -1 }, { ...sample, source: "strava" }]))
    .toEqual([sample]);
});

test("actions reach the existing tools without scheduling or messaging", () => {
  expect(routineActionRoute("daily_focus")).toBe("/focus");
  expect(routineActionRoute("money_check")).toBe("/ledger");
  expect(routineActionRoute("exercise_routine")).toBe("/star/health");
  expect(routineActionRoute("new-domain")).toBe("/ops");
  for (const item of DASHBOARD_SOURCES.filter((item) => item.mode === "manual")) expect(item.route).toBe("/capture");
});

test("Garmin opens the existing health import, without claiming a direct connection or Garmin provenance", () => {
  const garmin = source("garmin");
  expect(garmin).toMatchObject({ mode: "health_bridge", route: "/import", adultOnly: true });
  const withOtherHealthData = {
    ...empty,
    healthEnabled: true,
    health: { ok: true as const, value: [{
      id: "other-device", source: "healthkit", value: 500,
      started_at: now.toISOString(), created_at: now.toISOString(),
    } as HealthSampleRow] },
  };
  expect(sourceState(garmin, empty, false)).toEqual({ status: "healthBridge", lastImport: null });
  expect(sourceState(garmin, withOtherHealthData, false)).toEqual({ status: "healthBridge", lastImport: null });
  expect(sourceState(garmin, withOtherHealthData, true).status).toBe("restricted");
  expect(sourceState(garmin, withOtherHealthData, null).status).toBe("restricted");
});
