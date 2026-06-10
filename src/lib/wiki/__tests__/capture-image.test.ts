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
  IMAGE_CAMERA_PERMISSION_DENIED_ERROR,
  IMAGE_OCR_EMPTY_RESULT_ERROR,
  IMAGE_OCR_INVALID_DATA_ERROR,
  IMAGE_OCR_MISSING_DATA_ERROR,
  IMAGE_OCR_UNSUPPORTED_TYPE_ERROR,
  IMAGE_OCR_TOO_LARGE_ERROR,
  MAX_OCR_IMAGE_BASE64_BYTES,
  isImageCameraPermissionDeniedError,
  isImageOcrEmptyResultError,
  isImageOcrInvalidDataError,
  isImageOcrMissingDataError,
  isImageOcrRepickRequiredError,
  isImageOcrTooLargeError,
  isImageOcrUnsupportedTypeError,
  normalizeOcrImageMimeType,
  normalizeOcrImageBase64Data,
  normalizeOcrImagePayload,
  normalizeOcrTextResult,
  ocrImageAsset,
  pickImageAsset,
} from "../capture-image";

const JPEG_SIGNATURE_BASE64 = Buffer.from([0xff, 0xd8, 0xff]).toString("base64");
const JPEG_IMAGE_BASE64 = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49,
  0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01,
]).toString("base64");
const PNG_IMAGE_BASE64 = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
  0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00,
]).toString("base64");

const mockCallGemini = callGemini as jest.MockedFunction<typeof callGemini>;
const imagePickerMock = ImagePicker as unknown as {
  launchCameraAsync: jest.Mock;
  launchImageLibraryAsync: jest.Mock;
  requestCameraPermissionsAsync: jest.Mock;
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
    imagePickerMock.launchCameraAsync.mockReset();
    imagePickerMock.launchImageLibraryAsync.mockReset();
    imagePickerMock.requestCameraPermissionsAsync.mockReset();
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
        base64: PNG_IMAGE_BASE64,
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
          base64: PNG_IMAGE_BASE64,
        },
      ],
    });

    await expect(pickImageAsset("library")).rejects.toThrow(IMAGE_OCR_UNSUPPORTED_TYPE_ERROR);
  });

  test("rejects picked image assets that are missing base64 data", async () => {
    imagePickerMock.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///missing-data.png",
          mimeType: "image/png",
        },
      ],
    });

    await expect(pickImageAsset("library")).rejects.toThrow(IMAGE_OCR_MISSING_DATA_ERROR);
  });

  test("rejects blank picked image base64 data as missing data", async () => {
    imagePickerMock.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///blank.png",
          mimeType: "image/png",
          base64: " \n\t ",
        },
      ],
    });

    await expect(pickImageAsset("library")).rejects.toThrow(IMAGE_OCR_MISSING_DATA_ERROR);
  });

  test("rejects invalid base64 image data before calling Gemini", async () => {
    await expect(
      ocrImageAsset("u1", "en", {
        mimeType: "image/png",
        base64: "not-base64!!!",
      }),
    ).rejects.toThrow(IMAGE_OCR_INVALID_DATA_ERROR);

    expect(mockCallGemini).not.toHaveBeenCalled();
  });

  test("rejects syntactically valid non-image base64 before calling Gemini", async () => {
    await expect(
      ocrImageAsset("u1", "en", {
        mimeType: "image/png",
        base64: "QUJDRA==",
      }),
    ).rejects.toThrow(IMAGE_OCR_INVALID_DATA_ERROR);

    expect(mockCallGemini).not.toHaveBeenCalled();
  });

  test("rejects truncated image signatures before calling Gemini", async () => {
    await expect(
      ocrImageAsset("u1", "en", {
        mimeType: "image/jpeg",
        base64: JPEG_SIGNATURE_BASE64,
      }),
    ).rejects.toThrow(IMAGE_OCR_INVALID_DATA_ERROR);

    expect(mockCallGemini).not.toHaveBeenCalled();
  });

  test("rejects declared image MIME that conflicts with the image signature", async () => {
    await expect(
      ocrImageAsset("u1", "en", {
        mimeType: "image/jpeg",
        base64: PNG_IMAGE_BASE64,
      }),
    ).rejects.toThrow(IMAGE_OCR_INVALID_DATA_ERROR);

    expect(mockCallGemini).not.toHaveBeenCalled();
  });

  test("rejects denied camera permission before launching the camera", async () => {
    imagePickerMock.requestCameraPermissionsAsync.mockResolvedValue({ status: "denied" });

    await expect(pickImageAsset("camera")).rejects.toThrow(IMAGE_CAMERA_PERMISSION_DENIED_ERROR);
    expect(imagePickerMock.launchCameraAsync).not.toHaveBeenCalled();
  });

  test("normalizes picker MIME aliases before returning the preview asset", async () => {
    imagePickerMock.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///photo.jpg",
          mimeType: "image/jpg",
          base64: JPEG_IMAGE_BASE64,
        },
      ],
    });

    await expect(pickImageAsset("library")).resolves.toEqual({
      uri: "file:///photo.jpg",
      mimeType: "image/jpeg",
      base64: JPEG_IMAGE_BASE64,
    });
  });

  test("infers missing picker MIME from the image signature", async () => {
    imagePickerMock.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///photo-without-mime.png",
          base64: PNG_IMAGE_BASE64,
        },
      ],
    });

    await expect(pickImageAsset("library")).resolves.toEqual({
      uri: "file:///photo-without-mime.png",
      mimeType: "image/png",
      base64: PNG_IMAGE_BASE64,
    });
  });

  test("normalizes base64 whitespace before returning and sending image data", async () => {
    imagePickerMock.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///wrapped.png",
          mimeType: "image/png",
          base64: `${PNG_IMAGE_BASE64.slice(0, 8)}\n${PNG_IMAGE_BASE64.slice(8)}`,
        },
      ],
    });

    await expect(pickImageAsset("library")).resolves.toEqual({
      uri: "file:///wrapped.png",
      mimeType: "image/png",
      base64: PNG_IMAGE_BASE64,
    });

    await ocrImageAsset("u1", "en", {
      mimeType: "image/png",
      base64: `${PNG_IMAGE_BASE64.slice(0, 8)}\n${PNG_IMAGE_BASE64.slice(8)}`,
    });

    expect(mockCallGemini).toHaveBeenCalledWith(
      expect.objectContaining({
        image: { mimeType: "image/png", data: PNG_IMAGE_BASE64 },
      }),
    );
    expect(normalizeOcrImageBase64Data(` ${PNG_IMAGE_BASE64.slice(0, 8)}\n${PNG_IMAGE_BASE64.slice(8)} `)).toBe(PNG_IMAGE_BASE64);
  });

  test("allows payloads at the mirrored server cap", async () => {
    const base64 = JPEG_IMAGE_BASE64 + "A".repeat(MAX_OCR_IMAGE_BASE64_BYTES - JPEG_IMAGE_BASE64.length);

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

  test("normalizes OCR text before returning it", async () => {
    mockCallGemini.mockResolvedValueOnce({
      text: "\n  Clean markdown text  \n",
    } as Awaited<ReturnType<typeof callGemini>>);

    await expect(
      ocrImageAsset("u1", "en", {
        mimeType: "image/png",
        base64: PNG_IMAGE_BASE64,
      }),
    ).resolves.toBe("Clean markdown text");

    expect(normalizeOcrTextResult("\n  OCR text  \n")).toBe("OCR text");
  });

  test("rejects blank OCR text results as a read failure", async () => {
    mockCallGemini.mockResolvedValueOnce({
      text: " \n\t ",
    } as Awaited<ReturnType<typeof callGemini>>);

    await expect(
      ocrImageAsset("u1", "en", {
        mimeType: "image/png",
        base64: PNG_IMAGE_BASE64,
      }),
    ).rejects.toThrow(IMAGE_OCR_EMPTY_RESULT_ERROR);

    expect(mockCallGemini).toHaveBeenCalledTimes(1);
  });

  test("normalizes common image MIME aliases before calling Gemini", async () => {
    await ocrImageAsset("u1", "en", {
      mimeType: "IMAGE/JPG",
      base64: JPEG_IMAGE_BASE64,
    });

    expect(mockCallGemini).toHaveBeenCalledWith(
      expect.objectContaining({
        image: { mimeType: "image/jpeg", data: JPEG_IMAGE_BASE64 },
      }),
    );
    expect(normalizeOcrImageMimeType(" image/x-png ")).toBe("image/png");
    expect(normalizeOcrImageMimeType(undefined)).toBe("image/jpeg");
    expect(normalizeOcrImagePayload({ base64: PNG_IMAGE_BASE64 }).mimeType).toBe("image/png");
  });

  test("exposes a narrow sentinel helper for UI branching", () => {
    expect(isImageOcrTooLargeError(new Error(IMAGE_OCR_TOO_LARGE_ERROR))).toBe(true);
    expect(isImageOcrTooLargeError(new Error("network_down"))).toBe(false);
    expect(isImageOcrTooLargeError("image_ocr_too_large")).toBe(false);

    expect(isImageOcrUnsupportedTypeError(new Error(IMAGE_OCR_UNSUPPORTED_TYPE_ERROR))).toBe(true);
    expect(isImageOcrUnsupportedTypeError(new Error(IMAGE_OCR_TOO_LARGE_ERROR))).toBe(false);
    expect(isImageOcrUnsupportedTypeError("image_ocr_unsupported_type")).toBe(false);

    expect(isImageCameraPermissionDeniedError(new Error(IMAGE_CAMERA_PERMISSION_DENIED_ERROR))).toBe(true);
    expect(isImageCameraPermissionDeniedError(new Error(IMAGE_OCR_TOO_LARGE_ERROR))).toBe(false);
    expect(isImageCameraPermissionDeniedError("camera_permission_denied")).toBe(false);

    expect(isImageOcrMissingDataError(new Error(IMAGE_OCR_MISSING_DATA_ERROR))).toBe(true);
    expect(isImageOcrMissingDataError(new Error(IMAGE_OCR_TOO_LARGE_ERROR))).toBe(false);
    expect(isImageOcrMissingDataError("image_ocr_missing_data")).toBe(false);

    expect(isImageOcrInvalidDataError(new Error(IMAGE_OCR_INVALID_DATA_ERROR))).toBe(true);
    expect(isImageOcrInvalidDataError(new Error(IMAGE_OCR_TOO_LARGE_ERROR))).toBe(false);
    expect(isImageOcrInvalidDataError("image_ocr_invalid_data")).toBe(false);

    expect(isImageOcrEmptyResultError(new Error(IMAGE_OCR_EMPTY_RESULT_ERROR))).toBe(true);
    expect(isImageOcrEmptyResultError(new Error(IMAGE_OCR_INVALID_DATA_ERROR))).toBe(false);
    expect(isImageOcrEmptyResultError("image_ocr_empty_result")).toBe(false);

    expect(isImageOcrRepickRequiredError(new Error(IMAGE_OCR_TOO_LARGE_ERROR))).toBe(true);
    expect(isImageOcrRepickRequiredError(new Error(IMAGE_OCR_UNSUPPORTED_TYPE_ERROR))).toBe(true);
    expect(isImageOcrRepickRequiredError(new Error(IMAGE_OCR_MISSING_DATA_ERROR))).toBe(true);
    expect(isImageOcrRepickRequiredError(new Error(IMAGE_OCR_INVALID_DATA_ERROR))).toBe(true);
    expect(isImageOcrRepickRequiredError(new Error(IMAGE_CAMERA_PERMISSION_DENIED_ERROR))).toBe(false);
    expect(isImageOcrRepickRequiredError(new Error("network_down"))).toBe(false);
  });
});
