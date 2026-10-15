import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { hookHarness } from "@/lib/nav/__tests__/hook-harness";
import { createDeviceLock, type DeviceAuthResult } from "@/lib/auth/device-lock";

type Node = { type: unknown; props: Record<string, unknown> };
function mount(os = "android") {
  const hooks = hookHarness();
  let scope = 0; let priority = false; let state = "active";
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
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    "@/components/ui/GateCover": { GateCover: "GateCover" }, "@/components/ui/Text": { Text: "Text" }, "@/components/ui/Button": { Button: "Button" },
    "@/lib/theme/tokens": { semantic: { background: "#000" }, spacing: { xl: 24, lg: 16 } },
    "@/lib/auth/device-lock": { createDeviceLock },
    "@/lib/auth/native-device-auth": { authenticateDevice: auth, cancelDeviceAuthentication: cancel },
    "@/lib/auth/device-lock-context": { DeviceLockCoveredContext: { Provider: "Provider" }, crisisLockPrioritySnapshot: () => priority, subscribeCrisisLockPriority: noopSubscribe },
    "@/lib/auth/account-epoch": { accountTransitionSnapshot: () => scope, accountTransitionPendingFromSnapshot: (value: number) => value % 2 === 1, subscribeAccountTransition: subscribe },
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
    child, auth, cancel, dismiss,
    get tree() { return tree; },
    get gate() { return tree.props.children as Node; },
    get backBlocked() { return [...backListeners].some(listener => listener()); },
    render,
    async finish(result: DeviceAuthResult = { success: true }) { complete(result); await Promise.resolve(); await Promise.resolve(); render(); },
    account(value: number) { scope = value; for (const listener of accountListeners) listener(); render(); },
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

test("web wrapper keeps the original child without mounting the native gate", () => {
  const host = mount("web"); const calls = host.auth.mock.calls.length;
  expect(host.web().props.children).toBe(host.child);
  expect(host.auth).toHaveBeenCalledTimes(calls); host.unmount();
});
