import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { hookHarness } from "@/lib/nav/__tests__/hook-harness";
import { createDeviceLock, type DeviceAuthResult } from "@/lib/auth/device-lock";

type Node = { type: unknown; props: Record<string, unknown> };
function mount(os = "android", initialOwner: string | null = "owner-a") {
  const hooks = hookHarness();
  let scope = 0; let priority = false; let state = "active";
  let owner: string | null = initialOwner; let screenLock: boolean | null = true;
  let segments: string[] = initialOwner ? ["records"] : ["(auth)", "sign-in"];
  const lockCheck = jest.fn(async () => screenLock);
  let complete!: (value: DeviceAuthResult) => void;
  const auth = jest.fn(() => new Promise<DeviceAuthResult>(resolve => { complete = resolve; }));
  const cancel = jest.fn(); const dismiss = jest.fn();
  const accountListeners = new Set<() => void>();
  const stateListeners = new Set<(value: string) => void>();
  const backListeners = new Set<() => boolean>();
  const subscribe = (listener: () => void) => { accountListeners.add(listener); return () => { accountListeners.delete(listener); }; };
  const noopSubscribe = () => () => {};
  const jsx = (type: unknown, props: Record<string, unknown>): Node => ({ type, props });
  const modules: Record<string, unknown> = {
    react: { ...hooks.hooks, useLayoutEffect: hooks.hooks.useEffect },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "react-native": { Platform: { OS: os }, View: "View", StyleSheet: { create: (v: unknown) => v }, Keyboard: { dismiss },
      AppState: { get currentState() { return state; }, addEventListener: (_: string, listener: (value: string) => void) => {
        stateListeners.add(listener); return { remove: () => stateListeners.delete(listener) };
      } },
      BackHandler: { addEventListener: (_: string, listener: () => boolean) => { backListeners.add(listener); return { remove: () => backListeners.delete(listener) }; } },
    },
    "react-i18next": { useTranslation: () => ({ t: (key: string) => key }) },
    "expo-router": { useSegments: () => segments },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    "@/components/ui/GateCover": { GateCover: "GateCover" }, "@/components/ui/Text": { Text: "Text" }, "@/components/ui/Button": { Button: "Button" },
    "@/lib/theme/tokens": { semantic: { background: "#000" }, spacing: { xl: 24, lg: 16 } },
    "@/lib/auth/device-lock": { createDeviceLock },
    "@/lib/auth/native-device-auth": { authenticateDevice: auth, cancelDeviceAuthentication: cancel, deviceHasScreenLock: lockCheck },
    "@/lib/auth/device-lock-context": { DeviceLockCoveredContext: { Provider: "Provider" }, crisisLockPrioritySnapshot: () => priority, subscribeCrisisLockPriority: noopSubscribe },
    "@/lib/auth/account-epoch": { accountTransitionSnapshot: () => scope, accountTransitionPendingFromSnapshot: (value: number) => value % 2 === 1, subscribeAccountTransition: subscribe,
      currentAccountOwner: () => owner },
    "@/lib/safety/crisis-notice": { getCrisisNotice: () => null, subscribeCrisisNotice: noopSubscribe },
  };
  const source = readFileSync(resolve(__dirname, "../DeviceLockGate.tsx"), "utf8") + "\nexport { NativeDeviceLockGate };";
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: Record<string, (props: { children: unknown }) => Node> = {};
  new Function("require", "exports", js)((name: string) => { if (!(name in modules)) throw Error(name); return modules[name]; }, exports);
  const child = { route: "unsaved interview", draft: "retained" };
  let tree: Node;
  const render = () => tree = hooks.render(() => exports.NativeDeviceLockGate({ children: child }));
  render();
  return {
    child, auth, cancel, dismiss, lockCheck,
    get tree() { return tree; },
    get gate() { return tree.props.children as Node; },
    get backBlocked() { return [...backListeners].some(listener => listener()); },
    render,
    async finish(result: DeviceAuthResult = { success: true }) { complete(result); await Promise.resolve(); await Promise.resolve(); render(); },
    account(value: number) { scope = value; for (const listener of accountListeners) listener(); render(); },
    // Owner changes always arrive with a new transition snapshot (account-epoch noteResolvedOwner).
    owner(value: string | null, nextScope: number) { owner = value; this.account(nextScope); },
    phoneHasScreenLock(value: boolean | null) { screenLock = value; },
    route(...value: string[]) { segments = value; render(); },
    async settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); render(); },
    app(value: string) { state = value; for (const listener of stateListeners) listener(value); render(); },
    crisis(value: boolean) { priority = value; render(); },
    web() { return exports.DeviceLockGate({ children: child }); },
    unmount() { hooks.unmount(); },
  };
}

test("initial and background covers retain the route, blur native input, and consume Back", async () => {
  const host = mount();
  expect(host.gate.props.cover).not.toBeNull();
  expect(host.gate.props.children).toBe(host.child);
  expect(host.dismiss).toHaveBeenCalled(); expect(host.backBlocked).toBe(true);
  await host.finish();
  expect(host.gate.props.cover).toBeNull(); expect(host.backBlocked).toBe(false);
  host.app("background");
  expect(host.gate.props.cover).not.toBeNull(); expect(host.gate.props.children).toBe(host.child);
  expect(host.backBlocked).toBe(true);
  host.app("active"); expect(host.gate.props.cover).toBeNull();
  host.unmount();
});

test("account pre-publication hold and ABA invalidate an old successful prompt", async () => {
  const host = mount(); host.account(1);
  await host.finish(); expect(host.gate.props.cover).not.toBeNull();
  expect(host.auth).toHaveBeenCalledTimes(1);
  host.account(4); expect(host.auth).toHaveBeenCalledTimes(2);
  expect(host.gate.props.cover).not.toBeNull(); await host.finish();
  expect(host.gate.props.cover).toBeNull(); host.unmount();
});

test("a route-local crisis cancels native authentication; closing it is not an unlock", async () => {
  const host = mount(); host.crisis(true);
  expect(host.cancel).toHaveBeenCalled();
  await host.finish(); expect(host.gate.props.cover).not.toBeNull();
  expect(host.auth).toHaveBeenCalledTimes(1);
  host.crisis(false); expect(host.gate.props.cover).not.toBeNull();
  expect(host.auth).toHaveBeenCalledTimes(2); host.unmount();
});

test("a cancelled prompt is not automatically repeated", async () => {
  const host = mount(); await host.finish({ success: false, error: "cancelled" });
  host.render(); expect(host.auth).toHaveBeenCalledTimes(1);
  expect(host.gate.props.cover).not.toBeNull(); host.unmount();
});

// Q-261018-47 (Simon 10-18 12:00 · 가): ask only when signed in and the phone has a screen lock.
test("signed out from the start (no earlier owner this run): no cover, no prompt, Back is not consumed", async () => {
  const host = mount("android", null);
  expect(host.gate.props.cover).toBeNull();
  expect(host.backBlocked).toBe(false);
  await host.settle();
  expect(host.auth).not.toHaveBeenCalled();
  host.app("background"); host.app("active"); await host.settle();
  expect(host.gate.props.cover).toBeNull(); expect(host.auth).not.toHaveBeenCalled();
  // A cold start reads "/" before the home sends a signed-out visitor to sign-in: nothing to hide.
  host.route(); expect(host.gate.props.cover).toBeNull();
  host.unmount();
});

test("sign-out keeps the previous owner's retained screen covered with no prompt until sign-in shows", async () => {
  const host = mount();
  await host.finish(); expect(host.gate.props.cover).toBeNull();
  // Sign-out (or a sign-out from another device) publishes null while A's screen is still mounted.
  host.owner(null, 2);
  expect(host.gate.props.cover).not.toBeNull();
  expect(host.backBlocked).toBe(true);
  await host.settle(); host.render();
  expect(host.gate.props.cover).not.toBeNull();
  const button = (host.gate.props.cover as Node).props.children as Node[];
  expect(button[1].props.disabled).toBe(true);
  expect(host.auth).toHaveBeenCalledTimes(1);
  // The screen's own redirect reaches sign-in: the cover lifts on that very render
  // (a ref write alone would not re-render), still with no prompt.
  host.route("(auth)", "sign-in");
  expect(host.gate.props.cover).toBeNull();
  await host.settle();
  expect(host.gate.props.cover).toBeNull();
  expect(host.auth).toHaveBeenCalledTimes(1);
  // Nothing of A is left once sign-in was reached: a signed-out visit elsewhere is not covered.
  host.route(); await host.settle();
  expect(host.gate.props.cover).toBeNull();
  host.unmount();
});

test("a phone left covered stays covered when a remote sign-out arrives", async () => {
  const host = mount(); expect(host.gate.props.cover).not.toBeNull();
  host.owner(null, 2); await host.settle(); host.render();
  expect(host.gate.props.cover).not.toBeNull();
  host.route("(auth)", "sign-in"); await host.settle();
  expect(host.gate.props.cover).toBeNull();
  host.unmount();
});

test("a pending owner transition covers before the new owner is published, without a prompt", async () => {
  const host = mount("android", null);
  host.account(1);
  expect(host.gate.props.cover).not.toBeNull();
  await host.settle(); expect(host.auth).not.toHaveBeenCalled();
  host.owner("owner-b", 2); host.route("records");
  expect(host.gate.props.cover).not.toBeNull();
  expect(host.auth).toHaveBeenCalledTimes(1);
  host.unmount();
});

test("signing in covers and asks once", async () => {
  const host = mount("android", null);
  host.owner("owner-a", 2); host.route("records");
  expect(host.gate.props.cover).not.toBeNull();
  expect(host.auth).toHaveBeenCalledTimes(1);
  await host.finish(); expect(host.gate.props.cover).toBeNull();
  host.unmount();
});

test("A -> signed out -> B: A's earlier success never opens B, and B is asked again", async () => {
  const host = mount();
  await host.finish(); expect(host.gate.props.cover).toBeNull();
  host.owner(null, 2); expect(host.gate.props.cover).not.toBeNull();
  host.route("(auth)", "sign-in"); await host.settle(); expect(host.gate.props.cover).toBeNull();
  host.owner("owner-b", 4); host.route("records");
  expect(host.gate.props.cover).not.toBeNull();
  expect(host.auth).toHaveBeenCalledTimes(2);
  await host.finish(); expect(host.gate.props.cover).toBeNull();
  host.unmount();
});

test("a signed-in phone without a screen lock opens instead of showing the setup message", async () => {
  const host = mount(); host.phoneHasScreenLock(false);
  await host.finish({ success: false, error: "not_enrolled" }); await host.settle();
  expect(host.lockCheck).toHaveBeenCalledTimes(1);
  expect(host.gate.props.cover).toBeNull();
  host.unmount();
});

test("not_enrolled on a phone that reports a screen lock still shows the setup message", async () => {
  const host = mount(); host.phoneHasScreenLock(true);
  await host.finish({ success: false, error: "not_enrolled" }); await host.settle();
  expect(host.gate.props.cover).not.toBeNull();
  host.unmount();
});

test("web wrapper keeps the original child without mounting the native gate", () => {
  const host = mount("web"); const calls = host.auth.mock.calls.length;
  expect(host.web().props.children).toBe(host.child);
  expect(host.auth).toHaveBeenCalledTimes(calls); host.unmount();
});
