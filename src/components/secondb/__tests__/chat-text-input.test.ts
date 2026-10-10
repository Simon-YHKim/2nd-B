import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

type Props = Record<string, unknown>;
type Tree = { type: string; props: Props };
type Slot = { value?: unknown; deps?: unknown[]; cleanup?: () => void };

function webInput(value = "draft", naturalHeight = 58) {
  const writes: [string, unknown][] = [];
  const computed: Record<string, string> = {
    width: "300.5px", boxSizing: "border-box", fontFamily: "Galmuri14", fontSize: "15px",
    lineHeight: "22px", paddingTop: "7px", paddingBottom: "7px", borderTopWidth: "2px", borderBottomWidth: "2px",
  };
  const dimensions = { naturalHeight };
  const mirror = {
    value: "", isConnected: false, style: {} as Record<string, string>,
    setAttribute: jest.fn(), remove: jest.fn(() => { mirror.isConnected = false; }),
    get scrollHeight() { return dimensions.naturalHeight; },
  };
  const document = {
    body: { appendChild: jest.fn(() => { mirror.isConnected = true; }) }, createElement: jest.fn(() => mirror),
    defaultView: { getComputedStyle: jest.fn(() => computed) },
  };
  const node = {
    value, ownerDocument: document, offsetHeight: 124, clientHeight: 120,
    style: new Proxy({ height: "124px", minHeight: "44px" }, {
      set(target, property: string, next: string) {
        writes.push([property, next]); Reflect.set(target, property, next); return true;
      },
    }),
    get scrollHeight() {
      return Math.max(dimensions.naturalHeight, parseInt(this.style.height, 10), parseInt(this.style.minHeight, 10));
    },
  };
  return { node, mirror, document, writes, dimensions, computed };
}

// Run the shipping component and handlers with a hook host. RN's native host
// cannot mount in the Node preset, while the DOM measurement is explicit here.
function mount(platform = "web", initial: Props = {}, fontScale = 1) {
  const source = readFileSync(resolve(__dirname, "../ChatTextInput.tsx"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  let cursor = 0; let dirty = false; let tree: Tree;
  const onSubmit = jest.fn(); const onChangeText = jest.fn();
  let props = { value: "draft", onSubmit, onChangeText, ...initial };
  const slots: Slot[] = [];
  const effects: (() => void)[] = [];
  const same = (a: unknown[] | undefined, b: unknown[]) => a?.length === b.length && b.every((v, i) => Object.is(v, a[i]));
  const hooks = {
    forwardRef: (render: unknown) => render,
    useState: (value: unknown) => {
      const slot = slots[cursor] ?? (slots[cursor] = { value }); cursor += 1;
      return [slot.value, (next: unknown) => {
        if (!Object.is(slot.value, next)) { slot.value = next; dirty = true; }
      }];
    },
    useRef: (value: unknown) => {
      const slot = slots[cursor] ?? (slots[cursor] = { value: { current: value } }); cursor += 1;
      return slot.value;
    },
    useCallback: (fn: unknown, deps: unknown[]) => {
      const slot = slots[cursor] ?? (slots[cursor] = {}); cursor += 1;
      if (!same(slot.deps, deps)) { slot.value = fn; slot.deps = deps; }
      return slot.value;
    },
    useLayoutEffect: (fn: () => void | (() => void), deps: unknown[]) => {
      const slot = slots[cursor] ?? (slots[cursor] = {}); cursor += 1;
      if (!same(slot.deps, deps)) {
        effects.push(() => { slot.cleanup?.(); slot.cleanup = fn() || undefined; }); slot.deps = deps;
      }
    },
  };
  const modules: Record<string, unknown> = {
    react: hooks,
    "react/jsx-runtime": { jsx: (type: string, value: Props) => ({ type, props: value }) },
    "react-native": { Platform: { OS: platform }, StyleSheet: { create: (value: unknown) => value }, useWindowDimensions: () => ({ fontScale }) },
    "@/components/phone/PhoneUIKit": { PhoneTextInput: "PhoneTextInput" },
  };
  const exported: { ChatTextInput?: (props: Props, ref: unknown) => Tree } = {};
  new Function("require", "exports", js)((name: string) => {
    if (!(name in modules)) throw new Error("Unexpected dependency: " + name);
    return modules[name];
  }, exported);
  const forwardedRef = { current: null as unknown };
  function render() { cursor = 0; dirty = false; tree = exported.ChatTextInput!(props, forwardedRef); }
  function flush() {
    for (let guard = 0; guard < 12; guard += 1) {
      while (effects.length) effects.shift()!();
      if (!dirty) return;
      render();
    }
    throw new Error("Effect/render loop");
  }
  function invoke(name: string, ...args: unknown[]) {
    (tree.props[name] as (...values: unknown[]) => void)(...args); flush();
  }
  render(); flush();
  return {
    onSubmit, onChangeText, forwardedRef,
    get tree() { return tree; },
    get style() { return Object.assign({}, ...(tree.props.style as object[])); },
    invoke,
    unmount() { for (const slot of slots) slot.cleanup?.(); },
    update(next: Props) { props = { ...props, ...next }; render(); flush(); },
    scale(next: number) { fontScale = next; render(); flush(); },
    resize(height: number) { invoke("onContentSizeChange", { nativeEvent: { contentSize: { height, width: 300 } } }); },
    key(nativeEvent: Props, topLevel: Props = {}) {
      const preventDefault = jest.fn();
      invoke("onKeyPress", { nativeEvent, preventDefault, ...topLevel });
      return preventDefault;
    },
  };
}

test.each(["android", "ios"])("%s grows for wrapping, caps at five lines, shrinks and resets on clear", platform => {
  const host = mount(platform);
  expect(host.tree.type).toBe("PhoneTextInput");
  expect(host.tree.props).toMatchObject({ multiline: true, submitBehavior: "newline", blurOnSubmit: false, scrollEnabled: false });
  expect(host.style.height).toBe(36);
  host.resize(58.25); expect(host.style.height).toBe(59);
  host.resize(112); expect(host.style.height).toBe(112);
  host.resize(450); expect(host.style.height).toBe(124);
  expect(host.tree.props.scrollEnabled).toBe(true);
  host.resize(58); expect(host.style.height).toBe(58);
  expect(host.tree.props.scrollEnabled).toBe(false);
  host.update({ value: "" }); expect(host.style.height).toBe(36);
  host.resize(58); expect(host.style.height).toBe(36);
});

test.each([1, 1.3, 2])("Android font scale %s fits an empty line and retains growth, cap and clearing", fontScale => {
  const host = mount("android", { value: "" }, fontScale);
  const floor = fontScale === 2 ? 62 : 36;
  expect(host.style).toMatchObject({ height: floor, lineHeight: 22, paddingTop: 7, paddingBottom: 7, includeFontPadding: false, textAlignVertical: "center" });
  expect(host.tree.props.allowFontScaling).not.toBe(false);
  expect(host.tree.props.maxFontSizeMultiplier).toBeUndefined();
  if (fontScale === 2) expect(floor - 14 - 4).toBeGreaterThanOrEqual(22 * fontScale);
  host.resize(500); expect(host.style.height).toBe(floor);
  host.invoke("onChangeText", "한글 입력");
  host.update({ value: "한글 입력" });
  host.resize(90); expect(host.style.height).toBe(90);
  host.resize(180); expect(host.style.height).toBe(124);
  expect(host.tree.props.scrollEnabled).toBe(true);
  host.update({ value: "" }); expect(host.style.height).toBe(floor);
  expect(host.tree.props.scrollEnabled).toBe(false);
});

test("Android scale changes resize an already empty draft without waiting for native content", () => {
  const host = mount("android", { value: "" });
  host.scale(2); expect(host.style.height).toBe(62);
  host.scale(1.3); expect(host.style.height).toBe(36);
  host.scale(1); expect(host.style.height).toBe(36);
});

test.each(["web", "ios"])("%s keeps its existing height, alignment and font padding at scale 2", platform => {
  const host = mount(platform, { value: "" }, 2);
  expect(host.style.height).toBe(36);
  expect(host.style.textAlignVertical).toBe("top");
  expect(host.style.includeFontPadding).toBeUndefined();
});

test("the screen explicitly supplies the existing 15/22 input typography", () => {
  const screen = readFileSync(resolve(__dirname, "../../../app/secondb.tsx"), "utf8");
  const inputStyle = screen.match(/pillInput:\s*\{([^}]+)\}/)?.[1];
  expect(inputStyle).toMatch(/fontSize:\s*15\b/);
  expect(inputStyle).toMatch(/lineHeight:\s*22\b/);
});

test("invalid native measurements cannot collapse or poison the input height", () => {
  const host = mount("android"); host.resize(80);
  for (const value of [0, -4, NaN, Infinity, -Infinity]) {
    host.resize(value); expect(host.style.height).toBe(80);
  }
  host.resize(12); expect(host.style.height).toBe(36);
});

test("web measures natural content after wrapping, controlled prefill, voice insertion and width changes", () => {
  const onContentSizeChange = jest.fn(); const onLayout = jest.fn();
  const host = mount("web", { onContentSizeChange, onLayout, placeholder: "Ask", accessibilityLabel: "Message", style: { color: "blue" } });
  const { node, dimensions } = webInput("draft", 200);
  host.invoke("ref", node);
  expect(host.forwardedRef.current).toBe(node);
  host.invoke("onLayout", { nativeEvent: { layout: { width: 300 } } });
  expect(host.style.height).toBe(124);
  expect(host.style.overflowY).toBe("auto");
  dimensions.naturalHeight = 36;
  host.update({ value: "short prefill" });
  expect(host.style.height).toBe(40);
  expect(host.style.overflowY).toBe("hidden");
  expect(node.style).toEqual({ height: "124px", minHeight: "44px" });
  dimensions.naturalHeight = 80; host.update({ value: "voice text appended" });
  expect(host.style.height).toBe(84);
  dimensions.naturalHeight = 102; host.invoke("onLayout", {});
  expect(host.style.height).toBe(106);
  dimensions.naturalHeight = 58; host.resize(200);
  expect(host.style.height).toBe(62);
  expect(onContentSizeChange).toHaveBeenCalledTimes(1);
  expect(onLayout).toHaveBeenCalledTimes(2);
  expect(host.tree.props).toMatchObject({ placeholder: "Ask", accessibilityLabel: "Message" });
  expect(host.style).toMatchObject({ color: "blue", lineHeight: 22, paddingBottom: 7 });
});

test("a wrapped placeholder cannot expand an empty web draft on mount, narrow layout or clear", () => {
  const host = mount("web", { value: "", placeholder: "A long placeholder that wraps at 320px" });
  const { node, dimensions } = webInput("", 58);
  host.invoke("ref", node);
  host.invoke("onLayout", { nativeEvent: { layout: { width: 320 } } });
  expect(host.style.height).toBe(36);
  host.resize(58); expect(host.style.height).toBe(36);
  dimensions.naturalHeight = 80;
  host.invoke("onLayout", { nativeEvent: { layout: { width: 240 } } });
  expect(host.style.height).toBe(36);
  node.value = "Actual wrapped text";
  host.update({ value: node.value });
  expect(host.style.height).toBe(84);
  node.value = ""; host.update({ value: "" });
  expect(host.style.height).toBe(36);
  expect(host.tree.props.scrollEnabled).toBe(false);
  // PhoneTextInput applies its existing 44px minimum after these input styles.
  expect(node.style.minHeight).toBe("44px");
});

test("web sizing never collapses the editing textarea while wrapping or shrinking", () => {
  const host = mount("web");
  const { node, writes, dimensions } = webInput("한글 조합 중", 58);
  host.invoke("ref", node);
  host.resize(58);
  expect(host.style.height).toBe(62);
  dimensions.naturalHeight = 200; host.resize(200);
  expect(host.style.height).toBe(124);
  dimensions.naturalHeight = 36; host.update({ value: "short" });
  expect(host.style.height).toBe(40);
  // Restoring a collapsed input afterwards still disturbs its editing viewport.
  // Measurement may read this element, but only React should apply its new size.
  expect(writes).toEqual([]);
});

test("web measurement matches computed width and type, reuses its hidden node and removes it on unmount", () => {
  const host = mount("web");
  const { node, mirror, document, computed } = webInput("first\n한글");
  host.invoke("ref", node); host.resize(58);
  expect(mirror.value).toBe(node.value);
  expect(mirror.style).toMatchObject(computed);
  expect(mirror.style.visibility).toBe("hidden");
  expect(mirror.setAttribute).toHaveBeenCalledWith("aria-hidden", "true");
  expect(document.body.appendChild).toHaveBeenCalledWith(mirror);
  computed.width = "240.25px";
  host.invoke("onLayout", {});
  expect(mirror.style.width).toBe("240.25px");
  expect(document.createElement).toHaveBeenCalledTimes(1);
  expect(document.body.appendChild).toHaveBeenCalledTimes(1);
  node.value = ""; host.update({ value: "" });
  expect(mirror.value).toBe("");
  host.unmount(); expect(mirror.remove).toHaveBeenCalledTimes(1);
});

test("measurement cannot inherit animation or transform state from the editing input", () => {
  const host = mount("web");
  const { node, mirror, computed } = webInput();
  computed.transition = "height 200ms";
  computed.animation = "pulse 1s infinite";
  computed.transform = "scale(0.8)";
  host.invoke("ref", node); host.resize(58);
  expect(mirror.style.transition).toBeUndefined();
  expect(mirror.style.animation).toBeUndefined();
  expect(mirror.style.transform).toBeUndefined();
});

test("native text changes update the empty guard before the controlled parent renders", () => {
  const host = mount("android", { value: "" });
  host.invoke("onChangeText", "A pasted multiline draft");
  host.resize(80);
  expect(host.style.height).toBe(80);
});

test("web Enter submits once without a second onSubmitEditing path or repeat-key sends", () => {
  const host = mount();
  const preventDefault = host.key({ key: "Enter" });
  expect(preventDefault).toHaveBeenCalledTimes(1);
  expect(host.onSubmit).toHaveBeenCalledTimes(1);
  expect(host.tree.props.onSubmitEditing).toBeUndefined();
  const preventRepeat = host.key({ key: "Enter", repeat: true });
  expect(preventRepeat).toHaveBeenCalledTimes(1);
  expect(host.onSubmit).toHaveBeenCalledTimes(1);
});

test.each([
  [{ key: "Enter", shiftKey: true }, {}],
  [{ key: "Enter" }, { shiftKey: true }],
  [{ key: "Enter", isComposing: true }, {}],
  [{ key: "Enter", keyCode: 229 }, {}],
  [{ key: "Process", keyCode: 229 }, {}],
  [{ key: "a" }, {}],
])("Shift+Enter and IME confirmation remain editing: %j %j", (native, outer) => {
  const host = mount();
  expect(host.key(native, outer)).not.toHaveBeenCalled();
  expect(host.onSubmit).not.toHaveBeenCalled();
});

test.each(["android", "ios"])("%s Enter remains a newline and text changes stay controlled", platform => {
  const host = mount(platform);
  expect(host.key({ key: "Enter" })).not.toHaveBeenCalled();
  expect(host.onSubmit).not.toHaveBeenCalled();
  host.invoke("onChangeText", "first\nsecond");
  expect(host.onChangeText).toHaveBeenCalledWith("first\nsecond");
});
