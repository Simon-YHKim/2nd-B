// Android share sheet -> /capture, JS half (Q-261005-05). The native half is
// config-plugins/withAndroidShareTarget.js (scripts/__tests__/android-share-target.test.ts).
//
// The link MainActivity builds is percent-encoded once by android.net.Uri.Builder.
// Uri.encode leaves letters, digits and "_-!.~'()*" alone and encodes the rest
// as UTF-8 escapes - the same set encodeURIComponent leaves alone - so
// encodeURIComponent stands in for it here.
//
// The round trips below run expo-router's own native deep-link functions (the
// installed build), because that is where a share used to break.
//
// Who may fill is decided by the app's existing gates only (Simon 2026-10-07
// 12:04). The share link carries one marker, from=share, which picks a one-line
// notice when a gate turns /capture away and does nothing else. There is no
// delivery id and no registry (the gate-runner for the redirects is
// src/app/__tests__/profile-probe-route-hold.test.ts).

import { readFileSync } from "fs";

import contract from "../share-intent-contract.json";
import { normalizeSharedCaptureParams } from "../share-params";
import {
  SHARE_INTENT_HOST,
  SHARE_LINK_MAX_CHARS,
  SHARE_MARKER_PARAM,
  SHARE_MARKER_VALUE,
  SHARE_REFUSED_PARAMS,
  SHARE_TEXT_MAX_CHARS,
  SHARE_TITLE_MAX_CHARS,
  SHARE_TRUNCATION_MARKER,
  captureHrefForSharedIntent,
  carriesShareMarker,
  clipSharedField,
  isMarkedShareCapture,
  parseSharedIntentUrl,
  redirectSharedIntentPath,
  shareRefusedHref,
  showsShareRefused,
} from "../share-intent";
import { redirectSystemPath } from "../../../app/+native-intent";

// expo-router internals, plain CommonJS. extractExpoPathFromURL turns the system
// link into the path the router matches; parseQueryParams is what becomes
// useLocalSearchParams.
const { extractExpoPathFromURL } = require("expo-router/build/fork/extractPathFromURL") as {
  extractExpoPathFromURL: (prefixes: string[], url: string) => string;
};
const { parseQueryParams } = require("expo-router/build/fork/getStateFromPath-forks") as {
  parseQueryParams: (
    path: string,
    route: { params?: Record<string, unknown> },
  ) => Record<string, string | string[]> | undefined;
};

// useLocalSearchParams then decodes every parsed value once more. Same code as
// expo-router/build/hooks/useLocalSearchParams.js, which reads React context
// and so cannot run here; the premise test below reads that file.
function decodeLikeUseLocalSearchParams(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** What the capture screen reads for a system link, as expo-router does it on native. */
function routeParams(systemUrl: string): { path: string; params: Record<string, string | string[]> } {
  const redirected = redirectSystemPath({ path: systemUrl, initial: true });
  let path = extractExpoPathFromURL([], redirected);
  if (!path.startsWith("/")) path = `/${path}`;
  const parsed = parseQueryParams(path, {}) ?? {};
  const params = Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.map(decodeLikeUseLocalSearchParams) : decodeLikeUseLocalSearchParams(value),
    ]),
  );
  return { path: path.replace(/\?.*$/, ""), params };
}

/** The link MainActivity builds for EXTRA_TEXT / EXTRA_SUBJECT. */
function sendLink(text?: string, subject?: string): string {
  const parts: string[] = [];
  if (text !== undefined) parts.push(`text=${encodeURIComponent(text)}`);
  if (subject !== undefined) parts.push(`title=${encodeURIComponent(subject)}`);
  return `secondbrain://${SHARE_INTENT_HOST}${parts.length > 0 ? `?${parts.join("&")}` : ""}`;
}

const HARD_TEXTS = [
  "50% off https://shop.example/a?b=1&c=2",
  "C++ & Rust #tips",
  "a=b&mode=ocr&tag=x&entry=firstRun&coach=1&from=evil",
  "line one\nline two\n\nline four",
  "100%41 and %E0%A4%A",
  // Escapes that are valid on their own: the screen's extra decode used to eat them.
  "100%41",
  "https://ko.wikipedia.org/wiki/%EB%B6%81%EA%B7%B9%EC%84%B1",
  "https://example.com/search?q=a%26b&next=%2Fhome%3Fx%3D1",
  "한글 공유 😀 그리고 'quotes' (parens) *star* ~tilde!",
  "  padded  ",
];

describe("Android share hand-off through expo-router (round trip)", () => {
  test.each(HARD_TEXTS)("text arrives at /capture exactly as shared: %j", (text) => {
    const { path, params } = routeParams(sendLink(text));
    expect(path).toBe("/capture");
    expect(params.text).toBe(text.trim());
    // Nothing in the text can add a param the capture screen acts on; the only
    // other param is the marker.
    expect(params).toEqual({ text: text.trim(), [SHARE_MARKER_PARAM]: SHARE_MARKER_VALUE });
  });

  test("EXTRA_SUBJECT becomes the title param next to the text", () => {
    const { params } = routeParams(sendLink("https://example.com/a", "An article: 50% & more"));
    expect(params).toEqual({
      text: "https://example.com/a",
      title: "An article: 50% & more",
      [SHARE_MARKER_PARAM]: SHARE_MARKER_VALUE,
    });
  });

  test("a crafted share link cannot set the marker or any other param", () => {
    const crafted = `secondbrain://${SHARE_INTENT_HOST}?${SHARE_MARKER_PARAM}=evil&text=a&mode=ocr&title=t&${SHARE_MARKER_PARAM}=x`;
    expect(routeParams(crafted).params).toEqual({ text: "a", title: "t", [SHARE_MARKER_PARAM]: SHARE_MARKER_VALUE });
  });

  test("Chrome-style share (subject = page title, text = url) composes the capture box", () => {
    const { params } = routeParams(sendLink("https://example.com/a", "An article"));
    const payload = normalizeSharedCaptureParams({ text: params.text, title: params.title });
    expect(payload?.content).toBe("An article\n\nhttps://example.com/a");
  });

  test("a subject-only share still opens the capture box with the subject", () => {
    const { params } = routeParams(sendLink(undefined, "only a subject"));
    expect(normalizeSharedCaptureParams({ title: params.title })?.content).toBe("only a subject");
    expect(carriesShareMarker(params)).toBe(true);
  });

  test("a share link with nothing in it opens an empty capture screen, unmarked", () => {
    expect(routeParams(sendLink()).path).toBe("/capture");
    expect(routeParams(sendLink()).params).toEqual({});
    expect(redirectSharedIntentPath("secondbrain://share-intent?text=%20%20")).toBe("/capture");
  });

  // Premise of the separate host (share-intent.ts header). If an expo-router
  // upgrade stops double-decoding, this fails on purpose: the hand-off still
  // works, but the comment that explains it is then out of date.
  test("premise: a plain capture link is lossy in expo-router's native path", () => {
    const plain = (text: string) => `secondbrain://capture?text=${encodeURIComponent(text)}`;
    expect(() => extractExpoPathFromURL([], plain("50% off"))).toThrow(URIError);
    const injected = parseQueryParams(`/${extractExpoPathFromURL([], plain("a&mode=ocr"))}`, {});
    expect(injected).toEqual({ text: "a", mode: "ocr" });
  });

  // Premise of the double encoding (captureHrefForSharedIntent). The routeParams
  // helper copies this hook's decode; if an expo-router upgrade drops it, this
  // fails so the encoding goes back to once.
  test("premise: useLocalSearchParams decodes each parsed value once more", () => {
    const hook = readFileSync(require.resolve("expo-router/build/hooks/useLocalSearchParams.js"), "utf8");
    expect(hook).toContain("return [key, decodeURIComponent(value)];");
  });
});

describe("redirectSharedIntentPath leaves every other link alone, byte for byte", () => {
  test.each([
    "secondbrain://capture?text=hello",
    "secondbrain://",
    "secondbrain://share-intentx?text=a",
    "secondbrain:/share-intent?text=a",
    "/share-intent?text=a",
    "share-intent?text=a",
    "https://example.com/share-intent?text=a",
    "exp+2nd-brain://expo-development-client/?url=x",
    "",
  ])("%j is returned unchanged", (link) => {
    expect(redirectSharedIntentPath(link)).toBe(link);
    expect(redirectSystemPath({ path: link, initial: false })).toBe(link);
  });

  // The sign-in and password-reset callbacks this app receives. They are not
  // share links, so they pass through untouched (gate FIN-01 / W5-R3-02: the
  // auth link path stays as it is on main).
  test.each([
    "secondbrain:///?code=abc",
    "secondbrain:///reset-password?code=abc",
    "secondbrain://oauth-callback?code=abc&state=xyz",
    "secondbrain:///reset-password#access_token=t&type=recovery",
    "secondbrain:///reset-password?code=a%2Bb%3D",
    "secondbrain://oauth-callback?code=abc&state=%257B%2522next%2522%253A%2522%252Fcapture%2522%257D",
  ])("auth callback %j is returned unchanged", (link) => {
    expect(redirectSystemPath({ path: link, initial: true })).toBe(link);
    expect(redirectSystemPath({ path: link, initial: false })).toBe(link);
  });

  // Gate SG-03 / SHARE-A2-01: the delivery registry looked for its reserved key
  // anywhere in every incoming link, so a text or fragment that merely said
  // "shareDelivery" lost its text. With the registry gone there is no reserved
  // key: these come back unchanged, and the router reads the text as written.
  test.each([
    "secondbrain://capture?text=shareDelivery",
    "secondbrain://capture?text=hello#shareDelivery",
    "secondbrain://capture?text=NEW&shareDelivery=1",
    "secondbrain://capture?text=50%25%20off%20%2523tag",
  ])("a link that mentions the old reserved word, %j, is not touched", (link) => {
    expect(redirectSystemPath({ path: link, initial: false })).toBe(link);
  });

  test("a plain capture link that carries the marker is not rewritten either", () => {
    // Any app can open such a link. It reaches the capture screen as on main;
    // the marker only changes which line a gate's destination shows.
    const forged = `secondbrain://capture?text=x&${SHARE_MARKER_PARAM}=${SHARE_MARKER_VALUE}`;
    expect(redirectSystemPath({ path: forged, initial: true })).toBe(forged);
  });

  test("any scheme, any letter case, with or without a slash before the query", () => {
    const marker = `${SHARE_MARKER_PARAM}=${SHARE_MARKER_VALUE}`;
    expect(redirectSharedIntentPath("exp+2nd-brain://share-intent?text=a")).toBe(`/capture?text=a&${marker}`);
    expect(redirectSharedIntentPath("SecondBrain://Share-Intent/?text=a")).toBe(`/capture?text=a&${marker}`);
    expect(redirectSharedIntentPath("secondbrain://share-intent#frag")).toBe("/capture");
  });
});

describe("parseSharedIntentUrl reads crafted links defensively", () => {
  test("first text/title win, other params are dropped", () => {
    expect(
      parseSharedIntentUrl("secondbrain://share-intent?mode=ocr&text=a&text=b&tag=x&title=t&title=u&entry=firstRun"),
    ).toEqual({ text: "a", title: "t" });
  });

  test("a raw plus is a space (form decoding); %2B is a plus", () => {
    expect(parseSharedIntentUrl("secondbrain://share-intent?text=a+b%2Bc")?.text).toBe("a b+c");
  });

  test("an escaped key still counts", () => {
    expect(parseSharedIntentUrl("secondbrain://share-intent?%74%65%78%74=a&%74%69%74%6C%65=b")).toEqual({
      text: "a",
      title: "b",
    });
  });

  test("a malformed escape drops that value instead of throwing, and a later one can still count", () => {
    expect(parseSharedIntentUrl("secondbrain://share-intent?text=%E0%A4%A&title=ok")).toEqual({
      text: "",
      title: "ok",
    });
    expect(parseSharedIntentUrl("secondbrain://share-intent?text=%ZZ&text=b")).toEqual({ text: "b", title: "" });
    expect(redirectSharedIntentPath("secondbrain://share-intent?text=%ZZ")).toBe("/capture");
  });

  test("the fragment is not part of the query", () => {
    expect(parseSharedIntentUrl("secondbrain://share-intent?text=a#title=b")).toEqual({ text: "a", title: "" });
  });

  test("a ? inside the fragment does not start a query (gate ST-R1-04 / W5-R2-01)", () => {
    // URL order is query, then fragment: everything after the first # is the
    // fragment, so text/title written there are not shared fields.
    expect(parseSharedIntentUrl("secondbrain://share-intent#note?text=x&title=y")).toEqual({ text: "", title: "" });
    expect(redirectSharedIntentPath("secondbrain://share-intent#note?text=x")).toBe("/capture");
    expect(parseSharedIntentUrl("secondbrain://share-intent/#?text=x")).toEqual({ text: "", title: "" });
    // A real query before the fragment still counts, and a second ? in the
    // fragment does not override it.
    expect(parseSharedIntentUrl("secondbrain://share-intent?text=a#frag?text=b&title=c")).toEqual({
      text: "a",
      title: "",
    });
  });
});

describe("length caps (shared text is untrusted input)", () => {
  test("text is capped at SHARE_TEXT_MAX_CHARS and marked as shortened", () => {
    const { params } = routeParams(sendLink("가".repeat(SHARE_TEXT_MAX_CHARS + 500)));
    const text = params.text as string;
    expect(text.length).toBeLessThanOrEqual(SHARE_TEXT_MAX_CHARS);
    expect(text.endsWith(SHARE_TRUNCATION_MARKER)).toBe(true);
    expect(text.startsWith("가".repeat(1000))).toBe(true);
  });

  test("title is capped at SHARE_TITLE_MAX_CHARS", () => {
    const fields = parseSharedIntentUrl(sendLink("x", "t".repeat(SHARE_TITLE_MAX_CHARS * 3)));
    expect(fields?.title.length).toBe(SHARE_TITLE_MAX_CHARS);
    expect(fields?.title.endsWith(SHARE_TRUNCATION_MARKER)).toBe(true);
  });

  test("a cut never splits a surrogate pair", () => {
    const max = 20;
    const cutAt = max - SHARE_TRUNCATION_MARKER.length;
    // Put an emoji (two UTF-16 units) across the cut position.
    const value = `${"a".repeat(cutAt - 1)}😀${"b".repeat(50)}`;
    const clipped = clipSharedField(value, max);
    expect(clipped).toBe(`${"a".repeat(cutAt - 1)}${SHARE_TRUNCATION_MARKER}`);
    expect(() => encodeURIComponent(clipped)).not.toThrow();
  });

  test("clipping twice (native, then JS) does not cut again", () => {
    const value = "word ".repeat(SHARE_TEXT_MAX_CHARS);
    const once = clipSharedField(value, SHARE_TEXT_MAX_CHARS);
    expect(clipSharedField(once, SHARE_TEXT_MAX_CHARS)).toBe(once);
    expect(once.length).toBeLessThanOrEqual(SHARE_TEXT_MAX_CHARS);
  });

  test("under the cap nothing changes except surrounding whitespace", () => {
    expect(clipSharedField("  keep me \n", SHARE_TITLE_MAX_CHARS)).toBe("keep me");
  });
});

describe("the whole link is bounded before anything in it is decoded (gate SG-02)", () => {
  // Any app can open <scheme>://share-intent as a VIEW link and skip the native
  // cap. Before, every value in such a link was decoded, wanted or not, and the
  // text only after decoding.
  let decode: jest.SpyInstance;
  beforeEach(() => {
    decode = jest.spyOn(globalThis, "decodeURIComponent");
  });
  afterEach(() => {
    decode.mockRestore();
  });

  const longestDecoded = () => Math.max(0, ...decode.mock.calls.map(([value]) => String(value).length));

  test("the longest link MainActivity can build is still read in full", () => {
    // Hangul is three UTF-8 bytes, the most per UTF-16 unit (nine characters once encoded).
    const link = sendLink("가".repeat(SHARE_TEXT_MAX_CHARS), "가".repeat(SHARE_TITLE_MAX_CHARS));
    expect(link.length).toBeLessThanOrEqual(SHARE_LINK_MAX_CHARS);
    expect(parseSharedIntentUrl(link)).toEqual({
      text: "가".repeat(SHARE_TEXT_MAX_CHARS),
      title: "가".repeat(SHARE_TITLE_MAX_CHARS),
    });
  });

  test("a longer link opens an empty capture screen and decodes nothing", () => {
    const prefix = `secondbrain://${SHARE_INTENT_HOST}?text=x&junk=`;
    const atCap = prefix + "a".repeat(SHARE_LINK_MAX_CHARS - prefix.length);
    expect(atCap.length).toBe(SHARE_LINK_MAX_CHARS);
    expect(parseSharedIntentUrl(atCap)).toEqual({ text: "x", title: "" });
    decode.mockClear();
    const over = `${atCap}a`;
    expect(parseSharedIntentUrl(over)).toEqual({ text: "", title: "" });
    expect(redirectSharedIntentPath(`${prefix}${"%41".repeat(SHARE_LINK_MAX_CHARS)}`)).toBe("/capture");
    expect(decode).not.toHaveBeenCalled();
  });

  test("values of other params are never decoded, and neither are keys too long to be text or title", () => {
    const junk = "%41".repeat(10_000);
    const link = `secondbrain://${SHARE_INTENT_HOST}?junk=${junk}&${junk}=v&text=hello&title=t&text=${junk}`;
    expect(link.length).toBeLessThanOrEqual(SHARE_LINK_MAX_CHARS);
    expect(parseSharedIntentUrl(link)).toEqual({ text: "hello", title: "t" });
    expect(longestDecoded()).toBeLessThanOrEqual(5);
  });
});

describe("the marker and the gates' notice", () => {
  test("carriesShareMarker: the marker plus a text or title, exactly", () => {
    const marker = { [SHARE_MARKER_PARAM]: SHARE_MARKER_VALUE };
    expect(carriesShareMarker({ ...marker, text: "x" })).toBe(true);
    expect(carriesShareMarker({ ...marker, title: "t" })).toBe(true);
    // Nothing left to drop: the text was already taken into the input and stripped.
    expect(carriesShareMarker(marker)).toBe(false);
    expect(carriesShareMarker({ ...marker, text: "   " })).toBe(false);
    // Without the marker (the PWA share target, a typed link) a redirect stays as on main.
    expect(carriesShareMarker({ text: "x" })).toBe(false);
    expect(carriesShareMarker({ [SHARE_MARKER_PARAM]: "Share", text: "x" })).toBe(false);
    expect(carriesShareMarker({ [SHARE_MARKER_PARAM]: [SHARE_MARKER_VALUE], text: "x" })).toBe(false);
  });

  test("what the router hands /capture for a share carries the marker", () => {
    expect(carriesShareMarker(routeParams(sendLink("hello")).params)).toBe(true);
    expect(carriesShareMarker(routeParams("secondbrain://capture?text=hello").params)).toBe(false);
  });

  test("isMarkedShareCapture only counts the /capture route", () => {
    const params = { text: "x", [SHARE_MARKER_PARAM]: SHARE_MARKER_VALUE };
    expect(isMarkedShareCapture("/capture", params)).toBe(true);
    expect(isMarkedShareCapture("/capture-full", params)).toBe(false);
    expect(isMarkedShareCapture("/records", params)).toBe(false);
  });

  test("shareRefusedHref keeps the target as it was unless a marked share is turned away", () => {
    expect(shareRefusedHref("/sign-in", false)).toBe("/sign-in");
    expect(shareRefusedHref("/sign-in", true)).toEqual({ pathname: "/sign-in", params: SHARE_REFUSED_PARAMS });
  });

  test("showsShareRefused reads the one param a gate adds, and nothing else", () => {
    expect(showsShareRefused(SHARE_REFUSED_PARAMS)).toBe(true);
    expect(showsShareRefused({ notice: "other" })).toBe(false);
    expect(showsShareRefused({ [SHARE_MARKER_PARAM]: SHARE_MARKER_VALUE, text: "x" })).toBe(false);
    expect(showsShareRefused({})).toBe(false);
  });
});

describe("contract", () => {
  test("constants come from share-intent-contract.json, which the config plugin also reads", () => {
    expect(SHARE_INTENT_HOST).toBe(contract.host);
    expect(SHARE_TEXT_MAX_CHARS).toBe(contract.maxTextChars);
    expect(SHARE_TITLE_MAX_CHARS).toBe(contract.maxTitleChars);
    expect(SHARE_TRUNCATION_MARKER).toBe(contract.truncationMarker);
    expect(contract.textParam).toBe("text");
    expect(contract.titleParam).toBe("title");
    expect(SHARE_LINK_MAX_CHARS).toBe(9 * (contract.maxTextChars + contract.maxTitleChars) + 256);
  });

  test("the capture href is a path whose values are encoded for the parse and the hook", () => {
    const marker = `${SHARE_MARKER_PARAM}=${SHARE_MARKER_VALUE}`;
    expect(captureHrefForSharedIntent({ text: "a b", title: "" })).toBe(`/capture?text=a%2520b&${marker}`);
    expect(captureHrefForSharedIntent({ text: "a b", title: "t" })).toBe(`/capture?text=a%2520b&title=t&${marker}`);
    expect(captureHrefForSharedIntent({ text: "", title: "" })).toBe("/capture");
  });

  test("a value that cannot be encoded opens an empty capture screen", () => {
    // decodeURIComponent rejects a lone-surrogate escape, so the parser never
    // yields one; build the fields directly to reach the encode step.
    expect(() => captureHrefForSharedIntent({ text: "a\ud800", title: "" })).toThrow(URIError);
    expect(redirectSharedIntentPath("secondbrain://share-intent?text=%ED%A0%80")).toBe("/capture");
  });

  test("the share modules never log (shared text is someone's content)", () => {
    for (const file of [
      "../share-intent.ts",
      "../../../app/+native-intent.ts",
      "../../../components/capture/ShareRefusedLine.tsx",
    ]) {
      const source = readFileSync(require.resolve(file), "utf8");
      expect(source).not.toMatch(/\bconsole\./);
    }
  });
});
