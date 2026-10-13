// Fixed text for what the OS shows outside the app: the lock screen, the
// notification shade and the system's channel list. It never carries anything
// the user wrote (see scheduleRoutineReminder). One sentence per app language,
// English when that language is not loaded.
import i18next from "i18next";

// Must equal locales/en/ops.json (device-notification-text.test.ts checks it).
export const DEVICE_NOTIFICATION_TEXT_FALLBACK = {
  deviceReminderBody: "It's time for your reminder.",
  deviceTimerBody: "Your timer is done.",
  deviceChannelName: "Reminders",
} as const;

export type DeviceNotificationTextKey = keyof typeof DEVICE_NOTIFICATION_TEXT_FALLBACK;

const OPS_KEY: Readonly<Record<DeviceNotificationTextKey, string>> = {
  deviceReminderBody: "push.deviceReminderBody",
  deviceTimerBody: "push.deviceTimerBody",
  deviceChannelName: "push.deviceChannelName",
};

export function deviceNotificationText(key: DeviceNotificationTextKey): string {
  try {
    if (i18next.isInitialized && i18next.exists(OPS_KEY[key], { ns: "ops" })) {
      const text = i18next.t(OPS_KEY[key], { ns: "ops" });
      if (typeof text === "string" && text.trim().length > 0) return text;
    }
  } catch {
    // A translation lookup must never stop a reminder from being scheduled.
  }
  return DEVICE_NOTIFICATION_TEXT_FALLBACK[key];
}
