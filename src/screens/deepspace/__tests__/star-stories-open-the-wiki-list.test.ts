// Z60 (Simon 2026-10-13): on a star's summary, the record count is a way in. It opens the wiki
// list on that star's stories: the rows told under that star, with one line at the top that says
// whose stories these are and returns to everything.
//
// The count on the summary and the rows in the list are the same set: both are the owner's
// records whose audit_period is that star's period, with no date window on either side.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SEVEN_STARS } from "../../../lib/persona/seven-stars";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n?/g, "\n");

const SUMMARY = read("src/app/me/[star].tsx");
const WIKI = read("src/screens/deepspace/dds-wiki-records-screens.tsx");
const READ = read("src/lib/records/list-all-records.ts");

describe("the star summary: the count opens that star's stories", () => {
  it("the count is pressed, and it carries the star's period to the wiki list", () => {
    const at = SUMMARY.indexOf("{summary.records > 0 ? (");
    const block = SUMMARY.slice(at, SUMMARY.indexOf(") : null}", at));
    expect(block).toContain('accessibilityRole="button"');
    expect(block).toContain('router.push({ pathname: "/records", params: { period: meta.period ?? "" } })');
    expect(block).toContain('t("ds.star.records", { count: summary.records })');
    // The chevron is drawn, not read out.
    expect(block).toMatch(/accessibilityElementsHidden[\s\S]*›/);
  });

  it("the count is still counted the same way: that period, no date window", () => {
    expect(SUMMARY).toContain('.select("id", { count: "exact", head: true })');
    expect(SUMMARY).toContain('.eq("audit_period", period);');
  });

  it("a star with no stories has nothing to press", () => {
    expect(SUMMARY.match(/pathname: "\/records"/g)).toHaveLength(1);
    expect(SUMMARY).toContain("{summary.records > 0 ? (");
  });
});

describe("the wiki list: opened on one star's stories", () => {
  it("reads ?period= and takes it only when it is a star's period", () => {
    expect(WIKI).toContain("useScreenParams<{ tags?: string; period?: string }>()");
    expect(WIKI).toContain("return SEVEN_STARS.find((star) => star.period !== null && star.period === asked) ?? null;");
    // The profile star has no period, so no value can select it.
    expect(SEVEN_STARS.filter((star) => star.period === null).map((star) => star.id)).toEqual(["profile"]);
    expect(SEVEN_STARS.filter((star) => star.period !== null)).toHaveLength(6);
  });

  it("opens as the list, and keeps only the rows told under that star", () => {
    expect(WIKI).toContain('useState<"list" | "graph">(periodStar ? "list" : "graph")');
    expect(WIKI).toContain('if (periodStar) setView("list");');
    expect(WIKI).toContain("const ofStar = periodStar ? records.filter((r) => r.audit_period === periodStar.period) : records;");
    expect(READ).toContain('.select("id, kind, body, topic, summary, tags, created_at, audit_period")');
  });

  it("says whose stories these are at the top of the list, with the way back to everything", () => {
    const at = WIKI.indexOf("const periodLine = periodStar ? (");
    const line = WIKI.slice(at, WIKI.indexOf(") : null;", at));
    expect(line).toContain('t("records.periodScope", { star: t(`home:ds.star.${periodStar.key}`) })');
    expect(line).toContain('<Pressable onPress={showAllPeriods} accessibilityRole="button"');
    expect(line).toContain('t("records.periodShowAll")');
    const header = WIKI.slice(WIKI.indexOf("ListHeaderComponent={"), WIKI.indexOf("ListEmptyComponent={"));
    expect(header.indexOf("{viewToggleRow}")).toBeLessThan(header.indexOf("{periodLine}"));
    expect(header.indexOf("{periodLine}")).toBeLessThan(header.indexOf("{triageCards}"));
  });

  it("the graph is the map of everything: choosing it leaves the one star", () => {
    expect(WIKI).toContain('if (key === "graph") showAllPeriods();');
    expect(WIKI).toContain("const showAllPeriods = useCallback(() => setPeriodShownAll(recordsParams.period ?? null), [recordsParams.period]);");
    // Returning to everything is remembered for this value only: a link to another star narrows again.
    expect(WIKI).toContain("if (!asked || asked === periodShownAll) return null;");
  });

  it("with no story left under that star, the list does not invite a first record", () => {
    expect(WIKI).toContain('typeFilter === "all" && !periodStar ? t("records.emptyAll") : t("records.emptyKind")');
  });
});

describe("the two strings, in five languages", () => {
  it.each(["ko", "en", "es", "pt", "id"])("%s names the star and offers everything", (lng) => {
    const records = JSON.parse(read(`locales/${lng}/deepspace.json`)).records as Record<string, string>;
    expect(records.periodScope).toContain("{{star}}");
    expect(records.periodShowAll.trim()).not.toBe("");
    expect(records.periodScope).not.toContain("—");
    expect(records.periodShowAll).not.toContain("—");
  });

  it("ko is the wording that was chosen", () => {
    const records = JSON.parse(read("locales/ko/deepspace.json")).records as Record<string, string>;
    expect(records.periodScope).toBe("{{star}} 별의 이야기");
    expect(records.periodShowAll).toBe("전체 보기");
  });

  it("every star that can be opened this way has a name to put in the line", () => {
    const home = JSON.parse(read("locales/ko/home.json")) as { ds: { star: Record<string, unknown> } };
    for (const star of SEVEN_STARS.filter((s) => s.period !== null)) {
      expect(typeof home.ds.star[star.key]).toBe("string");
    }
  });
});
