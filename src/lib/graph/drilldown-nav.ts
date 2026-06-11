import type { WorkerId } from "@/components/art/WorkerSprite";
import { depthStyleForTier, type DepthStyle } from "@/lib/graph/depth-style";
import { VILLAGE_IDS, type VillageId } from "@/lib/graph/relatedness";
import { VILLAGE_UI } from "@/lib/village-ui";

export type PatternCoreId = VillageId;

export type DrilldownState =
  | { mode: "overview" }
  | { mode: "core"; coreId: PatternCoreId; selectedDataId: string | null };

export interface DrilldownDataLike {
  id: string;
  parentId?: string;
}

export interface DrilldownRenderStyle extends DepthStyle {
  scale: number;
}

export const OVERVIEW_DRILLDOWN_STATE: DrilldownState = { mode: "overview" };

export const CORE_CHARACTER: Record<PatternCoreId, WorkerId> = {
  work: VILLAGE_UI.work.worker,
  relation: VILLAGE_UI.relation.worker,
  knowledge: VILLAGE_UI.knowledge.worker,
  records: VILLAGE_UI.records.worker,
  taste: VILLAGE_UI.taste.worker,
  rhythm: VILLAGE_UI.rhythm.worker,
};

export function isPatternCoreId(id: string | null | undefined): id is PatternCoreId {
  return VILLAGE_IDS.includes(id as PatternCoreId);
}

export function enterCoreDrilldown(
  coreId: PatternCoreId,
  dataIds: readonly string[] = [],
): DrilldownState {
  return {
    mode: "core",
    coreId,
    selectedDataId: dataIds[0] ?? null,
  };
}

export function selectDrilldownData(state: DrilldownState, dataId: string): DrilldownState {
  if (state.mode !== "core") return state;
  return { ...state, selectedDataId: dataId };
}

export function exitDrilldown(): DrilldownState {
  return OVERVIEW_DRILLDOWN_STATE;
}

export function drilldownCharacterForCore(coreId: PatternCoreId): WorkerId {
  return CORE_CHARACTER[coreId];
}

export function drilldownDataForCore<T extends DrilldownDataLike>(
  coreId: PatternCoreId,
  nodes: readonly T[],
): T[] {
  return nodes.filter((node) => node.parentId === coreId);
}

export function resolveDrilldownSelectedDataId(
  selectedDataId: string | null,
  nodes: readonly DrilldownDataLike[],
): string | null {
  if (selectedDataId && nodes.some((node) => node.id === selectedDataId)) return selectedDataId;
  return nodes[0]?.id ?? null;
}

export function drilldownDepthStyle(
  role: "focusedCore" | "focusedData" | "receded",
  tier: 1 | 2 | 3 | 4,
): DrilldownRenderStyle {
  const base = depthStyleForTier(tier);
  if (role === "focusedCore") {
    return { saturate: base.saturate, opacity: base.opacity, scale: 1.55 };
  }
  if (role === "focusedData") {
    return { saturate: base.saturate, opacity: base.opacity, scale: 1 };
  }
  return {
    saturate: Math.max(0.46, base.saturate * 0.72),
    opacity: Math.max(0.12, base.opacity * 0.18),
    scale: 0.82,
  };
}
