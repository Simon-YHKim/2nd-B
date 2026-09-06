import { AuthUnknownError } from "@supabase/supabase-js";
import { ENCRYPTED_STORAGE_RECOVERY_REQUIRED } from "../../storage/encrypted-native-storage";
import {
  attemptEncryptedNativeStorageRecovery,
  isEncryptedStorageRecoveryRequired,
  readAuthSessionOutcome,
} from "../storage-recovery";

const recoverStorage = jest.fn<Promise<unknown>, [unknown]>();
const getClient = jest.fn<unknown, []>();
const resetClient = jest.fn<Promise<void>, []>();
const recoveryDependencies = {
  recover: recoverStorage,
  recreateClient: getClient,
  resetClient,
};

function errorWithCause(message: string, cause: unknown): Error {
  const error = new Error(message);
  Object.defineProperty(error, "cause", { configurable: true, value: cause });
  return error;
}

describe("encrypted auth-storage recovery classification", () => {
  test("recognizes only the exact recovery error through bounded AuthUnknownError wrappers", () => {
    const leaf = new Error(ENCRYPTED_STORAGE_RECOVERY_REQUIRED);
    const nested = errorWithCause("outer-auth-failure", leaf);
    const wrapped = new AuthUnknownError("Auth session missing", nested);

    expect(isEncryptedStorageRecoveryRequired(leaf)).toBe(true);
    expect(isEncryptedStorageRecoveryRequired(wrapped)).toBe(true);

    const tooDeep = Array.from({ length: 20 }).reduce<Error>(
      (cause, _, index) => errorWithCause(`wrapper-${index}`, cause),
      leaf,
    );
    expect(isEncryptedStorageRecoveryRequired(tooDeep)).toBe(false);
  });

  test.each([
    ENCRYPTED_STORAGE_RECOVERY_REQUIRED,
    { message: ENCRYPTED_STORAGE_RECOVERY_REQUIRED },
    new Error("secure_storage_key_unavailable"),
    new Error("Network request failed"),
    new Error(`prefix:${ENCRYPTED_STORAGE_RECOVERY_REQUIRED}`),
    new Error(`${ENCRYPTED_STORAGE_RECOVERY_REQUIRED} `),
    new AuthUnknownError("Network request failed", new Error("fetch failed")),
  ])("does not classify strings, generic objects, transient, network, or mutated errors", (error) => {
    expect(isEncryptedStorageRecoveryRequired(error)).toBe(false);
  });

  test("terminates safely when wrapper causes form a cycle", () => {
    const first = new Error("first");
    const second = errorWithCause("second", first);
    Object.defineProperty(first, "cause", { configurable: true, value: second });

    expect(isEncryptedStorageRecoveryRequired(first)).toBe(false);
  });
});

describe("auth session recovery outcome", () => {
  test.each(["rejected", "resolved-error"] as const)(
    "preserves recovery-required for a %s getSession failure",
    async (kind) => {
      const nested = new AuthUnknownError(
        "Auth session missing",
        new Error(ENCRYPTED_STORAGE_RECOVERY_REQUIRED),
      );
      const getSession = kind === "rejected"
        ? jest.fn().mockRejectedValue(nested)
        : jest.fn().mockResolvedValue({ data: { session: null }, error: nested });

      await expect(readAuthSessionOutcome(getSession, 100)).resolves.toEqual({
        status: "storage-recovery-required",
      });
    },
  );

  test("keeps transient key unavailability non-destructive and unknown", async () => {
    const getSession = jest.fn().mockRejectedValue(new Error("secure_storage_key_unavailable"));

    await expect(readAuthSessionOutcome(getSession, 100)).resolves.toEqual({ status: "unavailable" });
    expect(recoverStorage).not.toHaveBeenCalled();
  });

  test("returns the current user only from a successful session result", async () => {
    const getSession = jest.fn().mockResolvedValue({
      data: { session: { user: { id: "user-123" } } },
      error: null,
    });

    await expect(readAuthSessionOutcome(getSession, 100)).resolves.toEqual({
      status: "ready",
      userId: "user-123",
    });
  });
});

describe("explicit recovery consent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    recoverStorage.mockResolvedValue({ discardedManagedKeys: 2 });
    resetClient.mockResolvedValue(undefined);
    getClient.mockReturnValue({});
  });

  test.each([
    undefined,
    {},
    { acknowledgedDataLoss: true },
    { acknowledgedDataLoss: false, action: "discard-unreadable-encrypted-local-data" },
    { acknowledgedDataLoss: true, action: "discard-local-data" },
    {
      acknowledgedDataLoss: true,
      action: "discard-unreadable-encrypted-local-data",
      unexpected: true,
    },
  ])("does nothing before the exact two-field consent contract", async (consent) => {
    await expect(attemptEncryptedNativeStorageRecovery(
      consent as never,
      recoveryDependencies,
    )).resolves.toBe("invalid-consent");
    expect(recoverStorage).not.toHaveBeenCalled();
    expect(resetClient).not.toHaveBeenCalled();
    expect(getClient).not.toHaveBeenCalled();
  });

  test("recovers, resets, and eagerly recreates the client in order after exact consent", async () => {
    const consent = {
      acknowledgedDataLoss: true as const,
      action: "discard-unreadable-encrypted-local-data" as const,
    };

    await expect(attemptEncryptedNativeStorageRecovery(consent, recoveryDependencies)).resolves.toBe("recovered");
    expect(recoverStorage).toHaveBeenCalledWith(consent);
    expect(resetClient).toHaveBeenCalledTimes(1);
    expect(getClient).toHaveBeenCalledTimes(1);
    expect(recoverStorage.mock.invocationCallOrder[0]).toBeLessThan(resetClient.mock.invocationCallOrder[0]);
    expect(resetClient.mock.invocationCallOrder[0]).toBeLessThan(getClient.mock.invocationCallOrder[0]);
  });

  test("reports failure without resetting when destructive recovery itself fails", async () => {
    recoverStorage.mockRejectedValueOnce(new Error("raw secret must not escape"));

    await expect(attemptEncryptedNativeStorageRecovery({
      acknowledgedDataLoss: true,
      action: "discard-unreadable-encrypted-local-data",
    }, recoveryDependencies)).resolves.toBe("failed");
    expect(resetClient).not.toHaveBeenCalled();
    expect(getClient).not.toHaveBeenCalled();
  });

  test("does not claim success when recreation fails", async () => {
    getClient.mockImplementationOnce(() => {
      throw new Error("secure_storage_key_unavailable");
    });

    await expect(attemptEncryptedNativeStorageRecovery({
      acknowledgedDataLoss: true,
      action: "discard-unreadable-encrypted-local-data",
    }, recoveryDependencies)).resolves.toBe("failed");
  });
});

interface AuthHarnessState {
  userId: string | null;
  hasProfile: boolean | null;
  isMinor: boolean | null;
  age: number | null;
  profileProbeFailed: boolean;
  storageRecoveryRequired: boolean;
  loading: boolean;
}

interface AuthHarnessValue extends AuthHarnessState {
  refresh(): Promise<void>;
  recoverEncryptedStorage(consent: unknown): Promise<boolean>;
}

function loadAuthProviderHarness(
  initialOutcome: { status: string; userId?: string | null } = {
    status: "storage-recovery-required",
  },
  initialAuthState?: AuthHarnessState,
) {
  const previousGlobalReact = Object.getOwnPropertyDescriptor(globalThis, "React");
  Object.defineProperty(globalThis, "React", {
    configurable: true,
    value: { createElement: () => null },
  });
  const stateValues: unknown[] = [];
  if (initialAuthState) {
    const { storageRecoveryRequired, ...authState } = initialAuthState;
    stateValues[0] = authState;
    stateValues[1] = storageRecoveryRequired;
  }
  const stateSetters: jest.Mock[] = [];
  const refValues: Array<{ current: unknown }> = [];
  let stateCursor = 0;
  let refCursor = 0;
  let effects: Array<() => void | (() => void)> = [];
  let contextValue: AuthHarnessValue | undefined;

  const oldUnsubscribe = jest.fn();
  const newUnsubscribe = jest.fn();
  const oldSignOut = jest.fn();
  const newSignOut = jest.fn();
  const oldClient = {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: oldUnsubscribe } } })),
      signOut: oldSignOut,
    },
  };
  const newClient = {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: newUnsubscribe } } })),
      signOut: newSignOut,
    },
  };
  const getClientForProvider = jest.fn()
    .mockReturnValueOnce(oldClient)
    .mockReturnValue(newClient);
  const readOutcome = jest.fn()
    .mockResolvedValueOnce(initialOutcome)
    .mockResolvedValue({ status: "ready", userId: null });
  const attemptRecovery = jest.fn();
  const noteResolvedOwner = jest.fn();
  let render!: () => {
    effects: Array<() => void | (() => void)>;
    value: AuthHarnessValue;
  };

  jest.isolateModules(() => {
    jest.doMock("react", () => ({
      createContext: () => ({ Provider: () => null }),
      createElement: () => null,
      useCallback: (callback: unknown) => callback,
      useContext: () => contextValue,
      useEffect: (effect: () => void | (() => void)) => {
        effects.push(effect);
      },
      useMemo: (factory: () => AuthHarnessValue) => {
        contextValue = factory();
        return contextValue;
      },
      useRef: (initial: unknown) => {
        const index = refCursor++;
        if (!refValues[index]) refValues[index] = { current: initial };
        return refValues[index];
      },
      useState: (initial: unknown) => {
        const index = stateCursor++;
        if (!(index in stateValues)) stateValues[index] = initial;
        if (!stateSetters[index]) {
          stateSetters[index] = jest.fn((update: unknown) => {
            stateValues[index] = typeof update === "function"
              ? (update as (previous: unknown) => unknown)(stateValues[index])
              : update;
          });
        }
        return [stateValues[index], stateSetters[index]];
      },
    }));
    jest.doMock("react/jsx-runtime", () => ({
      Fragment: "fragment",
      jsx: () => null,
      jsxs: () => null,
    }));
    jest.doMock("../../supabase/client", () => ({ getSupabaseClient: getClientForProvider }));
    jest.doMock("../storage-recovery", () => ({
      attemptEncryptedNativeStorageRecovery: attemptRecovery,
      isEncryptedStorageRecoveryRequired: isEncryptedStorageRecoveryRequired,
      readAuthSessionOutcome: readOutcome,
    }));
    jest.doMock("../account-epoch", () => ({ noteResolvedOwner }));

    const { AuthProvider } = require("../AuthContext") as {
      AuthProvider(props: { children: null }): unknown;
    };
    render = () => {
      stateCursor = 0;
      refCursor = 0;
      effects = [];
      AuthProvider({ children: null });
      if (!contextValue) throw new Error("auth_context_value_not_captured");
      return { effects: [...effects], value: contextValue };
    };
  });

  const firstRender = render();

  return {
    attemptRecovery,
    firstRender,
    get authState() {
      return {
        ...(stateValues[0] as Omit<AuthHarnessState, "storageRecoveryRequired">),
        storageRecoveryRequired: stateValues[1] as boolean,
      };
    },
    getClientForProvider,
    newClient,
    newSignOut,
    newUnsubscribe,
    noteResolvedOwner,
    oldClient,
    oldSignOut,
    oldUnsubscribe,
    readOutcome,
    render,
    restoreGlobalReact() {
      if (previousGlobalReact) Object.defineProperty(globalThis, "React", previousGlobalReact);
      else Reflect.deleteProperty(globalThis, "React");
    },
  };
}

async function flushPromises(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("AuthContext recovery lifecycle", () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock("react");
    jest.dontMock("react/jsx-runtime");
    jest.dontMock("../../supabase/client");
    jest.dontMock("../storage-recovery");
    jest.dontMock("../account-epoch");
  });

  test("holds recovery state on failure, then re-subscribes with a fresh epoch after success", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const harness = loadAuthProviderHarness(undefined, {
      userId: "known-user",
      hasProfile: true,
      isMinor: false,
      age: 32,
      profileProbeFailed: false,
      storageRecoveryRequired: false,
      loading: false,
    });
    const consent = {
      acknowledgedDataLoss: true,
      action: "discard-unreadable-encrypted-local-data",
    };

    // Consent cannot trigger deletion before the provider has classified the
    // exact durable recovery error.
    await expect(harness.firstRender.value.recoverEncryptedStorage(consent)).resolves.toBe(false);
    expect(harness.attemptRecovery).not.toHaveBeenCalled();

    const firstCleanup = harness.firstRender.effects[0]();
    await flushPromises();
    expect(harness.authState.storageRecoveryRequired).toBe(true);
    expect(harness.authState).toEqual(expect.objectContaining({
      userId: null,
      hasProfile: null,
      isMinor: null,
      age: null,
    }));
    expect(harness.noteResolvedOwner).not.toHaveBeenCalled();

    harness.attemptRecovery.mockResolvedValueOnce("failed");
    await expect(harness.firstRender.value.recoverEncryptedStorage(consent)).resolves.toBe(false);
    expect(harness.authState.storageRecoveryRequired).toBe(true);
    expect(harness.authState.loading).toBe(false);

    harness.attemptRecovery.mockResolvedValueOnce("recovered");
    await expect(harness.firstRender.value.recoverEncryptedStorage(consent)).resolves.toBe(true);
    expect(harness.authState).toEqual(expect.objectContaining({
      storageRecoveryRequired: false,
      loading: true,
    }));
    expect(harness.oldSignOut).not.toHaveBeenCalled();

    if (typeof firstCleanup === "function") firstCleanup();
    const secondRender = harness.render();
    secondRender.effects[0]();
    await flushPromises();

    expect(harness.oldUnsubscribe).toHaveBeenCalledTimes(1);
    expect(harness.getClientForProvider).toHaveBeenCalledTimes(2);
    expect(harness.oldClient.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(harness.newClient.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(harness.newSignOut).not.toHaveBeenCalled();
    harness.restoreGlobalReact();
    warn.mockRestore();
  });

  test("never writes a rejected raw session error to logs", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const harness = loadAuthProviderHarness();
    const secret = "private-device-error-payload";
    harness.readOutcome.mockReset();
    harness.readOutcome.mockRejectedValueOnce(new Error(secret));

    harness.firstRender.effects[0]();
    await flushPromises();

    const logged = [...log.mock.calls, ...warn.mock.calls].flat().join(" ");
    expect(logged).not.toContain(secret);
    harness.restoreGlobalReact();
    log.mockRestore();
    warn.mockRestore();
  });

  test("does not expose destructive recovery for transient key unavailability", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const harness = loadAuthProviderHarness({ status: "unavailable" });
    const consent = {
      acknowledgedDataLoss: true,
      action: "discard-unreadable-encrypted-local-data",
    };

    harness.firstRender.effects[0]();
    await flushPromises();

    expect(harness.authState.storageRecoveryRequired).toBe(false);
    await expect(harness.firstRender.value.recoverEncryptedStorage(consent)).resolves.toBe(false);
    expect(harness.attemptRecovery).not.toHaveBeenCalled();
    harness.restoreGlobalReact();
    log.mockRestore();
  });
});
