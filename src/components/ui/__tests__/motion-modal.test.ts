import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

// Execute the actual component against inert native hosts. RN 0.85 cannot be
// mounted by this repo's Jest renderer; the hook host lets interrupted native
// animation callbacks and focus loss be exercised without loading RN.
type Tree = { type: string; props: Record<string, unknown> };
type Props = Record<string, unknown>;
function mount(initial: Props, reduced = false, phone = false, nativeShown = true) {
  const source = readFileSync(resolve(__dirname, "../MotionModal.tsx"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  let index = 0;
  let dirty = false;
  let props = initial;
  let tree: Tree;
  const slots: { value?: unknown; deps?: unknown[]; cleanup?: () => void }[] = [];
  const effects: (() => void)[] = [];
  const animations: { stopped: boolean; toValue: number; duration: number; finish: () => void }[] = [];
  const effect = (fn: () => (() => void) | void, deps: unknown[]) => {
    const slot = slots[index] ?? (slots[index] = {});
    index += 1;
    if (!slot.deps || deps.some((dep, i) => dep !== slot.deps![i])) {
      effects.push(() => { slot.cleanup?.(); slot.cleanup = fn() || undefined; });
      slot.deps = deps;
    }
  };
  const hooks = {
    useState: (initialValue: unknown) => {
      const slot = slots[index] ?? (slots[index] = { value: initialValue });
      index += 1;
      return [slot.value, (next: unknown) => { if (slot.value !== next) { slot.value = next; dirty = true; } }];
    },
    useRef: (value: unknown) => {
      const slot = slots[index] ?? (slots[index] = { value: { current: value } });
      index += 1;
      return slot.value;
    },
    useMemo: (fn: () => unknown, deps: unknown[]) => {
      const slot = slots[index] ?? (slots[index] = {});
      index += 1;
      if (!slot.deps || deps.some((dep, i) => dep !== slot.deps![i])) { slot.value = fn(); slot.deps = deps; }
      return slot.value;
    },
    useEffect: effect, useLayoutEffect: effect,
  };
  class Value {
    constructor(public current: number) {}
    setValue(next: number) { this.current = next; }
    interpolate(config: unknown) { return config; }
  }
  const sceneMotion = jest.fn((scope: string, _kind: string, reduce: boolean) => ({
    duration: reduce ? 0 : scope === "phone" ? 320 : 240,
    easing: (t: number) => t,
    from: { x: 0, y: 48, scale: 1, opacity: 0 },
  }));
  const exported: { MotionModal?: (value: Props) => Tree } = {};
  const modules: Record<string, unknown> = {
    react: hooks,
    "react/jsx-runtime": { jsx: (type: string, value: Props) => ({ type, props: value }), jsxs: (type: string, value: Props) => ({ type, props: value }) },
    "react-native": {
      Modal: "NativeModal", Platform: { OS: "web" }, StyleSheet: { create: (value: unknown) => value },
      Animated: { Value, View: "AnimatedView", timing: (value: Value, config: { toValue: number; duration: number }) => {
        const entry = { stopped: false, ...config, finish: () => {} };
        animations.push(entry);
        return {
          start: (done?: (result: { finished: boolean }) => void) => { entry.finish = () => { value.setValue(config.toValue); done?.({ finished: true }); }; },
          stop: () => { entry.stopped = true; },
        };
      } },
    },
    "@/lib/theme/phone-design-context": { usePhoneDesign: () => phone },
    "@/lib/motion/use-reduced-motion": { useReducedMotionPref: () => reduced },
    "@/lib/motion/scene-motion": { sceneMotion },
  };
  new Function("require", "exports", js)((name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`);
    return modules[name];
  }, exported);
  function render() { index = 0; dirty = false; tree = exported.MotionModal!(props); return tree; }
  function flush() {
    for (let guard = 0; guard < 12; guard += 1) {
      while (effects.length) effects.shift()!();
      if (!dirty) return;
      render();
    }
    throw new Error("Effect/render loop");
  }
  function show() { (tree.props.onShow as (event: unknown) => void)({ nativeEvent: {} }); flush(); }
  render(); flush();
  if (nativeShown && tree!.props.visible) show();
  return {
    get tree() { return tree; }, animations, sceneMotion, show,
    update(next: Props, beforeEffects?: (value: Tree) => void) { props = { ...props, ...next }; const nextTree = render(); beforeEffects?.(nextTree); flush(); },
    reduce() { reduced = true; render(); flush(); },
    finish() { animations[animations.length - 1].finish(); flush(); },
    unmount() { slots.forEach(slot => slot.cleanup?.()); },
  };
}

test("native dialog events survive; ordinary close finishes before the host disappears", () => {
  const onRequestClose = jest.fn(); const onShow = jest.fn(); const onDismiss = jest.fn(); const onExitComplete = jest.fn();
  const host = mount({ visible: true, children: "content", animationType: "slide", onRequestClose, onShow, onDismiss, onExitComplete });
  expect(host.tree).toMatchObject({ type: "NativeModal", props: { visible: true, animationType: "none", onRequestClose, onDismiss } });
  expect(onShow).toHaveBeenCalledTimes(1);
  expect(onShow).toHaveBeenCalledWith({ nativeEvent: {} });
  host.finish(); host.update({ visible: false });
  expect(host.tree.props.visible).toBe(true);
  expect((host.tree.props.children as Tree).props.pointerEvents).toBe("none");
  expect(onExitComplete).not.toHaveBeenCalled();
  host.finish();
  expect(host.tree.props.visible).toBe(false);
  expect(host.tree.props.children).toBeNull();
  expect(onExitComplete).toHaveBeenCalledTimes(1);
  expect(onShow).toHaveBeenCalledTimes(1); expect(onDismiss).not.toHaveBeenCalled();
});

test("blur hides native dialog and unmounts content immediately, even during exit", () => {
  const onExitComplete = jest.fn();
  const host = mount({ visible: true, children: "private", onExitComplete });
  host.update({ visible: false });
  const exit = host.animations[host.animations.length - 1];
  host.update({ active: false }, tree => {
    expect(tree.props.visible).toBe(false); expect(tree.props.children).toBeNull();
  });
  exit.finish();
  expect(exit.stopped).toBe(true); expect(onExitComplete).not.toHaveBeenCalled();
});

test("rapid reopen cancels obsolete exit completion", () => {
  const onExitComplete = jest.fn(); const host = mount({ visible: true, onExitComplete });
  host.update({ visible: false }); const exit = host.animations[host.animations.length - 1];
  host.update({ visible: true }); exit.finish(); host.finish();
  expect(host.tree.props.visible).toBe(true); expect(onExitComplete).not.toHaveBeenCalled();
});

test("reduced motion closes immediately and native default visible remains open", () => {
  const onExitComplete = jest.fn(); const host = mount({ onExitComplete }, true);
  expect(host.tree.props.visible).toBe(true); expect(host.animations).toHaveLength(0);
  host.update({ visible: false }, tree => expect(tree.props.visible).toBe(false));
  expect(onExitComplete).toHaveBeenCalledTimes(1);
  const closed = mount({ visible: false, onExitComplete }, true);
  expect(closed.tree.props.visible).toBe(false); expect(onExitComplete).toHaveBeenCalledTimes(1);
});

test("phone scope uses its own scene motion and unmount cancels pending exit", () => {
  const onExitComplete = jest.fn(); const host = mount({ visible: true, animationType: "slide", onExitComplete }, false, true);
  expect(host.sceneMotion).toHaveBeenCalledWith("phone", "sheet", false);
  expect(host.animations[0].duration).toBe(320);
  host.update({ visible: false }); const exit = host.animations[host.animations.length - 1];
  host.unmount(); exit.finish();
  expect(exit.stopped).toBe(true); expect(onExitComplete).not.toHaveBeenCalled();
});

test("entry waits for the native window; closing before first show cannot leave a dialog behind", () => {
  const onExitComplete = jest.fn();
  const delayed = mount({ visible: true, onExitComplete }, false, false, false);
  expect(delayed.animations).toHaveLength(0);
  delayed.show();
  expect(delayed.animations).toHaveLength(1);
  expect((delayed.tree.props.children as Tree).props.collapsable).toBe(false);
  const interrupted = mount({ visible: true, onExitComplete }, false, false, false);
  interrupted.update({ visible: false });
  expect(interrupted.tree.props.visible).toBe(false);
  expect(interrupted.animations).toHaveLength(0);
  expect(onExitComplete).toHaveBeenCalledTimes(1);
});

test("enabling reduced motion during exit settles immediately and ignores its old animation callback", () => {
  const onExitComplete = jest.fn(); const host = mount({ visible: true, onExitComplete });
  host.update({ visible: false }); const exit = host.animations[host.animations.length - 1];
  host.reduce();
  expect(host.tree.props.visible).toBe(false); expect(exit.stopped).toBe(true);
  exit.finish(); expect(onExitComplete).toHaveBeenCalledTimes(1);
});
