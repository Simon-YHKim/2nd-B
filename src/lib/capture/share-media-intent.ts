import contract from "./share-media-contract.json";

export type SharedMediaKind = "image" | "audio";
export type SharedMediaError = "multiple" | "unreadable" | "unavailable";
const TOKEN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export function sharedMediaToken(value: unknown): string | null {
  return typeof value === "string" && value.length === 36 && TOKEN.test(value) ? value : null;
}

export function sharedMediaError(value: unknown): SharedMediaError | null {
  return value === "multiple" || value === "unreadable" || value === "unavailable" ? value : null;
}

/** Only a short opaque handle reaches the router, never a file/provider URI. */
export function redirectSharedMediaPath(path: string): string | null {
  const host = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)(?:[/?#]|$)/i.exec(path)?.[1];
  if (host?.toLowerCase() !== contract.host) return null;
  if (path.length > 2048) return "/capture?sharedMediaError=unavailable&mode=ocr&from=share";
  try {
    const parsed = new URL(path);
    const kind = parsed.searchParams.get("kind");
    const token = sharedMediaToken(parsed.searchParams.get("media"));
    const error = sharedMediaError(parsed.searchParams.get("error"));
    const route = kind === "audio" ? "/call-reflection" : "/capture";
    const mode = kind === "audio" ? "" : "&mode=ocr";
    const field = token && (kind === "audio" || kind === "image") && !error
      ? `sharedMedia=${token}` : `sharedMediaError=${error ?? "unavailable"}`;
    return `${route}?${field}${mode}&from=share`;
  } catch {
    return "/capture?sharedMediaError=unavailable&mode=ocr&from=share";
  }
}
