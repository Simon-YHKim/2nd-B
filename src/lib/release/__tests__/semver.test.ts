// The release policy expressed as tests.
//
// The rule these pin is the one a wrong answer costs the most: a release that
// changes how the app is used must interrupt the user once, and every other
// release must stay silent. Both failure directions are real - a missed major
// leaves people confused about a screen that moved, and a chatty minor teaches
// them to dismiss the popup without reading it, which breaks the next incident
// notice.

import { classifyRelease, compareSemver, noticeRequired, parseSemver } from "../semver";

describe("parseSemver", () => {
  test("pads short versions to three segments", () => {
    expect(parseSemver("1")).toEqual([1, 0, 0]);
    expect(parseSemver("1.2")).toEqual([1, 2, 0]);
    expect(parseSemver("1.2.3")).toEqual([1, 2, 3]);
  });

  test("drops prerelease and build metadata", () => {
    expect(parseSemver("1.2.3-beta.1")).toEqual([1, 2, 3]);
    expect(parseSemver("1.2.3+sha.abc")).toEqual([1, 2, 3]);
  });

  test("rejects what the notices.min_app_version CHECK would also reject", () => {
    // The column is `text CHECK (min_app_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$')`,
    // so a value this parser accepts but the CHECK does not would fail at
    // publish time, in a dashboard, at release o'clock.
    expect(parseSemver("v1.2.3")).toBeNull();
    expect(parseSemver("1.2.3.4")).toBeNull();
    expect(parseSemver("")).toBeNull();
    expect(parseSemver("   ")).toBeNull();
    expect(parseSemver("not-a-version")).toBeNull();
    expect(parseSemver("1.x.3")).toBeNull();
  });
});

describe("compareSemver", () => {
  test("compares segments numerically, not lexically", () => {
    // "0.10.0" < "0.9.0" as strings. This is the classic version-gate bug and
    // it is the reason there is exactly one comparator in the repo.
    expect(compareSemver("0.10.0", "0.9.0")).toBe(1);
    expect(compareSemver("0.9.0", "0.10.0")).toBe(-1);
    expect(compareSemver("1.2", "1.2.0")).toBe(0);
  });

  test("returns null when either side is unparseable", () => {
    expect(compareSemver("1.0.0", "garbage")).toBeNull();
    expect(compareSemver("garbage", "1.0.0")).toBeNull();
  });
});

describe("classifyRelease", () => {
  test("a major bump is major, whatever the lower segments do", () => {
    expect(classifyRelease("1.4.2", "2.0.0")).toBe("major");
    expect(classifyRelease("1.4.2", "2.3.9")).toBe("major");
    expect(classifyRelease("0.9.9", "1.0.0")).toBe("major");
  });

  test("a minor bump is minor even when it carries a lot of work", () => {
    expect(classifyRelease("1.4.2", "1.5.0")).toBe("minor");
    expect(classifyRelease("1.4.2", "1.9.9")).toBe("minor");
  });

  test("a patch bump is patch", () => {
    expect(classifyRelease("1.4.2", "1.4.3")).toBe("patch");
  });

  test("null when the version did not move forward", () => {
    // Nothing to announce is a different situation from a silent release, and
    // the script reports the two differently.
    expect(classifyRelease("1.4.2", "1.4.2")).toBeNull();
    expect(classifyRelease("1.4.2", "1.4.1")).toBeNull();
    expect(classifyRelease("2.0.0", "1.9.9")).toBeNull();
  });

  test("null when either version is unparseable", () => {
    expect(classifyRelease("garbage", "1.0.0")).toBeNull();
    expect(classifyRelease("1.0.0", "v2.0.0")).toBeNull();
  });
});

describe("noticeRequired", () => {
  test("only a major release owes users a popup", () => {
    expect(noticeRequired("major")).toBe(true);
    expect(noticeRequired("minor")).toBe(false);
    expect(noticeRequired("patch")).toBe(false);
    expect(noticeRequired(null)).toBe(false);
  });

  test("minor and patch stay silent end to end", () => {
    // The guarantee stated in docs/RELEASE-PROCESS.md: a routine release
    // publishes nothing, so the script's silent path is not an accident of the
    // caller checking the wrong thing.
    expect(noticeRequired(classifyRelease("1.4.2", "1.5.0"))).toBe(false);
    expect(noticeRequired(classifyRelease("1.4.2", "1.4.3"))).toBe(false);
    expect(noticeRequired(classifyRelease("0.1.0", "0.2.0"))).toBe(false);
    expect(noticeRequired(classifyRelease("1.4.2", "2.0.0"))).toBe(true);
  });

  test("0.x never auto-classifies as major, which is why --force-major exists", () => {
    // Documented consequence, pinned so nobody discovers it during a release.
    // On a 0.y.z line the major segment cannot move without cutting 1.0.0.
    expect(classifyRelease("0.1.0", "0.9.0")).toBe("minor");
    expect(noticeRequired(classifyRelease("0.1.0", "0.9.0"))).toBe(false);
  });
});
