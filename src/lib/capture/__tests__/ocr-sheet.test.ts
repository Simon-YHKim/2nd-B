// 메모 OCR popup (2026-09-30): the pure rules, and the source contract that the
// popup reuses the existing paid OCR path and runs it only on an explicit tap.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { LlmConsentError } from "../../llm/boundary";
import {
  IMAGE_OCR_CRISIS_RESULT_ERROR,
  IMAGE_OCR_EMPTY_RESULT_ERROR,
  IMAGE_OCR_INVALID_DATA_ERROR,
  IMAGE_OCR_MISSING_DATA_ERROR,
  IMAGE_OCR_TOO_LARGE_ERROR,
  IMAGE_OCR_UNSUPPORTED_TYPE_ERROR,
} from "../../wiki/capture-image";
import { classifyOcrFailure, insertOcrText, ocrInsertTarget } from "../ocr-sheet";

const read = (rel: string): string => readFileSync(join(process.cwd(), rel), "utf8");

describe("classifyOcrFailure", () => {
  test("a crisis result goes to the hotline, not to a photo-quality message", () => {
    expect(classifyOcrFailure(new Error(IMAGE_OCR_CRISIS_RESULT_ERROR))).toEqual({ kind: "crisis" });
  });

  test("a consent refusal from the proxy keeps its code for the consent link", () => {
    expect(classifyOcrFailure(new LlmConsentError("consent_required"))).toEqual({
      kind: "consent",
      code: "consent_required",
    });
    expect(classifyOcrFailure(new LlmConsentError("consent_check_unavailable"))).toEqual({
      kind: "consent",
      code: "consent_check_unavailable",
    });
  });

  test("only failures a second paid call could fix offer a retry", () => {
    expect(classifyOcrFailure(new Error(IMAGE_OCR_EMPTY_RESULT_ERROR))).toEqual({
      kind: "message", copy: "ocrEmptyResult", retry: true,
    });
    expect(classifyOcrFailure(new Error("network down"))).toEqual({
      kind: "message", copy: "ocrRead", retry: true,
    });
    for (const [code, copy] of [
      [IMAGE_OCR_TOO_LARGE_ERROR, "ocrTooLarge"],
      [IMAGE_OCR_UNSUPPORTED_TYPE_ERROR, "ocrUnsupportedType"],
      [IMAGE_OCR_MISSING_DATA_ERROR, "ocrMissingData"],
      [IMAGE_OCR_INVALID_DATA_ERROR, "ocrInvalidData"],
    ] as const) {
      expect(classifyOcrFailure(new Error(code))).toEqual({ kind: "message", copy, retry: false });
    }
  });

  test("every message copy exists in all five locales", () => {
    for (const locale of ["en", "ko", "es", "pt", "id"]) {
      const alerts = (JSON.parse(read(`locales/${locale}/capture.json`)) as {
        alerts: Record<string, { message?: string }>;
      }).alerts;
      for (const copy of ["ocrEmptyResult", "ocrTooLarge", "ocrUnsupportedType", "ocrMissingData", "ocrInvalidData", "ocrRead"]) {
        expect(alerts[copy]?.message).toEqual(expect.any(String));
      }
    }
  });
});

describe("inserting the OCR text", () => {
  test("toggle off goes to the memo body, toggle on to 무엇을", () => {
    expect(ocrInsertTarget(false)).toBe("memo");
    expect(ocrInsertTarget(true)).toBe("what");
  });

  test("appends after a blank line, fills an empty field, and ignores blank text", () => {
    expect(insertOcrText("", "  read text  ")).toBe("read text");
    expect(insertOcrText("   ", "read text")).toBe("read text");
    expect(insertOcrText("my note  ", "read text")).toBe("my note\n\nread text");
    expect(insertOcrText("my note", "   ")).toBe("my note");
  });
});

describe("the popup reuses the existing OCR path, on an explicit tap only", () => {
  const views = read("src/components/deep-space/DeepSpaceViews.tsx");
  const capture = views.slice(views.indexOf("export function CaptureView"), views.indexOf("// ── 세컨비 / Chat"));
  const lib = read("src/lib/wiki/capture-image.ts");

  test("ocrImageAsset is the capture_ocr callLlm path (C1 boundary)", () => {
    const ocr = lib.slice(lib.indexOf("export async function ocrImageAsset"));
    expect(ocr).toContain("await callLlm({");
    expect(ocr).toContain('purpose: "capture_ocr"');
  });

  test("the only OCR call runs from the picked photo, bound to a fresh account lease", () => {
    expect(capture.split("ocrImageAsset(").length - 1).toBe(1);
    const read = capture.slice(capture.indexOf("const readOcrImage"), capture.indexOf("const pickOcrImage"));
    expect(read).toContain("beginAccountSessionLease(userId)");
    expect(read).toContain("await lease.authenticate()");
    expect(read).toContain("ocrImageAsset(authenticated, locale, image, isMinor === true)");
    // Reached from a picked photo (the OCR tap), or from the popup's retry.
    const pick = capture.slice(capture.indexOf("const pickOcrImage"), capture.indexOf("function closeOcr"));
    expect(pick).toContain('await pickImageAsset("library")');
    expect(pick.indexOf("await pickImageAsset")).toBeLessThan(pick.indexOf("void readOcrImage(picked)"));
    expect(capture.split("readOcrImage(").length - 1).toBe(2); // after the pick, and the popup retry
    expect(capture).toContain("if (ocrImageRef.current) void readOcrImage(ocrImageRef.current);");
    expect(capture).toContain("onPress={() => void pickOcrImage()}");
  });

  test("closing abandons the call and never attaches the OCR image to the memo", () => {
    const close = capture.slice(capture.indexOf("function closeOcr"), capture.indexOf("const insertOcr"));
    expect(close).toContain("ocrLeaseRef.current?.abort()");
    expect(close).toContain("replaceOcrImage(null)");
    const insert = capture.slice(capture.indexOf("const insertOcr"), capture.indexOf("async function savePiece"));
    expect(insert).not.toContain("photosRef");
    expect(insert).not.toContain("setPhotos");
  });

  test("a crisis result closes the popup and shows the hotline", () => {
    const read = capture.slice(capture.indexOf("const readOcrImage"), capture.indexOf("const pickOcrImage"));
    expect(read).toMatch(/failure\.kind === "crisis"[\s\S]{0,200}closeOcr\(\)[\s\S]{0,200}setCrisis\(\{ visible: true/);
  });

  test("the popup is a no-motion modal that Android back closes", () => {
    const sheet = read("src/components/deep-space/CaptureOcrSheet.tsx");
    expect(sheet).toContain('animationType="none"');
    expect(sheet).toContain("onRequestClose={onClose}");
    expect(sheet).toContain("<PixelScrim />");
    expect(sheet).toContain("<ServiceConsentLink />");
  });
});
