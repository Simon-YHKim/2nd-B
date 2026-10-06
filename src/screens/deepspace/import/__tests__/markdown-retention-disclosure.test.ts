import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const screen = readFileSync(resolve(__dirname, "../ImportHubScreen.tsx"), "utf8").replace(/\r\n?/g, "\n");
const localeRoot = resolve(__dirname, "../../../../../locales");
const localeCopy = Object.fromEntries(
  ["en", "ko", "es", "pt", "id"].map((locale) => [
    locale,
    JSON.parse(readFileSync(resolve(localeRoot, locale, "import.json"), "utf8")).markdownRetention,
  ]),
);
// The hub's general copy left the screen's COPY(ko) table for import hub.* in all five
// locales (Q-261005-01 = A, QA 261006 tr3), so the general consent is read from there.
const hubCopy = Object.fromEntries(
  ["en", "ko", "es", "pt", "id"].map((locale) => [
    locale,
    JSON.parse(readFileSync(resolve(localeRoot, locale, "import.json"), "utf8")).hub as Record<string, string>,
  ]),
);

describe("Markdown import retention disclosure", () => {
  test("five locales disclose that selected note text is kept, with its limit", () => {
    for (const locale of ["en", "ko", "es", "pt", "id"]) {
      const { consent, review } = localeCopy[locale];
      expect(consent).toMatch(/4[,.]000/);
      expect(review).toMatch(/4[,.]000/);
    }
    expect(localeCopy.ko.consent).toContain("본문");
    expect(localeCopy.en.consent).toContain("text");
  });

  test("consent covers content detection and the review does not claim zero raw notes", () => {
    // A file may be detected as Markdown even when opened from another tile.
    // The general consent must therefore avoid a universal raw-discard claim.
    expect(hubCopy.ko.whereBody).not.toMatch(/원문.*버/);
    expect(hubCopy.en.whereBody).not.toMatch(/raw.*discard/i);
    expect(hubCopy.es.whereBody).not.toMatch(/descart/i);
    expect(hubCopy.pt.whereBody).not.toMatch(/descart/i);
    expect(hubCopy.id.whereBody).not.toMatch(/buang/i);
    expect(hubCopy.ko.localAnalysis).toBe("파일 분석은 이 기기에서");
    expect(hubCopy.en.localAnalysis).toBe("File analyzed on device");
    expect(screen).not.toContain("Process on this device only");
    expect(hubCopy.en.localAnalysis).not.toContain("Process on this device only");
    expect(screen).toContain("const t = (k: string) => importT(`hub.${k}`);");

    expect(screen).toContain('useTranslation("import")');
    expect(screen).toContain('s.kind === "markdown" ? importT("markdownRetention.consent") : t("whereBody")');
    expect(screen).toContain('out.summary.notes === 0 ? <Summary n={0} label={t("raw")} dim /> : null');
    expect(screen).toContain('out.summary.notes > 0 ? (\n          <Text variant="subtle" style={styles.fine}>{importT("markdownRetention.review")}</Text>');
  });
});
