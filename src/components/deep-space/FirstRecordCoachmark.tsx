import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import {
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutRectangle,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, { Defs, Pattern, Rect } from "react-native-svg";

import { PixelPressable, PixelSurface } from "@/components/pixel";
import { Text } from "@/components/ui/Text";
import { keepAllKo } from "@/lib/i18n/keep-all";
import { m3 } from "@/lib/theme/m3";

type CoachTarget = LayoutRectangle;

interface FirstRecordCoachmarkProps {
  targetRef: RefObject<View | null>;
  countLabel: string;
  message: string;
  hint: string;
  skipLabel?: string;
  actionLabel?: string;
  onSkip?: () => void;
  onAction?: () => void;
  refreshKey: string;
}

function DitherPanel({ style }: { style: StyleProp<ViewStyle> }) {
  const patternId = `first-record-dim-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <View pointerEvents="auto" style={[styles.dimPanel, style]}>
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id={patternId} patternUnits="userSpaceOnUse" width={4} height={4}>
            <Rect x={0} y={0} width={2} height={2} fill={m3.accent.stageFloor} />
            <Rect x={2} y={2} width={2} height={2} fill={m3.accent.stageFloor} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${patternId})`} />
      </Svg>
    </View>
  );
}

export function FirstRecordCoachmark({
  targetRef,
  countLabel,
  message,
  hint,
  skipLabel,
  actionLabel,
  onSkip,
  onAction,
  refreshKey,
}: FirstRecordCoachmarkProps) {
  const overlayRef = useRef<View>(null);
  const [target, setTarget] = useState<CoachTarget | null>(null);
  const { width, height } = useWindowDimensions();

  const measureTarget = useCallback(() => {
    const overlay = overlayRef.current;
    const node = targetRef.current;
    if (!overlay || !node) return;
    overlay.measureInWindow((overlayX, overlayY) => {
      node.measureInWindow((x, y, targetWidth, targetHeight) => {
        if (targetWidth <= 0 || targetHeight <= 0) return;
        setTarget({
          x: x - overlayX,
          y: y - overlayY,
          width: targetWidth,
          height: targetHeight,
        });
      });
    });
  }, [targetRef]);

  useEffect(() => {
    setTarget(null);
    const handles = [0, 120, 320].map((delay) => setTimeout(measureTarget, delay));
    return () => handles.forEach(clearTimeout);
  }, [height, measureTarget, refreshKey, width]);

  if (!target) {
    return (
      <View
        ref={overlayRef}
        collapsable={false}
        pointerEvents="none"
        onLayout={measureTarget}
        style={styles.overlay}
      />
    );
  }

  const pad = m3.spacing.s2;
  const left = Math.max(0, target.x - pad);
  const top = Math.max(0, target.y - pad);
  const right = Math.min(width, target.x + target.width + pad);
  const bottom = Math.min(height, target.y + target.height + pad);
  const bubbleAbove = top > height * 0.55;

  return (
    <View
      ref={overlayRef}
      collapsable={false}
      pointerEvents="box-none"
      onLayout={measureTarget}
      style={styles.overlay}
    >
      <DitherPanel style={{ left: 0, right: 0, top: 0, height: top }} />
      <DitherPanel style={{ left: 0, right: 0, top: bottom, bottom: 0 }} />
      <DitherPanel style={{ left: 0, top, width: left, height: bottom - top }} />
      <DitherPanel style={{ left: right, right: 0, top, height: bottom - top }} />

      <View
        pointerEvents="none"
        style={[
          styles.targetFrame,
          { left, top, width: right - left, height: bottom - top },
        ]}
      />

      <View style={[styles.bubbleWrap, bubbleAbove ? styles.bubbleTop : styles.bubbleBottom]}>
        <PixelSurface
          variant="bevel"
          background={m3.color.surfaceContainerHigh}
          contentStyle={styles.bubble}
        >
          <Text variant="caption" style={styles.count}>
            {countLabel}
          </Text>
          <Text
            variant="body"
            style={styles.message}
            accessibilityLabel={message}
          >
            {keepAllKo(message)}
          </Text>
          <Text variant="caption" style={styles.hint} accessibilityLabel={hint}>
            {keepAllKo(hint)}
          </Text>
          {skipLabel || actionLabel ? (
            <View style={styles.actions}>
              {skipLabel && onSkip ? (
                <PixelPressable
                  onPress={onSkip}
                  variant="flat"
                  background={m3.color.surfaceContainer}
                  accessibilityLabel={skipLabel}
                  contentStyle={styles.actionContent}
                >
                  <Text variant="caption" style={styles.skipText}>
                    {skipLabel}
                  </Text>
                </PixelPressable>
              ) : <View />}
              {actionLabel && onAction ? (
                <PixelPressable
                  onPress={onAction}
                  background={m3.color.primary}
                  accessibilityLabel={actionLabel}
                  contentStyle={styles.actionContent}
                >
                  <Text variant="body" style={styles.actionText}>
                    {actionLabel}
                  </Text>
                </PixelPressable>
              ) : null}
            </View>
          ) : null}
        </PixelSurface>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 40,
  },
  dimPanel: {
    position: "absolute",
    overflow: "hidden",
  },
  targetFrame: {
    position: "absolute",
    borderWidth: m3.spacing.s1,
    borderColor: m3.color.primary,
    borderRadius: m3.shape.none,
  },
  bubbleWrap: {
    position: "absolute",
    left: m3.spacing.s4,
    right: m3.spacing.s4,
  },
  bubbleBottom: { bottom: m3.spacing.s8 },
  bubbleTop: { top: m3.spacing.s6 },
  bubble: { gap: m3.spacing.s2, paddingVertical: m3.spacing.s3 },
  count: {
    color: m3.color.primary,
    fontFamily: m3.font.mono,
    fontSize: 12,
    lineHeight: 18,
    paddingBottom: 2,
  },
  message: {
    color: m3.color.onSurface,
    fontSize: 15,
    lineHeight: 22,
    paddingBottom: 2,
  },
  hint: {
    color: m3.color.onSurfaceVariant,
    fontSize: 12,
    lineHeight: 18,
    paddingBottom: 2,
  },
  actions: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: m3.spacing.s2,
  },
  actionContent: {
    minHeight: m3.minTouch,
    justifyContent: "center",
    paddingVertical: m3.spacing.s2,
  },
  skipText: {
    color: m3.color.onSurfaceVariant,
    fontSize: 12,
    lineHeight: 18,
    paddingBottom: 2,
  },
  actionText: {
    color: m3.color.onPrimary,
    fontSize: 14,
    lineHeight: 20,
    paddingBottom: 2,
  },
});
