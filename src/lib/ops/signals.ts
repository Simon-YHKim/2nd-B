// Ops SUGGEST signals (O-R3 effectiveness upgrade). Turns the user's OWN routine
// + completion ledger into a compact ADHERENCE summary so a recommendation can
// adapt to what the user actually does — propose a small stretch when they are
// consistent, an easier/smaller version when they are slipping — instead of
// repeating generic best practice every run.
//
// Why this is safe and cheap:
//   - No LLM, no new table. Reuses ops_routines + ops_routine_logs (the manage
//     layer) and the existing weekStreak helper. $0.
//   - Aggregates ONLY: counts, the window length, and the streak number. No
//     routine titles, no checklist text, no journal — nothing a model could
//     quote back. It is the user's own deterministic ledger, so recommend.ts
//     passes it as a TRUSTED fact line (outside <UNTRUSTED>): there is no
//     third-party text here to inject with.
//   - The gather is best-effort: any read failure degrades to "" so the
//     recommendation still runs (the signal is an enhancement, never a gate).
//
// The pure summarizer is separated from the Supabase reads so it is node-testable
// without a client (same discipline as routines.ts).

import {
  listActiveRoutines,
  listCompletionsSince,
  localDayKey,
  weekStreak,
} from "./routines";
import type { OpsRoutine, OpsRoutineLog } from "./routines";
import type { OpsDomainId } from "./domains";

export const ADHERENCE_WINDOW_DAYS = 7;

/** The set of local YYYY-MM-DD day keys for the last `n` days ending today. */
function lastNDayKeys(now: Date, n: number): Set<string> {
  const out = new Set<string>();
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i < n; i++) {
    out.add(localDayKey(cursor));
    cursor.setDate(cursor.getDate() - 1);
  }
  return out;
}

/** The oldest day key in the window — the `since` bound for the log query. */
export function adherenceSinceKey(now: Date, windowDays = ADHERENCE_WINDOW_DAYS): string {
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  cursor.setDate(cursor.getDate() - (windowDays - 1));
  return localDayKey(cursor);
}

/**
 * Pure: build the deterministic adherence fact line for one domain, or "" when
 * the domain has no managed routines yet (nothing to ground on). Output is a
 * single English line (EN is the model anchor / canonical), e.g.
 *   "Recent adherence (last 7d): 5/7 days done; current streak 3d; 2 active routine(s)."
 */
export function summarizeAdherence(
  domainId: OpsDomainId,
  routines: ReadonlyArray<Pick<OpsRoutine, "id" | "domain_id">>,
  logs: ReadonlyArray<Pick<OpsRoutineLog, "routine_id" | "completed_on">>,
  now: Date = new Date(),
  windowDays = ADHERENCE_WINDOW_DAYS,
): string {
  const domainRoutines = routines.filter((r) => r.domain_id === domainId);
  if (domainRoutines.length === 0) return "";

  const ids = new Set(domainRoutines.map((r) => r.id));
  const domainLogs = logs.filter((l) => ids.has(l.routine_id));
  const window = lastNDayKeys(now, windowDays);

  // Distinct calendar days inside the window that have at least one completion
  // (two routines ticked the same day still count as one "done" day).
  const doneDays = new Set(
    domainLogs.map((l) => l.completed_on).filter((d) => window.has(d)),
  );
  const completedDays = doneDays.size;
  const streak = weekStreak(domainLogs, now);

  return `Recent adherence (last ${windowDays}d): ${completedDays}/${windowDays} days done; current streak ${streak}d; ${domainRoutines.length} active routine(s).`;
}

/**
 * Best-effort gather of the adherence signal for recommend.ts. Reads the user's
 * active routines + recent completions (RLS owner-only) and summarizes them.
 * Any failure returns "" so the recommendation run is never blocked by it.
 */
export async function gatherAdherenceSignal(
  userId: string,
  domainId: OpsDomainId,
  now: Date = new Date(),
  windowDays = ADHERENCE_WINDOW_DAYS,
): Promise<string> {
  try {
    const since = adherenceSinceKey(now, windowDays);
    const [routines, logs] = await Promise.all([
      listActiveRoutines(userId),
      listCompletionsSince(userId, since),
    ]);
    return summarizeAdherence(domainId, routines, logs, now, windowDays);
  } catch {
    return "";
  }
}
