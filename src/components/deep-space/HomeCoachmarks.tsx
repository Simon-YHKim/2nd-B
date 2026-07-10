// 홈 코치마크 (rev2 Screen-Spec 04): a 4-step spotlight guide over the
// constellation home on first visit. Spotlight ring + SecondB speech bubble;
// 다음 advances, 다시 보지 않기 ends + remembers, 시작하기 ends on the last step.
//
// Step targets are proportional viewport anchors (the constellation and the
// dock have stable regions), not measured node positions — the ring frames a
// REGION, matching the prototype's loose spotlight, so no layout plumbing.
//
// Step 4 copy: the spec says "설정엔 통화 녹음도" but call recording has not
// shipped (native+legal gate) — pointing a first-run guide at an unshipped
// feature breaks the honesty register, so the step points at settings/tools
// generically until 통화 녹음 ships.
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { SecondbHead } from "@/components/deep-space/SecondbHead";
import { deepSpace, spacing, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { markCoachmarksSeen } from "@/lib/onboarding/coachmarks-gate";

interface Step {
  /** Spotlight ring center + radius, as fractions of the viewport. */
  cx: number;
  cy: number;
  r: number;
  /** i18n key suffix under coachmarks. — resolves via t(`deepspace:coachmarks.${key}`). */
  key: string;
}

const STEPS: Step[] = [
  // 1/4 the constellation itself
  { cx: 0.5, cy: 0.32, r: 0.42, key: "step1" },
  // 2/4 a star (the upper-right region where 담아내기/관계 sit)
  { cx: 0.62, cy: 0.3, r: 0.16, key: "step2" },
  // 3/4 the dock capture tab (bottom, second slot of five)
  { cx: 0.3, cy: 0.955, r: 0.12, key: "step3" },
  // 4/4 the dock trailing tabs (settings/tools live behind 비서·나)
  { cx: 0.86, cy: 0.955, r: 0.12, key: "step4" },
];

export function HomeCoachmarks({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation("deepspace");
  const { width, height } = useWindowDimensions();
  const [idx, setIdx] = useState(0);

  const finish = useCallback(() => {
    markCoachmarksSeen();
    onDone();
  }, [onDone]);

  const step = STEPS[idx];
  const last = idx === STEPS.length - 1;
  const ringSize = Math.min(width, height) * step.r * 2;

  return (
    <View style={styles.overlay} accessibilityViewIsModal pointerEvents="auto">
      {/* spotlight ring — a lit circle over the dimmed field */}
      <View
        pointerEvents="none"
        style={[
          styles.ring,
          {
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
            left: width * step.cx - ringSize / 2,
            top: height * step.cy - ringSize / 2,
          },
        ]}
      />

      {/* SecondB bubble */}
      <View style={[styles.bubbleWrap, step.cy > 0.6 ? styles.bubbleTop : styles.bubbleBottom]}>
        <SecondbHead size={44} mood="neutral" accessibilityLabel={t("deepspace:coachmarks.secondbName")} />
        <View style={styles.bubble}>
          <Text style={styles.stepCount}>{`${idx + 1}/${STEPS.length}`}</Text>
          <Text style={styles.bubbleText}>{t(`deepspace:coachmarks.${step.key}`)}</Text>
          <View style={styles.btnRow}>
            <Pressable onPress={finish} hitSlop={8} accessibilityRole="button" style={styles.ghostBtn}>
              <Text style={styles.ghostText}>{t("deepspace:coachmarks.dontShowAgain")}</Text>
            </Pressable>
            <Pressable
              onPress={() => (last ? finish() : setIdx((v) => v + 1))}
              hitSlop={8}
              accessibilityRole="button"
              style={styles.nextBtn}
            >
              <Text style={styles.nextText}>{last ? t("deepspace:coachmarks.start") : t("deepspace:coachmarks.next")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: withAlpha(deepSpace.bgEdge, 0.72),
    zIndex: 40,
  },
  ring: {
    position: "absolute",
    borderWidth: 2,
    borderColor: withAlpha(deepSpace.accent, 0.9),
    backgroundColor: withAlpha(deepSpace.accent, 0.08),
    shadowColor: deepSpace.accent,
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  bubbleWrap: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  bubbleBottom: { bottom: 120 },
  bubbleTop: { top: 96 },
  bubble: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: withAlpha(deepSpace.accent, 0.35),
    backgroundColor: "#0B1120",
    padding: spacing.md,
    gap: 6,
  },
  stepCount: { fontFamily: m3.font.mono, fontSize: 10, color: withAlpha(deepSpace.accentSoft, 0.7) },
  bubbleText: { fontSize: 15, lineHeight: 22, color: "#EAF2FF", fontWeight: "600" },
  btnRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  ghostBtn: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  ghostText: { fontSize: 12.5, color: withAlpha(deepSpace.accentSoft, 0.8) },
  nextBtn: {
    minHeight: 44,
    minWidth: 88,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: deepSpace.accent,
    paddingHorizontal: 18,
  },
  nextText: { fontSize: 14, fontWeight: "700", color: deepSpace.bgEdge },
});
