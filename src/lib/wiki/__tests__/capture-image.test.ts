import { readFileSync } from "fs";
import { resolve } from "path";
import * as ImagePicker from "expo-image-picker";

jest.mock("expo-image-picker", () => ({
  MediaTypeOptions: { Images: "Images" },
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));

jest.mock("../../llm/gemini", () => ({
  callGemini: jest.fn(),
}));

import { callGemini } from "../../llm/gemini";
import {
  ALLOWED_OCR_IMAGE_MIME_TYPES,
  IMAGE_OCR_UNSUPPORTED_TYPE_ERROR,
  IMAGE_OCR_TOO_LARGE_ERROR,
  MAX_OCR_IMAGE_BASE64_BYTES,
  isImageOcrTooLargeError,
  isImageOcrUnsupportedTypeError,
  normalizeOcrImageMimeType,
  ocrImageAsset,
  pickImageAsset,
} from "../capture-image";

const mockCallGemini = callGemini as jest.MockedFunction<typeof callGemini>;
const imagePickerMock = ImagePicker as unknown as {
  launchImageLibraryAsync: jest.Mock;
};
const geminiProxySource = readFileSync(
  resolve(__dirname, "../../../../supabase/functions/gemini-proxy/index.ts"),
  "utf8",
);

function proxyImageBase64Cap(): number {
  const match = geminiProxySource.match(/const MAX_IMAGE_BASE64_LEN = ([\d_]+);/);
  if (!match) throw new Error("gemini-proxy image cap constant not found");
  return Number(match[1]!.replace(/_/g, ""));
}

function proxyImageMimeAllowlist(): string[] {
  const match = geminiProxySource.match(/const ALLOWED_IMAGE_MIME = new Set\(\[([^\]]+)\]\);/);
  if (!match) throw new Error("gemini-proxy image MIME allowlist not found");
  return Array.from(match[1]!.matchAll(/'([^']+)'/g), (m) => m[1]!);
}

describe("capture image OCR payload guards", () => {
  beforeEach(() => {
    mockCallGemini.mockReset();
    imagePickerMock.launchImageLibraryAsync.mockReset();
    mockCallGemini.mockResolvedValue({
      text: "OCR text",
    } as Awaited<ReturnType<typeof callGemini>>);
  });

  test("mirrors gemini-proxy image payload policy exactly", () => {
    expect(MAX_OCR_IMAGE_BASE64_BYTES).toBe(proxyImageBase64Cap());
    expect([...ALLOWED_OCR_IMAGE_MIME_TYPES]).toEqual(proxyImageMimeAllowlist());
  });

  test("rejects oversized base64 before calling Gemini", async () => {
    await expect(
      ocrImageAsset("u1", "en", {
        mimeType: "image/png",
        base64: "A".repeat(MAX_OCR_IMAGE_BASE64_BYTES + 1),
      }),
    ).rejects.toThrow(IMAGE_OCR_TOO_LARGE_ERROR);

    expect(mockCallGemini).not.toHaveBeenCalled();
  });

  test("rejects unsupported image MIME before calling Gemini", async () => {
    await expect(
      ocrImageAsset("u1", "en", {
        mimeType: "image/gif",
        base64: "AAAA",
      }),
    ).rejects.toThrow(IMAGE_OCR_UNSUPPORTED_TYPE_ERROR);

    expect(mockCallGemini).not.toHaveBeenCalled();
  });

  test("rejects oversized picked images before returning a preview asset", async () => {
    imagePickerMock.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///big.png",
          mimeType: "image/png",
          base64: "A".repeat(MAX_OCR_IMAGE_BASE64_BYTES + 1),
        },
      ],
    });

    await expect(pickImageAsset("library")).rejects.toThrow(IMAGE_OCR_TOO_LARGE_ERROR);
  });

  test("rejects unsupported picked image MIME before returning a preview asset", async () => {
    imagePickerMock.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///anim.gif",
          mimeType: "image/gif",
          base64: "AAAA",
        },
      ],
    });

    await expect(pickImageAsset("library")).rejects.toThrow(IMAGE_OCR_UNSUPPORTED_TYPE_ERROR);
  });

  test("normalizes picker MIME aliases before returning the preview asset", async () => {
    imagePickerMock.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///photo.jpg",
          mimeType: "image/jpg",
          base64: "AAAA",
        },
      ],
    });

    await expect(pickImageAsset("library")).resolves.toEqual({
      uri: "file:///photo.jpg",
      mimeType: "image/jpeg",
      base64: "AAAA",
    });
  });

  test("allows payloads at the mirrored server cap", async () => {
    const base64 = "A".repeat(MAX_OCR_IMAGE_BASE64_BYTES);

    await expect(
      ocrImageAsset("u1", "ko", {
        mimeType: "image/jpeg",
        base64,
      }),
    ).resolves.toBe("OCR text");

    expect(mockCallGemini).toHaveBeenCalledTimes(1);
    expect(mockCallGemini).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        locale: "ko",
        purpose: "capture_ocr",
        image: { mimeType: "image/jpeg", data: base64 },
      }),
    );
  });

  test("normalizes common image MIME aliases before calling Gemini", async () => {
    await ocrImageAsset("u1", "en", {
      mimeType: "IMAGE/JPG",
      base64: "AAAA",
    });

    expect(mockCallGemini).toHaveBeenCalledWith(
      expect.objectContaining({
        image: { mimeType: "image/jpeg", data: "AAAA" },
      }),
    );
    expect(normalizeOcrImageMimeType(" image/x-png ")).toBe("image/png");
    expect(normalizeOcrImageMimeType(undefined)).toBe("image/jpeg");
  });

  test("exposes a narrow sentinel helper for UI branching", () => {
    expect(isImageOcrTooLargeError(new Error(IMAGE_OCR_TOO_LARGE_ERROR))).toBe(true);
    expect(isImageOcrTooLargeError(new Error("network_down"))).toBe(false);
    expect(isImageOcrTooLargeError("image_ocr_too_large")).toBe(false);

    expect(isImageOcrUnsupportedTypeError(new Error(IMAGE_OCR_UNSUPPORTED_TYPE_ERROR))).toBe(true);
    expect(isImageOcrUnsupportedTypeError(new Error(IMAGE_OCR_TOO_LARGE_ERROR))).toBe(false);
    expect(isImageOcrUnsupportedTypeError("image_ocr_unsupported_type")).toBe(false);
  });
});
