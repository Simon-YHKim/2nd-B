// Pattern Link v47.3 preview (GPT UI/UX design draft — PREVIEW ONLY).
//
// Default graph reads as a quiet static crystal conduit; the bidirectional flow
// and tesseract-focus surge are transparent overlay spritesheets composited over
// the static tile and only animate in the zoom-detail / focus states. Mirrors
// GPT's interactive preview timing (flow 3000ms / 10 frames, surge 1900ms / 14
// frames). NOT production behavior — the production graph keeps its single-line
// edge until Simon approves the bidirectional flow after viewing this route.
//
// Route: /asset-motion-preview-v47-3
//
// Constraints honored: cosmic tokens + withAlpha only (no raw hex/rgba), single
// line (no default two-line edge), no always-on traffic (overlays only when the
// state shows them), pixel-crisp (integer scale, fadeDuration 0), and
// prefers-reduced-motion / the Motion toggle collapse to the static conduit.

import { useEffect, useState } from "react";
import { Image, type ImageSourcePropType, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";

import { StarNoiseLayer } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { prefersReducedMotion } from "@/lib/motion/signature";
import { cosmic, withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";

const TILE = require("../../public/assets/pattern-link/v47-3/pattern-link-crystal-conduit-tile-v47-3.png") as ImageSourcePropType;
const FLOW = require("../../public/assets/pattern-link/v47-3/pattern-link-bidirectional-flow-overlay-spritesheet-v47-3.png") as ImageSourcePropType;
const SURGE = require("../../public/assets/pattern-link/v47-3/pattern-link-focus-surge-overlay-spritesheet-v47-3.png") as ImageSourcePropType;

// Native frame is 96x16; render at an integer scale so the @4x source stays
// pixel-crisp.
const FRAME_W = 96;
const FRAME_H = 16;
const SCALE = 3;
const W = FRAME_W * SCALE;
const H = FRAME_H * SCALE;

// Frame counts + loop durations from GPT's design spec / interactive preview.
const FLOW_FRAMES = 10;
const FLOW_DURATION_MS = 3000;
const SURGE_FRAMES = 14;
const SURGE_DURATION_MS = 1900;

type Overlay = { source: ImageSourcePropType; frames: number; durationMs: number };

// A pixel-stepped sprite strip: shows one FRAME_W slice at a time and advances
// discretely (like CSS steps()), looping. Mounted only while motion is active.
function SpriteStrip({ source, frames, durationMs }: Overlay) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const stepMs = durationMs / frames;
    const id = setInterval(() => setFrame((f) => (f + 1) % frames), stepMs);
    return () => clearInterval(id);
  }, [source, frames, durationMs]);
  return (
    <View style={[styles.stripClip, { width: W, height: H }]} pointerEvents="none">
      <Image
        source={source}
        style={{ width: W * frames, height: H, transform: [{ translateX: -frame * W }] }}
        resizeMode="stretch"
        fadeDuration={0}
      />
    </View>
  );
}

function Conduit({ overlay, motion }: { overlay: Overlay | null; motion: boolean }) {
  return (
    <View style={[styles.conduit, { width: W, height: H }]}>
      <Image source={TILE} style={[StyleSheet.absoluteFill, { width: W, height: H }]} resizeMode="stretch" fadeDuration={0} />
      {overlay && motion ? <SpriteStrip {...overlay} /> : null}
    </View>
  );
}

function StateCard({ label, desc, overlay, motion }: { label: string; desc: string; overlay: Overlay | null; motion: boolean }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={styles.cardDesc}>{desc}</Text>
      <View style={styles.stage}>
        <Conduit overlay={overlay} motion={motion} />
      </View>
    </View>
  );
}

export default function PatternLinkV473Preview() {
  const { width, height } = useWindowDimensions();
  const reduced = prefersReducedMotion();
  const [motionOn, setMotionOn] = useState(!reduced);
  const motion = motionOn && !reduced;

  return (
    <View style={styles.root}>
      <StarNoiseLayer width={width} height={height} count={80} />
      <View style={styles.toolbar} pointerEvents="box-none">
        <View style={styles.brandPill}>
          <Text style={styles.brandText}>Pattern Link v47.3</Text>
        </View>
        <Pressable
          onPress={() => setMotionOn((v) => !v)}
          disabled={reduced}
          accessibilityRole="switch"
          accessibilityState={{ checked: motion, disabled: reduced }}
          style={[styles.toggle, motion ? styles.toggleOn : null, reduced ? styles.toggleDisabled : null]}
        >
          <Text style={[styles.toggleText, motion ? styles.toggleTextOn : null]}>
            {reduced ? "Reduced motion" : motion ? "Motion on" : "Motion off"}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Default Pattern Link is a quiet crystal conduit. Bidirectional flow and the focus surge appear only when you look
          closely or tap a tesseract. Preview only, not production behavior.
        </Text>

        <StateCard
          label="1 / Default graph"
          desc="Static crystal conduit. No packet traffic."
          overlay={null}
          motion={motion}
        />
        <StateCard
          label="2 / Zoomed detail"
          desc="Single line: primary upward signal with a weaker, slower return echo."
          overlay={{ source: FLOW, frames: FLOW_FRAMES, durationMs: FLOW_DURATION_MS }}
          motion={motion}
        />
        <StateCard
          label="3 / Tesseract focus"
          desc="Wake, primary surge toward the tapped tesseract, then a delayed return echo."
          overlay={{ source: SURGE, frames: SURGE_FRAMES, durationMs: SURGE_DURATION_MS }}
          motion={motion}
        />

        <Text style={styles.note}>
          Single-line edge, far links stay quiet, no always-on traffic. Reduced motion (or Motion off) shows the static
          conduit only.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: cosmic.space950,
  },
  toolbar: {
    position: "absolute",
    top: 18,
    left: 14,
    right: 14,
    zIndex: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  brandPill: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: withAlpha(cosmic.signalMint, 0.34),
    backgroundColor: withAlpha(cosmic.space950, 0.82),
  },
  brandText: {
    color: cosmic.signalMint,
    fontFamily: fontFamilies.pixel,
    fontSize: 11,
    letterSpacing: 0,
  },
  toggle: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: withAlpha(cosmic.mistGray, 0.32),
    backgroundColor: withAlpha(cosmic.lineDim, 0.5),
  },
  toggleOn: {
    borderColor: withAlpha(cosmic.signalMint, 0.5),
    backgroundColor: withAlpha(cosmic.signalMint, 0.16),
  },
  toggleDisabled: {
    opacity: 0.5,
  },
  toggleText: {
    color: cosmic.mistGray,
    fontFamily: fontFamilies.pixel,
    fontSize: 11,
    letterSpacing: 0,
  },
  toggleTextOn: {
    color: cosmic.signalMint,
  },
  content: {
    paddingTop: 76,
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 16,
  },
  intro: {
    color: cosmic.mistGray,
    fontFamily: fontFamilies.sans,
    fontSize: 13,
    lineHeight: 19,
  },
  card: {
    gap: 8,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: withAlpha(cosmic.lineDim, 0.8),
    backgroundColor: withAlpha(cosmic.space950, 0.72),
  },
  cardLabel: {
    color: cosmic.moonWhite,
    fontFamily: fontFamilies.pixel,
    fontSize: 12,
    letterSpacing: 0,
  },
  cardDesc: {
    color: cosmic.mistGray,
    fontFamily: fontFamilies.sans,
    fontSize: 12,
    lineHeight: 17,
  },
  stage: {
    marginTop: 4,
    minHeight: H + 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    paddingVertical: 12,
    backgroundColor: withAlpha(cosmic.space950, 0.6),
  },
  conduit: {
    position: "relative",
  },
  stripClip: {
    position: "absolute",
    top: 0,
    left: 0,
    overflow: "hidden",
  },
  note: {
    color: withAlpha(cosmic.mistGray, 0.8),
    fontFamily: fontFamilies.sans,
    fontSize: 11,
    lineHeight: 16,
  },
});
