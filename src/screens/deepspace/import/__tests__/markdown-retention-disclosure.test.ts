import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const screen = readFileSync(resolve(__dirname, "../ImportHubScreen.tsx"), "utf8");

describe("Markdown import retention disclosure", () => {
  test("both languages disclose that selected note text is kept, with its limit", () => {
    const notesCopy = [...screen.matchAll(/whereBodyNotes: "([^"]+)"/g)].map((match) => match[1]);
    const reviewCopy = [...screen.matchAll(/noteBodyReview: "([^"]+)"/g)].map((match) => match[1]);

    expect(notesCopy).toHaveLength(2);
    expect(reviewCopy).toHaveLength(2);
    expect(notesCopy[0]).toContain("본문");
    expect(notesCopy[1]).toContain("text");
    for (const copy of [...notesCopy, ...reviewCopy]) expect(copy).toContain("4,000");
  });

  test("consent covers content detection and the review does not claim zero raw notes", () => {
    // A file may be detected as Markdown even when opened from another tile.
    // The general consent must therefore avoid a universal raw-discard claim.
    const generalCopy = [...screen.matchAll(/whereBody: "([^"]+)"/g)].map((match) => match[1]);
    expect(generalCopy).toHaveLength(2);
    expect(generalCopy[0]).not.toMatch(/원문.*버/);
    expect(generalCopy[1]).not.toMatch(/raw.*discard/i);
    expect(screen).toContain('localAnalysis: "파일 분석은 이 기기에서"');
    expect(screen).toContain('localAnalysis: "File analyzed on device"');
    expect(screen).not.toContain("Process on this device only");

    expect(screen).toContain('s.kind === "markdown" ? t("whereBodyNotes") : t("whereBody")');
    expect(screen).toContain('out.summary.notes === 0 ? <Summary n={0} label={t("raw")} dim /> : null');
    expect(screen).toContain('out.summary.notes > 0 ? (\n          <Text variant="subtle" style={styles.fine}>{t("noteBodyReview")}</Text>');
  });
});
