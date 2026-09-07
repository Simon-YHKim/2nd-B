// ⚠ NOT WIRED YET, and that is deliberate - "dormant is a decision".
//
// This module was written but never committed to any ref; it lived only in a
// shared worktree, where it would have been lost. It lands here on its own so
// the work is not lost twice, ahead of the screen wiring that will use it.
// Landing it and its tests separately keeps the diff readable and lets the
// wiring be reviewed against main's current pixel-clay account screen rather
// than against the worktree's pre-migration copy of it.
//
// Do not delete it for having no callers. Its caller is the next change.
//
// Holds the post-deletion receipt between the terminal server call and whatever
// screen shows it, and drops it the moment the account owner changes. It is a
// store, not an actor: it deletes nothing.
import { isCurrentAccountEpoch, onAccountOwnerChange } from "../auth/account-epoch";
import type { AccountDeletionReceipt, DeletionSweep } from "../records/delete-bulk";

export type LocalPurgeOutcome = "complete" | "retry-scheduled" | "unconfirmed";
/**
 * The notice holds a frozen VIEW of the receipt, not the receipt object. The
 * sweep lists are frozen too - a frozen object holding mutable arrays is half a
 * guarantee - so they are readonly here. Anything the caller attached that is
 * not a receipt field never reaches this type, which is the point.
 */
export interface AccountDeletionNotice {
  receipt: Omit<AccountDeletionReceipt, "incomplete" | "unconfirmed"> & {
    readonly incomplete: readonly DeletionSweep[];
    readonly unconfirmed: readonly DeletionSweep[];
  };
  localPurge: LocalPurgeOutcome;
  localSignOut: "pending" | "complete" | "unconfirmed";
}

let snapshot: AccountDeletionNotice | null = null;
let stopNoticeOwner: (() => void) | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    try { listener(); } catch { /* A subscriber cannot prevent owner invalidation. */ }
  }
}

export function getAccountDeletionNotice(): AccountDeletionNotice | null { return snapshot; }
export function subscribeAccountDeletionNotice(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function dismissAccountDeletionNotice(): void {
  stopNoticeOwner?.();
  stopNoticeOwner = null;
  if (snapshot === null) return;
  snapshot = null;
  emit();
}

/** Memory-only handoff: never put account IDs, credentials or receipts in URLs
 * or device storage. It survives just this operation's A -> null transition. */
function publish(owner: string, epoch: number, receipt: AccountDeletionReceipt, localPurge: LocalPurgeOutcome) {
  dismissAccountDeletionNotice();
  const pending: AccountDeletionNotice = Object.freeze({
    // ⚠ 필드를 하나씩 적는 것은 장황해서가 아니라 그것이 이 자리의 방어다.
    // 호출자가 넘긴 객체를 펼치면(spread) 영수증에 없는 계정 메타데이터까지
    // 공개 알림으로 새어 나간다. 이 모듈의 테스트가 정확히 그것을 지킨다 -
    // privateOwner 를 얹은 영수증을 넣고 알림에 그것이 없어야 통과한다.
    // 실제로 내가 한 번 {...receipt} 로 바꿨다가 그 테스트에 걸렸다.
    //
    // 다만 목록은 main 의 영수증에 맞춰 넓혔다. 서버가 못 끝냈다고 한 sweep,
    // 아무 말도 안 한 sweep, 전부 확인됐는지, 관측 시각까지 - 그건 삭제 영수증
    // 화면이 말해야 할 내용이고, 옛 세 필드만 옮기면 화면이 서버보다 덜
    // 정직해진다. 배열도 함께 얼린다: 얼린 객체가 안 얼린 배열을 들고 있으면
    // 그 보장은 절반이다.
    receipt: Object.freeze({
      deleted: receipt.deleted,
      profileErased: receipt.profileErased,
      rawClippingsErased: receipt.rawClippingsErased,
      incomplete: Object.freeze([...receipt.incomplete]),
      unconfirmed: Object.freeze([...receipt.unconfirmed]),
      complete: receipt.complete,
      observedAtIso: receipt.observedAtIso,
    }), localPurge, localSignOut: "pending",
  });
  snapshot = pending;
  stopNoticeOwner = onAccountOwnerChange((change) => {
    if (change.previousOwner === owner && change.owner === null && change.epoch === epoch + 1) return;
    dismissAccountDeletionNotice();
  });
  emit();
  return pending;
}

/** UI continuation guard, not an SDK lock or a remote deletion retry worker.
 * Before sign-out every epoch change invalidates the operation. During sign-out
 * exactly the original A -> null is allowed, even when it unmounts the screen.
 * Already-running SDK signOut/login races remain a separate Auth concern. */
export function createAccountDeletionCompletion(owner: string, epoch: number) {
  let continuationEpoch = epoch;
  let invalidated = false;
  let stopOperationOwner: (() => void) | null = null;
  let pending: AccountDeletionNotice | null = null;
  const isCurrent = () => !invalidated && isCurrentAccountEpoch(epoch);

  return {
    isCurrent,
    beginSignOut(receipt: AccountDeletionReceipt, localPurge: LocalPurgeOutcome): boolean {
      if (!isCurrent() || pending !== null) return false;
      stopOperationOwner = onAccountOwnerChange((change) => {
        if (change.previousOwner === owner && change.owner === null
          && change.epoch === epoch + 1 && continuationEpoch === epoch) {
          continuationEpoch = change.epoch;
        } else {
          invalidated = true;
        }
      });
      pending = publish(owner, epoch, receipt, localPurge);
      return true;
    },
    finishSignOut(confirmed: boolean): boolean {
      if (!pending || invalidated || !isCurrentAccountEpoch(continuationEpoch)) return false;
      if (snapshot === pending) {
        snapshot = Object.freeze({ ...pending, localSignOut: confirmed ? "complete" : "unconfirmed" });
        emit();
      }
      return true;
    },
    dispose(): void {
      stopOperationOwner?.();
      stopOperationOwner = null;
      // The notice retains its own owner listener until dismissal or transition.
    },
  };
}
