// A-Z first-use check, round 3 (Z22, Z23).
//
// Z22: a brand-new user reached the first-record screen with nothing to review and read
// "capture one thought and come back", which felt like being sent away. The empty state now
// names the next step only; the button under it already goes to capture.
//
// Z23: a star that cannot be opened yet still said "Focus locked · Ready to travel" over a
// disabled travel button. The ready line stops at "Focus locked" for such a star.
import fs from "node:fs";
import path from "node:path";

const read = (file: string): string => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const LOCALES = ["en", "ko", "es", "pt", "id"] as const;

describe("Z22: the first-record empty state names the next step", () => {
  const screen = read("src/screens/deepspace/onboarding/TTFVScreen.tsx");

  test("no language tells the person to come back", () => {
    for (const phrase of ["come back", "다시 와", "vuelve después", "volte depois", "kembali lagi"]) {
      expect(screen).not.toContain(phrase);
    }
    expect(screen).toContain('emptyBody: "생각 하나를 기록하면 여기서 돌아볼 수 있습니다.",');
  });

  test("the empty state still offers the capture button", () => {
    expect(screen).toContain('<Action label={copy.emptyAction} glyph="add" primary onPress={() => router.push("/capture")} />');
  });
});

describe("Z23: a star that cannot be opened does not say it is ready to travel", () => {
  test("the home screen tells the overlay whether the star can be opened", () => {
    expect(read("src/components/deep-space/ConstellationHome.tsx")).toContain('canTravel={selectedEntry?.kind === "available"}');
  });

  test("the overlay swaps the ready line only", () => {
    const overlay = read("src/components/deep-space/StarDestination.tsx");
    expect(overlay).toContain("canTravel = true");
    expect(overlay).toContain("t(phase === 'ready' && !canTravel ? 'camera.held' : `camera.${phase}`)");
  });

  test.each(LOCALES)("%s: the held line is the first half of the ready line", (lng) => {
    const camera = (JSON.parse(read(`locales/${lng}/deepspace.json`)) as { camera: Record<string, string> }).camera;
    expect(camera.held.length).toBeGreaterThan(0);
    expect(camera.ready.startsWith(camera.held)).toBe(true);
    expect(camera.ready).not.toBe(camera.held);
  });
});
