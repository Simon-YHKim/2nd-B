// Z60 (Simon 2026-10-13): on a star's summary, the record count is a way in. It opens the wiki
// list on that star's stories: the rows told under that star, with one line at the top that says
// whose stories these are and returns to everything.
//
// The count on the summary and the rows in the list are the same set: both are the owner's
// records whose audit_period is that star's period, with no date window on either side. Two
// known edges: the list's read stops at 5,000 rows (list-all-records.ts), and inside the
// dashboard phone /records is the phone's own notes page, so there the count is not pressed.
//
// These are pins on the source. What the screens do with them was looked at on a check server
// (2026-10-14): count pressed -> /records?period=infancy, one row, the line; back to 47 rows.
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
    expect(at).toBeGreaterThan(-1);
    const whole = SUMMARY.slice(at, SUMMARY.indexOf(") : null}", at));
    const block = whole.slice(whole.indexOf(") : ("));
    expect(block).toContain('accessibilityRole="button"');
    expect(block).toContain('router.push({ pathname: "/records", params: { period: meta.period ?? "" } })');
    // What is read out is the count: the control is named by it, and the chevron is drawn only.
    expect(block).toContain('accessibilityLabel={t("ds.star.records", { count: summary.records })}');
    expect(block).toMatch(/aria-hidden\s+accessibilityElementsHidden\s+importantForAccessibility="no-hide-descendants"\s*>\s*›\s*<\/Text>/);
    // A target a thumb can hit.
    expect(SUMMARY).toContain('recordsLink: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, minHeight: 44 },');
  });

  it("the count is still counted the same way: that period, no date window", () => {
    // T43 moved the same count into the screen's strict reader; failure is no longer zero.
    const loader = read("src/lib/persona/load-star-summary.ts");
    expect(SUMMARY).toContain("loadStarSummary(userId, meta.id, meta.period, age)");
    expect(loader).toContain('.select("id", { count: "exact", head: true })');
    expect(loader).toContain('.eq("audit_period", period)');
  });

  it("a star with no stories has nothing to press, and there is one way in", () => {
    expect(SUMMARY.match(/pathname: "\/records"/g)).toHaveLength(1);
    // One condition decides whether the line is there at all; no stories, no line and no control.
    expect(SUMMARY.match(/\{summary\.records > 0 \? \(/g)).toHaveLength(1);
  });

  it("inside the dashboard phone the count stays a plain line: its notes page does not narrow", () => {
    expect(SUMMARY).toContain("const inPhone = usePhoneEmbed() !== null;");
    const at = SUMMARY.indexOf("{summary.records > 0 ? (");
    const whole = SUMMARY.slice(at, SUMMARY.indexOf(") : null}", at));
    expect(whole).toContain("inPhone ? (");
    const plain = whole.slice(whole.indexOf("inPhone ? ("), whole.indexOf(") : ("));
    expect(plain).toContain('t("ds.star.records", { count: summary.records })');
    expect(plain).not.toContain("Pressable");
    expect(plain).not.toContain("router.push");
    // The phone's page reads tags only; when it learns ?period=, this guard can go.
    const phone = read("src/components/dashboard/DashboardPhone.tsx");
    expect(phone).not.toMatch(/params\.period|get\(["']period["']\)|[?&]period=/);
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
    expect(line).toContain('<Pressable onPress={showAllPeriods} accessibilityRole="button" style={rStyles.periodLineAll}>');
    expect(line).toContain('t("records.periodShowAll")');
    // The way back is a full-size target by itself, not by a slop around a 24px line.
    expect(WIKI).toContain('periodLineAll: { minHeight: 44, justifyContent: "center" },');
    expect(line).not.toContain("hitSlop");
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
    const at = WIKI.indexOf("ListEmptyComponent={");
    const empty = WIKI.slice(at, WIKI.indexOf("ItemSeparatorComponent", at));
    expect(empty).toMatch(/\{periodStar \? null : \([\s\S]*router\.push\("\/capture"\)/);
  });

  it("on Android the device Back returns to the star summary it was opened from", () => {
    expect(WIKI).toContain("const openedFromStar = SEVEN_STARS.some((star) => star.period !== null && star.period === recordsParams.period);");
    expect(WIKI).toMatch(/const backToStar = useCallback\(\(\) => \{\s*if \(!openedFromStar \|\| !router\.canGoBack\(\)\) return false;\s*router\.back\(\);\s*return true;/);
    expect(WIKI).toContain("useHardwareBack(backToStar);");
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

  it.each(["ko", "en", "es", "pt", "id"])("%s: the line reads right with every real star name", (lng) => {
    const home = JSON.parse(read(`locales/${lng}/home.json`)) as { ds: { star: Record<string, unknown> } };
    const scope = (JSON.parse(read(`locales/${lng}/deepspace.json`)).records as Record<string, string>).periodScope;
    for (const star of SEVEN_STARS.filter((s) => s.period !== null)) {
      const name = home.ds.star[star.key];
      expect(typeof name).toBe("string");
      const line = scope.replace("{{star}}", name as string);
      // A preposition in front of the name breaks on names that bring their own word:
      // es "de De los 30 en adelante", pt "de Os 20 anos" (must contract to "dos").
      expect(line).not.toMatch(/\b(de|of|da|do|dari) (De|Dos|Os|Los|Las|As|The)\b/);
      expect(line).not.toMatch(/\b(de|of) \{\{star\}\}/);
    }
    if (lng === "es" || lng === "pt" || lng === "en") expect(scope).not.toMatch(/\b(de|of) \{\{star\}\}/);
  });
});
