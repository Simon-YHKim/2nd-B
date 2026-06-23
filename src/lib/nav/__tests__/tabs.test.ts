import {
  DEEP_SPACE_DOCK_PATHS,
  PRIMARY_TAB_PATHS,
  PROFILE_CHILD_PATHS,
  isDeepSpaceDockPath,
  isPrimaryTabPath,
  isProfileChildPath,
} from "../tabs";

describe("primary tab routes", () => {
  test("keeps settings under profile instead of the bottom tab bar", () => {
    expect(PRIMARY_TAB_PATHS).toEqual(["/", "/capture", "/secondb", "/profile"]);
    expect(PRIMARY_TAB_PATHS).not.toContain("/settings");
    expect(isPrimaryTabPath("/settings")).toBe(false);

    expect(PROFILE_CHILD_PATHS).toEqual(["/settings"]);
    expect(isProfileChildPath("/settings")).toBe(true);
  });
});

describe("deep-space dock routes", () => {
  test("covers the 11 dock screens, excluding primary tab roots", () => {
    expect(isDeepSpaceDockPath("/core-brain")).toBe(true);
    expect(isDeepSpaceDockPath("/big-five")).toBe(true);
    expect(isDeepSpaceDockPath("/account")).toBe(true);
    expect(isDeepSpaceDockPath("/ops")).toBe(true);

    // Primary tab roots also render the dock but are hidden via isPrimaryTabPath,
    // so they must NOT be duplicated in the dock list.
    for (const tab of PRIMARY_TAB_PATHS) {
      expect(DEEP_SPACE_DOCK_PATHS).not.toContain(tab);
    }

    // Stack routes without a dock keep the floating back arrow.
    expect(isDeepSpaceDockPath("/settings")).toBe(false);
    expect(isDeepSpaceDockPath("/privacy")).toBe(false);
  });
});
