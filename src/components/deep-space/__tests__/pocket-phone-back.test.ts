import { readFileSync } from "node:fs";

const source = readFileSync("src/components/deep-space/PocketPhone.tsx", "utf8");
const effect = source.slice(source.indexOf("useFocusEffect(useCallback("), source.indexOf("  const activate"));

describe("D3 raised pocket phone hardware Back", () => {
  test("subscribes only on focused Android home while raised", () => {
    expect(source).toContain("import { useFocusEffect } from 'expo-router'");
    expect(effect).toContain("useFocusEffect(useCallback(");
    expect(effect).toContain("if (Platform.OS !== 'android' || !active || !isExpanded) return;");
    expect(effect).toContain("[active, isExpanded, settle]");
    expect(effect).toContain("return () => sub.remove()");
  });

  test("lowers the phone and consumes one press without navigating", () => {
    expect(effect).toContain("BackHandler.addEventListener('hardwareBackPress'");
    expect(effect).toMatch(/settle\(false\);\s*return true;/);
    // A second press before the rerender must reach the normal home handler.
    expect(effect).toContain("if (!expanded.current) return false;");
    expect(effect).not.toMatch(/onOpen|openRef|router|exitApp/);
    const settle = source.slice(source.indexOf("const settle"), source.indexOf("// D3:"));
    expect(settle).toContain("if (!next && expanded.current) stow()");
    expect(settle).toContain("onExpandedChangeRef.current(next)");
  });
});
