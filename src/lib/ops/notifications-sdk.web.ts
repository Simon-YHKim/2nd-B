// expo-notifications access seam, WEB side of the platform split -- fail-closed
// stub. The real require lives in ./notifications-sdk.ts; Metro resolves THIS
// file on web and ./notifications-sdk.ts on ios/android (and under tsc/jest).
//
// Web has no on-device notification scheduler, so every caller already
// reported "unavailable" there; this stub makes that true at bundle time too
// (audit D5-11). Never reference expo-notifications here in any importable
// form -- the type comes from the sibling via a type-only import (erased).

import type { NotificationsModule } from "./notifications-sdk";

export type { NotificationsModule } from "./notifications-sdk";

export function loadNotifications(): NotificationsModule | null {
  return null;
}
