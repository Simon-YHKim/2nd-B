// insight-card — render + capture + share the "자기이해 한 컷" ShareCard.
//
// shareInsightCard() mounts a <ShareCard> into an OFF-SCREEN ViewShot, captures
// it at 1080×1080 PNG (react-native-view-shot), and hands the file to the OS
// share sheet (expo-sharing). Native modules are LAZY-imported INSIDE the
// function so importing this module never breaks web or jest (where the native
// modules are absent / mocked). Web / unavailable falls back to RN Share text
// carrying the 2ndb.app link — never throws.
//
//   await shareInsightCard({ variant: "A", insight, handle, litCount });
//
// deriveCardProps() maps real domain data (core-brain 북극성 문장 +
// star_tier_history lit count) to ShareCard props with canonical fallbacks.

import { Platform } from "react-native";

import type { ShareCardProps } from "@/components/deepspace/ShareCard";

/** Canonical fallbacks when real data is missing. */
export const FALLBACK_INSIGHT = "깊이 이해하고, 더 나답게 산다.";
export const FALLBACK_LIT_COUNT = 4;

/** The capture target — design canon is 1080×1080. */
const CAPTURE_SIZE = 1080;

/** Public link surfaced in every share path. */
const SHARE_LINK = "2ndb.app";

export interface ShareInsightOptions {
  variant: "A" | "B";
  insight: string;
  /** Share-sheet text/dialog only — the card itself shows the piece count. */
  handle: string;
  litCount?: number;
  /** Total captured pieces for the card's "N개 별가루" signature line. */
  pieceCount?: number | null;
}

/**
 * deriveCardProps — map real domain data to ShareCard props.
 *
 *   - northStarSentence: the core-brain 북극성 문장 (소울 코어 요약 sentence).
 *   - litStars: how many of the 7 북두칠성 lenses are lit, from the user's
 *     star_tier_history (count of stars whose current tier ≥ L1, i.e. ignited).
 *   - handle: the user's public handle (without "@").
 *
 * Any missing / blank field falls back to the canonical sentence + 4 lit stars
 * so the card is always shippable. litStars is clamped to 0..7.
 */
export function deriveCardProps(input: {
  northStarSentence?: string | null;
  litStars?: number | null;
  handle?: string | null;
}): { insight: string; handle: string; litCount: number } {
  const sentence = (input.northStarSentence ?? "").trim();
  const insight = sentence.length > 0 ? sentence : FALLBACK_INSIGHT;

  const rawLit = input.litStars;
  const litCount =
    typeof rawLit === "number" && Number.isFinite(rawLit)
      ? Math.max(0, Math.min(7, Math.round(rawLit)))
      : FALLBACK_LIT_COUNT;

  const handle = (input.handle ?? "").trim() || "me";

  return { insight, handle, litCount };
}

/** Compose the plain-text fallback shared when image capture is unavailable. */
function fallbackShareText(opts: ShareInsightOptions): string {
  return `${opts.insight}\n\n@${opts.handle} · ${SHARE_LINK}`;
}

/**
 * Build the ShareCard props at capture resolution. Kept separate so a caller
 * (e.g. a preview screen) can render the very same card on-screen.
 */
export function captureCardProps(opts: ShareInsightOptions): ShareCardProps {
  return {
    variant: opts.variant,
    insight: opts.insight,
    pieceCount: opts.pieceCount,
    litCount: opts.litCount ?? FALLBACK_LIT_COUNT,
    size: CAPTURE_SIZE,
  };
}

/**
 * shareInsightCard — capture the card and open the OS share sheet.
 *
 * Native-only path:
 *   1. lazy-import react-native-view-shot + expo-sharing,
 *   2. captureRef of a pre-mounted off-screen ViewShot ref (see note below) at
 *      1080×1080 PNG,
 *   3. Sharing.isAvailableAsync() guard → Sharing.shareAsync(uri).
 *
 * Because react-native-view-shot needs a MOUNTED view to capture, the caller is
 * expected to mount <ShareCardCapture> (a thin host that renders <ShareCard>
 * off-screen and exposes its ref). To keep this module self-contained and
 * jest/web-safe we accept an optional `captureRef`-able ref via opts on the
 * native path; when absent, or on web / when sharing is unavailable, we fall
 * back to RN Share with the text + link. This never throws.
 */
export async function shareInsightCard(
  opts: ShareInsightOptions & { viewRef?: unknown },
): Promise<void> {
  // Web (and any non-native) → text share fallback, no native modules touched.
  if (Platform.OS === "web") {
    await shareTextFallback(opts);
    return;
  }

  try {
    // Lazy native imports — never evaluated on web/jest import.
    const { captureRef } = await import("react-native-view-shot");
    const Sharing = await import("expo-sharing");

    const available = await Sharing.isAvailableAsync();
    if (!available || !opts.viewRef) {
      await shareTextFallback(opts);
      return;
    }

    const uri = await captureRef(opts.viewRef as never, {
      format: "png",
      quality: 1,
      width: CAPTURE_SIZE,
      height: CAPTURE_SIZE,
      result: "tmpfile",
    });

    await Sharing.shareAsync(uri, {
      mimeType: "image/png",
      dialogTitle: `@${opts.handle} · ${SHARE_LINK}`,
      UTI: "public.png",
    });
  } catch {
    // Any native failure (no permission, capture error, missing module) →
    // graceful text fallback. Sharing should never crash the host screen.
    await shareTextFallback(opts);
  }
}

/** RN Share text fallback carrying the 2ndb.app link. Swallows user-cancel. */
async function shareTextFallback(opts: ShareInsightOptions): Promise<void> {
  try {
    const { Share } = await import("react-native");
    await Share.share({ message: fallbackShareText(opts) });
  } catch {
    // No share surface (web without navigator.share, or user dismissed) → no-op.
  }
}
