export interface NavGraphMemoDataNode {
  id: string;
  title: string;
  parentId?: string;
  tags?: readonly string[];
  summary?: string;
}

export interface NavGraphMemoProps {
  locale: "en" | "ko";
  dataNodes: readonly NavGraphMemoDataNode[];
  highlightId?: string | null;
  glowNodeId?: string | null;
  onFirstInteraction?: () => void;
  onActiveChange?: (sheetOpen: boolean) => void;
}

export function areNavGraphPropsEqual(prev: NavGraphMemoProps, next: NavGraphMemoProps): boolean {
  return (
    prev.locale === next.locale &&
    prev.highlightId === next.highlightId &&
    prev.glowNodeId === next.glowNodeId &&
    prev.onFirstInteraction === next.onFirstInteraction &&
    prev.onActiveChange === next.onActiveChange &&
    sameNavGraphDataNodes(prev.dataNodes, next.dataNodes)
  );
}

export function sameNavGraphDataNodes(
  prev: readonly NavGraphMemoDataNode[],
  next: readonly NavGraphMemoDataNode[],
): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    const left = prev[i];
    const right = next[i];
    if (
      left.id !== right.id ||
      left.title !== right.title ||
      left.parentId !== right.parentId ||
      left.summary !== right.summary ||
      !sameStringList(left.tags ?? [], right.tags ?? [])
    ) {
      return false;
    }
  }
  return true;
}

function sameStringList(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
