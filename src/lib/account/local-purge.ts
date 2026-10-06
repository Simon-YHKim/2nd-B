import { purgeCaptureDraftsForDeletedAccount } from "../capture/draft";
import { purgeAvatarPaletteItemsForDeletedAccount } from "../avatar-palette/gallery";
import { purgeHealthAutoReadForDeletedAccount } from "../health/auto-read";
import { purgeImportHistoryForDeletedAccount } from "../import/history";
import { purgeAuditWriteOutboxForOwner } from "../llm/audit-write-outbox";
import { purgeNoticeLastSeenForDeletedAccount } from "../notices/last-seen";
import { purgeStarLastSeenForDeletedAccount } from "../persona/star-last-seen";
import { purgeNoticeReadStateForDeletedAccount } from "../notices/read-store";
import { purgeFocusForDeletedAccount } from "../ops/focus-store";
import { clearAccountScopedLocalNotifications } from "../ops/reminders";
import { purgeOpsUsageForDeletedAccount } from "../ops/usage";
import { purgeGithubUsernameForDeletedAccount } from "../projects/github-link";
import { purgeAutoReasoningForDeletedAccount } from "../reasoning/auto-pref";
import { purgeWikiAutoPromoteForDeletedAccount } from "../wiki/auto-promote";
import type { LocalPurgeOutcome } from "./deletion-completion";
import { installAccountLocalDeletionFence, readAccountLocalDeletionFence } from "./local-deletion-fence";

export const LOCAL_PURGE_TIMEOUT_MS = 5_000;

async function observe(purge: () => Promise<boolean>): Promise<boolean> {
  try {
    return await purge();
  } catch {
    return false;
  }
}

/** Purge every known owner-scoped local namespace after terminal deletion. */
export async function purgeDeletedAccountLocalData(userId: string): Promise<LocalPurgeOutcome> {
  const owner = userId.trim();
  if (!owner) return "unconfirmed";

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<LocalPurgeOutcome>((resolve) => {
    timeoutId = setTimeout(() => resolve("unconfirmed"), LOCAL_PURGE_TIMEOUT_MS);
  });
  const purge = (async (): Promise<LocalPurgeOutcome> => {
    // A browser without Web Locks persists the marker but cannot join a write
    // already running in another tab, so the pass that lays it reports
    // unconfirmed. A later pass that finds the marker already laid wipes again
    // after any such write has landed, and that pass may confirm
    // (설계서 5.1 W2 "다음 실행에서 한 번 더", gate SAFE-03).
    const laidByEarlierPass = (await readAccountLocalDeletionFence(owner)) === true;
    const fenceAcknowledged = (await installAccountLocalDeletionFence(owner)) || laidByEarlierPass;
    const results = await Promise.all([
      observe(() => purgeAvatarPaletteItemsForDeletedAccount(owner)),
      observe(() => purgeCaptureDraftsForDeletedAccount(owner)),
      observe(() => purgeImportHistoryForDeletedAccount(owner)),
      observe(() => purgeGithubUsernameForDeletedAccount(owner)),
      observe(() => purgeAuditWriteOutboxForOwner(owner)),
      observe(() => purgeOpsUsageForDeletedAccount(owner)),
      observe(() => purgeFocusForDeletedAccount(owner)),
      observe(() => purgeAutoReasoningForDeletedAccount(owner)),
      observe(() => purgeWikiAutoPromoteForDeletedAccount(owner)),
      observe(() => purgeHealthAutoReadForDeletedAccount(owner)),
      observe(() => purgeNoticeReadStateForDeletedAccount(owner)),
      observe(() => purgeNoticeLastSeenForDeletedAccount(owner)),
      observe(() => purgeStarLastSeenForDeletedAccount(owner)),
      observe(async () => {
        await clearAccountScopedLocalNotifications(owner);
        return true;
      }),
    ]);
    return fenceAcknowledged && results.every(Boolean) ? "complete" : "unconfirmed";
  })();

  try {
    return await Promise.race([purge, deadline]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
