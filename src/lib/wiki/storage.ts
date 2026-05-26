// Supabase Storage helpers for the raw clipper markdown files.
//
// Files live under `raw-clippings/<user_id>/<slug>.md` so the storage-level
// RLS policy can use storage.foldername(name)[1] = auth.uid()::text to
// scope reads/writes per user.
//
// Bucket + RLS setup (operator task, not a migration in this repo):
//   1. Supabase Dashboard → Storage → Create bucket `raw-clippings` (private)
//   2. Storage → Policies → add owner-only SELECT/INSERT/UPDATE/DELETE
//      using `(storage.foldername(name))[1] = auth.uid()::text`
//
// The `sources.storage_path` column stores the full path (`<userId>/<slug>.md`)
// so callers can `downloadRawClipping(row.storage_path)` directly.

import { getSupabaseClient } from "../supabase/client";

const BUCKET = "raw-clippings";

/** Compose the canonical object path. Slug must already be safe (toSlug). */
export function rawClippingPath(userId: string, slug: string): string {
  return `${userId}/${slug}.md`;
}

export interface UploadOpts {
  /** When true, overwrite any existing object at the path. Default: false (error on conflict). */
  overwrite?: boolean;
}

export async function uploadRawClipping(
  userId: string,
  slug: string,
  content: string,
  opts: UploadOpts = {},
): Promise<{ path: string }> {
  const supabase = getSupabaseClient();
  const path = rawClippingPath(userId, slug);
  const { error } = await supabase.storage.from(BUCKET).upload(path, content, {
    contentType: "text/markdown; charset=utf-8",
    upsert: opts.overwrite === true,
  });
  if (error) throw error;
  return { path };
}

export async function downloadRawClipping(path: string): Promise<string> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw error;
  if (!data) throw new Error(`Empty download for ${path}`);
  return await data.text();
}

export async function deleteRawClipping(path: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
