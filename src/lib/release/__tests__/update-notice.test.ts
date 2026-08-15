// The min_app_version comparison that decides which copy a major notice shows.
//
// One number splits the audience in two and the two halves need opposite
// messages, so the interesting cases are the boundary (running == floor) and
// every way the comparison can fail to produce an answer.

import { storeUrl, updateChannel, updateNoticeMode } from "../update-notice";

describe("updateNoticeMode", () => {
  test("a build at or above the floor gets the feature introduction", () => {
    expect(updateNoticeMode("1.5.0", "1.5.0")).toBe("feature-intro");
    expect(updateNoticeMode("1.5.1", "1.5.0")).toBe("feature-intro");
    expect(updateNoticeMode("2.0.0", "1.5.0")).toBe("feature-intro");
  });

  test("a build below the floor gets the update prompt", () => {
    expect(updateNoticeMode("1.4.9", "1.5.0")).toBe("update-prompt");
    expect(updateNoticeMode("0.1.0", "0.2.0")).toBe("update-prompt");
  });

  test("the boundary is inclusive - exactly the announced version is not out of date", () => {
    // Off by one here tells everybody who just updated that they need to
    // update, which is the fastest way to make the popup untrustworthy.
    expect(updateNoticeMode("0.2.0", "0.2.0")).toBe("feature-intro");
    expect(updateNoticeMode("0.1.9", "0.2.0")).toBe("update-prompt");
  });

  test("segments compare numerically", () => {
    expect(updateNoticeMode("0.10.0", "0.9.0")).toBe("feature-intro");
    expect(updateNoticeMode("0.9.0", "0.10.0")).toBe("update-prompt");
  });

  test("no floor means the notice is not about a version at all", () => {
    expect(updateNoticeMode("1.0.0", null)).toBe("feature-intro");
    expect(updateNoticeMode("1.0.0", undefined)).toBe("feature-intro");
    expect(updateNoticeMode("1.0.0", "")).toBe("feature-intro");
  });

  test("every uncertainty resolves to the calm message", () => {
    // Wrongly telling somebody their app is out of date sends them to a store
    // listing with nothing new on it. Failing the other way just shows a
    // feature introduction slightly early.
    expect(updateNoticeMode(null, "2.0.0")).toBe("feature-intro");
    expect(updateNoticeMode(undefined, "2.0.0")).toBe("feature-intro");
    expect(updateNoticeMode("not-a-version", "2.0.0")).toBe("feature-intro");
    expect(updateNoticeMode("1.0.0", "garbage")).toBe("feature-intro");
  });
});

describe("update channel", () => {
  test("web reloads, native goes to a store", () => {
    expect(updateChannel("web")).toBe("reload");
    expect(updateChannel("ios")).toBe("store");
    expect(updateChannel("android")).toBe("store");
  });

  test("store links are https, and match app.json / eas.json", () => {
    // https rather than market:// or itms-apps:// - both stores intercept their
    // own https listing, and a custom scheme with no handler throws on Linking
    // instead of degrading.
    expect(storeUrl("android")).toBe(
      "https://play.google.com/store/apps/details?id=com.simonk.secondbrain",
    );
    expect(storeUrl("ios")).toBe("https://apps.apple.com/app/id6792266942");
  });

  test("no store to open on web or an unknown platform", () => {
    expect(storeUrl("web")).toBeNull();
    expect(storeUrl("windows")).toBeNull();
  });
});
