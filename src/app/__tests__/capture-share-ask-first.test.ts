import { readFileSync } from "node:fs";
import { join } from "node:path";

// Q-261013-78 (Simon, 2026-10-13, option 나) and Z113, on the scrap screen. The planner's rule is
// tested in src/lib/capture/__tests__/share-ask-first.test.ts; this file pins how the screen uses it.
const screen = readFileSync(join(__dirname, "..", "capture.tsx"), "utf8").replace(/\r\n/g, "\n");
const LOCALES = ["en", "ko", "es", "pt", "id"] as const;

describe("a share landing on unsaved text in the link box asks first", () => {
  test("the delivery is planned with hold, and the held share is kept before the drafts are persisted", () => {
    expect(screen).toContain('      liveDomainIntent: domainIntent,\n      existingLinkText: "hold",\n    });');
    expect(screen).toContain("    setHeldShare(plan.held);\n    const durableWrite = persistDrafts(plan.persistMode);");
  });

  test("the card sits above the box, announces itself, and offers exactly the two answers", () => {
    const card = screen.slice(screen.indexOf("{heldShare !== null ? ("), screen.indexOf('placeholder={t("linkClip.placeholder")}'));
    expect(card).toContain('<View accessibilityRole="alert" style={styles.heldShare} testID="capture-held-share">');
    expect(card).toContain('{t("sharedOverDraft.title")}');
    expect(card.match(/<Pressable /g)).toHaveLength(2);
    expect(card).toContain('onPress={() => resolveHeldShare("append")} accessibilityRole="button" accessibilityLabel={t("sharedOverDraft.append")}');
    expect(card).toContain('onPress={() => resolveHeldShare("replace")} accessibilityRole="button" accessibilityLabel={t("sharedOverDraft.replace")}');
    expect(card).not.toContain("Modal");
    expect(card.indexOf("capture-held-share")).toBeLessThan(card.indexOf("<Input"));
  });

  test("both answers go through the ordinary edit path, and clearing happens only on the explicit tap", () => {
    const handler = screen.slice(screen.indexOf("function resolveHeldShare("), screen.indexOf("function changeTopic("));
    expect(handler).toContain("if (heldShare === null) return;");
    expect(handler).toContain("setHeldShare(null);");
    expect(handler).toContain('changeBody(choice === "append" ? appendSharedChunk(body, content) : content);');
    expect(handler).toContain('if (choice === "replace") setTagsEditable(tag === null ? [] : [tag]);');
    expect(handler).not.toContain("setBody(");
  });

  test("with the box emptied (saved or cleared by hand) the held share takes it without asking", () => {
    expect(screen).toContain(
      '    if (heldShare === null || mode !== "linkclip" || submitting || body.trim().length > 0) return;\n    resolveHeldShare("replace");',
    );
  });

  test("the buttons are large enough to press", () => {
    const style = screen.slice(screen.indexOf("  heldShareButton: {"), screen.indexOf("  voiceControlRow:"));
    expect(style).toContain("minHeight: 44");
  });

  test.each(LOCALES)("%s has the three strings", (locale) => {
    const capture = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "locales", locale, "capture.json"), "utf8"));
    for (const key of ["title", "append", "replace"]) {
      expect(capture.sharedOverDraft[key].trim().length).toBeGreaterThan(2);
    }
  });

  test("the Korean strings are the ones that were decided", () => {
    const capture = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "locales", "ko", "capture.json"), "utf8"));
    expect(capture.sharedOverDraft).toEqual({ title: "쓰던 글이 있습니다.", append: "이어 붙이기", replace: "쓰던 글 지우고 새로" });
  });
});

describe("a share with a title and one address is shown and saved as a link", () => {
  test("the hint names the link's kind for a bare address and for a titled one", () => {
    expect(screen).toContain('const titledLink = useMemo(() => (linkClipKind === "markdown" ? titledLinkIn(body) : null), [linkClipKind, body]);');
    expect(screen).toContain('linkClipKind === "url" ? detectClipperKind(body.trim()) : titledLink !== null ? detectClipperKind(titledLink.url) : "inbox"');
    expect(screen).toContain('{linkClipKind === "url" || titledLink !== null ? (');
  });

  test("the record is saved under the shared title with the address as its link", () => {
    expect(screen).toContain('const titledLinkDraft = submittedMode === "linkclip" && !isBareLink ? titledLinkIn(sourceDraft.body) : null;');
    expect(screen).toContain("isBareLink ? sourceDraft.body.trim() : titledLinkDraft?.url ?? firstUrlIn(sourceDraft.body)");
    expect(screen).toContain("finalBody = `# ${titledLinkDraft.title}\\n\\n${titledLinkDraft.url}`;");
  });
});
