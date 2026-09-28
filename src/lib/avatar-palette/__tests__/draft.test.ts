const nativeValues = new Map<string, string>();
const mockEncryptedStorage = {
  getItem: jest.fn(async (key: string) => nativeValues.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { nativeValues.set(key, value); }),
  removeItem: jest.fn(async (key: string) => { nativeValues.delete(key); }),
};
const mockGetEncryptedNativeStorage = jest.fn(() => mockEncryptedStorage);
const mockRawAsyncStorage = {
  getItem: jest.fn(async (_key: string) => null),
  setItem: jest.fn(async (_key: string, _value: string) => undefined),
};

jest.mock("../../storage/encrypted-native-storage", () => ({
  getEncryptedNativeStorage: () => mockGetEncryptedNativeStorage(),
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: mockRawAsyncStorage,
}));

import { __resetAccountLocalDeletionFencesForTests, installAccountLocalDeletionFence } from
  "../../account/local-deletion-fence";
import { EMPTY_PIXELS, setPixel } from "../pixels";
import {
  avatarPaletteDraftKey,
  deleteAvatarPaletteDraft,
  loadAvatarPaletteDraft,
  purgeAvatarPaletteDraftsForDeletedAccount,
  saveAvatarPaletteDraft,
} from "../draft";

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
  clear(): void { this.values.clear(); }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  get length(): number { return this.values.size; }
}

const webStorage = new MemoryStorage();
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

function runtime(product: "Gecko" | "ReactNative"): void {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { product } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: webStorage });
}

beforeEach(() => {
  webStorage.clear();
  nativeValues.clear();
  jest.clearAllMocks();
  __resetAccountLocalDeletionFencesForTests();
  runtime("Gecko");
});

afterAll(() => {
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
  else Reflect.deleteProperty(globalThis, "navigator");
  if (originalLocalStorage) Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

test("keeps one local draft per owner and slot, including an untitled transparent canvas", async () => {
  const art = setPixel(EMPTY_PIXELS, 2, 3, 7);
  await saveAvatarPaletteDraft("owner-a", { slot: "hair", title: "  ", pixels: EMPTY_PIXELS });
  await saveAvatarPaletteDraft("owner-a", { slot: "garment", title: "Jacket", pixels: art });
  await saveAvatarPaletteDraft("owner-b", { slot: "hair", title: "Other", pixels: art });
  expect(await loadAvatarPaletteDraft("owner-a", "hair")).toEqual({
    slot: "hair", title: "", pixels: EMPTY_PIXELS, updatedAt: expect.any(String),
  });
  expect((await loadAvatarPaletteDraft("owner-a", "garment"))?.pixels).toBe(art);
  expect((await loadAvatarPaletteDraft("owner-b", "hair"))?.title).toBe("Other");
  expect(webStorage.values.size).toBe(2);

  await saveAvatarPaletteDraft("owner-a", { slot: "hair", title: "Hat", pixels: art });
  expect((await loadAvatarPaletteDraft("owner-a", "hair"))?.title).toBe("Hat");
  expect((await loadAvatarPaletteDraft("owner-a", "garment"))?.title).toBe("Jacket");

  await deleteAvatarPaletteDraft("owner-a", "hair");
  expect(await loadAvatarPaletteDraft("owner-a", "hair")).toBeNull();
  expect(await loadAvatarPaletteDraft("owner-a", "garment")).not.toBeNull();
  await deleteAvatarPaletteDraft("owner-a", "garment");
  expect(webStorage.getItem(avatarPaletteDraftKey("owner-a"))).toBeNull();
  expect(await loadAvatarPaletteDraft("owner-b", "hair")).not.toBeNull();
  expect(mockGetEncryptedNativeStorage).not.toHaveBeenCalled();
});

test("ignores corrupt, oversized, cross-slot, and invalid pixel payloads", async () => {
  const key = avatarPaletteDraftKey("owner-a");
  webStorage.setItem(key, "{broken");
  expect(await loadAvatarPaletteDraft("owner-a", "hair")).toBeNull();
  webStorage.setItem(key, "x".repeat(20_000));
  expect(await loadAvatarPaletteDraft("owner-a", "hair")).toBeNull();
  webStorage.setItem(key, JSON.stringify({ v: 1, drafts: {
    hair: { slot: "garment", title: "wrong", pixels: EMPTY_PIXELS, updatedAt: new Date().toISOString() },
    garment: { slot: "garment", title: "valid", pixels: EMPTY_PIXELS, updatedAt: new Date().toISOString() },
    accessory: { slot: "accessory", title: "bad", pixels: "<svg/>", updatedAt: new Date().toISOString() },
  } }));
  expect(await loadAvatarPaletteDraft("owner-a", "hair")).toBeNull();
  expect((await loadAvatarPaletteDraft("owner-a", "garment"))?.title).toBe("valid");
  expect(await loadAvatarPaletteDraft("owner-a", "accessory")).toBeNull();
});

test("rejects invalid inputs before storage writes", async () => {
  await expect(saveAvatarPaletteDraft("owner-a", {
    slot: "hair", title: "x".repeat(33), pixels: EMPTY_PIXELS,
  })).rejects.toThrow(TypeError);
  await expect(saveAvatarPaletteDraft("owner-a", {
    slot: "hair", title: "ok", pixels: "0".repeat(4096),
  })).rejects.toThrow(TypeError);
  await expect(saveAvatarPaletteDraft("owner-a/other", {
    slot: "hair", title: "ok", pixels: EMPTY_PIXELS,
  })).rejects.toThrow(TypeError);
  expect(webStorage.values.size).toBe(0);
});

test("serializes simultaneous updates without losing another slot", async () => {
  await Promise.all([
    saveAvatarPaletteDraft("owner-a", { slot: "hair", title: "Hair", pixels: EMPTY_PIXELS }),
    saveAvatarPaletteDraft("owner-a", { slot: "garment", title: "Coat", pixels: EMPTY_PIXELS }),
  ]);
  expect((await loadAvatarPaletteDraft("owner-a", "hair"))?.title).toBe("Hair");
  expect((await loadAvatarPaletteDraft("owner-a", "garment"))?.title).toBe("Coat");
});

test("native runtime uses encrypted storage even when a localStorage polyfill exists", async () => {
  runtime("ReactNative");
  await saveAvatarPaletteDraft("owner-a", { slot: "hair", title: "Native", pixels: EMPTY_PIXELS });
  expect(mockGetEncryptedNativeStorage).toHaveBeenCalled();
  expect(nativeValues.has(avatarPaletteDraftKey("owner-a"))).toBe(true);
  expect(webStorage.values.size).toBe(0);
  expect((await loadAvatarPaletteDraft("owner-a", "hair"))?.title).toBe("Native");
  mockEncryptedStorage.getItem.mockRejectedValueOnce(new Error("encrypted read unavailable"));
  await expect(loadAvatarPaletteDraft("owner-a", "hair")).rejects.toThrow("encrypted read unavailable");
  const persisted = nativeValues.get(avatarPaletteDraftKey("owner-a"));
  mockEncryptedStorage.getItem.mockRejectedValueOnce(new Error("encrypted read unavailable"));
  await expect(saveAvatarPaletteDraft("owner-a", {
    slot: "garment", title: "Must not replace hair", pixels: EMPTY_PIXELS,
  })).rejects.toThrow("encrypted read unavailable");
  expect(nativeValues.get(avatarPaletteDraftKey("owner-a"))).toBe(persisted);
});

test("terminal deletion purges one owner and prevents later writes", async () => {
  await saveAvatarPaletteDraft("owner-a", { slot: "hair", title: "A", pixels: EMPTY_PIXELS });
  await saveAvatarPaletteDraft("owner-b", { slot: "hair", title: "B", pixels: EMPTY_PIXELS });
  expect(await installAccountLocalDeletionFence("owner-a")).toBe(false); // no Web Locks in Jest
  expect(await purgeAvatarPaletteDraftsForDeletedAccount("owner-a")).toBe(true);
  expect(webStorage.getItem(avatarPaletteDraftKey("owner-a"))).toBeNull();
  expect((await loadAvatarPaletteDraft("owner-b", "hair"))?.title).toBe("B");
  await expect(saveAvatarPaletteDraft("owner-a", {
    slot: "hair", title: "late", pixels: EMPTY_PIXELS,
  })).rejects.toThrow("avatar_palette_local_write_blocked");
  expect(await loadAvatarPaletteDraft("owner-a", "hair")).toBeNull();
});

test("purge reports storage failure instead of claiming completion", async () => {
  runtime("ReactNative");
  mockEncryptedStorage.removeItem.mockRejectedValueOnce(new Error("device unavailable"));
  await expect(purgeAvatarPaletteDraftsForDeletedAccount("owner-a")).resolves.toBe(false);
});
