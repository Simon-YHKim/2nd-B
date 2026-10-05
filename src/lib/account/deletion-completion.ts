// Holds the post-deletion receipt between the terminal server call and whatever
// screen shows it, and drops it the moment another account can see this device.
// It is a store, not an actor: it deletes nothing.
//
// Wired: /privacy (DeepSpacePrivacyDesignScreen) creates one operation per
// confirmed deletion and /sign-in renders the notice. (The header used to say
// "not wired yet"; that stopped being true when the receipt reached /sign-in.)
import {
  currentPendingAccountOwner,
  currentResolvedAccountOwner,
  isCurrentAccountEpoch,
  onAccountOwnerChange,
  subscribeAccountTransition,
} from "../auth/account-epoch";
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

/**
 * Follow one owner's account by PUBLISHED owner events, never by epoch
 * arithmetic.
 *
 * ⚠ The epoch is the wrong ruler for "was this the deletion's own sign-out".
 * AuthContext moves it twice for one ordinary sign-out: the pre-publication
 * hold beginAccountOwnerTransition(null) goes E -> E+1 with no owner event, and
 * noteResolvedOwner(null) goes E+1 -> E+2 with the only owner event. A direct
 * noteResolvedOwner(null) (publishSessionUnavailable) moves it once. This module
 * used to accept exactly `epoch + 1`, so the normal sign-out after a successful
 * deletion discarded the receipt every time (QA 261004 gates DEL-R3-01 and
 * EXIST-DEL-01B, 2026-10-05). The unit tests had published null with a bare
 * noteResolvedOwner(null), the one path where +1 happens to hold.
 *
 * What the receipt must survive is the first published change when it is
 * owner -> null. Any other published change (owner -> B, or null -> anyone
 * after it) means another account can be looking at this device, so it ends
 * the operation. Pre-publication holds expose no owner and therefore do not
 * count; AuthContext calls noteResolvedOwner() before every setState, so the
 * dismissal is synchronous and runs before B's state becomes observable.
 *
 * The A -> null is accepted at most once without a flag: once null is
 * published, every later event starts from null, never from A.
 */
function followOwnerToSignOut(owner: string, onOther: () => void) {
  let signedOut = false;
  const stop = onAccountOwnerChange((change) => {
    if (change.previousOwner === owner && change.owner === null) {
      signedOut = true;
      return;
    }
    onOther();
  });
  return { stop, isSignedOut: () => signedOut };
}

/** Memory-only handoff: never put account IDs, credentials or receipts in URLs
 * or device storage. It survives just this owner's A -> null transition; when
 * that already happened before publication, the next change clears it. */
function publish(owner: string, receipt: AccountDeletionReceipt, localPurge: LocalPurgeOutcome) {
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
      deletionFenced: receipt.deletionFenced,
      rawClippingsErased: receipt.rawClippingsErased,
      rawClippingsEmptyAtCheck: receipt.rawClippingsEmptyAtCheck,
      rawClippingsRemoved: receipt.rawClippingsRemoved,
      incomplete: Object.freeze([...receipt.incomplete]),
      unconfirmed: Object.freeze([...receipt.unconfirmed]),
      complete: receipt.complete,
      observedAtIso: receipt.observedAtIso,
    }), localPurge, localSignOut: "pending",
  });
  snapshot = pending;
  stopNoticeOwner = followOwnerToSignOut(owner, dismissAccountDeletionNotice).stop;
  emit();
  return pending;
}

/** UI continuation guard, not an SDK lock or a remote deletion retry worker.
 *
 * Create it when the deletion starts, before the first await, while `owner` is
 * the published owner at `epoch`; a stale capture is dead on arrival. From then
 * on it follows the account, not the screen that created it: the owner's own
 * A -> null (the deletion's sign-out, or another tab's, or a session that the
 * server already revoked) keeps it alive even when it unmounts that screen, and
 * every other published change invalidates it.
 *
 * ⚠ So does an account that is only ON ITS WAY (QA 261004 gate DEL-N1-01,
 * 2026-10-05). A login after A -> null raises beginAccountOwnerTransition(B)
 * and publishes B later, after its cleanup and profile probe. In between the
 * published owner is still null, so a rule that waited for B's owner event let
 * this operation publish A's receipt onto /sign-in (an (auth) scene that
 * AccountScope does not hide) while B was signing in, and on a failed sign-out
 * empty B's pending stack. The completion therefore ends as soon as a hold for a
 * signed-in owner is up, and does not come back if that hold is later dropped:
 * losing A's receipt is the safe side of that race. A sign-out hold (target
 * null) is the deletion's own sign-out and does not count.
 * Already-running SDK signOut/login races remain a separate Auth concern. */
export function createAccountDeletionCompletion(owner: string, epoch: number) {
  let invalidated = !isCurrentAccountEpoch(epoch) || currentResolvedAccountOwner() !== owner
    || currentPendingAccountOwner() !== null;
  let pending: AccountDeletionNotice | null = null;
  const invalidate = () => { invalidated = true; };
  const watch = followOwnerToSignOut(owner, invalidate);
  // Holds raise no owner event, only a transition; listen there for the one
  // that puts another account (or A again, after A -> null) in front of us.
  const stopHoldWatch = subscribeAccountTransition(() => {
    if (currentPendingAccountOwner() !== null) invalidate();
  });
  // The listeners already end the operation on any other published change or
  // pending login; the owner reads are a second, independent check against this
  // module and account-epoch ever disagreeing.
  const isCurrent = () => !invalidated
    && currentPendingAccountOwner() === null
    && currentResolvedAccountOwner() === (watch.isSignedOut() ? null : owner);

  return {
    isCurrent,
    beginSignOut(receipt: AccountDeletionReceipt, localPurge: LocalPurgeOutcome): boolean {
      if (!isCurrent() || pending !== null) return false;
      pending = publish(owner, receipt, localPurge);
      return true;
    },
    finishSignOut(confirmed: boolean): boolean {
      if (!pending || !isCurrent()) return false;
      if (snapshot === pending) {
        snapshot = Object.freeze({ ...pending, localSignOut: confirmed ? "complete" : "unconfirmed" });
        emit();
      }
      return true;
    },
    dispose(): void {
      watch.stop();
      stopHoldWatch();
      // The notice retains its own owner listener until dismissal or transition.
    },
  };
}
