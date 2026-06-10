// Image OCR via Gemini multimodal.
//
// Flow: pick image (picker) → base64 (built-in) → local payload guard
// → callGemini({ image }) → text back. The Edge Function (gemini-proxy)
// still enforces the authoritative MIME allowlist + 2.7MB base64 cap.

import * as ImagePicker from "expo-image-picker";

import { callGemini } from "../llm/gemini";

export interface PickedImage {
  /** Local URI for the preview thumbnail. */
  uri: string;
  /** Base64 bytes (no `data:` prefix) handed to the Edge Function for OCR. */
  base64: string;
  mimeType: string;
}

export const MAX_OCR_IMAGE_BASE64_BYTES = 2_700_000;
export const IMAGE_OCR_TOO_LARGE_ERROR = "image_ocr_too_large";
export const IMAGE_OCR_UNSUPPORTED_TYPE_ERROR = "image_ocr_unsupported_type";
export const IMAGE_CAMERA_PERMISSION_DENIED_ERROR = "camera_permission_denied";
export const IMAGE_OCR_MISSING_DATA_ERROR = "image_ocr_missing_data";
export const IMAGE_OCR_INVALID_DATA_ERROR = "image_ocr_invalid_data";

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

const BASE64_DATA_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_VALUES = new Map(Array.from(BASE64_ALPHABET, (char, value) => [char, value]));
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ISO_HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"]);
const ISO_HEIF_BRANDS = new Set(["mif1", "msf1"]);

const OCR_PROMPT: Record<"en" | "ko", string> = {
  en: "Transcribe all text in this image as clean markdown. Preserve line breaks, headings, and lists where visible. If the image has no readable text, describe what you see in 1–2 sentences in English.",
  ko: "이 이미지의 모든 텍스트를 깔끔한 마크다운으로 옮겨 적어주세요. 줄바꿈·제목·목록 구조는 보이는 대로 유지. 읽을 수 있는 텍스트가 없다면 이미지를 한국어 1-2문장으로 묘사해 주세요.",
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

export function normalizeOcrImageMimeType(mimeType: string | null | undefined): string {
  return normalizeDeclaredOcrImageMimeType(mimeType) ?? "image/jpeg";
}

export function normalizeOcrImageBase64Data(data: string): string {
  return data.replace(/\s+/g, "");
}

export function normalizeOcrImagePayload(image: {
  base64: string;
  mimeType?: string | null;
}): { base64: string; mimeType: AllowedOcrImageMimeType } {
  const base64 = normalizeOcrImageBase64Data(image.base64);
  if (base64.length === 0) {
    throw new Error(IMAGE_OCR_MISSING_DATA_ERROR);
  }
  if (base64.length > MAX_OCR_IMAGE_BASE64_BYTES) {
    throw new Error(IMAGE_OCR_TOO_LARGE_ERROR);
  }
  if (!BASE64_DATA_RE.test(base64)) {
    throw new Error(IMAGE_OCR_INVALID_DATA_ERROR);
  }
  const declaredMimeType = normalizeDeclaredOcrImageMimeType(image.mimeType);
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
  const normalized = mimeType?.trim().toLowerCase();
  if (!normalized) return null;
  return OCR_IMAGE_MIME_ALIASES[normalized] ?? normalized;
}

function sniffOcrImageMimeType(base64: string): AllowedOcrImageMimeType | null {
  const bytes = decodeBase64Prefix(base64, 32);
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
  const reply = await callGemini({
    userId,
    locale,
    purpose: "capture_ocr",
    user: OCR_PROMPT[locale],
    image: { mimeType, data },
    minor,
  });
  return reply.text;
}
