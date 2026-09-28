let nextId = 1;
const mockRandomUUID = jest.fn(() =>
  `00000000-0000-4000-8000-${(nextId++).toString(16).padStart(12, "0")}`);
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

jest.mock("expo-crypto", () => ({ randomUUID: () => mockRandomUUID() }));
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
  AVATAR_PALETTE_GALLERY_LIMIT,
  avatarPaletteGalleryKey,
  deleteAvatarPaletteItem,
  listAvatarPaletteItems,
  purgeAvatarPaletteItemsForDeletedAccount,
  saveAvatarPaletteItem,
} from "../gallery";

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
  nextId = 1;
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

test("keeps multiple local drawings in one slot and isolates account galleries", async () => {
  const art = setPixel(EMPTY_PIXELS, 2, 3, 7);
  const first = await saveAvatarPaletteItem("owner-a", { slot: "hair", title: "  ", pixels: EMPTY_PIXELS });
  const second = await saveAvatarPaletteItem("owner-a", { slot: "hair", title: "Hat", pixels: art });
  const other = await saveAvatarPaletteItem("owner-b", { slot: "garment", title: "Other", pixels: art });
  expect(first.id).not.toBe(second.id);
  expect(first.title).toBe("");
  expect(first.pixels).toBe(EMPTY_PIXELS);
  expect((await listAvatarPaletteItems("owner-a")).map((item) => item.id).sort())
    .toEqual([first.id, second.id].sort());
  expect((await listAvatarPaletteItems("owner-b")).map((item) => item.id)).toEqual([other.id]);
  expect(webStorage.values.size).toBe(2);
  expect(mockGetEncryptedNativeStorage).not.toHaveBeenCalled();

  const updated = await saveAvatarPaletteItem("owner-a", {
    id: first.id, slot: "accessory", title: "Updated", pixels: art,
  });
  expect(updated.id).toBe(first.id);
  expect(updated.createdAt).toBe(first.createdAt);
  expect((await listAvatarPaletteItems("owner-a"))).toHaveLength(2);
  await expect(saveAvatarPaletteItem("owner-a", {
    id: other.id, slot: "hair", title: "Missing", pixels: art,
  })).rejects.toThrow("avatar_palette_item_not_found");

  await deleteAvatarPaletteItem("owner-a", second.id);
  expect((await listAvatarPaletteItems("owner-a")).map((item) => item.id)).toEqual([first.id]);
  expect(await listAvatarPaletteItems("owner-b")).toHaveLength(1);
});

test("promotes every valid v1 slot draft, including an empty canvas, without writing on read", async () => {
  const key = avatarPaletteGalleryKey("owner-a");
  const old = JSON.stringify({ v: 1, drafts: {
    hair: { slot: "hair", title: "", pixels: EMPTY_PIXELS, updatedAt: "2026-09-28T01:00:00.000Z" },
    garment: { slot: "garment", title: "Jacket", pixels: EMPTY_PIXELS,
      updatedAt: "2026-09-28T02:00:00.000Z" },
  } });
  webStorage.setItem(key, old);
  const promoted = await listAvatarPaletteItems("owner-a");
  expect(promoted.map(({ id, slot, createdAt }) => ({ id, slot, createdAt }))).toEqual([
    { id: "legacy:owner-a:garment", slot: "garment", createdAt: "2026-09-28T02:00:00.000Z" },
    { id: "legacy:owner-a:hair", slot: "hair", createdAt: "2026-09-28T01:00:00.000Z" },
  ]);
  expect(promoted[1].pixels).toBe(EMPTY_PIXELS);
  expect(webStorage.getItem(key)).toBe(old);
  await saveAvatarPaletteItem("owner-a", { slot: "accessory", title: "New", pixels: EMPTY_PIXELS });
  const stored = JSON.parse(webStorage.getItem(key)!);
  expect(stored.v).toBe(2);
  expect(stored.items).toHaveLength(3);
  expect(stored.items.map((item: { id: string }) => item.id)).toContain("legacy:owner-a:hair");
  await saveAvatarPaletteItem("owner-a", {
    id: "legacy:owner-a:hair", slot: "hair", title: "Retouched", pixels: EMPTY_PIXELS,
  });
  expect((await listAvatarPaletteItems("owner-a")).find((item) => item.id === "legacy:owner-a:hair")?.title)
    .toBe("Retouched");
});

test("deleting one legacy work preserves the other and migrates to v2", async () => {
  const key = avatarPaletteGalleryKey("owner-a");
  webStorage.setItem(key, JSON.stringify({ v: 1, drafts: {
    hair: { slot: "hair", title: "H", pixels: EMPTY_PIXELS, updatedAt: "2026-09-28T01:00:00.000Z" },
    garment: { slot: "garment", title: "G", pixels: EMPTY_PIXELS,
      updatedAt: "2026-09-28T02:00:00.000Z" },
  } }));
  await deleteAvatarPaletteItem("owner-a", "legacy:owner-a:hair");
  expect((await listAvatarPaletteItems("owner-a")).map((item) => item.id))
    .toEqual(["legacy:owner-a:garment"]);
  expect(JSON.parse(webStorage.getItem(key)!).v).toBe(2);
});

test("enforces 30 works but allows updates at capacity", async () => {
  for (let index = 0; index < AVATAR_PALETTE_GALLERY_LIMIT; index++) {
    await saveAvatarPaletteItem("owner-a", {
      slot: "hair", title: `Work ${index}`, pixels: EMPTY_PIXELS,
    });
  }
  expect(await listAvatarPaletteItems("owner-a")).toHaveLength(30);
  await expect(saveAvatarPaletteItem("owner-a", {
    slot: "hair", title: "Too many", pixels: EMPTY_PIXELS,
  })).rejects.toThrow("avatar_palette_gallery_full");
  const current = (await listAvatarPaletteItems("owner-a"))[0];
  await expect(saveAvatarPaletteItem("owner-a", {
    id: current.id, slot: "hair", title: "Allowed", pixels: EMPTY_PIXELS,
  })).resolves.toMatchObject({ id: current.id, title: "Allowed" });
  expect(webStorage.getItem(avatarPaletteGalleryKey("owner-a"))!.length).toBeLessThan(160_000);
});

test("sorts by most recently updated and rejects malformed or oversized saved data", async () => {
  const key = avatarPaletteGalleryKey("owner-a");
  const good = {
    id: "00000000-0000-4000-8000-000000000001", slot: "hair", title: "Good",
    pixels: EMPTY_PIXELS, createdAt: "2026-09-28T00:00:00.000Z", updatedAt: "2026-09-28T00:00:00.000Z",
  };
  const newer = { ...good, id: "00000000-0000-4000-8000-000000000002",
    updatedAt: "2026-09-28T10:00:00.000Z" };
  webStorage.setItem(key, JSON.stringify({ v: 2, items: [good, newer] }));
  expect((await listAvatarPaletteItems("owner-a")).map((item) => item.id))
    .toEqual([newer.id, good.id]);

  const invalids = [
    "{broken", "x".repeat(160_001),
    JSON.stringify({ v: 2, items: [good, good] }),
    JSON.stringify({ v: 2, items: [{ ...good, id: "legacy:owner-b:hair" }] }),
    JSON.stringify({ v: 2, items: [{ ...good, pixels: "<svg/>" }] }),
    JSON.stringify({ v: 2, items: Array.from({ length: 31 }, () => good) }),
    JSON.stringify({ v: 1, drafts: {
      hair: { slot: "hair", title: "kept", pixels: EMPTY_PIXELS,
        updatedAt: "2026-09-28T00:00:00.000Z" },
      garment: { slot: "garment", title: "corrupt", pixels: "<svg/>",
        updatedAt: "2026-09-28T00:00:00.000Z" },
    } }),
  ];
  for (const raw of invalids) {
    webStorage.setItem(key, raw);
    await expect(listAvatarPaletteItems("owner-a")).rejects.toThrow("avatar_palette_local_data_invalid");
    await expect(saveAvatarPaletteItem("owner-a", {
      slot: "hair", title: "Do not overwrite", pixels: EMPTY_PIXELS,
    })).rejects.toThrow("avatar_palette_local_data_invalid");
    expect(webStorage.getItem(key)).toBe(raw);
  }
});

test("rejects invalid inputs before storage writes", async () => {
  await expect(saveAvatarPaletteItem("owner-a", {
    slot: "hair", title: "x".repeat(33), pixels: EMPTY_PIXELS,
  })).rejects.toThrow(TypeError);
  await expect(saveAvatarPaletteItem("owner-a", {
    slot: "hair", title: "ok", pixels: "0".repeat(4096),
  })).rejects.toThrow(TypeError);
  await expect(saveAvatarPaletteItem("owner-a/other", {
    slot: "hair", title: "ok", pixels: EMPTY_PIXELS,
  })).rejects.toThrow(TypeError);
  expect(webStorage.values.size).toBe(0);
});

test("serializes simultaneous saves without losing either work", async () => {
  const [first, second] = await Promise.all([
    saveAvatarPaletteItem("owner-a", { slot: "hair", title: "Hair", pixels: EMPTY_PIXELS }),
    saveAvatarPaletteItem("owner-a", { slot: "garment", title: "Coat", pixels: EMPTY_PIXELS }),
  ]);
  expect((await listAvatarPaletteItems("owner-a")).map((item) => item.id).sort())
    .toEqual([first.id, second.id].sort());
});

test("native runtime uses encrypted storage and propagates failures without overwriting", async () => {
  runtime("ReactNative");
  await saveAvatarPaletteItem("owner-a", { slot: "hair", title: "Native", pixels: EMPTY_PIXELS });
  const key = avatarPaletteGalleryKey("owner-a");
  expect(mockGetEncryptedNativeStorage).toHaveBeenCalled();
  expect(nativeValues.has(key)).toBe(true);
  expect(webStorage.values.size).toBe(0);
  mockEncryptedStorage.getItem.mockRejectedValueOnce(new Error("encrypted read unavailable"));
  await expect(listAvatarPaletteItems("owner-a")).rejects.toThrow("encrypted read unavailable");
  const persisted = nativeValues.get(key);
  mockEncryptedStorage.getItem.mockRejectedValueOnce(new Error("encrypted read unavailable"));
  await expect(saveAvatarPaletteItem("owner-a", {
    slot: "garment", title: "Must not replace hair", pixels: EMPTY_PIXELS,
  })).rejects.toThrow("encrypted read unavailable");
  expect(nativeValues.get(key)).toBe(persisted);
});

test("terminal deletion purges one owner and prevents later writes", async () => {
  await saveAvatarPaletteItem("owner-a", { slot: "hair", title: "A", pixels: EMPTY_PIXELS });
  await saveAvatarPaletteItem("owner-b", { slot: "hair", title: "B", pixels: EMPTY_PIXELS });
  expect(await installAccountLocalDeletionFence("owner-a")).toBe(false); // no Web Locks in Jest
  expect(await purgeAvatarPaletteItemsForDeletedAccount("owner-a")).toBe(true);
  expect(webStorage.getItem(avatarPaletteGalleryKey("owner-a"))).toBeNull();
  expect(await listAvatarPaletteItems("owner-b")).toHaveLength(1);
  await expect(saveAvatarPaletteItem("owner-a", {
    slot: "hair", title: "late", pixels: EMPTY_PIXELS,
  })).rejects.toThrow("avatar_palette_local_write_blocked");
  expect(await listAvatarPaletteItems("owner-a")).toEqual([]);
});

test("purge reports storage failure instead of claiming completion", async () => {
  runtime("ReactNative");
  mockEncryptedStorage.removeItem.mockRejectedValueOnce(new Error("device unavailable"));
  await expect(purgeAvatarPaletteItemsForDeletedAccount("owner-a")).resolves.toBe(false);
});
