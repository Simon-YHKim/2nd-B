import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const layout = readFileSync(join(root, "src/app/_layout.tsx"), "utf8");
const gate = readFileSync(join(root, "src/components/avatar/AvatarSetupGate.tsx"), "utf8");

describe("first avatar setup entry order", () => {
  test("the avatar gate wraps product routes only inside the existing recovery/C10 gate", () => {
    const introStart = layout.indexOf("<IntroGate");
    const avatarStart = layout.indexOf("<AvatarSetupGate>");
    const stackStart = layout.indexOf("<ThemedStack>");
    const avatarEnd = layout.indexOf("</AvatarSetupGate>");
    const introEnd = layout.indexOf("</IntroGate>");
    expect(introStart).toBeGreaterThan(0);
    expect(avatarStart).toBeGreaterThan(introStart);
    expect(stackStart).toBeGreaterThan(avatarStart);
    expect(avatarEnd).toBeGreaterThan(stackStart);
    expect(introEnd).toBeGreaterThan(avatarEnd);
    expect(layout.indexOf('return <Redirect href={shareRefusedHref("/complete-profile", shareTurnedAway)} />;')).toBeGreaterThan(introEnd);
  });

  test("a settled profile is required before the avatar read, and the editor is exempt", () => {
    expect(gate).toContain("hasProfile !== true");
    expect(gate).toContain("fetchAvatarSpec(userId)");
    expect(gate).toContain('decision === "setup"');
    expect(gate).toContain(': "/avatar-studio?setup=1"');
    expect(gate).toContain('{ pathname: "/avatar-studio", params: { setup: "1", ...SHARE_REFUSED_PARAMS } }');
    expect(layout).toContain('<AvatarSetupSceneGuard routeName={route.name}>');
    expect(gate).toContain('routeName.split("/")[0]');
  });
});
