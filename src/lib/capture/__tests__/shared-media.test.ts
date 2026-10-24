const mockNative = { take: jest.fn(), discard: jest.fn(), discardAll: jest.fn() };
const mockPlatform = { OS: "android" };
const mockGetSession = jest.fn();
const mockCallLlm = jest.fn();
jest.mock("react-native", () => ({ NativeModules: { PolaSharedMedia: mockNative }, Platform: mockPlatform }));
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({ auth: { getSession: mockGetSession } }) }));
jest.mock("expo-image-picker", () => ({}));
jest.mock("expo-image-manipulator", () => ({}));
jest.mock("../../llm/boundary", () => ({ callLlm: mockCallLlm }));
jest.mock("../../storage/owned-temp", () => ({ leaseOwnedTempFile: jest.fn() }));

const token = "594cf7fa-d5de-4003-8153-deae0091ce4b";
const jpeg = Buffer.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1]).toString("base64");
const audio = { token, kind: "audio", uri: `file:///data/user/0/app/cache/pola-shared-media/${token}.input`, mimeType: "audio/mp4", size: 250 };
const photo = { ...audio, kind: "image", uri: audio.uri.replace(".input", ".jpg"), mimeType: "image/jpeg", base64: jpeg, size: 12 };
let media: typeof import("../shared-media");
let epoch: typeof import("../../auth/account-epoch");

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  mockNative.discard.mockReset();
  mockPlatform.OS = "android";
  epoch = require("../../auth/account-epoch");
  media = require("../shared-media");
  epoch.noteResolvedOwner("A");
});

test("photo reception is local only and its owned cache survives until release", async () => {
  mockNative.take.mockResolvedValue(photo);
  const picked = await media.takeSharedImage("A", token);
  expect(picked).toMatchObject({ uri: photo.uri, base64: jpeg, mimeType: "image/jpeg" });
  expect(mockGetSession).not.toHaveBeenCalled();
  expect(mockCallLlm).not.toHaveBeenCalled();
  expect(mockNative.discard).not.toHaveBeenCalled();
  await picked.release();
  await picked.release();
  expect(mockNative.discard).toHaveBeenCalledTimes(1);
  expect(mockNative.discard).toHaveBeenCalledWith(token);
});

test("audio intake returns only the bounded local file, with no transcription or authentication", async () => {
  mockNative.take.mockResolvedValue(audio);
  const picked = await media.takeSharedMedia("A", token, "audio");
  expect(picked).toMatchObject({ uri: audio.uri, mimeType: "audio/mp4", size: 250 });
  expect(mockGetSession).not.toHaveBeenCalled();
  expect(mockCallLlm).not.toHaveBeenCalled();
  await picked.release();
});

test.each(["B", null])("A -> %s aborts a pending native copy immediately, including late success", async (owner) => {
  let finish!: (value: unknown) => void;
  mockNative.take.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const pending = media.takeSharedMedia("A", token, "audio");
  const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  epoch.noteResolvedOwner(owner);
  await assertion;
  expect(mockNative.discardAll).toHaveBeenCalledTimes(1);
  expect(mockNative.discard).toHaveBeenCalledWith(token);
  finish(audio);
  await Promise.resolve();
  expect(mockGetSession).not.toHaveBeenCalled();
});

test("a restored first owner preserves cold-start delivery; leaving that owner clears even unclaimed handles", () => {
  expect(mockNative.discardAll).not.toHaveBeenCalled();
  epoch.noteResolvedOwner(null);
  epoch.noteResolvedOwner("A");
  expect(mockNative.discardAll).toHaveBeenCalledTimes(1);
});

test("cancelling before native completion rejects without waiting on the provider", async () => {
  mockNative.take.mockReturnValue(new Promise(() => undefined));
  const controller = new AbortController();
  const pending = media.takeSharedMedia("A", token, "audio", controller.signal);
  const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await assertion;
  expect(mockNative.discard).toHaveBeenCalledTimes(1);
});

test("owner changes also release an already prepared preview", async () => {
  mockNative.take.mockResolvedValue(photo);
  const picked = await media.takeSharedImage("A", token);
  epoch.noteResolvedOwner("B");
  expect(mockNative.discard).toHaveBeenCalledWith(token);
  await picked.release();
  expect(mockNative.discard).toHaveBeenCalledTimes(1);
});

test("A -> signed out -> A cannot revive a copy from the earlier account epoch", async () => {
  mockNative.take.mockReturnValue(new Promise(() => undefined));
  const pending = media.takeSharedMedia("A", token, "audio");
  const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  epoch.noteResolvedOwner(null);
  epoch.noteResolvedOwner("A");
  await assertion;
  expect(mockNative.discard).toHaveBeenCalledWith(token);
});

test("bridge shutdown during cleanup cannot leave an account lease or reject UI teardown", async () => {
  mockNative.take.mockResolvedValue(audio);
  const picked = await media.takeSharedMedia("A", token, "audio");
  mockNative.discard.mockImplementation(() => { throw new Error("bridge closed"); });
  await expect(picked.release()).resolves.toBeUndefined();
  expect(() => media.discardSharedMedia(token)).not.toThrow();
});

test.each([
  { uri: "content://other/private" }, { uri: `file:///private/${token}.input` },
  { uri: audio.uri.replace("/cache/", "/cache/../") }, { uri: audio.uri.replace("/cache/", "/cache/%2e%2e/") },
  { token: "other" }, { kind: "image" }, { size: 3_000_001 }, { size: -1 }, { size: 1.5 }, { mimeType: "video/mp4" },
])("invalid native audio response %j is discarded before it reaches a consumer", async (override) => {
  mockNative.take.mockResolvedValue({ ...audio, ...override });
  await expect(media.takeSharedMedia("A", token, "audio")).rejects.toThrow("share_unreadable");
  expect(mockNative.discard).toHaveBeenCalledWith(token);
});

test.each([{ base64: "dGV4dA==" }, { size: 11 }, { mimeType: "image/png" }, { size: 2_000_001 }])(
  "invalid image payload %j cannot bypass the existing OCR validator", async (override) => {
    mockNative.take.mockResolvedValue({ ...photo, ...override });
    await expect(media.takeSharedImage("A", token)).rejects.toThrow();
    expect(mockNative.discard).toHaveBeenCalledWith(token);
    expect(mockCallLlm).not.toHaveBeenCalled();
  },
);

test("a forged but well-formed token cannot make the native bridge read an arbitrary URI", async () => {
  mockNative.take.mockRejectedValue(new Error("share_unavailable"));
  await expect(media.takeSharedMedia("A", token, "audio")).rejects.toThrow("share_unavailable");
  expect(mockNative.take).toHaveBeenCalledWith(token, "audio");
  expect(mockNative.discard).toHaveBeenCalledWith(token);
});

test("web, iOS and an older APK without the bridge fail without a native call", async () => {
  for (const platform of ["web", "ios"]) {
    mockPlatform.OS = platform;
    await expect(media.takeSharedMedia("A", token, "audio")).rejects.toThrow("share_unavailable");
  }
  mockPlatform.OS = "android";
  const rn = require("react-native");
  delete rn.NativeModules.PolaSharedMedia;
  await expect(media.takeSharedMedia("A", token, "audio")).rejects.toThrow("share_unavailable");
  expect(mockNative.take).not.toHaveBeenCalled();
});
