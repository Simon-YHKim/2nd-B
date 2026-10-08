import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import * as expression from "@/lib/companion/expression";
import { hustlekExpressionFor } from "@/lib/companion/hustlek-expression";
import * as lifePolicy from "@/lib/companion/hustlek-life";

type Props = Record<string, unknown>;
type Tree = { type: string; props: Props };
type Slot = { value?: unknown; deps?: unknown[]; cleanup?: () => void };

// Execute the real renderer and expression bus with inert native hosts, matching
// MotionModal's runtime harness. RN 0.85 itself cannot mount in the Node preset.
function mount(initial: Props = {}, platform = "web") {
  let reduced = false;
  const appListeners = new Set<() => void>();
  const visibilityListeners = new Set<() => void>();
  const app = { currentState: "active", addEventListener: (_event: string, fn: () => void) => { appListeners.add(fn); return { remove: () => appListeners.delete(fn) }; } };
  const doc = { hidden: false, addEventListener: (_event: string, fn: () => void) => visibilityListeners.add(fn), removeEventListener: (_event: string, fn: () => void) => visibilityListeners.delete(fn) };
  const source = readFileSync(resolve(__dirname, "../SecondbHead.tsx"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  let index = 0; let dirty = false; let mounted = true; let lateUpdates = 0;
  let props = initial; let tree: Tree;
  const slots: Slot[] = [];
  const effects: (() => void)[] = [];
  const same = (a: unknown[] | undefined, b: unknown[]) => a && a.length === b.length && b.every((v, i) => Object.is(v, a[i]));
  const hooks = {
    useState: (initialValue: unknown) => {
      const slot = slots[index] ?? (slots[index] = { value: typeof initialValue === "function" ? initialValue() : initialValue });
      index += 1;
      return [slot.value, (next: unknown) => {
        if (!mounted) lateUpdates += 1;
        const value = typeof next === "function" ? next(slot.value) : next;
        if (!Object.is(slot.value, value)) { slot.value = value; dirty = true; }
      }];
    },
    useRef: (value: unknown) => {
      const slot = slots[index] ?? (slots[index] = { value: { current: value } });
      index += 1; return slot.value;
    },
    useMemo: (fn: () => unknown, deps: unknown[]) => {
      const slot = slots[index] ?? (slots[index] = {}); index += 1;
      if (!same(slot.deps, deps)) { slot.value = fn(); slot.deps = deps; }
      return slot.value;
    },
    useEffect: (fn: () => (() => void) | void, deps: unknown[]) => {
      const slot = slots[index] ?? (slots[index] = {}); index += 1;
      if (!same(slot.deps, deps)) {
        effects.push(() => { slot.cleanup?.(); slot.cleanup = fn() || undefined; });
        slot.deps = deps;
      }
    },
  };
  const modules: Record<string, unknown> = {
    react: hooks,
    "react/jsx-runtime": { jsx: (type: string, value: Props) => ({ type, props: value }) },
    "react-native": {
      View: "View", StyleSheet: { create: (value: unknown) => value }, AppState: app, Platform: { OS: platform },
    },
    "@/lib/companion/expression": expression,
    "@/lib/companion/hustlek-life": lifePolicy,
    "./hustlek-life": lifePolicy,
    "@/lib/motion/use-reduced-motion": { useReducedMotionPref: () => reduced },
    "@/lib/companion/hustlek-expression": { hustlekExpressionFor },
    "@/components/character/HustleKPortrait": { HustleKPortrait: "HustleKPortrait" },
  };
  const lifeJs = ts.transpileModule(readFileSync(resolve(__dirname, "../../../lib/companion/use-hustlek-life.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const lifeExports = {};
  new Function("require", "exports", "document", lifeJs)((name: string) => {
    if (!(name in modules)) throw new Error("Unexpected life dependency: " + name);
    return modules[name];
  }, lifeExports, doc);
  modules["@/lib/companion/use-hustlek-life"] = lifeExports;
  const exported: { SecondbHead?: (value: Props) => Tree } = {};
  new Function("require", "exports", js)((name: string) => {
    if (!(name in modules)) throw new Error("Unexpected dependency: " + name);
    return modules[name];
  }, exported);
  function render() { index = 0; dirty = false; tree = exported.SecondbHead!(props); }
  function flush() {
    for (let guard = 0; guard < 12; guard += 1) {
      while (effects.length) effects.shift()!();
      if (!dirty) return;
      render();
    }
    throw new Error("Effect/render loop");
  }
  render(); flush();
  return {
    get tree() { return tree; },
    get portrait() { return tree.props.children as Tree; },
    get lateUpdates() { return lateUpdates; },
    flush,
    get listenerCount() { return appListeners.size + visibilityListeners.size; },
    reduced(value: boolean) { reduced = value; render(); flush(); },
    appState(value: string) { app.currentState = value; appListeners.forEach(fn => fn()); flush(); },
    visible(value: boolean) { doc.hidden = !value; visibilityListeners.forEach(fn => fn()); flush(); },
    advance(ms: number) { jest.advanceTimersByTime(ms); flush(); },
    update(next: Props) { props = { ...props, ...next }; render(); flush(); },
    unmount() { slots.forEach(slot => slot.cleanup?.()); mounted = false; },
  };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

test("an already active hold appears on first mount; reactions expire back through nested holds to mood", () => {
  const releaseThinking = expression.holdExpression("thinking");
  const host = mount({ mood: "negative" });
  expect(host.portrait.props.expression).toBe("B04");
  const releaseSad = expression.holdExpression("sad"); host.flush();
  expect(host.portrait.props.expression).toBe("C08");
  expression.reactExpression("delight", 700); host.flush();
  expect(host.portrait.props.expression).toBe("A12");
  host.advance(700); expect(host.portrait.props.expression).toBe("C08");
  releaseSad(); host.flush(); expect(host.portrait.props.expression).toBe("B04");
  releaseThinking(); host.flush(); expect(host.portrait.props.expression).toBe("C07");
  host.unmount();
});

test("a newer reaction owns its whole duration and prop changes do not reset it", () => {
  const host = mount();
  expression.reactExpression("happy", 1000); host.flush(); host.advance(750);
  expression.reactExpression("sad", 700); host.flush(); host.update({ mood: "positive" });
  host.advance(251); expect(host.portrait.props.expression).toBe("C08");
  host.advance(449); expect(host.portrait.props.expression).toBe("A02");
  host.unmount(); expect(jest.getTimerCount()).toBe(0);
});

test("idle time and the legacy track prop cannot move the portrait or pick a random face", () => {
  const random = jest.spyOn(Math, "random");
  const host = mount({ size: 80, track: true, accessibilityLabel: "HustleK" });
  const initial = host.tree;
  host.advance(10 * 60_000);
  expect(host.tree).toBe(initial);
  expect(host.tree.type).toBe("View");
  expect(host.tree.props).not.toHaveProperty("onLayout");
  expect(host.portrait.props).toMatchObject({ size: 80, expression: "A01", accessibilityLabel: "HustleK" });
  expect(random).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
  host.update({ track: false });
  expect(host.tree.props.style).toEqual(initial.props.style);
  host.unmount();
});

test("caller context persists through time and returns after app events, at the same position", () => {
  const host = mount({ expression: "B01", size: 40 });
  const stableStyle = host.tree.props.style;
  const release = expression.holdExpression("thinking"); host.flush();
  expect(host.portrait.props.expression).toBe("B04");
  expression.reactExpression("happy", 100); host.flush();
  expect(host.portrait.props.expression).toBe("A04");
  host.update({ expression: "A10" });
  host.advance(100); expect(host.portrait.props.expression).toBe("B04");
  release(); host.flush(); expect(host.portrait.props.expression).toBe("A10");
  host.advance(60_000); expect(host.portrait.props.expression).toBe("A10");
  expect(host.tree.props.style).toEqual(stableStyle);
  expect(host.portrait.props.size).toBe(40);
  host.unmount();
});

test("unmount clears the pending reaction and unsubscribes both buses", () => {
  const host = mount();
  expression.reactExpression("happy", 1000); host.flush();
  host.unmount();
  expect(jest.getTimerCount()).toBe(0);
  const release = expression.holdExpression("thinking");
  expression.reactExpression("sad", 1000); release();
  jest.advanceTimersByTime(60_000);
  expect(host.lateUpdates).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
});


test("speech changes only the mouth on an uneven cadence and closes on punctuation, completion and disable", () => {
  const host = mount({ speaking: true, speechText: "안녕", idle: true, size: 80 });
  const initialStyle = host.tree.props.style;
  expect(host.portrait.props).toMatchObject({ expression: "A01", mouth: "small", size: 80 });
  host.advance(110); expect(host.portrait.props.mouth).toBeNull();
  host.advance(85); expect(host.portrait.props.mouth).toBe("open");
  expect(host.portrait.props.expression).toBe("A01");
  expect(host.tree.props.style).toEqual(initialStyle);
  host.update({ speechText: "안녕." }); expect(host.portrait.props.mouth).toBeNull();
  host.advance(64); expect(host.portrait.props.mouth).toBeNull();
  host.update({ speechText: "안녕. 반가워" }); host.advance(64);
  expect(host.portrait.props.expression).toBe("A01");
  host.update({ speaking: false }); expect(host.portrait.props.mouth).toBeNull();
  expect(jest.getTimerCount()).toBe(1); // quiet home timer only
  host.update({ active: false }); expect(jest.getTimerCount()).toBe(0);
  expect(host.listenerCount).toBe(0);
  host.unmount();
});

test("idle home smiles briefly and only yawns after a long uninterrupted quiet stretch", () => {
  jest.spyOn(Math, "random").mockReturnValue(0.8); // 22 second gaps
  const host = mount({ idle: true });
  host.advance(22_000); expect(host.portrait.props.expression).toBe("A03");
  host.advance(2640); expect(host.portrait.props.expression).toBe("A01");
  host.advance(22_000); expect(host.portrait.props.expression).toBe("A03");
  host.advance(2640 + 22_000); expect(host.portrait.props.expression).toBe("D11");
  host.advance(1500); expect(host.portrait.props.expression).toBe("D10");
  host.advance(2200); expect(host.portrait.props.expression).toBe("A01");
  host.unmount(); expect(jest.getTimerCount()).toBe(0);
});

test("a real reaction or thinking context interrupts idle and speech then restarts a fresh quiet stretch", () => {
  jest.spyOn(Math, "random").mockReturnValue(0);
  const host = mount({ idle: true });
  host.advance(14_000); expect(host.portrait.props.expression).toBe("A02");
  expression.reactExpression("sad", 1000); host.flush();
  expect(host.portrait.props.expression).toBe("C08");
  host.advance(1000); expect(host.portrait.props.expression).toBe("A01");
  host.update({ speaking: true, speechText: "반가워" });
  expect(host.portrait.props.mouth).toBe("small");
  const release = expression.holdExpression("thinking"); host.flush();
  expect(host.portrait.props).toMatchObject({ expression: "B04", mouth: null });
  expect(jest.getTimerCount()).toBe(0);
  release(); host.flush(); expect(host.portrait.props.mouth).toBe("small");
  host.update({ speaking: false, expression: "C07" });
  expect(host.portrait.props.expression).toBe("C07");
  expect(jest.getTimerCount()).toBe(0);
  host.unmount();
});

test.each(["background", "visibility", "reduced", "inactive"])("%s stops live motion immediately and resume cannot count hidden time as quiet", reason => {
  jest.spyOn(Math, "random").mockReturnValue(0.8);
  const host = mount({ idle: true, speaking: true, speechText: "안녕" });
  const change = (off: boolean) => {
    if (reason === "background") host.appState(off ? "background" : "active");
    else if (reason === "visibility") host.visible(!off);
    else if (reason === "reduced") host.reduced(off);
    else host.update({ active: !off });
  };
  change(true);
  expect(host.portrait.props).toMatchObject({ expression: "A01", mouth: null });
  expect(jest.getTimerCount()).toBe(0);
  host.update({ speaking: false }); host.advance(120_000);
  change(false); host.advance(22_000);
  expect(host.portrait.props.expression).toBe("A03");
  host.unmount();
  expect(host.listenerCount).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
});

test("live portrait unmount clears mouth timers and all foreground listeners", () => {
  const host = mount({ speaking: true, speechText: "Hello" }, "android");
  expect(host.listenerCount).toBe(1);
  host.unmount();
  expect(host.listenerCount).toBe(0);
  host.appState("background"); host.advance(60_000);
  expect(host.lateUpdates).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
});
