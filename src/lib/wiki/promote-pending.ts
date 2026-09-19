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
//
// A deletion can land between the listing and the upload (R30, JA-1839-1): the
// full wipe used to empty the folder, report done, and then watch this module
// put the old body back and "clear" a row that no longer existed (a 0-row
// UPDATE read as success). So each row is re-read right before its upload and
// skipped when it is gone, repointed, no longer pending, or claimed by an
// erasure; the flags are cleared only through a write that sees the row still
// there (clearStoragePending, wiki/source-erasure.ts); and when that clear does
// not land the upload is taken back unless a row that still needs the object
// points at it. An app killed between the upload and that take-back can still
// leave the object behind - closing that needs the server-side fence.

import { getSource, listStoragePendingSources } from "./queries";
import { storageSafeSlug } from "./slug";
import { rawClippingPath, uploadRawClipping } from "./storage";
import { clearStoragePending, isSourceBeingErased, removeRawClippingUnlessHeld } from "./source-erasure";

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
      // The listing can be stale by now: never upload for a row that is gone,
      // repointed, already promoted elsewhere, or being erased.
      const current = await getSource(userId, row.id);
      if (
        !current
        || current.storage_path !== row.storage_path
        || current.frontmatter?._storage_pending !== true
        || isSourceBeingErased(current.frontmatter)
      ) continue;
    } catch {
      continue; // Could not re-read — retry later rather than upload blind.
    }
    try {
      // overwrite: the original upload may have actually landed (client-side
      // timeout after a server-side success) — promotion must be idempotent.
      await uploadRawClipping(userId, slug, body, { overwrite: true });
    } catch {
      continue; // Storage still unavailable — keep the fallback, retry later.
    }
    try {
      if ((await clearStoragePending(userId, row.id, row.storage_path, healedPath)) === "cleared") {
        promoted++;
        continue;
      }
    } catch (e) {
      // Fall through: whether the row still exists is unknown, and the take-back
      // below keeps the object whenever a row that needs it is still there.
      if (typeof console !== "undefined") console.warn("[promote-pending] flag clear failed", e);
    }
    // The flags did not clear: the row went away, an erasure claimed it, or it
    // moved. Take the upload back unless a row that still needs it points at it.
    try {
      await removeRawClippingUnlessHeld(userId, healedPath ?? row.storage_path);
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[promote-pending] upload take-back failed", e);
    }
  }
  return { pending: rows.length, promoted };
}
