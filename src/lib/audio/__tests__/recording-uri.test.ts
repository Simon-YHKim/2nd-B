import { readFileSync } from "node:fs";
import { resolve } from "node:path";

jest.mock("expo-file-system/legacy", () => ({
  deleteAsync: jest.fn(),
  getInfoAsync: jest.fn(),
}));

jest.mock("../../storage/owned-temp", () => ({
  leaseOwnedTempFile: jest.fn(),
}));

jest.mock("../../import/bounded-file-read", () => ({
  fetchBoundedLocalBytes: jest.fn(),
}));

const mockGetSession = jest.fn();
jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ auth: { getSession: mockGetSession } }),
}));

const ownedTempMock = require("../../storage/owned-temp") as {
  leaseOwnedTempFile: jest.Mock;
};
const boundedReadMock = require("../../import/bounded-file-read") as {
  fetchBoundedLocalBytes: jest.Mock;
};
const legacyFileSystemMock = require("expo-file-system/legacy") as {
  deleteAsync: jest.Mock;
  getInfoAsync: jest.Mock;
};

interface RecordingTempLeaseForTest {
  readonly release: () => Promise<void>;
}

interface RecorderForTest {
  uri: string | null;
  stop(): Promise<void>;
  getStatus?(): { isRecording: boolean; canRecord: boolean };
}

interface RecordingApi {
  MAX_RECORDING_BYTES?: number;
  claimRecordingTemp?: (
    uri: string | null | undefined,
  ) => Promise<RecordingTempLeaseForTest | null>;
  discardRecording?: (
    lease: RecordingTempLeaseForTest | null | undefined,
  ) => Promise<void>;
  stopAndDiscardRecording?: (recorder: RecorderForTest) => Promise<void>;
  waitForRecordingCleanup?: (recorder: RecorderForTest) => Promise<void>;
  createRecorderLifecycle?: (recorder: RecorderForTest) => {
    begin(ownerUserId: string): boolean;
    cancel(): Promise<void>;
    stopForTranscription(signal: AbortSignal): Promise<{
      uri: string;
      lease: RecordingTempLeaseForTest;
    }>;
    dispose(): void;
  };
  RECORDER_STOP_TIMEOUT_MS?: number;
  recordingUriToBase64: (
    uri: string,
    mimeType?: string,
    declaredBytes?: number,
    signal?: AbortSignal,
  ) => Promise<{ base64: string; mimeType: string }>;
}

function recordingApi(): RecordingApi {
  return require("../recording-uri") as RecordingApi;
}

const originalFetch = globalThis.fetch;
const originalBlob = globalThis.Blob;
const originalFileReader = globalThis.FileReader;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockReset();
  ownedTempMock.leaseOwnedTempFile.mockResolvedValue({
    ok: false,
    error: "unsupported_runtime",
  });
  boundedReadMock.fetchBoundedLocalBytes.mockResolvedValue(
    new Uint8Array([97, 98, 99]),
  );
  legacyFileSystemMock.getInfoAsync.mockImplementation((uri: string) =>
    Promise.resolve({
      exists: true,
      isDirectory: false,
      modificationTime: 1,
      size: 3,
      uri,
    }),
  );
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis, "Blob", {
    configurable: true,
    value: originalBlob,
    writable: true,
  });
  Object.defineProperty(globalThis, "FileReader", {
    configurable: true,
    value: originalFileReader,
    writable: true,
  });
  jest.restoreAllMocks();
});

describe("owned recorder temp lifecycle", () => {
  test("claims one verified cache lease and releases it once under races", async () => {
    const dispose = jest.fn().mockResolvedValue({ ok: true, status: "deleted" });
    ownedTempMock.leaseOwnedTempFile.mockResolvedValue({
      ok: true,
      lease: { dispose },
    });
    const { claimRecordingTemp, discardRecording } = recordingApi();

    expect(typeof claimRecordingTemp).toBe("function");
    expect(typeof discardRecording).toBe("function");
    if (!claimRecordingTemp || !discardRecording) return;

    const recording = await claimRecordingTemp("file:///app-cache/voice.m4a");
    await Promise.all([
      discardRecording(recording),
      discardRecording(recording),
    ]);

    expect(ownedTempMock.leaseOwnedTempFile).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(legacyFileSystemMock.deleteAsync).not.toHaveBeenCalled();
  });

  test("never falls back to deleting provider, external, content, or blob URIs", async () => {
    const { claimRecordingTemp, discardRecording } = recordingApi();
    expect(typeof claimRecordingTemp).toBe("function");
    if (!claimRecordingTemp || !discardRecording) return;

    const uris = [
      "file:///outside-app-cache/original.m4a",
      "content://provider/original.m4a",
      "blob:https://example.test/original",
      "https://example.test/original.m4a",
    ];
    const claims = await Promise.all(uris.map((uri) => claimRecordingTemp(uri)));
    await Promise.all(claims.map((claim) => discardRecording(claim)));

    expect(claims).toEqual([null, null, null, null]);
    expect(ownedTempMock.leaseOwnedTempFile).toHaveBeenCalledTimes(uris.length);
    expect(legacyFileSystemMock.deleteAsync).not.toHaveBeenCalled();
  });

  test("contains cleanup failures without logging raw URI or error detail", async () => {
    const dispose = jest.fn().mockResolvedValue({
      ok: false,
      error: "file:///app-cache/private-voice.m4a raw-private-marker",
    });
    ownedTempMock.leaseOwnedTempFile.mockResolvedValue({
      ok: true,
      lease: { dispose },
    });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const { claimRecordingTemp, discardRecording } = recordingApi();
    expect(typeof claimRecordingTemp).toBe("function");
    if (!claimRecordingTemp || !discardRecording) return;

    const recording = await claimRecordingTemp("file:///app-cache/private-voice.m4a");
    await expect(discardRecording(recording)).resolves.toBeUndefined();

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("recording cleanup failed");
    expect(logged).not.toContain("private-voice");
    expect(logged).not.toContain("raw-private-marker");
  });

  test("stop-and-discard is idempotent and does not claim a still-active file", async () => {
    const dispose = jest.fn().mockResolvedValue({ ok: true, status: "deleted" });
    ownedTempMock.leaseOwnedTempFile.mockResolvedValue({
      ok: true,
      lease: { dispose },
    });
    const stop = jest.fn().mockResolvedValue(undefined);
    const recorder: RecorderForTest = {
      uri: "file:///app-cache/cancelled.m4a",
      stop,
    };
    const { stopAndDiscardRecording } = recordingApi();
    expect(typeof stopAndDiscardRecording).toBe("function");
    if (!stopAndDiscardRecording) return;

    await Promise.all([
      stopAndDiscardRecording(recorder),
      stopAndDiscardRecording(recorder),
    ]);

    expect(stop).toHaveBeenCalledTimes(1);
    expect(ownedTempMock.leaseOwnedTempFile).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const failedRecorder: RecorderForTest = {
      uri: "file:///app-cache/still-active-private.m4a",
      stop: jest.fn().mockRejectedValue(new Error("raw-stop-private-marker")),
    };
    await expect(stopAndDiscardRecording(failedRecorder)).resolves.toBeUndefined();
    expect(ownedTempMock.leaseOwnedTempFile).not.toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("raw-stop-private-marker");
  });

  test("blocks recorder reuse until an in-flight cleanup settles", async () => {
    let finishStop: (() => void) | undefined;
    const recorder: RecorderForTest = {
      uri: "file:///app-cache/old-session.m4a",
      stop: jest.fn(() => new Promise<void>((resolve) => {
        finishStop = resolve;
      })),
    };
    const { stopAndDiscardRecording, waitForRecordingCleanup } = recordingApi();
    expect(typeof stopAndDiscardRecording).toBe("function");
    expect(typeof waitForRecordingCleanup).toBe("function");
    if (!stopAndDiscardRecording || !waitForRecordingCleanup) return;

    const cleanup = stopAndDiscardRecording(recorder);
    let reuseAllowed = false;
    const wait = waitForRecordingCleanup(recorder).then(() => {
      reuseAllowed = true;
    });
    await Promise.resolve();
    expect(reuseAllowed).toBe(false);

    finishStop?.();
    await Promise.all([cleanup, wait]);
    expect(reuseAllowed).toBe(true);
  });

  test("contains a synchronous lease failure without leaking native detail", async () => {
    ownedTempMock.leaseOwnedTempFile.mockImplementation(() => {
      throw new Error("file:///app-cache/private-voice.m4a native detail");
    });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const { claimRecordingTemp } = recordingApi();
    if (!claimRecordingTemp) return;

    await expect(claimRecordingTemp("file:///app-cache/private-voice.m4a")).resolves.toBeNull();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private-voice");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("native detail");
  });

  test("captures the URI and starts stop before a later hook release clears it", async () => {
    const { __resetAccountEpochForTests, noteResolvedOwner } = require("../../auth/account-epoch") as typeof import("../../auth/account-epoch");
    __resetAccountEpochForTests();
    noteResolvedOwner("account-a");
    let finishStop: (() => void) | undefined;
    const dispose = jest.fn().mockResolvedValue({ ok: true, status: "deleted" });
    ownedTempMock.leaseOwnedTempFile.mockResolvedValue({ ok: true, lease: { dispose } });
    const recorder: RecorderForTest = {
      uri: "file:///app-cache/recording-a.m4a",
      stop: jest.fn(() => new Promise<void>((resolve) => { finishStop = resolve; })),
      getStatus: () => ({ isRecording: true, canRecord: true }),
    };
    const { createRecorderLifecycle } = recordingApi();
    expect(typeof createRecorderLifecycle).toBe("function");
    if (!createRecorderLifecycle) return;
    const lifecycle = createRecorderLifecycle(recorder);
    expect(lifecycle.begin("account-a")).toBe(true);

    const cleanup = lifecycle.cancel(); // layout cleanup
    expect(recorder.stop).toHaveBeenCalledTimes(1);
    recorder.uri = null; // expo hook passive release runs later
    finishStop?.();
    await cleanup;

    expect(ownedTempMock.leaseOwnedTempFile).toHaveBeenCalledWith("file:///app-cache/recording-a.m4a");
    expect(dispose).toHaveBeenCalledTimes(1);
    __resetAccountEpochForTests();
  });

  test("does not delete after stop rejection without writer-ended proof", async () => {
    const { __resetAccountEpochForTests, noteResolvedOwner } = require("../../auth/account-epoch") as typeof import("../../auth/account-epoch");
    __resetAccountEpochForTests();
    noteResolvedOwner("account-a");
    const recorder: RecorderForTest = {
      uri: "file:///app-cache/still-writing.m4a",
      stop: jest.fn().mockRejectedValue(new Error("private native detail")),
      getStatus: () => ({ isRecording: true, canRecord: true }),
    };
    const { createRecorderLifecycle } = recordingApi();
    if (!createRecorderLifecycle) return;
    const lifecycle = createRecorderLifecycle(recorder);
    lifecycle.begin("account-a");

    await lifecycle.cancel();

    expect(ownedTempMock.leaseOwnedTempFile).not.toHaveBeenCalled();
    __resetAccountEpochForTests();
  });

  test("cleans once when a timed-out stop later proves writer completion", async () => {
    jest.useFakeTimers();
    const { __resetAccountEpochForTests, noteResolvedOwner } = require("../../auth/account-epoch") as typeof import("../../auth/account-epoch");
    __resetAccountEpochForTests();
    noteResolvedOwner("account-a");
    let finishStop: (() => void) | undefined;
    const dispose = jest.fn().mockResolvedValue({ ok: true, status: "deleted" });
    ownedTempMock.leaseOwnedTempFile.mockResolvedValue({ ok: true, lease: { dispose } });
    const recorder: RecorderForTest = {
      uri: "file:///app-cache/late-stop.m4a",
      stop: jest.fn(() => new Promise<void>((resolve) => { finishStop = resolve; })),
      getStatus: () => ({ isRecording: true, canRecord: true }),
    };
    const { createRecorderLifecycle, RECORDER_STOP_TIMEOUT_MS } = recordingApi();
    if (!createRecorderLifecycle || !RECORDER_STOP_TIMEOUT_MS) return;
    const lifecycle = createRecorderLifecycle(recorder);
    lifecycle.begin("account-a");

    try {
      const cleanup = lifecycle.cancel();
      await jest.advanceTimersByTimeAsync(RECORDER_STOP_TIMEOUT_MS);
      await cleanup;
      expect(dispose).not.toHaveBeenCalled();

      finishStop?.();
      await jest.advanceTimersByTimeAsync(0);
      expect(dispose).toHaveBeenCalledTimes(1);
    } finally {
      lifecycle.dispose();
      __resetAccountEpochForTests();
      jest.useRealTimers();
    }
  });

  test("owner change synchronously cancels the recorder-owned session", async () => {
    const { __resetAccountEpochForTests, noteResolvedOwner } = require("../../auth/account-epoch") as typeof import("../../auth/account-epoch");
    __resetAccountEpochForTests();
    noteResolvedOwner("account-a");
    const dispose = jest.fn().mockResolvedValue({ ok: true, status: "deleted" });
    ownedTempMock.leaseOwnedTempFile.mockResolvedValue({ ok: true, lease: { dispose } });
    const recorder: RecorderForTest = {
      uri: "file:///app-cache/account-a.m4a",
      stop: jest.fn().mockResolvedValue(undefined),
      getStatus: () => ({ isRecording: true, canRecord: true }),
    };
    const { createRecorderLifecycle } = recordingApi();
    if (!createRecorderLifecycle) return;
    const lifecycle = createRecorderLifecycle(recorder);
    lifecycle.begin("account-a");

    noteResolvedOwner("account-b");
    expect(recorder.stop).toHaveBeenCalledTimes(1);
    await lifecycle.cancel();
    expect(dispose).toHaveBeenCalledTimes(1);
    __resetAccountEpochForTests();
  });

  test("disposes a completed transfer if its signal aborts at the handoff fence", async () => {
    const { __resetAccountEpochForTests, noteResolvedOwner } = require("../../auth/account-epoch") as typeof import("../../auth/account-epoch");
    __resetAccountEpochForTests();
    noteResolvedOwner("account-a");
    const dispose = jest.fn().mockResolvedValue({ ok: true, status: "deleted" });
    ownedTempMock.leaseOwnedTempFile.mockResolvedValue({ ok: true, lease: { dispose } });
    const recorder: RecorderForTest = {
      uri: "file:///app-cache/handoff-abort.m4a",
      stop: jest.fn().mockResolvedValue(undefined),
      getStatus: () => ({ isRecording: false, canRecord: false }),
    };
    const { createRecorderLifecycle } = recordingApi();
    if (!createRecorderLifecycle) return;
    const lifecycle = createRecorderLifecycle(recorder);
    lifecycle.begin("account-a");
    const controller = new AbortController();
    const signal = new Proxy(controller.signal, {
      get(target, property) {
        if (property === "removeEventListener") {
          return (...args: Parameters<AbortSignal["removeEventListener"]>) => {
            target.removeEventListener(...args);
            controller.abort();
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    await expect(lifecycle.stopForTranscription(signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(dispose).toHaveBeenCalledTimes(1);
    __resetAccountEpochForTests();
  });
});

describe("bounded recording read", () => {
  test("encodes bounded bytes without React Native's unsupported ArrayBuffer Blob", async () => {
    const directFetch = jest.fn().mockResolvedValue({
      blob: () => Promise.resolve({ type: "audio/webm" }),
    });
    globalThis.fetch = directFetch as unknown as typeof fetch;
    const unsupportedBlob = jest.fn(() => {
      throw new Error("Creating blobs from ArrayBuffer parts is not supported");
    });
    const unsupportedReader = jest.fn(() => {
      throw new Error("FileReader must not be needed for bounded bytes");
    });
    Object.defineProperty(globalThis, "Blob", {
      configurable: true,
      value: unsupportedBlob,
      writable: true,
    });
    Object.defineProperty(globalThis, "FileReader", {
      configurable: true,
      value: unsupportedReader,
      writable: true,
    });
    const api = recordingApi();

    await expect(
      api.recordingUriToBase64("file:///app-cache/voice.webm", "audio/webm"),
    ).resolves.toEqual({ base64: "YWJj", mimeType: "audio/webm" });
    await expect(
      api.recordingUriToBase64("blob:https://example.test/high-quality-recorder"),
    ).resolves.toEqual({ base64: "YWJj", mimeType: "audio/webm" });
    await expect(
      api.recordingUriToBase64("file:///app-cache/high-quality-recorder.m4a"),
    ).resolves.toEqual({ base64: "YWJj", mimeType: "audio/mp4" });
    expect(api.MAX_RECORDING_BYTES).toBe(3_000_000);
    expect(boundedReadMock.fetchBoundedLocalBytes).toHaveBeenCalledWith(
      "file:///app-cache/voice.webm",
      { allowWebBlob: true, declaredBytes: 3, maxBytes: 3_000_000 },
    );
    expect(legacyFileSystemMock.getInfoAsync).toHaveBeenCalledWith(
      "file:///app-cache/voice.webm",
    );
    expect(directFetch).not.toHaveBeenCalled();
    expect(unsupportedBlob).not.toHaveBeenCalled();
    expect(unsupportedReader).not.toHaveBeenCalled();
  });

  test("base64 preserves binary bytes, padding, and a multi-chunk boundary", async () => {
    const api = recordingApi();
    const samples = [
      new Uint8Array([]),
      new Uint8Array([0]),
      new Uint8Array([255, 1]),
      new Uint8Array([0, 128, 255]),
      Uint8Array.from({ length: 48 * 1024 + 5 }, (_, index) => index % 256),
    ];
    for (const bytes of samples) {
      boundedReadMock.fetchBoundedLocalBytes.mockResolvedValueOnce(bytes);
      await expect(api.recordingUriToBase64(
        "file:///app-cache/binary.m4a",
        "audio/mp4",
        bytes.length,
      )).resolves.toEqual({
        base64: Buffer.from(bytes).toString("base64"),
        mimeType: "audio/mp4",
      });
    }
  });

  test("stops encoding between bounded chunks when the owner signal aborts", async () => {
    const bytes = new Uint8Array(48 * 1024 + 3).fill(255);
    boundedReadMock.fetchBoundedLocalBytes.mockResolvedValue(bytes);
    const owner = new AbortController();
    const realSetTimeout = globalThis.setTimeout;
    let yielded = 0;
    const timer = jest.spyOn(globalThis, "setTimeout").mockImplementation((callback, delay) => {
      if (delay === 0) {
        yielded += 1;
        owner.abort();
      }
      return realSetTimeout(callback, delay);
    });
    try {
      await expect(recordingApi().recordingUriToBase64(
        "file:///app-cache/owner-a.m4a",
        "audio/mp4",
        bytes.length,
        owner.signal,
      )).rejects.toMatchObject({ name: "AbortError" });
    } finally {
      timer.mockRestore();
    }
    expect(yielded).toBe(1);
  });

  test("aborts an A-owned read synchronously when the account changes to B", async () => {
    const { __resetAccountEpochForTests, noteResolvedOwner } = require("../../auth/account-epoch") as typeof import("../../auth/account-epoch");
    const { beginAccountSessionLease } = require("../../auth/account-session-lease") as typeof import("../../auth/account-session-lease");
    __resetAccountEpochForTests();
    noteResolvedOwner("account-a");
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: "account-a" }, access_token: "token-a" } },
      error: null,
    });
    const authenticated = await beginAccountSessionLease("account-a").authenticate();
    let rejectRead: ((error: Error) => void) | undefined;
    boundedReadMock.fetchBoundedLocalBytes.mockImplementation(
      () => new Promise<Uint8Array>((_resolve, reject) => { rejectRead = reject; }),
    );
    const readAsDataURL = jest.fn();
    class GuardedFileReader {
      result: string | null = null;
      error: Error | null = null;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      abort = jest.fn();
      readAsDataURL = readAsDataURL;
    }
    Object.defineProperty(globalThis, "FileReader", {
      configurable: true,
      value: GuardedFileReader,
      writable: true,
    });
    const read = recordingApi().recordingUriToBase64(
      "file:///app-cache/account-a.m4a",
      "audio/mp4",
      3,
      authenticated.signal,
    );

    noteResolvedOwner("account-b");
    expect(authenticated.signal.aborted).toBe(true);

    await expect(read).rejects.toMatchObject({ name: "AbortError" });
    expect(readAsDataURL).not.toHaveBeenCalled();
    rejectRead?.(new Error("private late read detail"));
    await Promise.resolve();
    __resetAccountEpochForTests();
  });
});

describe("recorder caller lifecycle contract", () => {
  const appRoot = resolve(__dirname, "../../../app");
  const recorderCallers = {
    secondb: readFileSync(resolve(appRoot, "secondb.tsx"), "utf8"),
    capture: readFileSync(resolve(appRoot, "capture.tsx"), "utf8"),
  };
  const callReflection = readFileSync(resolve(appRoot, "call-reflection.tsx"), "utf8");

  test("all stop-to-transcribe paths require writer proof and a captured account session", () => {
    for (const source of Object.values(recorderCallers)) {
      expect(source).toContain("createRecorderLifecycle(audioRecorder)");
      expect(source).toContain("recorderLifecycle.stopForTranscription(accountLease.signal)");
      expect(source).toContain("const authenticated = await accountLease.authenticate()");
      expect(source).toContain("session: authenticated");
      expect(source).toContain("authenticated.signal");
      expect(source).toContain("authenticated.assertCurrent()");
      expect(source).toContain("discardRecording(recordingLease)");
      const stop = source.indexOf("recorderLifecycle.stopForTranscription(accountLease.signal)");
      const authenticate = source.indexOf("accountLease.authenticate()", stop);
      const read = source.indexOf("recordingUriToBase64(", authenticate);
      const request = source.indexOf("transcribeAudio({", read);
      expect([stop, authenticate, read, request]).not.toContain(-1);
      expect(stop).toBeLessThan(authenticate);
      expect(authenticate).toBeLessThan(read);
      expect(read).toBeLessThan(request);
    }
  });

  test("cancel, owner change, mode exit, and layout unmount use recorder-owned cleanup", () => {
    expect(recorderCallers.secondb).toContain("recorderLifecycle.dispose()");
    expect(recorderCallers.secondb).toContain("voicePhaseRef.current");
    expect(recorderCallers.capture).toContain("recorderLifecycle.cancel()");
    expect(recorderCallers.capture).toContain("stopVoiceCaptureForModeExit");
    for (const source of Object.values(recorderCallers)) {
      expect(source).toContain("useLayoutEffect(() => () => {");
      expect(source).toContain("recorderLifecycle.dispose()");
      expect(source).toContain("beginAccountSessionLease(userId)");
    }

    for (const source of Object.values(recorderCallers)) {
      expect(source).not.toMatch(/discardRecording\((?:audioRecorder\.uri|recordingUri)\)/);
    }

    const lifecycleEffect = (source: string): string => {
      const start = source.indexOf("useLayoutEffect(() => () => {");
      const end = source.indexOf("}, [recorderLifecycle]);", start);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);
      return source.slice(start, end);
    };
    const chatUnmountCleanup = lifecycleEffect(recorderCallers.secondb);
    expect(chatUnmountCleanup).not.toContain("setVoicePhase(");

    const captureStartFlow = recorderCallers.capture.slice(
      recorderCallers.capture.indexOf("async function handleStartRecording"),
      recorderCallers.capture.indexOf("async function handleStopRecording"),
    );
    const captureTranscriptionFlow = recorderCallers.capture.slice(
      recorderCallers.capture.indexOf("async function handleStopRecording"),
      recorderCallers.capture.indexOf("async function handleSubmit"),
    );
    expect(captureStartFlow).toContain("await recorderLifecycle.cancel()");
    expect(captureStartFlow).toContain("if (prepared || audioRecorder.uri)");
    expect(recorderCallers.secondb).toContain("if (prepared || audioRecorder.uri)");
    expect(captureStartFlow).not.toContain("(e as Error).message");
    expect(captureTranscriptionFlow).not.toContain("(e as Error).message");
  });

  test("call reflection stays picker-only and binds trusted file metadata to the bounded read", () => {
    expect(callReflection).not.toContain("useAudioRecorder");
    expect(callReflection).toContain("pickAudioFile");
    expect(callReflection).toMatch(
      /recordingUriToBase64\(\s*file\.uri,\s*file\.mimeType,\s*file\.size > 0 \? file\.size : undefined,\s*authenticated\.signal,\s*\)/,
    );
  });

  test("the audio helper has no direct legacy unlink fallback", () => {
    const helper = readFileSync(resolve(__dirname, "../recording-uri.ts"), "utf8");
    expect(helper).not.toContain("deleteAsync");
    expect(helper).toContain("getInfoAsync");
    expect(helper).toContain("leaseOwnedTempFile");
    expect(helper).toContain("fetchBoundedLocalBytes");
  });
});
