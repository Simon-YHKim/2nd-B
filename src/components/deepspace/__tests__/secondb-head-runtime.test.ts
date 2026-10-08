import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import * as expression from "@/lib/companion/expression";
import * as faces from "@/lib/companion/faces";
import { hustlekExpressionFor } from "@/lib/companion/hustlek-expression";

type Props = Record<string, unknown>;
type Tree = { type: string; props: Props };
type Slot = { value?: unknown; deps?: unknown[]; cleanup?: () => void };

// Execute the real renderer and expression bus with inert native hosts, matching
// MotionModal's runtime harness. RN 0.85 itself cannot mount in the Node preset.
function mount(initial: Props = {}, reduced = true) {
  const source = readFileSync(resolve(__dirname, "../SecondbHead.tsx"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  let index = 0; let dirty = false; let mounted = true; let lateUpdates = 0;
  let props = initial; let tree: Tree;
  const slots: Slot[] = [];
  const effects: (() => void)[] = [];
  const loops: { start: jest.Mock; stop: jest.Mock }[] = [];
  const values: Value[] = [];
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
  class Value {
    constructor(public current: number) { values.push(this); }
    setValue(value: number) { this.current = value; }
    interpolate({ inputRange, outputRange }: { inputRange: number[]; outputRange: number[] }) {
      const ratio = Math.max(0, Math.min(1, (this.current - inputRange[0]) / (inputRange[1] - inputRange[0])));
      return outputRange[0] + ratio * (outputRange[1] - outputRange[0]);
    }
  }
  const tracking = { touch: { x: new Value(100), y: new Value(150) }, engage: new Value(1) };
  const modules: Record<string, unknown> = {
    react: hooks,
    "react/jsx-runtime": { jsx: (type: string, value: Props) => ({ type, props: value }) },
    "react-native": {
      View: "View", StyleSheet: { create: (value: unknown) => value },
      Animated: {
        Value, View: "AnimatedView",
        subtract: (a: Value, b: number) => new Value(a.current - b),
        multiply: (a: Value, b: number) => a.current * b,
        timing: () => ({}), sequence: (steps: unknown[]) => steps,
        loop: () => { const loop = { start: jest.fn(), stop: jest.fn() }; loops.push(loop); return loop; },
      },
    },
    "@/lib/motion/pixel-physical": { pixelStepsFor: () => (value: number) => value },
    "@/lib/motion/use-reduced-motion": { useReducedMotionPref: () => reduced },
    "@/lib/companion/expression": expression,
    "@/lib/companion/faces": faces,
    "@/lib/companion/hustlek-expression": { hustlekExpressionFor },
    "@/components/character/HustleKPortrait": { HustleKPortrait: "HustleKPortrait" },
    "./SecondbHeadTrack": { useSecondbTracking: () => tracking },
  };
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
    get portrait() { return ((tree.props.children as Tree).props.children as Tree).props.children as Tree; },
    get lateUpdates() { return lateUpdates; }, loops, values,
    flush,
    advance(ms: number) { jest.advanceTimersByTime(ms); flush(); },
    update(next: Props) { props = { ...props, ...next }; render(); flush(); },
    setReduced(value: boolean) { reduced = value; render(); flush(); },
    measure() {
      (tree.props.ref as { current: unknown }).current = {
        measureInWindow: (callback: (...args: number[]) => void) => callback(0, 0, 100, 100),
      };
      (tree.props.onLayout as () => void)(); flush();
    },
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

test("real idle policy yields to hold and reduced motion clears idle timers and bob", () => {
  jest.spyOn(Math, "random").mockReturnValue(0.6);
  const host = mount({}, false);
  host.advance(22_400); expect(host.portrait.props.expression).toBe("D12");
  const release = expression.holdExpression("thinking"); host.flush();
  expect(host.portrait.props.expression).toBe("B04");
  host.advance(22_400); expect(host.portrait.props.expression).toBe("B04");
  release(); host.flush(); expect(host.portrait.props.expression).toBe("A01");
  host.advance(22_400); expect(host.portrait.props.expression).toBe("D12");
  host.setReduced(true);
  expect(host.portrait.props.expression).toBe("A01");
  expect(host.loops[0].stop).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
  expression.reactExpression("happy", 100); host.flush();
  expect(host.portrait.props.expression).toBe("A04");
  host.advance(100); expect(host.portrait.props.expression).toBe("A01");
  host.unmount();
});

test("tracking translates the complete portrait and reduced motion disables it", () => {
  const host = mount({ size: 80, accessibilityLabel: "HustleK" }, false);
  host.measure();
  const transform = ((host.tree.props.children as Tree).props.style as { transform: object[] }).transform;
  expect(transform).toEqual([{ translateX: expect.closeTo(2.4) }, { translateY: expect.closeTo(4.8) }]);
  expect(host.portrait.props).toMatchObject({ size: 80, accessibilityLabel: "HustleK" });
  host.setReduced(true);
  expect((host.tree.props.children as Tree).props.style).toBeNull();
  host.unmount();
});

test.each([{ size: 30 }, { size: 80, track: false }])("small or explicitly still portraits do not track: %j", props => {
  const host = mount(props, false); host.measure();
  expect((host.tree.props.children as Tree).props.style).toBeNull();
  host.unmount();
});

test("unmount clears reaction and idle timers, stops bob, and unsubscribes both buses", () => {
  const host = mount({}, false);
  expression.reactExpression("happy", 1000); host.flush();
  host.unmount();
  expect(jest.getTimerCount()).toBe(0);
  expect(host.loops[0].stop).toHaveBeenCalledTimes(1);
  const release = expression.holdExpression("thinking");
  expression.reactExpression("sad", 1000); release();
  jest.advanceTimersByTime(60_000);
  expect(host.lateUpdates).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
});
