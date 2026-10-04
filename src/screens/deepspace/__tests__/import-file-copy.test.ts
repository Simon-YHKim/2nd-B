// /import "from files" panel: the copy must describe what the panel can do.
//
// QA 261004 D-16: the panel said "Drop a file here or choose one" on every
// platform, but no drop handler exists anywhere in src (onDrop / dragover /
// dataTransfer: 0). The only working path is the button -> pickImportFiles
// (DocumentPicker). Its extension hint also listed .zip and .csv, which the
// picker's MIME list does not accept, and left out .html, which it does.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const SCREEN = join(ROOT, "src", "screens", "deepspace", "dds-import-inbox-screens.tsx");
const PICKER = join(ROOT, "src", "lib", "wiki", "capture-file.ts");
const LOCALES = ["en", "ko", "es", "pt", "id"] as const;

/** What each extension in the hint means to the picker. */
const EXT_MIME: Record<string, string> = {
  json: "application/json",
  txt: "text/plain",
  md: "text/markdown",
  html: "text/html",
  csv: "text/csv",
  zip: "application/zip",
};

function pickerMimes(): string[] {
  const src = readFileSync(PICKER, "utf8");
  const start = src.indexOf("export async function pickImportFiles");
  expect(start).toBeGreaterThan(-1);
  const list = /type:\s*\[([^\]]+)\]/.exec(src.slice(start))?.[1] ?? "";
  return [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("/import file panel copy matches what the panel does", () => {
  const screen = readFileSync(SCREEN, "utf8");

  test("no locale promises drag and drop while no drop handler exists", () => {
    expect(screen).not.toMatch(/onDrop|dragover|dataTransfer/);
    const dropWords = /\bdrop\b|놓거나|놓으|suelta|solte|letakkan/i;
    for (const locale of LOCALES) {
      const bundle = JSON.parse(
        readFileSync(join(ROOT, "locales", locale, "deepspace.json"), "utf8"),
      ) as { ds: { import: Record<string, string> } };
      const title = bundle.ds.import.dropTitle;
      expect({ locale, promisesDrop: dropWords.test(title) }).toEqual({ locale, promisesDrop: false });
    }
  });

  test("the extension hint lists only types the picker accepts", () => {
    const hint = /s\.dropExt\]\}>([^<]+)</.exec(screen)?.[1] ?? "";
    const exts = [...hint.matchAll(/\.([a-z0-9]+)/g)].map((m) => m[1]);
    expect(exts.length).toBeGreaterThan(0);
    const accepted = pickerMimes();
    expect(accepted.length).toBeGreaterThan(0);
    const unaccepted = exts.filter((ext) => !accepted.includes(EXT_MIME[ext] ?? `unknown:${ext}`));
    expect(unaccepted).toEqual([]);
  });
});
