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

  const source = await createSource({
    user_id: input.userId,
    kind: built.payload.kind,
    title: built.payload.title,
    source_url: built.payload.source_url,
    storage_path: path,
    frontmatter: built.payload.frontmatter,
    tags: built.payload.tags,
    simon_relevance: built.payload.simon_relevance,
  });

  return {
    source,
    storage_path: path,
    hadFrontmatter: built.hadFrontmatter,
    suggested_slug: built.suggested_slug,
  };
}
