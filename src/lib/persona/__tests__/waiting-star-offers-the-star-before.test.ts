// Z23 (A-Z first-use check): a star that waits on the one before it showed a dimmed "Travel"
// that did nothing, under a sentence that already said why ("Save your first entry in Early
// childhood to unlock this star"). Simon picked "a button to the star before, like [Go to Early
// childhood]" (2026-10-13, Q-261013-09).
//
// That star's summary can be waiting on its own previous star, so the summary offers the same
// way on where Start would be: the new button must not lead into a dead end.
// Source contracts: render tests are not available here.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STAR_ENTRY_TRACKS, starEntryStatus } from "../star-entry-tracks";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").split("\r\n").join("\n");
const LOCALES = ["en", "ko", "es", "pt", "id"] as const;

describe("the rule the button follows", () => {
  it("a waiting star names the one star right before it on its track", () => {
    expect(starEntryStatus("school", { profile: 2, infancy: 1 }, 40)).toEqual({ kind: "previous", prerequisite: "infancy" });
    expect(starEntryStatus("now", { profile: 2, work: 1 }, 40)).toEqual({ kind: "previous", prerequisite: "work" });
    expect(starEntryStatus("infancy", { profile: 2 }, 40)).toEqual({ kind: "available" });
  });

  it("following the star before, step by step, always ends at a star that can be entered", () => {
    // Nothing saved anywhere: every star but the profile waits, and each chain ends at the profile.
    for (const track of STAR_ENTRY_TRACKS) {
      for (const start of track) {
        let at = start;
        for (let hop = 0; hop < track.length; hop += 1) {
          const status = starEntryStatus(at, {}, 80);
          if (status.kind !== "previous") break;
          at = status.prerequisite;
        }
        expect(starEntryStatus(at, {}, 80)).toEqual({ kind: "available" });
      }
    }
  });
});

describe("the home bubble", () => {
  const home = read("src/components/deep-space/ConstellationHome.tsx");
  const at = home.indexOf('{selectedEntry?.kind === "previous" ? (');
  const branch = home.slice(at, home.indexOf('label={t("ds.home.bubble.travel")}', at));

  it("offers the star before instead of a dimmed Travel", () => {
    expect(at).toBeGreaterThan(-1);
    expect(branch).toContain('label={t("ds.home.bubble.goToStar", { star: starName(selectedEntry.prerequisite) })}');
    expect(branch).toContain("disabled={!cameraReady || captureId !== null}");
    expect(branch).toContain("onStarTravel(previous);");
    // Leaves the focused star the way a finished travel does.
    expect(branch).toMatch(/setVisualFocusId\(null\);\s*setCameraReady\(false\);\s*destinationProgress\.setValue\(0\);\s*setBubble\(\{ kind: "intro" \}\);\s*onStarTravel\(previous\);/);
  });

  it("keeps Travel as it was for every other star", () => {
    expect(home).toContain('disabled={selectedEntry?.kind !== "available" || !cameraReady || captureId !== null}');
    expect(home).toContain("if (!cameraReady || selectedEntry?.kind !== 'available' || captureLock.current) return;");
    expect(home.split('t("ds.home.bubble.travel")').length - 1).toBe(1);
    expect(home.split('t("ds.home.bubble.goToStar"').length - 1).toBe(1);
  });
});

describe("the star summary", () => {
  const page = read("src/app/me/[star].tsx");

  it("offers the same way on where Start would be", () => {
    expect(page).toContain('label={t("ds.home.bubble.goToStar", { star: t(`ds.star.${entry.prerequisite}`) })}');
    expect(page).toContain("onPress={() => router.push(`/me/${entry.prerequisite}`)}");
    const start = page.indexOf('{entry?.kind !== "previous" ? (');
    expect(start).toBeGreaterThan(-1);
    expect(page.indexOf('t("ds.home.bubble.goToStar"')).toBeGreaterThan(start);
    // Start itself is unchanged.
    expect(page).toContain('router.push({ pathname: "/interview", params: { period: meta.period ?? "now" } })');
  });
});

describe("the button's name", () => {
  it.each(LOCALES)("%s: names the star it goes to", (lng) => {
    const bubble = (JSON.parse(read(`locales/${lng}/home.json`)) as { ds: { home: { bubble: Record<string, string> } } }).ds.home.bubble;
    expect(bubble.goToStar).toContain("{{star}}");
    expect(bubble.goToStar).not.toBe(bubble.travel);
  });

  it("Korean reads as the mock showed", () => {
    const bubble = (JSON.parse(read("locales/ko/home.json")) as { ds: { home: { bubble: Record<string, string> } } }).ds.home.bubble;
    expect(bubble.goToStar).toBe("{{star}} 별로 가기");
  });
});
