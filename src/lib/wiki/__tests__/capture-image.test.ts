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
  IMAGE_OCR_TOO_LARGE_ERROR,
  MAX_OCR_IMAGE_BASE64_BYTES,
  isImageOcrTooLargeError,
  ocrImageAsset,
} from "../capture-image";

const mockCallGemini = callGemini as jest.MockedFunction<typeof callGemini>;

describe("ocrImageAsset", () => {
  beforeEach(() => {
    mockCallGemini.mockReset();
    mockCallGemini.mockResolvedValue({
      text: "OCR text",
    } as Awaited<ReturnType<typeof callGemini>>);
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

  test("exposes a narrow sentinel helper for UI branching", () => {
    expect(isImageOcrTooLargeError(new Error(IMAGE_OCR_TOO_LARGE_ERROR))).toBe(true);
    expect(isImageOcrTooLargeError(new Error("network_down"))).toBe(false);
    expect(isImageOcrTooLargeError("image_ocr_too_large")).toBe(false);
  });
});
