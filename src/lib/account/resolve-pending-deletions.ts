// Background sweep of unanswered account-deletion requests on this device.
//
// A delete-account answer can be lost after the server already erased the
// account. The device then still holds that owner's local data, and nothing
// installed the terminal local fence (that happens only after a confirmation -
// deletion-pending.ts). The receipt the server recorded is the confirmation we
// missed, so a signed-out screen asks for it here, purges what is left (the
// purge installs the terminal fence first) and forgets the request.
//
// One sweep at a time per JS realm; a caller that arrives while one is running
// shares it. Never throws.
import { resolveAllPendingAccountDeletions } from "./deletion-pending";
import { fetchAccountDeletionReceipt } from "./deletion-receipt";
import { purgeDeletedAccountLocalData } from "./local-purge";

let running: Promise<{ deleted: string[]; pending: string[] }> | null = null;

export function resolvePendingAccountDeletionsInBackground(): Promise<{ deleted: string[]; pending: string[] }> {
  if (running) return running;
  const sweep = resolveAllPendingAccountDeletions({
    lookup: (receiptId) => fetchAccountDeletionReceipt(receiptId),
    purge: purgeDeletedAccountLocalData,
  })
    .catch(() => ({ deleted: [] as string[], pending: [] as string[] }))
    .finally(() => {
      if (running === sweep) running = null;
    });
  running = sweep;
  return sweep;
}
