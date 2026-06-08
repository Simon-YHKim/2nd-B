import {
  PRIMARY_TAB_PATHS,
  PROFILE_CHILD_PATHS,
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
