import {
  getEncryptedNativeStorage,
  migrateLegacyNativePlaintextAtStartup,
  type StringStorage,
} from "../../storage/encrypted-native-storage";
import {
  __resetRecoveryProofStorageQueueForTests,
  clearRecoveryStateExpected,
  createRecoveryProof,
  loadRecoveryProof,
  persistRecoveryProof,
  RECOVERY_PROOF_KEY,
} from "../recovery-proof-store";
import { __resetAuthStorageRuntimeForTests } from "../session-mutation";

const mockRawAsyncStorageFactory = jest.fn(() => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock("../../storage/encrypted-native-storage", () => ({
  getEncryptedNativeStorage: jest.fn(),
  migrateLegacyNativePlaintextAtStartup: jest.fn(),
}));

jest.mock("@react-native-async-storage/async-storage", () => {
  mockRawAsyncStorageFactory();
  return { __esModule: true, default: {} };
});

const mockGetEncryptedNativeStorage = jest.mocked(getEncryptedNativeStorage);
const mockMigrateLegacyNativePlaintextAtStartup = jest.mocked(
  migrateLegacyNativePlaintextAtStartup,
);

function createNativeStorage(): { values: Map<string, string>; storage: StringStorage } {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      getItem: jest.fn(async (key: string) => values.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        values.delete(key);
      }),
    },
  };
}

describe("native recovery proof storage wiring", () => {
  const descriptors = new Map<string, PropertyDescriptor | undefined>();

  beforeEach(() => {
    for (const name of ["document", "window", "navigator", "localStorage"] as const) {
      descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    }
    Reflect.deleteProperty(globalThis, "document");
    Reflect.deleteProperty(globalThis, "window");
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { product: "ReactNative" },
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
      },
    });
    __resetAuthStorageRuntimeForTests();
    __resetRecoveryProofStorageQueueForTests();
    mockGetEncryptedNativeStorage.mockReset();
    mockMigrateLegacyNativePlaintextAtStartup.mockReset().mockResolvedValue({
      status: "already-complete",
      migratedPlaintextKeys: 0,
    });
    mockRawAsyncStorageFactory.mockClear();
  });

  afterEach(() => {
    __resetAuthStorageRuntimeForTests();
    __resetRecoveryProofStorageQueueForTests();
    for (const name of ["document", "window", "navigator", "localStorage"] as const) {
      const descriptor = descriptors.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    descriptors.clear();
  });

  test("persists and clears the proof only through encrypted storage", async () => {
    const native = createNativeStorage();
    mockGetEncryptedNativeStorage.mockReturnValue(native.storage);
    const proof = createRecoveryProof({ userId: "u1", sessionId: "session-a" });

    await persistRecoveryProof(proof);
    await expect(loadRecoveryProof()).resolves.toEqual(proof);
    await expect(clearRecoveryStateExpected(proof)).resolves.toBe(true);

    expect(native.storage.setItem).toHaveBeenCalledWith(
      RECOVERY_PROOF_KEY,
      JSON.stringify(proof),
    );
    expect(native.storage.removeItem).toHaveBeenCalledWith(RECOVERY_PROOF_KEY);
    expect(mockMigrateLegacyNativePlaintextAtStartup).toHaveBeenCalledTimes(1);
    expect(mockRawAsyncStorageFactory).not.toHaveBeenCalled();
    expect((globalThis.localStorage as Storage).setItem).not.toHaveBeenCalled();
  });

  test("propagates encrypted initialization failure without a plaintext fallback", async () => {
    const failure = new Error("secure_storage_key_unavailable");
    mockGetEncryptedNativeStorage.mockImplementation(() => {
      throw failure;
    });

    await expect(loadRecoveryProof()).rejects.toBe(failure);
    expect(mockRawAsyncStorageFactory).not.toHaveBeenCalled();
    expect((globalThis.localStorage as Storage).getItem).not.toHaveBeenCalled();
  });
});
