// 메모 OCR popup (Simon 2026-09-30: "ocr을 누르면 팝업이 하나 뜨며, 그 안에는
// 이미지와 text 박스로 구성된 ui가 있고, text box에 ocr한 결과물을 띄운다").
//
// The popup reuses the existing OCR path unchanged: pickImageAsset() and
// ocrImageAsset() in lib/wiki/capture-image.ts, which calls callLlm with
// purpose "capture_ocr" (C1 single boundary, C3 audit row, C9 classification
// and the output-side crisis swap; the proxy enforces the service consent).
// It is a paid call, so it runs only after the user tapped OCR and picked a
// photo, never on its own.
//
// The OCR'd image is NOT attached to the memo. OCR is text extraction; the
// separate 사진 첨부 button attaches photos.
//
// Pure: the error classification and the insert rules are tested without a render.

import { LlmConsentError, type LlmConsentErrorCode } from "../llm/boundary";
import {
  isImageOcrCrisisResultError,
  isImageOcrEmptyResultError,
  isImageOcrInvalidDataError,
  isImageOcrMissingDataError,
  isImageOcrTooLargeError,
  isImageOcrUnsupportedTypeError,
} from "../wiki/capture-image";

export type OcrSheetPhase = "reading" | "ready" | "error";

/** Manual corrections remain usable after OCR fails; only an in-flight read blocks insertion. */
export function canInsertOcrText(phase: OcrSheetPhase, text: string): boolean {
  return phase !== "reading" && text.trim().length > 0;
}

/** Which existing `capture:alerts.*` copy explains the failure. */
export type OcrFailureCopy =
  | "ocrEmptyResult"
  | "ocrTooLarge"
  | "ocrUnsupportedType"
  | "ocrMissingData"
  | "ocrInvalidData"
  | "ocrRead";

export type OcrFailure =
  | { kind: "crisis" }
  | { kind: "consent"; code: LlmConsentErrorCode }
  | { kind: "message"; copy: OcrFailureCopy; retry: boolean };

/**
 * Same split as the full composer's runExtract (capture.tsx): a crisis result
 * goes to the hotline, never to a "try a clearer photo" message; failures that
 * the same image will always hit offer no retry (a retry would be another paid
 * call that cannot succeed).
 */
export function classifyOcrFailure(error: unknown): OcrFailure {
  if (isImageOcrCrisisResultError(error)) return { kind: "crisis" };
  if (error instanceof LlmConsentError) return { kind: "consent", code: error.code };
  if (isImageOcrEmptyResultError(error)) return { kind: "message", copy: "ocrEmptyResult", retry: true };
  if (isImageOcrTooLargeError(error)) return { kind: "message", copy: "ocrTooLarge", retry: false };
  if (isImageOcrUnsupportedTypeError(error)) return { kind: "message", copy: "ocrUnsupportedType", retry: false };
  if (isImageOcrMissingDataError(error)) return { kind: "message", copy: "ocrMissingData", retry: false };
  if (isImageOcrInvalidDataError(error)) return { kind: "message", copy: "ocrInvalidData", retry: false };
  return { kind: "message", copy: "ocrRead", retry: true };
}

/**
 * Where "메모에 넣기" puts the text: the memo body when the 4W1H toggle is off,
 * the 무엇을 field (the required one) when it is on.
 */
export type OcrInsertTarget = "memo" | "what";

export function ocrInsertTarget(fourwOn: boolean): OcrInsertTarget {
  return fourwOn ? "what" : "memo";
}

/**
 * Append the OCR text to what is already there, separated by a blank line;
 * an empty field just takes the text. Blank OCR text leaves the field alone.
 */
export function insertOcrText(current: string, ocrText: string): string {
  const incoming = ocrText.trim();
  if (incoming.length === 0) return current;
  return current.trim().length === 0 ? incoming : `${current.trimEnd()}\n\n${incoming}`;
}
