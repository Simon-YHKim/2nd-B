import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { IslandArt, type IslandId } from "@/components/art/IslandArt";
import { WorkerSprite, type WorkerId } from "@/components/art/WorkerSprite";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { cosmic, radii, spacing } from "@/lib/theme/tokens";

type SceneHeroAction = {
  label: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary";
};

export function SceneHero({
  eyebrow,
  title,
  subtitle,
  island,
  worker,
  speech,
  primaryAction,
  secondaryAction,
  islandSize = 274,
  workerSize = 104,
  railIcons = ["⌂", "✦", "⌕", "◇"],
  style,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  island: IslandId;
  worker: WorkerId;
  speech: string;
  primaryAction?: SceneHeroAction;
  secondaryAction?: SceneHeroAction;
  islandSize?: number;
  workerSize?: number;
  railIcons?: string[];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.copy}>
        <Text variant="caption" color="brand" style={styles.eyebrow}>{eyebrow}</Text>
        <Text variant="heading">{title}</Text>
        {subtitle ? (
          <Text variant="subtle" color="textMuted" style={styles.subtitle}>{subtitle}</Text>
        ) : null}
      </View>

      <View style={styles.shell}>
        <View style={styles.rail} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {railIcons.map((icon, index) => (
            <View key={`${icon}-${index}`} style={[styles.railButton, index === 0 ? styles.railButtonActive : null]}>
              <Text variant="body" style={styles.railIcon}>{icon}</Text>
            </View>
          ))}
        </View>

        <View style={styles.stage}>
          <View style={styles.glow} />
          <IslandArt id={island} size={islandSize} style={styles.island} />
          <View style={styles.workerWrap}>
            <View style={styles.workerHalo} />
            <WorkerSprite id={worker} size={workerSize} paused />
          </View>
          <View style={styles.bubble}>
            <View style={styles.bubbleTail} />
            <Text variant="body" style={styles.bubbleText}>{speech}</Text>
          </View>
        </View>

        {primaryAction || secondaryAction ? (
          <View style={styles.actions}>
            {primaryAction ? (
              <Button
                label={primaryAction.label}
                variant={primaryAction.variant ?? "primary"}
                loading={primaryAction.loading}
                disabled={primaryAction.disabled}
                onPress={primaryAction.onPress}
                style={styles.actionButton}
              />
            ) : null}
            {secondaryAction ? (
              <Button
                label={secondaryAction.label}
                variant={secondaryAction.variant ?? "secondary"}
                loading={secondaryAction.loading}
                disabled={secondaryAction.disabled}
                onPress={secondaryAction.onPress}
                style={styles.actionButton}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  copy: { gap: spacing.xs },
  eyebrow: { color: cosmic.dreamPink, letterSpacing: 1.2 },
  subtitle: { marginTop: 1 },
  shell: {
    position: "relative",
    overflow: "hidden",
    minHeight: 430,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(255,159,214,0.28)",
    backgroundColor: "rgba(7,10,24,0.66)",
    shadowColor: cosmic.dreamPink,
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  rail: {
    position: "absolute",
    left: spacing.sm,
    top: spacing.sm,
    zIndex: 6,
    gap: spacing.sm,
    padding: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "rgba(141,152,184,0.24)",
    backgroundColor: "rgba(13,21,48,0.86)",
  },
  railButton: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(141,152,184,0.16)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  railButtonActive: {
    borderColor: "rgba(167,139,250,0.78)",
    backgroundColor: "rgba(167,139,250,0.26)",
  },
  railIcon: { color: cosmic.moonWhite, fontWeight: "800" },
  stage: {
    minHeight: 312,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  glow: {
    position: "absolute",
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: "rgba(255,159,214,0.11)",
    shadowColor: cosmic.dreamPink,
    shadowOpacity: 0.42,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  island: {
    marginTop: spacing.md,
    opacity: 0.98,
  },
  workerWrap: {
    position: "absolute",
    left: 52,
    bottom: 44,
    zIndex: 4,
    width: 128,
    height: 128,
    alignItems: "center",
    justifyContent: "center",
  },
  workerHalo: {
    position: "absolute",
    width: 118,
    height: 118,
    borderRadius: 59,
    borderWidth: 1,
    borderColor: "rgba(255,159,214,0.52)",
    backgroundColor: "rgba(7,10,24,0.58)",
    shadowColor: cosmic.dreamPink,
    shadowOpacity: 0.42,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  bubble: {
    position: "absolute",
    right: spacing.md,
    bottom: 74,
    width: 188,
    minHeight: 82,
    justifyContent: "center",
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
    backgroundColor: "rgba(247,248,255,0.94)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    zIndex: 5,
  },
  bubbleTail: {
    position: "absolute",
    left: -10,
    bottom: 22,
    width: 0,
    height: 0,
    borderTopWidth: 8,
    borderBottomWidth: 8,
    borderRightWidth: 11,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderRightColor: "rgba(247,248,255,0.94)",
  },
  bubbleText: {
    color: cosmic.space900,
    fontWeight: "700",
    lineHeight: 21,
  },
  actions: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  actionButton: {
    minHeight: 52,
    borderRadius: radii.sm,
  },
});
