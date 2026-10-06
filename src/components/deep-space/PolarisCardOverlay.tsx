/**
 * 북극성 카드 오버레이 (Simon localhost QA 2026-09-30).
 *
 * "북국성 페이지를 띄우는 것이 아니라, 북극성 색상의 카드를 띄워줘. 북극성 카드를
 * 내리는 방법은 위 아래 스와이프. 나열된 북극성 카드를 보는 방법은 좌우 스와이프."
 *
 * So /core-brain is no longer a page with its own header and dock: the route is a
 * transparent modal (app/_layout.tsx) and this overlay draws a dithered scrim over
 * whatever was underneath (the constellation home) with the Polaris-coloured card
 * deck on top.
 *   - Left / right: PolarisDeck's horizontal pager (unchanged).
 *   - Up / down: dismiss, only when the card body is at that edge
 *     (lib/polaris/card-dismiss.ts), so a long card still scrolls.
 *   - Tapping the scrim, the accessibility escape gesture and Android back also close.
 *
 * Everything inside is drawn on the violet card ground, so the overlay hands its
 * children a palette (PaletteOverride) and a button tint (MdButtonTintProvider)
 * tuned for that ground: the old navy card read 3.62:1 for helper text and 4.16:1
 * for links. Values: m3.polarisCard, contrast pinned by polaris-card-contrast.test.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, PanResponder, Platform, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";

import { MdButtonTintProvider, type MdButtonTint } from "@/components/m3";
import { PixelScrim } from "@/components/pixel/PixelDither";
import { pixelStepsFor } from "@/lib/motion/pixel-physical";
import { useReducedMotionPref } from "@/lib/motion/use-reduced-motion";
import { cardDismissDirection, shouldCompleteCardDismiss, type CardEdges } from "@/lib/polaris/card-dismiss";
import { isOverHome } from "@/lib/nav/over-home";
import { useAppRouter, usePhoneEmbed, useScreenParams } from "@/lib/nav/phone-embed";
import { useFontStyle } from "@/lib/settings/readable-font";
import { m3 } from "@/lib/theme/m3";
import { PaletteOverride, type Palette } from "@/lib/theme/ThemeContext";
import { semantic } from "@/lib/theme/tokens";

import { DeepSpaceScreen } from "./DeepSpaceScreen";
import { PolarisCardEdgeContext } from "./polaris-card-edges";

/**
 * The home's top bar (ConstellationHome `topBar`: absolute, height 52) and its
 * dock stay on screen above this transparent modal, as they do over the phone
 * dashboard. DeepSpaceScreen draws the same dock and keeps the body above it;
 * the card starts below the top bar. polaris-card-contrast.test.ts reads the
 * home source so this number cannot drift from it.
 */
export const HOME_TOP_BAR_HEIGHT = 52;

const card = m3.polarisCard;

/** `<Text color=…>` on the Polaris card. Keys not listed keep the sky palette. */
export const POLARIS_CARD_PALETTE: Palette = {
  ...semantic,
  text: card.ink,
  textMuted: card.inkMuted,
  textSubtle: card.inkSubtle,
  brand: card.action,
};

/** MdButton on the Polaris card: lavender actions instead of sky blue. */
export const POLARIS_CARD_BUTTONS: MdButtonTint = {
  container: {
    filled: { backgroundColor: card.action },
    tonal: { backgroundColor: card.surfaceLow },
    outlined: { backgroundColor: "transparent", borderWidth: 1, borderColor: card.edge },
    text: { backgroundColor: "transparent", paddingHorizontal: m3.spacing.s3 },
    elevated: { backgroundColor: card.surfaceLow },
  },
  fg: {
    filled: card.onAction,
    tonal: card.inkMuted,
    outlined: card.action,
    text: card.action,
    elevated: card.action,
  },
};

export function PolarisCardOverlay({ children }: { children: ReactNode }) {
  // The deck and core-brain style sheets are rebuilt when the readable-font
  // setting flips; subscribing here re-renders them (DeepSpaceScreen did this
  // when /core-brain was a page).
  useFontStyle();
  // Inside the dashboard phone the card closes back through the phone's stack,
  // and there is no home top bar above it to clear.
  const router = useAppRouter();
  const embed = usePhoneEmbed();
  const { t } = useTranslation("core-brain");
  const { height } = useWindowDimensions();
  // Opened from the sky, the home stays visible under the scrim; opened from a
  // link with nothing underneath, DeepSpaceScreen paints the shared sky instead.
  // "Something to go back to" is not "the home is underneath": /records,
  // /profile, the empty-state replaces and the /persona redirect all open this
  // card over another screen, which then showed through the dither (QA 261004
  // D-05). Only the home's own entry says overlay=home, the /dashboard rule
  // (DashboardPhone.tsx).
  const { overlay } = useScreenParams<{ overlay?: string }>();
  const [overSky] = useState(() => isOverHome(overlay, router.canGoBack()));
  const reducedMotion = useReducedMotionPref();
  const edges = useRef<CardEdges>({ top: true, bottom: true });
  const offsetY = useRef(new Animated.Value(0)).current;
  const leaving = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      offsetY.stopAnimation();
    };
  }, [offsetY]);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [router]);

  const slide = useCallback(
    (toValue: number, duration: number, done?: () => void) => {
      Animated.timing(offsetY, {
        toValue,
        duration: reducedMotion ? 0 : duration,
        easing: pixelStepsFor(duration),
        useNativeDriver: Platform.OS !== "web",
      }).start(({ finished }) => {
        if (finished) done?.();
      });
    },
    [offsetY, reducedMotion],
  );

  const dismiss = useCallback(
    (direction: "down" | "up") => {
      if (leaving.current) return;
      leaving.current = true;
      slide(direction === "down" ? height : -height, 240, () => {
        if (mounted.current) close();
      });
    },
    [close, height, slide],
  );

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          !leaving.current && cardDismissDirection(gesture.dy, gesture.dx, edges.current) !== null,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          !leaving.current && cardDismissDirection(gesture.dy, gesture.dx, edges.current) !== null,
        onPanResponderGrant: () => {
          offsetY.stopAnimation();
        },
        onPanResponderMove: (_event, gesture) => {
          // Follow the finger only toward an edge the body is resting on.
          const allowed = (gesture.dy > 0 && edges.current.top) || (gesture.dy < 0 && edges.current.bottom);
          offsetY.setValue(allowed ? gesture.dy : 0);
        },
        onPanResponderRelease: (_event, gesture) => {
          const allowed = (gesture.dy > 0 && edges.current.top) || (gesture.dy < 0 && edges.current.bottom);
          if (allowed && shouldCompleteCardDismiss(gesture.dy, gesture.vy)) dismiss(gesture.dy > 0 ? "down" : "up");
          else slide(0, 180);
        },
        onPanResponderTerminate: () => slide(0, 180),
      }),
    [dismiss, offsetY, slide],
  );

  const reportEdges = useCallback((next: CardEdges) => {
    edges.current = next;
  }, []);

  return (
    <DeepSpaceScreen active="home" header="none" variant="fullbleed" showSharedSky transparentBackdrop={overSky}>
      <View style={styles.root}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => dismiss("down")}
          accessibilityRole="button"
          accessibilityLabel={t("closeCard")}
        >
          <PixelScrim style={styles.scrimImage} />
        </Pressable>
        <Animated.View
          {...pan.panHandlers}
          pointerEvents="box-none"
          onAccessibilityEscape={() => dismiss("down")}
          style={[
            styles.column,
            embed ? styles.columnEmbedded : null,
            { transform: [{ translateY: offsetY }] },
          ]}
        >
          <PolarisCardEdgeContext.Provider value={reportEdges}>
            <PaletteOverride palette={POLARIS_CARD_PALETTE}>
              <MdButtonTintProvider tint={POLARIS_CARD_BUTTONS}>{children}</MdButtonTintProvider>
            </PaletteOverride>
          </PolarisCardEdgeContext.Provider>
        </Animated.View>
      </View>
    </DeepSpaceScreen>
  );
}

/** A single Polaris-coloured card for states that are not a deck (loading, error). */
export function PolarisCardSurface({ children }: { children: ReactNode }) {
  return <View style={styles.surface}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Sized like the phone dashboard's scrim. absoluteFill alone left the dither
  // image at its 4x4 tile on web, so the home showed through undimmed.
  scrimImage: { width: "100%", height: "100%" },
  column: {
    flex: 1,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingTop: HOME_TOP_BAR_HEIGHT + 8,
    paddingBottom: 4,
    zIndex: 400,
  },
  columnEmbedded: { paddingHorizontal: 8, paddingTop: 4 },
  surface: {
    flex: 1,
    justifyContent: "center",
    padding: 18,
    borderWidth: 2,
    borderColor: card.edge,
    borderRadius: m3.shape.none,
    backgroundColor: card.surface,
  },
});
