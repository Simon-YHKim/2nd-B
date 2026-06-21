// Web-safe text-file picker for the import hub. On web it opens a native file
// dialog (hidden <input type="file">) and reads the file as text in the browser
// — no upload, no new dependency, nothing leaves the device before parse. On
// native it resolves null (real native file picking needs an EAS-gated dep, so
// the hub keeps the paste path there). The parsed text feeds the same on-device
// detect → parse → propose → ratify pipeline; the raw file is never stored.

export interface PickedFile {
  name: string;
  text: string;
}

/** Accept hint for the OS dialog — text-ish exports the parsers understand. */
const ACCEPT = ".txt,.csv,.ics,.eml,.md,.markdown,.json,.xml,text/*,application/json";

/** Guard: web only. Avoids referencing `document` on native bundles. */
export function fileImportSupported(): boolean {
  return typeof document !== "undefined" && typeof FileReader !== "undefined";
}

/**
 * Opens the browser file dialog and reads the chosen file as text. Resolves null
 * when unsupported (native) or when the user cancels. Best-effort: rejects only
 * on an actual read error so the caller can show the error state.
 */
export function pickTextFile(): Promise<PickedFile | null> {
  if (!fileImportSupported()) return Promise.resolve(null);
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
