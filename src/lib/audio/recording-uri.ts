// On-device recording helpers shared by the two voice->text flows (capture 음성
// mode and the call-reflection recorder).
//
// recordingUriToBase64 reads a local recording URI into base64 + mime WITHOUT
// expo-file-system: it fetches the file:// (or blob:) URI as a Blob, then
// FileReader.readAsDataURL yields a "data:<mime>;base64,<data>" string we split.
// Works on native and web, and feeds transcribeAudio the exact same shape.
import { deleteAsync } from "expo-file-system/legacy";

export async function recordingUriToBase64(
  uri: string,
): Promise<{ base64: string; mimeType: string }> {
  const blob = await (await fetch(uri)).blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("voice_read_failed"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(blob);
  });
  const comma = dataUrl.indexOf(",");
  const header = comma >= 0 ? dataUrl.slice(0, comma) : "";
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  // header looks like "data:audio/mp4;base64" — pull the mime, fall back to the
  // blob's own type, then a safe default Gemini accepts.
  const headerMime = header.match(/^data:([^;]+)/)?.[1];
  const mimeType = headerMime || blob.type || "audio/mp4";
  return { base64, mimeType };
}

// Best-effort delete of a temp on-device recording once its text has been
// extracted. Both voice flows promise the user the original audio is dropped
// after transcription, so we remove the cache file here to honor that. Never
// throws -- a failed cleanup must not break the capture flow -- and non-file://
// URIs (e.g. web blob:) have no local file to delete.
export async function discardRecording(uri: string | null | undefined): Promise<void> {
  if (!uri || !uri.startsWith("file://")) return;
  try {
    await deleteAsync(uri, { idempotent: true });
  } catch {
    // The OS may have already evicted the cache file; nothing else to do.
  }
}
