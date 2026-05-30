// Image OCR via Gemini multimodal.
//
// Flow: pick image (picker) → base64 (built-in) → callGemini({ image })
// → text back. The Edge Function (gemini-proxy) enforces a mime allowlist
// + 2.7MB base64 cap server-side; this client just hands the bytes over.

import * as ImagePicker from "expo-image-picker";

import { callGemini } from "../llm/gemini";

export interface OcrResult {
  /** Markdown transcription (or short description if there was no text). */
  markdown: string;
  /** The image source URI (useful for previews in capture UI). */
  uri: string;
  mimeType: string;
}

const OCR_PROMPT: Record<"en" | "ko", string> = {
  en: "Transcribe all text in this image as clean markdown. Preserve line breaks, headings, and lists where visible. If the image has no readable text, describe what you see in 1–2 sentences in English.",
  ko: "이 이미지의 모든 텍스트를 깔끔한 마크다운으로 옮겨 적어주세요. 줄바꿈·제목·목록 구조는 보이는 대로 유지. 읽을 수 있는 텍스트가 없다면 이미지를 한국어 1-2문장으로 묘사해 주세요.",
};

export async function pickAndOcrImage(
  userId: string,
  locale: "en" | "ko",
  source: "library" | "camera" = "library",
): Promise<OcrResult | null> {
  // Library permission is silently re-prompted by Expo when needed; the
  // camera path needs an explicit permission ask.
  if (source === "camera") {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (cam.status !== "granted") throw new Error("camera_permission_denied");
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
  if (!asset || !asset.base64) return null;

  const reply = await callGemini({
    userId,
    locale,
    purpose: "capture_ocr",
    user: OCR_PROMPT[locale],
    image: { mimeType: asset.mimeType ?? "image/jpeg", data: asset.base64 },
  });

  return {
    markdown: reply.text,
    uri: asset.uri,
    mimeType: asset.mimeType ?? "image/jpeg",
  };
}
