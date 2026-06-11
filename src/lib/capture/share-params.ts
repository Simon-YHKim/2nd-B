// Shared-content reception (O-R2 ⑤-i / ⑥-b scrap track).
//
// The PWA manifest (public/manifest.webmanifest) registers /capture as a Web
// Share Target, so Android share sheets open the app at
// /capture?url=&text=&title=. This module normalizes those raw router params
// into a single link-or-clip box payload. Pure + tested; the capture screen
// stays a thin consumer.
//
// Field reality (not the spec): Android apps usually put the link in `text`
// (Chrome shares title + text=url); the spec's `url` field is rarely filled.

import { firstUrlIn } from "../wiki/link-or-clip";

export interface SharedCapturePayload {
  /** Text for the link-or-clip box. A bare URL when the share was link-only. */
  content: string;
  /** Stable identity of the raw params - consumed-once guard across renders. */
  key: string;
}

type ParamValue = string | string[] | undefined;

function first(value: ParamValue): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

const HTTP_URL_RE = /^https?:\/\/\S+$/i;

export function normalizeSharedCaptureParams(params: {
  url?: ParamValue;
  text?: ParamValue;
  title?: ParamValue;
}): SharedCapturePayload | null {
  const rawUrl = first(params.url).trim();
  const rawText = first(params.text).trim();
  const rawTitle = first(params.title).trim();
  if (!rawUrl && !rawText && !rawTitle) return null;

  const urlFromUrl = HTTP_URL_RE.test(rawUrl) ? rawUrl : null;
  const url = urlFromUrl ?? firstUrlIn(rawText);

  const lines: string[] = [];
  if (rawTitle && rawTitle !== url) lines.push(rawTitle);
  if (rawText) lines.push(rawText);
  // Append the link only when the text didn't already carry it, so the box
  // never shows the same URL twice.
  if (url && !lines.some((line) => line.includes(url))) lines.push(url);
  // A non-http `url` param (rare, but shares are user-chosen) still counts as
  // content rather than silently dropping the share.
  if (lines.length === 0 && rawUrl) lines.push(rawUrl);

  const content = lines.join("\n\n").trim();
  if (content.length === 0) return null;
  return { content, key: JSON.stringify([rawUrl, rawText, rawTitle]) };
}
