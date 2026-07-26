// Source-string guards for the two defects an adversarial review caught in the
// Play UGC report/block surface (migration 0097). Both are invisible at runtime
// in the happy path, so a normal QA pass would not catch a regression:
//
//   1. The moderation control must NOT be nested inside a card-level Pressable.
//      It was, and that collapsed each community card into one accessibility
//      element (and on the web export, role="button" inside role="button" is
//      children-presentational), making the Play-mandated control unreachable
//      for screen readers on the app's only public UGC surface.
//   2. Writes from the moderation sheet must survive the list being torn down.
//      The sheet outlives the list, and the handlers bump loadSeqRef before
//      they know that, which invalidates the in-flight reload; without a guard
//      the screen sits on a loading spinner forever with no retry affordance.
//
// Render tests cannot cover this: RN 0.85 + jest 29 leaves `StyleSheet`
// undefined on import, so /formats cannot be mounted in this suite.

import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../../..");
const source = readFileSync(path.join(root, "src/app/formats.tsx"), "utf8");

/** Comments in this file talk about reload() and setTemplates() by name, so
 *  ordering and absence checks have to run against code only. */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** One named function declaration, bounded by the next sibling declaration and
 *  with comments removed. The file uses CRLF, so never assert across newlines. */
function bodyOf(name: string): string {
  const from = source.indexOf(`function ${name}`);
  expect(from).toBeGreaterThan(-1);
  const rest = source.slice(from + 1);
  const next = rest.search(/\r?\n {2}(?:async )?function /);
  return stripComments(rest.slice(0, next === -1 ? rest.length : next));
}

describe("community format cards expose moderation to assistive tech", () => {
  test("the community card is not wrapped in a card-level Pressable", () => {
    // The whole-card Pressable was the thing that swallowed the nested control,
    // so the card element must come first, before any interactive child.
    const item = source.slice(source.indexOf("partition.community.map"));
    const card = item.indexOf("<PremiumCard");
    const firstPressable = item.indexOf("<Pressable");
    expect(card).toBeGreaterThan(-1);
    expect(card).toBeLessThan(firstPressable);
    expect(item).toContain("<PremiumCard key={t.id} accent={semantic.info}");
  });

  test("guide and report/block are sibling controls, not nested ones", () => {
    const community = source.slice(source.indexOf("partition.community.map"));
    const actions = community.slice(0, community.indexOf("</PremiumCard>"));
    // Two discrete Pressables at the same level inside the actions row.
    expect(actions.match(/<Pressable/g)?.length).toBe(2);
    expect(actions).toContain("styles.cardActions");
    expect(actions).toContain('tf("moderation.action")');
    expect(actions).toContain('tf("labels.viewGuide")');
  });

  test("each control names its row, so a screen reader hears which format", () => {
    expect(source).toContain('accessibilityLabel={`${nameOf(t)} ${tf("moderation.action")}`}');
    expect(source).toContain('accessibilityLabel={`${nameOf(t)} ${tf("labels.viewGuide")}`}');
  });
});

describe("moderation writes cannot strand the screen on a spinner", () => {
  test("the optimistic drop re-fetches when the list is not mounted", () => {
    const drop = bodyOf("dropFromList");
    expect(drop).toContain("templates === null");
    expect(drop).toContain("reload();");
    expect(drop.indexOf("reload();")).toBeLessThan(drop.indexOf("setTemplates("));
  });

  test("both writes go through it rather than filtering blind", () => {
    expect(bodyOf("submitReport")).toContain("dropFromList((x) => x.id !== target.id)");
    expect(bodyOf("submitBlock")).toContain("dropFromList((x) => x.ownerId !== ownerId)");
    // The moderation handlers must not filter the list directly. (The delete
    // handler still may: its modal cannot outlive the list the way the sheet can.)
    expect(bodyOf("submitReport")).not.toContain("setTemplates(");
    expect(bodyOf("submitBlock")).not.toContain("setTemplates(");
  });

  test("lifting all blocks closes the sheet before it reloads the list", () => {
    const body = bodyOf("liftAllBlocks");
    expect(body).toContain("setModerating(null)");
    expect(body.indexOf("setModerating(null)")).toBeLessThan(body.indexOf("reload()"));
  });

  test("a failed write closes the sheet so the toast is not painted over it", () => {
    // PremiumBottomSheet is bottom-anchored and toastWrap sits at bottom:
    // spacing.xl, so an open sheet and the failure toast overlap.
    for (const fn of ["submitReport", "submitBlock"]) {
      const cat = bodyOf(fn).slice(bodyOf(fn).indexOf("} catch"));
      expect(cat).toContain("setModerating(null)");
      expect(cat).toContain("if (templates === null) reload();");
    }
    expect(source).toContain('flashToast(tf("toast.reportFailed"), "danger")');
  });
});

describe("the moderation sheet is bounded", () => {
  test("its content scrolls instead of growing off the top of the screen", () => {
    // styles.sheet in components/premium/feedback.tsx sets no maxHeight and
    // sheetWrap is justifyContent: flex-end, so overflow escapes upward.
    expect(source).toContain("maxHeight: windowHeight * 0.6");
    expect(source).toContain("contentContainerStyle={styles.sheetContent}");
  });
});
