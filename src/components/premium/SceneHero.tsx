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

// Character scale is keyed to the village art, not the screen. In the records
// island, the central desk is roughly 10-11% of the rendered island height; a
// worker at ~22% reads as about two desk-heights tall.
const WORKER_TO_ISLAND_SCALE = 0.22;

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
  const ownerSize = Math.min(workerSize, Math.max(44, Math.round(islandSize * WORKER_TO_ISLAND_SCALE)));
  const ownerHaloSize = ownerSize + 18;
  const ownerLeft = Math.max(12, Math.round(islandSize * 0.12));
  const ownerBottom = Math.max(14, Math.round(islandSize * 0.1));
  const bubbleWidth = Math.min(220, Math.max(168, Math.round(islandSize * 0.78)));
  const maxBubbleLeft = Math.max(8, islandSize - bubbleWidth - 8);
  const bubbleLeft = Math.max(8, Math.min(maxBubbleLeft, ownerLeft + ownerHaloSize / 2 - 28));
  const bubbleBottom = ownerBottom + ownerHaloSize - 4;
  const tailLeft = Math.max(18, Math.min(bubbleWidth - 26, ownerLeft + ownerHaloSize / 2 - bubbleLeft - 5));

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
        <View style={styles.stage}>
          <View style={[styles.islandFrame, { width: islandSize, height: islandSize }]}>
            <View
              style={[
                styles.glow,
                {
                  width: islandSize * 0.92,
                  height: islandSize * 0.92,
                  borderRadius: islandSize * 0.46,
                },
              ]}
            />
            <IslandArt id={island} size={islandSize} style={styles.island} />
            <View
              style={[
                styles.workerWrap,
                {
                  width: ownerHaloSize,
                  height: ownerHaloSize,
                  left: ownerLeft,
                  bottom: ownerBottom,
                },
              ]}
            >
              <View
                style={[
                  styles.workerHalo,
                  {
                    width: ownerHaloSize,
                    height: ownerHaloSize,
                    borderRadius: ownerHaloSize / 2,
                  },
                ]}
              />
              <WorkerSprite id={worker} size={ownerSize} paused />
            </View>
            <View style={[styles.bubble, { left: bubbleLeft, bottom: bubbleBottom, width: bubbleWidth }]}>
              <Text variant="body" style={styles.bubbleText}>{speech}</Text>
              <View style={[styles.bubbleTail, { left: tailLeft }]} />
            </View>
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
    minHeight: 404,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(255,159,214,0.28)",
    backgroundColor: "rgba(7,10,24,0.66)",
    shadowColor: cosmic.dreamPink,
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  stage: {
    minHeight: 300,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  islandFrame: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    backgroundColor: "rgba(255,159,214,0.11)",
    shadowColor: cosmic.dreamPink,
    shadowOpacity: 0.42,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  island: {
    opacity: 0.98,
  },
  workerWrap: {
    position: "absolute",
    zIndex: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  workerHalo: {
    position: "absolute",
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
    minHeight: 68,
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
    bottom: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "rgba(247,248,255,0.94)",
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
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(141,152,184,0.18)",
    backgroundColor: "rgba(7,10,24,0.32)",
  },
  actionButton: {
    minHeight: 52,
    borderRadius: radii.sm,
  },
});
