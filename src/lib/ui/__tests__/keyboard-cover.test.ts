// A-Z first-use check, round 4 (Z71, device). While typing in the first-record guide, the guide
// card and its next-step button sat behind the keyboard: the card is drawn in an absolute overlay,
// and the keyboard padding of the area around it does not lift absolute children.
//
// Render tests are blocked in this repo, so the wiring is read from source. The number itself
// (keyboardOverlap) is tested in keyboard-avoidance.test.ts.
import fs from "node:fs";
import path from "node:path";

const read = (file: string): string => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("useKeyboardCover", () => {
  const source = read("src/lib/ui/keyboard.tsx");
  const start = source.indexOf("export function useKeyboardCover(");
  const hook = source.slice(start, source.indexOf("\nexport ", start + 1));

  test("measures the overlay against the keyboard's top edge with the shared overlap rule", () => {
    expect(start).toBeGreaterThan(-1);
    expect(hook).toContain("event.endCoordinates.screenY");
    expect(hook).toContain("ref.current?.measure(");
    expect(hook).toContain("setCover(keyboardOverlap({ pageY, height }, keyboardTop));");
  });

  test("goes back to zero when the keyboard leaves, and drops a measurement that arrives late", () => {
    const hide = hook.slice(hook.indexOf("Keyboard.addListener(hideEvent"));
    expect(hide).toContain("keyboardTopRef.current = null;");
    expect(hide).toContain("setCover(0);");
    expect(hook).toContain("if (keyboardTopRef.current !== keyboardTop) return;");
  });

  test("does not call a function react-native-web lacks", () => {
    expect(hook).toContain("Keyboard.metrics?.()");
    expect(hook).not.toMatch(/Keyboard\.metrics\(\)/);
  });
});

describe("the first-record guide stands above the keyboard", () => {
  const coach = read("src/components/deep-space/FirstRecordCoachmark.tsx");

  test("the bottom bubble rises by the covered height; the top bubble is left alone", () => {
    expect(coach).toContain("const keyboardCover = useKeyboardCover(overlayRef);");
    expect(coach).toContain("!bubbleAbove && keyboardCover > 0 && { bottom: m3.spacing.s8 + keyboardCover },");
    expect(coach).toContain("bubbleBottom: { bottom: m3.spacing.s8 },");
  });

  test("the hook is called before the early return, so hook order never changes", () => {
    expect(coach.indexOf("useKeyboardCover(overlayRef)")).toBeLessThan(coach.indexOf("if (!target) {"));
  });

  test("the pointed-at field is measured again when the keyboard changes its size", () => {
    expect(coach).toContain("}, [keyboardCover, measureTarget]);");
  });
});
