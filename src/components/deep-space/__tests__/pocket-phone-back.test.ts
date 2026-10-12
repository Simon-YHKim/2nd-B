import { readFileSync } from "node:fs";
import { createPocketPhoneBackHandler } from "@/lib/nav/pocket-phone-back";

const source = readFileSync("src/components/deep-space/PocketPhone.tsx", "utf8");
const effect = source.slice(source.indexOf("useFocusEffect(useCallback("), source.indexOf("  const activate"));

describe("D3 raised pocket phone hardware Back", () => {
  test("a handler created while stowed lowers a newly raised phone then passes the next press", () => {
    const expanded = { current: false };
    const lower = jest.fn(() => { expanded.current = false; });
    const back = createPocketPhoneBackHandler({ isExpanded: () => expanded.current, lower });
    expanded.current = true;
    expect(back()).toBe(true);
    expect(lower).toHaveBeenCalledTimes(1);
    expect(expanded.current).toBe(false);
    expect(back()).toBe(false);
    expect(lower).toHaveBeenCalledTimes(1);
  });

  test("a stowed phone leaves Back to the next handler", () => {
    const lower = jest.fn();
    const back = createPocketPhoneBackHandler({ isExpanded: () => false, lower });
    expect(back()).toBe(false);
    expect(lower).not.toHaveBeenCalled();
  });

  test("registration follows Android focus and active rather than expansion", () => {
    expect(source).toContain("import { useFocusEffect } from 'expo-router'");
    expect(effect).toContain("useFocusEffect(useCallback(");
    expect(effect).toContain("if (Platform.OS !== 'android' || !active) return;");
    expect(effect).toContain("[active, settle]");
    expect(effect).not.toContain("!isExpanded");
    expect(effect).toContain("return () => sub.remove()");
  });

  test("the registered pure handler reads the live ref and uses the existing stow path", () => {
    expect(effect).toContain("const onBackPress = createPocketPhoneBackHandler({");
    expect(effect).toContain("isExpanded: () => expanded.current");
    expect(effect).toContain("lower: () => settle(false)");
    expect(effect).toContain("BackHandler.addEventListener('hardwareBackPress', onBackPress)");
    expect(effect).not.toMatch(/onOpen|openRef|router|exitApp/);
    const settle = source.slice(source.indexOf("const settle"), source.indexOf("// D3:"));
    expect(settle).toContain("if (!next && expanded.current) stow()");
    expect(settle).toContain("onExpandedChangeRef.current(next)");
    expect(settle.indexOf("expanded.current = next")).toBeLessThan(settle.indexOf("setIsExpanded(next)"));
  });
});
