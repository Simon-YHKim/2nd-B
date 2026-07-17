export interface ProfileProbe {
  hasProfile: boolean;
  isMinor: boolean | null;
  /** True when this probe FAILED (DB error / timeout) rather than answered.
   *  hasProfile:false then means "unknown", not "confirmed missing" — screens
   *  that eject to /complete-profile on false must hold and retry instead of
   *  stranding a real account on a network blip (flow-map /secondb). */
  probeFailed?: boolean;
}

export function preserveKnownMinorForMissingProfile(probe: ProfileProbe, previous: ProfileProbe | null): ProfileProbe {
  if (probe.hasProfile || previous?.isMinor === null || previous?.isMinor === undefined) return probe;
  return { ...probe, isMinor: previous.isMinor };
}
