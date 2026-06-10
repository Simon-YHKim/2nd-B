// File picker for capture flow.
//
// 2026-05-27 scope: the user wants to drop PDFs, docs, and emails into
// Wiki. Phase 1 (PR #32) accepted text MIMEs only and let the LLM
// classify whatever the user pasted. Phase 2 (this) adds PDF + DOCX
// text extraction via dynamic imports of pdfjs-dist + mammoth, so the
// chunks only load when the user actually picks a binary file.
//
// Native (iOS/Android) PDF/DOCX support is deferred — pdfjs-dist
// targets browsers and mammoth is Node/web only. On native we leave
// textContent null and the LLM falls back to filename + MIME metadata.

import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  /** UTF-8 text read from the file. Null when extraction is unsupported (native PDF/DOCX) or failed. */
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

const PDF_MIMES = new Set(["application/pdf"]);

const DOCX_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

// Hard cap: refuse to extract >10MB so we don't blow up the JS heap on
// huge scans. The user still gets the filename + MIME back; the LLM can
// classify those.
const MAX_EXTRACT_BYTES = 10 * 1024 * 1024;

export function normalizeFileMimeType(mimeType: string | null | undefined): string {
  const normalized = mimeType?.trim().toLowerCase().split(";")[0]?.trim();
  return normalized || "application/octet-stream";
}

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

  const mimeType = normalizeFileMimeType(asset.mimeType);
  const size = asset.size ?? 0;
  const text = await extractText(asset.uri, mimeType, size);

  return {
    uri: asset.uri,
    name: asset.name,
    mimeType,
    size,
    textContent: text,
  };
}

// Branches by MIME. Returns null on any extraction failure so the caller
// can still surface the file metadata; never throws.
export async function extractText(uri: string, mimeType: string, size: number): Promise<string | null> {
  if (size > MAX_EXTRACT_BYTES) return null;
  if (typeof globalThis.fetch !== "function") return null;
  const normalizedMimeType = normalizeFileMimeType(mimeType);

  try {
    if (TEXT_MIMES.has(normalizedMimeType)) {
      const blob = await fetch(uri);
      return await blob.text();
    }
    // PDF + DOCX extraction is web-only. Native picks the file but the
    // LLM gets metadata only — the user can still paste relevant excerpts
    // into the memo field manually.
    if (Platform.OS !== "web") return null;

    if (PDF_MIMES.has(normalizedMimeType)) {
      const buf = await (await fetch(uri)).arrayBuffer();
      return await extractPdfText(buf);
    }
    if (DOCX_MIMES.has(normalizedMimeType)) {
      const buf = await (await fetch(uri)).arrayBuffer();
      return await extractDocxText(buf);
    }
    return null;
  } catch {
    return null;
  }
}

// Dynamically import pdfjs-dist so the ~2MB worker bundle only loads when
// the user actually picks a PDF. Worker is disabled (fake worker) — slower
// for huge files but avoids the Expo Web worker-URL setup tax.
async function extractPdfText(buf: ArrayBuffer): Promise<string | null> {
  const pdfjs = await import("pdfjs-dist");
  try {
    // Disable worker by clearing workerSrc. pdfjs falls back to fake-worker
    // mode when no Worker constructor is reachable, which keeps Expo Web
    // bundling simple.
    (pdfjs as { GlobalWorkerOptions?: { workerSrc?: string } }).GlobalWorkerOptions = {
      ...(pdfjs as { GlobalWorkerOptions?: object }).GlobalWorkerOptions,
      workerSrc: "",
    };
  } catch {
    // No-op: some builds expose it differently; getDocument will pick a default.
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const line = tc.items
      .map((it) => ("str" in it ? (it as { str: string }).str : ""))
      .join(" ");
    pages.push(line);
  }
  return pages.join("\n\n").trim() || null;
}

async function extractDocxText(buf: ArrayBuffer): Promise<string | null> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return result.value.trim() || null;
}
