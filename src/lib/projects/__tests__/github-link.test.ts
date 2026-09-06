import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getGithubUsername, setGithubUsername } from "../github-link";

const mockNativeBacking = new Map<string, string>();
const mockWebBacking = new Map<string, string>();
const mockEncryptedStorage = {
  getItem: jest.fn(async (key: string) => mockNativeBacking.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockNativeBacking.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    mockNativeBacking.delete(key);
  }),
};
const mockGetEncryptedNativeStorage = jest.fn(() => mockEncryptedStorage);
const mockWebStorage = {
  getItem: jest.fn((key: string) => mockWebBacking.get(key) ?? null),
  setItem: jest.fn((key: string, value: string) => {
    mockWebBacking.set(key, value);
  }),
  removeItem: jest.fn((key: string) => {
    mockWebBacking.delete(key);
  }),
};

jest.mock("../../storage/encrypted-native-storage", () => ({
  getEncryptedNativeStorage: () => mockGetEncryptedNativeStorage(),
}));

const SRC = join(__dirname, "..", "..", "..");
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

function restoreGlobal(
  name: "document" | "navigator" | "localStorage",
  descriptor?: PropertyDescriptor,
): void {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}

function setRuntime(kind: "native" | "web" | "node", exposeNativePolyfill = false): void {
  replaceGlobal("document", kind === "web" ? {} : undefined);
  replaceGlobal("navigator", kind === "native" ? { product: "ReactNative" } : { product: "Node.js" });
  replaceGlobal("localStorage", kind === "web" || exposeNativePolyfill ? mockWebStorage : undefined);
}

beforeEach(() => {
  mockNativeBacking.clear();
  mockWebBacking.clear();
  mockEncryptedStorage.getItem.mockReset().mockImplementation(
    async (key: string) => mockNativeBacking.get(key) ?? null,
  );
  mockEncryptedStorage.setItem.mockReset().mockImplementation(async (key: string, value: string) => {
    mockNativeBacking.set(key, value);
  });
  mockEncryptedStorage.removeItem.mockReset().mockImplementation(async (key: string) => {
    mockNativeBacking.delete(key);
  });
  mockGetEncryptedNativeStorage.mockReset().mockReturnValue(mockEncryptedStorage);
  mockWebStorage.getItem.mockClear();
  mockWebStorage.setItem.mockClear();
  mockWebStorage.removeItem.mockClear();
  setRuntime("native");
});

afterEach(() => {
  restoreGlobal("document", originalDocument);
  restoreGlobal("navigator", originalNavigator);
  restoreGlobal("localStorage", originalLocalStorage);
});

describe("GitHub username ownership", () => {
  it("uses encrypted native storage and scopes each account independently", async () => {
    setRuntime("native", true);
    await setGithubUsername(" user-a ", " octocat-a ");
    await setGithubUsername("user-b", "octocat-b");

    expect(await getGithubUsername("user-a")).toBe("octocat-a");
    expect(await getGithubUsername("user-b")).toBe("octocat-b");
    expect(mockNativeBacking).toEqual(
      new Map([
        ["ops.github.username:user-a", "octocat-a"],
        ["ops.github.username:user-b", "octocat-b"],
      ]),
    );
    expect(mockGetEncryptedNativeStorage).toHaveBeenCalled();
    expect(mockWebStorage.getItem).not.toHaveBeenCalled();
    expect(mockWebStorage.setItem).not.toHaveBeenCalled();
    expect(mockWebStorage.removeItem).not.toHaveBeenCalled();
  });

  it("clears only the requesting account", async () => {
    await setGithubUsername("user-a", "octocat-a");
    await setGithubUsername("user-b", "octocat-b");
    await setGithubUsername("user-a", "   ");

    expect(await getGithubUsername("user-a")).toBe("");
    expect(await getGithubUsername("user-b")).toBe("octocat-b");
  });

  it("rejects invalid owners without touching storage", async () => {
    await expect(getGithubUsername("   ")).rejects.toThrow("invalid_github_owner");
    await expect(setGithubUsername("owner:ambiguous", "octocat")).rejects.toThrow(
      "invalid_github_owner",
    );
    await expect(setGithubUsername("a".repeat(129), "octocat")).rejects.toThrow(
      "invalid_github_owner",
    );

    expect(mockEncryptedStorage.getItem).not.toHaveBeenCalled();
    expect(mockEncryptedStorage.setItem).not.toHaveBeenCalled();
    expect(mockEncryptedStorage.removeItem).not.toHaveBeenCalled();
  });

  it("does not assign the ambiguous legacy key to the next account", async () => {
    mockNativeBacking.set("ops.github.username", "legacy-owner-unknown");

    expect(await getGithubUsername("user-a")).toBe("");
    expect(mockEncryptedStorage.getItem).toHaveBeenCalledWith("ops.github.username:user-a");
    expect(mockEncryptedStorage.getItem).not.toHaveBeenCalledWith("ops.github.username");
  });

  it("rejects malformed usernames without clearing a valid saved value", async () => {
    await setGithubUsername("user-a", "octocat-a");

    await expect(setGithubUsername("user-a", "-not-a-login")).rejects.toThrow(
      "invalid_github_username",
    );
    await expect(setGithubUsername("user-a", "a".repeat(40))).rejects.toThrow(
      "invalid_github_username",
    );
    await expect(
      setGithubUsername("user-a", null as unknown as string),
    ).rejects.toThrow("invalid_github_username");

    expect(await getGithubUsername("user-a")).toBe("octocat-a");
    expect(mockEncryptedStorage.removeItem).not.toHaveBeenCalled();
  });

  it("rejects malformed stored values instead of treating corruption as empty", async () => {
    mockNativeBacking.set("ops.github.username:user-a", "-corrupt-login");

    await expect(getGithubUsername("user-a")).rejects.toThrow(
      "invalid_stored_github_username",
    );
  });

  it("propagates native initialization, recovery, read, write, and clear failures", async () => {
    const initFailure = new Error("secure_store_unavailable");
    mockGetEncryptedNativeStorage.mockImplementationOnce(() => {
      throw initFailure;
    });
    await expect(getGithubUsername("user-a")).rejects.toBe(initFailure);

    const recoveryFailure = new Error("secure_storage_recovery_required");
    mockEncryptedStorage.getItem.mockRejectedValueOnce(recoveryFailure);
    await expect(getGithubUsername("user-a")).rejects.toBe(recoveryFailure);

    const writeFailure = new Error("secure_storage_capacity_exceeded");
    mockEncryptedStorage.setItem.mockRejectedValueOnce(writeFailure);
    await expect(setGithubUsername("user-a", "octocat")).rejects.toBe(writeFailure);

    const clearFailure = new Error("secure_storage_key_unavailable");
    mockEncryptedStorage.removeItem.mockRejectedValueOnce(clearFailure);
    await expect(setGithubUsername("user-a", "   ")).rejects.toBe(clearFailure);
  });

  it("preserves browser persistence without loading native storage", async () => {
    setRuntime("web");

    await setGithubUsername("user-a", " octocat ");
    expect(await getGithubUsername("user-a")).toBe("octocat");
    await setGithubUsername("user-a", " ");
    expect(await getGithubUsername("user-a")).toBe("");

    expect(mockWebBacking.size).toBe(0);
    expect(mockGetEncryptedNativeStorage).not.toHaveBeenCalled();
  });

  it("keeps Node storage-free", async () => {
    setRuntime("node");
    replaceGlobal("localStorage", mockWebStorage);

    await setGithubUsername("user-a", "octocat");
    expect(await getGithubUsername("user-a")).toBe("");
    expect(mockGetEncryptedNativeStorage).not.toHaveBeenCalled();
    expect(mockWebStorage.setItem).not.toHaveBeenCalled();
  });

  it("contains no raw AsyncStorage import or eager migration call", () => {
    const source = readFileSync(join(SRC, "lib", "projects", "github-link.ts"), "utf8");

    expect(source).not.toContain("@react-native-async-storage/async-storage");
    expect(source).not.toContain("migrateLegacyNativePlaintextAtStartup");
  });
});

describe("/side-project ownership wiring", () => {
  it("guards auth before keyed child mount and propagates the owner", () => {
    const source = readFileSync(join(SRC, "app", "side-project.tsx"), "utf8");
    const loadingAt = source.indexOf("if (loading) return null;");
    const redirectAt = source.indexOf('if (!userId) return <Redirect href="/sign-in" />;');
    const mountAt = source.indexOf("<SideProjectScreen key={userId} userId={userId} />");

    expect(loadingAt).toBeGreaterThan(-1);
    expect(redirectAt).toBeGreaterThan(loadingAt);
    expect(mountAt).toBeGreaterThan(redirectAt);
  });

  it("uses the owner for restore, save, and effect lifecycle", () => {
    const source = readFileSync(join(SRC, "screens", "deepspace", "ops", "screens.tsx"), "utf8");
    const start = source.indexOf("export function SideProjectScreen");
    const end = source.indexOf("export function MealsScreen", start);
    const screen = source.slice(start, end);

    expect(screen).toContain("SideProjectScreen({ userId }: { userId: string })");
    expect(screen).toContain("getGithubUsername(userId)");
    expect(screen).toContain("setGithubUsername(userId, username)");
    expect(screen).toContain("}, [userId]);");
  });

  it("declares the route as authenticated in the screen registry", () => {
    const source = readFileSync(join(SRC, "lib", "dev", "screen-index.ts"), "utf8");
    expect(source).toContain(
      '{ file: "side-project", href: "/side-project", label: "사이드 프로젝트", auth: true }',
    );
  });
});
