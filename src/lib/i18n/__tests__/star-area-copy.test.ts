import { readFileSync } from "node:fs";
import { join } from "node:path";
import { IMAGINE_SEEDS, imagineSeedCopy } from "@/components/deep-space/imagine-seeds";

const ROOT = join(__dirname, "../../../..");
const LANGUAGES = [
  { locale: "ko", star: "별", area: "영역", oldStar: /별/ },
  { locale: "en", star: "Star", area: "area", oldStar: /\bstars?\b/i },
  { locale: "es", star: "Estrella", area: "área", oldStar: /\bestrellas?\b/i },
  { locale: "pt", star: "Estrela", area: "área", oldStar: /\bestrelas?\b/i },
  { locale: "id", star: "Bintang", area: "bidang", oldStar: /\bbintang\b/i },
] as const;

function readJson(file: string) {
  return JSON.parse(readFileSync(join(ROOT, file), "utf8"));
}

// Z62 / T47: life areas in the examples are distinct from the seven home stars.
describe("T47 star and life-area wording", () => {
  test.each(LANGUAGES)("$locale: the home star tag names a star", ({ locale, star }) => {
    expect(readJson(`locales/${locale}/home.json`).ds.home.kind.domain).toBe(star);
  });

  test("the home star bubble still reads the dedicated kind label", () => {
    const home = readFileSync(join(ROOT, "src/components/deep-space/ConstellationHome.tsx"), "utf8");
    expect(home).toMatch(/const kindOf\s*=\s*\(id: HomeStarId\)\s*=>\s*\(id === "profile"\s*\?\s*t\("ds\.home\.kind\.profile"\)\s*:\s*t\("ds\.home\.kind\.domain"\)\)/);
    expect(home).toMatch(/bubble\.kind === "star"\s*\? kindOf\(bubble\.id\)/);
  });

  describe.each(LANGUAGES)("$locale imagine seeds", ({ locale, area, oldStar }) => {
    const bundle = readJson(`locales/${locale}/home.json`);
    const translate = (key: string): string => key.split(".").reduce((value, part) => value[part], bundle);

    test.each(IMAGINE_SEEDS)("$key: bundle and visible third step name a life area", (seed) => {
      const visible = imagineSeedCopy(seed, locale === "ko", translate);
      for (const value of [translate(`ds.imagine.seeds.${seed.key}.step3`), visible.steps[2]]) {
        expect(value.toLowerCase()).toContain(area);
        expect(value).not.toMatch(oldStar);
      }
    });

    test("connecting career and rest joins two life areas", () => {
      const seed = IMAGINE_SEEDS[2];
      const visible = imagineSeedCopy(seed, locale === "ko", translate);
      for (const value of [translate("ds.imagine.seeds.connect.body"), visible.body]) {
        expect(value.toLowerCase()).toContain(area);
        expect(value).not.toMatch(oldStar);
      }
    });
  });

  test("the reference canon keeps the same corrected Korean examples as the app", () => {
    const reference = readJson("design/proto_rev2/reference-app/data/screens/more.json").imagineSeeds;
    expect(reference).toHaveLength(IMAGINE_SEEDS.length);
    reference.forEach((seed: { body: string; steps: string[] }, index: number) => {
      expect(seed.steps[2]).toContain("영역");
      expect(seed.steps[2]).not.toContain("별");
      expect(seed.steps).toEqual(IMAGINE_SEEDS[index].ko.steps);
      expect(seed.body).toBe(IMAGINE_SEEDS[index].ko.body);
    });
    expect(reference[2].body).toContain("두 영역");
    expect(reference[2].body).not.toContain("별");
  });
});
