type ClientModule = typeof import("../client");

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

function replaceGlobal(name: "document" | "navigator" | "localStorage", value?: unknown): void {
  if (value === undefined) {
    Reflect.deleteProperty(globalThis, name);
    return;
  }
  Object.defineProperty(globalThis, name, { configurable: true, value });
}

function restoreGlobal(name: "document" | "navigator" | "localStorage", descriptor?: PropertyDescriptor): void {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}

function setRuntime(kind: "native" | "node" | "web", webStorage?: unknown): void {
  replaceGlobal("document", kind === "web" ? {} : undefined);
  replaceGlobal("navigator", kind === "native" ? { product: "ReactNative" } : { product: "Node.js" });
  replaceGlobal("localStorage", kind === "web" ? webStorage : undefined);
}

function createStorage() {
  return {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  };
}

function installModuleMocks(options?: { encryptedStorageError?: Error }) {
  const startAutoRefresh = jest.fn();
  const stopAutoRefresh = jest.fn();
  const removeAllChannels = jest.fn(async () => undefined);
  const client = { auth: { startAutoRefresh, stopAutoRefresh }, removeAllChannels };
  const createClient = jest.fn((_url: string, _key: string, _options: unknown) => client);
  const encryptedStorage = {
    ...createStorage(),
    migrateLegacyPlaintextAtStartup: jest.fn(),
  };
  const getEncryptedNativeStorage = options?.encryptedStorageError
    ? jest.fn(() => { throw options.encryptedStorageError; })
    : jest.fn(() => encryptedStorage);
  const rawAsyncStorageFactory = jest.fn(() => ({ default: createStorage() }));
  const addEventListener = jest.fn();
  const reactNativeFactory = jest.fn(() => ({ AppState: { addEventListener } }));

  jest.doMock("@supabase/supabase-js", () => ({ createClient }));
  jest.doMock("../../env", () => ({
    getEnv: () => ({
      EXPO_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      EXPO_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key-long-enough",
    }),
  }));
  jest.doMock("../../storage/encrypted-native-storage", () => ({ getEncryptedNativeStorage }));
  jest.doMock("@react-native-async-storage/async-storage", rawAsyncStorageFactory);
  jest.doMock("react-native", reactNativeFactory);

  return {
    addEventListener,
    client,
    createClient,
    encryptedStorage,
    getEncryptedNativeStorage,
    rawAsyncStorageFactory,
    reactNativeFactory,
    removeAllChannels,
    startAutoRefresh,
    stopAutoRefresh,
  };
}

function loadClientModule(): ClientModule {
  let loaded!: ClientModule;
  jest.isolateModules(() => {
    loaded = require("../client") as ClientModule;
  });
  return loaded;
}

function authOptions(createClient: jest.Mock): {
  detectSessionInUrl: boolean;
  storage?: unknown;
} {
  return (createClient.mock.calls[0][2] as { auth: {
    detectSessionInUrl: boolean;
    storage?: unknown;
  } }).auth;
}

describe("Supabase auth storage runtime boundary", () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    restoreGlobal("document", originalDocument);
    restoreGlobal("navigator", originalNavigator);
    restoreGlobal("localStorage", originalLocalStorage);
  });

  test("uses only encrypted storage in a genuine React Native runtime and preserves AppState refresh", () => {
    setRuntime("native");
    const mocks = installModuleMocks();
    const module = loadClientModule();

    expect(module.getSupabaseClient()).toBe(mocks.client);
    expect(authOptions(mocks.createClient)).toEqual(expect.objectContaining({
      detectSessionInUrl: false,
      storage: mocks.encryptedStorage,
    }));
    expect(mocks.getEncryptedNativeStorage).toHaveBeenCalledTimes(1);
    expect(mocks.encryptedStorage.migrateLegacyPlaintextAtStartup).not.toHaveBeenCalled();
    expect(mocks.rawAsyncStorageFactory).not.toHaveBeenCalled();

    expect(mocks.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    const onAppStateChange = mocks.addEventListener.mock.calls[0][1] as (state: string) => void;
    onAppStateChange("active");
    onAppStateChange("background");
    expect(mocks.startAutoRefresh).toHaveBeenCalledTimes(1);
    expect(mocks.stopAutoRefresh).toHaveBeenCalledTimes(1);
  });

  test("fails closed before creating a client when encrypted native storage cannot initialize", () => {
    setRuntime("native");
    const failure = new Error("secure_storage_key_unavailable");
    const mocks = installModuleMocks({ encryptedStorageError: failure });
    const module = loadClientModule();

    expect(() => module.getSupabaseClient()).toThrow(failure);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.rawAsyncStorageFactory).not.toHaveBeenCalled();
  });

  test("keeps browser localStorage without loading native adapters", () => {
    const webStorage = createStorage();
    setRuntime("web", webStorage);
    const mocks = installModuleMocks();
    const module = loadClientModule();

    expect(module.getSupabaseClient()).toBe(mocks.client);
    expect(authOptions(mocks.createClient)).toEqual(expect.objectContaining({
      detectSessionInUrl: true,
      storage: webStorage,
    }));
    expect(mocks.getEncryptedNativeStorage).not.toHaveBeenCalled();
    expect(mocks.rawAsyncStorageFactory).not.toHaveBeenCalled();
    expect(mocks.reactNativeFactory).not.toHaveBeenCalled();
  });

  test("explicitly omits auth storage in node tests even when AsyncStorage is installed", () => {
    setRuntime("node");
    const mocks = installModuleMocks();
    const module = loadClientModule();

    expect(module.getSupabaseClient()).toBe(mocks.client);
    expect(authOptions(mocks.createClient)).toEqual(expect.objectContaining({
      detectSessionInUrl: false,
      storage: undefined,
    }));
    expect(mocks.getEncryptedNativeStorage).not.toHaveBeenCalled();
    expect(mocks.rawAsyncStorageFactory).not.toHaveBeenCalled();
    expect(mocks.reactNativeFactory).not.toHaveBeenCalled();
  });

  test("reset retires the old client and the next read creates a fresh singleton", async () => {
    setRuntime("native");
    const mocks = installModuleMocks();
    const module = loadClientModule();
    const oldClient = module.getSupabaseClient();
    const nextClient = {
      auth: { startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn() },
      removeAllChannels: jest.fn(async () => undefined),
    };
    mocks.createClient.mockReturnValueOnce(nextClient);

    await module.resetSupabaseClient();

    expect(mocks.stopAutoRefresh).toHaveBeenCalledTimes(1);
    expect(mocks.removeAllChannels).toHaveBeenCalledTimes(1);
    expect(module.getSupabaseClient()).toBe(nextClient);
    expect(module.getSupabaseClient()).not.toBe(oldClient);
    expect(mocks.createClient).toHaveBeenCalledTimes(2);
  });

  test("reset drops the singleton even when every old-client cleanup throws", async () => {
    setRuntime("native");
    const mocks = installModuleMocks();
    const module = loadClientModule();
    const oldClient = module.getSupabaseClient();
    mocks.stopAutoRefresh.mockImplementationOnce(() => { throw new Error("stop failed"); });
    mocks.removeAllChannels.mockRejectedValueOnce(new Error("channel cleanup failed"));
    const nextClient = {
      auth: { startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn() },
      removeAllChannels: jest.fn(async () => undefined),
    };
    mocks.createClient.mockReturnValueOnce(nextClient);

    await expect(module.resetSupabaseClient()).resolves.toBeUndefined();
    expect(module.getSupabaseClient()).toBe(nextClient);
    expect(module.getSupabaseClient()).not.toBe(oldClient);
  });
});
