import { purgeCaptureDraftsForDeletedAccount } from "../capture/draft";
import { purgeAutosaveUndoForDeletedAccount } from "../chat/autosave-undo-queue";
import { purgeImportHistoryForDeletedAccount } from "../import/history";
import { purgeAuditWriteOutboxForOwner } from "../llm/audit-write-outbox";
import { purgeNoticeLastSeenForDeletedAccount } from "../notices/last-seen";
import { purgeNoticeReadStateForDeletedAccount } from "../notices/read-store";
import { clearAccountScopedLocalNotifications } from "../ops/reminders";
import { purgeOpsUsageForDeletedAccount } from "../ops/usage";
import { purgeGithubUsernameForDeletedAccount } from "../projects/github-link";
import { purgeAutoReasoningForDeletedAccount } from "../reasoning/auto-pref";
import { purgeWikiAutoPromoteForDeletedAccount } from "../wiki/auto-promote";
import type { LocalPurgeOutcome } from "./deletion-completion";
import { installAccountLocalDeletionFence } from "./local-deletion-fence";

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
    const fenceAcknowledged = await installAccountLocalDeletionFence(owner);
    const results = await Promise.all([
      observe(() => purgeCaptureDraftsForDeletedAccount(owner)),
      observe(() => purgeAutosaveUndoForDeletedAccount(owner)),
      observe(() => purgeImportHistoryForDeletedAccount(owner)),
      observe(() => purgeGithubUsernameForDeletedAccount(owner)),
      observe(() => purgeAuditWriteOutboxForOwner(owner)),
      observe(() => purgeOpsUsageForDeletedAccount(owner)),
      observe(() => purgeAutoReasoningForDeletedAccount(owner)),
      observe(() => purgeWikiAutoPromoteForDeletedAccount(owner)),
      observe(() => purgeNoticeReadStateForDeletedAccount(owner)),
      observe(() => purgeNoticeLastSeenForDeletedAccount(owner)),
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
