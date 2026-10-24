import { abortError } from "../async/abort";
import { beginAccountSessionLease } from "../auth/account-session-lease";
import { normalizeOcrImagePayload, type PickedImage } from "../wiki/capture-image";
import contract from "./share-media-contract.json";
import { sharedMediaToken, type SharedMediaKind } from "./share-media-intent";
import { nativeMedia } from "./shared-media-native";

export interface SharedMediaFile {
  uri: string;
  mimeType: string;
  size: number;
  base64?: string;
  release(): Promise<void>;
}

export function discardSharedMedia(value: unknown): void {
  const token = sharedMediaToken(value);
  try { if (token) nativeMedia()?.discard(token); } catch {
    // Bridge shutdown also invalidates native handles. UI teardown must finish.
  }
}

/** Local copy only. Auth/session assertion does not authenticate or call a model. */
export async function takeSharedMedia(
  userId: string,
  value: unknown,
  kind: SharedMediaKind,
  signal?: AbortSignal,
): Promise<SharedMediaFile> {
  const token = sharedMediaToken(value);
  const native = nativeMedia();
  if (!token || !native) throw new Error("share_unavailable");
  const lease = beginAccountSessionLease(userId, signal);
  let released = false;
  const release = async (): Promise<void> => {
    if (released) return;
    released = true;
    lease.signal.removeEventListener("abort", onAbort);
    try { native.discard(token); } catch {
      // A shutting-down bridge must not leave the account capability live.
    } finally { lease.release(); }
  };
  const onAbort = (): void => { void release(); };
  lease.signal.addEventListener("abort", onAbort, { once: true });
  try {
    lease.assertCurrent();
    const response = await new Promise<unknown>((resolve, reject) => {
      const abort = (): void => reject(abortError());
      lease.signal.addEventListener("abort", abort, { once: true });
      void native.take(token, kind).then(resolve, reject).finally(() => lease.signal.removeEventListener("abort", abort));
      if (lease.signal.aborted) abort();
    });
    lease.assertCurrent();
    if (!response || typeof response !== "object") throw new Error("share_unreadable");
    const result = response as Record<string, unknown>;
    const suffix = kind === "image" ? ".jpg" : ".input";
    if (
      result.token !== token || result.kind !== kind || typeof result.uri !== "string" ||
      !result.uri.startsWith("file:///") || result.uri.includes("%") || result.uri.includes("..") ||
      !result.uri.endsWith(`/pola-shared-media/${token}${suffix}`) ||
      typeof result.mimeType !== "string" || typeof result.size !== "number" ||
      !Number.isSafeInteger(result.size) || result.size <= 0 ||
      result.size > (kind === "image" ? contract.maxPreparedImageBytes : contract.maxAudioBytes)
    ) throw new Error("share_unreadable");
    if (kind === "image") {
      if (typeof result.base64 !== "string" || result.mimeType !== "image/jpeg") throw new Error("share_unreadable");
      const payload = normalizeOcrImagePayload({ base64: result.base64, mimeType: result.mimeType });
      const byteLength = payload.base64.length * 3 / 4 - (payload.base64.endsWith("==") ? 2 : payload.base64.endsWith("=") ? 1 : 0);
      if (byteLength !== result.size) throw new Error("share_unreadable");
      return { uri: result.uri, size: result.size, ...payload, release };
    }
    if (!["audio/mp4", "audio/aac", "audio/mpeg", "audio/wav", "audio/webm", "audio/ogg", "audio/3gpp"].includes(result.mimeType)) {
      throw new Error("share_unreadable");
    }
    return { uri: result.uri, size: result.size, mimeType: result.mimeType, release };
  } catch (error) {
    await release();
    throw error;
  }
}

export async function takeSharedImage(userId: string, token: unknown, signal?: AbortSignal): Promise<PickedImage> {
  const image = await takeSharedMedia(userId, token, "image", signal);
  if (!image.base64) { await image.release(); throw new Error("share_unreadable"); }
  return { uri: image.uri, base64: image.base64, mimeType: image.mimeType, release: image.release };
}
