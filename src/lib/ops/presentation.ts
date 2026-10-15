import type { OpsGroupId, OpsDomainId } from "./domains";
import type { OpsRecommendation } from "./recommend";
import { randomUUID } from "expo-crypto";
import { currentAccountOwner } from "../auth/account-epoch";
import { readViewMemory, writeViewMemory } from "../nav/view-memory";
import { subscribePrivacyChanges } from "../privacy/changes";

export interface OpsPresentation {
  group: OpsGroupId | null;
  domain: OpsDomainId | null;
  recommendations: OpsRecommendation[];
  adherence: string | null;
  savedKeys: string[];
  /** Session-local IDs, aligned with this recommendation list. Absent in older snapshots. */
  routineIds?: string[];
}
const key = "ops-presentation";
export function readOpsPresentation(): OpsPresentation {
  return readViewMemory<OpsPresentation>(key) ?? { group: null, domain: null, recommendations: [], adherence: null, savedKeys: [] };
}
/** Keeps a snapshot only for the account it was loaded for: the screen can render once for the
 *  next account while its state still holds the previous account's recommendations. */
export function writeOpsPresentationFor(snapshotOwner: string | null, value: OpsPresentation): void {
  if (!snapshotOwner || snapshotOwner !== currentAccountOwner()) return;
  const prior = readOpsPresentation();
  // A new list is a new set of suggestions, even if its text/indexes are identical.
  // Ignore IDs supplied by callers: only the current account's same list may reuse them.
  const sameList = prior.domain === value.domain && prior.recommendations === value.recommendations;
  const routineIds = value.domain && value.recommendations.length > 0
    ? value.recommendations.map((_, index) => (sameList ? prior.routineIds?.[index] : undefined) ?? randomUUID())
    : undefined;
  writeViewMemory(key, { ...value, routineIds });
}

/** Commit the ID before the request starts, so leaving during an uncertain save is retryable. */
export function opsRecommendationRoutineId(
  ownerId: string, domain: OpsDomainId, recommendations: OpsRecommendation[], index: number,
): string | null {
  if (ownerId !== currentAccountOwner()) return null;
  const prior = readOpsPresentation();
  if (prior.domain !== domain || prior.recommendations !== recommendations || !recommendations[index]) return null;
  if (!prior.routineIds?.[index]) writeOpsPresentationFor(ownerId, prior);
  return readOpsPresentation().routineIds?.[index] ?? null;
}
// A change published for one account, arriving after a switch, must not clear the next account's snapshot.
subscribePrivacyChanges((change) => writeOpsPresentationFor(change.ownerId,
  { group: null, domain: null, recommendations: [], adherence: null, savedKeys: [] }));
