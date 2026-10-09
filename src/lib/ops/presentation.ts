import type { OpsGroupId, OpsDomainId } from "./domains";
import type { OpsRecommendation } from "./recommend";
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
export function writeOpsPresentation(value: OpsPresentation): void { writeViewMemory(key, value); }
subscribePrivacyChanges(() => writeOpsPresentation({ group: null, domain: null, recommendations: [], adherence: null, savedKeys: [] }));
