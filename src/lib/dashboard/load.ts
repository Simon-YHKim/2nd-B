import { withTimeout } from "../async/with-timeout";
import { getImportHistory } from "../import/history";
import { listActiveRoutines, listCompletionsSince } from "../ops/routines";
import { remindersSupported } from "../ops/reminders";
import { loadNotifications } from "../ops/notifications-sdk";
import { routineIdFromNotification } from "../ops/notification-identity";
import { resolvePrivacyPrefs } from "../privacy/prefs";
import { getSupabaseClient } from "../supabase/client";
import { listRecentSamples } from "../supabase/health";
import { localDate, type DashboardData, type DashboardRecord, type ReadResult } from "./model";

async function read<T>(work: PromiseLike<T>): Promise<ReadResult<T>> {
  try { return { ok: true, value: await withTimeout(work, 8_000, "dashboard") }; }
  catch { return { ok: false }; }
}

async function readRecords(ownerId: string, interviewsOnly: boolean): Promise<DashboardRecord[]> {
  let query = getSupabaseClient().from("records")
    .select("id, kind, body, tags, created_at").eq("user_id", ownerId);
  if (interviewsOnly) query = query.eq("kind", "audit_response").contains("tags", ["interview"]);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(interviewsOnly ? 3 : 80);
  if (error) throw error;
  return (data ?? []) as DashboardRecord[];
}

async function readHealth(ownerId: string, isMinor: boolean | null) {
  if (isMinor !== false) return { enabled: false, samples: [] };
  const { data, error } = await getSupabaseClient().from("users").select("privacy_prefs").eq("id", ownerId).maybeSingle();
  if (error) throw error;
  const enabled = resolvePrivacyPrefs(data?.privacy_prefs).health_import;
  return { enabled, samples: enabled ? await listRecentSamples(ownerId, 24) : [] };
}

async function readNotifications(ownerId: string) {
  const sdk = loadNotifications();
  if (!remindersSupported() || !sdk) return { permission: "unavailable", scheduled: 0 };
  const [permission, scheduled] = await Promise.all([sdk.getPermissionsAsync(), sdk.getAllScheduledNotificationsAsync()]);
  return { permission: permission.status, scheduled: scheduled.filter((item) => routineIdFromNotification(item.identifier, ownerId) !== null).length };
}

/** Reads are owner-scoped and permission-free. The existing controls own all consent. */
export async function loadDashboard(ownerId: string, isMinor: boolean | null, now = new Date()): Promise<DashboardData> {
  const [records, interviews, routines, completions, imports, health, notifications] = await Promise.all([
    read(readRecords(ownerId, false)),
    read(readRecords(ownerId, true)),
    read(listActiveRoutines(ownerId)),
    read(listCompletionsSince(ownerId, localDate(now))),
    read(getImportHistory(ownerId)),
    read(readHealth(ownerId, isMinor)),
    read(readNotifications(ownerId)),
  ]);
  return {
    ownerId, readAt: now.toISOString(), records, interviews, routines, completions, imports, notifications,
    healthEnabled: health.ok && health.value.enabled,
    health: health.ok ? { ok: true, value: health.value.samples } : { ok: false },
  };
}
