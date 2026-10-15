import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import type { ChatAction } from "../ChatActionBar";

type Props = Record<string, unknown>;
type Tree = { type: string; props: Props };
const source = readFileSync(resolve(__dirname, "../ChatActionBar.tsx"), "utf8");
const js = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const jsx = (type: string, props: Props): Tree => ({ type, props });
const modules: Record<string, unknown> = {
  "react/jsx-runtime": { jsx, jsxs: jsx },
  "react-native": { StyleSheet: { create: (value: unknown) => value } },
  "@/components/phone/PhoneUIKit": { PhoneView: "View", PhoneScrollView: "ScrollView", PhonePressable: "Pressable" },
  "@/components/ui/Text": { Text: "Text" },
  "@/components/pixel/PixelGlyph": { PixelGlyph: "PixelGlyph" },
  "@/lib/theme/tokens": { deepSpace: { cardLine: "border", card: "surface", accentSoft: "ink" } },
  "@/lib/theme/m3": { m3: { color: { primary: "primary", onPrimary: "onPrimary" } } },
  "@/theme/typography": { fontFamilies: { readable: "Readable" } },
};
function mount(initial: readonly ChatAction[]) {
  const scrollTo = jest.fn();
  const ref = { current: null as { scrollTo: typeof scrollTo } | null };
  let deps: unknown[] | undefined;
  let pendingEffect: (() => void) | undefined;
  const hooks = {
    useRef: () => ref,
    useEffect: (callback: () => void, nextDeps: unknown[]) => {
      if (!deps || deps.length !== nextDeps.length || nextDeps.some((value, i) => !Object.is(value, deps![i]))) {
        deps = nextDeps; pendingEffect = callback;
      }
    },
  };
  const scopedModules = { ...modules, react: hooks };
  const exported: { ChatActionBar?: (props: { actions: readonly ChatAction[] }) => Tree | null } = {};
  new Function("require", "exports", js)((name: string) => {
    if (!(name in scopedModules)) throw new Error("Unexpected dependency: " + name);
    return scopedModules[name as keyof typeof scopedModules];
  }, exported);
  function update(actions: readonly ChatAction[]) {
    const tree = exported.ChatActionBar!({ actions });
    const scroller = tree?.props.children as Tree | undefined;
    ref.current = scroller ? { scrollTo } : null;
    if (scroller) expect(scroller.props.ref).toBe(ref);
    pendingEffect?.(); pendingEffect = undefined;
    if (!tree || !scroller) return null;
    const buttons = scroller.props.children as Tree[];
    return { tree, scroller, buttons };
  }
  return { update, scrollTo, current: update(initial) };
}
const render = (actions: readonly ChatAction[]) => mount(actions).current;
const flat = (styles: unknown) => Object.assign({}, ...(Array.isArray(styles) ? styles : [styles]));

test("empty actions remove the dock; caller's ranking and callbacks reach each button in order", () => {
  expect(render([])).toBeNull();
  const first = jest.fn(); const second = jest.fn(); const third = jest.fn();
  const host = render([
    { id: "wiki", label: "Save", hint: "Save this exchange", onPress: first, recommended: true },
    { id: "next", label: "Next", onPress: second },
    { id: "why", label: "Why", onPress: third },
  ])!;
  expect(host.buttons.map(button => button.props.testID)).toEqual(["chat-action-wiki", "chat-action-next", "chat-action-why"]);
  for (const button of host.buttons) (button.props.onPress as () => void)();
  expect([first.mock.calls.length, second.mock.calls.length, third.mock.calls.length]).toEqual([1, 1, 1]);
  expect(host.buttons[0].props).toMatchObject({
    accessibilityRole: "button", accessibilityLabel: "Save", accessibilityHint: "Save this exchange",
    accessibilityState: { disabled: false, busy: false },
  });
});

test("disabled and busy semantics are forwarded without losing the button label", () => {
  const host = render([{ id: "wiki", label: "Saving", onPress: jest.fn(), disabled: true, busy: true }])!;
  expect(host.buttons[0].props).toMatchObject({
    disabled: true, accessibilityLabel: "Saving", accessibilityState: { disabled: true, busy: true },
  });
});

test("the recommended action alone receives a star, solid emphasis and matching label contrast", () => {
  const host = render([
    { id: "wiki", label: "Save", onPress: jest.fn(), recommended: true },
    { id: "next", label: "Next", onPress: jest.fn() },
  ])!;
  const [recommended, normal] = host.buttons;
  expect(flat(recommended.props.style)).toMatchObject({ backgroundColor: "primary", borderColor: "primary", minHeight: 44 });
  expect(flat(normal.props.style)).toMatchObject({ backgroundColor: "surface", borderColor: "border" });
  const [star, label] = recommended.props.children as Tree[];
  expect(star).toMatchObject({ type: "PixelGlyph", props: { name: "star", size: 14, color: "onPrimary" } });
  expect(flat(label.props.style)).toMatchObject({ color: "onPrimary", fontWeight: "700" });
  expect((normal.props.children as (Tree | null)[])[0]).toBeNull();
});

test("the 52px horizontal dock never takes transcript flex space and remains usable with the keyboard", () => {
  const host = render([{ id: "next", label: "Next", onPress: jest.fn() }])!;
  expect(flat(host.tree.props.style)).toMatchObject({ height: 52, flexGrow: 0, flexShrink: 0 });
  expect(flat(host.tree.props.style).flex).toBeUndefined();
  expect(flat(host.scroller.props.style)).toMatchObject({ flexGrow: 0, flexShrink: 0 });
  expect(flat(host.scroller.props.style).flex).toBeUndefined();
  expect(host.scroller.props).toMatchObject({ horizontal: true, showsHorizontalScrollIndicator: false, keyboardShouldPersistTaps: "handled" });
  expect(flat(host.scroller.props.contentContainerStyle)).toMatchObject({ paddingVertical: 4, alignItems: "center" });
});

test("a newly first-ranked action resets horizontal scroll once without interrupting browsing on ordinary updates", () => {
  const next = { id: "next", label: "Next", onPress: jest.fn() };
  const wiki = { id: "wiki", label: "Save", onPress: jest.fn(), recommended: true };
  const host = mount([next]);
  expect(host.scrollTo).toHaveBeenCalledTimes(1);
  expect(host.scrollTo).toHaveBeenLastCalledWith({ x: 0, animated: false });
  host.update([{ ...next, label: "Updated next", disabled: true }]);
  expect(host.scrollTo).toHaveBeenCalledTimes(1);
  host.update([wiki, next]);
  expect(host.scrollTo).toHaveBeenCalledTimes(2);
  expect(host.scrollTo).toHaveBeenLastCalledWith({ x: 0, animated: false });
  host.update([{ ...wiki, busy: true }, next]);
  expect(host.scrollTo).toHaveBeenCalledTimes(2);
  host.update([next]);
  expect(host.scrollTo).toHaveBeenCalledTimes(3);
  expect(host.update([])).toBeNull();
  expect(host.scrollTo).toHaveBeenCalledTimes(3);
  host.update([next]);
  expect(host.scrollTo).toHaveBeenCalledTimes(4);
});
