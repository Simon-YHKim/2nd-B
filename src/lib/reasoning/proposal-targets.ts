// Which proposals still point at something the user has, and what that thing is called now.
//
// Simon 2026-10-13 (Q-261013-35). A deleted record's proposal must not come back in review, and the
// record's opening text is no longer stored with its proposal. So a proposal is shown only after its
// target was read: the title comes from the live row, a proposal whose row is gone is closed on the
// server, and a proposal whose row could not be read is held back until a later load.
//
// A proposal points at one of two tables. Looking a source id up in records (or the reverse) reports a
// live row as gone, so the lookup is chosen by refKind.

export type ProposalRefKind = "record" | "source";

export interface ProposalTargetLookup {
  /** The live row's title, or null when the row is gone. Rejects when the read itself failed. */
  record(refId: string): Promise<string | null>;
  source(refId: string): Promise<string | null>;
}

export interface StoredProposalRef {
  refKind: ProposalRefKind;
  refId: string;
  title: string;
}

export interface ProposalTargets<P> {
  /** The row exists. The title is the live row's. */
  live: P[];
  /** The row is gone (the read answered, and found nothing). */
  missing: P[];
  /** The read failed, so the row may or may not be there. */
  unreadable: P[];
}

type TargetState = "live" | "missing" | "unreadable";

export async function resolveProposalTargets<P extends StoredProposalRef>(
  proposals: readonly P[],
  lookup: ProposalTargetLookup,
): Promise<ProposalTargets<P>> {
  // Filled by index so the stored order holds whatever order the reads finish in.
  const states = proposals.map((): TargetState => "unreadable");
  const titles = proposals.map((): string => "");
  await Promise.all(
    proposals.map(async (proposal, index) => {
      try {
        const title =
          proposal.refKind === "record"
            ? await lookup.record(proposal.refId)
            : await lookup.source(proposal.refId);
        if (title === null) {
          states[index] = "missing";
        } else {
          states[index] = "live";
          titles[index] = title;
        }
      } catch {
        states[index] = "unreadable";
      }
    }),
  );
  const targets: ProposalTargets<P> = { live: [], missing: [], unreadable: [] };
  proposals.forEach((proposal, index) => {
    if (states[index] === "live") targets.live.push({ ...proposal, title: titles[index] });
    else if (states[index] === "missing") targets.missing.push(proposal);
    else targets.unreadable.push(proposal);
  });
  return targets;
}

export interface RunProposalRef extends StoredProposalRef {
  runId: string;
  ordinal: number;
}

export interface ReviewReady<P> {
  /** What review may show. */
  live: P[];
  /** How many were held back because their target could not be read. */
  unreadable: number;
}

/**
 * Everything review shows goes through here. A proposal whose target is gone is dismissed on the
 * server, run by run, so its run can close: a hidden ordinal that nobody decides keeps the run
 * 'proposed' forever. A proposal whose target could not be read is neither shown nor dismissed, so
 * the next load decides it. A failed dismiss leaves the rows as they were, for the next load.
 */
export async function prepareProposalsForReview<P extends RunProposalRef>(
  proposals: readonly P[],
  lookup: ProposalTargetLookup,
  dismissMissing: (runId: string, ordinals: number[]) => Promise<void>,
): Promise<ReviewReady<P>> {
  const targets = await resolveProposalTargets(proposals, lookup);
  const byRun = new Map<string, number[]>();
  for (const proposal of targets.missing) {
    const ordinals = byRun.get(proposal.runId);
    if (ordinals) ordinals.push(proposal.ordinal);
    else byRun.set(proposal.runId, [proposal.ordinal]);
  }
  await Promise.all(
    [...byRun].map(async ([runId, ordinals]) => {
      try {
        await dismissMissing(runId, ordinals);
      } catch {
        // Still hidden. The rows stay 'proposed' and the next load tries again.
      }
    }),
  );
  return { live: targets.live, unreadable: targets.unreadable.length };
}

/**
 * A finished run may put its result on screen only while it is still the run the screen is waiting
 * for. Reading the targets takes time, and meanwhile the user can cancel, start another run, or the
 * account can change. So the question is asked AFTER the read, and a result that is no longer the
 * screen's comes back as null: the caller writes nothing.
 */
export async function settleRunForReview<P>(
  produced: readonly P[],
  prepare: (proposals: readonly P[]) => Promise<ReviewReady<P>>,
  stillCurrent: () => boolean,
): Promise<ReviewReady<P> | null> {
  const ready = await prepare(produced);
  return stillCurrent() ? ready : null;
}
