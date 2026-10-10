import { Platform } from "react-native";
import { captureAccountOwnerLease, subscribeAccountTransition } from "../auth/account-epoch";
import { buildIcsEvent } from "../ops/push";
import { createRoutineFromRecommendation } from "../ops/routines";
import { createOneOffReminder } from "../ops/one-off-reminders";
import { routineReminderId, scheduleRoutineReminder, type ReminderResult } from "../ops/reminders";
import { buildChatPlan, type ChatPlanDraft, type ChatPlanValidation } from "./plan-draft";

export interface ChatPlanSaveResult {
  status: "saved" | "exported" | "scheduled" | "denied" | "unavailable" | "error" | "stale" | "invalid";
  notification?: ReminderResult;
  validation?: ChatPlanValidation;
  routineId?: string;
  reminderId?: string;
}

function downloadCalendar(ics: string, isCurrent: () => boolean): ChatPlanSaveResult {
  if (!isCurrent()) return { status: "stale" };
  if (typeof document === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined"
    || typeof URL.createObjectURL !== "function" || typeof URL.revokeObjectURL !== "function") return { status: "unavailable" };
  let url: string | undefined;
  let started = false;
  try {
    url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "polascope-reminder.ics";
    if (!isCurrent()) return { status: "stale" };
    anchor.click();
    started = true;
    return isCurrent() ? { status: "exported" } : { status: "stale" };
  } finally {
    if (url) {
      const ownedUrl = url;
      // Cleanup retains only the local blob handle, never chat text or account state.
      if (started) setTimeout(() => URL.revokeObjectURL(ownedUrl), 1000);
      else URL.revokeObjectURL(ownedUrl);
    }
  }
}

/** Called only by explicit sheet confirmation; all follow-up effects share its owner lease. */
export async function saveChatPlan(ownerId: string, draft: ChatPlanDraft, { now = new Date(), routineId: confirmationId }: { now?: Date; routineId?: string } = {}): Promise<ChatPlanSaveResult> {
  const lease = captureAccountOwnerLease(ownerId);
  if (!lease?.isCurrent()) return { status: "stale" };
  const built = buildChatPlan(draft, { now, requireExportConsent: Platform.OS === "web" });
  if (!built.ok) return { status: "invalid", validation: built.validation };
  const controller = new AbortController();
  const current = () => lease.isCurrent() && !controller.signal.aborted;
  const unsubscribe = subscribeAccountTransition(() => { if (!lease.isCurrent()) controller.abort(); });
  let routineId: string | undefined;
  let reminderId: string | undefined;
  try {
    if (!current()) return { status: "stale" };
    if (built.recommendation) {
      const routine = await createRoutineFromRecommendation(ownerId, built.draft.domainId, built.recommendation, {
        weekday: built.draft.weekday ?? undefined, signal: controller.signal, routineId: confirmationId,
      });
      routineId = routine.id;
      if (!current()) return { status: "stale" };
      if (!built.event) return { status: "saved", routineId };
      // A web save is a real routine, but cannot claim a native alarm was scheduled.
      if (Platform.OS === "web") return { status: "saved", routineId, notification: "unavailable" };
      const notification = await scheduleRoutineReminder(built.event, { ownerId, identifier: routineReminderId(ownerId, routineId) });
      return current() ? { status: "saved", routineId, notification } : { status: "stale" };
    }
    if (!built.event) return { status: "invalid", validation: "time" };
    if (Platform.OS === "web") {
      const ics = buildIcsEvent(built.event, now);
      return ics ? downloadCalendar(ics, current) : { status: "error" };
    }
    const reminder = await createOneOffReminder(ownerId, built.event);
    if (!current()) return { status: "stale" };
    if (!reminder) return { status: "error" };
    reminderId = reminder.id;
    const notification = await scheduleRoutineReminder(built.event, { ownerId, identifier: routineReminderId(ownerId, reminderId) });
    return current() ? { status: "saved", reminderId, notification } : { status: "stale" };
  } catch {
    if (!current()) return { status: "stale" };
    // A persisted task survives alarm failure; retrying must not create a duplicate.
    if (routineId) return { status: "saved", routineId, notification: "error" };
    return reminderId ? { status: "saved", reminderId, notification: "error" } : { status: "error" };
  } finally {
    unsubscribe();
  }
}
