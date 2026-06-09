// Pure transforms that bridge raw clipper markdown → DB-ready insert payloads.
//
// The ingest pipeline (PR 2-3) will call these as the first step of each
// capture: clipper-emitted markdown comes in, a SourceRow-shaped payload
// and the body-only markdown come out. No DB or LLM dependencies.

import { detectClipperKind } from "./clipper-kind";
import { extractCommonFields, splitFrontmatter } from "./frontmatter";
import { slugForTitle } from "./slug";
import type { SourceKind } from "./types";

export interface SourcePayload {
  /** Discriminator for the 8 clipper templates. */
  kind: SourceKind;
  /** Display title — frontmatter.title, falling back to first markdown heading, then "(untitled)". */
  title: string;
  /** Original URL — frontmatter.url/source, falling back to the caller-provided URL. */
  source_url: string | null;
  /** Full frontmatter object (as parsed by yaml). */
  frontmatter: Record<string, unknown>;
  /** Deduplicated tag list — frontmatter.tags only, no inference for now. */
  tags: string[];
  /** 1..5 relevance score from clipper, or null. */
  simon_relevance: number | null;
}

export interface BuiltSource {
  payload: SourcePayload;
  /** Markdown body with the frontmatter block stripped. */
  body: string;
  /** True when the input had a parseable `--- … ---` block. */
  hadFrontmatter: boolean;
  /** Slug suggestion derived from the title (caller can override). */
  suggested_slug: string;
}

const H1_RE = /^#\s+(.+?)\s*$/m;

function pickTitle(fm: Record<string, unknown>, body: string): string {
  const fmTitle = typeof fm.title === "string" ? fm.title.trim() : "";
  if (fmTitle.length > 0) return fmTitle;
  const h1 = body.match(H1_RE);
  if (h1) return h1[1].trim();
  return "(untitled)";
}

function dedupTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const trimmed = t.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Normalize raw clipper-emitted markdown into a SourceRow-shaped payload
 * plus the body, ready for `sources` INSERT.
 *
 * - `fallbackUrl` is used only when the frontmatter doesn't carry url/source.
 *   Most clipper templates do, so callers can pass null.
 * - `kindOverride` lets callers force "self_knowledge" (the one template
 *   that isn't URL-detectable since it's user-authored, not clipped).
 */
export function buildSourcePayload(
  rawMd: string,
  fallbackUrl: string | null = null,
  kindOverride: SourceKind | null = null,
): BuiltSource {
  const { frontmatter, body, hadFrontmatter } = splitFrontmatter(rawMd);
  const common = extractCommonFields(frontmatter);

  const sourceUrl = common.url ?? fallbackUrl;
  const kind: SourceKind = kindOverride ?? (sourceUrl ? detectClipperKind(sourceUrl) : "inbox");

  const title = pickTitle(frontmatter, body);
  const tags = dedupTags(common.tags);

  return {
    payload: {
      kind,
      title,
      source_url: sourceUrl,
      frontmatter,
      tags,
      simon_relevance: common.simon_relevance,
    },
    body,
    hadFrontmatter,
    suggested_slug: slugForTitle(title),
  };
}
