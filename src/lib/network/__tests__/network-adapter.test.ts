import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(__dirname, "../../../..");
const flush = async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); };
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");

function browserSdk(initial: boolean | undefined) {
  const navigator = { onLine: initial };
  const handlers = new Map<string, Set<() => void>>();
  const window = {
    addEventListener: (name: string, listener: () => void) => {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name)!.add(listener);
    },
    removeEventListener: (name: string, listener: () => void) => handlers.get(name)?.delete(listener),
  };
  const sdkEvents = new Map<string, Set<(state: unknown) => void>>();
  // The SDK's browser methods below are executed from the installed package.
  // This stand-in supplies only the native event-emitter boundary, not its browser logic.
  class NativeModule {
    startObserving() {}
    stopObserving() {}
    emit(name: string, state: unknown) { sdkEvents.get(name)?.forEach((listener) => listener(state)); }
    addListener(name: string, listener: (state: unknown) => void) {
      if (!sdkEvents.has(name)) sdkEvents.set(name, new Set());
      const listeners = sdkEvents.get(name)!;
      if (listeners.size === 0) this.startObserving();
      listeners.add(listener);
      let removed = false;
      return { remove: () => {
        if (removed) return;
        removed = true;
        listeners.delete(listener);
        if (listeners.size === 0) this.stopObserving();
      } };
    }
  }
  const fetch = jest.fn(() => { throw new Error("No external network calls are permitted in this test"); });
  const module = { exports: {} as { default: NativeModule & { getNetworkStateAsync: () => Promise<unknown> } } };
  const source = fs.readFileSync(path.join(root, "node_modules/expo-network/src/ExpoNetwork.web.ts"), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", "window", "navigator", "fetch", code)(
    (name: string) => {
      if (name === "expo-modules-core") return { NativeModule, registerWebModule: (Type: new () => NativeModule) => new Type() };
      if (name === "./Network.types") return { NetworkStateType: { NONE: "NONE", UNKNOWN: "UNKNOWN" } };
      throw new Error(`Unexpected SDK dependency ${name}`);
    }, module, module.exports, window, navigator, fetch,
  );
  const sdk = module.exports.default;
  return {
    navigator, window, handlers, fetch,
    api: {
      getNetworkStateAsync: () => sdk.getNetworkStateAsync(),
      addNetworkStateListener: (listener: (state: unknown) => void) => sdk.addListener("onNetworkStateChanged", listener),
    },
    change(online: boolean | undefined) {
      navigator.onLine = online;
      for (const listener of handlers.get(online ? "online" : "offline") ?? []) listener();
    },
  };
}

function restoreGlobal(name: "window" | "navigator", descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}

beforeEach(() => { jest.resetModules(); jest.useFakeTimers(); });
afterEach(() => {
  jest.useRealTimers();
  restoreGlobal("window", originalWindow);
  restoreGlobal("navigator", originalNavigator);
  jest.dontMock("react-native");
  jest.dontMock("expo-network");
});

test("real SDK web online/offline events drive the adapter and release both browser listeners", async () => {
  const browser = browserSdk(true);
  Object.defineProperty(globalThis, "window", { configurable: true, value: browser.window });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: browser.navigator });
  const removeApp = jest.fn();
  jest.doMock("react-native", () => ({ Platform: { OS: "web" }, AppState: {
    currentState: "active", addEventListener: () => ({ remove: removeApp }),
  } }));
  jest.doMock("expo-network", () => browser.api);
  const { observeConnection } = require("../observe-connection") as typeof import("../observe-connection");
  const publish = jest.fn(); const stop = observeConnection(publish); await flush();
  expect(publish.mock.calls.flat()).toEqual(["connected"]);
  browser.change(false);
  browser.change(true);
  expect(publish.mock.calls.flat()).toEqual(["connected", "disconnected", "connected"]);
  expect(browser.handlers.get("online")?.size).toBe(1);
  expect(browser.handlers.get("offline")?.size).toBe(1);
  stop();
  expect(browser.handlers.get("online")?.size).toBe(0);
  expect(browser.handlers.get("offline")?.size).toBe(0);
  browser.change(false);
  expect(publish).toHaveBeenCalledTimes(3);
  expect(removeApp).toHaveBeenCalledTimes(1);
  expect(browser.fetch).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test("browser without an onLine result is unknown, not offline", async () => {
  const browser = browserSdk(undefined);
  Object.defineProperty(globalThis, "window", { configurable: true, value: browser.window });
  jest.doMock("react-native", () => ({ Platform: { OS: "web" }, AppState: {
    currentState: "active", addEventListener: () => ({ remove: jest.fn() }),
  } }));
  jest.doMock("expo-network", () => browser.api);
  const { observeConnection } = require("../observe-connection") as typeof import("../observe-connection");
  const publish = jest.fn(); const stop = observeConnection(publish); await flush();
  expect(publish.mock.calls.flat()).toEqual(["unknown"]);
  stop();
  expect(browser.fetch).not.toHaveBeenCalled();
});

test("SSR never loads the SDK or subscribes to app state", async () => {
  Reflect.deleteProperty(globalThis, "window");
  const loadSdk = jest.fn(); const appListener = jest.fn();
  jest.doMock("react-native", () => ({ Platform: { OS: "web" }, AppState: { addEventListener: appListener } }));
  jest.doMock("expo-network", () => { loadSdk(); throw new Error("No DOM"); });
  const { observeConnection } = require("../observe-connection") as typeof import("../observe-connection");
  const publish = jest.fn(); observeConnection(publish)(); await flush();
  expect(loadSdk).not.toHaveBeenCalled();
  expect(appListener).not.toHaveBeenCalled();
  expect(publish).not.toHaveBeenCalled();
});

test("old native binaries missing ExpoNetwork can still load the root and stay unknown", async () => {
  const appListener = jest.fn(); const loadSdk = jest.fn();
  jest.doMock("react-native", () => ({ Platform: { OS: "android" }, AppState: { addEventListener: appListener } }));
  jest.doMock("expo-network", () => { loadSdk(); throw new Error("Cannot find native module ExpoNetwork"); });
  const { observeConnection } = require("../observe-connection") as typeof import("../observe-connection");
  expect(loadSdk).not.toHaveBeenCalled();
  const publish = jest.fn(); expect(() => observeConnection(publish)()).not.toThrow(); await flush();
  expect(loadSdk).toHaveBeenCalledTimes(1);
  expect(appListener).not.toHaveBeenCalled();
  expect(publish).not.toHaveBeenCalled();
});

test("Expo network patch keeps timeouts unknown and recreates the cancelled iOS monitor", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  expect(manifest.dependencies["expo-network"]).toBe("~56.0.5");
  expect(manifest.expo.autolinking.buildFromSource).toContain("expo-network");
  const swift = fs.readFileSync(path.join(root, "node_modules/expo-network/ios/NetworkModule.swift"), "utf8");
  expect(swift).toContain("private var monitor = NWPathMonitor()");
  expect(swift).toMatch(/private func setupNetworkMonitoring\(\)[\s\S]*?monitor\.cancel\(\)\s+monitor = NWPathMonitor\(\)/);
  expect(swift).toMatch(/guard let currentPath = path \?\? getNetworkPathAsync\(\) else \{\s+return \["type": NetworkType\.unknown\.description\]/);
  expect(swift).not.toContain("let isConnected = currentPath?.status == .satisfied");
  const androidManifest = fs.readFileSync(path.join(root, "node_modules/expo-network/android/src/main/AndroidManifest.xml"), "utf8");
  const permissions = [...androidManifest.matchAll(/android:name="([^"]+)"/g)].map((match) => match[1]);
  expect(permissions.sort()).toEqual(["android.permission.ACCESS_NETWORK_STATE", "android.permission.ACCESS_WIFI_STATE"]);
});
