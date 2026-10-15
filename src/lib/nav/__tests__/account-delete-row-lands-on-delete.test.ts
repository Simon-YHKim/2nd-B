// A-Z first-use check, round 3 (Z25, Z26). The account screen's "delete account" row opened
// /privacy at its top, with the delete card at the very bottom, so a first-time user thought
// they had pressed the wrong thing. The row now asks /privacy to open at its end, where the
// delete card is. The same screen also drew the internal build line that Settings already shows.
import fs from "node:fs";
import path from "node:path";

const read = (file: string): string => fs.readFileSync(path.join(process.cwd(), file), "utf8");

const account = read("src/screens/deepspace/dds-account-screen.tsx");
const screens = read("src/screens/deepspace/DeepSpaceDesignScreens.tsx");
const embed = read("src/lib/nav/phone-embed.tsx");

function privacyScreen(): string {
  const start = screens.indexOf("export function DeepSpacePrivacyDesignScreen()");
  const end = screens.indexOf("\nexport function ", start + 1);
  expect(start).toBeGreaterThan(-1);
  return screens.slice(start, end === -1 ? undefined : end);
}

describe("Z25: the delete row lands on the delete card", () => {
  test("the row asks for the delete section and no longer carries a second label", () => {
    expect(account).toContain('router.push("/privacy?section=delete")');
    expect(account).not.toContain('router.push("/privacy")');
    expect(account).not.toContain("consent:account.privacy.label");
  });

  test("/privacy reads that request and hands it to its scroll", () => {
    const privacy = privacyScreen();
    expect(privacy).toContain('useStartAtEndWhen("section", "delete")');
    expect(privacy).toContain('<Shell title={t("privacy.title")} scroll={startAtDelete}>');
    expect(screens).toContain("<ScrollView ref={scroll?.scrollRef} onContentSizeChange={scroll?.onContentSizeChange}");
  });

  // The helper scrolls to the END. That is only the delete card while it stays the last card.
  test("the delete card is still the last card of /privacy", () => {
    const privacy = privacyScreen();
    const lastCard = privacy.lastIndexOf("<Card>");
    expect(lastCard).toBeGreaterThan(-1);
    const tail = privacy.slice(lastCard);
    expect(tail).toContain('t("privacy.deleteAccount.body")');
    expect(tail).toContain('t("privacy.deleteAccount.inputA11y")');
  });

  test("the helper only scrolls when the route asked, and stops following after a moment", () => {
    const start = embed.indexOf("export function useStartAtEndWhen");
    expect(start).toBeGreaterThan(-1);
    const helper = embed.slice(start);
    expect(helper).toContain("useScreenParams<Record<string, string>>()[name] === value");
    expect(helper).toContain("onContentSizeChange: wanted ? onContentSizeChange : undefined");
    expect(helper).toContain("if (now - since.current > START_AT_END_FOLLOW_MS) return;");
  });

  // Measured on 8081 (2026-10-13 03:22): the first version scrolled at once and the screen stayed
  // at 0. The shared scroll view restores its remembered position (0 for a new entry) one frame
  // later and again 180 ms after the content last changed size, which undid the scroll.
  test("the helper scrolls only after the scroll memory's own restore has let go", () => {
    const memory = read("src/lib/nav/scroll-memory.tsx");
    const settle = /memory\.pending = false;\s*\}, (\d+)\);/.exec(memory);
    expect(settle).not.toBeNull();
    const after = /const START_AT_END_AFTER_MS = (\d+);/.exec(embed);
    expect(after).not.toBeNull();
    expect(Number(after?.[1])).toBeGreaterThan(Number(settle?.[1]) + 100);
    expect(embed).toContain("timer.current = setTimeout(() => { timer.current = null; scrollRef.current?.scrollToEnd({ animated: false }); }, START_AT_END_AFTER_MS);");
  });
});

describe("Z26: the account screen shows no build line", () => {
  test("the build line lives on Settings only", () => {
    expect(account).not.toContain("buildInfoLine");
    // Since Z94 Settings draws it through VersionLine, behind a tap on the version.
    expect(read("src/app/settings.tsx")).toContain("<VersionLine style={styles.buildMarker} />");
    expect(read("src/components/ui/VersionLine.tsx")).toContain("{buildInfoLine()}");
  });
});

// A-Z round 3 (Z38, first half): the box showed "DELETE" as an example and read as already typed.
// The word to type is in the sentence above the box; the box itself starts empty.
describe("Z38: the delete confirmation box starts empty", () => {
  test("no example value in the box, the prompt still names the word", () => {
    const privacy = privacyScreen();
    expect(privacy).not.toContain('placeholder="DELETE"');
    expect(privacy).toContain('t("privacy.deleteAccount.typePrompt", { phrase: deleteConfirmWord })');
    expect(privacy).toContain('delConfirm !== deleteConfirmWord');
  });
});
