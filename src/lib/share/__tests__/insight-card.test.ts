import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  deriveCardProps,
  captureCardProps,
  FALLBACK_LIT_COUNT,
  fallbackShareText,
} from "../insight-card";
import { SITE_ORIGIN } from "@/lib/site-meta";

const ROOT = join(__dirname, "..", "..", "..", "..");
const FALLBACK = "Understand myself deeply, live more like myself.";
const LOCALES = ["en", "ko", "es", "pt", "id"] as const;

// Pure mapping only — the native capture/share path is NOT tested here (it
// lazy-imports react-native-view-shot + expo-sharing, which are native-only).
describe("deriveCardProps (core-brain + star_tier_history → ShareCard props)", () => {
  test("maps a real north-star sentence + lit count through unchanged", () => {
    const props = deriveCardProps({
      northStarSentence: "나는 호기심으로 세상을 읽는다.",
      litStars: 6,
      handle: "simon",
      fallbackInsight: FALLBACK,
    });
    expect(props).toEqual({
      insight: "나는 호기심으로 세상을 읽는다.",
      handle: "simon",
      litCount: 6,
    });
  });

  test("missing / blank sentence falls back to the caller's localized sentence", () => {
    // QA 261004 W-04/D-09: the fallback was a Korean constant, so an English
    // card read "깊이 이해하고, 더 나답게 산다.". It now comes from the caller.
    const f = { handle: "x", fallbackInsight: FALLBACK };
    expect(deriveCardProps(f).insight).toBe(FALLBACK);
    expect(deriveCardProps({ ...f, northStarSentence: "   " }).insight).toBe(FALLBACK);
    expect(deriveCardProps({ ...f, northStarSentence: null }).insight).toBe(FALLBACK);
    expect(deriveCardProps(f).insight).not.toMatch(/[가-힣]/);
  });

  test("trims surrounding whitespace from a real sentence", () => {
    expect(
      deriveCardProps({ northStarSentence: "  깊이 산다.  ", handle: "x", fallbackInsight: FALLBACK })
        .insight,
    ).toBe("깊이 산다.");
  });

  test("missing / non-finite litStars stays unknown instead of inventing 4", () => {
    // D-09: a share surface must not draw a star count it did not read.
    const f = { handle: "x", fallbackInsight: FALLBACK };
    expect(deriveCardProps(f).litCount).toBeNull();
    expect(deriveCardProps({ ...f, litStars: null }).litCount).toBeNull();
    expect(deriveCardProps({ ...f, litStars: NaN }).litCount).toBeNull();
  });

  test("litStars is clamped to 0..7 and rounded", () => {
    const f = { handle: "x", fallbackInsight: FALLBACK };
    expect(deriveCardProps({ ...f, litStars: -3 }).litCount).toBe(0);
    expect(deriveCardProps({ ...f, litStars: 12 }).litCount).toBe(7);
    expect(deriveCardProps({ ...f, litStars: 3.6 }).litCount).toBe(4);
  });

  test("blank handle falls back to 'me'", () => {
    const f = { fallbackInsight: FALLBACK };
    expect(deriveCardProps({ ...f, handle: "" }).handle).toBe("me");
    expect(deriveCardProps({ ...f, handle: null }).handle).toBe("me");
    expect(deriveCardProps({ ...f, handle: "  ari  " }).handle).toBe("ari");
  });
});

describe("/share-card uses a localized fallback and waits for the real star count", () => {
  const screen = readFileSync(join(ROOT, "src", "app", "share-card.tsx"), "utf8");

  test("every locale carries the fallback sentence; only ko is Korean", () => {
    for (const locale of LOCALES) {
      const bundle = JSON.parse(
        readFileSync(join(ROOT, "locales", locale, "deepspace.json"), "utf8"),
      ) as { shareCard: Record<string, string> };
      const value = bundle.shareCard.fallbackInsight;
      expect(typeof value).toBe("string");
      expect(value.trim().length).toBeGreaterThan(10);
      expect({ locale, hangul: /[가-힣]/.test(value) }).toEqual({ locale, hangul: locale === "ko" });
      // The old "using the default count" notice described the invented 4.
      expect(bundle.shareCard.starsFallback).toBeUndefined();
    }
  });

  test("the screen passes the bundle sentence and gates the card on a known count", () => {
    expect(screen).toContain('fallbackInsight: t("deepspace:shareCard.fallbackInsight")');
    expect(screen).not.toContain("starsFallback");
    expect(screen).toContain("disabled={saving || sharing || litCount === null}");
    expect(screen).toContain("disabled={sharing || saving || litCount === null}");
    expect(screen).toContain("{litCount !== null ? (");
    expect(screen.split("litCount === null) return;")).toHaveLength(3);
  });
});

describe("captureCardProps", () => {
  test("builds 1080-sized ShareCard props with the variant + defaults", () => {
    const props = captureCardProps({
      variant: "B",
      insight: "x",
      handle: "y",
    });
    expect(props.variant).toBe("B");
    expect(props.size).toBe(1080);
    expect(props.litCount).toBe(FALLBACK_LIT_COUNT);
  });

  test("passes an explicit litCount through", () => {
    expect(
      captureCardProps({ variant: "A", insight: "x", handle: "y", litCount: 2 }).litCount,
    ).toBe(2);
  });

  test("passes pieceCount through for the signature line (absent = undefined)", () => {
    expect(
      captureCardProps({ variant: "B", insight: "x", handle: "y", pieceCount: 124 }).pieceCount,
    ).toBe(124);
    expect(captureCardProps({ variant: "B", insight: "x", handle: "y" }).pieceCount).toBeUndefined();
  });
});

// The link people paste onward has to open this app. It used to be "2ndb.app",
// a domain nobody registered (RDAP 404 on 2026-09-27), so every text share
// advertised an address anyone could buy. SITE_ORIGIN is where the web build
// is actually served.
describe("fallbackShareText", () => {
  test("carries the served web origin, not an unregistered domain", () => {
    const text = fallbackShareText({ variant: "A", insight: "깊이 산다.", handle: "ari" });
    expect(text).toBe(`깊이 산다.\n\n@ari · ${SITE_ORIGIN}`);
    expect(text).not.toContain("2ndb.app");
  });
});
