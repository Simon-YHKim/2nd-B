// Android share sheet -> /capture (Simon decision Q-261005-05 = A, 2026-10-05).
//
// The native Android app is a share target for ACTION_SEND text/plain
// (config-plugins/withAndroidShareTarget.js). Before React Native reads the
// intent, MainActivity turns it into the app's own deep link
//   <scheme>://share-intent?text=<EXTRA_TEXT>&title=<EXTRA_SUBJECT>
// percent-encoded once by android.net.Uri.Builder. src/app/+native-intent.ts
// hands every incoming system link to redirectSharedIntentPath below, which
// maps that one link to the capture route's existing query, /capture?text=&title=
// (the same params the PWA Web Share Target sends, read by
// normalizeSharedCaptureParams in ./share-params.ts). Every other link passes
// through unchanged, so ordinary deep links and the web are not affected.
//
// Why a separate host instead of <scheme>://capture?text= directly: expo-router's
// native deep-link step (fork/extractPathFromURL.js fromDeepLink) decodes each
// query value, joins them back WITHOUT re-encoding, and the router then parses
// that query a second time. Measured 2026-10-05 against the installed
// expo-router 56.2.12: "50% off" throws URIError, "C++" loses both plus signs,
// "a&mode=ocr" injects a mode param, "#tag" cuts the text, newlines vanish.
// A path that starts with "/" is returned as-is by that step and parsed once,
// so this module returns one. Parsing is not the last decode, though:
// useLocalSearchParams (expo-router/build/hooks/useLocalSearchParams.js) runs
// decodeURIComponent over every value the parse produced, so a value encoded
// once lost its own escapes on the way to the screen ("100%41" arrived as
// "100A", "https://ko.wikipedia.org/wiki/%EB%B6%81" arrived with the Korean
// decoded). Each value is therefore encoded twice: the parse removes one
// layer, the hook the other. (__tests__/share-intent.test.ts runs the real
// expo-router functions and applies the hook's decode.)
//
// Shared text is untrusted input from another app, and any app or web page can
// open the deep link directly. It fills the capture input, and the capture
// screen keeps it in its on-device draft as it does typed text (per account:
// encrypted storage on native, localStorage on the web). No record is created
// and the text goes to no model until the person presses save, and the save
// path runs the safety classifier (C9) as before. Lengths are capped here as
// well as natively; the numbers live in ./share-intent-contract.json, which the
// config plugin also reads.
//
// It fills the input only for someone signed in with a complete profile and no
// password reset under way (Simon 2026-10-07). The capture link therefore also
// carries a delivery id (./share-delivery.ts), registered here when the link is
// rewritten; the capture screen reads the text only for an id accepted for the
// account on screen. Any other incoming link that carries a shareDelivery param
// gets one more, unreadable, shareDelivery value, so an id only ever comes from
// this rewrite (gate SHARE-A1-02). Nothing here logs the link or its text.

import contract from "./share-intent-contract.json";
import { SHARE_DELIVERY_PARAM, registerShareDelivery } from "./share-delivery";

export const SHARE_INTENT_HOST: string = contract.host;
export const SHARE_TEXT_MAX_CHARS: number = contract.maxTextChars;
export const SHARE_TITLE_MAX_CHARS: number = contract.maxTitleChars;
export const SHARE_TRUNCATION_MARKER: string = contract.truncationMarker;

const TEXT_PARAM: string = contract.textParam;
const TITLE_PARAM: string = contract.titleParam;

const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*$/i;

/** `<any scheme>://share-intent`, then the end, a path, a query or a fragment. */
function isSharedIntentUrl(url: string): boolean {
  const sep = url.indexOf("://");
  if (sep <= 0 || !URL_SCHEME_RE.test(url.slice(0, sep))) return false;
  const rest = url.slice(sep + 3);
  if (rest.slice(0, SHARE_INTENT_HOST.length).toLowerCase() !== SHARE_INTENT_HOST) return false;
  const next = rest.charAt(SHARE_INTENT_HOST.length);
  return next === "" || next === "/" || next === "?" || next === "#";
}

export interface SharedIntentFields {
  /** EXTRA_TEXT, trimmed and capped. Empty when absent. */
  text: string;
  /** EXTRA_SUBJECT, trimmed and capped. Empty when absent. */
  title: string;
}

/**
 * Trims, then caps at `max` UTF-16 units. A cut keeps surrogate pairs whole and
 * ends with the marker, so the person sees that the share was shortened. The
 * result is never longer than `max`, so a second pass (native, then here) does
 * not cut again.
 */
export function clipSharedField(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  let end = max - SHARE_TRUNCATION_MARKER.length;
  const last = trimmed.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return `${trimmed.slice(0, end).trimEnd()}${SHARE_TRUNCATION_MARKER}`;
}

/** Form-style decode ("+" is a space). Malformed escapes drop that value. */
function decodeQueryComponent(raw: string): string | null {
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return null;
  }
}

/**
 * Reads text/title from a `<scheme>://share-intent?...` link. Returns null for
 * any other link. Only the first text and title count; other params (mode, tag,
 * entry, coach) are ignored, so a crafted link cannot steer the capture screen.
 */
export function parseSharedIntentUrl(url: string): SharedIntentFields | null {
  if (!isSharedIntentUrl(url)) return null;
  // The fragment starts at the first "#", so a "?" after it belongs to the
  // fragment: only a "?" before it starts the query.
  const hashStart = url.indexOf("#");
  const beforeFragment = hashStart < 0 ? url : url.slice(0, hashStart);
  const queryStart = beforeFragment.indexOf("?");
  const query = queryStart < 0 ? "" : beforeFragment.slice(queryStart + 1);
  let text: string | null = null;
  let title: string | null = null;
  for (const pair of query.split("&")) {
    if (pair.length === 0) continue;
    const eq = pair.indexOf("=");
    const key = decodeQueryComponent(eq < 0 ? pair : pair.slice(0, eq));
    const value = decodeQueryComponent(eq < 0 ? "" : pair.slice(eq + 1));
    if (key === null || value === null) continue;
    if (key === TEXT_PARAM && text === null) text = value;
    else if (key === TITLE_PARAM && title === null) title = value;
  }
  return {
    text: clipSharedField(text ?? "", SHARE_TEXT_MAX_CHARS),
    title: clipSharedField(title ?? "", SHARE_TITLE_MAX_CHARS),
  };
}

/**
 * One query value for a `/capture` path: encoded twice, once for expo-router's
 * query parse and once for useLocalSearchParams' own decode (header above).
 * Throws URIError on a lone surrogate, as encodeURIComponent does.
 */
function captureQueryValue(value: string): string {
  return encodeURIComponent(encodeURIComponent(value));
}

/** text/title as `/capture` query parts. Throws URIError on a lone surrogate. */
function sharedQueryParts(fields: SharedIntentFields): string[] {
  const parts: string[] = [];
  if (fields.text) parts.push(`${TEXT_PARAM}=${captureQueryValue(fields.text)}`);
  if (fields.title) parts.push(`${TITLE_PARAM}=${captureQueryValue(fields.title)}`);
  return parts;
}

/**
 * `/capture?text=&title=&shareDelivery=`, so the capture screen reads back
 * exactly these strings for this delivery. Bare `/capture` when both are empty:
 * nothing was shared, so there is nothing to decide.
 */
export function captureHrefForSharedIntent(fields: SharedIntentFields, deliveryId?: number): string {
  const parts = sharedQueryParts(fields);
  if (parts.length === 0) return "/capture";
  if (deliveryId !== undefined) parts.push(`${SHARE_DELIVERY_PARAM}=${deliveryId}`);
  return `/capture?${parts.join("&")}`;
}

/**
 * Whether a link could reach the router with a shareDelivery param. expo-router
 * decodes query keys more than once on native (fromDeepLink, then the query
 * parse), so every layer of %XX escapes is undone before looking. Letter case
 * is ignored. Over-matching is harmless: it only makes a share id unreadable.
 */
function mentionsDeliveryParam(link: string): boolean {
  const needle = SHARE_DELIVERY_PARAM.toLowerCase();
  let current = link;
  for (let pass = 0; pass < 8; pass += 1) {
    if (current.toLowerCase().includes(needle)) return true;
    const next = current.replace(/%([0-9a-f]{2})/gi, (_escape, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    if (next === current) return false;
    current = next;
  }
  return true;
}

/**
 * The link with `shareDelivery=0` added to its query. With the param it already
 * carries, the screen reads two values (or "0"), which parseShareDeliveryId
 * rejects, so the capture screen drops the shared text instead of filling it.
 */
function withUnreadableDeliveryParam(link: string): string {
  const hashAt = link.indexOf("#");
  const head = hashAt < 0 ? link : link.slice(0, hashAt);
  const fragment = hashAt < 0 ? "" : link.slice(hashAt);
  const joiner = !head.includes("?") ? "?" : /[?&]$/.test(head) ? "" : "&";
  return `${head}${joiner}${SHARE_DELIVERY_PARAM}=0${fragment}`;
}

/**
 * expo-router `redirectSystemPath` body. Must not throw (expo-router does not
 * catch it): a share link that cannot be read still opens an empty capture
 * screen. Any other link is returned exactly as it came in, unless it carries
 * a shareDelivery param: only this rewrite issues delivery ids, so one that
 * arrives from outside is made unreadable. A share with text gets a delivery id
 * (./share-delivery.ts), registered only once its link is built, so an id
 * always stands for a share that reached the router.
 */
export function redirectSharedIntentPath(path: string): string {
  let fields: SharedIntentFields | null;
  try {
    fields = parseSharedIntentUrl(path);
  } catch {
    return path;
  }
  if (fields === null) return mentionsDeliveryParam(path) ? withUnreadableDeliveryParam(path) : path;
  let parts: string[];
  try {
    parts = sharedQueryParts(fields);
  } catch {
    return "/capture";
  }
  if (parts.length === 0) return "/capture";
  parts.push(`${SHARE_DELIVERY_PARAM}=${registerShareDelivery()}`);
  return `/capture?${parts.join("&")}`;
}
