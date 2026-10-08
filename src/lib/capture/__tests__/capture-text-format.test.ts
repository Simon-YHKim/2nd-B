import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const { renderToStaticMarkup } = require("react-dom/server") as {
  renderToStaticMarkup(element: React.ReactNode): string;
};

type HostProps = Record<string, unknown> & { children?: React.ReactNode };
const mockHosts: Array<{ kind: string; props: HostProps }> = [];
jest.mock("react-native", () => {
  const flatten = (value: unknown): Record<string, unknown> | undefined => {
    if (!value) return undefined;
    if (Array.isArray(value)) return Object.assign({}, ...value.map(flatten));
    return value as Record<string, unknown>;
  };
  const host = (kind: string) => React.forwardRef<unknown, HostProps>((props, _ref) => {
    mockHosts.push({ kind, props: { ...props, style: flatten(props.style) } });
    return React.createElement("div", { "data-host": kind }, props.children as React.ReactNode);
  });
  return {
    View: host("view"), Pressable: host("pressable"), Text: host("text"),
    TextInput: host("input"), ScrollView: host("scroll"), FlatList: host("list"),
    TouchableOpacity: host("touchable"), TouchableWithoutFeedback: host("touchable"),
    Animated: { createAnimatedComponent: (component: unknown) => component },
    StyleSheet: { create: (value: unknown) => value, flatten, absoluteFillObject: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } },
    Platform: { OS: "web", select: (options: Record<string, unknown>) => options.web ?? options.default },
  };
});
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock("@/lib/settings/readable-font", () => ({ useFontStyle: () => ({ fontStyle: "pixel" }) }));
jest.mock("@/lib/theme/ThemeContext", () => ({ useThemePalette: () => require("@/lib/theme/tokens").semantic }));

import { SegBtn } from "@/components/m3/SegBtn";
import { PhoneDesignProvider } from "@/lib/theme/phone-design-context";
import { phoneIos } from "@/lib/theme/phone-ios";
import { m3 } from "@/lib/theme/m3";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

// Render the shipping JSX and execute its callback, rather than copying the
// selector's state mapping into a test-only component. Native hosts are inert.
const file = resolve(__dirname, "../../../components/deep-space/DeepSpaceViews.tsx");
const ast = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const capture = ast.statements.find(
  (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "CaptureView",
);
let selector: ts.JsxSelfClosingElement | undefined;
function findSelector(node: ts.Node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "SegBtn") selector = node;
  ts.forEachChild(node, findSelector);
}
if (capture) findSelector(capture);
if (!selector) throw new Error("CaptureView segmented format control is missing");
const code = ts.transpileModule(`(${selector.getText(ast)})`, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText;
const labels: Record<string, string> = {
  "capture:textFormat.general": "일반",
  "capture:modes.fourw.label": "4W1H",
  "capture:modes.memo.help": "memo help",
  "capture:modes.fourw.help": "4W1H help",
};

function harness(phone: boolean, fourwOn = false) {
  const state = { fourwOn, text: "memo draft", fourw: { what: "structured draft" }, photos: [{ uri: "photo.jpg" }] };
  const dirty = jest.fn();
  const setFourwOn = jest.fn((next: boolean) => { state.fourwOn = next; });
  const render = () => {
    mockHosts.length = 0;
    const element = runInNewContext(code, {
      React, SegBtn, ...state, setFourwOn, dirty,
      styles: { capTextFormat: { marginTop: 8 } },
      t: (key: string) => labels[key] ?? key,
    }) as React.ReactElement;
    renderToStaticMarkup(phone ? React.createElement(PhoneDesignProvider, {}, element) : element);
    return mockHosts.filter(host => host.kind === "pressable").map(host => host.props);
  };
  return { state, dirty, setFourwOn, render };
}

test.each([false, true])("both formats remain visible and exactly one is checked (phone=%s)", phone => {
  for (const fourwOn of [false, true]) {
    const controls = harness(phone, fourwOn).render();
    expect(controls.map(control => control.accessibilityLabel)).toEqual(["일반", "4W1H"]);
    expect(controls.map(control => control.accessibilityRole)).toEqual(["radio", "radio"]);
    expect(controls.map(control => control["aria-checked"])).toEqual([!fourwOn, fourwOn]);
    expect(controls.map(control => control.accessibilityHint)).toEqual(["memo help", "4W1H help"]);
    expect(mockHosts.filter(host => host.props.accessibilityRole === "radiogroup")).toHaveLength(1);
    for (const control of controls) expect(control.style).toMatchObject({ minHeight: 48 });
  }
});

test.each([false, true])("selecting an active format is inert and switching retains both drafts and photos (phone=%s)", phone => {
  const h = harness(phone);
  const drafts = { text: h.state.text, fourw: h.state.fourw, photos: h.state.photos };
  let controls = h.render();
  (controls[0].onPress as () => void)();
  expect(h.setFourwOn).not.toHaveBeenCalled();
  expect(h.dirty).not.toHaveBeenCalled();
  (controls[1].onPress as () => void)();
  expect(h.state.fourwOn).toBe(true);
  controls = h.render();
  (controls[1].onPress as () => void)();
  expect(h.setFourwOn).toHaveBeenCalledTimes(1);
  (controls[0].onPress as () => void)();
  expect(h.state.fourwOn).toBe(false);
  expect(h.dirty).toHaveBeenCalledTimes(2);
  expect(h.state.text).toBe(drafts.text);
  expect(h.state.fourw).toBe(drafts.fourw);
  expect(h.state.photos).toBe(drafts.photos);
});

test("the shared selector retains pixel surfaces outside the phone and iOS surfaces inside", () => {
  const backgrounds = () => mockHosts.map(host => (host.props.style as Record<string, unknown> | undefined)?.backgroundColor).filter(Boolean);
  harness(false).render();
  expect(backgrounds()).toContain(m3.color.secondaryContainer);
  harness(true).render();
  expect(backgrounds()).toContain(phoneIos.fill);
  expect(backgrounds()).toContain(phoneIos.cell);
  expect(backgrounds()).not.toContain(m3.color.secondaryContainer);
});
