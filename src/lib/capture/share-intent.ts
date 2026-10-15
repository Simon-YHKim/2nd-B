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
// normalizeSharedCaptureParams in ./share-params.ts), plus the marker from=share.
// Every other link passes through unchanged, byte for byte, so ordinary deep
// links, sign-in and password-reset links and the web are not affected.
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
// config plugin also reads. Nothing here logs the link or its text.
//
// Who may fill (Simon 2026-10-07 12:04, "번호 · 대기 없이 다시"): the app's
// existing gates decide, and nothing here or on the capture screen adds a
// second decision. If the gates show /capture (signed in, profile complete, no
// password reset, avatar set up), the capture screen fills its input from the
// params as it always has. If a gate sends the route elsewhere, that redirect
// drops the params as it does for any link, and the screen it lands on shows
// one line saying the share was not added (SHARE_REFUSED_PARAMS below). There
// is no delivery id, no registry and no waiting state: a share that is not
// filled is gone.

import contract from "./share-intent-contract.json";

export const SHARE_INTENT_HOST: string = contract.host;
export const SHARE_TEXT_MAX_CHARS: number = contract.maxTextChars;
export const SHARE_TITLE_MAX_CHARS: number = contract.maxTitleChars;
export const SHARE_TRUNCATION_MARKER: string = contract.truncationMarker;

const TEXT_PARAM: string = contract.textParam;
const TITLE_PARAM: string = contract.titleParam;

/**
 * The marker the rewrite adds to its /capture link. It has no value of its own
 * and grants nothing: the capture screen does not read it. Its only use is to
 * pick the one-line notice when a gate turns the route away, so a forged
 * marker (any app can open such a link) shows that line and does nothing else.
 */
export const SHARE_MARKER_PARAM = "from";
export const SHARE_MARKER_VALUE = "share";

/** The param a gate adds to the screen it sends a marked /capture to. */
export const SHARE_REFUSED_PARAMS = { notice: "shareRefused" } as const;

/**
 * Longest share-intent link that is read at all. MainActivity caps text and
 * title before it builds the link, and Uri.Builder writes one UTF-16 unit as
 * at most nine characters (three UTF-8 bytes, %XX each), so nothing it builds
 * is longer. Any app can also open <scheme>://share-intent as a VIEW link and
 * skip that cap (gate SG-02): a longer link is turned into an empty capture
 * screen here, before any part of it is decoded.
 */
export const SHARE_LINK_MAX_CHARS = 9 * (SHARE_TEXT_MAX_CHARS + SHARE_TITLE_MAX_CHARS) + 256;

/** text and title, each written with every letter as %XX, is the longest key read. */
const MAX_KEY_CHARS = 3 * Math.max(TEXT_PARAM.length, TITLE_PARAM.length);

const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*$/i;

/** `<any scheme>://share-intent`, then the end, a path, a query or a fragment. */
function isSharedIntentUrl(url: string): boolean {
  const sep = url.indexOf("://");
  if (sep <= 0 || !URL_SCHEME_RE.test(url.slice(0, sep))) return false;
  const hostStart = sep + 3;
  if (url.slice(hostStart, hostStart + SHARE_INTENT_HOST.length).toLowerCase() !== SHARE_INTENT_HOST) return false;
  const next = url.charAt(hostStart + SHARE_INTENT_HOST.length);
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
 * entry, coach, from) are ignored, so a crafted link cannot steer the capture
 * screen. Only those two values are ever decoded: a key is decoded only when it
 * is short enough to spell one of them, and every other value is skipped
 * unread. A link longer than SHARE_LINK_MAX_CHARS reads as empty.
 */
export function parseSharedIntentUrl(url: string): SharedIntentFields | null {
  if (!isSharedIntentUrl(url)) return null;
  if (url.length > SHARE_LINK_MAX_CHARS) return { text: "", title: "" };
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
    const rawKey = eq < 0 ? pair : pair.slice(0, eq);
    if (rawKey.length > MAX_KEY_CHARS) continue;
    const key = decodeQueryComponent(rawKey);
    const wanted = (key === TEXT_PARAM && text === null) || (key === TITLE_PARAM && title === null);
    if (!wanted) continue;
    const value = decodeQueryComponent(eq < 0 ? "" : pair.slice(eq + 1));
    if (value === null) continue;
    if (key === TEXT_PARAM) text = value;
    else title = value;
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

/**
 * `/capture?text=&title=&from=share`, so the capture screen reads back exactly
 * these strings. Bare `/capture` when both are empty: nothing was shared, so
 * there is nothing to fill and nothing to say. Throws URIError on a lone
 * surrogate.
 */
export function captureHrefForSharedIntent(fields: SharedIntentFields): string {
  const parts: string[] = [];
  if (fields.text) parts.push(`${TEXT_PARAM}=${captureQueryValue(fields.text)}`);
  if (fields.title) parts.push(`${TITLE_PARAM}=${captureQueryValue(fields.title)}`);
  if (parts.length === 0) return "/capture";
  parts.push(`${SHARE_MARKER_PARAM}=${SHARE_MARKER_VALUE}`);
  return `/capture?${parts.join("&")}`;
}

/**
 * expo-router `redirectSystemPath` body. Must not throw (expo-router does not
 * catch it): a share link that cannot be read still opens an empty capture
 * screen, and any other link is returned exactly as it came in.
 */
export function redirectSharedIntentPath(path: string): string {
  let fields: SharedIntentFields | null;
  try {
    fields = parseSharedIntentUrl(path);
  } catch {
    return path;
  }
  if (fields === null) return path;
  try {
    return captureHrefForSharedIntent(fields);
  } catch {
    return "/capture";
  }
}

const hasContent = (value: unknown): boolean => typeof value === "string" && value.trim().length > 0;

/**
 * Whether /capture route params came from the share rewrite with something in
 * them: the marker plus a text or title. A marker whose text was already taken
 * into the input (the screen strips text and title once the draft is saved) no
 * longer counts.
 */
export function carriesShareMarker(params: Readonly<Record<string, unknown>>): boolean {
  if (params[SHARE_MARKER_PARAM] !== SHARE_MARKER_VALUE) return false;
  return hasContent(params[TEXT_PARAM]) || hasContent(params[TITLE_PARAM]);
}

/** carriesShareMarker for a gate that sees the whole route: only /capture counts. */
export function isMarkedShareCapture(pathname: string, params: Readonly<Record<string, unknown>>): boolean {
  return pathname === "/capture" && carriesShareMarker(params);
}

/**
 * A gate's Redirect target. Unchanged (the same string as before) unless the
 * route it turns away is a marked share; then the same pathname with
 * SHARE_REFUSED_PARAMS, so the screen it lands on shows the one line.
 */
export function shareRefusedHref<P extends string>(
  pathname: P,
  refused: boolean,
): P | { pathname: P; params: typeof SHARE_REFUSED_PARAMS } {
  return refused ? { pathname, params: SHARE_REFUSED_PARAMS } : pathname;
}

/** Destination screens: whether to show the one line. */
export function showsShareRefused(params: Readonly<Record<string, unknown>>): boolean {
  return params.notice === SHARE_REFUSED_PARAMS.notice;
}
