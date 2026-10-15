// Z32 (A-Z first-use check): the chat screen's count read "0/5" with nothing saying what it
// counts. Simon picked "오늘 0/5" (2026-10-13): one word in front of the numbers, nothing else.
// Source contracts: render tests are not available here.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").split("\r\n").join("\n");

describe("the chat count says it is today's", () => {
  const screen = read("src/app/secondb.tsx");

  it("draws the word in front of the numbers, inside the same one-line text", () => {
    expect(screen).toContain(
      [
        "          <Text style={[ds.bannerUsage, atLimit ? ds.headerMetaDanger : null]} numberOfLines={1}>",
        '            <Text style={[ds.bannerUsageWord, atLimit ? ds.headerMetaDanger : null]}>{t("rev2.usageToday")} </Text>{dsUsage}/{limit}',
        "          </Text>",
      ].join("\n"),
    );
  });

  // The count is drawn in a pixel font with Latin glyphs only, so the word takes the body font.
  // A nested text does not inherit its parent's size or colour here (PlainText gives every text
  // the phone's own label colour): 8081 drew the word at 15px in white next to the 11px count
  // (2026-10-14). So the word names its size and colour, and takes the at-limit colour itself.
  it("gives the word the body font, the description's size and the count's colour", () => {
    expect(screen).toContain("  bannerUsageWord: { color: deepSpace.textLo, fontSize: 12, fontFamily: fontFamilies.readable },");
    // The same colour token as the count itself.
    expect(/bannerUsage: \{[^}]*color: deepSpace\.textLo,/.test(screen)).toBe(true);
    expect(screen).toContain("atLimit ? ds.headerMetaDanger : null]}>{t(\"rev2.usageToday\")}");
  });

  it("still shows \"...\" while the count is not known", () => {
    expect(screen).toContain('const dsUsage = usedToday === null ? "..." : String(usedToday);');
  });

  it.each([
    ["en", "Today"],
    ["ko", "오늘"],
    ["es", "Hoy"],
    ["pt", "Hoje"],
    ["id", "Hari ini"],
  ])("%s has the word", (lng, word) => {
    const secondb = JSON.parse(read(`locales/${lng}/secondb.json`)) as { rev2: Record<string, unknown> };
    expect(secondb.rev2.usageToday).toBe(word);
  });
});
