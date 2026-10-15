import { withTimeout } from "../async/with-timeout";
import { getImportHistory } from "../import/history";
import { listActiveRoutines, listCompletionsSince } from "../ops/routines";
import { remindersSupported } from "../ops/reminders";
import { loadNotifications } from "../ops/notifications-sdk";
import { routineIdFromNotification } from "../ops/notification-identity";
import { resolvePrivacyPrefs } from "../privacy/prefs";
import { RECALL_INTERVIEW_TAG, withSystemTagsColumn } from "../records/system-tags";
import { getSupabaseClient } from "../supabase/client";
import { listRecentSamples } from "../supabase/health";
import { localDate, type DashboardData, type DashboardRecord, type ReadResult } from "./model";

async function read<T>(work: PromiseLike<T>): Promise<ReadResult<T>> {
  try { return { ok: true, value: await withTimeout(work, 8_000, "dashboard") }; }
  catch { return { ok: false }; }
}

async function readRecords(ownerId: string, interviewsOnly: boolean): Promise<DashboardRecord[]> {
  const run = (columnPresent: boolean) => {
    let query = getSupabaseClient().from("records")
      .select("id, kind, body, tags, created_at").eq("user_id", ownerId);
    // The recall interview's marker is the app's (0218 records.system_tags), so a
    // user tag that says `interview` does not put a note here. Without the column,
    // the pre-0218 filter on `tags`.
    if (interviewsOnly) {
      query = query.eq("kind", "audit_response")
        .contains(columnPresent ? "system_tags" : "tags", [RECALL_INTERVIEW_TAG]);
    }
    return query.order("created_at", { ascending: false }).limit(interviewsOnly ? 3 : 80);
  };
  const { data, error } = interviewsOnly ? await withSystemTagsColumn(run) : await run(false);
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
