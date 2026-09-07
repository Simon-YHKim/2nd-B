const mockPlatform = { OS: "android" };
const mockFileSystem = {
  cacheDirectory: "file:///app/cache/" as string | null,
  EncodingType: { UTF8: "utf8" },
  getInfoAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
};
const mockSharing = { isAvailableAsync: jest.fn(), shareAsync: jest.fn() };
jest.mock("react-native", () => ({ Platform: mockPlatform }));
jest.mock("expo-file-system/legacy", () => mockFileSystem);
jest.mock("expo-sharing", () => mockSharing);

import { deliverAccountExport } from "../export-delivery";

const json = '{"user_id":"test-owner","text":"한글"}';
const filename = "2nd-brain-data-20260906-010203.json";
const alwaysCurrent = () => true;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("account export file delivery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlatform.OS = "android";
    mockFileSystem.cacheDirectory = "file:///app/cache/";
    mockFileSystem.getInfoAsync.mockReset().mockResolvedValue({ exists: false });
    mockFileSystem.writeAsStringAsync.mockReset().mockResolvedValue(undefined);
    mockFileSystem.deleteAsync.mockReset().mockResolvedValue(undefined);
    mockSharing.isAvailableAsync.mockReset().mockResolvedValue(true);
    mockSharing.shareAsync.mockReset().mockResolvedValue(undefined);
  });

  test.each(["android", "ios"])("%s shares a UTF-8 JSON file and cleans only that file after the sheet settles", async (os) => {
    mockPlatform.OS = os;
    const share = deferred<void>();
    mockSharing.shareAsync.mockReturnValueOnce(share.promise);
    const delivery = deliverAccountExport(json, filename, alwaysCurrent);
    for (let i = 0; i < 20 && !mockSharing.shareAsync.mock.calls.length; i += 1) await Promise.resolve();
    expect(mockSharing.shareAsync).toHaveBeenCalledTimes(1);
    const uri = mockFileSystem.writeAsStringAsync.mock.calls[0][0] as string;
    expect(uri).toMatch(/^file:\/\/\/app\/cache\/2nd-brain-export-[a-zA-Z0-9-]+-2nd-brain-data-20260906-010203\.json$/);
    expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledWith(uri, json, { encoding: "utf8" });
    expect(mockSharing.shareAsync).toHaveBeenCalledWith(uri, { mimeType: "application/json", UTI: "public.json" });
    expect(mockFileSystem.deleteAsync).not.toHaveBeenCalled();
    share.resolve();
    // Expo returns void, not recipient delivery or a distinguishable cancel action.
    await expect(delivery).resolves.toBe("share-sheet-closed");
    expect(mockFileSystem.deleteAsync).toHaveBeenCalledTimes(1);
    expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith(uri, { idempotent: true });
  });

  test("stale work performs no file or share work", async () => {
    await expect(deliverAccountExport(json, filename, () => false)).resolves.toBe("cancelled");
    expect(mockFileSystem.writeAsStringAsync).not.toHaveBeenCalled();
    expect(mockSharing.isAvailableAsync).not.toHaveBeenCalled();
  });

  test("rechecks ownership after loading native modules", async () => {
    const current = jest.fn().mockReturnValueOnce(true).mockReturnValue(false);
    await expect(deliverAccountExport(json, filename, current)).resolves.toBe("cancelled");
    expect(mockSharing.isAvailableAsync).not.toHaveBeenCalled();
    expect(mockFileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  });

  test.each(["availability", "path-check", "write"])("stale work after %s never opens a share sheet", async (stage) => {
    let current = true;
    if (stage === "availability") mockSharing.isAvailableAsync.mockImplementationOnce(async () => { current = false; return true; });
    if (stage === "path-check") mockFileSystem.getInfoAsync.mockImplementationOnce(async () => { current = false; return { exists: false }; });
    if (stage === "write") mockFileSystem.writeAsStringAsync.mockImplementationOnce(async () => { current = false; });
    await expect(deliverAccountExport(json, filename, () => current)).resolves.toBe("cancelled");
    expect(mockSharing.shareAsync).not.toHaveBeenCalled();
    if (stage === "write") {
      expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith(mockFileSystem.writeAsStringAsync.mock.calls[0][0], { idempotent: true });
    } else {
      expect(mockFileSystem.writeAsStringAsync).not.toHaveBeenCalled();
      expect(mockFileSystem.deleteAsync).not.toHaveBeenCalled();
    }
  });

  test("an owner change while the sheet is open cannot claim to retract an already handed-off file", async () => {
    let current = true;
    mockSharing.shareAsync.mockImplementationOnce(async () => { current = false; });
    await expect(deliverAccountExport(json, filename, () => current)).resolves.toBe("share-sheet-closed");
    expect(mockFileSystem.deleteAsync).toHaveBeenCalledTimes(1);
  });

  test.each(["../other.json", "a/b.json", "a\\b.json", "file:///other.json", "other.txt", "", "a.json\n"])("rejects unsafe filename %j before any IO", async (name) => {
    await expect(deliverAccountExport(json, name, alwaysCurrent)).rejects.toThrow("account_export_invalid_filename");
    expect(mockFileSystem.getInfoAsync).not.toHaveBeenCalled();
    expect(mockFileSystem.writeAsStringAsync).not.toHaveBeenCalled();
    expect(mockSharing.shareAsync).not.toHaveBeenCalled();
  });

  test("unavailable sharing throws without writing or falling back to plaintext", async () => {
    mockSharing.isAvailableAsync.mockResolvedValueOnce(false);
    await expect(deliverAccountExport(json, filename, alwaysCurrent)).rejects.toThrow("account_export_sharing_unavailable");
    expect(mockFileSystem.writeAsStringAsync).not.toHaveBeenCalled();
    expect(mockFileSystem.deleteAsync).not.toHaveBeenCalled();
  });

  test("a missing native cache location fails without writing", async () => {
    mockFileSystem.cacheDirectory = null;
    await expect(deliverAccountExport(json, filename, alwaysCurrent)).rejects.toThrow("account_export_cache_unavailable");
    expect(mockFileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  });

  test("an existing candidate is never overwritten or deleted", async () => {
    mockFileSystem.getInfoAsync.mockResolvedValueOnce({ exists: true });
    await expect(deliverAccountExport(json, filename, alwaysCurrent)).rejects.toThrow("account_export_temp_collision");
    expect(mockFileSystem.writeAsStringAsync).not.toHaveBeenCalled();
    expect(mockFileSystem.deleteAsync).not.toHaveBeenCalled();
  });

  test.each(["availability", "path-check", "write", "share"])("%s failure rejects with no raw native error and cleans only a possibly written file", async (stage) => {
    const error = new Error("private-native-error-and-file-path");
    if (stage === "availability") mockSharing.isAvailableAsync.mockRejectedValueOnce(error);
    if (stage === "path-check") mockFileSystem.getInfoAsync.mockRejectedValueOnce(error);
    if (stage === "write") mockFileSystem.writeAsStringAsync.mockRejectedValueOnce(error);
    if (stage === "share") mockSharing.shareAsync.mockRejectedValueOnce(error);
    await expect(deliverAccountExport(json, filename, alwaysCurrent)).rejects.toThrow("account_export_delivery_failed");
    if (stage === "write" || stage === "share") {
      expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith(mockFileSystem.writeAsStringAsync.mock.calls[0][0], { idempotent: true });
    } else expect(mockFileSystem.deleteAsync).not.toHaveBeenCalled();
    if (stage !== "share") expect(mockSharing.shareAsync).not.toHaveBeenCalled();
  });

  test("cleanup failure remains explicit even after a share attempt", async () => {
    mockFileSystem.deleteAsync.mockRejectedValueOnce(new Error("private-file-path"));
    await expect(deliverAccountExport(json, filename, alwaysCurrent)).rejects.toThrow("account_export_cleanup_failed");
  });

  test("cleanup never recursively removes a directory found at the temporary file path", async () => {
    mockFileSystem.getInfoAsync
      .mockResolvedValueOnce({ exists: false })
      .mockResolvedValueOnce({ exists: true, isDirectory: true });
    await expect(deliverAccountExport(json, filename, alwaysCurrent)).rejects.toThrow("account_export_cleanup_failed");
    expect(mockFileSystem.deleteAsync).not.toHaveBeenCalled();
  });

  test("separate deliveries own separate cache files", async () => {
    await deliverAccountExport(json, filename, alwaysCurrent);
    await deliverAccountExport(json, filename, alwaysCurrent);
    const paths = mockFileSystem.writeAsStringAsync.mock.calls.map(([uri]) => uri);
    expect(new Set(paths).size).toBe(2);
    expect(mockFileSystem.deleteAsync.mock.calls.map(([uri]) => uri)).toEqual(paths);
  });
});

describe("web account export delivery", () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalCreate = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
  const originalRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
  const anchor = { href: "", download: "", click: jest.fn() };
  const create = jest.fn();
  const revoke = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockPlatform.OS = "web";
    anchor.click.mockReset();
    create.mockReset().mockReturnValue("blob:test-export");
    Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => anchor } });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
    if (originalCreate) Object.defineProperty(URL, "createObjectURL", originalCreate);
    else Reflect.deleteProperty(URL, "createObjectURL");
    if (originalRevoke) Object.defineProperty(URL, "revokeObjectURL", originalRevoke);
    else Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  test("starts a JSON download, then revokes its object URL in a later task", async () => {
    await expect(deliverAccountExport(json, filename, alwaysCurrent)).resolves.toBe("download-started");
    expect(create).toHaveBeenCalledWith(expect.any(Blob));
    const blob = create.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("application/json;charset=utf-8");
    expect(await blob.text()).toBe(json);
    expect(anchor).toMatchObject({ href: "blob:test-export", download: filename });
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
    jest.runOnlyPendingTimers();
    expect(revoke).toHaveBeenCalledWith("blob:test-export");
    expect(mockSharing.shareAsync).not.toHaveBeenCalled();
    expect(mockFileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  });

  test("a click failure revokes immediately and rejects", async () => {
    anchor.click.mockImplementationOnce(() => { throw new Error("private-browser-error"); });
    await expect(deliverAccountExport(json, filename, alwaysCurrent)).rejects.toThrow("account_export_delivery_failed");
    expect(revoke).toHaveBeenCalledWith("blob:test-export");
    expect(jest.getTimerCount()).toBe(0);
  });

  test("rechecks ownership immediately before the click and discards the URL if stale", async () => {
    let current = true;
    create.mockImplementationOnce(() => { current = false; return "blob:test-export"; });
    await expect(deliverAccountExport(json, filename, () => current)).resolves.toBe("cancelled");
    expect(anchor.click).not.toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith("blob:test-export");
    expect(jest.getTimerCount()).toBe(0);
  });

  test("web without a document does not fall through to native delivery", async () => {
    Reflect.deleteProperty(globalThis, "document");
    await expect(deliverAccountExport(json, filename, alwaysCurrent)).rejects.toThrow("account_export_download_unavailable");
    expect(mockSharing.shareAsync).not.toHaveBeenCalled();
  });
});
