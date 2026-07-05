// Read a local recording URI into base64 + mime WITHOUT expo-file-system:
// fetch the file:// (or blob:) URI as a Blob, then FileReader.readAsDataURL
// yields a "data:<mime>;base64,<data>" string we split. Works on native and web.
//
// Shared by the two on-device transcription flows (capture 음성 mode and the
// call-reflection recorder) so both feed transcribeAudio the exact same shape.
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
