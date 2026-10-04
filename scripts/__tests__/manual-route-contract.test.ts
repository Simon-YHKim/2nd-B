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

// GATE-06 / BL-03 (PR #2045 r3): the first version matched the raw source with
// regular expressions. Wiring left in a comment or a string satisfied it while the
// real export drew the legacy screen, and a plain comment inside a correct body
// made it fail. The predicate now reads the parsed tree, where comments are trivia
// and strings are literals.
const legacyDispatch = route.replace(dispatch, "return <ManualLegacy />;");
const fakeWiring = `${shippedImport}\nexport default function Manual() {\n  ${dispatch}\n}`;

test.each([
  ["a block comment", `/*\n${fakeWiring}\n*/`],
  ["a line comment", fakeWiring.split("\n").map((line) => `// ${line}`).join("\n")],
  ["a template string", `const NOTE = \`\n${fakeWiring}\n\`;`],
])("wiring kept only inside %s does not count: fails", (_label, decoy) => {
  const mutated = legacyDispatch.replace(shippedImport, decoy);
  expect(legacyDispatch).not.toBe(route);
  expect(mutated).not.toBe(legacyDispatch);
  expect(mutated).toContain(dispatch);
  expect(manualRouteRendersScannedGuide(mutated)).toBe(false);
});

test.each([
  ["before the dispatch", (src: string) => src.replace(dispatch, `// The shipped guide; the legacy half is the rollback skin.\n  ${dispatch}`)],
  ["inside the import braces", (src: string) => src.replace(shippedImport, shippedImport.replace("{ ", "{ /* shipped guide */ "))],
  ["between the signature and the body", (src: string) => src.replace("export default function Manual() {", "export default function Manual() /* route */ {")],
  ["inside the returned element", (src: string) => src.replace(dispatch, "if (isDeepSpaceUI()) return (\n    // the guide C7 scans\n    <DeepSpaceManualScreen />\n  );")],
])("an explanatory comment %s keeps a correct route passing", (_label, edit) => {
  const mutated = edit(route);
  expect(mutated).not.toBe(route);
  expect(manualRouteRendersScannedGuide(mutated)).toBe(true);
});

test.each([
  ["imported from another module", (src: string) => src.replace('from "@/lib/ui-mode";', 'from "@/lib/legacy-ui-mode";')],
  ["aliased from another export", (src: string) => src.replace("import { isDeepSpaceUI }", "import { isLegacyUI as isDeepSpaceUI }")],
  ["shadowed by a local", (src: string) => src.replace("export default function Manual() {", "const isDeepSpaceUI = () => false;\nexport default function Manual() {")],
])("the skin test %s: fails", (_label, edit) => {
  const mutated = edit(route);
  expect(mutated).not.toBe(route);
  expect(manualRouteRendersScannedGuide(mutated)).toBe(false);
});

test.each([
  ["a hoisted function in the route body", (src: string) => src.replace(dispatch, `${dispatch}\n  function DeepSpaceManualScreen() { return <ManualLegacy />; }`)],
  ["a parameter", (src: string) => src.replace("export default function Manual() {", "export default function Manual(DeepSpaceManualScreen = ManualLegacy) {")],
  ["a module-level alias", (src: string) => src.replace(shippedImport, `import { DeepSpaceManualScreen as Guide } from "${MANUAL_GUIDE_MODULE}";\nconst DeepSpaceManualScreen = ManualLegacy;`)],
])("the screen name shadowed by %s: fails", (_label, edit) => {
  const mutated = edit(route);
  expect(mutated).not.toBe(route);
  expect(manualRouteRendersScannedGuide(mutated)).toBe(false);
});

test.each([
  ["a type-only import", (src: string) => src.replace(shippedImport, shippedImport.replace("import {", "import type {"))],
  ["a type-only specifier", (src: string) => src.replace(shippedImport, shippedImport.replace("{ ", "{ type "))],
  ["a second default export", (src: string) => `${src}\nexport { ManualLegacy as default };\n`],
  ["an async default export", (src: string) => src.replace("export default function Manual()", "export default async function Manual()")],
  ["props on the guide", (src: string) => src.replace(dispatch, "if (isDeepSpaceUI()) return <DeepSpaceManualScreen legacy />;")],
  ["a syntax error the parser recovers from", (src: string) => `${src}\nconst broken = ;\n`],
])("%s: fails", (_label, edit) => {
  const mutated = edit(route);
  expect(mutated).not.toBe(route);
  expect(manualRouteRendersScannedGuide(mutated)).toBe(false);
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
