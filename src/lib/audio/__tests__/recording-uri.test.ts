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
  recordingUriToBase64: (
    uri: string,
    mimeType?: string,
    declaredBytes?: number,
  ) => Promise<{ base64: string; mimeType: string }>;
}

function recordingApi(): RecordingApi {
  return require("../recording-uri") as RecordingApi;
}

const originalFetch = globalThis.fetch;
const originalFileReader = globalThis.FileReader;

beforeEach(() => {
  jest.clearAllMocks();
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
});

describe("bounded recording read", () => {
  test("reads local audio through the bounded byte reader", async () => {
    const directFetch = jest.fn().mockResolvedValue({
      blob: () => Promise.resolve({ type: "audio/webm" }),
    });
    globalThis.fetch = directFetch as unknown as typeof fetch;
    class LegacyFileReader {
      result: string | null = null;
      error: Error | null = null;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      readAsDataURL(): void {
        this.result = "data:audio/webm;base64,YWJj";
        this.onload?.();
      }
    }
    Object.defineProperty(globalThis, "FileReader", {
      configurable: true,
      value: LegacyFileReader,
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
  });
});

describe("recorder caller lifecycle contract", () => {
  const appRoot = resolve(__dirname, "../../../app");
  const recorderCallers = {
    secondb: readFileSync(resolve(appRoot, "secondb.tsx"), "utf8"),
    capture: readFileSync(resolve(appRoot, "capture.tsx"), "utf8"),
  };
  const callReflection = readFileSync(resolve(appRoot, "call-reflection.tsx"), "utf8");

  test("all stop-to-transcribe paths claim before reading and release in finally", () => {
    for (const source of Object.values(recorderCallers)) {
      expect(source).toContain("claimRecordingTemp(recordingUri)");
      expect(source).toContain("discardRecording(recordingLease)");
      expect(source).toMatch(
        /recordingLease = await claimRecordingTemp\(recordingUri\);\s+if \(!recordingLease\) throw new Error\("voice_read_failed"\);\s+const \{ base64, mimeType \} = await recordingUriToBase64\(recordingUri\)/,
      );
    }
  });

  test("cancel, back, recorder replacement, mode exit, and unmount use bounded cleanup", () => {
    expect(recorderCallers.secondb).toContain("stopAndDiscardRecording(audioRecorder)");
    expect(recorderCallers.secondb).toContain("voicePhaseRef.current");
    expect(recorderCallers.capture).toContain("stopAndDiscardRecording(audioRecorder)");
    expect(recorderCallers.capture).toContain("stopVoiceCaptureForModeExit");
    for (const source of Object.values(recorderCallers)) {
      expect(source).toContain("waitForRecordingCleanup(audioRecorder)");
    }
    expect(recorderCallers.secondb).toContain("recorderLifecycleRef.current");

    for (const source of Object.values(recorderCallers)) {
      expect(source).not.toMatch(/discardRecording\((?:audioRecorder\.uri|recordingUri)\)/);
    }

    const lifecycleEffect = (source: string): string => {
      const start = source.indexOf("const lifecycle = recorderLifecycleRef.current + 1;");
      const end = source.indexOf("}, [audioRecorder]);", start);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);
      return source.slice(start, end);
    };
    const chatUnmountCleanup = lifecycleEffect(recorderCallers.secondb);
    expect(chatUnmountCleanup).not.toContain("setVoicePhase(");
  });

  test("call reflection stays file-only and bounds the selected file by picker metadata", () => {
    expect(callReflection).toContain("pickAudioFile");
    expect(callReflection).not.toContain("useAudioRecorder");
    expect(callReflection).not.toContain("claimRecordingTemp");
    expect(callReflection).not.toContain("stopAndDiscardRecording");
    expect(callReflection).toMatch(
      /recordingUriToBase64\(\s*file\.uri,\s*file\.mimeType,\s*file\.size > 0 \? file\.size : undefined,\s*\)/,
    );
    const fileFlow = callReflection.slice(
      callReflection.indexOf("async function chooseAndTranscribe"),
      callReflection.indexOf("async function approve"),
    );
    expect(fileFlow).not.toContain("(e as Error).message");
  });

  test("the audio helper has no direct legacy unlink fallback", () => {
    const helper = readFileSync(resolve(__dirname, "../recording-uri.ts"), "utf8");
    expect(helper).not.toContain("deleteAsync");
    expect(helper).toContain("getInfoAsync");
    expect(helper).toContain("leaseOwnedTempFile");
    expect(helper).toContain("fetchBoundedLocalBytes");
  });
});
