import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => { throw new Error("Screen tests must not access Supabase"); },
}));

import * as account from "../../auth/account-epoch";
import * as selections from "../../auth/consent-selections";
import { isAvailableUiLocale } from "../../i18n/locales";
import { matchesServiceConsentContract, ServiceConsentError, type ServiceConsentStatus } from "../service-consent";

// Execute the complete, actual route module and its private ConsentForm. Only
// host components, auth, translations and consent I/O are replaced. Hooks below
// provide explicit renders, effect cleanup and key replacement; this is not a
// React scheduler, browser/RN renderer or accessibility-tree verification.
type Props = Record<string, unknown>;
type Element = { type?: unknown; key?: string | null; props?: Props };
type Slot = { value?: unknown; deps?: readonly unknown[]; cleanup?: () => void };
type Fiber = { slots: Slot[]; cursor: number; active: boolean };
const load = jest.fn();
const save = jest.fn();
const push = jest.fn();

function status(patch: Partial<ServiceConsentStatus> = {}): ServiceConsentStatus {
  return {
    ownerId: "owner-a", ownerEpoch: account.currentAccountEpoch(), mode: "collect",
    contract_revision: "service-v1", consent_version: "2026-09-07",
    policy_version: "2026-09-25", terms_version: "2026-08-16",
    state: "uncovered", change_token: "a".repeat(64), can_grant: true, ...patch,
  };
}

function deferred<T>() {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolvePromise = yes; rejectPromise = no; });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function mountRoute() {
  let auth = { userId: "owner-a" as string | null, loading: false };
  let language = "en";
  let mounted = true;
  let dirty = true;
  let rendering: Fiber | null = null;
  let nodes: Element[] = [];
  let lateWrites = 0;
  const fibers = new Map<string, Fiber>();
  let visited = new Set<string>();
  let effects: Array<() => void> = [];

  function slot(): { fiber: Fiber; entry: Slot } {
    if (!rendering) throw new Error("Hook outside actual component invocation");
    const fiber = rendering;
    const index = fiber.cursor++;
    fiber.slots[index] ??= {};
    return { fiber, entry: fiber.slots[index] };
  }

  const hooks = {
    useState(initial: unknown) {
      const { fiber, entry } = slot();
      if (!("value" in entry)) entry.value = typeof initial === "function" ? initial() : initial;
      return [entry.value, (next: unknown) => {
        if (!fiber.active || !mounted) { lateWrites++; return; }
        entry.value = typeof next === "function" ? next(entry.value) : next;
        dirty = true;
      }];
    },
    useRef(initial: unknown) {
      const { entry } = slot();
      entry.value ??= { current: initial };
      return entry.value;
    },
    useEffect(effect: () => void | (() => void), deps?: readonly unknown[]) {
      const { fiber, entry } = slot();
      if (deps && entry.deps && deps.length === entry.deps.length && deps.every((v, i) => Object.is(v, entry.deps![i]))) return;
      entry.deps = deps;
      effects.push(() => {
        if (!fiber.active) return;
        entry.cleanup?.();
        entry.cleanup = effect() || undefined;
      });
    },
    useSyncExternalStore(subscribe: (notify: () => void) => () => void, snapshot: () => unknown) {
      const { fiber, entry } = slot();
      if (!entry.cleanup) entry.cleanup = subscribe(() => { if (fiber.active && mounted) dirty = true; });
      return snapshot();
    },
  };

  const dependencies: Record<string, unknown> = {
    react: hooks,
    "react-native": { View: "View", Pressable: "Pressable", ScrollView: "ScrollView", StyleSheet: { create: (value: unknown) => value } },
    "expo-router": { Redirect: "Redirect", router: { push, back: jest.fn() } },
    "react-i18next": { useTranslation: () => ({ t: (key: string) => key, i18n: { language } }) },
    "@/components/deep-space/DeepSpaceScreen": { DeepSpaceScreen: "DeepSpaceScreen" },
    "@/components/m3": { MdButton: "MdButton", MdCard: "MdCard" },
    "@/components/ui/Text": { Text: "Text" },
    "@/lib/auth/AuthContext": { useAuth: () => auth },
    "@/lib/auth/account-epoch": account,
    "@/lib/auth/consent-selections": selections,
    "@/lib/i18n/locales": { isAvailableUiLocale },
    "@/lib/privacy/service-consent": { loadServiceConsent: load, saveServiceConsent: save, matchesServiceConsentContract, ServiceConsentError },
    "@/lib/theme/m3": { m3: { spacing: { s3: 12, s4: 16, s6: 24 }, color: { outline: "#666", primary: "#00f", primaryContainer: "#eef" } } },
  };
  const source = readFileSync(resolve(__dirname, "../../../app/service-consent.tsx"), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as { default: () => unknown } };
  new Function("require", "module", "exports", output)((id: string) => {
    if (id === "react/jsx-runtime") return require(id);
    if (id in dependencies) return dependencies[id];
    throw new Error(`Unexpected screen dependency: ${id}`);
  }, module, module.exports);

  function invoke(component: (props: Props) => unknown, props: Props, identity: string): unknown {
    visited.add(identity);
    let fiber = fibers.get(identity);
    if (!fiber) { fiber = { slots: [], cursor: 0, active: true }; fibers.set(identity, fiber); }
    fiber.cursor = 0;
    const previous = rendering;
    rendering = fiber;
    try { return component(props); } finally { rendering = previous; }
  }
  function visit(value: unknown, identity: string): void {
    if (Array.isArray(value)) { value.forEach((child, index) => visit(child, `${identity}/${index}`)); return; }
    if (!value || typeof value !== "object") return;
    const node = value as Element;
    if (typeof node.type === "function") {
      const key = `${identity}:${node.key ?? node.type.name}`;
      visit(invoke(node.type as (props: Props) => unknown, node.props ?? {}, key), `${key}/body`);
      return;
    }
    nodes.push(node);
    visit(node.props?.children, `${identity}/children`);
  }
  function dispose(fiber: Fiber): void {
    fiber.active = false;
    fiber.slots.forEach((entry) => entry.cleanup?.());
  }
  function render(): Element[] {
    for (let pass = 0; mounted && dirty; pass++) {
      if (pass > 20) throw new Error("Hook host did not settle");
      dirty = false;
      nodes = [];
      visited = new Set();
      effects = [];
      visit(invoke(module.exports.default, {}, "route"), "route/body");
      for (const [key, fiber] of fibers) if (!visited.has(key)) { dispose(fiber); fibers.delete(key); }
      effects.forEach((effect) => effect());
    }
    return nodes;
  }
  const texts = () => render().filter((node) => node.type === "Text").map((node) => node.props?.children);
  const button = (label: string) => render().find((node) => node.type === "MdButton" && node.props?.label === label);
  const checkboxes = () => render().filter((node) => node.props?.accessibilityRole === "checkbox");
  function press(label: string, bypassDisabled = false): void {
    const node = button(label);
    if (!node) throw new Error(`Missing button ${label}`);
    if (node.props?.disabled && !bypassDisabled) throw new Error(`Disabled button ${label}`);
    (node.props!.onPress as () => void)();
    render();
  }
  async function settle(): Promise<void> {
    for (let i = 0; i < 8; i++) { await Promise.resolve(); render(); }
  }
  return {
    render, texts, button, checkboxes, press, settle,
    toggle(index: number) { const row = checkboxes()[index]; (row.props!.onPress as () => void)(); render(); },
    checkAll() { for (let i = 0; i < selections.REQUIRED_ACK_KEYS.length; i++) this.toggle(i); },
    auth(next: Partial<typeof auth>) { auth = { ...auth, ...next }; dirty = true; render(); },
    locale(next: string) { language = next; dirty = true; render(); },
    lateWrites: () => lateWrites,
    unmount() { mounted = false; fibers.forEach(dispose); fibers.clear(); nodes = []; },
  };
}

type Screen = ReturnType<typeof mountRoute>;
let screens: Screen[] = [];
function screen() { const value = mountRoute(); screens.push(value); value.render(); return value; }
function expectNoWrites(ui: Screen) {
  for (const action of ["review", "agree", "withdraw"]) expect(ui.button(`serviceControl.${action}`)).toBeUndefined();
  expect(save).not.toHaveBeenCalled();
}

beforeEach(() => {
  account.__resetAccountEpochForTests();
  account.noteResolvedOwner("owner-a");
  load.mockReset().mockImplementation(async (ownerId: string) => status({ ownerId }));
  save.mockReset();
  push.mockReset();
});
afterEach(() => { screens.forEach((ui) => ui.unmount()); screens = []; account.__resetAccountEpochForTests(); });

test("loading and unavailable/OFF status offer no consent mutation or false success", async () => {
  const pending = deferred<ServiceConsentStatus>();
  load.mockReturnValueOnce(pending.promise);
  const ui = screen();
  expectNoWrites(ui);
  pending.reject(new ServiceConsentError("unavailable"));
  await ui.settle();
  expectNoWrites(ui);
  expect(ui.texts()).toContain("serviceControl.loadError");
  expect(ui.texts()).not.toContain("serviceControl.saved");
  expect(ui.texts()).not.toContain("serviceControl.withdrawn");
  expect(ui.button("serviceControl.reload")).toBeDefined();
});

test("collect/uncovered is labelled as collection and requires all five unchecked acknowledgements", async () => {
  const ui = screen(); await ui.settle();
  expect(ui.texts()).toEqual(expect.arrayContaining(["serviceControl.states.uncovered", "serviceControl.collect"]));
  ui.press("serviceControl.review");
  expect(ui.checkboxes()).toHaveLength(5);
  expect(ui.checkboxes().map((row) => row.props?.accessibilityState)).toEqual(Array(5).fill({ checked: false, disabled: false }));
  for (let i = 0; i < 5; i++) {
    expect(ui.button("serviceControl.agree")?.props?.disabled).toBe(true);
    ui.press("serviceControl.agree", true); // Handler also rejects programmatic/stale taps.
    expect(save).not.toHaveBeenCalled();
    ui.toggle(i);
  }
  expect(ui.button("serviceControl.agree")?.props?.disabled).toBe(false);
});

test("five explicit selections grant once under two taps in the same render frame", async () => {
  const pending = deferred<ServiceConsentStatus>(); save.mockReturnValueOnce(pending.promise);
  const ui = screen(); await ui.settle(); ui.press("serviceControl.review"); ui.checkAll();
  const handler = ui.button("serviceControl.agree")!.props!.onPress as () => void;
  handler(); handler(); ui.render();
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0][0]).toMatchObject({
    userId: "owner-a", action: "grant", locale: "en",
    selections: { service: true, llmProcessing: true, overseasTransfer: true, sensitiveData: true, safetyNotice: true, marketing: false },
  });
  expect(ui.button("serviceControl.withdraw")?.props?.disabled).toBe(true);
  expect(ui.texts()).not.toContain("serviceControl.saved");
  pending.resolve(status({ state: "granted", change_token: "b".repeat(64) })); await ui.settle();
  expect(ui.texts()).toEqual(expect.arrayContaining(["serviceControl.saved", "serviceControl.states.granted"]));
  expect(ui.checkboxes()).toHaveLength(0);
});

test("a recorded grant that remains blocked preserves the restriction and offers privacy settings", async () => {
  save.mockResolvedValueOnce(status({ state: "blocked", change_token: "b".repeat(64) }));
  const ui = screen(); await ui.settle(); ui.press("serviceControl.review"); ui.checkAll(); ui.press("serviceControl.agree");
  await ui.settle();
  expect(ui.texts()).toEqual(expect.arrayContaining([
    "serviceControl.saved", "serviceControl.states.blocked", "serviceControl.blockedHelp",
  ]));
  expect(ui.texts()).not.toContain("serviceControl.states.granted");
  ui.press("serviceControl.privacySettings");
  expect(push).toHaveBeenLastCalledWith("/privacy");
  expect(save).toHaveBeenCalledTimes(1);
});

test.each([
  { patch: { can_grant: false }, notice: "serviceControl.ineligible" },
  { patch: { policy_version: "2026-10-01" }, notice: "serviceControl.updateRequired" },
])("$notice prevents a grant while retaining withdrawal", async ({ patch, notice }) => {
  load.mockResolvedValueOnce(status(patch));
  const ui = screen(); await ui.settle();
  expect(ui.texts()).toContain(notice);
  expect(ui.button("serviceControl.review")).toBeUndefined();
  expect(ui.button("serviceControl.agree")).toBeUndefined();
  expect(ui.checkboxes()).toHaveLength(0);
  expect(ui.button("serviceControl.withdraw")?.props?.disabled).toBe(false);
  expect(save).not.toHaveBeenCalled();
});

test.each(["conflict", "unavailable", "not_saved"] as const)("%s never fabricates a grant or retries; manual reload starts with unchecked acknowledgements", async (code) => {
  save.mockRejectedValueOnce(new ServiceConsentError(code));
  const ui = screen(); await ui.settle(); ui.press("serviceControl.review"); ui.checkAll(); ui.press("serviceControl.agree");
  await ui.settle();
  expect(ui.texts()).toContain(code === "conflict" ? "serviceControl.conflict" : "serviceControl.saveError");
  expect(ui.texts()).not.toContain("serviceControl.saved");
  expect(ui.texts()).not.toContain("serviceControl.states.granted");
  expect(ui.button("serviceControl.review")).toBeUndefined();
  expect(ui.checkboxes()).toHaveLength(0);
  expect(load).toHaveBeenCalledTimes(1); expect(save).toHaveBeenCalledTimes(1);
  ui.press("serviceControl.reload"); await ui.settle();
  expect(load).toHaveBeenCalledTimes(2); expect(save).toHaveBeenCalledTimes(1);
  ui.press("serviceControl.review");
  expect(ui.checkboxes().every((row) => !(row.props!.accessibilityState as { checked: boolean }).checked)).toBe(true);
});

test.each([
  { state: "uncovered" as const },
  { state: "granted" as const },
  { state: "granted" as const, policy_version: "2026-10-01", can_grant: false },
])("withdrawal from $state works without new acknowledgements, including a future contract", async (patch) => {
  load.mockResolvedValueOnce(status(patch));
  const pending = deferred<ServiceConsentStatus>(); save.mockReturnValueOnce(pending.promise);
  const ui = screen(); await ui.settle(); ui.press("serviceControl.withdraw");
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0][0]).toMatchObject({ action: "revoke", selections: selections.emptyConsentSelections() });
  expect(ui.texts()).not.toContain("serviceControl.withdrawn");
  pending.resolve(status({ ...patch, state: "revoked", change_token: "b".repeat(64) })); await ui.settle();
  expect(ui.texts()).toEqual(expect.arrayContaining(["serviceControl.withdrawn", "serviceControl.states.revoked"]));
  expect(ui.button("serviceControl.withdraw")).toBeUndefined();
});

test("failed withdrawal shows unconfirmed state and never claims processing stopped", async () => {
  load.mockResolvedValueOnce(status({ state: "granted" }));
  save.mockRejectedValueOnce(new ServiceConsentError("unavailable"));
  const ui = screen(); await ui.settle(); ui.press("serviceControl.withdraw"); await ui.settle();
  expect(ui.texts()).toContain("serviceControl.saveError");
  expect(ui.texts()).not.toContain("serviceControl.withdrawn");
  expect(ui.texts()).not.toContain("serviceControl.states.revoked");
  expect(ui.button("serviceControl.reload")).toBeDefined();
  expect(save).toHaveBeenCalledTimes(1); expect(load).toHaveBeenCalledTimes(1);
});

test.each(["resolve", "reject"] as const)("unmount aborts status loading and ignores late %s", async (outcome) => {
  const pending = deferred<ServiceConsentStatus>(); load.mockReturnValueOnce(pending.promise);
  const ui = screen(); const signal = load.mock.calls[0][1] as AbortSignal;
  ui.unmount(); expect(signal.aborted).toBe(true);
  if (outcome === "resolve") pending.resolve(status()); else pending.reject(new Error("late read"));
  await ui.settle(); expect(ui.lateWrites()).toBe(0);
});

test.each(["resolve", "reject"] as const)("unmount aborts mutation and ignores late %s", async (outcome) => {
  const pending = deferred<ServiceConsentStatus>(); save.mockReturnValueOnce(pending.promise);
  const ui = screen(); await ui.settle(); ui.press("serviceControl.withdraw");
  const signal = save.mock.calls[0][0].signal as AbortSignal;
  ui.unmount(); expect(signal.aborted).toBe(true);
  if (outcome === "resolve") pending.resolve(status({ state: "revoked" })); else pending.reject(new Error("late write"));
  await ui.settle(); expect(ui.lateWrites()).toBe(0);
});

test("account/epoch keys discard A's selections and late write across A to B to A", async () => {
  const pending = deferred<ServiceConsentStatus>(); save.mockReturnValueOnce(pending.promise);
  const ui = screen(); await ui.settle(); ui.press("serviceControl.review"); ui.checkAll(); ui.press("serviceControl.agree");
  const signal = save.mock.calls[0][0].signal as AbortSignal;
  account.beginAccountOwnerTransition("owner-b"); ui.render();
  expect(signal.aborted).toBe(true); expect(ui.button("serviceControl.withdraw")).toBeUndefined();
  account.noteResolvedOwner("owner-b"); ui.auth({ userId: "owner-b" });
  account.clearAccountTransition(account.currentAccountEpoch()); await ui.settle();
  expect(load.mock.calls.map(([owner]) => owner)).toEqual(["owner-a", "owner-b"]);
  account.beginAccountOwnerTransition("owner-a"); ui.render();
  account.noteResolvedOwner("owner-a"); ui.auth({ userId: "owner-a" });
  account.clearAccountTransition(account.currentAccountEpoch()); await ui.settle();
  ui.press("serviceControl.review");
  expect(ui.checkboxes().every((row) => !(row.props!.accessibilityState as { checked: boolean }).checked)).toBe(true);
  pending.resolve(status({ state: "granted" })); await ui.settle();
  expect(ui.texts()).toContain("serviceControl.states.uncovered");
  expect(ui.texts()).not.toContain("serviceControl.saved");
  expect(ui.lateWrites()).toBe(0); expect(save).toHaveBeenCalledTimes(1);
});

test("cancel and locale changes clear draft acknowledgements; policy links do not save", async () => {
  const ui = screen(); await ui.settle(); ui.press("serviceControl.review"); ui.checkAll(); ui.press("serviceControl.cancel");
  ui.press("serviceControl.review");
  expect(ui.checkboxes().every((row) => !(row.props!.accessibilityState as { checked: boolean }).checked)).toBe(true);
  ui.checkAll(); ui.locale("ko-KR"); await ui.settle();
  expect(ui.checkboxes()).toHaveLength(0);
  ui.press("serviceControl.policy"); expect(push).toHaveBeenLastCalledWith("/privacy-policy");
  ui.press("detail.title"); expect(push).toHaveBeenLastCalledWith("/consent-notice");
  expect(save).not.toHaveBeenCalled();
});
