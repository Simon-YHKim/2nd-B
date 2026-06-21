// Text-file picker for the import hub. On web it opens a native file dialog
// (hidden <input type="file">) and reads the file as text in the browser. On
// native (iOS/Android) it picks via expo-document-picker and reads the file://
// cache copy with fetch().text() — the same read path as src/lib/wiki/
// capture-file.ts. Either way: no upload, nothing is stored, the raw file never
// leaves the device before parse. The parsed text feeds the same on-device
// detect -> parse -> propose -> ratify pipeline; the raw file is never persisted.

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

/** Web: hidden <input type="file"> + FileReader are available. */
function webPickerSupported(): boolean {
  return typeof document !== "undefined" && typeof FileReader !== "undefined";
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
 * chosen file is copied into the app cache and read as text via fetch(); a read
 * failure rejects. The text stays in memory and is never stored or uploaded.
 */
async function pickNativeTextFile(): Promise<PickedFile | null> {
  const DocumentPicker = await import("expo-document-picker");
  const res = await DocumentPicker.getDocumentAsync({
    type: NATIVE_ACCEPT_MIME,
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled) return null;
  const asset = res.assets?.[0];
  if (!asset) return null;
  const response = await fetch(asset.uri);
  const text = await response.text();
  return { name: asset.name, text };
}

/**
 * Web branch. Opens the browser file dialog and reads the chosen file as text.
 * Resolves null when the user cancels. Best-effort: rejects only on an actual
 * read error.
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
      const reader = new FileReader();
      reader.onload = () => {
        settled = true;
        cleanup();
        resolve({ name: file.name, text: typeof reader.result === "string" ? reader.result : "" });
      };
      reader.onerror = () => {
        settled = true;
        cleanup();
        reject(reader.error ?? new Error("file read failed"));
      };
      reader.readAsText(file);
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
