// Supabase-backed GateDeps for runIngestGate / the capture wiring. Keeps the
// DB access out of gate.ts (which stays pure) — this is the only ingest file
// that touches Supabase, via the queries.ts wrappers (RLS-scoped to the user).

import { findIngestCandidates, recordIngestDrop } from "../wiki/queries";
import type { GateDeps, IngestCandidate, IngestDropRecord } from "./gate";

/**
 * Build GateDeps for one user: candidate fetch (exact hash + LSH band overlap)
 * and drop-record append, both scoped to `userId` and honoring an optional
 * abort signal from the capture submit flow.
 */
export function makeSupabaseGateDeps(userId: string, signal?: AbortSignal): GateDeps {
  return {
    findCandidates: async (bandKeys: string[], contentHash: string): Promise<IngestCandidate[]> => {
      const rows = await findIngestCandidates(userId, bandKeys, contentHash, signal);
      return rows.map((r) => ({
        id: r.id,
        contentHash: r.content_hash ?? "",
        signature: r.dedup_signature ?? undefined,
      }));
    },
    recordDrop: (row: IngestDropRecord): Promise<void> =>
      recordIngestDrop(
        {
          user_id: userId,
          content_hash: row.content_hash,
          stage: row.stage,
          reason: row.reason,
          survivor_id: row.survivor_id,
        },
        signal,
      ),
  };
}
