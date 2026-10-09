import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import * as policy from "@/lib/chat/plan-suggestions";
import * as owner from "@/lib/auth/account-epoch";
import type { ChatPlanDraft } from "@/lib/chat/plan-draft";
import type { ChatPlanSaveResult } from "@/lib/chat/save-plan";
import type { useChatPlans } from "../useChatPlans";

type HookResult = ReturnType<typeof useChatPlans>;
type Slot = { value?: unknown; deps?: unknown[]; cleanup?: () => void };
const state = (): policy.ChatPlanSuggestionState => ({
  conversationId: 1, sending: false, now: new Date(2026, 9, 9, 10),
  turns: [
    { role: "user", text: "매일 저녁 9시에 책 10분 읽기를 하고 싶어. 내일 오후 3시에 서류를 제출해야 하니 알려줘." },
    { role: "secondb", text: "각 계획을 확인하고 원하는 일정으로 설정해 보세요." },
  ],
});
const draft = (kind: "routine" | "reminder" = "routine"): ChatPlanDraft => ({
  kind, title: "Reviewed title", recurrence: "daily", weekday: null,
  date: "2026-10-10", time: "15:00", domainId: "daily_focus", exportConsent: false,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

// Run the real hook and real pure policy; only the save boundary and RN host are inert.
function mount(initial = state(), platform = "android") {
  const source = readFileSync(resolve(__dirname, "../useChatPlans.ts"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const slots: Slot[] = []; const effects: (() => void)[] = [];
  let userId: string | null = "a"; let input = initial;
  let cursor = 0; let dirty = false; let alive = true; let late = 0; let result: HookResult;
  const save = jest.fn<Promise<ChatPlanSaveResult>, [string, ChatPlanDraft]>().mockResolvedValue({ status: "saved" });
  const same = (a: unknown[] | undefined, b: unknown[]) => a?.length === b.length && b.every((value, i) => Object.is(value, a[i]));
  const hooks = {
    useState(initialValue: unknown) {
      const slot = slots[cursor] ?? (slots[cursor] = { value: typeof initialValue === "function" ? initialValue() : initialValue }); cursor++;
      return [slot.value, (next: unknown) => {
        if (!alive) late++;
        const value = typeof next === "function" ? next(slot.value) : next;
        if (!Object.is(value, slot.value)) { slot.value = value; dirty = true; }
      }];
    },
    useRef(value: unknown) { const slot = slots[cursor] ?? (slots[cursor] = { value: { current: value } }); cursor++; return slot.value; },
    useEffect(fn: () => void | (() => void), deps: unknown[]) {
      const slot = slots[cursor] ?? (slots[cursor] = {}); cursor++;
      if (!same(slot.deps, deps)) {
        effects.push(() => { slot.cleanup?.(); slot.cleanup = fn() || undefined; }); slot.deps = deps;
      }
    },
  };
  const modules: Record<string, unknown> = {
    react: hooks, "react-native": { Platform: { OS: platform } },
    "react-i18next": { useTranslation: () => ({ t: (key: string) => key }) },
    "@/lib/auth/account-epoch": owner,
    "@/lib/chat/plan-suggestions": policy,
    "@/lib/chat/save-plan": { saveChatPlan: save },
  };
  const exported: { useChatPlans?: typeof useChatPlans } = {};
  new Function("require", "exports", js)((name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`);
    return modules[name];
  }, exported);
  function render() { cursor = 0; dirty = false; result = exported.useChatPlans!(userId, input); }
  function flush() {
    for (let guard = 0; guard < 12; guard++) {
      while (effects.length) effects.shift()!();
      if (!dirty) return;
      render();
    }
    throw new Error("Hook render loop");
  }
  render(); flush();
  return {
    save, flush,
    get result() { return result; }, get lateUpdates() { return late; },
    update(next: Partial<policy.ChatPlanSuggestionState>, nextOwner = userId) { input = { ...input, ...next }; userId = nextOwner; render(); flush(); },
    open(kind = "routine") { result.actions.find(action => action.id === `plan-${kind}`)?.onPress(); flush(); },
    close() { result.sheetProps.onClose(); flush(); },
    unmount() { slots.forEach(slot => slot.cleanup?.()); alive = false; },
  };
}

beforeEach(() => { owner.__resetAccountEpochForTests(); owner.noteResolvedOwner("a"); });

test("opening and cancelling a proposal do not save or request notification permission", () => {
  const host = mount();
  expect(host.result.actions.map(action => action.id)).toEqual(["plan-routine", "plan-reminder"]);
  host.open(); expect(host.result.sheetProps.suggestion?.kind).toBe("routine");
  expect(host.save).not.toHaveBeenCalled();
  host.close(); expect(host.result.sheetProps.suggestion).toBeNull();
  expect(host.save).not.toHaveBeenCalled();
  expect(host.result.actions).toHaveLength(2);
  host.unmount();
});

test("confirm saves only reviewed fields once, disables busy actions and removes only the accepted kind", async () => {
  const host = mount(); const held = deferred<ChatPlanSaveResult>();
  host.save.mockReturnValueOnce(held.promise); host.open();
  const confirm = host.result.sheetProps.onConfirm;
  const saving = confirm(draft());
  const duplicate = confirm(draft()); host.flush();
  expect(host.save).toHaveBeenCalledTimes(1);
  expect(host.save).toHaveBeenCalledWith("a", draft());
  expect(host.result.busy).toBe(true);
  expect(host.result.actions.every(action => action.disabled)).toBe(true);
  host.close(); expect(host.result.sheetProps.suggestion).not.toBeNull();
  held.resolve({ status: "saved" }); await saving; await duplicate; host.flush();
  expect(host.result.busy).toBe(false);
  expect(host.result.sheetProps.suggestion).toBeNull();
  expect(host.result.notice).toBe("planSuggestion.routineSaved");
  expect(host.result.actions.map(action => action.id)).toEqual(["plan-reminder"]);
  host.unmount();
});

test.each(["new-turn", "clear", "account"])("an opened proposal cannot save after %s", async reason => {
  const host = mount(); host.open(); const confirm = host.result.sheetProps.onConfirm;
  if (reason === "new-turn") host.update({ turns: [...state().turns, { role: "user", text: "다른 주제로 이야기할게" }] });
  else if (reason === "clear") host.update({ conversationId: 2, turns: [] });
  else { owner.beginAccountOwnerTransition("b"); host.update({}, "b"); }
  await confirm(draft()); host.flush();
  expect(host.save).not.toHaveBeenCalled();
  if (reason === "new-turn") expect(host.result.sheetProps.notice).toBe("planSuggestion.stale");
  host.unmount();
});

test.each(["new-turn", "clear", "account"])("a retained button cannot reopen a stale proposal after %s", reason => {
  const host = mount(); const open = host.result.actions[0].onPress;
  if (reason === "new-turn") host.update({ turns: [...state().turns, { role: "user", text: "다른 주제" }] });
  else if (reason === "clear") host.update({ conversationId: 2, turns: [] });
  else { owner.beginAccountOwnerTransition("b"); host.update({}, "b"); }
  open(); host.flush();
  expect(host.result.sheetProps.suggestion).toBeNull();
  expect(host.save).not.toHaveBeenCalled(); host.unmount();
});

test.each(["owner-change", "unmount", "new-conversation"])("a late save cannot publish notices after %s", async reason => {
  const host = mount(); const held = deferred<ChatPlanSaveResult>();
  host.save.mockReturnValueOnce(held.promise); host.open();
  const saving = host.result.sheetProps.onConfirm(draft()); host.flush();
  if (reason === "owner-change") { owner.beginAccountOwnerTransition("b"); host.update({}, "b"); }
  else if (reason === "new-conversation") host.update({ conversationId: 2, turns: [] });
  else host.unmount();
  held.resolve({ status: "saved" }); await saving; host.flush();
  expect(host.result.notice).toBeNull();
  expect(host.result.sheetProps.notice).toBeNull();
  expect(host.lateUpdates).toBe(0);
  if (reason !== "unmount") host.unmount();
});

test("a failed confirmation stays editable and can retry without accepting the proposal", async () => {
  const host = mount(); host.save.mockResolvedValueOnce({ status: "denied" }); host.open("reminder");
  await host.result.sheetProps.onConfirm(draft("reminder")); host.flush();
  expect(host.result.sheetProps.notice).toBe("planSuggestion.reminderDenied");
  expect(host.result.sheetProps.suggestion?.kind).toBe("reminder");
  expect(host.result.actions).toHaveLength(2);
  host.save.mockResolvedValueOnce({ status: "scheduled" });
  await host.result.sheetProps.onConfirm(draft("reminder")); host.flush();
  expect(host.result.notice).toBe("planSuggestion.reminderSaved");
  expect(host.result.actions.map(action => action.id)).toEqual(["plan-routine"]);
  host.unmount();
});

test("web export reports a calendar file, not an alarm, and remains explicit confirmation", async () => {
  const host = mount(state(), "web"); host.open("reminder");
  expect(host.result.sheetProps.webReminder).toBe(true);
  expect(host.save).not.toHaveBeenCalled();
  host.save.mockResolvedValueOnce({ status: "exported" });
  await host.result.sheetProps.onConfirm({ ...draft("reminder"), exportConsent: true }); host.flush();
  expect(host.result.notice).toBe("planSuggestion.calendarCreated"); host.unmount();
});

test.each([
  ["scheduled", "reminderSaved"], ["denied", "reminderSavedReminderDenied"],
  ["error", "reminderSavedReminderFailed"], ["unavailable", "reminderSavedNoReminder"],
] as const)("persisted one-off reminders survive %s without offering a duplicate save", async (notification, key) => {
  const host = mount(); host.open("reminder");
  host.save.mockResolvedValueOnce({ status: "saved", notification });
  await host.result.sheetProps.onConfirm(draft("reminder")); host.flush();
  expect(host.result.notice).toBe(`planSuggestion.${key}`);
  expect(host.result.sheetProps.suggestion).toBeNull();
  expect(host.result.actions.map(action => action.id)).toEqual(["plan-routine"]);
  host.unmount();
});

test("shipping action order keeps eligible wiki first, then plans, then conversation follow-ups", () => {
  const source = readFileSync(resolve(__dirname, "../../../app/secondb.tsx"), "utf8");
  const start = source.indexOf("const chatActions: ChatAction[] = [];");
  const wiki = source.indexOf('id: "keep-wiki"', start);
  const plans = source.indexOf("chatActions.push(...chatPlans.actions)", start);
  const followups = source.indexOf("chatActions.push(...QUICK_ACTIONS.", start);
  expect(start).toBeGreaterThan(-1); expect(wiki).toBeGreaterThan(start);
  expect(plans).toBeGreaterThan(wiki); expect(followups).toBeGreaterThan(plans);
});
