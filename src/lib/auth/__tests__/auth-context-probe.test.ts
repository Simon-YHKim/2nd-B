import { preserveKnownMinorForMissingProfile } from "../profile-probe";

describe("AuthContext profile probe preservation", () => {
  test("missing-profile re-probe keeps known minor truth for the same user", () => {
    const previous = { hasProfile: true, isMinor: true };
    const refreshed = { hasProfile: false, isMinor: null };

    expect(preserveKnownMinorForMissingProfile(refreshed, previous)).toEqual({
      hasProfile: false,
      isMinor: true,
    });
  });

  test("missing-profile re-probe keeps known adult truth for the same user", () => {
    const previous = { hasProfile: true, isMinor: false };
    const refreshed = { hasProfile: false, isMinor: null };

    expect(preserveKnownMinorForMissingProfile(refreshed, previous)).toEqual({
      hasProfile: false,
      isMinor: false,
    });
  });

  test("unknown previous minor state stays unknown", () => {
    const previous = { hasProfile: true, isMinor: null };
    const refreshed = { hasProfile: false, isMinor: null };

    expect(preserveKnownMinorForMissingProfile(refreshed, previous)).toEqual(refreshed);
  });

  test("real profile probes are not rewritten", () => {
    const previous = { hasProfile: false, isMinor: true };
    const refreshed = { hasProfile: true, isMinor: false };

    expect(preserveKnownMinorForMissingProfile(refreshed, previous)).toEqual(refreshed);
  });

  test("a FAILED probe keeps its flag through minor preservation", () => {
    // probeFailed marks hasProfile:false as "unknown", not "confirmed missing" —
    // screens hold + retry on it instead of ejecting to /complete-profile.
    const previous = { hasProfile: true, isMinor: true };
    const refreshed = { hasProfile: false, isMinor: null, probeFailed: true };

    expect(preserveKnownMinorForMissingProfile(refreshed, previous)).toEqual({
      hasProfile: false,
      isMinor: true,
      probeFailed: true,
    });
  });
});
