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
  let ownerVersion = 0;
  let cleanedOwnerVersion = -1;
  let cleanupInFlight: { version: number; promise: Promise<void> } | null = null;

  const cleanupPublishedOwner = (previousOwner: string, version: number): Promise<void> => {
    if (cleanedOwnerVersion === version) return Promise.resolve();
    if (cleanupInFlight?.version === version) return cleanupInFlight.promise;

    const promise = (async () => {
      try {
        await cleanup(previousOwner);
      } catch {
        // The cleanup has a finite caller-visible budget. Its native effects
        // are owner-addressed, so a terminal timeout may leave A data pending
        // but cannot target B. Do not strand a valid B session on a loader.
        if (typeof console !== "undefined") {
          console.warn("[auth] previous account notification cleanup incomplete");
        }
      } finally {
        cleanedOwnerVersion = version;
      }
    })();
    cleanupInFlight = { version, promise };
    void promise.finally(() => {
      if (cleanupInFlight?.promise === promise) cleanupInFlight = null;
    });
    return promise;
  };

  return {
    async prepare(nextOwner, isStillCurrent) {
      const previousOwner = owner;
      const previousOwnerVersion = ownerVersion;
      if (previousOwner && previousOwner !== nextOwner) {
        await cleanupPublishedOwner(previousOwner, previousOwnerVersion);
      }
      if (!isStillCurrent()) return false;
      if (owner !== nextOwner) {
        owner = nextOwner;
        ownerVersion += 1;
      }
      return true;
    },
    publishedOwner: () => owner,
  };
}
