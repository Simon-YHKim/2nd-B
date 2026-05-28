// One-call ingest entrypoint: clipper markdown + URL → sources row + Storage upload.
//
// The capture UI (src/app/capture.tsx) and any future Edge Function that
// accepts a clipper payload both call this. Composes buildSourcePayload +
// uploadRawClipping + createSource into a single atomic-from-the-caller's-
// perspective operation.

import { buildSourcePayload } from "./ingest-helpers";
import { createSource } from "./queries";
import { uploadRawClipping } from "./storage";
import type { SourceKind, SourceRow } from "./types";

export interface CaptureInput {
  /** The current user's id. Storage path scopes to it; sources.user_id requires it. */
  userId: string;
  /** Raw clipper-emitted markdown (frontmatter block + body, or body only). */
  rawMd: string;
  /** Optional URL used when the frontmatter has no url/source. Drives kind detection. */
  fallbackUrl?: string | null;
  /** Force a clipper kind (e.g., "self_knowledge" for user-authored notes). */
  kindOverride?: SourceKind | null;
  /**
   * User-final tag list from the capture screen. Merged with frontmatter tags
   * (dedup, lowercased). When the user accepted the LLM suggestion as-is, this
   * is the LLM list; when they edited it, this is the edited list.
   */
  userTags?: string[] | null;
  /**
   * Wiki track selected on the capture screen ("daily" or "pro"). Written into
   * `sources.frontmatter.wiki_track` so the inbox can filter and downstream UI
   * can show the badge.
   */
  track?: "daily" | "pro" | null;
}

export interface CaptureResult {
  source: SourceRow;
  storage_path: string;
  /** True when frontmatter was parsed. False = body-only capture. */
  hadFrontmatter: boolean;
  /** Slug used for the storage path (also a sensible starting slug for the source's wiki page). */
  suggested_slug: string;
}

export async function captureFromMarkdown(input: CaptureInput): Promise<CaptureResult> {
  const built = buildSourcePayload(input.rawMd, input.fallbackUrl ?? null, input.kindOverride ?? null);

  // The body-only markdown is what we persist to Storage — the frontmatter
  // also lives in sources.frontmatter (jsonb) so we don't need to keep two
  // copies. If a future workflow wants to re-emit the original file, it can
  // joinFrontmatter() on read.
  const { path } = await uploadRawClipping(input.userId, built.suggested_slug, built.body);

  // Merge LLM-classifier output (user-final) with whatever the frontmatter
  // already carried. Tags get deduped + lowercased. Track lives in frontmatter
  // under `wiki_track` — keeps the schema flat (no new column required) and
  // matches the phase1 pattern of storing classifier metadata in jsonb.
  const mergedTags = mergeTags(built.payload.tags, input.userTags ?? null);
  const mergedFrontmatter = input.track
    ? { ...built.payload.frontmatter, wiki_track: input.track }
    : built.payload.frontmatter;

  const source = await createSource({
    user_id: input.userId,
    kind: built.payload.kind,
    title: built.payload.title,
    source_url: built.payload.source_url,
    storage_path: path,
    frontmatter: mergedFrontmatter,
    tags: mergedTags,
    simon_relevance: built.payload.simon_relevance,
  });

  return {
    source,
    storage_path: path,
    hadFrontmatter: built.hadFrontmatter,
    suggested_slug: built.suggested_slug,
  };
}

// Lowercase + trim + dedupe. Frontmatter tags come first to preserve original
// ordering; user tags append in their displayed order. Empty strings dropped.
function mergeTags(frontmatterTags: string[], userTags: string[] | null): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...frontmatterTags, ...(userTags ?? [])]) {
    const norm = raw.trim().toLowerCase();
    if (norm.length === 0 || seen.has(norm)) continue;
    seen.add(norm);
    merged.push(norm);
  }
  return merged;
}
