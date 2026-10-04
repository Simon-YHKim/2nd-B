import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MANUAL_GUIDE_MODULE, manualRouteRendersScannedGuide } from "../manual-route-contract";

// GATE-02 (PR #2045): the lint cleanup dropped C7's unused route read, and with it
// the only thing in C7 that failed when /manual went away. These pin the named
// condition that replaced it.
const route = readFileSync(resolve(__dirname, "../../src/app/manual.tsx"), "utf8");
const shippedImport = `import { DeepSpaceManualScreen } from "${MANUAL_GUIDE_MODULE}";`;
const dispatch = "if (isDeepSpaceUI()) return <DeepSpaceManualScreen />;";

test("the /manual route renders the shipped guide that C7 scans", () => {
  expect(route).toContain(shippedImport);
  expect(route).toContain(dispatch);
  expect(manualRouteRendersScannedGuide(route)).toBe(true);
});

test("a deleted or empty route fails", () => {
  expect(manualRouteRendersScannedGuide("")).toBe(false);
});

test("re-pointing the route at the same-name shadow copy fails", () => {
  const shadow = route.replace(
    shippedImport,
    'import { DeepSpaceManualScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";',
  );
  expect(shadow).not.toBe(route);
  expect(manualRouteRendersScannedGuide(shadow)).toBe(false);
});

test("an alias that hands the name to another screen fails", () => {
  const aliased = route.replace(
    shippedImport,
    `import { DeepSpaceManualScreen as ShippedGuide } from "${MANUAL_GUIDE_MODULE}";\n` +
      'import { DeepSpaceManualScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";',
  );
  expect(aliased).not.toBe(route);
  expect(manualRouteRendersScannedGuide(aliased)).toBe(false);

  const renamed = route.replace(
    shippedImport,
    `import { DeepSpaceInboxScreen as DeepSpaceManualScreen } from "${MANUAL_GUIDE_MODULE}";`,
  );
  expect(renamed).not.toBe(route);
  expect(manualRouteRendersScannedGuide(renamed)).toBe(false);
});

test.each([
  ["the skin branch draws the legacy half", "if (isDeepSpaceUI()) return <ManualLegacy />;"],
  ["the skin branch is inverted", "if (!isDeepSpaceUI()) return <DeepSpaceManualScreen />;"],
  ["the dispatch is gone", ""],
])("%s: fails", (_label, replacement) => {
  const mutated = route.replace(dispatch, replacement);
  expect(mutated).not.toBe(route);
  expect(manualRouteRendersScannedGuide(mutated)).toBe(false);
});

test("the wrapper left after the legacy half retires still passes", () => {
  const wrapper =
    "// Route: /manual. The screen itself is DeepSpaceManualScreen.\n" +
    `${shippedImport}\n\n` +
    "export default function Manual() {\n  return <DeepSpaceManualScreen />;\n}\n";
  expect(manualRouteRendersScannedGuide(wrapper)).toBe(true);
  expect(manualRouteRendersScannedGuide(wrapper.replace(/\n/g, "\r\n"))).toBe(true);
});

test("C7 reads the route and requires the wiring in its verdict", () => {
  const checker = readFileSync(resolve(__dirname, "../check-constraints.ts"), "utf8").replace(/\r\n?/g, "\n");
  const start = checker.indexOf('check("C7"');
  const end = checker.indexOf('check("C8"');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const c7 = checker.slice(start, end);
  expect(c7).toContain('manualRouteRendersScannedGuide(read("src/app/manual.tsx"))');
  const verdict = /const ok =([\s\S]*?);/.exec(c7);
  expect(verdict).not.toBeNull();
  expect(verdict?.[1]).toContain("manualRouteShipsScannedGuide");
});
