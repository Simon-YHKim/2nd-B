import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import * as timing from "@/lib/motion/dialogue-typewriter";

type Props = { text: string; reducedMotion: boolean; active?: boolean; onBlip?: () => void };
type Result = { displayedText: string; isComplete: boolean; reveal: () => void };
type Slot = { value?: unknown; deps?: unknown[]; cleanup?: () => void };

// Execute the real hook with fake timers and inert RN hosts; RN's native preset
// cannot mount in this repository's Node test environment.
function mount(initial: Props) {
  const source = readFileSync(resolve(__dirname, "../JrpgDialogueBox.tsx"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const slots: Slot[] = [];
  const effects: (() => void)[] = [];
  let cursor = 0; let dirty = false; let alive = true; let late = 0;
  let props = initial; let result: Result;
  const same = (a: unknown[] | undefined, b: unknown[]) => a && a.length === b.length && b.every((v, i) => Object.is(v, a[i]));
  const hooks = {
    useState(value: unknown) {
      const slot = slots[cursor] ?? (slots[cursor] = { value: typeof value === "function" ? value() : value }); cursor += 1;
      return [slot.value, (next: unknown) => {
        if (!alive) late += 1;
        const updated = typeof next === "function" ? next(slot.value) : next;
        if (!Object.is(updated, slot.value)) { slot.value = updated; dirty = true; }
      }];
    },
    useRef(value: unknown) {
      const slot = slots[cursor] ?? (slots[cursor] = { value: { current: value } }); cursor += 1; return slot.value;
    },
    useMemo(fn: () => unknown, deps: unknown[]) {
      const slot = slots[cursor] ?? (slots[cursor] = {}); cursor += 1;
      if (!same(slot.deps, deps)) { slot.value = fn(); slot.deps = deps; } return slot.value;
    },
    useCallback(fn: () => unknown, deps: unknown[]) { return hooks.useMemo(() => fn, deps); },
    useEffect(fn: () => (() => void) | void, deps: unknown[]) {
      const slot = slots[cursor] ?? (slots[cursor] = {}); cursor += 1;
      if (!same(slot.deps, deps)) {
        effects.push(() => { slot.cleanup?.(); slot.cleanup = fn() || undefined; }); slot.deps = deps;
      }
    },
  };
  const styleToken: object = new Proxy({}, { get: () => styleToken });
  const modules: Record<string, unknown> = {
    react: hooks, "react/jsx-runtime": {},
    "react-native": { StyleSheet: { create: (v: unknown) => v } },
    "@/components/ui/PlainText": {}, "@/components/pixel/PixelSurface": {},
    "@/lib/i18n/keep-all": {}, "@/lib/motion/dialogue-typewriter": timing,
    "@/lib/theme/m3": { m3: styleToken },
  };
  const exported: { useJrpgTypewriter?: (p: Props) => Result } = {};
  new Function("require", "exports", js)((name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`);
    return modules[name];
  }, exported);
  function render() { cursor = 0; dirty = false; result = exported.useJrpgTypewriter!(props); }
  function flush() {
    for (let guard = 0; guard < 12; guard += 1) {
      while (effects.length) effects.shift()!();
      if (!dirty) return;
      render();
    }
    throw new Error("render loop");
  }
  render(); flush();
  return {
    get value() { return result; }, get lateUpdates() { return late; },
    advance(ms: number) { jest.advanceTimersByTime(ms); flush(); },
    update(next: Partial<Props>) { props = { ...props, ...next }; render(); flush(); },
    reveal() { result.reveal(); flush(); },
    unmount() { slots.forEach(s => s.cleanup?.()); alive = false; },
  };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

test("inactive dialogue keeps its place and resumes without hidden blips", () => {
  const onBlip = jest.fn();
  const host = mount({ text: "안녕하세요 반가워요", reducedMotion: false, onBlip });
  host.advance(64);
  expect(host.value.displayedText).toBe("안녕");
  host.update({ active: false });
  const blips = onBlip.mock.calls.length;
  host.advance(2_000);
  expect(host.value.displayedText).toBe("안녕");
  expect(onBlip).toHaveBeenCalledTimes(blips);
  expect(jest.getTimerCount()).toBe(0);
  host.update({ active: true }); host.advance(32);
  expect(host.value.displayedText).toBe("안녕하");
  host.unmount();
});

test("inactive first mount and replaced text wait until visible", () => {
  const host = mount({ text: "첫 문장", reducedMotion: false, active: false });
  host.advance(500); expect(host.value.displayedText).toBe("");
  host.update({ text: "다음🌟" }); host.advance(500);
  expect(host.value.displayedText).toBe("");
  host.update({ active: true }); host.advance(96);
  expect(host.value).toMatchObject({ displayedText: "다음🌟", isComplete: true });
  host.unmount();
});

test("fast reveal stops work and does not replay on refocus", () => {
  const host = mount({ text: "안녕하세요?", reducedMotion: false });
  host.advance(32); host.reveal();
  expect(host.value).toMatchObject({ displayedText: "안녕하세요?", isComplete: true });
  expect(jest.getTimerCount()).toBe(0);
  host.update({ active: false }); host.update({ active: true });
  expect(host.value.isComplete).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
  host.unmount();
});

test("new text cancels an old run; reduced motion reveals all and unmount leaves no updates", () => {
  const host = mount({ text: "old dialogue", reducedMotion: false });
  host.advance(32); host.update({ text: "새 문장입니다" });
  expect(host.value.displayedText).toBe("");
  host.advance(32); expect(host.value.displayedText).toBe("새");
  host.update({ reducedMotion: true });
  expect(host.value).toMatchObject({ displayedText: "새 문장입니다", isComplete: true });
  expect(jest.getTimerCount()).toBe(0);
  host.update({ text: "no motion" });
  expect(host.value.displayedText).toBe("no motion");
  host.update({ reducedMotion: false, text: "pending" });
  host.unmount(); host.advance(500);
  expect(jest.getTimerCount()).toBe(0); expect(host.lateUpdates).toBe(0);
});
