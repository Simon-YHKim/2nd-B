import { captureAccountOwnerLease } from "../auth/account-epoch";
import { loadNotifications, type NotificationsModule } from "./notifications-sdk";
import { isPrivacySafeNotificationRequest, routineIdFromNotification } from "./notification-identity";
import { listOneOffReminders } from "./one-off-reminders";

/** Resolve only this owner's saved chat reminder, without putting private text in a route. */
export function observeChatReminderResponses(ownerId: string, openReminders: () => void): () => void {
  const lease = captureAccountOwnerLease(ownerId);
  const sdk = loadNotifications();
  if (!lease || !sdk) return () => undefined;
  let closed = false;
  const handled = new Set<string>();
  const current = () => !closed && lease.isCurrent();
  type Response = Parameters<NotificationsModule["addNotificationResponseReceivedListener"]>[0] extends (response: infer R) => unknown ? R : never;
  async function respond(response: Response | null) {
    if (!response || !current() || response.actionIdentifier !== sdk!.DEFAULT_ACTION_IDENTIFIER) return;
    const request = response.notification.request;
    if (!isPrivacySafeNotificationRequest(request)) return;
    const id = routineIdFromNotification(request.identifier, ownerId);
    if (!id?.startsWith("chat-") || handled.has(request.identifier)) return;
    handled.add(request.identifier);
    try {
      const saved = await listOneOffReminders(ownerId);
      if (!current() || !saved.some(item => item.id === id)) return;
      openReminders();
      // Synchronous compare-and-clear cannot erase a newer owner's notification tap.
      const last = sdk!.getLastNotificationResponse();
      if (current() && last?.notification.request.identifier === request.identifier) sdk!.clearLastNotificationResponse();
    } catch {
      handled.delete(request.identifier);
    }
  }
  let subscription: { remove(): void } | undefined;
  try {
    subscription = sdk.addNotificationResponseReceivedListener(response => { void respond(response); });
    void respond(sdk.getLastNotificationResponse());
  } catch {
    // Older native hosts may not expose responses. Reminders remain visible in the list.
  }
  return () => { closed = true; subscription?.remove(); };
}
