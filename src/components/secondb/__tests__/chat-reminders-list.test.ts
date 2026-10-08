import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import * as account from "@/lib/auth/account-epoch";
import type { OneOffReminder } from "@/lib/ops/one-off-reminders";

type Props = Record<string, unknown>;
type Tree = { type: string; props: Props };
type Slot = { value?: unknown; deps?: unknown[]; cleanup?: () => void };
const source = readFileSync(resolve(__dirname, "../ChatRemindersList.tsx"), "utf8");
const js = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const item = (id = "chat-1", startsAtIso = "2026-10-10T03:00:00.000Z"): OneOffReminder => ({ id, title: `Task ${id}`, startsAtIso });
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function runtime(platform = "android") {
  let cursor = 0; let dirty = false; let mounted = true; let lateUpdates = 0; let focused = true;
  let focusCallback: (() => void | (() => void)) | undefined; let focusCleanup: (() => void) | undefined;
  let owner = "A"; let tree: Tree | null = null;
  const slots: Slot[] = []; const effects: (() => void)[] = [];
  const requests: ReturnType<typeof deferred<OneOffReminder[]>>[] = [];
  const scheduled = new Set<string>();
  const onCountChange = jest.fn();
  const list = jest.fn(() => { const request = deferred<OneOffReminder[]>(); requests.push(request); return request.promise; });
  const getScheduled = jest.fn(async () => new Set(scheduled));
  const enable = jest.fn(async (_owner: string, id: string, _event: unknown) => { scheduled.add(id); return true; });
  const disable = jest.fn(async (_owner: string, id: string) => { scheduled.delete(id); });
  const remove = jest.fn(async (_owner: string, id: string) => { scheduled.delete(id); return true; });
  const same = (a: unknown[] | undefined, b: unknown[]) => a?.length === b.length && b.every((v, i) => Object.is(v, a[i]));
  const hooks = {
    useState: (initial: unknown) => {
      const slot = slots[cursor] ?? (slots[cursor] = { value: typeof initial === "function" ? initial() : initial }); cursor += 1;
      return [slot.value, (next: unknown) => {
        if (!mounted) lateUpdates += 1;
        const value = typeof next === "function" ? next(slot.value) : next;
        if (!Object.is(value, slot.value)) { slot.value = value; dirty = true; }
      }];
    },
    useRef: (initial: unknown) => { const slot = slots[cursor] ?? (slots[cursor] = { value: { current: initial } }); cursor += 1; return slot.value; },
    useCallback: (callback: unknown, deps: unknown[]) => {
      const slot = slots[cursor] ?? (slots[cursor] = {}); cursor += 1;
      if (!same(slot.deps, deps)) { slot.value = callback; slot.deps = deps; } return slot.value;
    },
    useEffect: (effect: () => (() => void) | void, deps: unknown[]) => {
      const slot = slots[cursor] ?? (slots[cursor] = {}); cursor += 1;
      if (!same(slot.deps, deps)) { slot.deps = deps; effects.push(() => { slot.cleanup?.(); slot.cleanup = effect() || undefined; }); }
    },
    useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
  };
  const jsx = (type: string, props: Props): Tree => ({ type, props });
  const modules: Record<string, unknown> = {
    react: hooks, "react/jsx-runtime": { jsx, jsxs: jsx },
    "react-native": { Platform: { OS: platform }, StyleSheet: { create: (styles: unknown) => styles } },
    "expo-router": { useFocusEffect: (callback: typeof focusCallback) => {
      if (callback === focusCallback) return; focusCallback = callback;
      effects.push(() => { focusCleanup?.(); focusCleanup = focused ? callback?.() || undefined : undefined; });
    } },
    "react-i18next": { useTranslation: () => ({ t: (key: string, vars: Props = {}) => `${key}${vars.title ? ` ${vars.title}` : ""}`, i18n: { language: "en" } }) },
    "@/components/phone/PhoneUIKit": { PhoneView: "View", PhonePressable: "Pressable", PhoneFlatList: "FlatList" },
    "@/components/ui/Text": { Text: "Text" }, "@/components/m3/MdCard": { MdCard: "MdCard" },
    "@/components/m3/MdButton": { MdButton: "MdButton" },
    "@/lib/auth/account-epoch": account,
    "@/lib/ops/one-off-reminders": { listOneOffReminders: list, removeOneOffReminder: remove },
    "@/lib/ops/reminders": { getScheduledRoutineIds: getScheduled, enableReminder: enable, disableReminder: disable, remindersSupported: () => true },
    "@/lib/i18n/locales": { systemLocaleFor: () => "en-US" },
    "@/lib/theme/m3": { m3: { shape: { none: 0 }, color: { primary: "blue", onPrimary: "white", outlineVariant: "gray", surfaceContainer: "surface", onSurfaceVariant: "ink" } } },
  };
  const exported: { ChatRemindersList?: (props: { ownerId: string; onCountChange: (count: number) => void }) => Tree | null } = {};
  new Function("require", "exports", js)((name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`); return modules[name];
  }, exported);
  function render() { cursor = 0; dirty = false; tree = exported.ChatRemindersList!({ ownerId: owner, onCountChange }); }
  function flush() {
    for (let guard = 0; guard < 20; guard += 1) {
      while (effects.length) effects.shift()!(); if (!dirty) return; render();
    } throw new Error("Render loop");
  }
  function nodes(root: unknown = tree): Tree[] {
    if (!root || typeof root !== "object") return [];
    if (Array.isArray(root)) return root.flatMap(child => nodes(child));
    const node = root as Tree;
    const children = node.type === "FlatList"
      ? (node.props.data as OneOffReminder[]).map((value, index) => (node.props.renderItem as (args: unknown) => Tree)({ item: value, index }))
      : node.props?.children;
    return [node, ...(children === undefined ? [] : nodes(children))];
  }
  return {
    requests, list, getScheduled, scheduled, enable, disable, remove, onCountChange,
    get tree() { return tree; }, get lateUpdates() { return lateUpdates; }, nodes,
    find(id: string) { const node = nodes().find(node => node.props.testID === id); if (!node) throw new Error(`Missing ${id}`); return node; },
    press(id: string) { const node = this.find(id); (node.props.onPress as () => void)(); flush(); },
    mount() { render(); flush(); }, update(next = owner) { owner = next; render(); flush(); },
    async settle() { for (let n = 0; n < 12; n += 1) { await Promise.resolve(); flush(); } },
    focus(next: boolean) { focused = next; focusCleanup?.(); focusCleanup = next ? focusCallback?.() || undefined : undefined; flush(); },
    unmount() { focusCleanup?.(); slots.forEach(slot => slot.cleanup?.()); mounted = false; },
  };
}
function publish(owner: string) { account.noteResolvedOwner(owner); account.clearAccountTransition(account.currentAccountEpoch()); }
beforeEach(() => { jest.useFakeTimers().setSystemTime(new Date("2026-10-09T03:00:00.000Z")); account.__resetAccountEpochForTests(); publish("A"); });
afterEach(() => { jest.useRealTimers(); account.__resetAccountEpochForTests(); });

test("web does not load device reminders", () => { const h = runtime("web"); h.mount(); expect(h.tree).toBeNull(); expect(h.list).not.toHaveBeenCalled(); h.unmount(); });
test("saved tasks use actual OS state and preserve the exact reviewed date when enabled", async () => {
  const h = runtime(); h.mount(); h.requests[0].resolve([item()]); await h.settle();
  expect(h.find("chat-reminder-toggle-chat-1").props.accessibilityState).toMatchObject({ checked: false });
  expect(h.nodes().some(node => node.props.children === new Date(item().startsAtIso).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }))).toBe(true);
  h.press("chat-reminder-toggle-chat-1"); await h.settle();
  expect(h.enable).toHaveBeenCalledWith("A", "chat-1", { title: "Task chat-1", startsAtIso: item().startsAtIso });
  expect(h.find("chat-reminder-toggle-chat-1").props.accessibilityState).toMatchObject({ checked: true }); h.unmount();
});
test("a past event cannot be enabled and never rolls forward to tomorrow", async () => {
  const h = runtime(); h.mount(); h.requests[0].resolve([item("past", "2026-10-08T03:00:00.000Z")]); await h.settle();
  expect(h.find("chat-reminder-toggle-past").props.disabled).toBe(true); h.press("chat-reminder-toggle-past");
  expect(h.enable).not.toHaveBeenCalled(); expect(h.nodes().some(node => node.props.children === "planSuggestion.oneOff.past")).toBe(true); h.unmount();
});
test("reaching the reviewed time marks the task past and clears its count without rescheduling", async () => {
  const h = runtime(); h.scheduled.add("soon"); h.mount();
  h.requests[0].resolve([item("soon", "2026-10-09T03:01:00.000Z")]); await h.settle();
  expect(h.onCountChange).toHaveBeenLastCalledWith(1);
  jest.advanceTimersByTime(60_001); await h.settle();
  expect(h.find("chat-reminder-toggle-soon").props.accessibilityState).toMatchObject({ checked: false, disabled: true });
  expect(h.onCountChange).toHaveBeenLastCalledWith(0); expect(h.enable).not.toHaveBeenCalled(); h.unmount();
});
test("duplicate taps cannot race a pending schedule and failed permission never reports ON", async () => {
  const h = runtime(); const pending = deferred<boolean>(); h.enable.mockImplementationOnce(() => pending.promise);
  h.mount(); h.requests[0].resolve([item()]); await h.settle();
  h.press("chat-reminder-toggle-chat-1"); h.press("chat-reminder-toggle-chat-1"); expect(h.enable).toHaveBeenCalledTimes(1);
  pending.resolve(false); await h.settle();
  expect(h.find("chat-reminder-toggle-chat-1").props.accessibilityState).toMatchObject({ checked: false });
  expect(h.nodes().some(node => node.props.children === "planSuggestion.oneOff.alarmFailed")).toBe(true); h.unmount();
});
test("OFF is verified against the OS and deletion requires a separate explicit confirmation", async () => {
  const h = runtime(); h.scheduled.add("chat-1"); h.mount(); h.requests[0].resolve([item()]); await h.settle();
  h.press("chat-reminder-toggle-chat-1"); await h.settle(); expect(h.disable).toHaveBeenCalledWith("A", "chat-1");
  expect(h.find("chat-reminder-toggle-chat-1").props.accessibilityState).toMatchObject({ checked: false });
  h.press("chat-reminder-delete-chat-1"); expect(h.remove).not.toHaveBeenCalled();
  h.press("chat-reminder-confirm-chat-1"); await h.settle(); expect(h.remove).toHaveBeenCalledWith("A", "chat-1");
  expect(h.nodes().some(node => node.props.testID === "chat-reminder-toggle-chat-1")).toBe(false); h.unmount();
});
test("failed deletion keeps the task accessible instead of reporting success", async () => {
  const h = runtime(); h.remove.mockResolvedValueOnce(false); h.mount(); h.requests[0].resolve([item()]); await h.settle();
  h.press("chat-reminder-delete-chat-1"); h.press("chat-reminder-confirm-chat-1"); await h.settle();
  expect(h.find("chat-reminder-toggle-chat-1")).toBeTruthy();
  expect(h.nodes().some(node => node.props.children === "planSuggestion.oneOff.deleteFailed")).toBe(true); h.unmount();
});
test("a return to the screen reloads newly saved reminders and discards late blurred results", async () => {
  const h = runtime(); h.mount(); h.focus(false); h.focus(true); h.requests[1].resolve([item("new")]); await h.settle();
  h.requests[0].resolve([item("old")]); await h.settle();
  expect(h.find("chat-reminder-toggle-new")).toBeTruthy(); expect(h.nodes().some(node => node.props.testID === "chat-reminder-toggle-old")).toBe(false); h.unmount();
});
test("refocusing during a pending toggle waits for the actual completed notification state", async () => {
  const h = runtime(); const pending = deferred<boolean>(); h.enable.mockImplementationOnce(() => pending.promise);
  h.mount(); h.requests[0].resolve([item()]); await h.settle(); h.press("chat-reminder-toggle-chat-1");
  h.focus(false); h.focus(true); expect(h.list).toHaveBeenCalledTimes(1);
  h.scheduled.add("chat-1"); pending.resolve(true); await h.settle();
  h.requests[1].resolve([item()]); await h.settle();
  expect(h.find("chat-reminder-toggle-chat-1").props.accessibilityState).toMatchObject({ checked: true }); h.unmount();
});
test("an account transition rejects a late query even before React receives the next owner", async () => {
  const h = runtime(); h.mount(); account.beginAccountOwnerTransition("B");
  h.requests[0].resolve([item()]); await h.settle(); h.update(); expect(h.tree).toBeNull(); h.unmount();
});
test("local storage errors show a retry instead of a false empty state", async () => {
  const h = runtime(); h.mount(); h.requests[0].reject(new Error("storage unavailable")); await h.settle();
  expect(h.nodes().some(node => node.props.children === "planSuggestion.oneOff.loadFailed")).toBe(true);
  expect(h.nodes().some(node => node.props.children === "planSuggestion.oneOff.empty")).toBe(false); h.unmount();
});
test("owner changes and unmounts reject old queries and in-flight mutation updates", async () => {
  const h = runtime(); const pending = deferred<boolean>(); h.enable.mockImplementationOnce(() => pending.promise);
  h.mount(); h.requests[0].resolve([item()]); await h.settle(); h.press("chat-reminder-toggle-chat-1");
  publish("B"); h.update("B"); expect(h.nodes().some(node => node.props.testID === "chat-reminder-toggle-chat-1")).toBe(false);
  h.requests[1].resolve([item("B")]); pending.resolve(true); await h.settle(); expect(h.find("chat-reminder-toggle-B")).toBeTruthy();
  h.focus(false); h.focus(true); h.unmount(); h.requests[2].resolve([item("late")]); await h.settle(); expect(h.lateUpdates).toBe(0);
});
test("all 200 tasks are reachable through bounded non-scrolling pages inside the existing frame", async () => {
  const h = runtime(); h.mount(); h.requests[0].resolve(Array.from({ length: 200 }, (_, n) => item(`row-${n}`))); await h.settle();
  const list = h.nodes().find(node => node.type === "FlatList")!;
  expect(list.props).toMatchObject({ scrollEnabled: false, initialNumToRender: 5 }); expect((list.props.data as unknown[])).toHaveLength(5);
  for (let page = 0; page < 39; page += 1) h.press("chat-reminders-next");
  expect(h.find("chat-reminder-toggle-row-199")).toBeTruthy(); expect(h.find("chat-reminders-next").props.disabled).toBe(true); h.unmount();
});
