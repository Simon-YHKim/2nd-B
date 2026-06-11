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
import type { CaptureDraft, CaptureDraftMode, CaptureDrafts } from "./draft";

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

function hasRestorableDraft(draft: CaptureDraft): boolean {
  return (
    draft.body.trim().length > 0 ||
    draft.topic.trim().length > 0 ||
    (draft.conclusion ?? "").trim().length > 0
  );
}

export interface ShareConsumeInput {
  /** Hydrated per-mode drafts (draftsRef contents). */
  drafts: CaptureDrafts;
  /** Snapshot of the live fields for the mode the user is leaving. */
  liveDraft: CaptureDraft;
  liveMode: CaptureDraftMode;
  /**
   * True when the hydration restore was skipped because this share was
   * pending: the live fields were never populated, so folding them back in
   * would DELETE the stored draft for the default mode (cold-start share
   * arriving over an existing journal draft - the P1-5 survival contract).
   */
  restoreSkipped: boolean;
  /** Normalized share payload (normalizeSharedCaptureParams().content). */
  content: string;
}

export interface ShareConsumeResult {
  drafts: CaptureDrafts;
  linkclipDraft: CaptureDraft;
}

/**
 * Folds a shared payload into the draft set: the leaving mode's live fields
 * are remembered (unless the restore never ran), and the payload lands in the
 * linkclip draft - appended below existing text, never replacing it.
 */
export function consumeSharedIntoDrafts(input: ShareConsumeInput): ShareConsumeResult {
  const next: CaptureDrafts = { ...input.drafts };
  if (!input.restoreSkipped) {
    // Same semantics as the screen's storeDraftForMode: an all-empty live
    // draft means the user cleared it - the stored copy goes too.
    if (hasRestorableDraft(input.liveDraft)) next[input.liveMode] = input.liveDraft;
    else delete next[input.liveMode];
  }
  const existing = (next.linkclip?.body ?? "").trim();
  const mergedBody =
    existing.length === 0
      ? input.content
      : existing.includes(input.content)
        ? existing
        : `${existing}\n\n${input.content}`;
  const linkclipDraft: CaptureDraft = { body: mergedBody, topic: "", conclusion: "" };
  next.linkclip = linkclipDraft;
  return { drafts: next, linkclipDraft };
}
