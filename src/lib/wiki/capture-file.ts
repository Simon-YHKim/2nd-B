// File picker for capture flow.
//
// 2026-05-27 scope (per user directive): the user wants to drop PDFs,
// docs, and emails into Wiki. Phase 1 = let them pick a file + we read
// it as text where possible, and let the LLM classify what it is. PDF
// extraction is best-effort: for now we accept the user's pasted text
// or fall back to filename-only metadata if the file is binary. A
// future PR can layer pdfjs-dist or server-side extraction.

import * as DocumentPicker from "expo-document-picker";

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  /** UTF-8 text read from the file when the MIME suggests text; otherwise null. */
  textContent: string | null;
}

const TEXT_MIMES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/xml",
  "text/html",
]);

export async function pickFile(): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "text/plain",
      "text/markdown",
      "text/csv",
      "application/json",
      "text/html",
    ],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled) return null;
  const asset = res.assets?.[0];
  if (!asset) return null;

  let text: string | null = null;
  if (asset.mimeType && TEXT_MIMES.has(asset.mimeType) && typeof globalThis.fetch === "function") {
    try {
      // expo-document-picker returns a local URI we can fetch back as a
      // blob; text() decodes UTF-8 for the MIME types we allow above.
      const blob = await fetch(asset.uri);
      text = await blob.text();
    } catch {
      text = null;
    }
  }

  return {
    uri: asset.uri,
    name: asset.name,
    mimeType: asset.mimeType ?? "application/octet-stream",
    size: asset.size ?? 0,
    textContent: text,
  };
}
