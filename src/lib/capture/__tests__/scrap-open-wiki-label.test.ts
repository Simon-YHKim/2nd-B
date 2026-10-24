import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// T45 (10-13 Q11/Q12): the saved collection that /records opens is called the Wiki.
// The scrap panel on /capture and the full capture screen both send the user to
// /records after a save, so their button must carry the same name in every language.
const LOCALES = ["ko", "en", "es", "pt", "id"] as const;
const read = (lang: string, ns: string) =>
  JSON.parse(readFileSync(resolve(__dirname, `../../../../locales/${lang}/${ns}.json`), "utf8"));

describe("scrap panel 'open' button after save", () => {
  test.each(LOCALES)("%s uses the same Wiki label as the full capture screen", lang => {
    const scrap = read(lang, "home").ds.capture.openRecords;
    const full = read(lang, "capture").saved.seeRecords;
    expect(typeof scrap).toBe("string");
    expect(scrap).toBe(full);
  });

  test("Korean no longer names the old 기록 보관소", () => {
    expect(read("ko", "home").ds.capture.openRecords).not.toContain("보관소");
  });
});
