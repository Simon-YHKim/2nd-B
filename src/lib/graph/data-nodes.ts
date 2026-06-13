import { domainForTags } from "@/lib/graph/relatedness";

export interface GraphSourceRow {
  id: string;
  title: string;
  tags: readonly string[] | null;
  frontmatter: Record<string, unknown> | null;
}

export interface GraphDataNode {
  id: string;
  title: string;
  parentId?: string;
  tags?: readonly string[];
  summary?: string;
}

export function sourceRowsToDataNodes(sources: readonly GraphSourceRow[]): GraphDataNode[] {
  return sources.map((p) => {
    const tags = (p.tags ?? []) as readonly string[];
    const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
    const summary = typeof fm.summary === "string" ? fm.summary : "";
    return {
      id: p.id,
      title: p.title,
      parentId: domainForTags(tags, p.title),
      tags,
      summary,
    };
  });
}

export function sameDataNodes(a: readonly GraphDataNode[], b: readonly GraphDataNode[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
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

export function retainStableDataNodes<T extends readonly GraphDataNode[]>(previous: T, next: T): T {
  return sameDataNodes(previous, next) ? previous : next;
}

function sameStringList(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
