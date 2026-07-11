/**
 * STEP 3 — <SecondbStatusHeader /> : the per-screen status bar from
 * design/prototype.dc.html. Left = small SecondbHead; right = a speech bubble
 * (tail on the left, radius 4/13/13/13) carrying the current `text` plus a TIP
 * line. Every deep-space screen lays this at the top and injects its own copy.
 *
 * Colors come only from deepSpace.* tokens (DESIGN.md: no hex/rgba literals in
 * components). Korean body copy uses Pretendard (readable); the TIP eyebrow uses
 * the Press Start 2P pixel face.
 *
 * This is the SINGLE canonical SecondbStatusHeader: the former legacy-token copy
 * at components/deepspace/ now re-exports this one through that barrel, so every
 * deep-space screen renders one implementation. It reserves BackArrow headroom
 * (below) for the screens that mount it outside DeepSpaceScreen.
 */
import { StyleSheet, View } from "react-native";
import { usePathname } from "expo-router";

import { deepSpace, withAlpha } from "@/lib/theme/tokens";
import type { M3Persona } from "@/lib/theme/m3";
import { Text } from "@/components/ui/Text";
import { keepAllKo } from "@/lib/i18n/keep-all";
import { backArrowVisible } from "@/components/ui/BackArrow";
import { SecondbHead, type SecondbMood } from "./SecondbHead";

export function SecondbStatusHeader({
  text,
  tip,
  tipLabel = "TIP",
  mood = "neutral",
  persona,
  accessibilityLabel,
}: {
  text: string;
  tip?: string;
  tipLabel?: string;
  mood?: SecondbMood;
  /** rev2 persona tint for the head (secondb/meta/twi). Unset = canonical cyan. */
  persona?: M3Persona;
  accessibilityLabel?: string;
}) {
  // Reserve top headroom on sub-screens so the floating BackArrow chip does not
  // overlap the head/bubble. backArrowVisible() is false on tab roots and on the
  // deep-space dock routes (DeepSpaceScreen), so those add no extra room.
  const needHeadroom = backArrowVisible(usePathname());
  return (
    <View style={[styles.row, needHeadroom ? styles.rowHeadroom : null]}>
      <SecondbHead size={48} mood={mood} persona={persona} accessibilityLabel={accessibilityLabel} />
      <View style={styles.bubble}>
        <View style={styles.tail} />
        <Text variant="body" style={styles.text} accessibilityLabel={text}>{keepAllKo(text)}</Text>
        {tip ? (
          <View style={styles.tipRow}>
            <Text variant="caption" pixelEn style={styles.tipLabel}>{tipLabel}</Text>
            <Text variant="body" style={styles.tip} accessibilityLabel={tip}>{keepAllKo(tip)}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    marginHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: withAlpha(deepSpace.accent, 0.12),
  },
  // Sub-screens: clear the floating BackArrow chip (top-left ~44pt) above the head.
  rowHeadroom: { marginTop: 52 },
  bubble: {
    flex: 1,
    position: "relative",
    backgroundColor: deepSpace.card,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 13,
    borderBottomRightRadius: 13,
    borderBottomLeftRadius: 13,
    paddingVertical: 10,
    paddingHorizontal: 13,
  },
  tail: {
    position: "absolute",
    left: -5,
    top: 11,
    width: 9,
    height: 9,
    backgroundColor: deepSpace.card,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: deepSpace.cardLine,
    transform: [{ rotate: "45deg" }],
  },
  text: {
    color: deepSpace.textHi,
    fontSize: 14,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 7,
  },
  tipLabel: {
    color: deepSpace.mint,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  tip: {
    flex: 1,
    color: deepSpace.textMid,
    fontSize: 12,
  },
});
