import { readFileSync } from "node:fs";
import path from "node:path";

import {
  dialogueSlice,
  shouldPlayDialogueBlip,
} from "@/lib/motion/dialogue-typewriter";

const root = path.resolve(__dirname, "../../../..");

describe("JRPG dialogue presentation", () => {
  test("typewriter slices by Unicode code point", () => {
    expect(dialogueSlice("안녕🌟", 0)).toBe("");
    expect(dialogueSlice("안녕🌟", 2)).toBe("안녕");
    expect(dialogueSlice("안녕🌟", 3)).toBe("안녕🌟");
  });

  test("blips stay sparse and skip whitespace or punctuation", () => {
    expect(shouldPlayDialogueBlip("세", 1)).toBe(true);
    expect(shouldPlayDialogueBlip("컨", 2)).toBe(false);
    expect(shouldPlayDialogueBlip(" ", 3)).toBe(false);
    expect(shouldPlayDialogueBlip(".", 5)).toBe(false);
  });

  test("home wires the local sound and reduced-motion typewriter", () => {
    const home = readFileSync(
      path.join(root, "src/components/deep-space/ConstellationHome.tsx"),
      "utf8",
    );
    const dialogue = readFileSync(
      path.join(root, "src/components/deep-space/JrpgDialogueBox.tsx"),
      "utf8",
    );

    expect(home).toContain("jrpg-text-blip.mp3");
    expect(home).toContain("useReducedMotionPref()");
    expect(home).toContain("useJrpgTypewriter");
    expect(dialogue).toContain("clearTimeout(timerRef.current)");
    expect(dialogue).toContain("reducedMotion || glyphs.length === 0");
  });

  test("dialogue frame is visually distinct and keeps actions inside its width", () => {
    const home = readFileSync(
      path.join(root, "src/components/deep-space/ConstellationHome.tsx"),
      "utf8",
    );
    const dialogue = readFileSync(
      path.join(root, "src/components/deep-space/JrpgDialogueBox.tsx"),
      "utf8",
    );

    expect(dialogue).toContain('variant="bevel"');
    expect(dialogue).toContain("background={m3.color.surfaceContainerHigh}");
    expect(dialogue).toContain("maxWidth: 440");
    expect(dialogue).toContain("minHeight: 128");
    expect(dialogue).not.toContain("paddingLeft: 120");
    expect(dialogue).toContain('alignSelf: "stretch"');
    expect(home).not.toContain('bubbleActions: { width: "100%"');
  });

  test("home dialogue joins the bottom navigation and keeps actions on one row", () => {
    const home = readFileSync(
      path.join(root, "src/components/deep-space/ConstellationHome.tsx"),
      "utf8",
    );
    const shell = readFileSync(
      path.join(root, "src/components/deep-space/DeepSpaceScreen.tsx"),
      "utf8",
    );

    expect(home).toContain("dialogueAnchor: {");
    expect(home).toContain("bottom: 0");
    expect(home).not.toContain('top: "50%"');
    expect(home).not.toContain("marginTop: -130");
    expect(home).toContain('flexDirection: "row"');
    expect(home).toContain("dialogueAction: {");
    expect(home).toContain("flex: 1");
    expect(shell).toContain("style={styles.buttonDock}");
  });

  test("home reserves dialogue space, cycles usage tips, and keeps compact actions beside the portrait", () => {
    const home = readFileSync(
      path.join(root, "src/components/deep-space/ConstellationHome.tsx"),
      "utf8",
    );
    const dialogue = readFileSync(
      path.join(root, "src/components/deep-space/JrpgDialogueBox.tsx"),
      "utf8",
    );

    expect(home).toContain("DIALOGUE_STAGE_HEIGHT");
    expect(home).toContain("stage.h - dialogueStageHeight");
    expect(home).toContain("{ kind: \"tip\", index: 0 }");
    expect(home).toContain("HOME_TIP_KEYS");
    expect(home).toContain("current.index + 1 < HOME_TIP_KEYS.length");
    expect(dialogue).toContain(
      "{isComplete && actions ? <View style={styles.actions}>{actions}</View> : null}",
    );
    expect(dialogue).toContain('marginTop: "auto"');
    expect(home).toContain("minHeight: 32");
  });

  test("completed dialogue remains tappable, tips expose actions, and every dock tab uses button surfaces", () => {
    const home = readFileSync(
      path.join(root, "src/components/deep-space/ConstellationHome.tsx"),
      "utf8",
    );
    const dialogue = readFileSync(
      path.join(root, "src/components/deep-space/JrpgDialogueBox.tsx"),
      "utf8",
    );
    const shell = readFileSync(
      path.join(root, "src/components/deep-space/DeepSpaceScreen.tsx"),
      "utf8",
    );
    const nav = readFileSync(
      path.join(root, "src/components/m3/MdNavBar.tsx"),
      "utf8",
    );

    expect(dialogue).toContain("onAdvance: () => void");
    expect(dialogue).toContain("onPress={isComplete ? onAdvance : onReveal}");
    expect(dialogue).not.toContain("disabled={isComplete}");
    expect(home).toContain('label={t("ds.home.bubble.next")}');
    expect(home).toContain('label={t("ds.home.bubble.openMenu")}');
    const dock = shell.slice(shell.indexOf("<MdNavBar"), shell.indexOf("/>", shell.indexOf("<MdNavBar")));
    expect(dock).toMatch(/\bbuttonLike\b/);
    expect(dock).not.toMatch(/buttonLike=\{/);
    expect(nav).toContain("buttonLike = false");
    expect(nav).toContain("buttonTab:");
    expect(nav).toContain("buttonTabActive:");
    expect(nav).toContain("buttonLike && styles.buttonTab");
  });

  test("dialogue matches portrait height while the full copy column stays interactive", () => {
    const home = readFileSync(
      path.join(root, "src/components/deep-space/ConstellationHome.tsx"),
      "utf8",
    );
    const dialogue = readFileSync(
      path.join(root, "src/components/deep-space/JrpgDialogueBox.tsx"),
      "utf8",
    );

    expect(home).toContain("DIALOGUE_STAGE_HEIGHT = 136");
    expect(home).toContain("DIALOGUE_ACTION_HIT_SLOP = 6");
    expect(home).toContain("hitSlop={DIALOGUE_ACTION_HIT_SLOP}");
    expect(home).toContain("minHeight: 32");
    expect(dialogue).toContain("...StyleSheet.absoluteFill");
    expect(dialogue).toContain('pointerEvents="none"');
    expect(dialogue).toContain("copyContent:");
    expect(dialogue).toContain("zIndex: 1");
  });
});
