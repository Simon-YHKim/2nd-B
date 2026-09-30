// Which `/capture?mode=` values still open the full intake (2026-09-30).
//
// The simple screen lost its 사진 and 음성 tiles. Links that name those modes
// land on 글 there; every other known mode keeps opening the full intake, and
// the full intake itself (/capture-full) keeps OCR and dictation.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CAPTURE_MODES,
  CAPTURE_VIEW_TEXT_ENTRY_MODES,
  captureModeOpensFullIntake,
} from "../draft";

describe("captureModeOpensFullIntake", () => {
  test("ocr and voice land on the simple screen's 글", () => {
    expect(CAPTURE_VIEW_TEXT_ENTRY_MODES).toEqual(["ocr", "voice"]);
    expect(captureModeOpensFullIntake("ocr")).toBe(false);
    expect(captureModeOpensFullIntake("voice")).toBe(false);
  });

  test("every other known mode still opens the full intake", () => {
    const others = CAPTURE_MODES.filter((mode) => mode !== "ocr" && mode !== "voice");
    expect(others).toEqual(["journal", "memo", "fourw", "linkclip", "todo", "file"]);
    for (const mode of others) expect(captureModeOpensFullIntake(mode)).toBe(true);
  });

  test("unknown or missing values open nothing, as before", () => {
    for (const value of [undefined, null, "", "photo", "link", "OCR", 3]) {
      expect(captureModeOpensFullIntake(value)).toBe(false);
    }
  });

  test("the OCR and dictation modes are still part of the full intake", () => {
    expect(CAPTURE_MODES).toContain("ocr");
    expect(CAPTURE_MODES).toContain("voice");
  });

  test("/capture decides with this rule, and share/tag/first-run still win", () => {
    const route = readFileSync(join(process.cwd(), "src", "app", "capture.tsx"), "utf8");
    const wrapper = route.split("export function CaptureLegacy")[0] ?? "";
    expect(wrapper).toContain("captureModeOpensFullIntake(captureParams.mode)");
    expect(wrapper).toContain("normalizeSharedCaptureParams({");
    expect(wrapper).toContain("captureParams.tag.trim().length > 0");
    expect(wrapper).toContain('captureParams.entry === "firstRun"');
  });

  test("the share target still cannot carry an image, so no photo arrives by that door", () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), "public", "manifest.webmanifest"), "utf8"),
    ) as { share_target?: { method?: string; params?: Record<string, unknown> } };
    expect(manifest.share_target?.method).toBe("GET");
    expect(Object.keys(manifest.share_target?.params ?? {}).sort()).toEqual(["text", "title", "url"]);
  });
});
