import { VILLAGE_IDS, type VillageId } from "@/lib/graph/relatedness";

export interface OverviewCardNode {
  id: string;
  parentId?: string | null;
  createdAt?: string | number | Date | null;
  title?: string | null;
}

export interface OverviewCardSignals {
  recentCore: VillageId | null;
  recentPiece: { id: string; title: string } | null;
  sparseCore: VillageId | null;
}

function isVillageId(value: string | null | undefined): value is VillageId {
  return VILLAGE_IDS.includes(value as VillageId);
}

function createdTime(value: OverviewCardNode["createdAt"]): number | null {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : null;
  }
  return null;
}

function newestNode(nodes: readonly OverviewCardNode[]): OverviewCardNode | null {
  let best: OverviewCardNode | null = null;
  let bestTime = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    const time = createdTime(node.createdAt);
    if (!best) {
      best = node;
      if (time !== null) bestTime = time;
      continue;
    }
    if (time !== null && time > bestTime) {
      best = node;
      bestTime = time;
    }
  }
  return best;
}

function pieceTitle(node: OverviewCardNode): string {
  const title = typeof node.title === "string" ? node.title.trim() : "";
  return title.length > 0 ? title : node.id;
}

function sparsestCore(nodes: readonly OverviewCardNode[]): VillageId | null {
  if (nodes.length === 0) return null;
  const counts = new Map<VillageId, number>(VILLAGE_IDS.map((id) => [id, 0]));
  for (const node of nodes) {
    if (isVillageId(node.parentId)) {
      counts.set(node.parentId, (counts.get(node.parentId) ?? 0) + 1);
    }
  }

  let best = VILLAGE_IDS[0];
  let bestCount = counts.get(best) ?? 0;
  for (const id of VILLAGE_IDS.slice(1)) {
    const count = counts.get(id) ?? 0;
    if (count < bestCount) {
      best = id;
      bestCount = count;
    }
  }
  return best;
}

export function overviewCardSignals(nodes: readonly OverviewCardNode[]): OverviewCardSignals {
  const recent = newestNode(nodes);
  return {
    recentCore: isVillageId(recent?.parentId) ? recent.parentId : null,
    recentPiece: recent ? { id: recent.id, title: pieceTitle(recent) } : null,
    sparseCore: sparsestCore(nodes),
  };
}
