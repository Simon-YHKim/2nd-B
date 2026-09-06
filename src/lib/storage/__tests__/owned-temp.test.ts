const CACHE_ROOT = "file:///data/user/0/com.secondbrain/cache/";
const TARGET = `${CACHE_ROOT}imports/report%20one.tmp`;

let mockCacheDirectory: string | null = CACHE_ROOT;
const mockGetInfoAsync = jest.fn();
const mockDeleteAsync = jest.fn();

jest.mock("expo-file-system/legacy", () => ({
  get cacheDirectory() {
    return mockCacheDirectory;
  },
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
}));

import { leaseOwnedTempFile, type OwnedTempFileLease } from "../owned-temp";

const nativeNavigator = { product: "ReactNative" };
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");

function fileInfo(
  uri = TARGET,
  overrides: Partial<{
    size: number;
    modificationTime: number;
    isDirectory: boolean;
  }> = {},
) {
  return {
    exists: true,
    uri,
    size: 17,
    modificationTime: 123,
    isDirectory: false,
    ...overrides,
  };
}

function missingInfo(uri = TARGET) {
  return { exists: false, uri, isDirectory: false };
}

async function acquire(uri = TARGET): Promise<OwnedTempFileLease> {
  const result = await leaseOwnedTempFile(uri);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected_owned_temp_lease");
  return result.lease;
}

beforeEach(() => {
  mockCacheDirectory = CACHE_ROOT;
  mockGetInfoAsync.mockReset();
  mockDeleteAsync.mockReset();
  Object.defineProperty(globalThis, "navigator", {
    value: nativeNavigator,
    configurable: true,
    writable: true,
  });
});

afterAll(() => {
  if (originalNavigator) {
    Object.defineProperty(globalThis, "navigator", originalNavigator);
  } else {
    delete (globalThis as { navigator?: unknown }).navigator;
  }
});

describe("leaseOwnedTempFile target boundary", () => {
  test("deletes only a verified file strictly below the canonical cache root", async () => {
    mockGetInfoAsync
      .mockResolvedValueOnce(fileInfo())
      .mockResolvedValueOnce(fileInfo())
      .mockResolvedValueOnce(missingInfo());
    mockDeleteAsync.mockResolvedValue(undefined);

    const lease = await acquire();

    await expect(lease.dispose()).resolves.toEqual({ ok: true, status: "deleted" });
    expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
    expect(mockDeleteAsync).toHaveBeenCalledWith(TARGET, { idempotent: true });
  });

  test.each([
    ["cache root", CACHE_ROOT],
    ["cache root without slash", CACHE_ROOT.slice(0, -1)],
    ["cache root redundant slash alias", `${CACHE_ROOT}/`],
    ["redundant inner slash", `${CACHE_ROOT}imports//private.tmp`],
    ["outside cache", "file:///data/user/0/com.secondbrain/files/private.tmp"],
    ["prefix confusion", "file:///data/user/0/com.secondbrain/cache-copy/private.tmp"],
    ["raw traversal", `${CACHE_ROOT}nested/../private.tmp`],
    ["encoded traversal", `${CACHE_ROOT}%2e%2e/private.tmp`],
    ["encoded slash", `${CACHE_ROOT}nested%2Fprivate.tmp`],
    ["encoded backslash", `${CACHE_ROOT}nested%5Cprivate.tmp`],
    ["raw backslash", `${CACHE_ROOT}nested\\private.tmp`],
    ["raw NUL", `${CACHE_ROOT}private\u0000.tmp`],
    ["encoded NUL", `${CACHE_ROOT}private%00.tmp`],
    ["query", `${TARGET}?mode=value`],
    ["hash", `${TARGET}#fragment`],
    ["host", "file://evil.example/data/user/0/com.secondbrain/cache/private.tmp"],
    ["credentials", "file://user:pass@evil.example/cache/private.tmp"],
    ["web", "https://example.com/private.tmp"],
    ["android provider", "content://provider/private.tmp"],
    ["web blob", "blob:https://example.com/id"],
    ["iOS provider", "ph://provider/private.tmp"],
    ["iOS original", "assets-library://asset/private.tmp"],
  ])("rejects %s without inspecting or deleting it", async (_case, uri) => {
    await expect(leaseOwnedTempFile(uri)).resolves.toEqual({
      ok: false,
      error: "unsafe_target",
    });
    expect(mockGetInfoAsync).not.toHaveBeenCalled();
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  test("does not load or inspect native storage outside a React Native runtime", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { product: "Gecko" },
      configurable: true,
      writable: true,
    });

    await expect(leaseOwnedTempFile(TARGET)).resolves.toEqual({
      ok: false,
      error: "unsupported_runtime",
    });
    expect(mockGetInfoAsync).not.toHaveBeenCalled();
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  test("fails closed when the native cache root is unavailable", async () => {
    mockCacheDirectory = null;

    await expect(leaseOwnedTempFile(TARGET)).resolves.toEqual({
      ok: false,
      error: "filesystem_unavailable",
    });
    expect(mockGetInfoAsync).not.toHaveBeenCalled();
  });

  test("rejects a directory before creating a deletion lease", async () => {
    mockGetInfoAsync.mockResolvedValue(fileInfo(TARGET, { isDirectory: true }));

    await expect(leaseOwnedTempFile(TARGET)).resolves.toEqual({
      ok: false,
      error: "not_a_file",
    });
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  test("fails closed on malformed native inspection data", async () => {
    mockGetInfoAsync.mockResolvedValue({});

    await expect(leaseOwnedTempFile(TARGET)).resolves.toEqual({
      ok: false,
      error: "inspect_failed",
    });
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  test.each([
    ["fractional size", { size: 1.5 }],
    ["unsafe integer size", { size: Number.MAX_SAFE_INTEGER + 1 }],
    ["negative size", { size: -1 }],
    ["infinite modification time", { modificationTime: Number.POSITIVE_INFINITY }],
    ["negative modification time", { modificationTime: -1 }],
  ])("fails closed on %s metadata", async (_case, overrides) => {
    mockGetInfoAsync.mockResolvedValue(fileInfo(TARGET, overrides));

    await expect(leaseOwnedTempFile(TARGET)).resolves.toEqual({
      ok: false,
      error: "inspect_failed",
    });
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });
});

describe("OwnedTempFileLease disposal", () => {
  test("treats an already missing target as successful and never deletes a later replacement", async () => {
    mockGetInfoAsync.mockResolvedValue(missingInfo());

    const lease = await acquire();
    const [first, second] = await Promise.all([lease.dispose(), lease.dispose()]);

    expect(first).toEqual({ ok: true, status: "missing" });
    expect(second).toEqual(first);
    expect(mockGetInfoAsync).toHaveBeenCalledTimes(1);
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  test("shares one deletion across concurrent and repeated dispose calls", async () => {
    mockGetInfoAsync
      .mockResolvedValueOnce(fileInfo())
      .mockResolvedValueOnce(fileInfo())
      .mockResolvedValueOnce(missingInfo());
    mockDeleteAsync.mockResolvedValue(undefined);

    const lease = await acquire();
    const [first, second] = await Promise.all([lease.dispose(), lease.dispose()]);
    const third = await lease.dispose();

    expect(first).toEqual({ ok: true, status: "deleted" });
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
  });

  test("rechecks the lease and refuses a file-to-directory swap", async () => {
    mockGetInfoAsync
      .mockResolvedValueOnce(fileInfo())
      .mockResolvedValueOnce(fileInfo(TARGET, { isDirectory: true }));

    const lease = await acquire();

    await expect(lease.dispose()).resolves.toEqual({ ok: false, error: "not_a_file" });
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  test("rechecks file identity and refuses a replacement at the leased path", async () => {
    mockGetInfoAsync
      .mockResolvedValueOnce(fileInfo())
      .mockResolvedValueOnce(fileInfo(TARGET, { size: 99, modificationTime: 456 }));

    const lease = await acquire();

    await expect(lease.dispose()).resolves.toEqual({
      ok: false,
      error: "target_changed",
    });
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  test("reports deletion failure without exposing the raw URI or native error", async () => {
    const secretTarget = `${CACHE_ROOT}imports/confidential-client-export.tmp`;
    mockGetInfoAsync
      .mockResolvedValueOnce(fileInfo(secretTarget))
      .mockResolvedValueOnce(fileInfo(secretTarget));
    mockDeleteAsync.mockRejectedValue(
      new Error(`EACCES while deleting ${secretTarget}: native-sensitive-detail`),
    );

    const lease = await acquire(secretTarget);
    const result = await lease.dispose();

    expect(result).toEqual({ ok: false, error: "delete_failed" });
    expect(JSON.stringify(result)).not.toContain("confidential-client-export");
    expect(JSON.stringify(result)).not.toContain("native-sensitive-detail");
  });

  test("fails when deletion returns but the target still exists", async () => {
    mockGetInfoAsync
      .mockResolvedValueOnce(fileInfo())
      .mockResolvedValueOnce(fileInfo())
      .mockResolvedValueOnce(fileInfo());
    mockDeleteAsync.mockResolvedValue(undefined);

    const lease = await acquire();

    await expect(lease.dispose()).resolves.toEqual({
      ok: false,
      error: "verification_failed",
    });
  });

  test("fails closed on malformed disposal and verification data", async () => {
    mockGetInfoAsync.mockResolvedValueOnce(fileInfo()).mockResolvedValueOnce({});

    const invalidPreflightLease = await acquire();
    await expect(invalidPreflightLease.dispose()).resolves.toEqual({
      ok: false,
      error: "inspect_failed",
    });
    expect(mockDeleteAsync).not.toHaveBeenCalled();

    mockGetInfoAsync
      .mockResolvedValueOnce(fileInfo())
      .mockResolvedValueOnce(fileInfo())
      .mockResolvedValueOnce({});
    mockDeleteAsync.mockResolvedValue(undefined);

    const invalidPostflightLease = await acquire();
    await expect(invalidPostflightLease.dispose()).resolves.toEqual({
      ok: false,
      error: "verification_failed",
    });
  });

  test("sanitizes inspection and post-delete verification errors", async () => {
    const secretTarget = `${CACHE_ROOT}imports/confidential-account-note.tmp`;
    mockGetInfoAsync.mockRejectedValueOnce(
      new Error(`stat failed for ${secretTarget}: native-sensitive-detail`),
    );

    const acquireResult = await leaseOwnedTempFile(secretTarget);
    expect(acquireResult).toEqual({ ok: false, error: "inspect_failed" });
    expect(JSON.stringify(acquireResult)).not.toContain("confidential-account-note");

    mockGetInfoAsync
      .mockResolvedValueOnce(fileInfo(secretTarget))
      .mockResolvedValueOnce(fileInfo(secretTarget))
      .mockRejectedValueOnce(new Error(`verify failed: ${secretTarget}`));
    mockDeleteAsync.mockResolvedValue(undefined);

    const lease = await acquire(secretTarget);
    const disposeResult = await lease.dispose();
    expect(disposeResult).toEqual({ ok: false, error: "verification_failed" });
    expect(JSON.stringify(disposeResult)).not.toContain("confidential-account-note");
  });
});
