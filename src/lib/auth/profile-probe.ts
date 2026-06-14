export interface ProfileProbe {
  hasProfile: boolean;
  isMinor: boolean | null;
}

export function preserveKnownMinorForMissingProfile(probe: ProfileProbe, previous: ProfileProbe | null): ProfileProbe {
  if (probe.hasProfile || previous?.isMinor === null || previous?.isMinor === undefined) return probe;
  return { ...probe, isMinor: previous.isMinor };
}
