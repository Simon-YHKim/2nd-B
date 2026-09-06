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

import {
  BoundedFileReadError,
  decodeBoundedUtf8Bytes,
  fetchBoundedLocalBytes,
} from "../import/bounded-file-read";
import { ensurePdfWorker } from "./pdf-worker";

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

// Audio the user already has on disk (a recorded lecture, a voice memo taken in
// another app, an interview). These are NOT read as text — they go to
// transcribeAudio, exactly like the in-app recorder's output.
//
// This list mirrors ALLOWED_AUDIO_MIME in supabase/functions/gemini-proxy. Adding
// a format here that the proxy rejects gives the user a picker that accepts a
// file and then fails at the last step, so keep the two in sync.
const AUDIO_MIMES = new Set([
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

/** True when this file should be transcribed rather than read. */
export function isAudioMime(mimeType: string | null | undefined): boolean {
  return AUDIO_MIMES.has(normalizeFileMimeType(mimeType));
}

// Derived from MAX_AUDIO_BASE64_LEN (4,100,000) in gemini-proxy: base64 inflates
// by 4/3, so the binary ceiling is ~3,075,000 bytes. 3,000,000 sits just under it
// with room for the encoder's padding, and is roughly a 3-minute m4a.
//
// This is DECIMAL MB on purpose — 3 * 1024 * 1024 looks like the same number and
// is not: it encodes to 4,194,304 base64 chars, over the proxy cap, so every file
// between 2.93MB and 3MB would have been accepted here and rejected there, after
// the user had already waited through the upload. A test pins the arithmetic.
export const MAX_AUDIO_FILE_BYTES = 3_000_000;

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
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  aac: "audio/aac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  webm: "audio/webm",
  "3gp": "audio/3gpp",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

// Hard caps: avoid blowing up the JS heap on huge scans, and keep extracted
// text small enough for the capture input + downstream classifier prompt.
// The user still gets the filename + MIME back when binary extraction is skipped.
export const MAX_EXTRACT_BYTES = 10 * 1024 * 1024;
export const MAX_EXTRACTED_FILE_TEXT_CHARS = 60_000;
export const FILE_EXTRACTION_TIMEOUT_MS = 15_000;
export const MAX_PDF_PAGES = 100;
export const MAX_IMPORT_FILE_COUNT = 64;
export const MAX_IMPORT_TOTAL_BYTES = MAX_EXTRACT_BYTES * 2;
export const MAX_IMPORT_TOTAL_TEXT_CHARS = 500_000;

const MAX_PDF_TEXT_ITEMS = 100_000;
const MAX_DOCX_ENTRIES = 2_048;
const MAX_DOCX_ENTRY_UNCOMPRESSED_BYTES = 16 * 1024 * 1024;
const MAX_DOCX_TOTAL_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;
const MAX_DOCX_COMPRESSION_RATIO = 100;

interface ExtractionDeadline {
  signal: AbortSignal;
  deadlineAtMs: number;
  registerCleanup(cleanup: () => Promise<unknown> | unknown): () => Promise<void>;
}

function runWithExtractionDeadline<T>(operation: (deadline: ExtractionDeadline) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const deadlineAtMs = Date.now() + FILE_EXTRACTION_TIMEOUT_MS;
  const cleanups = new Set<() => Promise<void>>();
  const deadline: ExtractionDeadline = {
    signal: controller.signal,
    deadlineAtMs,
    registerCleanup(cleanup) {
      let active = true;
      const runOnce = async () => {
        if (!active) return;
        active = false;
        cleanups.delete(runOnce);
        try {
          await cleanup();
        } catch {
          // Cleanup is best-effort; callers receive a stable bounded error.
        }
      };
      cleanups.add(runOnce);
      if (controller.signal.aborted) void runOnce();
      return runOnce;
    },
  };

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (result: { value: T } | { error: unknown }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if ("error" in result) reject(result.error);
      else resolve(result.value);
    };
    const timer = setTimeout(() => {
      controller.abort();
      for (const cleanup of [...cleanups]) void cleanup();
      finish({ error: new BoundedFileReadError("timed_out") });
    }, FILE_EXTRACTION_TIMEOUT_MS);

    Promise.resolve()
      .then(() => operation(deadline))
      .then((value) => finish({ value }), (error: unknown) => finish({ error }));
  });
}

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
      "audio/*",
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

/**
 * Pick one audio file that already exists on the device.
 *
 * This deliberately has a narrower picker contract than pickFile(): callers
 * such as /call-reflection must never fall back to a document metadata stub or
 * imply that the app can record the call itself. The returned file belongs to
 * the user; callers may read it for transcription but must not delete it.
 */
export async function pickAudioFile(): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: "audio/*",
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled) return null;
  const asset = res.assets?.[0];
  if (!asset) return null;

  return {
    uri: asset.uri,
    name: asset.name,
    mimeType: normalizeFileMimeType(asset.mimeType, asset.name),
    size: asset.size ?? 0,
    textContent: null,
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
  const assets = res.assets ?? [];
  if (assets.length > MAX_IMPORT_FILE_COUNT || !hasSafeDeclaredImportSize(assets)) return [];

  const out: PickedImportFile[] = [];
  try {
    return await runWithExtractionDeadline(async (deadline) => {
      let actualBytes = 0;
      let outputChars = 0;
      for (const asset of assets) {
        const mimeType = normalizeFileMimeType(asset.mimeType, asset.name);
        if (!TEXT_MIMES.has(mimeType)) continue;
        const remainingBytes = MAX_IMPORT_TOTAL_BYTES - actualBytes;
        if (remainingBytes <= 0) break;

        let bytes: Uint8Array;
        try {
          bytes = await readPickedBytes(
            asset.uri,
            asset.size ?? 0,
            Math.min(MAX_EXTRACT_BYTES, remainingBytes),
            deadline,
          );
        } catch {
          // Known picker sizes were bounded as a group before any read, so one
          // unreadable file can retain the existing skip behavior. Unknown-size
          // failures stop the batch because their consumed byte count is unknowable.
          if ((asset.size ?? 0) > 0 && !deadline.signal.aborted) continue;
          break;
        }
        actualBytes += bytes.byteLength;

        let text: string;
        try {
          text = normalizeFileTextResult(decodeBoundedUtf8Bytes(bytes)).trim();
        } catch {
          continue;
        }
        if (!text) continue;
        if (text.length > MAX_IMPORT_TOTAL_TEXT_CHARS - outputChars) break;
        outputChars += text.length;
        out.push({ name: asset.name, text });
      }
      return out;
    });
  } catch {
    return out;
  }
}

function hasSafeDeclaredImportSize(assets: readonly { size?: number | null }[]): boolean {
  let total = 0;
  for (const asset of assets) {
    const size = asset.size ?? 0;
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_EXTRACT_BYTES) return false;
    if (size > MAX_IMPORT_TOTAL_BYTES - total) return false;
    total += size;
  }
  return true;
}

// Branches by MIME. Returns null on any extraction failure so the caller
// can still surface the file metadata; never throws.
export async function extractText(uri: string, mimeType: string, size: number): Promise<string | null> {
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_EXTRACT_BYTES) return null;
  if (typeof globalThis.fetch !== "function") return null;
  const normalizedMimeType = normalizeFileMimeType(mimeType);
  // Audio has no text to extract — the caller sends it to transcribeAudio. This
  // returns null EXPLICITLY rather than falling through, so nobody later reads
  // an m4a with res.text() and stores mojibake as the user's note.
  if (AUDIO_MIMES.has(normalizedMimeType)) return null;

  try {
    return await runWithExtractionDeadline(async (deadline) => {
      if (TEXT_MIMES.has(normalizedMimeType)) {
        const bytes = await readPickedBytes(uri, size, MAX_EXTRACT_BYTES, deadline);
        return normalizeFileTextResult(decodeBoundedUtf8Bytes(bytes));
      }
      // PDF + DOCX extraction is web-only. Native picks the file but the
      // LLM gets metadata only — the user can still paste relevant excerpts
      // into the memo field manually.
      if (Platform.OS !== "web") return null;

      if (PDF_MIMES.has(normalizedMimeType)) {
        const bytes = await readPickedBytes(uri, size, MAX_EXTRACT_BYTES, deadline);
        const text = await extractPdfText(toArrayBuffer(bytes), deadline);
        return text == null ? null : normalizeFileTextResult(text);
      }
      if (DOCX_MIMES.has(normalizedMimeType)) {
        const bytes = await readPickedBytes(uri, size, MAX_EXTRACT_BYTES, deadline);
        const text = await extractDocxText(toArrayBuffer(bytes), deadline);
        return text == null ? null : normalizeFileTextResult(text);
      }
      return null;
    });
  } catch {
    return null;
  }
}

async function readPickedBytes(
  uri: string,
  size: number,
  maxBytes: number,
  deadline?: ExtractionDeadline,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(size) || size < 0) throw new BoundedFileReadError("invalid_size");
  return fetchBoundedLocalBytes(uri, {
    allowWebBlob: Platform.OS === "web",
    deadlineAtMs: deadline?.deadlineAtMs,
    declaredBytes: size === 0 ? null : size,
    maxBytes,
    signal: deadline?.signal,
  });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

// Dynamically import pdfjs-dist so the ~2MB bundle only loads when the user
// actually picks a PDF. pdfjs runs on the MAIN THREAD here: ensurePdfWorker()
// imports the worker module, which sets globalThis.pdfjsWorker, which is the
// first thing PDFWorker looks for. No workerSrc, no Worker constructor, no
// per-bundler worker-URL tax.
//
// ⚠ What used to be here did NOT work, in the quietest possible way: it assigned
// to `pdfjs.GlobalWorkerOptions`, an ESM namespace member that bundlers export
// getter-only. The assignment threw, the surrounding try/catch swallowed it, and
// getDocument then died with `No "GlobalWorkerOptions.workerSrc" specified.` —
// so extractText returned null and the screen said "couldn't read the text",
// with nothing in the console. Reproduced on both 5.x and 6.x before the fix.
async function extractPdfText(buf: ArrayBuffer, deadline: ExtractionDeadline): Promise<string | null> {
  throwIfExtractionAborted(deadline);
  await ensurePdfWorker();
  throwIfExtractionAborted(deadline);
  const pdfjs = await import("pdfjs-dist");
  throwIfExtractionAborted(deadline);
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buf) });
  const destroy = deadline.registerCleanup(() => loadingTask.destroy());
  throwIfExtractionAborted(deadline);
  let doc: Awaited<typeof loadingTask.promise> | null = null;
  let text = "";
  let textItems = 0;
  let truncated = false;
  try {
    doc = await loadingTask.promise;
    if (!Number.isSafeInteger(doc.numPages) || doc.numPages < 0) return null;
    const pageLimit = Math.min(doc.numPages, MAX_PDF_PAGES);
    truncated = doc.numPages > pageLimit;

    for (let i = 1; i <= pageLimit; i++) {
      if (deadline.signal.aborted) throw new BoundedFileReadError("aborted");
      const page = await doc.getPage(i);
      let pageText = "";
      let stopAfterPage = false;
      const pagePrefixLength = text ? 2 : 0;
      try {
        const tc = await page.getTextContent();
        for (const item of tc.items) {
          textItems += 1;
          if (textItems > MAX_PDF_TEXT_ITEMS) {
            truncated = true;
            stopAfterPage = true;
            break;
          }
          const fragment = "str" in item ? (item as { str: string }).str : "";
          if (!fragment) continue;
          const separator = pageText ? " " : "";
          const remaining = MAX_EXTRACTED_FILE_TEXT_CHARS - text.length - pagePrefixLength - pageText.length;
          if (remaining <= separator.length) {
            truncated = true;
            stopAfterPage = true;
            break;
          }
          const addition = `${separator}${fragment}`;
          pageText += addition.slice(0, remaining);
          if (addition.length > remaining) {
            truncated = true;
            stopAfterPage = true;
            break;
          }
        }
        if (pageText) text += `${text ? "\n\n" : ""}${pageText}`;
      } finally {
        try {
          await Promise.resolve(page.cleanup?.());
        } catch {
          // Cleanup is best-effort after the bounded text has been retained.
        }
      }
      if (stopAfterPage) break;
    }
  } finally {
    await destroy();
  }

  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!truncated) return trimmed;
  const marker = "\n\n[File text truncated at safety limit]";
  return `${trimmed.slice(0, MAX_EXTRACTED_FILE_TEXT_CHARS - marker.length).trimEnd()}${marker}`;
}

async function extractDocxText(buf: ArrayBuffer, deadline: ExtractionDeadline): Promise<string | null> {
  await assertSafeDocx(new Uint8Array(buf), deadline);
  throwIfExtractionAborted(deadline);
  const mammoth = await import("mammoth");
  throwIfExtractionAborted(deadline);
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  throwIfExtractionAborted(deadline);
  return result.value.trim() || null;
}

function throwIfExtractionAborted(deadline: ExtractionDeadline): void {
  if (deadline.signal.aborted) throw new BoundedFileReadError("aborted");
}

interface DocxEntry {
  method: number;
  compressedBytes: number;
  uncompressedBytes: number;
  dataOffset: number;
}

async function assertSafeDocx(bytes: Uint8Array, deadline: ExtractionDeadline): Promise<void> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  const disk = view.getUint16(eocdOffset + 4, true);
  const centralDisk = view.getUint16(eocdOffset + 6, true);
  const diskEntries = view.getUint16(eocdOffset + 8, true);
  const entries = view.getUint16(eocdOffset + 10, true);
  const centralBytes = view.getUint32(eocdOffset + 12, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);
  if (
    disk !== 0 ||
    centralDisk !== 0 ||
    diskEntries !== entries ||
    entries === 0 ||
    entries === 0xffff ||
    entries > MAX_DOCX_ENTRIES ||
    centralBytes === 0xffffffff ||
    centralOffset === 0xffffffff ||
    centralOffset + centralBytes !== eocdOffset
  ) {
    throw new BoundedFileReadError("read_failed");
  }

  const ranges: Array<{ start: number; end: number }> = [];
  const docxEntries: DocxEntry[] = [];
  let totalUncompressed = 0;
  let cursor = centralOffset;
  for (let index = 0; index < entries; index++) {
    requireRange(cursor, 46, eocdOffset);
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new BoundedFileReadError("read_failed");
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const compressedBytes = view.getUint32(cursor + 20, true);
    const uncompressedBytes = view.getUint32(cursor + 24, true);
    const nameBytes = view.getUint16(cursor + 28, true);
    const extraBytes = view.getUint16(cursor + 30, true);
    const commentBytes = view.getUint16(cursor + 32, true);
    const startDisk = view.getUint16(cursor + 34, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const entryEnd = cursor + 46 + nameBytes + extraBytes + commentBytes;
    requireRange(cursor, 46 + nameBytes + extraBytes + commentBytes, eocdOffset);
    if (
      (flags & 0x41) !== 0 ||
      (method !== 0 && method !== 8) ||
      compressedBytes === 0xffffffff ||
      uncompressedBytes === 0xffffffff ||
      startDisk !== 0 ||
      localOffset === 0xffffffff ||
      uncompressedBytes > MAX_DOCX_ENTRY_UNCOMPRESSED_BYTES ||
      (compressedBytes === 0 ? uncompressedBytes > 0 : uncompressedBytes / compressedBytes > MAX_DOCX_COMPRESSION_RATIO) ||
      (method === 0 && compressedBytes !== uncompressedBytes)
    ) {
      throw new BoundedFileReadError("read_failed");
    }
    totalUncompressed += uncompressedBytes;
    if (totalUncompressed > MAX_DOCX_TOTAL_UNCOMPRESSED_BYTES) throw new BoundedFileReadError("read_failed");
    assertNoZip64Extra(view, cursor + 46 + nameBytes, extraBytes);

    requireRange(localOffset, 30, centralOffset);
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new BoundedFileReadError("read_failed");
    const localFlags = view.getUint16(localOffset + 6, true);
    const localMethod = view.getUint16(localOffset + 8, true);
    const localCompressedBytes = view.getUint32(localOffset + 18, true);
    const localUncompressedBytes = view.getUint32(localOffset + 22, true);
    const localNameBytes = view.getUint16(localOffset + 26, true);
    const localExtraBytes = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameBytes + localExtraBytes;
    requireRange(localOffset, 30 + localNameBytes + localExtraBytes + compressedBytes, centralOffset);
    if (
      localFlags !== flags ||
      localMethod !== method ||
      localNameBytes !== nameBytes ||
      ((flags & 0x08) === 0 &&
        (localCompressedBytes !== compressedBytes || localUncompressedBytes !== uncompressedBytes))
    ) {
      throw new BoundedFileReadError("read_failed");
    }
    assertNoZip64Extra(view, localOffset + 30 + localNameBytes, localExtraBytes);
    for (let byte = 0; byte < nameBytes; byte++) {
      if (view.getUint8(localOffset + 30 + byte) !== view.getUint8(cursor + 46 + byte)) {
        throw new BoundedFileReadError("read_failed");
      }
    }
    ranges.push({ start: localOffset, end: dataOffset + compressedBytes });
    docxEntries.push({ method, compressedBytes, uncompressedBytes, dataOffset });
    cursor = entryEnd;
  }
  if (cursor !== eocdOffset) throw new BoundedFileReadError("read_failed");
  ranges.sort((left, right) => left.start - right.start);
  for (let index = 1; index < ranges.length; index++) {
    if (ranges[index].start < ranges[index - 1].end) throw new BoundedFileReadError("read_failed");
  }
  await verifyDocxEntrySizes(bytes, docxEntries, deadline);
}

async function verifyDocxEntrySizes(
  bytes: Uint8Array,
  entries: readonly DocxEntry[],
  deadline: ExtractionDeadline,
): Promise<void> {
  let actualTotal = 0;
  for (const entry of entries) {
    if (deadline.signal.aborted) throw new BoundedFileReadError("aborted");
    const actualBytes =
      entry.method === 0
        ? entry.compressedBytes
        : await countInflatedBytes(
            bytes.subarray(entry.dataOffset, entry.dataOffset + entry.compressedBytes),
            entry.uncompressedBytes,
            MAX_DOCX_TOTAL_UNCOMPRESSED_BYTES - actualTotal,
            deadline,
          );
    if (actualBytes !== entry.uncompressedBytes || actualBytes > MAX_DOCX_ENTRY_UNCOMPRESSED_BYTES) {
      throw new BoundedFileReadError("read_failed");
    }
    actualTotal += actualBytes;
    if (actualTotal > MAX_DOCX_TOTAL_UNCOMPRESSED_BYTES) throw new BoundedFileReadError("read_failed");
  }
}

async function countInflatedBytes(
  compressed: Uint8Array,
  declaredBytes: number,
  aggregateRemainingBytes: number,
  deadline: ExtractionDeadline,
): Promise<number> {
  const DecompressionStreamCtor = globalThis.DecompressionStream as unknown as
    | (new (format: string) => TransformStream<Uint8Array, Uint8Array>)
    | undefined;
  if (typeof DecompressionStreamCtor !== "function" || typeof globalThis.ReadableStream !== "function") {
    throw new BoundedFileReadError("read_failed");
  }

  let stream: ReadableStream<Uint8Array>;
  try {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(compressed);
        controller.close();
      },
    });
    stream = source.pipeThrough(new DecompressionStreamCtor("deflate-raw"));
  } catch {
    throw new BoundedFileReadError("read_failed");
  }

  const reader = stream.getReader();
  const cancel = deadline.registerCleanup(() => reader.cancel());
  let actualBytes = 0;
  try {
    while (true) {
      if (deadline.signal.aborted) throw new BoundedFileReadError("aborted");
      const result = await reader.read();
      if (result.done) break;
      const chunk = result.value;
      if (!(chunk instanceof Uint8Array)) throw new BoundedFileReadError("read_failed");
      const cap = Math.min(declaredBytes, MAX_DOCX_ENTRY_UNCOMPRESSED_BYTES, aggregateRemainingBytes);
      if (chunk.byteLength > cap - actualBytes) throw new BoundedFileReadError("read_failed");
      actualBytes += chunk.byteLength;
    }
    return actualBytes;
  } catch {
    throw new BoundedFileReadError("read_failed");
  } finally {
    await cancel();
    try {
      reader.releaseLock();
    } catch {
      // A deadline may have already cancelled the reader.
    }
  }
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimum = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let offset = view.byteLength - 22; offset >= minimum; offset--) {
    if (view.getUint32(offset, true) !== 0x06054b50) continue;
    const commentBytes = view.getUint16(offset + 20, true);
    if (offset + 22 + commentBytes === view.byteLength) return offset;
  }
  throw new BoundedFileReadError("read_failed");
}

function assertNoZip64Extra(view: DataView, offset: number, length: number): void {
  const end = offset + length;
  requireRange(offset, length, view.byteLength);
  while (offset < end) {
    requireRange(offset, 4, end);
    const kind = view.getUint16(offset, true);
    const dataBytes = view.getUint16(offset + 2, true);
    offset += 4;
    requireRange(offset, dataBytes, end);
    if (kind === 0x0001) throw new BoundedFileReadError("read_failed");
    offset += dataBytes;
  }
}

function requireRange(offset: number, length: number, limit: number): void {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset > limit ||
    length > limit - offset
  ) {
    throw new BoundedFileReadError("read_failed");
  }
}
