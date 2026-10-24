import { captureAccountOwnerLease, type AccountOwnerLease } from "../auth/account-epoch";

export type SavedDataDeletionTarget = Readonly<{
  ownerId: string;
  kind: "source" | "wiki_page";
} & (
  | { ids: readonly string[]; all?: never; scope?: never }
  | { all: true; ids?: never; scope?: never }
  /** The ingested=false filter, not all sources. IDs are unknown: requery only
   * known source IDs, without assuming which ones matched at deletion time. */
  | { kind: "source"; scope: "uningested"; ids?: never; all?: never }
)>;

/** Invalidation metadata only. Regardless of basis, receivers must requery
 * known source IDs, never mark them missing from the event alone. Page events
 * leave source facts alone. "requested" is an error-free delete response with
 * NO affected-row proof; "affected" has a positive exact count for the target. */
export type SavedDataChange = Readonly<SavedDataDeletionTarget & {
  basis: "requested" | "affected";
}>;

type Subscription = {
  owner: AccountOwnerLease;
  listener: (change: SavedDataChange) => void | Promise<void>;
};
const subscriptions = new Set<Subscription>();

/** The subscriber belongs to this account epoch, including across A -> B -> A.
 * The receiver must unsubscribe and subscribe anew when its owner epoch changes. */
export function subscribeSavedDataChanges(ownerId: string, listener: Subscription["listener"]): () => void {
  const owner = captureAccountOwnerLease(ownerId);
  if (!owner) return () => {};
  const subscription = { owner, listener };
  subscriptions.add(subscription);
  return () => { subscriptions.delete(subscription); };
}

/** Capture BEFORE the first await, including any pre-delete lookup. Call only
 * after the delete returned without error. Pass its exact affected count, or
 * "requested" for the existing count-less single-row queries. Missing/zero/short
 * counts also request a requery, without claiming which IDs vanished.
 * Empty/blank or malformed IDs invalidate the whole target; never trim IDs or widen scope.
 * No extra reads, content, logging, or changes to the deletion's result. */
export function prepareSavedDataDeletion(change: SavedDataDeletionTarget): (outcome: number | null | undefined | "requested") => void {
  const owner = captureAccountOwnerLease(change.ownerId);
  const target: SavedDataDeletionTarget = Object.freeze(change.all
    ? { ownerId: change.ownerId, kind: change.kind, all: true as const }
    : change.scope === "uningested"
      ? { ownerId: change.ownerId, kind: change.kind, scope: "uningested" as const }
      : { ownerId: change.ownerId, kind: change.kind, ids: Object.freeze([...new Set(change.ids)]) });
  return outcome => {
    if (!owner?.isCurrent()) return;
    if (target.ids && (!target.ids.length || target.ids.some(id => typeof id !== "string" || !id.trim()))) return;
    const affected = typeof outcome === "number" && Number.isSafeInteger(outcome) && outcome > 0
      && (target.ids === undefined || outcome === target.ids.length);
    const event: SavedDataChange = Object.freeze({ ...target, basis: affected ? "affected" : "requested" });
    for (const subscription of [...subscriptions]) {
      if (!owner.isCurrent()) break;
      if (!subscriptions.has(subscription) || subscription.owner.ownerId !== event.ownerId || !subscription.owner.isCurrent()) continue;
      try {
        // Fan-out is synchronous; observe later rejection without awaiting it.
        void Promise.resolve(subscription.listener(event)).catch(() => {});
      } catch { /* An observer cannot change the delete result or block other observers. */ }
    }
  };
}
