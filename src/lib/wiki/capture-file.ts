// File picker for capture flow.
//
// 2026-05-27 scope: the user wants to drop PDFs, docs, and emails into
// Wiki. Phase 1 (PR #32) accepted text MIMEs only and let the LLM classify
// whatever the user pasted. PDF and DOCX remain metadata-only attachments:
// their compressed parsers cannot be cancelled within a reliable heap ceiling.
//
// Unsupported binary formats leave textContent null so the app can retain
// filename + MIME metadata.

import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";

import {
  BoundedFileReadError,
  fetchBoundedLocalUtf8WithMetadata,
  type BoundedUtf8ReadResult,
} from "../import/bounded-file-read";
import {
  leaseOwnedTempFile,
  type OwnedTempFileLease,
  type OwnedTempLeaseError,
} from "../storage/owned-temp";

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  /** UTF-8 text read from the file. Null when extraction is unsupported or failed. */
  textContent: string | null;
}

const pickedFileLeases = new WeakMap<PickedFile, OwnedTempFileLease>();
const pickedFileReleases = new WeakMap<PickedFile, Promise<void>>();

function safeCleanupFailureReason(
  reason: unknown,
): OwnedTempLeaseError | "unexpected_failure" {
  switch (reason) {
    case "unsupported_runtime":
    case "filesystem_unavailable":
    case "unsafe_target":
    case "not_a_file":
    case "inspect_failed":
    case "target_changed":
    case "delete_failed":
    case "verification_failed":
      return reason;
    default:
      return "unexpected_failure";
  }
}

function warnCacheCopyCleanupFailure(reason: unknown): void {
  if (typeof console !== "undefined") {
    console.warn("[capture-file] cache copy cleanup failed", {
      reason: safeCleanupFailureReason(reason),
    });
  }
}

async function acquireCacheCopyLease(uri: string): Promise<OwnedTempFileLease | null> {
  try {
    const result = await leaseOwnedTempFile(uri);
    return result.ok ? result.lease : null;
  } catch {
    return null;
  }
}

async function disposeCacheCopyLease(lease: OwnedTempFileLease | null): Promise<void> {
  if (!lease) return;
  try {
    const result = await lease.dispose();
    if (!result.ok) warnCacheCopyCleanupFailure(result.error);
  } catch {
    warnCacheCopyCleanupFailure("unexpected_failure");
  }
}

/** Releases only the verified app-cache copy associated with this picker result. */
export function releasePickedFile(file: PickedFile | null | undefined): Promise<void> {
  if (!file) return Promise.resolve();
  const pending = pickedFileReleases.get(file);
  if (pending) return pending;

  const lease = pickedFileLeases.get(file) ?? null;
  pickedFileLeases.delete(file);
  const release = disposeCacheCopyLease(lease);
  pickedFileReleases.set(file, release);
  return release;
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
export const MAX_IMPORT_FILE_COUNT = 64;
export const MAX_IMPORT_TOTAL_BYTES = MAX_EXTRACT_BYTES * 2;
export const MAX_IMPORT_TOTAL_TEXT_CHARS = 500_000;

interface ExtractionDeadline {
  signal: AbortSignal;
  deadlineAtMs: number;
}

function runWithExtractionDeadline<T>(
  operation: (deadline: ExtractionDeadline) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const deadlineAtMs = Date.now() + FILE_EXTRACTION_TIMEOUT_MS;
  const deadline: ExtractionDeadline = {
    signal: controller.signal,
    deadlineAtMs,
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
      finish({ error: new BoundedFileReadError("timed_out") });
    }, FILE_EXTRACTION_TIMEOUT_MS);

    Promise.resolve()
      .then(() => operation(deadline))
      .then(
        (value) => finish({ value }),
        (error: unknown) => finish({ error }),
      );
  });
}

export function normalizeFileMimeType(
  mimeType: string | null | undefined,
  fileName?: string | null,
): string {
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
    base64: false,
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled) return null;
  const asset = res.assets?.[0];
  if (!asset) return null;

  let lease = await acquireCacheCopyLease(asset.uri);
  try {
    const mimeType = normalizeFileMimeType(asset.mimeType, asset.name);
    const size = asset.size ?? 0;
    const text = await extractText(asset.uri, mimeType, size);
    const pickedFile: PickedFile = {
      uri: asset.uri,
      name: asset.name,
      mimeType,
      size,
      textContent: text,
    };
    if (lease) {
      pickedFileLeases.set(pickedFile, lease);
      lease = null;
    }
    return pickedFile;
  } finally {
    await disposeCacheCopyLease(lease);
  }
}

/**
 * Pick one audio file that already exists on the device.
 *
 * This deliberately has a narrower picker contract than pickFile(): callers
 * such as /call-reflection must never fall back to a document metadata stub or
 * imply that the app can record the call itself. DocumentPicker may return an
 * app-owned cache copy; callers must release it with releasePickedFile(). The
 * provider/original file remains outside the verified deletion boundary.
 */
export async function pickAudioFile(): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: "audio/*",
    base64: false,
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled) return null;
  const asset = res.assets?.[0];
  if (!asset) return null;

  let lease = await acquireCacheCopyLease(asset.uri);
  try {
    const pickedFile: PickedFile = {
      uri: asset.uri,
      name: asset.name,
      mimeType: normalizeFileMimeType(asset.mimeType, asset.name),
      size: asset.size ?? 0,
      textContent: null,
    };
    if (lease) {
      pickedFileLeases.set(pickedFile, lease);
      lease = null;
    }
    return pickedFile;
  } finally {
    await disposeCacheCopyLease(lease);
  }
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
    base64: false,
    copyToCacheDirectory: true,
    multiple: true,
  });
  if (res.canceled) return [];
  const assets = res.assets ?? [];
  // A malformed/oversized picker result must not turn cleanup into unbounded
  // filesystem work. Prove ownership only for the same bounded prefix the
  // importer accepts; any excess remains OS-cache managed and is never guessed
  // from a provider/original URI.
  const cleanupAssetCount = Math.min(assets.length, MAX_IMPORT_FILE_COUNT);
  const leases = await Promise.all(
    Array.from({ length: cleanupAssetCount }, (_, index) =>
      acquireCacheCopyLease(assets[index].uri),
    ),
  );

  const out: PickedImportFile[] = [];
  try {
    if (assets.length > MAX_IMPORT_FILE_COUNT || !hasSafeDeclaredImportSize(assets)) return [];
    return await runWithExtractionDeadline(async (deadline) => {
      let actualBytes = 0;
      let outputChars = 0;
      for (const asset of assets) {
        const mimeType = normalizeFileMimeType(asset.mimeType, asset.name);
        if (!TEXT_MIMES.has(mimeType)) continue;
        const remainingBytes = MAX_IMPORT_TOTAL_BYTES - actualBytes;
        if (remainingBytes <= 0) break;

        let extracted: BoundedUtf8ReadResult;
        try {
          extracted = await readPickedText(
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
        actualBytes += extracted.bytesRead;

        let text: string;
        try {
          text = normalizeFileTextResult(extracted.text).trim();
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
  } finally {
    await Promise.all(leases.map((lease) => disposeCacheCopyLease(lease)));
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
export async function extractText(
  uri: string,
  mimeType: string,
  size: number,
): Promise<string | null> {
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_EXTRACT_BYTES) return null;
  const normalizedMimeType = normalizeFileMimeType(mimeType);
  // Audio has no text to extract — the caller sends it to transcribeAudio. This
  // returns null EXPLICITLY rather than falling through, so nobody later reads
  // an m4a with res.text() and stores mojibake as the user's note.
  if (AUDIO_MIMES.has(normalizedMimeType)) return null;
  // Compressed document streams can expand far beyond the selected file size,
  // and the current parsers cannot be terminated. Keep attachment metadata but
  // never fetch or start a PDF/DOCX parser.
  if (PDF_MIMES.has(normalizedMimeType) || DOCX_MIMES.has(normalizedMimeType)) return null;

  try {
    return await runWithExtractionDeadline(async (deadline) => {
      if (TEXT_MIMES.has(normalizedMimeType)) {
        const extracted = await readPickedText(uri, size, MAX_EXTRACT_BYTES, deadline);
        return normalizeFileTextResult(extracted.text);
      }
      return null;
    });
  } catch {
    return null;
  }
}

async function readPickedText(
  uri: string,
  size: number,
  maxBytes: number,
  deadline?: ExtractionDeadline,
): Promise<BoundedUtf8ReadResult> {
  if (!Number.isSafeInteger(size) || size < 0) throw new BoundedFileReadError("invalid_size");
  return fetchBoundedLocalUtf8WithMetadata(uri, {
    allowWebBlob: Platform.OS === "web",
    deadlineAtMs: deadline?.deadlineAtMs,
    declaredBytes: size === 0 ? null : size,
    maxBytes,
    signal: deadline?.signal,
  });
}
