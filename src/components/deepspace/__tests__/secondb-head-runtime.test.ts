import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import * as expression from "@/lib/companion/expression";
import { hustlekExpressionFor } from "@/lib/companion/hustlek-expression";

type Props = Record<string, unknown>;
type Tree = { type: string; props: Props };
type Slot = { value?: unknown; deps?: unknown[]; cleanup?: () => void };

// Execute the real renderer and expression bus with inert native hosts, matching
// MotionModal's runtime harness. RN 0.85 itself cannot mount in the Node preset.
function mount(initial: Props = {}) {
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
      View: "View", StyleSheet: { create: (value: unknown) => value },
    },
    "@/lib/companion/expression": expression,
    "@/lib/companion/hustlek-expression": { hustlekExpressionFor },
    "@/components/character/HustleKPortrait": { HustleKPortrait: "HustleKPortrait" },
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
    get portrait() { return tree.props.children as Tree; },
    get lateUpdates() { return lateUpdates; },
    flush,
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
