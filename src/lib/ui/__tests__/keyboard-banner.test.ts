import fs from "node:fs";
import path from "node:path";
import { createElement, type ReactNode } from "react";
import ts from "typescript";
import { KeyboardFrameOffsetContext } from "../keyboard-frame";

const { renderToStaticMarkup } = require("react-dom/server") as { renderToStaticMarkup: (element: ReactNode) => string };

const mockCaptured: Array<Record<string, unknown>> = [];
jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
  KeyboardAvoidingView: (props: Record<string, unknown>) => { mockCaptured.push(props); return null; },
  View: () => null,
  Keyboard: {},
}));

// Match the app's automatic JSX runtime while the repository's default Jest
// transform uses classic JSX. Only RN host components are replaced above.
const keyboardModule = {} as typeof import("../keyboard");
const keyboardCode = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../keyboard.tsx"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
new Function("exports", "require", keyboardCode)(keyboardModule, (name: string) =>
  require(name.startsWith(".") ? path.resolve(__dirname, "..", name) : name));
const { KeyboardAvoidingArea } = keyboardModule;

function areaProps(frameOffset: number, offset: number, coordinateSpace: "frame" | "window") {
  mockCaptured.length = 0;
  renderToStaticMarkup(createElement(KeyboardFrameOffsetContext.Provider, { value: frameOffset },
    createElement(KeyboardAvoidingArea, {
      iosKeyboardVerticalOffset: offset,
      iosOffsetCoordinateSpace: coordinateSpace,
    })));
  expect(mockCaptured).toHaveLength(1);
  return mockCaptured[0];
}

// Execute the installed RN calculations and lifecycle, not a copied formula.
// Frames are simulated: this does not establish native keyboard/device behavior.
const source = fs.readFileSync(path.join(process.cwd(),
  "node_modules/react-native/Libraries/Components/Keyboard/KeyboardAvoidingView.js"), "utf8");
const babel = require("@babel/core") as typeof import("@babel/core");
const stripped = babel.transformSync(source, {
  babelrc: false, configFile: false, parserOpts: { plugins: ["jsx"] },
  plugins: [require.resolve("@babel/plugin-transform-flow-strip-types")],
})!.code!;
function method(name: string) {
  const start = stripped.indexOf(name);
  if (start < 0) throw new Error(`RN method missing: ${name}`);
  const open = stripped.indexOf("{", start);
  let end = open + 1; let depth = 1;
  while (depth && end < stripped.length) {
    if (stripped[end] === "{") depth++;
    if (stripped[end] === "}") depth--;
    end++;
  }
  if (depth) throw new Error(`RN method incomplete: ${name}`);
  return stripped.slice(start, end);
}
const actualRn = new Function("Platform", "AccessibilityInfo", `return ({
  ${method("async _relativeKeyboardHeight(")},
  ${method("componentDidUpdate(")}
});`)({ OS: "ios" }, { prefersCrossFadeTransitions: async () => false });

test.each([
  { banner: 0, offset: 0, space: "frame" as const, absoluteParent: 0 },
  { banner: 32, offset: 0, space: "frame" as const, absoluteParent: 32 },
  { banner: 76, offset: 0, space: "frame" as const, absoluteParent: 76 },
  { banner: 76, offset: 60, space: "frame" as const, absoluteParent: 136 },
  { banner: 76, offset: 136, space: "window" as const, absoluteParent: 136 },
])("real RN padding clears the keyboard with $banner px banner / $space offset", async ({ banner, offset, space, absoluteParent }) => {
  const props = areaProps(banner, offset, space);
  const padding = await actualRn._relativeKeyboardHeight.call({
    _frame: { x: 0, y: 0, width: 390, height: 844 - absoluteParent },
    props, state: { bottom: 0 },
  }, { screenY: 544, height: 300 });
  expect(padding).toBe(300);
});

test("open keyboard recalculates after late banner measurement and recovery without remount", async () => {
  const instance = {
    props: areaProps(0, 0, "frame"),
    _frame: { x: 0, y: 0, width: 390, height: 812 },
    _bottom: 268,
    state: { bottom: 268 },
    setState: jest.fn(),
    _updateBottomIfNecessary: jest.fn(async () => {
      instance._bottom = await actualRn._relativeKeyboardHeight.call(instance, { screenY: 544, height: 300 });
    }),
  };
  for (const banner of [32, 76, 0]) {
    const previous = instance.props;
    instance._frame.height = 844 - banner;
    instance.props = areaProps(banner, 0, "frame");
    actualRn.componentDidUpdate.call(instance, previous, instance.state);
    await Promise.resolve();
    expect(instance._bottom).toBe(300);
  }
  expect(instance._updateBottomIfNecessary).toHaveBeenCalledTimes(3);
  actualRn.componentDidUpdate.call(instance, instance.props, instance.state);
  expect(instance._updateBottomIfNecessary).toHaveBeenCalledTimes(3);
});

test("window-measured capture offset is forwarded once after the banner moves its host", () => {
  expect(areaProps(76, 136, "window").keyboardVerticalOffset).toBe(136);
  const views = fs.readFileSync(path.join(process.cwd(), "src/components/deep-space/DeepSpaceViews.tsx"), "utf8");
  expect(views).toContain("measureInWindow((_x, y) => setIosKeyboardOffset(y))");
  expect(views).toContain('iosKeyboardVerticalOffset={iosKeyboardOffset} iosOffsetCoordinateSpace="window"');
});
