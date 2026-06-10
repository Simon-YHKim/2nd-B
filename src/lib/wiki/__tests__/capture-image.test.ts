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
  IMAGE_CAMERA_PERMISSION_DENIED_ERROR,
  IMAGE_OCR_CRISIS_RESULT_ERROR,
  IMAGE_OCR_EMPTY_RESULT_ERROR,
  IMAGE_OCR_INVALID_DATA_ERROR,
  IMAGE_OCR_MISSING_DATA_ERROR,
  IMAGE_OCR_UNSUPPORTED_TYPE_ERROR,
  IMAGE_OCR_TOO_LARGE_ERROR,
  MAX_OCR_IMAGE_BASE64_BYTES,
  MAX_OCR_IMAGE_RAW_BASE64_BYTES,
  MAX_OCR_TEXT_CHARS,
  isImageCameraPermissionDeniedError,
  isImageOcrCrisisResultError,
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
const JPEG_PADDED_IMAGE_BASE64 = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49,
  0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x02,
]).toString("base64");
const JPEG_IMAGE_BASE64_URL = JPEG_IMAGE_BASE64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const JPEG_PADDED_IMAGE_BASE64_URL = JPEG_PADDED_IMAGE_BASE64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const PNG_IMAGE_BASE64 = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
  0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00,
]).toString("base64");
const GIF_IMAGE_BASE64 = Buffer.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01,
  0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00,
]).toString("base64");
const AVIF_IMAGE_BASE64 = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x61,
  0x76, 0x69, 0x66, 0x00, 0x00, 0x00, 0x00, 0x61, 0x76,
  0x69, 0x66,
]).toString("base64");

const mockCallGemini = callGemini as jest.MockedFunction<typeof callGemini>;
const imagePickerMock = ImagePicker as unknown as {
  launchCameraAsync: jest.Mock;
  launchImageLibraryAsync: jest.Mock;
  requestCameraPermissionsAsync: jest.Mock;
};

function proxyHttpError(status: number, error: string): Error {
  return Object.assign(new Error("proxy request failed"), {
    context: {
      status,
      clone: () => ({
        json: async () => ({ error }),
      }),
    },
  });
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

  test("rejects oversized base64 before calling Gemini", async () => {
    await expect(
      ocrImageAsset("u1", "en", {
        mimeType: "image/png",
        base64: "A".repeat(MAX_OCR_IMAGE_BASE64_BYTES + 1),
      }),
    ).rejects.toThrow(IMAGE_OCR_TOO_LARGE_ERROR);

    expect(mockCallGemini).not.toHaveBeenCalled();
  });

  test("rejects whitespace-heavy raw base64 envelopes before normalization", async () => {
    const padded = `${PNG_IMAGE_BASE64}${" ".repeat(MAX_OCR_IMAGE_RAW_BASE64_BYTES - PNG_IMAGE_BASE64.length + 1)}`;

    await expect(
      ocrImageAsset("u1", "en", {
        mimeType: "image/png",
        base64: padded,
      }),
    ).rejects.toThrow(IMAGE_OCR_TOO_LARGE_ERROR);

    expect(normalizeOcrImageBase64Data(padded)).toBe(PNG_IMAGE_BASE64);
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

  test.each([
    [400, "image_invalid_data", IMAGE_OCR_INVALID_DATA_ERROR],
    [413, "image_too_large", IMAGE_OCR_TOO_LARGE_ERROR],
    [415, "image_mime_not_allowed", IMAGE_OCR_UNSUPPORTED_TYPE_ERROR],
  ])("maps gemini-proxy OCR image error %s/%s to the capture sentinel", async (status, marker, expected) => {
    mockCallGemini.mockRejectedValueOnce(proxyHttpError(status as number, marker as string));

    await expect(
      ocrImageAsset("u1", "en", {
        mimeType: "image/png",
        base64: PNG_IMAGE_BASE64,
      }),
    ).rejects.toThrow(expected as string);
  });

  test("does not remap non-image proxy errors during OCR", async () => {
    const error = proxyHttpError(400, "user_required");
    mockCallGemini.mockRejectedValueOnce(error);

    await expect(
      ocrImageAsset("u1", "en", {
        mimeType: "image/png",
        base64: PNG_IMAGE_BASE64,
      }),
    ).rejects.toBe(error);
  });

  test.each([
    ["llm_image_invalid_data", IMAGE_OCR_INVALID_DATA_ERROR],
    ["llm_image_too_large", IMAGE_OCR_TOO_LARGE_ERROR],
    ["llm_image_unsupported_type", IMAGE_OCR_UNSUPPORTED_TYPE_ERROR],
  ])("maps callGemini image preflight error %s to the capture sentinel", async (marker, expected) => {
    mockCallGemini.mockRejectedValueOnce(new Error(marker));

    await expect(
      ocrImageAsset("u1", "en", {
        mimeType: "image/png",
        base64: PNG_IMAGE_BASE64,
      }),
    ).rejects.toThrow(expected);
  });

  test("does not remap non-image callGemini errors during OCR", async () => {
    const error = new Error("network_down");
    mockCallGemini.mockRejectedValueOnce(error);

    await expect(
      ocrImageAsset("u1", "en", {
        mimeType: "image/png",
        base64: PNG_IMAGE_BASE64,
      }),
    ).rejects.toBe(error);
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
          mimeType: "image/jpg; charset=binary",
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

  test("normalizes base64url image data before returning and sending image data", async () => {
    imagePickerMock.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///url-safe.jpg",
          mimeType: "image/jpeg",
          base64: JPEG_IMAGE_BASE64_URL,
        },
      ],
    });

    await expect(pickImageAsset("library")).resolves.toEqual({
      uri: "file:///url-safe.jpg",
      mimeType: "image/jpeg",
      base64: JPEG_IMAGE_BASE64,
    });

    await ocrImageAsset("u1", "en", {
      mimeType: "image/jpeg",
      base64: `data:image/jpeg;base64,${JPEG_PADDED_IMAGE_BASE64_URL}`,
    });

    expect(mockCallGemini).toHaveBeenCalledWith(
      expect.objectContaining({
        image: { mimeType: "image/jpeg", data: JPEG_PADDED_IMAGE_BASE64 },
      }),
    );
    expect(normalizeOcrImageBase64Data(JPEG_IMAGE_BASE64_URL)).toBe(JPEG_IMAGE_BASE64);
    expect(normalizeOcrImageBase64Data(JPEG_PADDED_IMAGE_BASE64_URL)).toBe(JPEG_PADDED_IMAGE_BASE64);
  });

  test("decodes percent-encoded data URL image payloads before calling Gemini", async () => {
    await ocrImageAsset("u1", "en", {
      mimeType: "image/jpeg",
      base64: `data:image/jpeg;base64,${encodeURIComponent(JPEG_PADDED_IMAGE_BASE64)}`,
    });

    expect(mockCallGemini).toHaveBeenCalledWith(
      expect.objectContaining({
        image: { mimeType: "image/jpeg", data: JPEG_PADDED_IMAGE_BASE64 },
      }),
    );
    expect(normalizeOcrImagePayload({
      base64: `data:image/jpeg;base64,${encodeURIComponent(JPEG_PADDED_IMAGE_BASE64)}`,
    })).toEqual({
      mimeType: "image/jpeg",
      base64: JPEG_PADDED_IMAGE_BASE64,
    });
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
      text: "\r\n  Clean markdown text\r\n| A | B |\r| - | - |  \r\n",
    } as Awaited<ReturnType<typeof callGemini>>);

    await expect(
      ocrImageAsset("u1", "en", {
        mimeType: "image/png",
        base64: PNG_IMAGE_BASE64,
      }),
    ).resolves.toBe("Clean markdown text\n| A | B |\n| - | - |");

    expect(normalizeOcrTextResult("\n  OCR text  \n")).toBe("OCR text");
    expect(normalizeOcrTextResult("\r\nLine 1\r\nLine 2\rLine 3\r\n")).toBe("Line 1\nLine 2\nLine 3");
    expect(normalizeOcrTextResult("Row A\u2028Row B\u2029Row C")).toBe("Row A\nRow B\nRow C");
  });

  test("unwraps full-response OCR markdown fences but preserves real code fences", async () => {
    mockCallGemini.mockResolvedValueOnce({
      text: "```markdown\n# Machine log\n\n| tact | UPH |\n| --- | --- |\n| 42s | 85 |\n```",
    } as Awaited<ReturnType<typeof callGemini>>);

    await expect(
      ocrImageAsset("u1", "en", {
        mimeType: "image/png",
        base64: PNG_IMAGE_BASE64,
      }),
    ).resolves.toBe("# Machine log\n\n| tact | UPH |\n| --- | --- |\n| 42s | 85 |");

    expect(normalizeOcrTextResult("```text\r\nplain text\r\n```")).toBe("plain text");
    expect(normalizeOcrTextResult("```md\nsingle line```")).toBe("single line");
    expect(normalizeOcrTextResult("```plain\nplain OCR text\n```")).toBe("plain OCR text");
    expect(normalizeOcrTextResult("```plaintext\nanother OCR line\n```")).toBe("another OCR line");
    expect(normalizeOcrTextResult("```ocr\n# Scan\n- UPH 85\n```")).toBe("# Scan\n- UPH 85");
    expect(normalizeOcrTextResult("```python\nprint('ocr')\n```")).toBe("```python\nprint('ocr')\n```");
  });

  test("removes assistant prefaces from OCR text without dropping real headings", async () => {
    mockCallGemini.mockResolvedValueOnce({
      text: "Here is the transcription:\n\n# Machine log\n- C/T: 42s",
    } as Awaited<ReturnType<typeof callGemini>>);

    await expect(
      ocrImageAsset("u1", "en", {
        mimeType: "image/png",
        base64: PNG_IMAGE_BASE64,
      }),
    ).resolves.toBe("# Machine log\n- C/T: 42s");

    expect(normalizeOcrTextResult("The text in the image reads:\n\nTray A\nUPH 85")).toBe(
      "Tray A\nUPH 85",
    );
    expect(
      normalizeOcrTextResult("Here is the extracted text:\n\n```md\n| LOT | WIP |\n| --- | --- |\n| A1 | 12 |\n```"),
    ).toBe("| LOT | WIP |\n| --- | --- |\n| A1 | 12 |");
    expect(normalizeOcrTextResult("다음은 이미지의 전사입니다:\n\n라인 1\nC/T 42초", "ko")).toBe(
      "라인 1\nC/T 42초",
    );
    expect(normalizeOcrTextResult("Transcription:\nActual screen heading")).toBe(
      "Transcription:\nActual screen heading",
    );
  });

  test("truncates oversized OCR text results with an explicit marker", async () => {
    const longText = `\n${"x".repeat(MAX_OCR_TEXT_CHARS + 17)}\n`;
    mockCallGemini.mockResolvedValueOnce({
      text: longText,
    } as Awaited<ReturnType<typeof callGemini>>);

    const text = await ocrImageAsset("u1", "en", {
      mimeType: "image/png",
      base64: PNG_IMAGE_BASE64,
    });

    expect(text.startsWith("x".repeat(MAX_OCR_TEXT_CHARS))).toBe(true);
    expect(text).toContain(`[OCR text truncated: original ${MAX_OCR_TEXT_CHARS + 17} chars]`);
    expect(normalizeOcrTextResult("가".repeat(MAX_OCR_TEXT_CHARS + 1), "ko")).toContain(
      `[OCR 텍스트 잘림: 원본 ${MAX_OCR_TEXT_CHARS + 1}자]`,
    );
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

  test("routes red-zone OCR output through a crisis sentinel instead of returning the safety template", async () => {
    mockCallGemini.mockResolvedValueOnce({
      text: "Call 988 now.",
      safety: {
        zone: "red",
        matched: ["suicide"],
        categories: ["crisis"],
        crisisRouting: { hotline: "GLOBAL_988", label: "988", number: "988" },
      },
    } as Awaited<ReturnType<typeof callGemini>>);

    await expect(
      ocrImageAsset("u1", "en", {
        mimeType: "image/png",
        base64: PNG_IMAGE_BASE64,
      }),
    ).rejects.toThrow(IMAGE_OCR_CRISIS_RESULT_ERROR);
  });

  test("normalizes common image MIME aliases before calling Gemini", async () => {
    await ocrImageAsset("u1", "en", {
      mimeType: "IMAGE/JPG; charset=binary",
      base64: JPEG_IMAGE_BASE64,
    });

    expect(mockCallGemini).toHaveBeenCalledWith(
      expect.objectContaining({
        image: { mimeType: "image/jpeg", data: JPEG_IMAGE_BASE64 },
      }),
    );
    expect(normalizeOcrImageMimeType(" image/x-png ; version=1 ")).toBe("image/png");
    expect(normalizeOcrImageMimeType(undefined)).toBe("image/jpeg");
    expect(normalizeOcrImagePayload({ base64: PNG_IMAGE_BASE64 }).mimeType).toBe("image/png");
  });

  test("accepts data URL image payloads and strips the prefix before calling Gemini", async () => {
    await ocrImageAsset("u1", "en", {
      mimeType: "",
      base64: `data:image/x-png;charset=utf-8;base64, ${PNG_IMAGE_BASE64.slice(0, 8)}\n${PNG_IMAGE_BASE64.slice(8)}`,
    });

    expect(mockCallGemini).toHaveBeenCalledWith(
      expect.objectContaining({
        image: { mimeType: "image/png", data: PNG_IMAGE_BASE64 },
      }),
    );
    expect(normalizeOcrImagePayload({ base64: `data:image/png;base64,${PNG_IMAGE_BASE64}` })).toEqual({
      mimeType: "image/png",
      base64: PNG_IMAGE_BASE64,
    });
    expect(normalizeOcrImagePayload({
      mimeType: "application/octet-stream",
      base64: `data:image/png;base64,${PNG_IMAGE_BASE64}`,
    })).toEqual({
      mimeType: "image/png",
      base64: PNG_IMAGE_BASE64,
    });
  });

  test("accepts generic data URL image payloads by sniffing the image signature", async () => {
    await ocrImageAsset("u1", "en", {
      mimeType: "",
      base64: `data:application/octet-stream;base64,${PNG_IMAGE_BASE64}`,
    });

    expect(mockCallGemini).toHaveBeenCalledWith(
      expect.objectContaining({
        image: { mimeType: "image/png", data: PNG_IMAGE_BASE64 },
      }),
    );
    expect(normalizeOcrImagePayload({
      base64: `data:application/octet-stream;base64,${PNG_IMAGE_BASE64}`,
    })).toEqual({
      mimeType: "image/png",
      base64: PNG_IMAGE_BASE64,
    });
    expect(normalizeOcrImagePayload({
      mimeType: "image/png",
      base64: `data:application/octet-stream;base64,${PNG_IMAGE_BASE64}`,
    })).toEqual({
      mimeType: "image/png",
      base64: PNG_IMAGE_BASE64,
    });
    expect(normalizeOcrImagePayload({
      base64: `data:;base64,${PNG_IMAGE_BASE64}`,
    })).toEqual({
      mimeType: "image/png",
      base64: PNG_IMAGE_BASE64,
    });
    expect(() => normalizeOcrImagePayload({
      mimeType: "image/jpeg",
      base64: `data:application/octet-stream;base64,${PNG_IMAGE_BASE64}`,
    })).toThrow(IMAGE_OCR_INVALID_DATA_ERROR);
  });

  test("rejects malformed or unsupported data URL image payloads before calling Gemini", async () => {
    await expect(
      ocrImageAsset("u1", "en", {
        mimeType: "",
        base64: `data:image/png,${PNG_IMAGE_BASE64}`,
      }),
    ).rejects.toThrow(IMAGE_OCR_INVALID_DATA_ERROR);

    await expect(
      ocrImageAsset("u1", "en", {
        mimeType: "",
        base64: `data:base64,${PNG_IMAGE_BASE64}`,
      }),
    ).rejects.toThrow(IMAGE_OCR_INVALID_DATA_ERROR);

    await expect(
      ocrImageAsset("u1", "en", {
        mimeType: "image/jpeg",
        base64: `data:image/jpeg;base64,%E0%A4%A`,
      }),
    ).rejects.toThrow(IMAGE_OCR_INVALID_DATA_ERROR);

    await expect(
      ocrImageAsset("u1", "en", {
        mimeType: "",
        base64: `data:image/gif;base64,${PNG_IMAGE_BASE64}`,
      }),
    ).rejects.toThrow(IMAGE_OCR_UNSUPPORTED_TYPE_ERROR);

    await expect(
      ocrImageAsset("u1", "en", {
        mimeType: "image/gif",
        base64: `data:image/png;base64,${PNG_IMAGE_BASE64}`,
      }),
    ).rejects.toThrow(IMAGE_OCR_UNSUPPORTED_TYPE_ERROR);

    await expect(
      ocrImageAsset("u1", "en", {
        mimeType: "image/jpeg",
        base64: `data:image/png;base64,${PNG_IMAGE_BASE64}`,
      }),
    ).rejects.toThrow(IMAGE_OCR_INVALID_DATA_ERROR);

    expect(mockCallGemini).not.toHaveBeenCalled();
  });

  test("rejects known unsupported image signatures without declared MIME before calling Gemini", async () => {
    await expect(
      ocrImageAsset("u1", "en", {
        mimeType: "",
        base64: `data:application/octet-stream;base64,${GIF_IMAGE_BASE64}`,
      }),
    ).rejects.toThrow(IMAGE_OCR_UNSUPPORTED_TYPE_ERROR);

    expect(() => normalizeOcrImagePayload({
      base64: GIF_IMAGE_BASE64,
    })).toThrow(IMAGE_OCR_UNSUPPORTED_TYPE_ERROR);

    expect(() => normalizeOcrImagePayload({
      base64: `data:application/octet-stream;base64,${AVIF_IMAGE_BASE64}`,
    })).toThrow(IMAGE_OCR_UNSUPPORTED_TYPE_ERROR);

    expect(mockCallGemini).not.toHaveBeenCalled();
  });

  test("uses a domain-aware OCR prompt for tables, units, and uncertain text", async () => {
    await ocrImageAsset("u1", "en", {
      mimeType: "image/png",
      base64: PNG_IMAGE_BASE64,
    });

    const enPrompt = mockCallGemini.mock.calls[0]![0].user;
    expect(enPrompt).toContain("markdown tables");
    expect(enPrompt).toContain("numeric values");
    expect(enPrompt).toContain("tact time");
    expect(enPrompt).toContain("cycle time");
    expect(enPrompt).toContain("C/T");
    expect(enPrompt).toContain("UPH");
    expect(enPrompt).toContain("by-pass");
    expect(enPrompt).toContain("rework");
    expect(enPrompt).toContain("LOT");
    expect(enPrompt).toContain("WIP");
    expect(enPrompt).toContain("tray");
    expect(enPrompt).toContain("panel");
    expect(enPrompt).toContain("[?]");
    expect(enPrompt).toContain("brief no-text description in English");
    expect(enPrompt).toContain("Do not wrap the answer in code fences.");

    mockCallGemini.mockClear();

    await ocrImageAsset("u1", "ko", {
      mimeType: "image/png",
      base64: PNG_IMAGE_BASE64,
    });

    const koPrompt = mockCallGemini.mock.calls[0]![0].user;
    expect(koPrompt).toContain("마크다운 표");
    expect(koPrompt).toContain("숫자");
    expect(koPrompt).toContain("체크박스");
    expect(koPrompt).toContain("tact time");
    expect(koPrompt).toContain("C/T");
    expect(koPrompt).toContain("UPH");
    expect(koPrompt).toContain("by-pass");
    expect(koPrompt).toContain("LOT");
    expect(koPrompt).toContain("WIP");
    expect(koPrompt).toContain("Keep no-text descriptions in Korean.");
    expect(koPrompt).toContain("brief no-text description in Korean");
    expect(koPrompt).toContain("[?]");
    expect(koPrompt).toContain("Do not wrap the answer in code fences.");
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

    expect(isImageOcrCrisisResultError(new Error(IMAGE_OCR_CRISIS_RESULT_ERROR))).toBe(true);
    expect(isImageOcrCrisisResultError(new Error(IMAGE_OCR_EMPTY_RESULT_ERROR))).toBe(false);
    expect(isImageOcrCrisisResultError("image_ocr_crisis_result")).toBe(false);

    expect(isImageOcrRepickRequiredError(new Error(IMAGE_OCR_TOO_LARGE_ERROR))).toBe(true);
    expect(isImageOcrRepickRequiredError(new Error(IMAGE_OCR_UNSUPPORTED_TYPE_ERROR))).toBe(true);
    expect(isImageOcrRepickRequiredError(new Error(IMAGE_OCR_MISSING_DATA_ERROR))).toBe(true);
    expect(isImageOcrRepickRequiredError(new Error(IMAGE_OCR_INVALID_DATA_ERROR))).toBe(true);
    expect(isImageOcrRepickRequiredError(new Error(IMAGE_CAMERA_PERMISSION_DENIED_ERROR))).toBe(false);
    expect(isImageOcrRepickRequiredError(new Error("network_down"))).toBe(false);
  });
});
