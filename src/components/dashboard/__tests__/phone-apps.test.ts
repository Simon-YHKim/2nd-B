import { phoneAppsFor } from "../phone-apps";

describe("phone app visibility", () => {
  it("opens the local avatar palette from the phone launcher", () => {
    const apps = phoneAppsFor(false);
    expect(apps.find((app) => app.id === "avatarPalette")).toMatchObject({
      route: "/avatar-palette",
      glyph: "grid",
    });
    expect(new Set(apps.map((app) => app.id)).size).toBe(apps.length);
  });

  it.each([true, null])("keeps community closed but lets every profile draw when isMinor is %s", (isMinor) => {
    const ids = phoneAppsFor(isMinor).map((app) => app.id);
    expect(ids).toContain("avatarPalette");
    expect(ids).not.toContain("community");
    expect(ids).toContain("assistant");
  });
});
