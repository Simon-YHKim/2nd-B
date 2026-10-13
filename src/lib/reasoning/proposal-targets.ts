// Which stored proposals still point at something the user has, and what that thing is called now.
//
// Simon 2026-10-13 (Q-261013-35). A deleted record's proposal must not come back in review, and the
// record's opening text is no longer stored with its proposal. So a stored proposal carries no title:
// the title is read from the live row, and a proposal whose row is gone is not shown.
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

export async function resolveLiveProposals<P extends StoredProposalRef>(
  proposals: readonly P[],
  lookup: ProposalTargetLookup,
  unreadTitle: (refKind: ProposalRefKind) => string,
): Promise<P[]> {
  // Filled by index so the stored order holds whatever order the reads finish in.
  const resolved: (P | null)[] = proposals.map(() => null);
  await Promise.all(
    proposals.map(async (proposal, index) => {
      try {
        const title =
          proposal.refKind === "record"
            ? await lookup.record(proposal.refId)
            : await lookup.source(proposal.refId);
        resolved[index] = title === null ? null : { ...proposal, title };
      } catch {
        // The read failed, so the row may still be there: keep the proposal under a neutral name.
        // The stored title is never the fallback - on older rows it is the record's opening text.
        resolved[index] = { ...proposal, title: unreadTitle(proposal.refKind) };
      }
    }),
  );
  return resolved.filter((proposal): proposal is P => proposal !== null);
}
