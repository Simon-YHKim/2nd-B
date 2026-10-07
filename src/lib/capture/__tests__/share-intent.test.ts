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
// Every share link with text also gets a delivery id (../share-delivery.ts):
// the capture screen reads the text only for an id accepted for the account on
// screen (signed in only, Simon 2026-10-07). The id rides as one more param.

import { readFileSync } from "fs";

import contract from "../share-intent-contract.json";
import {
  SHARE_DELIVERY_PARAM,
  __resetShareDeliveriesForTests,
  parseShareDeliveryId,
  shareDeliveryState,
} from "../share-delivery";
import { normalizeSharedCaptureParams } from "../share-params";
import {
  SHARE_INTENT_HOST,
  SHARE_TEXT_MAX_CHARS,
  SHARE_TITLE_MAX_CHARS,
  SHARE_TRUNCATION_MARKER,
  captureHrefForSharedIntent,
  clipSharedField,
  parseSharedIntentUrl,
  redirectSharedIntentPath,
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

beforeEach(() => {
  __resetShareDeliveriesForTests();
});

/** Delivery ids registered so far, oldest first. */
const registeredIds = () => shareDeliveryState().entries.map((entry) => entry.id);

const HARD_TEXTS = [
  "50% off https://shop.example/a?b=1&c=2",
  "C++ & Rust #tips",
  "a=b&mode=ocr&tag=x&entry=firstRun&coach=1",
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
    // Nothing in the text can add a param the capture screen acts on, and the
    // only other param is the delivery id this share registered.
    expect(Object.keys(params).sort()).toEqual([SHARE_DELIVERY_PARAM, "text"]);
    expect(params[SHARE_DELIVERY_PARAM]).toBe(String(registeredIds()[0]));
    expect(registeredIds()).toHaveLength(1);
  });

  test("EXTRA_SUBJECT becomes the title param next to the text", () => {
    const { params } = routeParams(sendLink("https://example.com/a", "An article: 50% & more"));
    expect(params).toEqual({
      text: "https://example.com/a",
      title: "An article: 50% & more",
      [SHARE_DELIVERY_PARAM]: "1",
    });
  });

  test("a delivery id cannot be smuggled in through the text or a crafted param", () => {
    const crafted = `secondbrain://${SHARE_INTENT_HOST}?text=a&${SHARE_DELIVERY_PARAM}=999&title=t`;
    const { params } = routeParams(crafted);
    expect(params[SHARE_DELIVERY_PARAM]).toBe("1");
    const { params: inText } = routeParams(sendLink(`x&${SHARE_DELIVERY_PARAM}=999`));
    expect(inText.text).toBe(`x&${SHARE_DELIVERY_PARAM}=999`);
    expect(inText[SHARE_DELIVERY_PARAM]).toBe("2");
  });

  test("Chrome-style share (subject = page title, text = url) composes the capture box", () => {
    const { params } = routeParams(sendLink("https://example.com/a", "An article"));
    const payload = normalizeSharedCaptureParams({ text: params.text, title: params.title });
    expect(payload?.content).toBe("An article\n\nhttps://example.com/a");
  });

  test("a subject-only share still opens the capture box with the subject", () => {
    const { params } = routeParams(sendLink(undefined, "only a subject"));
    expect(normalizeSharedCaptureParams({ title: params.title })?.content).toBe("only a subject");
  });

  test("a share link with nothing in it opens an empty capture screen and registers nothing", () => {
    expect(routeParams(sendLink()).path).toBe("/capture");
    expect(routeParams(sendLink()).params).toEqual({});
    expect(registeredIds()).toEqual([]);
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

describe("redirectSharedIntentPath leaves every other link alone", () => {
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
    expect(registeredIds()).toEqual([]);
  });

  // The sign-in and password-reset callbacks this app receives. They are not
  // share links, so they pass through untouched and register nothing (gate
  // FIN-01 / W5-R3-02: the auth link path stays as it is on main).
  test.each([
    "secondbrain:///?code=abc",
    "secondbrain:///reset-password?code=abc",
    "secondbrain://oauth-callback?code=abc&state=xyz",
    "secondbrain:///reset-password#access_token=t&type=recovery",
  ])("auth callback %j is returned unchanged", (link) => {
    expect(redirectSystemPath({ path: link, initial: true })).toBe(link);
    expect(redirectSystemPath({ path: link, initial: false })).toBe(link);
    expect(registeredIds()).toEqual([]);
  });

  test("any scheme, any letter case, with or without a slash before the query", () => {
    expect(redirectSharedIntentPath("exp+2nd-brain://share-intent?text=a")).toBe(`/capture?text=a&${SHARE_DELIVERY_PARAM}=1`);
    expect(redirectSharedIntentPath("SecondBrain://Share-Intent/?text=a")).toBe(`/capture?text=a&${SHARE_DELIVERY_PARAM}=2`);
    expect(redirectSharedIntentPath("secondbrain://share-intent#frag")).toBe("/capture");
    expect(registeredIds()).toEqual([1, 2]);
  });

  test("each share with text registers exactly one delivery, in order", () => {
    redirectSharedIntentPath("secondbrain://share-intent?text=a");
    redirectSharedIntentPath("secondbrain://share-intent?title=only");
    redirectSharedIntentPath("secondbrain://share-intent?text=%20%20");
    expect(registeredIds()).toEqual([1, 2]);
    expect(shareDeliveryState().entries.every((entry) => entry.verdict === null)).toBe(true);
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

  test("a malformed escape drops that value instead of throwing", () => {
    expect(parseSharedIntentUrl("secondbrain://share-intent?text=%E0%A4%A&title=ok")).toEqual({
      text: "",
      title: "ok",
    });
    expect(redirectSharedIntentPath("secondbrain://share-intent?text=%ZZ")).toBe("/capture");
    expect(registeredIds()).toEqual([]);
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
    const long = "가".repeat(SHARE_TEXT_MAX_CHARS + 500);
    const { params } = routeParams(sendLink(long));
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

describe("contract", () => {
  test("constants come from share-intent-contract.json, which the config plugin also reads", () => {
    expect(SHARE_INTENT_HOST).toBe(contract.host);
    expect(SHARE_TEXT_MAX_CHARS).toBe(contract.maxTextChars);
    expect(SHARE_TITLE_MAX_CHARS).toBe(contract.maxTitleChars);
    expect(SHARE_TRUNCATION_MARKER).toBe(contract.truncationMarker);
    expect(contract.textParam).toBe("text");
    expect(contract.titleParam).toBe("title");
  });

  test("the capture href is a path whose values are encoded for the parse and the hook", () => {
    expect(captureHrefForSharedIntent({ text: "a b", title: "" })).toBe("/capture?text=a%2520b");
    expect(captureHrefForSharedIntent({ text: "a b", title: "t" }, 7)).toBe(
      `/capture?text=a%2520b&title=t&${SHARE_DELIVERY_PARAM}=7`,
    );
    expect(captureHrefForSharedIntent({ text: "", title: "" })).toBe("/capture");
    expect(captureHrefForSharedIntent({ text: "", title: "" }, 7)).toBe("/capture");
  });

  test("a value that cannot be encoded opens an empty capture screen and registers nothing", () => {
    // decodeURIComponent rejects a lone-surrogate escape, so the parser never
    // yields one; build the fields directly to reach the encode step.
    expect(() => captureHrefForSharedIntent({ text: "a\ud800", title: "" })).toThrow(URIError);
    expect(redirectSharedIntentPath("secondbrain://share-intent?text=%ED%A0%80")).toBe("/capture");
    expect(registeredIds()).toEqual([]);
  });

  test("the share modules never log (shared text is someone's content)", () => {
    for (const file of ["../share-intent.ts", "../share-delivery.ts", "../../../app/+native-intent.ts"]) {
      const source = readFileSync(require.resolve(file), "utf8");
      expect(source).not.toMatch(/\bconsole\./);
    }
  });
});

describe("a shareDelivery param from outside is never readable (gate SHARE-A1-02)", () => {
  // Only the share-intent rewrite issues delivery ids. Any other incoming link
  // that carries one, in any spelling the router decodes into the same key,
  // reaches the capture screen with a value parseShareDeliveryId rejects, so
  // the screen drops its text instead of filling it with a borrowed id.
  test.each([
    `secondbrain://capture?text=NEW&${SHARE_DELIVERY_PARAM}=1`,
    `secondbrain://capture?${SHARE_DELIVERY_PARAM}=1&text=NEW`,
    "secondbrain://capture?text=NEW&share%44elivery=1",
    "secondbrain://capture?text=NEW&share%2544elivery=1",
    "secondbrain://capture?text=NEW&SHAREDELIVERY=1",
    `secondbrain://capture?text=NEW&${SHARE_DELIVERY_PARAM}=1#frag`,
    `secondbrain:///capture?text=NEW&${SHARE_DELIVERY_PARAM}=1&${SHARE_DELIVERY_PARAM}=1`,
  ])("%j reaches /capture with an unreadable delivery id and registers nothing", (link) => {
    const { path, params } = routeParams(link);
    expect(path).toBe("/capture");
    expect(params[SHARE_DELIVERY_PARAM]).toBeDefined();
    expect(parseShareDeliveryId(params[SHARE_DELIVERY_PARAM])).toBeNull();
    expect(registeredIds()).toEqual([]);
  });

  test("the share-intent rewrite still issues the only readable id", () => {
    const { params } = routeParams(sendLink("hello"));
    expect(parseShareDeliveryId(params[SHARE_DELIVERY_PARAM])).toBe(1);
  });
});
