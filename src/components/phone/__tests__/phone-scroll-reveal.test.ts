import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import type { ScrollView, ScrollViewProps } from "react-native";
import { ScrollMemoryScope, useScrollMemory, type ScrollRevealRequest } from "../../../lib/nav/scroll-memory";
import * as account from "../../../lib/auth/account-epoch";
import * as memory from "../../../lib/nav/view-memory";
import { hookHarness } from "../../../lib/nav/__tests__/hook-harness";
Object.assign(globalThis, { React });
const { renderToStaticMarkup } = require("react-dom/server") as { renderToStaticMarkup: (node: React.ReactNode) => string };
const root = join(__dirname, "../../../..");
const source = readFileSync(join(root, "src/components/phone/PhoneUIKit.tsx"), "utf8");
const ast = ts.createSourceFile("PhoneUIKit.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = ast.statements.find(node => ts.isVariableStatement(node)
  && node.declarationList.declarations.some(item => item.name.getText(ast) === "PhoneScrollView"));
if (!declaration) throw new Error("Actual PhoneScrollView declaration missing");
const wrapperCode = ts.transpileModule(declaration.getText(ast), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
}).outputText;
function wrapper(bindings: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  new Function("exports", ...Object.keys(bindings), wrapperCode)(exports, ...Object.values(bindings));
  return exports.PhoneScrollView;
}
const makeRequest = (): ScrollRevealRequest & { onRevealed: jest.Mock } => ({ token: {}, target: { x: 0, y: 0 }, ready: true,
  isCurrent: () => true, onRevealed: jest.fn() });
beforeEach(() => {
  account.__resetAccountEpochForTests(); memory.readViewMemory("reset");
  account.noteResolvedOwner("phone-owner"); memory.readViewMemory("reset");
});

test("actual wrapper React SSR consumes the optional prop without leaking it to its native host", () => {
  const native: Record<string, unknown>[] = [];
  const Host = React.forwardRef<ScrollView, Record<string, unknown>>(function Host(props, _ref) {
    native.push(props); return React.createElement("div", { "data-host": true });
  });
  const Component = wrapper({ React, forwardRef: React.forwardRef, useScrollMemory,
    usePhoneDesign: () => false, mapped: (style: unknown) => style, ScrollView: Host }) as React.ComponentType<ScrollViewProps & { priorityReveal: ScrollRevealRequest }>;
  const r = makeRequest();
  const markup = renderToStaticMarkup(React.createElement(ScrollMemoryScope, { id: "phone:ssr", children:
    React.createElement(Component, { testID: "guidance", priorityReveal: r }) }));
  expect(markup).toContain('data-host="true"'); expect(native).toHaveLength(1);
  expect(native[0].priorityReveal).toBeUndefined(); expect(native[0].token).toBeUndefined();
  expect(native[0].testID).toBe("guidance"); expect(r.onRevealed).not.toHaveBeenCalled();
});

test("actual wrapper and hook defer hidden reveal, preserve ref/key, and reveal on first focus", () => {
  jest.useFakeTimers();
  try {
    const scope = { id: "phone:interview", slots: { next: 0 }, focused: false };
    const h = hookHarness(scope);
    const code = ts.transpileModule(readFileSync(join(root, "src/lib/nav/scroll-memory.tsx"), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
    }).outputText;
    const modules: Record<string, unknown> = { react: h.hooks, "../auth/account-epoch": account, "./view-memory": memory };
    const exports = {} as { useScrollMemory: typeof useScrollMemory };
    new Function("require", "exports", code)((name: string) => {
      if (!(name in modules)) throw new Error(`Unexpected import ${name}`);
      return modules[name];
    }, exports);
    type Host = { type: string; key: number; props: ReturnType<typeof useScrollMemory<ScrollView>> & Record<string, unknown> };
    const Component = wrapper({ forwardRef: (fn: unknown) => fn, useScrollMemory: exports.useScrollMemory,
      usePhoneDesign: () => true, mapped: (style: unknown) => style, ScrollView: "NativeScrollView",
      React: { createElement: (type: string, props: Host["props"] & { key: number }) => ({ type, key: props.key, props }) },
    }) as (props: ScrollViewProps & { priorityReveal: ScrollRevealRequest }, ref: { current: ScrollView | null }) => Host;
    const r = makeRequest(); const forwarded = { current: null as ScrollView | null };
    const scrollTo = jest.fn(); const node = { scrollTo } as unknown as ScrollView;
    let element = h.render(() => Component({ testID: "guidance", priorityReveal: r }, forwarded));
    element.props.ref(node); expect(forwarded.current).toBe(node);
    element.props.onLayout({ nativeEvent: { layout: { width: 320, height: 500 } } } as Parameters<NonNullable<ScrollViewProps["onLayout"]>>[0]);
    element.props.onContentSizeChange(320, 1800);
    expect(scrollTo).not.toHaveBeenCalled(); expect(r.onRevealed).not.toHaveBeenCalled();
    expect(element.props.priorityReveal).toBeUndefined(); expect(element.key).toBe(account.currentAccountEpoch());
    scope.focused = true;
    element = h.render(() => Component({ testID: "guidance", priorityReveal: r }, forwarded));
    expect(scrollTo.mock.calls).toEqual([[{ x: 0, y: 0, animated: false }]]);
    expect(r.onRevealed).toHaveBeenCalledTimes(1); expect(element.type).toBe("NativeScrollView");
    expect(memory.readViewMemory("scroll:phone:interview:guidance")).toEqual({ x: 0, y: 0 });
    h.unmount(); element.props.ref(null); expect(forwarded.current).toBeNull();
  } finally { jest.useRealTimers(); }
});

test("actual nested scope inherits parent focus and explicit active overrides it", () => {
  const text = readFileSync(join(root, "src/lib/nav/scroll-memory.tsx"), "utf8");
  const parsed = ts.createSourceFile("scroll-memory.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "ScrollMemoryScope");
  if (!fn) throw new Error("Actual ScrollMemoryScope missing");
  const code = ts.transpileModule(fn.getText(parsed), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React,
  } }).outputText;
  const exports: { ScrollMemoryScope?: (props: { id: string; active?: boolean; children: null }) => { value: { focused: boolean } } } = {};
  const bindings = { Context: { Provider: "scope" }, useContext: () => ({ focused: false }), useMemo: (read: () => unknown) => read(),
    React: { createElement: (_type: unknown, props: unknown) => props } };
  new Function("exports", ...Object.keys(bindings), code)(exports, ...Object.values(bindings));
  expect(exports.ScrollMemoryScope!({ id: "phone:nested", children: null }).value.focused).toBe(false);
  expect(exports.ScrollMemoryScope!({ id: "phone:nested", active: true, children: null }).value.focused).toBe(true);
});

test("hook harness runs layout effects before passive effects and cleans up each lifetime", () => {
  const h = hookHarness(), calls: string[] = []; let revision = 1;
  const render = () => h.render(() => {
    h.hooks.useEffect(() => { calls.push(`passive${revision}`); return () => { calls.push("clean-passive"); }; }, [revision]);
    h.hooks.useLayoutEffect(() => { calls.push(`layout${revision}`); return () => { calls.push("clean-layout"); }; }, [revision]);
  });
  render(); expect(calls).toEqual(["layout1", "passive1"]);
  revision = 2; render(); expect(calls.slice(2)).toEqual(["clean-layout", "layout2", "clean-passive", "passive2"]);
  h.unmount(); expect(calls.slice(-2).sort()).toEqual(["clean-layout", "clean-passive"]);
});
