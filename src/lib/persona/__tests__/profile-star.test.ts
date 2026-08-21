// L3/L4: the profile star's brightness rules.
//
// These pin the two properties that make this star an improvement over the
// museum slot it replaced, rather than a rename. Museum was a hardcoded L4 that
// never moved; profile has to earn every tier, and it must not be able to reach
// the top without something the user did not type themselves.
import { profileStarLevel, profileCrossSource } from "../profile-star";

const NONE = { hasDisplayName: false, hasBirthDate: false, hasGoal: false };

describe("profileStarLevel", () => {
  it("is dark for an account that filled in nothing", () => {
    expect(profileStarLevel(NONE)).toBe(1);
  });

  it("lights to L2 from onboarding alone", () => {
    // The reason the name and goal fields were added to onboarding at all: a new
    // account should not land on a home screen with a star that means nothing.
    expect(profileStarLevel({ hasDisplayName: true, hasBirthDate: true, hasGoal: true })).toBe(2);
  });

  it("counts a birth date even when name and goal were skipped", () => {
    // Both new fields are optional, so this is the real floor for anyone who
    // finished onboarding. Still lit, just barely.
    expect(profileStarLevel({ ...NONE, hasBirthDate: true })).toBe(2);
  });

  it("reaches L3 once editing starts", () => {
    expect(
      profileStarLevel({ hasDisplayName: true, hasBirthDate: true, hasGoal: true, editedEntries: 2 }),
    ).toBe(3);
  });

  it("cannot reach L5 on the user's own input alone", () => {
    // The point of the whole design: a page about how others read you should not
    // be able to max out with nobody else having read it. 40 self-entries still
    // stops at the volume band.
    const level = profileStarLevel({
      hasDisplayName: true,
      hasBirthDate: true,
      hasGoal: true,
      editedEntries: 40,
    });
    expect(level).toBe(4);
    expect(level).toBeLessThan(5);
  });

  it("opens L5 only when an outside observation exists", () => {
    expect(
      profileStarLevel({
        hasDisplayName: true,
        hasBirthDate: true,
        hasGoal: true,
        editedEntries: 40,
        outsideEntries: 1,
      }),
    ).toBe(5);
  });

  it("does not let an outside observation alone carry the star", () => {
    // Triangulation means two methods agreeing. One peer response about an
    // otherwise empty profile is not agreement, it is a single data point.
    expect(profileCrossSource({ ...NONE, outsideEntries: 3 })).toBe(false);
    expect(profileStarLevel({ ...NONE, outsideEntries: 3 })).toBeLessThan(5);
  });

  it("treats negative or absent counts as zero rather than throwing", () => {
    expect(profileStarLevel({ ...NONE, editedEntries: -5, outsideEntries: -2 })).toBe(1);
  });

  it("never dims once earned, because there is no staleness clock", () => {
    // domainConfidence only applies recency when a caller passes `now`, and this
    // module never does. Not retyping your name is not decay.
    // 3 fixed + 8 edited = 11 entries, inside the 5-14 band.
    const input = { hasDisplayName: true, hasBirthDate: true, hasGoal: true, editedEntries: 8 };
    expect(profileStarLevel(input)).toBe(profileStarLevel(input));
    expect(profileStarLevel(input)).toBe(3);
  });
});
