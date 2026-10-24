// Z80 (A-Z first-use check, aeroplane mode): the wiki said "0 items to sort" and "0 pieces" while
// its records had simply not been read. A tester wrote "did my records all vanish?". Simon picked
// "a number that was not loaded shows 「...」" (2026-10-13, Q-261013-21), the way the chat's
// daily count already does.
// Source contracts complement the actual-screen wiki-list/role-evidence read tests.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").split("\r\n").join("\n");

describe("a wiki count that was not read is not zero", () => {
  const screen = read("src/screens/deepspace/dds-wiki-records-screens.tsx");

  it("knows when the records were not read: still loading, or the read failed", () => {
    expect(screen).toContain("const countsUnread = loading || loadError;");
  });

  it("shows dots in the graph's count, and the real count otherwise", () => {
    expect(screen).toContain('const graphCountsUnread = countsUnread || roleRead.status !== "ready";');
    expect(screen).toMatch(/const graphCountText = graphCountsUnread\s*\? `\.\.\. \$\{t\("domains\.unit"\)\}`\s*: `\$\{graphCount\}/);
    // The count is still what the screen reader hears.
    expect(screen).toContain("accessibilityLabel={graphCountText}");
  });

  it("shows dots in the triage card's title, and the real count otherwise", () => {
    expect(screen).toMatch(/const triageTitle = countsUnread\s*\? t\("records\.triageTitle", \{ replace: \{ count: "\.\.\." \} \}\)\s*: t\("records\.triageTitle", \{ count: unfiledCount \}\);/);
    expect(screen).toContain("<RNText style={rStyles.triageTitle}>{triageTitle}</RNText>");
    // No other place draws the title from the raw count.
    expect(screen.split('t("records.triageTitle"').length - 1).toBe(2);
  });

  it("says what is going on instead of reading dots aloud", () => {
    expect(screen).toContain('accessibilityLabel={loadError ? t("records.loadError") : loading ? t("common:states.loading") : triageTitle}');
  });

  it("keeps the failure sentence and its retry as they were", () => {
    expect(screen).toContain('{t("records.loadError")}');
    expect(screen).toContain("onPress={() => setReloadKey((k) => k + 1)}");
    expect(screen).toContain("data={loadError ? [] : filtered}");
  });

  it.each(["en", "ko", "es", "pt", "id"])("%s: the title has one place for the count, so dots fit it", (lng) => {
    const title = (JSON.parse(read(`locales/${lng}/deepspace.json`)) as { records: Record<string, string> }).records.triageTitle;
    expect(title.split("{{count}}").length - 1).toBe(1);
  });
});
