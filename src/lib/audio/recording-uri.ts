// On-device recording helpers shared by the voice-to-text flows. Reads are
// capped before base64 inflation, and cleanup is possible only through an
// app-cache lease that snapshots and revalidates the exact recorder output.
import { fetchBoundedLocalBytes } from "../import/bounded-file-read";
import { getInfoAsync } from "expo-file-system/legacy";
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
}

const recorderCleanupInFlight = new WeakMap<object, Promise<void>>();

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
          const result = await lease.dispose();
          if (!result.ok) warnCleanup("recording cleanup failed", result.error);
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
    info = await getInfoAsync(uri);
  } catch {
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

async function bytesToBase64(bytes: Uint8Array, mimeType: string): Promise<string> {
  const blob = new Blob([toArrayBuffer(bytes)], { type: mimeType });
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("voice_read_failed"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(blob);
  });
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("voice_read_failed");
  return dataUrl.slice(comma + 1);
}

export async function recordingUriToBase64(
  uri: string,
  requestedMimeType?: string,
  declaredBytes?: number,
): Promise<{ base64: string; mimeType: string }> {
  const mimeType = recordingMimeType(uri, requestedMimeType);
  const verifiedBytes = await declaredRecordingBytes(uri, declaredBytes);
  const bytes = await fetchBoundedLocalBytes(uri, {
    allowWebBlob: true,
    declaredBytes: verifiedBytes,
    maxBytes: MAX_RECORDING_BYTES,
  });
  const base64 = await bytesToBase64(bytes, mimeType);
  return { base64, mimeType };
}

/** Claim only a verified Expo recorder copy inside this app's cache root. */
export async function claimRecordingTemp(
  uri: string | null | undefined,
): Promise<RecordingTempLease | null> {
  if (!uri) return null;
  try {
    const result = await leaseOwnedTempFile(uri);
    return result.ok ? wrapOwnedLease(result.lease) : null;
  } catch {
    warnCleanup("recording claim failed", "unexpected_failure");
    return null;
  }
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

/** Stop a live recorder, claim its completed cache file, and dispose it once. */
export function stopAndDiscardRecording(recorder: StoppableRecorder): Promise<void> {
  const key = recorder as object;
  const pending = recorderCleanupInFlight.get(key);
  if (pending) return pending;

  let tracked: Promise<void>;
  const cleanup = (async () => {
    try {
      await recorder.stop();
    } catch {
      warnCleanup("recording stop failed", "unexpected_failure");
      return;
    }
    const lease = await claimRecordingTemp(recorder.uri);
    await discardRecording(lease);
  })();
  tracked = cleanup.finally(() => {
    if (recorderCleanupInFlight.get(key) === tracked) recorderCleanupInFlight.delete(key);
  });
  recorderCleanupInFlight.set(key, tracked);
  return tracked;
}
