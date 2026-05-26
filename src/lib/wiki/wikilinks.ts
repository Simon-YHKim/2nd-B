// Parse Obsidian-style [[wikilinks]] out of markdown bodies.
//
// Supported forms (mirroring Obsidian):
//   [[Page Name]]                  → target "Page Name"
//   [[Page Name|alias]]            → target "Page Name", display "alias"
//   [[Page Name#Heading]]          → target "Page Name" (heading dropped)
//   [[Page Name#^block-id]]        → target "Page Name" (block ref dropped)
//   [[Page Name#Heading|alias]]    → target "Page Name", display "alias"
//
// Ignored:
//   - Fenced code blocks (``` … ```)
//   - Inline code spans (`…`)
//   - Markdown links [text](url) — not a wikilink
//   - Image links ![alt](src)     — not a wikilink

import { toSlug } from "./slug";

export interface Wikilink {
  /** Canonical slug derived from the target name (run through toSlug). */
  slug: string;
  /** The raw target name as written, with #heading and #^block dropped. */
  target: string;
  /** Pipe-aliased display text, when present. */
  display: string | null;
}

const WIKILINK_RE = /\[\[([^\[\]]+?)\]\]/g;

function stripCode(body: string): string {
  // Strip fenced blocks first (``` … ``` or ~~~ … ~~~), then inline `…`.
  // Greedy-but-bounded so we don't accidentally eat the whole document on
  // an unmatched fence.
  return body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "")
    .replace(/`[^`\n]*`/g, "");
}

function splitTargetAndDisplay(inner: string): { target: string; display: string | null } {
  const pipeIdx = inner.indexOf("|");
  if (pipeIdx === -1) return { target: inner.trim(), display: null };
  const target = inner.slice(0, pipeIdx).trim();
  const display = inner.slice(pipeIdx + 1).trim();
  return { target, display: display.length > 0 ? display : null };
}

function dropFragment(target: string): string {
  // Drop "#heading" and "#^block-id". Obsidian's anchor syntax — we just
  // want the page identifier for the link graph.
  const hashIdx = target.indexOf("#");
  return hashIdx === -1 ? target : target.slice(0, hashIdx).trim();
}

/** Every wikilink occurrence in order (duplicates preserved). */
export function parseWikilinks(body: string): Wikilink[] {
  const cleaned = stripCode(body);
  const out: Wikilink[] = [];
  for (const m of cleaned.matchAll(WIKILINK_RE)) {
    const { target: rawTarget, display } = splitTargetAndDisplay(m[1]);
    const target = dropFragment(rawTarget);
    if (target.length === 0) continue;
    const slug = toSlug(target);
    if (slug.length === 0) continue;
    out.push({ slug, target, display });
  }
  return out;
}

/** Unique slug set for resolving against wiki_pages (user_id, slug). */
export function extractWikilinkSlugs(body: string): string[] {
  const seen = new Set<string>();
  for (const link of parseWikilinks(body)) seen.add(link.slug);
  return [...seen];
}
