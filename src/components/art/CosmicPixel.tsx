// Cosmic Pixel art components — thin SvgXml wrappers around the committed
// asset SVGs (public/assets/cosmic-pixel-v1, via the generated
// cosmicPixelXml module). We use SvgXml from react-native-svg (already a
// dependency, already used by NavGraph) so this renders identically on
// native + web with no extra bundler/transformer config.
//
// Colours are kept as the asset's originals for now (per the asset order);
// because the SVG is inline we can later override fills by string-swap or
// switch strokes to currentColor for token-driven theming.

import { useEffect, useRef } from "react";
import { Animated, Easing, type ViewStyle } from "react-native";
import { SvgXml } from "react-native-svg";

import { COSMIC_PIXEL_XML } from "./cosmicPixelXml";
import { MOBILE_GRAPH_XML } from "./mobileGraphXml";
import type { CharacterId } from "@/lib/characters";

// Native viewBox aspect (width / height) per non-square asset, so a single
// `size` (= rendered width) preserves proportions.
const NODE_ASPECT = {
  coreNode: 128 / 128,
  domainNode: 104 / 88,
  personaNode: 88 / 92,
  dataShard: 64 / 64,
} as const;

function Art({ name, width, aspect = 1 }: { name: string; width: number; aspect?: number }) {
  const xml = COSMIC_PIXEL_XML[name];
  if (!xml) return null;
  return <SvgXml xml={xml} width={width} height={width / aspect} />;
}

export function CoreNodeArt({ size }: { size: number }) {
  return <Art name="coreNode" width={size} aspect={NODE_ASPECT.coreNode} />;
}
export function DomainNodeArt({ size }: { size: number }) {
  return <Art name="domainNode" width={size} aspect={NODE_ASPECT.domainNode} />;
}
export function PersonaNodeArt({ size }: { size: number }) {
  return <Art name="personaNode" width={size} aspect={NODE_ASPECT.personaNode} />;
}
export function DataShardArt({ size }: { size: number }) {
  return <Art name="dataShard" width={size} aspect={NODE_ASPECT.dataShard} />;
}

/** Render the right node art for a graph tier (1 core / 2 domain / 3 persona / 4 shard).
 *  Uses the v2 mobile-graph node art (square viewBoxes 128/96/80/48). */
export function NodeArt({ tier, size }: { tier: 1 | 2 | 3 | 4; size: number }) {
  const key = tier === 1 ? "core_v2" : tier === 2 ? "domain_v2" : tier === 3 ? "persona_v2" : "shard_v2";
  return <SvgXml xml={MOBILE_GRAPH_XML[key]} width={size} height={size} />;
}

/** A self-contained v2 HUD button glyph (settings / back), 56×56 art. */
export function PixelButton({ kind, size = 40 }: { kind: "settings" | "back"; size?: number }) {
  const xml = MOBILE_GRAPH_XML[kind === "settings" ? "btn_settings" : "btn_back"];
  return <SvgXml xml={xml} width={size} height={size} />;
}

/** One of the six pixel residents (all 64×64 square). */
export function CharacterArt({ id, size }: { id: CharacterId; size: number }) {
  return <Art name={id} width={size} aspect={1} />;
}

/** A nav/action icon from the icon set, kept at its original colour. */
export function PixelIcon({ name, size = 24 }: { name: string; size?: number }) {
  return <Art name={`icon_${name}`} width={size} aspect={1} />;
}

/**
 * A character that flashes in briefly for an event moment (save, connect,
 * etc.) then fades out — per the asset order's "캐릭터는 이벤트 순간에만
 * 등장" rule. Bump `trigger` (a counter) to fire; it never shows at 0.
 */
export function CharacterFlash({
  id,
  trigger,
  size = 52,
  style,
}: {
  id: CharacterId;
  trigger: number;
  size?: number;
  style?: ViewStyle;
}) {
  const op = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(10)).current;
  useEffect(() => {
    if (!trigger) return;
    op.setValue(0);
    ty.setValue(10);
    const anim = Animated.sequence([
      Animated.parallel([
        Animated.timing(op, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(ty, { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.delay(950),
      Animated.timing(op, { toValue: 0, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [trigger, op, ty]);
  return (
    <Animated.View pointerEvents="none" style={[{ opacity: op, transform: [{ translateY: ty }] }, style]}>
      <CharacterArt id={id} size={size} />
    </Animated.View>
  );
}
