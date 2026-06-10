// Image OCR via Gemini multimodal.
//
// Flow: pick image (picker) → base64 (built-in) → local payload guard
// → callGemini({ image }) → text back. The Edge Function (gemini-proxy)
// still enforces the authoritative MIME allowlist + 2.7MB base64 cap.

import * as ImagePicker from "expo-image-picker";

import { callGemini } from "../llm/gemini";
import type { GeminiResult } from "../llm/types";

export interface PickedImage {
  /** Local URI for the preview thumbnail. */
  uri: string;
  /** Normalized base64 bytes handed to the Edge Function for OCR. */
  base64: string;
  mimeType: string;
}

export const MAX_OCR_IMAGE_BASE64_BYTES = 2_700_000;
export const MAX_OCR_IMAGE_RAW_BASE64_BYTES = MAX_OCR_IMAGE_BASE64_BYTES + 100_000;
export const MAX_OCR_TEXT_CHARS = 12_000;
export const IMAGE_OCR_TOO_LARGE_ERROR = "image_ocr_too_large";
export const IMAGE_OCR_UNSUPPORTED_TYPE_ERROR = "image_ocr_unsupported_type";
export const IMAGE_CAMERA_PERMISSION_DENIED_ERROR = "camera_permission_denied";
export const IMAGE_OCR_MISSING_DATA_ERROR = "image_ocr_missing_data";
export const IMAGE_OCR_INVALID_DATA_ERROR = "image_ocr_invalid_data";
export const IMAGE_OCR_EMPTY_RESULT_ERROR = "image_ocr_empty_result";
export const IMAGE_OCR_CRISIS_RESULT_ERROR = "image_ocr_crisis_result";

export const ALLOWED_OCR_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;
type AllowedOcrImageMimeType = (typeof ALLOWED_OCR_IMAGE_MIME_TYPES)[number];

const ALLOWED_OCR_IMAGE_MIME_TYPE_SET = new Set<string>(ALLOWED_OCR_IMAGE_MIME_TYPES);

const OCR_IMAGE_MIME_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/x-png": "image/png",
};
const GENERIC_OCR_IMAGE_MIME_TYPES = new Set(["application/octet-stream"]);

const LLM_IMAGE_ERROR_TO_OCR_ERROR: Record<string, string> = {
  llm_image_invalid_data: IMAGE_OCR_INVALID_DATA_ERROR,
  llm_image_too_large: IMAGE_OCR_TOO_LARGE_ERROR,
  llm_image_unsupported_type: IMAGE_OCR_UNSUPPORTED_TYPE_ERROR,
};

const BASE64_DATA_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_VALUES = new Map(Array.from(BASE64_ALPHABET, (char, value) => [char, value]));
const MIN_OCR_IMAGE_SIGNATURE_BYTES = 12;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ISO_HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"]);
const ISO_HEIF_BRANDS = new Set(["mif1", "msf1"]);

const OCR_PROMPT: Record<"en" | "ko", string> = {
  en: "Transcribe all readable text in this image as clean markdown. Preserve visible line breaks, headings, lists, and markdown tables where possible. Capture numeric values, units, labels, timestamps, checkboxes, and engineering terms such as tact time, cycle time, and UPH exactly as shown. Mark unclear characters with [?] instead of guessing. If the image has no readable text, describe what you see in 1-2 sentences in English.",
  ko: "이미지의 모든 읽을 수 있는 텍스트를 깔끔한 마크다운으로 전사하세요. 보이는 줄바꿈, 제목, 목록을 유지하고, 표는 가능한 한 마크다운 표로 보존하세요. 숫자, 단위, 라벨, 시간, 체크박스, tact time, cycle time, UPH 같은 엔지니어링 용어는 보이는 대로 정확히 적으세요. 불확실한 글자는 추측하지 말고 [?]로 표시하세요. 읽을 수 있는 텍스트가 없으면 이미지 내용을 한국어 1-2문장으로 설명하세요.",
};

export function isImageOcrTooLargeError(error: unknown): boolean {
  return error instanceof Error && error.message === IMAGE_OCR_TOO_LARGE_ERROR;
}

export function isImageOcrUnsupportedTypeError(error: unknown): boolean {
  return error instanceof Error && error.message === IMAGE_OCR_UNSUPPORTED_TYPE_ERROR;
}

export function isImageCameraPermissionDeniedError(error: unknown): boolean {
  return error instanceof Error && error.message === IMAGE_CAMERA_PERMISSION_DENIED_ERROR;
}

export function isImageOcrMissingDataError(error: unknown): boolean {
  return error instanceof Error && error.message === IMAGE_OCR_MISSING_DATA_ERROR;
}

export function isImageOcrInvalidDataError(error: unknown): boolean {
  return error instanceof Error && error.message === IMAGE_OCR_INVALID_DATA_ERROR;
}

export function isImageOcrEmptyResultError(error: unknown): boolean {
  return error instanceof Error && error.message === IMAGE_OCR_EMPTY_RESULT_ERROR;
}

export function isImageOcrCrisisResultError(error: unknown): boolean {
  return error instanceof Error && error.message === IMAGE_OCR_CRISIS_RESULT_ERROR;
}

export function isImageOcrRepickRequiredError(error: unknown): boolean {
  return (
    isImageOcrTooLargeError(error) ||
    isImageOcrUnsupportedTypeError(error) ||
    isImageOcrMissingDataError(error) ||
    isImageOcrInvalidDataError(error)
  );
}

export function normalizeOcrImageMimeType(mimeType: string | null | undefined): string {
  return normalizeDeclaredOcrImageMimeType(mimeType) ?? "image/jpeg";
}

export function normalizeOcrImageBase64Data(data: string): string {
  return data.replace(/\s+/g, "");
}

export function normalizeOcrTextResult(text: string, locale: "en" | "ko" = "en"): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_OCR_TEXT_CHARS) return trimmed;
  const marker = locale === "ko"
    ? `\n\n[OCR 텍스트 잘림: 원본 ${trimmed.length}자]`
    : `\n\n[OCR text truncated: original ${trimmed.length} chars]`;
  return `${trimmed.slice(0, MAX_OCR_TEXT_CHARS).trimEnd()}${marker}`;
}

export function normalizeOcrImagePayload(image: {
  base64: string;
  mimeType?: string | null;
}): { base64: string; mimeType: AllowedOcrImageMimeType } {
  if (image.base64.length > MAX_OCR_IMAGE_RAW_BASE64_BYTES) {
    throw new Error(IMAGE_OCR_TOO_LARGE_ERROR);
  }
  const parsed = parseOcrImageBase64Input(image.base64);
  const base64 = normalizeOcrImageBase64Data(parsed.base64);
  if (base64.length === 0) {
    throw new Error(IMAGE_OCR_MISSING_DATA_ERROR);
  }
  if (base64.length > MAX_OCR_IMAGE_BASE64_BYTES) {
    throw new Error(IMAGE_OCR_TOO_LARGE_ERROR);
  }
  if (!BASE64_DATA_RE.test(base64)) {
    throw new Error(IMAGE_OCR_INVALID_DATA_ERROR);
  }
  const outerMimeType = normalizeDeclaredOcrImageMimeType(image.mimeType);
  if (parsed.mimeType && outerMimeType && !GENERIC_OCR_IMAGE_MIME_TYPES.has(outerMimeType)) {
    if (!ALLOWED_OCR_IMAGE_MIME_TYPE_SET.has(outerMimeType)) {
      throw new Error(IMAGE_OCR_UNSUPPORTED_TYPE_ERROR);
    }
    if (!areOcrImageMimeTypesCompatible(parsed.mimeType as AllowedOcrImageMimeType, outerMimeType as AllowedOcrImageMimeType)) {
      throw new Error(IMAGE_OCR_INVALID_DATA_ERROR);
    }
  }
  const declaredMimeType = parsed.mimeType ?? outerMimeType;
  if (declaredMimeType && !ALLOWED_OCR_IMAGE_MIME_TYPE_SET.has(declaredMimeType)) {
    throw new Error(IMAGE_OCR_UNSUPPORTED_TYPE_ERROR);
  }
  const sniffedMimeType = sniffOcrImageMimeType(base64);
  if (!sniffedMimeType) {
    throw new Error(IMAGE_OCR_INVALID_DATA_ERROR);
  }
  if (declaredMimeType && !areOcrImageMimeTypesCompatible(declaredMimeType, sniffedMimeType)) {
    throw new Error(IMAGE_OCR_INVALID_DATA_ERROR);
  }
  return { base64, mimeType: (declaredMimeType ?? sniffedMimeType) as AllowedOcrImageMimeType };
}

export function assertImageOcrPayloadAllowed(image: { base64: string; mimeType: string }): void {
  normalizeOcrImagePayload(image);
}

function normalizeDeclaredOcrImageMimeType(mimeType: string | null | undefined): string | null {
  const normalized = mimeType?.trim().toLowerCase().split(";")[0]?.trim();
  if (!normalized) return null;
  return OCR_IMAGE_MIME_ALIASES[normalized] ?? normalized;
}

function parseOcrImageBase64Input(input: string): { base64: string; mimeType: string | null } {
  const trimmed = input.trim();
  if (!trimmed.toLowerCase().startsWith("data:")) return { base64: input, mimeType: null };

  const commaIndex = trimmed.indexOf(",");
  if (commaIndex === -1) {
    throw new Error(IMAGE_OCR_INVALID_DATA_ERROR);
  }
  const header = trimmed.slice("data:".length, commaIndex);
  const parts = header.split(";").map((part) => part.trim()).filter(Boolean);
  const rawMimeType = parts.shift();
  if (!rawMimeType || !parts.some((part) => part.toLowerCase() === "base64")) {
    throw new Error(IMAGE_OCR_INVALID_DATA_ERROR);
  }
  const dataUrlMimeType = normalizeDeclaredOcrImageMimeType(rawMimeType);
  return {
    base64: trimmed.slice(commaIndex + 1),
    mimeType: dataUrlMimeType && GENERIC_OCR_IMAGE_MIME_TYPES.has(dataUrlMimeType) ? null : dataUrlMimeType,
  };
}

function sniffOcrImageMimeType(base64: string): AllowedOcrImageMimeType | null {
  const bytes = decodeBase64Prefix(base64, 32);
  if (bytes.length < MIN_OCR_IMAGE_SIGNATURE_BYTES) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytesStartWith(bytes, PNG_SIGNATURE)) return "image/png";
  if (asciiAt(bytes, 0, 4) === "RIFF" && asciiAt(bytes, 8, 4) === "WEBP") return "image/webp";
  if (asciiAt(bytes, 4, 4) !== "ftyp") return null;
  const brand = isoImageBrand(bytes);
  if (brand && ISO_HEIC_BRANDS.has(brand)) return "image/heic";
  if (brand && ISO_HEIF_BRANDS.has(brand)) return "image/heif";
  return null;
}

function decodeBase64Prefix(base64: string, maxBytes: number): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < base64.length && bytes.length < maxBytes; i += 4) {
    const chunk = base64.slice(i, i + 4);
    const a = base64Value(chunk[0]);
    const b = base64Value(chunk[1]);
    const c = chunk[2] === "=" ? 0 : base64Value(chunk[2]);
    const d = chunk[3] === "=" ? 0 : base64Value(chunk[3]);
    const value = (a << 18) | (b << 12) | (c << 6) | d;
    bytes.push((value >> 16) & 0xff);
    if (chunk[2] !== "=" && bytes.length < maxBytes) bytes.push((value >> 8) & 0xff);
    if (chunk[3] !== "=" && bytes.length < maxBytes) bytes.push(value & 0xff);
  }
  return bytes;
}

function base64Value(char: string | undefined): number {
  return char ? (BASE64_VALUES.get(char) ?? 0) : 0;
}

function bytesStartWith(bytes: number[], signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

function asciiAt(bytes: number[], start: number, length: number): string {
  if (bytes.length < start + length) return "";
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function isoImageBrand(bytes: number[]): string | null {
  for (let offset = 8; offset + 4 <= bytes.length; offset += 4) {
    const brand = asciiAt(bytes, offset, 4);
    if (ISO_HEIC_BRANDS.has(brand) || ISO_HEIF_BRANDS.has(brand)) return brand;
  }
  return null;
}

function areOcrImageMimeTypesCompatible(declared: string, sniffed: AllowedOcrImageMimeType): boolean {
  if (declared === sniffed) return true;
  if ((declared === "image/heic" || declared === "image/heif") && (sniffed === "image/heic" || sniffed === "image/heif")) {
    return true;
  }
  return false;
}

async function proxyImagePayloadErrorMessage(error: unknown): Promise<string | null> {
  const llmImageError = error instanceof Error ? LLM_IMAGE_ERROR_TO_OCR_ERROR[error.message] : null;
  if (llmImageError) return llmImageError;

  if (!error || typeof error !== "object") return null;
  const ctx = (error as { context?: { status?: number; clone?: unknown; json?: unknown } }).context;
  if (!ctx || typeof ctx !== "object") return null;
  const status = ctx.status;
  if (status !== 400 && status !== 413 && status !== 415) return null;

  try {
    const target =
      typeof ctx.clone === "function"
        ? ((ctx.clone as () => { json?: () => Promise<unknown> })())
        : (ctx as { json?: () => Promise<unknown> });
    if (typeof target.json !== "function") return null;
    const body = (await target.json()) as { error?: unknown } | null;
    switch (body?.error) {
      case "image_invalid_data":
        return IMAGE_OCR_INVALID_DATA_ERROR;
      case "image_too_large":
        return IMAGE_OCR_TOO_LARGE_ERROR;
      case "image_mime_not_allowed":
        return IMAGE_OCR_UNSUPPORTED_TYPE_ERROR;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// Step 1 — pick an image (library or camera). No network: just returns the
// bytes so the UI can preview them before the user commits to an OCR call.
export async function pickImageAsset(
  source: "library" | "camera" = "library",
): Promise<PickedImage | null> {
  // Library permission is silently re-prompted by Expo when needed; the
  // camera path needs an explicit permission ask.
  if (source === "camera") {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (cam.status !== "granted") throw new Error(IMAGE_CAMERA_PERMISSION_DENIED_ERROR);
  }

  const result = source === "camera"
    ? await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true,
        quality: 0.8,
        allowsEditing: false,
      })
    : await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true,
        quality: 0.8,
        allowsEditing: false,
      });

  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset) return null;
  if (!asset.base64) throw new Error(IMAGE_OCR_MISSING_DATA_ERROR);

  const payload = normalizeOcrImagePayload({
    base64: asset.base64,
    mimeType: asset.mimeType,
  });
  const picked = {
    uri: asset.uri,
    base64: payload.base64,
    mimeType: payload.mimeType,
  };
  return picked;
}

// Step 2 — run Gemini multimodal OCR on a picked image. Triggered by the
// explicit "추출하기 / Extract text" button so the user controls when the call
// happens. Returns the markdown transcription (C1/C3/C9 enforced in callGemini).
export async function ocrImageAsset(
  userId: string,
  locale: "en" | "ko",
  image: { base64: string; mimeType: string },
  // C10: forwarded so a minor's crisis output-swap (if the OCR'd text trips the
  // classifier) routes to the youth hotline. Defaults to adult routing.
  minor = false,
): Promise<string> {
  const { base64: data, mimeType } = normalizeOcrImagePayload(image);
  let reply: GeminiResult<string>;
  try {
    reply = await callGemini({
      userId,
      locale,
      purpose: "capture_ocr",
      user: OCR_PROMPT[locale],
      image: { mimeType, data },
      minor,
    });
  } catch (error) {
    const proxyImageError = await proxyImagePayloadErrorMessage(error);
    if (proxyImageError) throw new Error(proxyImageError);
    throw error;
  }
  if (reply.safety?.zone === "red") {
    throw new Error(IMAGE_OCR_CRISIS_RESULT_ERROR);
  }
  const text = normalizeOcrTextResult(reply.text, locale);
  if (text.length === 0) {
    throw new Error(IMAGE_OCR_EMPTY_RESULT_ERROR);
  }
  return text;
}
