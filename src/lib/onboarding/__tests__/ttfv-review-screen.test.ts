import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactElement } from "react";

const mockAuth = {
  current: { userId: null as string | null, loading: true, isMinor: null as boolean | null },
};
const mockMarkTTFVSeen = jest.fn();
const mockReleaseTTFVClaim = jest.fn();
const mockTakeTTFVClaimToken = jest.fn();

jest.mock("@/lib/auth/AuthContext", () => ({ useAuth: () => mockAuth.current }));
jest.mock("@/lib/onboarding/ttfv-gate", () => ({
  markTTFVSeen: (...args: unknown[]) => mockMarkTTFVSeen(...args),
  releaseTTFVClaim: (...args: unknown[]) => mockReleaseTTFVClaim(...args),
  takeTTFVClaimToken: (...args: unknown[]) => mockTakeTTFVClaimToken(...args),
}));
jest.mock("react-native", () => ({
  ScrollView: "ScrollView",
  StyleSheet: { create: (styles: unknown) => styles },
  View: "View",
}));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
jest.mock("react-native-svg", () => ({ __esModule: true, default: "Svg" }));
jest.mock("@/components/pixel/PixelGlyph", () => ({ PixelGlyph: "PixelGlyph" }));
jest.mock("@/components/pixel/PixelPressable", () => ({ PixelPressable: "PixelPressable" }));
jest.mock("@/components/pixel/PixelStarSvg", () => ({ PixelStarSvg: "PixelStarSvg" }));
jest.mock("@/components/pixel/PixelSurface", () => ({ PixelSurface: "PixelSurface" }));
jest.mock("@/components/ui/Text", () => ({ Text: "Text" }));
jest.mock("@/screens/deepspace/onboarding/TTFVScreen", () => ({
  ...jest.requireActual("@/screens/deepspace/onboarding/TTFVScreen"),
  TTFVScreen: "TTFVScreen",
}));
jest.mock("expo-router", () => ({ Redirect: "Redirect" }));

import TtfvRoute from "../../../app/ttfv";
import {
  TTFV_COPY,
  TTFV_REVIEW_LIMIT,
  beginTTFVSave,
  buildFirstLightRecordInput,
  completeTTFVSave,
  failTTFVSave,
  loadTTFVReview,
  shouldMarkTTFVSeen,
  shouldReleaseTTFVClaim,
  shouldReleaseTTFVVisit,
  uiLocaleFor,
  visibleTTFVContent,
  type TTFVContentState,
} from "@/screens/deepspace/onboarding/TTFVScreen";

const SRC = resolve(__dirname, "../../..");
const SCREEN_PATH = resolve(SRC, "screens/deepspace/onboarding/TTFVScreen.tsx");
const ROUTE_PATH = resolve(SRC, "app/ttfv.tsx");
const PIXEL_PRESSABLE_PATH = resolve(SRC, "components/pixel/PixelPressable.tsx");

const SCREEN = readFileSync(SCREEN_PATH, "utf8");
const ROUTE = readFileSync(ROUTE_PATH, "utf8");
const PIXEL_PRESSABLE = readFileSync(PIXEL_PRESSABLE_PATH, "utf8");

function routeElement(): ReactElement<Record<string, unknown>> {
  return TtfvRoute() as ReactElement<Record<string, unknown>>;
}

describe("/ttfv auth and seen gate", () => {
  beforeEach(() => {
    mockAuth.current = { userId: null, loading: true, isMinor: null };
    mockMarkTTFVSeen.mockClear();
    mockReleaseTTFVClaim.mockClear();
    mockTakeTTFVClaimToken.mockReset().mockReturnValue(null);
  });

  it("renders an explicit auth loading state without consuming first light", () => {
    const tree = routeElement();

    expect(tree.type).toBe("TTFVScreen");
    expect(tree.props.mode).toBe("auth-loading");
    expect(mockMarkTTFVSeen).not.toHaveBeenCalled();
  });

  it("redirects a resolved signed-out session to /sign-in without marking seen", () => {
    mockAuth.current = { userId: null, loading: false, isMinor: null };
    const tree = routeElement();

    expect(tree.type).toBe("Redirect");
    expect(tree.props.href).toBe("/sign-in");
    expect(mockMarkTTFVSeen).not.toHaveBeenCalled();
  });

  it("only exposes the seen write as the authenticated screen-ready callback", () => {
    mockAuth.current = { userId: "owner-1", loading: false, isMinor: false };
    const tree = routeElement();

    expect(tree.type).toBe("TTFVScreen");
    expect(tree.props).toMatchObject({ mode: "authenticated", userId: "owner-1", minor: false });
    expect(mockMarkTTFVSeen).not.toHaveBeenCalled();

    (tree.props.onContentReady as (receipt: string | null) => void)(null);
    expect(mockMarkTTFVSeen).toHaveBeenCalledTimes(1);
    expect(mockMarkTTFVSeen).toHaveBeenCalledWith("owner-1", null);
  });

  it("lets the screen's visit take the home's receipt (0219, BA-02) and reports with the visit's receipt", () => {
    mockAuth.current = { userId: "owner-1", loading: false, isMinor: false };
    mockTakeTTFVClaimToken.mockReturnValue("token-1");
    const tree = routeElement();

    // The route only hands the take over; it never takes the receipt while rendering.
    expect(mockTakeTTFVClaimToken).not.toHaveBeenCalled();
    expect((tree.props.takeReceipt as (owner: string) => string | null)("owner-1")).toBe("token-1");
    expect(mockTakeTTFVClaimToken).toHaveBeenCalledWith("owner-1");
    expect(mockReleaseTTFVClaim).not.toHaveBeenCalled();
    (tree.props.onContentUnavailable as (receipt: string) => void)("token-1");
    expect(mockReleaseTTFVClaim).toHaveBeenCalledWith("owner-1", "token-1");
    (tree.props.onContentReady as (receipt: string | null) => void)("token-1");
    expect(mockMarkTTFVSeen).toHaveBeenCalledWith("owner-1", "token-1");
  });

  it("marks a visit failed only on a load error (#1530), never for loading or shown content", () => {
    const base = { userId: "owner-1" } as const;
    expect(shouldReleaseTTFVClaim({ ...base, kind: "error" })).toBe(true);
    expect(shouldReleaseTTFVClaim({ ...base, kind: "loading" })).toBe(false);
    expect(shouldReleaseTTFVClaim({ ...base, kind: "empty" })).toBe(false);
  });

  it("FR-01: hands the grant back only when a failed visit that never showed content ends", () => {
    const visit = { userId: "owner-1", receipt: "token-1", shown: false, failed: true };
    expect(shouldReleaseTTFVVisit(visit)).toBe(true);
    // The retry loaded and showed content: the grant is used, never handed back.
    expect(shouldReleaseTTFVVisit({ ...visit, shown: true })).toBe(false);
    // Left while still loading, with no error: the grant stays used (fail-closed).
    expect(shouldReleaseTTFVVisit({ ...visit, failed: false })).toBe(false);
    // A visit the home did not open has nothing to hand back.
    expect(shouldReleaseTTFVVisit({ ...visit, receipt: null })).toBe(false);

    // The screen hands the grant back in exactly one place: the visit's cleanup.
    // Not when the error shows, because the retry can still show content beside a
    // newer grant (two screens) and the visit's own slot would stay spent.
    const visitStart = SCREEN.indexOf("const visit: TTFVVisit = {");
    expect(visitStart).toBeGreaterThan(0);
    const visitEffect = SCREEN.slice(visitStart, SCREEN.indexOf("}, [userId]);", visitStart));
    expect(visitEffect).toContain("return () => {");
    expect(visitEffect).toContain("if (handBack && shouldReleaseTTFVVisit(visit)) handBack(visit.receipt);");
    expect(SCREEN.match(/handBack\(/g)).toHaveLength(1);
    expect(SCREEN).not.toMatch(/onContentUnavailable\(\)/);
    expect(SCREEN).not.toMatch(/onContentUnavailable\??\.\(/);
    // The failed load only marks the visit; it reports nothing.
    expect(SCREEN).toMatch(/if \(shouldReleaseTTFVClaim\(visibleContent\)\) \{\s*visit\.failed = true;\s*return;\s*\}/);
    // The receipt is taken once, when the visit starts, never in the route's render.
    expect(SCREEN).toContain("receipt: take ? take(userId) : null");
    expect(ROUTE).toContain("takeReceipt={takeTTFVClaimToken}");
    expect(ROUTE).not.toMatch(/takeTTFVClaimToken\(/);
  });

  it("marks only honest record or empty content, never loading or load error", () => {
    const base = { userId: "owner-1" } as const;
    expect(shouldMarkTTFVSeen({ ...base, kind: "loading" })).toBe(false);
    expect(shouldMarkTTFVSeen({ ...base, kind: "error" })).toBe(false);
    expect(shouldMarkTTFVSeen({ ...base, kind: "empty" })).toBe(true);
    expect(
      shouldMarkTTFVSeen({
        ...base,
        kind: "review",
        review: { id: "r1", excerpt: "my words", createdAt: "2026-08-31T00:00:00.000Z", truncated: false },
      }),
    ).toBe(true);
  });
});

describe("TTFV latest owner record adapter", () => {
  it("requests a bounded owner reader and selects the newest real, non-first-light record", async () => {
    const reader = jest.fn().mockResolvedValue([
      {
        id: "generated",
        body: "screen generated review",
        created_at: "2026-08-31T03:00:00.000Z",
        tags: ["first_light"],
      },
      {
        id: "latest-real",
        body: "  I wrote this\nwith   deliberate spacing.  ",
        created_at: "2026-08-31T02:00:00.000Z",
        tags: ["capture"],
      },
      {
        id: "older-real",
        body: "older",
        created_at: "2026-08-30T02:00:00.000Z",
        tags: [],
      },
    ]);

    await expect(loadTTFVReview("owner-1", reader)).resolves.toEqual({
      id: "latest-real",
      excerpt: "I wrote this with deliberate spacing.",
      createdAt: "2026-08-31T02:00:00.000Z",
      truncated: false,
    });
    expect(reader).toHaveBeenCalledWith("owner-1", TTFV_REVIEW_LIMIT);
  });

  it("caps long text before it enters UI state", async () => {
    const raw = `private-start ${"가".repeat(400)} private-end`;
    const review = await loadTTFVReview("owner-1", async () => [
      { id: "r-long", body: raw, created_at: "2026-08-31T02:00:00.000Z", tags: [] },
    ]);

    expect(review?.truncated).toBe(true);
    expect(review?.excerpt.length).toBeLessThan(raw.length);
    expect(review?.excerpt).toContain("private-start");
    expect(review?.excerpt).not.toContain("private-end");
  });

  it("returns honest empty for no eligible record and preserves reader failures as errors", async () => {
    await expect(
      loadTTFVReview("owner-1", async () => [
        { id: "generated", body: "generated", created_at: "2026-08-31T03:00:00.000Z", tags: ["first_light"] },
      ]),
    ).resolves.toBeNull();

    const offline = new Error("offline");
    await expect(loadTTFVReview("owner-1", async () => Promise.reject(offline))).rejects.toBe(offline);
  });

  it("times out a stalled reader instead of leaving the screen loading", async () => {
    jest.useFakeTimers();
    try {
      const pending = loadTTFVReview("owner-1", () => new Promise(() => undefined), 50);
      jest.advanceTimersByTime(50);
      await expect(pending).rejects.toMatchObject({ name: "TTFVLoadTimeoutError" });
    } finally {
      jest.useRealTimers();
    }
  });

  it("hides a previous user's record during the next user's pre-effect render", () => {
    const oldState: TTFVContentState = {
      userId: "owner-1",
      kind: "review",
      review: { id: "r1", excerpt: "owner one only", createdAt: "2026-08-31T00:00:00.000Z", truncated: false },
    };

    expect(visibleTTFVContent(oldState, "owner-2")).toEqual({ userId: "owner-2", kind: "loading" });
    expect(JSON.stringify(visibleTTFVContent(oldState, "owner-2"))).not.toContain("owner one only");
  });
});

describe("TTFV review save", () => {
  it.each(["affirm", "soft"] as const)("builds a %s first_light record without copying source data", (choice) => {
    const input = buildFirstLightRecordInput({
      userId: "owner-1",
      minor: false,
      systemLocale: "en",
      uiLocale: "en",
      choice,
    });

    expect(input).toMatchObject({
      userId: "owner-1",
      minor: false,
      locale: "en",
      kind: "note",
      withFollowup: false,
      tags: ["first_light", `first_light:${choice}`],
    });
    expect(JSON.stringify(input)).not.toContain("first_light:source:");
    expect(input.body.length).toBeGreaterThan(0);
  });

  it("keeps the actual selection through a retryable failure and completes only after success", () => {
    const saving = beginTTFVSave("soft");
    const failed = failTTFVSave(saving);

    expect(failed).toEqual({ choice: "soft", status: "error" });
    if (!failed.choice) throw new Error("failed save must preserve the selected answer");
    expect(beginTTFVSave(failed.choice)).toEqual({ choice: "soft", status: "saving" });
    expect(completeTTFVSave(beginTTFVSave(failed.choice))).toEqual({ choice: "soft", status: "saved" });
  });
});

describe("TTFV five-locale and PIXEL-CLAY source contract", () => {
  it("ships a complete typed copy map for exactly the five available UI locales", () => {
    expect(Object.keys(TTFV_COPY).sort()).toEqual(["en", "es", "id", "ko", "pt"]);
    expect(uiLocaleFor("ko-KR")).toBe("ko");
    expect(uiLocaleFor("es-MX")).toBe("es");
    expect(uiLocaleFor("unknown")).toBe("en");

    for (const copy of Object.values(TTFV_COPY)) {
      expect(copy.title).toBeTruthy();
      expect(copy.reviewQuestion).toBeTruthy();
      expect(copy.emptyAction).toBeTruthy();
      expect(copy.loadRetry).toBeTruthy();
      expect(copy.saveRetry).toBeTruthy();
    }
  });

  it("uses only shared pixel surfaces, controls, glyphs and rect stars", () => {
    expect(SCREEN).toContain("PixelSurface");
    expect(SCREEN).toContain("PixelPressable");
    expect(SCREEN).toContain("PixelGlyph");
    expect(SCREEN).toContain("PixelStarSvg");
    expect(SCREEN).not.toMatch(/\bPressable\b/);
    expect(SCREEN).not.toMatch(/<(?:Circle|Path|Ellipse|Polyline|Polygon|Line)\b/);
    expect(SCREEN).not.toMatch(/(?:Linear|Radial)Gradient|url\(#|\bblur\b/i);
    expect(SCREEN).not.toMatch(/\bopacity\s*:\s*(?:0?\.\d+|[01](?:\.0+)?)\b/);
    expect(SCREEN).not.toMatch(/borderRadius\s*:\s*[1-9]/);
    expect(SCREEN).not.toMatch(/style\s*=\s*\{\s*\(/);
    expect(PIXEL_PRESSABLE).toContain("minHeight: m3.minTouch");
  });

  it("contains no fixed trait, relationship-star, or level-rise fixture", () => {
    expect(SCREEN).not.toMatch(/TTFVInsight|defaultInsight|EVIDENCE|insight\.phrase/i);
    expect(SCREEN).not.toMatch(/Relationship|reaches out first|관계 별|먼저 다가|L1\s*(?:→|->)\s*L2/i);
    expect(SCREEN).not.toMatch(/brightened one step|별이 밝아|star went up/i);
  });

  it("awaits save errors, preserves retry, and routes only to the real capture and home destinations", () => {
    expect(SCREEN).toMatch(/await\s+createRecord\s*\(/);
    expect(SCREEN).not.toMatch(/createRecord[\s\S]{0,200}\.catch\s*\(\s*\(\)\s*=>\s*\{?\s*\}?\s*\)/);
    expect(SCREEN).toContain('router.push("/capture")');
    expect(SCREEN).toContain('router.replace("/")');
    expect(SCREEN).toContain("numberOfLines={4}");
  });

  it("does not copy source text into logs, analytics, or explicit accessibility labels", () => {
    expect(SCREEN).not.toMatch(/console\.|analytics|logEvent|trackEvent/);
    expect(SCREEN).not.toContain("sourceRecordId");
    expect(SCREEN).not.toMatch(/accessibilityLabel\s*=\s*\{[^}]*excerpt/);
    expect(SCREEN).not.toMatch(/accessibilityHint\s*=\s*\{[^}]*excerpt/);
  });

  it("keeps auth in the route and removes the mount-time seen effect", () => {
    expect(ROUTE).toContain("useAuth()");
    expect(ROUTE).toContain('<Redirect href="/sign-in" />');
    expect(ROUTE).not.toMatch(/useEffect\s*\([^)]*markTTFVSeen/s);
  });
});
