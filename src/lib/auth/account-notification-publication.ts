import { clearAccountScopedLocalNotifications } from "../ops/reminders";

type CleanupAccountNotifications = (ownerId: string) => Promise<void>;

export interface AccountNotificationPublicationGate {
  /** Resolve true only when it is safe for the caller to publish `nextOwner`. */
  prepare(nextOwner: string | null, isStillCurrent: () => boolean): Promise<boolean>;
  publishedOwner(): string | null;
}

/**
 * Holds the last actually-published owner until that owner's bounded local
 * cleanup reaches a terminal result. The caller supplies its auth generation
 * fence, so a superseded A→B transition cannot publish B after C has arrived.
 */
export function createAccountNotificationPublicationGate(
  cleanup: CleanupAccountNotifications = clearAccountScopedLocalNotifications,
): AccountNotificationPublicationGate {
  let owner: string | null = null;

  return {
    async prepare(nextOwner, isStillCurrent) {
      const previousOwner = owner;
      if (previousOwner && previousOwner !== nextOwner) {
        try {
          await cleanup(previousOwner);
        } catch {
          // The cleanup has a finite caller-visible budget. Its native effects
          // are owner-addressed, so a terminal timeout may leave A data pending
          // but cannot target B. Do not strand a valid B session on a loader.
          if (typeof console !== "undefined") {
            console.warn("[auth] previous account notification cleanup incomplete");
          }
        }
      }
      if (!isStillCurrent()) return false;
      owner = nextOwner;
      return true;
    },
    publishedOwner: () => owner,
  };
}
