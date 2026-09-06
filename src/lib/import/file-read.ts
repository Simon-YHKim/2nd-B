// Text-file picker for the import hub. On web it opens a native file dialog
// (hidden <input type="file">) and reads the file in bounded chunks. On native
// (iOS/Android) it asks expo-document-picker for a local cache copy and removes
// only a copy whose app-cache ownership is verified. Either way: no upload, the
// raw file never leaves the device before parse. The parsed text feeds the same
// on-device detect -> parse -> propose -> ratify pipeline.

import {
  BoundedFileReadError,
  fetchBoundedLocalUtf8,
  readBoundedUtf8Blob,
} from "./bounded-file-read";
import { leaseOwnedTempFile, type OwnedTempFileLease } from "../storage/owned-temp";

export interface PickedFile {
  name: string;
  text: string;
}

/** Accept hint for the web OS dialog — text-ish exports the parsers understand. */
const ACCEPT = ".txt,.csv,.ics,.eml,.md,.markdown,.json,.xml,text/*,application/json";

/** Native getDocumentAsync MIME filter — the same text-ish categories as ACCEPT. */
const NATIVE_ACCEPT_MIME = [
  "text/*", // .txt, .csv, .md, .xml (text/*)
  "application/json",
  "application/xml",
  "text/calendar", // .ics
  "message/rfc822", // .eml
  "text/markdown",
  "text/csv",
];

/** Web: hidden <input type="file"> + Blob reads are available. */
function webPickerSupported(): boolean {
  return typeof document !== "undefined" && typeof Blob !== "undefined";
}

/**
 * Native (RN runtime) where expo-document-picker is bundled. Detected via
 * navigator.product so this module never imports react-native and stays loadable
 * in the node test env (same native check as src/app/_layout.tsx).
 */
function nativePickerSupported(): boolean {
  const nav = globalThis.navigator as { product?: string } | undefined;
  return nav?.product === "ReactNative";
}

/** True when file import works on this platform (web dialog or native picker). */
export function fileImportSupported(): boolean {
  return webPickerSupported() || nativePickerSupported();
}

/**
 * Opens the platform file picker and reads the chosen file as text. Resolves
 * null when unsupported (neither web nor native) or when the user cancels.
 * Rejects only on an actual read error so the caller can show the error state.
 * Same contract on web and native: Promise<{ name, text } | null>.
 */
export function pickTextFile(): Promise<PickedFile | null> {
  if (webPickerSupported()) return pickWebTextFile();
  if (nativePickerSupported()) return pickNativeTextFile();
  return Promise.resolve(null);
}

/**
 * Native branch. expo-document-picker is imported lazily so the web/node bundle
 * never loads the native dep (and react-native through it) at module eval. The
 * picker is asked for an app-cache copy, which is leased before a bounded local-
 * only read and disposed afterward. Provider/original URIs are still readable
 * but never deletion-owned. A read failure rejects; text stays in memory and is
 * never stored or uploaded.
 */
async function pickNativeTextFile(): Promise<PickedFile | null> {
  try {
    const DocumentPicker = await import("expo-document-picker");
    const res = await DocumentPicker.getDocumentAsync({
      type: NATIVE_ACCEPT_MIME,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled) return null;
    const asset = res.assets?.[0];
    if (!asset) return null;

    let cacheCopyLease: OwnedTempFileLease | null = null;
    try {
      const leaseResult = await leaseOwnedTempFile(asset.uri);
      if (leaseResult.ok) cacheCopyLease = leaseResult.lease;
    } catch {
      // Ownership cleanup is best-effort and must not block a safe bounded read.
    }

    try {
      const text = await fetchBoundedLocalUtf8(asset.uri, { declaredBytes: asset.size });
      return { name: asset.name, text };
    } finally {
      try {
        await cacheCopyLease?.dispose();
      } catch {
        // Never replace the import result/error or expose native path details.
      }
    }
  } catch (error) {
    if (error instanceof BoundedFileReadError) throw error;
    throw new BoundedFileReadError("read_failed");
  }
}

/**
 * Web branch. Opens the browser file dialog and reads the chosen file as text.
 * Resolves null when the user cancels. Rejects when the selected bytes cannot be
 * read within the bounded UTF-8 contract.
 */
function pickWebTextFile(): Promise<PickedFile | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPT;
    input.style.display = "none";
    let settled = false;
    const cleanup = () => {
      if (input.parentNode) input.parentNode.removeChild(input);
    };
    input.onchange = () => {
      // The dialog closed (file chosen or not). Either way the cancel fallback
      // must stand down now — a large export can take >300ms to read, and the
      // focus timer would otherwise resolve null mid-read and drop a valid file.
      settled = true;
      const file = input.files && input.files[0];
      if (!file) {
        cleanup();
        resolve(null);
        return;
      }
      void readBoundedUtf8Blob(file).then(
        (text) => {
          settled = true;
          cleanup();
          resolve({ name: file.name, text });
        },
        (error: unknown) => {
          settled = true;
          cleanup();
          reject(error);
        },
      );
    };
    // Cancel leaves onchange unfired; resolve null on the next tick after focus.
    const onFocus = () => {
      window.setTimeout(() => {
        if (!settled) {
          cleanup();
          resolve(null);
        }
        window.removeEventListener("focus", onFocus);
      }, 300);
    };
    window.addEventListener("focus", onFocus);
    document.body.appendChild(input);
    input.click();
  });
}
