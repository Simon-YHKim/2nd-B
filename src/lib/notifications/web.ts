// Lightweight Web Notifications wrapper. Native (iOS/Android) gets
// proper expo-notifications in a later EAS Build phase; this module
// handles the Web path so users can opt into a system notification of
// today's reflection prompt without leaving the app.
//
// API design:
//   - All functions are safe to call on any platform (Web / native /
//     SSR / static export). Non-Web → no-op or a "not_supported" status.
//   - No silent failures: every result returns a structured status the
//     caller can surface in the UI.

export type NotifyStatus =
  | "not_supported" // Notification API absent (native, SSR, very old browser)
  | "denied" // user blocked or never granted
  | "granted" // request succeeded and notification fired
  | "default" // permission still 'default' after request (rare)
  | "error"; // unexpected runtime exception

export interface NotifyResult {
  status: NotifyStatus;
  detail?: string;
}

function hasNotificationApi(): boolean {
  // Don't require `window` — the Notification global is what matters and
  // jest's node env stubs it via globalThis.Notification.
  return typeof Notification !== "undefined" && typeof Notification.requestPermission === "function";
}

export function currentPermission(): NotifyStatus {
  if (!hasNotificationApi()) return "not_supported";
  const p = Notification.permission;
  if (p === "granted") return "granted";
  if (p === "denied") return "denied";
  return "default";
}

/**
 * Send a notification, prompting for permission first if needed.
 * Returns the final status so the UI can show an appropriate hint.
 */
export async function notify(title: string, body: string): Promise<NotifyResult> {
  if (!hasNotificationApi()) return { status: "not_supported" };

  try {
    let perm = Notification.permission;
    if (perm === "default") {
      perm = await Notification.requestPermission();
    }
    if (perm === "denied") return { status: "denied" };
    if (perm !== "granted") return { status: "default" };

    new Notification(title, { body, icon: "/2nd-B/assets/images/icon.png" });
    return { status: "granted" };
  } catch (e) {
    return { status: "error", detail: (e as Error).message };
  }
}
