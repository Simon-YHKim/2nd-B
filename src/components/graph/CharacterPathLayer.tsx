// CharacterPathLayer — placeholder for the 2026-05-29 handoff §5 / §10
// "small pixel robot residents walking along edges". Phase 1 lands the
// layer + 6 sprite slots only; the actual walker animation (path
// follow + idle blink) ships in Phase 3 once the sprite sheet exists.
//
// Each character renders as a 22×22 colored block centered on a fixed
// graph anchor (their "home" node on the village map). Real sprites
// arrive as <Image> sources later; the layout / hit area / z-index are
// already correct so the swap is a one-liner per character.

import { View, StyleSheet } from "react-native";

import { cosmic } from "@/lib/theme/tokens";
import { CHARACTER_ORDER, CHARACTERS, type CharacterId } from "@/lib/characters";

interface Props {
  /** Bounding box of the parent graph viewport — provides the coordinate frame. */
  width: number;
  height: number;
  /** Hide the layer entirely (e.g., when the user pinches in past tier 4). */
  hidden?: boolean;
}

// Home anchors per character, as fractions of the viewport. Picked to
// loosely align with the handoff §7-1 walker positions:
//   - SecondB drifts near the core (top-right of center)
//   - Momo sits on the 기록 동네 path (upper-left)
//   - Lulu wanders the 공상 동네 path (lower-left)
//   - Archi watches the 일 동네 path (upper-right)
//   - Vela hovers near the 공상 corner (lower-left edge)
//   - Gadi stays close to center but slightly lower (guard radius)
const ANCHORS: Record<CharacterId, { x: number; y: number }> = {
  secondb: { x: 0.58, y: 0.35 },
  momo: { x: 0.36, y: 0.30 },
  lulu: { x: 0.30, y: 0.62 },
  archi: { x: 0.66, y: 0.48 },
  vela: { x: 0.40, y: 0.76 },
  gadi: { x: 0.52, y: 0.58 },
};

export function CharacterPathLayer({ width, height, hidden }: Props) {
  if (hidden) return null;
  return (
    <View
      style={[styles.layer, { width, height }]}
      pointerEvents="none"
      accessibilityElementsHidden
    >
      {CHARACTER_ORDER.map((id) => {
        const c = CHARACTERS[id];
        const anchor = ANCHORS[id];
        return (
          <View
            key={id}
            style={[
              styles.spriteSlot,
              {
                left: anchor.x * width - 11,
                top: anchor.y * height - 11,
                shadowColor: c.accent,
              },
            ]}
            accessibilityLabel={c.name.en}
          >
            {/* Placeholder pixel body. Replace with <Image source={...} />
                when assets/characters/{id}-idle.png lands. */}
            <View style={[styles.body, { backgroundColor: c.accent }]} />
            {/* Mint signal core — present on every resident, like a heartbeat */}
            <View style={styles.core} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: "absolute", left: 0, top: 0 },
  spriteSlot: {
    position: "absolute",
    width: 22, height: 22,
    alignItems: "center", justifyContent: "center",
    shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
  },
  body: {
    position: "absolute",
    width: 16, height: 14,
    borderRadius: 3,
    borderWidth: 2,
    borderColor: cosmic.space950,
  },
  core: {
    width: 3, height: 3,
    backgroundColor: cosmic.signalMint,
    marginTop: 6,
    shadowColor: cosmic.signalMint,
    shadowOpacity: 0.9, shadowRadius: 3, shadowOffset: { width: 0, height: 0 },
  },
});
