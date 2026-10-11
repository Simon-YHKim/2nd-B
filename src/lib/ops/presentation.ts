import type { OpsGroupId, OpsDomainId } from "./domains";
import type { OpsRecommendation } from "./recommend";
import { currentAccountOwner } from "../auth/account-epoch";
import { readViewMemory, writeViewMemory } from "../nav/view-memory";
import { subscribePrivacyChanges } from "../privacy/changes";

export interface OpsPresentation {
  group: OpsGroupId | null;
  domain: OpsDomainId | null;
  recommendations: OpsRecommendation[];
  adherence: string | null;
  savedKeys: string[];
}
const key = "ops-presentation";
export function readOpsPresentation(): OpsPresentation {
  return readViewMemory<OpsPresentation>(key) ?? { group: null, domain: null, recommendations: [], adherence: null, savedKeys: [] };
}
function writeOpsPresentation(value: OpsPresentation): void { writeViewMemory(key, value); }
/** Keeps a snapshot only for the account it was loaded for: the screen can render once for the
 *  next account while its state still holds the previous account's recommendations. */
export function writeOpsPresentationFor(snapshotOwner: string | null, value: OpsPresentation): void {
  if (!snapshotOwner || snapshotOwner !== currentAccountOwner()) return;
  writeOpsPresentation(value);
}
subscribePrivacyChanges(() => writeOpsPresentation({ group: null, domain: null, recommendations: [], adherence: null, savedKeys: [] }));
