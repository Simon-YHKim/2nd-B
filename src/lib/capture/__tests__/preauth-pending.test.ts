import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  pendingStatus,
  addToPendingList,
  normalizePendingList,
  addPendingCapture,
  loadPendingCaptures,
  clearPendingCaptures,
  countPendingCaptures,
  PREAUTH_PENDING_CAP,
  PREAUTH_PENDING_NEAR,
  PREAUTH_PENDING_MAX_CHARS,
  type PendingCapture,
} from "../preauth-pending";

const mockNativeBacking = new Map<string, string>();
const mockNativeVisibleLocalBacking = new Map<string, string>();
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
const mockMigrateLegacyNativePlaintextAtStartup = jest.fn();
const mockRawAsyncStorage = {
  getItem: jest.fn(async (_key: string) => null),
  setItem: jest.fn(async (_key: string, _value: string) => undefined),
  removeItem: jest.fn(async (_key: string) => undefined),
};

jest.mock("../../storage/encrypted-native-storage", () => ({
  getEncryptedNativeStorage: () => mockGetEncryptedNativeStorage(),
  migrateLegacyNativePlaintextAtStartup: () => mockMigrateLegacyNativePlaintextAtStartup(),
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: mockRawAsyncStorage,
}));

async function withMockNativeStorage(
  run: () => Promise<void>,
  keepLocalStorage = false,
): Promise<void> {
  const localDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  if (keepLocalStorage) {
    mockNativeVisibleLocalBacking.clear();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => mockNativeVisibleLocalBacking.get(key) ?? null,
        setItem: (key: string, value: string) => {
          mockNativeVisibleLocalBacking.set(key, value);
        },
        removeItem: (key: string) => {
          mockNativeVisibleLocalBacking.delete(key);
        },
      },
    });
  } else {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { product: "ReactNative" },
  });
  mockNativeBacking.clear();
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
  mockMigrateLegacyNativePlaintextAtStartup.mockReset();
  mockRawAsyncStorage.getItem.mockClear();
  mockRawAsyncStorage.setItem.mockClear();
  mockRawAsyncStorage.removeItem.mockClear();
  try {
    await run();
  } finally {
    if (localDescriptor) Object.defineProperty(globalThis, "localStorage", localDescriptor);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    else delete (globalThis as { navigator?: unknown }).navigator;
  }
}

function item(i: number): PendingCapture {
  return { localId: `p_${i}`, text: `line ${i}`, capturedAt: "2026-06-21T00:00:00.000Z" };
}

describe("pendingStatus (D-17 honest capacity)", () => {
  test("empty queue: room to spare, not near/full", () => {
    expect(pendingStatus(0)).toEqual({
      count: 0,
      cap: PREAUTH_PENDING_CAP,
      remaining: PREAUTH_PENDING_CAP,
      nearFull: false,
      full: false,
    });
  });

  test("near threshold flips nearFull (drives the 'almost full' copy)", () => {
    expect(pendingStatus(PREAUTH_PENDING_NEAR - 1).nearFull).toBe(false);
    expect(pendingStatus(PREAUTH_PENDING_NEAR).nearFull).toBe(true);
    expect(pendingStatus(PREAUTH_PENDING_NEAR).full).toBe(false);
  });

  test("at the cap the queue is full with zero remaining", () => {
    const s = pendingStatus(PREAUTH_PENDING_CAP);
    expect(s.full).toBe(true);
    expect(s.remaining).toBe(0);
  });

  test("clamps negative / fractional counts", () => {
    expect(pendingStatus(-5).count).toBe(0);
    expect(pendingStatus(3.7).count).toBe(3);
  });
});

describe("addToPendingList (pure core)", () => {
  test("appends a trimmed plaintext item", () => {
    const r = addToPendingList([], "  hello  ", "2026-06-21T00:00:00.000Z", "p_x");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.item).toEqual({ localId: "p_x", text: "hello", capturedAt: "2026-06-21T00:00:00.000Z" });
      expect(r.list).toHaveLength(1);
      expect(r.status.count).toBe(1);
    }
  });

  test("refuses empty / whitespace-only without dropping anything", () => {
    const r = addToPendingList([item(1)], "   ", "now", "p_y");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("empty");
    expect(r.list).toHaveLength(1);
  });

  test("refuses an over-long item (storage-ceiling guard)", () => {
    const big = "x".repeat(PREAUTH_PENDING_MAX_CHARS + 1);
    const r = addToPendingList([], big, "now", "p_z");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("too_long");
  });

  test("refuses once full instead of silently dropping (honest, not punitive)", () => {
    const full = Array.from({ length: PREAUTH_PENDING_CAP }, (_, i) => item(i));
    const r = addToPendingList(full, "one more", "now", "p_over");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("full");
      expect(r.status.full).toBe(true);
    }
    expect(r.list).toHaveLength(PREAUTH_PENDING_CAP);
  });
});

describe("normalizePendingList", () => {
  test("drops malformed entries and non-arrays", () => {
    expect(normalizePendingList(null)).toEqual([]);
    expect(normalizePendingList("nope")).toEqual([]);
    expect(
      normalizePendingList([item(1), { localId: "x" }, { text: "", localId: "y", capturedAt: "z" }, item(2)]),
    ).toHaveLength(2);
  });

  test("hard-caps a tampered oversized array", () => {
    const many = Array.from({ length: PREAUTH_PENDING_CAP + 20 }, (_, i) => item(i));
    expect(normalizePendingList(many)).toHaveLength(PREAUTH_PENDING_CAP);
  });
});

describe("storage round-trip (add / load)", () => {
  beforeEach(async () => {
    await clearPendingCaptures();
  });

  test("persists a capture and loads it back", async () => {
    if (typeof localStorage === "undefined") return; // node env without storage: skip
    const r = await addPendingCapture("first line", "2026-06-21T01:00:00.000Z");
    expect(r.ok).toBe(true);
    const loaded = await loadPendingCaptures();
    expect(loaded.map((i) => i.text)).toEqual(["first line"]);
    expect(await countPendingCaptures()).toBe(1);
  });
});

describe("native encrypted pending storage", () => {
  test("uses only the JIT encrypted adapter and the exact core-managed key", async () => {
    await withMockNativeStorage(async () => {
      await expect(addPendingCapture("first native line", "2026-09-06T00:00:00.000Z"))
        .resolves.toMatchObject({ ok: true });
      await expect(loadPendingCaptures()).resolves.toMatchObject([
        { text: "first native line" },
      ]);

      expect(mockGetEncryptedNativeStorage).toHaveBeenCalled();
      expect(mockEncryptedStorage.getItem).toHaveBeenCalledWith("capture.preauthPending.v1");
      expect(mockEncryptedStorage.setItem).toHaveBeenCalledWith(
        "capture.preauthPending.v1",
        expect.any(String),
      );
      expect(mockRawAsyncStorage.getItem).not.toHaveBeenCalled();
      expect(mockRawAsyncStorage.setItem).not.toHaveBeenCalled();
      expect(mockRawAsyncStorage.removeItem).not.toHaveBeenCalled();
      expect(mockMigrateLegacyNativePlaintextAtStartup).not.toHaveBeenCalled();
      expect(mockNativeVisibleLocalBacking.has("capture.preauthPending.v1")).toBe(false);
    }, true);
  });

  test("fails closed when the encrypted adapter cannot initialize or read", async () => {
    await withMockNativeStorage(async () => {
      const initializationFailure = new Error("secure_storage_key_unavailable");
      mockGetEncryptedNativeStorage.mockImplementationOnce(() => {
        throw initializationFailure;
      });
      await expect(loadPendingCaptures()).rejects.toBe(initializationFailure);

      const readFailure = new Error("secure_storage_recovery_required");
      mockEncryptedStorage.getItem.mockRejectedValueOnce(readFailure);
      await expect(loadPendingCaptures()).rejects.toBe(readFailure);
      expect(mockRawAsyncStorage.getItem).not.toHaveBeenCalled();
    });
  });

  test("concurrent additions keep both captures", async () => {
    await withMockNativeStorage(async () => {
      const results = await Promise.all([
        addPendingCapture("first", "2026-09-06T00:00:00.000Z"),
        addPendingCapture("second", "2026-09-06T00:00:01.000Z"),
      ]);
      expect(results.every((result) => result.ok)).toBe(true);
      expect((await loadPendingCaptures()).map((capture) => capture.text)).toEqual(["first", "second"]);
    });
  });

  test("a failed encrypted write never reports a saved capture", async () => {
    await withMockNativeStorage(async () => {
      const failure = new Error("secure_storage_write_failed");
      mockEncryptedStorage.setItem.mockRejectedValueOnce(failure);
      await expect(addPendingCapture("first")).rejects.toBe(failure);
      expect(await loadPendingCaptures()).toEqual([]);
      await expect(addPendingCapture("second")).resolves.toMatchObject({ ok: true });
      expect((await loadPendingCaptures()).map((capture) => capture.text)).toEqual(["second"]);
    });
  });
});

test("a web storage quota failure never reports a saved capture", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => null,
      setItem: () => { throw new Error("quota_exceeded"); },
    },
  });
  try {
    await expect(addPendingCapture("first")).rejects.toThrow("quota_exceeded");
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("a web storage read failure cannot overwrite an existing queue", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const setItem = jest.fn();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => { throw new Error("storage_read_failed"); },
      setItem,
    },
  });
  try {
    await expect(addPendingCapture("new")).rejects.toThrow("storage_read_failed");
    expect(setItem).not.toHaveBeenCalled();
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("unavailable storage never reports a saved capture", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Reflect.deleteProperty(globalThis, "localStorage");
  try {
    await expect(addPendingCapture("first")).rejects.toThrow("pending_storage_unavailable");
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
  }
});

// ── 홈 라우트가 기기 큐의 명시적 소유 확인을 붙들고 있는가 ──────────────
//
// 2026-09-08 에 홈 라우트가 22줄 래퍼가 됐다. 얇아 보이는 파일은 "정리" 대상이
// 되기 쉬운데, 그 안의 `useImportPendingCaptures()`가 **기기에 남은
// 메모를 확인한 계정으로만 옮기는 자리**다. 자동 가져오기는 다른 사람이
// 남긴 메모를 현재 계정에 쓸 수 있으므로 버튼 선택 전에는 금지한다.
//
// 부르는 곳이 여기 하나뿐이라 이 핀이 없으면 아무도 안 운다(실측: 정의 파일과
// 라우트 밖 참조 0건).
describe("기기에 남은 메모의 소유 확인 자리", () => {
  const read = (rel: string): string =>
    readFileSync(join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");

  it("홈 라우트가 명시적 가져오기와 위기 안내를 마운트한다", () => {
    const route = read("src/app/index.tsx");
    expect(route).toContain("const { prompt, confirmImport, deferImport, crisis, dismissCrisis } = useImportPendingCaptures();");
    expect(route).toContain('import { useImportPendingCaptures } from "@/lib/capture/use-import-pending";');
    expect(route).toContain("<PendingImportPrompt prompt={prompt} onConfirm={confirmImport} onDefer={deferImport} />");
    expect(route).toContain("<CrisisRouter visible={crisis.visible} hotline={crisis.hotline} onClose={dismissCrisis} />");
  });

  it("로그인·프로필·안정된 홈 뒤에만 제안하고, 확인 버튼에서만 가져온다", () => {
    // C10 - 나이를 모르는 채로 기록을 만들지 않는다.
    const hook = read("src/lib/capture/use-import-pending.ts");
    expect(hook).toContain("loading || !userId || hasProfile !== true || profileProbeFailed ||");
    // 첫 실행 판정(0219)이 '홈'으로 끝난 뒤에만. 홈이 서버에 묻고, 이 훅은 그 답을 읽기만 한다.
    expect(hook).toContain('firstRun !== "home"');
    expect(hook).toContain("const firstRun = useFirstRunHomeGate(userId, firstRunReady, sessionId);");
    expect(hook).toContain("minor: ctx.minor");
    expect(hook).toContain("const minor = isMinor !== false;");
    expect(hook).toContain("const confirmImport = useCallback(() => {");
    expect(hook).toContain("items: offer.items");
    expect(hook).toContain("const deferImport = useCallback(() => {");
  });
});
