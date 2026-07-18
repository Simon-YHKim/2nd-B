// Recovery path for capture's BEST-EFFORT Storage upload (capture.ts): when
// the upload failed, the body was stashed in frontmatter._body_fallback with
// _storage_pending=true. That keeps the piece durable, but inline jsonb is
// not where clipping bodies belong, and Phase-2 generation reads the Storage
// copy. Until this module existed the fallback was a dead end — the comment
// in capture.ts promised "a re-upload can recover it later" with no code
// behind it (2026-06-10 audit, cycle-1 punch list #2).
//
// promotePendingUploads re-uploads pending bodies and clears the flags.
// Called opportunistically (inbox load); every step is best-effort and
// bounded, so a still-broken bucket just means "try again next time".

import { listStoragePendingSources, updateSourceFrontmatter } from "./queries";
import { storageSafeSlug } from "./slug";
import { rawClippingPath, uploadRawClipping } from "./storage";

export interface PromoteResult {
  /** Pending rows seen this run (bounded by the query limit). */
  pending: number;
  /** Rows whose body reached Storage AND whose flags were cleared. */
  promoted: number;
}

// storage_path is "{userId}/{slug}.md" (rawClippingPath). Deriving the slug
// back from the stored path keeps the canonical path stable instead of
// re-slugging the title (which could drift).
function slugFromStoragePath(path: string): string | null {
  const m = /^[^/]+\/(.+)\.md$/.exec(path);
  return m ? m[1] : null;
}

export async function promotePendingUploads(userId: string): Promise<PromoteResult> {
  const rows = await listStoragePendingSources(userId);
  let promoted = 0;
  for (const row of rows) {
    const fm = (row.frontmatter ?? {}) as Record<string, unknown>;
    const body = fm._body_fallback;
    const storedSlug = slugFromStoragePath(row.storage_path);
    if (typeof body !== "string" || body.length === 0 || !storedSlug) continue;
    // Pre-fix rows carry a Hangul storage key that Storage rejects with 400
    // "Invalid key" — retrying it verbatim would stay pending forever. Promote
    // to the ASCII-safe key instead and repoint storage_path in the same write.
    const slug = storageSafeSlug(storedSlug);
    const healedPath = slug === storedSlug ? undefined : rawClippingPath(userId, slug);
    try {
      // overwrite: the original upload may have actually landed (client-side
      // timeout after a server-side success) — promotion must be idempotent.
      await uploadRawClipping(userId, slug, body, { overwrite: true });
    } catch {
      continue; // Storage still unavailable — keep the fallback, retry later.
    }
    const { _storage_pending, _body_fallback, ...rest } = fm;
    void _storage_pending;
    void _body_fallback;
    try {
      if (healedPath) await updateSourceFrontmatter(userId, row.id, rest, healedPath);
      else await updateSourceFrontmatter(userId, row.id, rest);
      promoted++;
    } catch (e) {
      // Upload landed but the flag didn't clear — next run re-uploads the
      // same body (idempotent overwrite), so nothing is lost.
      if (typeof console !== "undefined") console.warn("[promote-pending] flag clear failed", e);
    }
  }
  return { pending: rows.length, promoted };
}
