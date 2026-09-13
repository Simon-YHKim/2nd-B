// On-device recording helpers shared by the voice-to-text flows. Reads are
// capped before base64 inflation, and cleanup is possible only through an
// app-cache lease that snapshots and revalidates the exact recorder output.
import { fetchBoundedLocalBytes } from "../import/bounded-file-read";
import { getInfoAsync } from "expo-file-system/legacy";
import { abortError, throwIfAborted } from "../async/abort";
import {
  currentAccountEpoch,
  currentAccountOwner,
  isCurrentAccountEpoch,
  onAccountOwnerChange,
} from "../auth/account-epoch";
import {
  leaseOwnedTempFile,
  type OwnedTempFileLease,
  type OwnedTempLeaseError,
} from "../storage/owned-temp";

export const MAX_RECORDING_BYTES = 3_000_000;

const ALLOWED_AUDIO_MIMES = new Set([
  "audio/m4a",
  "audio/x-m4a",
  "audio/mp4",
  "audio/aac",
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
  "audio/3gpp",
]);

const AUDIO_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  ".3gp": "audio/3gpp",
  ".aac": "audio/aac",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".mp4": "audio/mp4",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".webm": "audio/webm",
};

export interface RecordingTempLease {
  release(): Promise<void>;
}

interface StoppableRecorder {
  readonly uri: string | null;
  stop(): Promise<void>;
  getStatus?(): { isRecording?: boolean; canRecord?: boolean };
}

const recorderCleanupInFlight = new WeakMap<object, Promise<void>>();
export const RECORDER_STOP_TIMEOUT_MS = 5_000;
export const RECORDING_TEMP_TIMEOUT_MS = 5_000;

type DeadlineResult<T> =
  | { status: "resolved"; value: T }
  | { status: "rejected" }
  | { status: "timed_out" };

function awaitWithAbort<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (result: { ok: true; value: T } | { ok: false; error: unknown }): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      if (result.ok) resolve(result.value);
      else reject(result.error);
    };
    const onAbort = (): void => finish({ ok: false, error: abortError() });
    signal.addEventListener("abort", onAbort, { once: true });
    void operation.then(
      (value) => finish({ ok: true, value }),
      (error) => finish({ ok: false, error }),
    );
    if (signal.aborted) onAbort();
  });
}

function settleBeforeDeadline<T>(operation: Promise<T>, timeoutMs: number): Promise<DeadlineResult<T>> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ status: "timed_out" });
    }, timeoutMs);
    void operation.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ status: "resolved", value });
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ status: "rejected" });
      },
    );
  });
}

function safeCleanupReason(value: unknown): OwnedTempLeaseError | "unexpected_failure" {
  switch (value) {
    case "unsupported_runtime":
    case "filesystem_unavailable":
    case "unsafe_target":
    case "not_a_file":
    case "inspect_failed":
    case "target_changed":
    case "delete_failed":
    case "verification_failed":
      return value;
    default:
      return "unexpected_failure";
  }
}

function warnCleanup(message: string, reason: unknown): void {
  if (typeof console !== "undefined") {
    console.warn(`[audio] ${message}`, safeCleanupReason(reason));
  }
}

function wrapOwnedLease(lease: OwnedTempFileLease): RecordingTempLease {
  let releasePromise: Promise<void> | undefined;
  return Object.freeze({
    release(): Promise<void> {
      releasePromise ??= (async () => {
        try {
          const operation = lease.dispose();
          const settled = await settleBeforeDeadline(operation, RECORDING_TEMP_TIMEOUT_MS);
          if (settled.status === "timed_out") {
            warnCleanup("recording cleanup timed out", "unexpected_failure");
            void operation.then((result) => {
              if (!result.ok) warnCleanup("recording cleanup failed", result.error);
            }).catch(() => warnCleanup("recording cleanup failed", "unexpected_failure"));
            return;
          }
          if (settled.status === "rejected") {
            warnCleanup("recording cleanup failed", "unexpected_failure");
            return;
          }
          if (!settled.value.ok) warnCleanup("recording cleanup failed", settled.value.error);
        } catch {
          warnCleanup("recording cleanup failed", "unexpected_failure");
        }
      })();
      return releasePromise;
    },
  });
}

function recordingMimeType(uri: string, requestedMimeType?: string): string {
  const requested = requestedMimeType?.trim().toLowerCase();
  if (requested && ALLOWED_AUDIO_MIMES.has(requested)) return requested;
  if (uri.startsWith("blob:")) return "audio/webm";

  let pathname = "";
  try {
    pathname = new URL(uri).pathname.toLowerCase();
  } catch {
    // The bounded reader rejects malformed sources; MIME stays non-sensitive.
  }
  for (const [extension, mimeType] of Object.entries(AUDIO_MIME_BY_EXTENSION)) {
    if (pathname.endsWith(extension)) return mimeType;
  }
  return "audio/mp4";
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function declaredRecordingBytes(
  uri: string,
  declaredBytes: number | undefined,
  signal?: AbortSignal,
): Promise<number | undefined> {
  if (declaredBytes !== undefined) {
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0) {
      throw new Error("voice_read_failed");
    }
    return declaredBytes;
  }
  if (!uri.startsWith("file:///")) return undefined;

  let info: Awaited<ReturnType<typeof getInfoAsync>>;
  try {
    info = await awaitWithAbort(getInfoAsync(uri), signal);
  } catch {
    throwIfAborted(signal);
    throw new Error("voice_read_failed");
  }
  if (
    !info.exists ||
    info.isDirectory ||
    info.uri !== uri ||
    !Number.isSafeInteger(info.size) ||
    info.size < 0
  ) {
    throw new Error("voice_read_failed");
  }
  return info.size;
}

async function bytesToBase64(
  bytes: Uint8Array,
  mimeType: string,
  signal?: AbortSignal,
): Promise<string> {
  const blob = new Blob([toArrayBuffer(bytes)], { type: mimeType });
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    let settled = false;
    const cleanup = (): void => signal?.removeEventListener("abort", onAbort);
    const finish = (result: { ok: true; value: string } | { ok: false; error: Error }): void => {
      if (settled) return;
      settled = true;
      cleanup();
      if (result.ok) resolve(result.value);
      else reject(result.error);
    };
    const onAbort = (): void => {
      try {
        reader.abort?.();
      } catch {
        // Rejecting with the stable abort below is the security boundary.
      }
      finish({ ok: false, error: abortError() });
    };
    reader.onerror = () => finish({ ok: false, error: new Error("voice_read_failed") });
    reader.onload = () => finish({ ok: true, value: String(reader.result ?? "") });
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    try {
      reader.readAsDataURL(blob);
    } catch {
      finish({ ok: false, error: new Error("voice_read_failed") });
    }
  });
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("voice_read_failed");
  return dataUrl.slice(comma + 1);
}

export async function recordingUriToBase64(
  uri: string,
  requestedMimeType?: string,
  declaredBytes?: number,
  signal?: AbortSignal,
): Promise<{ base64: string; mimeType: string }> {
  throwIfAborted(signal);
  const mimeType = recordingMimeType(uri, requestedMimeType);
  const verifiedBytes = await declaredRecordingBytes(uri, declaredBytes, signal);
  throwIfAborted(signal);
  const bytes = await awaitWithAbort(
    fetchBoundedLocalBytes(uri, {
      allowWebBlob: true,
      declaredBytes: verifiedBytes,
      maxBytes: MAX_RECORDING_BYTES,
      signal,
    }),
    signal,
  );
  throwIfAborted(signal);
  const base64 = await bytesToBase64(bytes, mimeType, signal);
  throwIfAborted(signal);
  return { base64, mimeType };
}

/** Claim only a verified Expo recorder copy inside this app's cache root. */
export async function claimRecordingTemp(
  uri: string | null | undefined,
): Promise<RecordingTempLease | null> {
  if (!uri) return null;
  let operation: ReturnType<typeof leaseOwnedTempFile>;
  try {
    operation = leaseOwnedTempFile(uri);
  } catch {
    warnCleanup("recording claim failed", "unexpected_failure");
    return null;
  }
  const settled = await settleBeforeDeadline(operation, RECORDING_TEMP_TIMEOUT_MS);
  if (settled.status === "timed_out") {
    warnCleanup("recording claim timed out", "unexpected_failure");
    void operation.then(async (result) => {
      if (result.ok) await discardRecording(wrapOwnedLease(result.lease));
    }).catch(() => warnCleanup("recording claim failed", "unexpected_failure"));
    return null;
  }
  if (settled.status === "rejected") {
    warnCleanup("recording claim failed", "unexpected_failure");
    return null;
  }
  return settled.value.ok ? wrapOwnedLease(settled.value.lease) : null;
}

/** Release a previously claimed cache copy; raw URIs are not accepted. */
export async function discardRecording(
  lease: RecordingTempLease | null | undefined,
): Promise<void> {
  if (!lease) return;
  try {
    await lease.release();
  } catch {
    warnCleanup("recording cleanup failed", "unexpected_failure");
  }
}

/** Keep a reused recorder from starting while its previous output is stopping. */
export function waitForRecordingCleanup(recorder: StoppableRecorder): Promise<void> {
  return recorderCleanupInFlight.get(recorder as object) ?? Promise.resolve();
}

export interface RecorderTranscriptionOutput {
  uri: string;
  lease: RecordingTempLease;
}

export interface RecorderLifecycle {
  /** Captures recorder.uri synchronously for the just-started writer. */
  begin(ownerUserId: string): boolean;
  stopForTranscription(signal: AbortSignal): Promise<RecorderTranscriptionOutput>;
  cancel(): Promise<void>;
  waitForIdle(): Promise<void>;
  dispose(): void;
}

interface RecorderSession {
  readonly ownerUserId: string;
  readonly epoch: number;
  readonly uri: string | null;
  intent: "transfer" | "discard";
  work: Promise<RecorderTranscriptionOutput | null> | null;
  unsubscribeOwner: () => void;
  detachAbort: (() => void) | null;
}

function writerEndedAfterStopFailure(recorder: StoppableRecorder): boolean {
  try {
    const status = recorder.getStatus?.();
    return status?.isRecording === false && status.canRecord === false;
  } catch {
    return false;
  }
}

/**
 * Recorder-owned state machine. It snapshots the URI before any await, begins
 * stop synchronously, and transfers a deletion lease only after writer-end
 * proof. Owner change, navigation cleanup, and mode exit all converge on the
 * same idempotent discard intent.
 */
export function createRecorderLifecycle(recorder: StoppableRecorder): RecorderLifecycle {
  let active: RecorderSession | null = null;
  let disposed = false;

  const clear = (session: RecorderSession): void => {
    if (active !== session) return;
    session.unsubscribeOwner();
    session.detachAbort?.();
    active = null;
  };

  const finishStopped = async (
    session: RecorderSession,
    forceDiscard = false,
  ): Promise<RecorderTranscriptionOutput | null> => {
    if (
      forceDiscard ||
      !isCurrentAccountEpoch(session.epoch) ||
      currentAccountOwner() !== session.ownerUserId
    ) {
      session.intent = "discard";
    }
    const lease = await claimRecordingTemp(session.uri);
    if (!lease || !session.uri) {
      clear(session);
      return null;
    }
    if (session.intent === "discard") {
      await discardRecording(lease);
      clear(session);
      return null;
    }
    clear(session);
    return { uri: session.uri, lease };
  };

  const settle = (session: RecorderSession): Promise<RecorderTranscriptionOutput | null> => {
    if (session.work) return session.work;

    // Calling stop itself is intentionally synchronous. React layout cleanup
    // reaches this before expo-audio's passive hook release can invalidate the
    // shared recorder object; the already-snapshotted URI is never reread.
    let stopOperation: Promise<void>;
    try {
      stopOperation = recorder.stop();
    } catch {
      stopOperation = Promise.reject(new Error("recording_stop_failed"));
    }

    session.work = (async () => {
      const stopped = await settleBeforeDeadline(stopOperation, RECORDER_STOP_TIMEOUT_MS);
      if (stopped.status === "resolved") return finishStopped(session);
      if (stopped.status === "rejected") {
        if (writerEndedAfterStopFailure(recorder)) return finishStopped(session, true);
        warnCleanup("recording stop failed", "unexpected_failure");
        // Keep the session quarantined: reusing this native recorder or deleting
        // its URI without writer-end proof could race a still-open writer.
        return null;
      }

      warnCleanup("recording stop timed out", "unexpected_failure");
      // The caller is released at the deadline. A later resolved stop is valid
      // writer-end proof, but its output is now discard-only and cleaned once.
      void stopOperation.then(
        () => finishStopped(session, true),
        () => {
          if (writerEndedAfterStopFailure(recorder)) return finishStopped(session, true);
          return null;
        },
      ).catch(() => warnCleanup("recording late cleanup failed", "unexpected_failure"));
      return null;
    })();
    return session.work;
  };

  const cancel = async (): Promise<void> => {
    const session = active;
    if (!session) return;
    session.intent = "discard";
    const output = await settle(session);
    if (output) await discardRecording(output.lease);
  };

  return {
    begin(ownerUserId: string): boolean {
      if (disposed || active) return false;
      const epoch = currentAccountEpoch();
      const session: RecorderSession = {
        ownerUserId,
        epoch,
        uri: recorder.uri,
        intent: "transfer",
        work: null,
        unsubscribeOwner: () => {},
        detachAbort: null,
      };
      active = session;
      session.unsubscribeOwner = onAccountOwnerChange((change) => {
        if (change.epoch !== epoch || change.owner !== ownerUserId) void cancel();
      });
      if (!session.uri || currentAccountOwner() !== ownerUserId) {
        void cancel();
        return false;
      }
      return true;
    },
    async stopForTranscription(signal: AbortSignal): Promise<RecorderTranscriptionOutput> {
      const session = active;
      if (!session || session.intent === "discard") throw abortError();
      const abort = (): void => { void cancel(); };
      signal.addEventListener("abort", abort, { once: true });
      session.detachAbort = () => signal.removeEventListener("abort", abort);
      if (signal.aborted) {
        await cancel();
        throw abortError();
      }
      const output = await settle(session);
      try {
        throwIfAborted(signal);
      } catch (error) {
        // A stop may finish in the same turn that its account/navigation signal
        // is revoked. Never strand the already-transferred deletion lease when
        // the stale caller is forbidden from receiving it.
        if (output) await discardRecording(output.lease);
        throw error;
      }
      if (!output) throw new Error("voice_stop_failed");
      return output;
    },
    cancel,
    async waitForIdle(): Promise<void> {
      const session = active;
      if (!session) return;
      if (session.work) await session.work;
      if (active) throw new Error("voice_recorder_quarantined");
    },
    dispose(): void {
      disposed = true;
      void cancel();
    },
  };
}

/** Stop a live recorder, claim its completed cache file, and dispose it once. */
export function stopAndDiscardRecording(recorder: StoppableRecorder): Promise<void> {
  const key = recorder as object;
  const pending = recorderCleanupInFlight.get(key);
  if (pending) return pending;

  let tracked: Promise<void>;
  const cleanup = (async () => {
    const capturedUri = recorder.uri;
    let stopOperation: Promise<void>;
    try {
      stopOperation = recorder.stop();
    } catch {
      warnCleanup("recording stop failed", "unexpected_failure");
      return;
    }
    const stopped = await settleBeforeDeadline(stopOperation, RECORDER_STOP_TIMEOUT_MS);
    if (stopped.status === "timed_out") {
      void stopOperation.then(async () => {
        const lateLease = await claimRecordingTemp(capturedUri);
        await discardRecording(lateLease);
      }).catch(() => {});
      return;
    }
    if (stopped.status === "rejected" && !writerEndedAfterStopFailure(recorder)) {
      warnCleanup("recording stop failed", "unexpected_failure");
      return;
    }
    const lease = await claimRecordingTemp(capturedUri);
    await discardRecording(lease);
  })();
  tracked = cleanup.finally(() => {
    if (recorderCleanupInFlight.get(key) === tracked) recorderCleanupInFlight.delete(key);
  });
  recorderCleanupInFlight.set(key, tracked);
  return tracked;
}
