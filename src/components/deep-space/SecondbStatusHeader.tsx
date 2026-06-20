/**
 * STEP 3 — <SecondbStatusHeader /> : the per-screen status bar from
 * design/prototype.dc.html. Left = small SecondbHead; right = a speech bubble
 * (tail on the left, radius 4/13/13/13) carrying the current `text` plus a TIP
 * line. Every deep-space screen lays this at the top and injects its own copy.
 *
 * Colors come only from deepSpace.* tokens (DESIGN.md: no hex/rgba literals in
 * components). Korean body copy uses Pretendard (readable); the TIP eyebrow uses
 * the Press Start 2P pixel face.
 */
import { StyleSheet, Text, View } from "react-native";

import { deepSpace, withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { SecondbHead, type SecondbMood } from "./SecondbHead";

export function SecondbStatusHeader({
  text,
  tip,
  tipLabel = "TIP",
  mood = "neutral",
  accessibilityLabel,
}: {
  text: string;
  tip?: string;
  tipLabel?: string;
  mood?: SecondbMood;
  accessibilityLabel?: string;
}) {
  return (
    <View style={styles.row}>
      <SecondbHead size={48} mood={mood} accessibilityLabel={accessibilityLabel} />
      <View style={styles.bubble}>
        <View style={styles.tail} />
        <Text style={styles.text}>{text}</Text>
        {tip ? (
          <View style={styles.tipRow}>
            <Text style={styles.tipLabel}>{tipLabel}</Text>
            <Text style={styles.tip}>{tip}</Text>
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
    lineHeight: 20, // generous so Hangul 받침 is not clipped (ANDROID_QA §1)
    fontFamily: fontFamilies.readable,
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
    fontFamily: fontFamilies.pixelEn,
  },
  tip: {
    flex: 1,
    color: deepSpace.textMid,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: fontFamilies.readable,
  },
});
