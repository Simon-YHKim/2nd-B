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

const GENERIC_FILE_MIMES = new Set([
  "application/octet-stream",
  "binary/octet-stream",
  "application/x-unknown",
]);

const FILE_EXTENSION_MIMES: Record<string, string> = {
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  xml: "application/xml",
  html: "text/html",
  htm: "text/html",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

// Hard caps: avoid blowing up the JS heap on huge scans, and keep extracted
// text small enough for the capture input + downstream classifier prompt.
// The user still gets the filename + MIME back when binary extraction is skipped.
export const MAX_EXTRACT_BYTES = 10 * 1024 * 1024;
export const MAX_EXTRACTED_FILE_TEXT_CHARS = 60_000;

export function normalizeFileMimeType(mimeType: string | null | undefined, fileName?: string | null): string {
  const normalized = mimeType?.trim().toLowerCase().split(";")[0]?.trim();
  if (normalized && !GENERIC_FILE_MIMES.has(normalized)) return normalized;
  const inferred = inferFileMimeTypeFromName(fileName);
  return inferred ?? (normalized || "application/octet-stream");
}

function inferFileMimeTypeFromName(fileName: string | null | undefined): string | null {
  const cleanName = fileName?.trim().split(/[?#]/)[0];
  if (!cleanName) return null;
  const match = /\.([A-Za-z0-9]+)$/.exec(cleanName);
  if (!match) return null;
  return FILE_EXTENSION_MIMES[match[1].toLowerCase()] ?? null;
}

export function normalizeFileTextResult(text: string): string {
  if (text.length <= MAX_EXTRACTED_FILE_TEXT_CHARS) return text;
  const marker = `\n\n[File text truncated: original ${text.length} chars]`;
  return `${text.slice(0, MAX_EXTRACTED_FILE_TEXT_CHARS).trimEnd()}${marker}`;
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

  const mimeType = normalizeFileMimeType(asset.mimeType, asset.name);
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

// Multi-select text/markdown picker for the /import "from files" connector
// (e.g. an Obsidian vault export, or any loose .md/.txt notes). Reuses
// extractText per asset; binary/unreadable/empty files are skipped rather than
// failing the whole pick. PDF/DOCX are intentionally NOT offered here — this
// path feeds the markdown-note splitter, so it stays text-only.
export interface PickedImportFile {
  name: string;
  text: string;
}

export async function pickImportFiles(): Promise<PickedImportFile[]> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ["text/markdown", "text/plain", "text/html", "application/json"],
    copyToCacheDirectory: true,
    multiple: true,
  });
  if (res.canceled) return [];
  const out: PickedImportFile[] = [];
  for (const asset of res.assets ?? []) {
    const mimeType = normalizeFileMimeType(asset.mimeType, asset.name);
    const text = await extractText(asset.uri, mimeType, asset.size ?? 0);
    const trimmed = text?.trim();
    if (trimmed) out.push({ name: asset.name, text: trimmed });
  }
  return out;
}

// Branches by MIME. Returns null on any extraction failure so the caller
// can still surface the file metadata; never throws.
export async function extractText(uri: string, mimeType: string, size: number): Promise<string | null> {
  if (!Number.isFinite(size) || size < 0 || size > MAX_EXTRACT_BYTES) return null;
  if (typeof globalThis.fetch !== "function") return null;
  const normalizedMimeType = normalizeFileMimeType(mimeType);

  try {
    if (TEXT_MIMES.has(normalizedMimeType)) {
      const res = await fetchWithinCap(uri);
      if (!res) return null;
      return normalizeFileTextResult(await res.text());
    }
    // PDF + DOCX extraction is web-only. Native picks the file but the
    // LLM gets metadata only — the user can still paste relevant excerpts
    // into the memo field manually.
    if (Platform.OS !== "web") return null;

    if (PDF_MIMES.has(normalizedMimeType)) {
      const buf = await fetchArrayBufferWithinCap(uri);
      if (!buf) return null;
      const text = await extractPdfText(buf);
      return text == null ? null : normalizeFileTextResult(text);
    }
    if (DOCX_MIMES.has(normalizedMimeType)) {
      const buf = await fetchArrayBufferWithinCap(uri);
      if (!buf) return null;
      const text = await extractDocxText(buf);
      return text == null ? null : normalizeFileTextResult(text);
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchWithinCap(uri: string): Promise<Response | null> {
  const res = await fetch(uri);
  const contentLength = responseContentLength(res);
  if (contentLength != null && contentLength > MAX_EXTRACT_BYTES) return null;
  return res;
}

async function fetchArrayBufferWithinCap(uri: string): Promise<ArrayBuffer | null> {
  const res = await fetchWithinCap(uri);
  if (!res) return null;
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_EXTRACT_BYTES) return null;
  return buf;
}

function responseContentLength(res: Response): number | null {
  const raw = res.headers?.get?.("content-length");
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
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
