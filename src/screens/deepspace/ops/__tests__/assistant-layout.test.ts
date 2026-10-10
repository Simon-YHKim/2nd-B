import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const hub = read("src/screens/deepspace/dds-ops-screen.tsx");
const tools = read("src/screens/deepspace/ops/screens.tsx");
const tree = ts.createSourceFile("screens.tsx", tools, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function titleTags(style: string): ts.JsxOpeningElement[] {
  const found: ts.JsxOpeningElement[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(tree) === "Text" &&
      node.attributes.properties.some(prop => ts.isJsxAttribute(prop) && prop.name.getText(tree) === "style" &&
        prop.initializer?.getText(tree) === `{styles.${style}}`)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

describe("assistant UI round 1, item 3: settings hierarchy", () => {
  const header = hub.slice(hub.indexOf("const listHeader"), hub.indexOf('if (surface === "board") return <View'));
  const footer = hub.slice(hub.indexOf("const listFooter"), hub.indexOf("\n  return shell(\n    <FlatList"));

  test("recommendation choices and generation precede routines; notifications, patterns and tools follow", () => {
    const ordered = ['phone.recommendationSettings', 'OPS_GROUP_IDS.map', 'domains.map', 'void runRecommendation()', 'title={t("hero.title")}'];
    const positions = ordered.map(marker => header.indexOf(marker));
    expect(positions.every(position => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    const footerTitles = [...footer.matchAll(/<SectionHeading[^>]*title=\{t\("([^"]+)"\)\}/g)].map(match => match[1]);
    expect(footerTitles).toEqual(["card.remind", "home.patternsTitle", "home.toolsLabel"]);
    expect(hub).toContain("ListHeaderComponent={listHeader}");
    expect(hub).toContain("ListFooterComponent={listFooter}");
    expect(footer).not.toContain("runRecommendation()");
  });

  test("the routine heading keeps both real counts, without a large progress card or ring", () => {
    expect(header).toContain('<SectionHeading icon="schedule" title={t("hero.title")} trailing={');
    expect(header).toContain('ownerToday.kind === "ready" || ownerToday.kind === "empty"');
    expect(header).toContain('t("home.ringCount", { done: todayDone, total: todayData.routines.length })');
    expect(header).toContain('t("today.streak", { count: todayData.streak })');
    expect(header).toContain(': undefined');
    expect(hub).not.toMatch(/ProgressRing|ringCells|heroContent|heroCount|heroStreak/);
    expect(hub).toContain('onPress={() => void completeRoutine(item)}');
    expect(hub).toContain('disabled={done || completing}');
    expect(hub).toContain('accessibilityState={{ checked: done, busy: completing }}');
  });

  test("all five sections share the phone card heading or the standalone heading", () => {
    expect((header + footer).match(/<SectionHeading\b/g)).toHaveLength(5);
    const heading = hub.slice(hub.indexOf("function SectionHeading"), hub.indexOf("export function DeepSpaceOpsScreen"));
    expect(heading).toContain("const phone = usePhoneDesign()");
    expect(heading).toContain("if (phone) return (");
    expect(heading).toContain('<IosCardHeader glyph={icon} title={title} trailing={');
    expect(heading).toContain('<PixelGlyph name={icon} color={m3.color.primary} size={20} />');
    expect(heading).toContain('<Text variant="heading" style={styles.sectionTitle} accessibilityRole="header">');
    expect(footer).not.toMatch(/styles\.patternTitle|size=\{24\}/);
  });

  test("heading height follows its text; routine failures stay after the routine list", () => {
    expect(header).not.toContain("{notice ? (");
    expect(footer.indexOf("{notice ? (")).toBeGreaterThan(0);
    expect(footer.indexOf("{notice ? (")).toBeLessThan(footer.indexOf('title={t("card.remind")}'));
    const headingStyle = hub.match(/sectionHeading: \{([^}]+)\}/)?.[1];
    expect(headingStyle).not.toMatch(/\bflex: 1/);
    expect(hub).toContain('<View style={styles.headingStack}>');
  });
});

describe("L06: text yields room to row actions", () => {
  test("long confirmation actions can wrap inside the book row", () => {
    const row = tools.match(/bookRow: \{([^}]+)\}/)?.[1];
    expect(row).toContain('flexWrap: "wrap"');
  });

  test.each(["bookTitle", "bookDone", "entryCat", "repoName"])("%s can shrink inside either surface", (style) => {
    const block = tools.match(new RegExp(`  ${style}: \\{ flex: 1,([^}]+)\\}`))?.[1];
    expect(block).toBeDefined();
    expect(block).toMatch(/minWidth: 0[,\s]/);
    // The phone derives these constraints from clayStyles, rather than losing them in an override.
    expect(tools).toContain("const phoneBaseStyles = phoneStyleSheet(clayStyles)");
    expect(tools).toContain("...phoneBaseStyles,");
    const override = tools.slice(tools.indexOf("const phoneScreenStyles")).match(new RegExp(`  ${style}: \\{([^}]+)\\}`))?.[1];
    if (override) expect(override).toContain(`...clayStyles.${style}`);
  });

  test.each([["bookTitle", 6], ["bookDone", 1], ["repoName", 1]] as const)("every %s title uses two-line tail truncation", (style, count) => {
    const tags = titleTags(style);
    expect(tags).toHaveLength(count);
    for (const tag of tags) {
      const props = new Map(tag.attributes.properties.filter(ts.isJsxAttribute).map(prop => [prop.name.getText(tree), prop.initializer?.getText(tree)]));
      expect(props.get("numberOfLines")).toBe("{2}");
      expect(props.get("ellipsizeMode")).toBe('"tail"');
    }
  });

  test("clamping keeps the full title and the existing move/delete actions", () => {
    expect(tools).toContain('onPress={() => void onMove(b.id, "reading")}');
    expect(tools).toContain('onPress={() => void onMove(b.id, "done")}');
    expect(tools).toContain('name={b.title} onPress={() => del.press(b.id)}');
    expect(tools).not.toMatch(/b\.title\.(?:slice|substring)|manual\.title\.(?:slice|substring)/);
    expect(titleTags("entryCat")[0]?.getText(tree)).toContain("numberOfLines={1}");
  });
});
