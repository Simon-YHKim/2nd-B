import { phoneAppsFor } from "../phone-apps";

describe("phone app visibility", () => {
  it("opens Avatar Share from the adult phone launcher", () => {
    const apps = phoneAppsFor(false);
    expect(apps.find((app) => app.id === "avatarShare")).toMatchObject({
      route: "/avatar-share",
      glyph: "grid",
    });
    expect(new Set(apps.map((app) => app.id)).size).toBe(apps.length);
  });

  it.each([true, null])("keeps public sharing closed when isMinor is %s", (isMinor) => {
    const ids = phoneAppsFor(isMinor).map((app) => app.id);
    expect(ids).not.toContain("avatarShare");
    expect(ids).not.toContain("community");
    expect(ids).toContain("assistant");
  });
});
