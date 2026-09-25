import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { PixelSurface } from "@/components/pixel/PixelSurface";
import { keepAllKo } from "@/lib/i18n/keep-all";
import {
  dialogueDelayAfter,
  dialogueSlice,
  shouldPlayDialogueBlip,
  TYPEWRITER_STEP_MS,
} from "@/lib/motion/dialogue-typewriter";
import { m3 } from "@/lib/theme/m3";

export function useJrpgTypewriter({
  text,
  reducedMotion,
  onBlip,
}: {
  text: string;
  reducedMotion: boolean;
  onBlip?: () => void;
}) {
  const glyphs = useMemo(() => Array.from(text), [text]);
  const onBlipRef = useRef(onBlip);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runRef = useRef(0);
  const [progress, setProgress] = useState(() => ({ text, count: reducedMotion ? glyphs.length : 0 }));

  useEffect(() => {
    onBlipRef.current = onBlip;
  }, [onBlip]);

  const stop = useCallback(() => {
    runRef.current += 1;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    stop();
    if (reducedMotion || glyphs.length === 0) {
      setProgress({ text, count: glyphs.length });
      return;
    }

    const run = runRef.current;
    let index = 0;
    setProgress({ text, count: 0 });

    const tick = () => {
      if (run !== runRef.current) return;
      index += 1;
      const character = glyphs[index - 1] ?? "";
      setProgress({ text, count: index });
      if (shouldPlayDialogueBlip(character, index)) onBlipRef.current?.();
      if (index < glyphs.length) {
        timerRef.current = setTimeout(tick, dialogueDelayAfter(character));
      } else {
        timerRef.current = null;
      }
    };

    timerRef.current = setTimeout(tick, TYPEWRITER_STEP_MS);
    return stop;
  }, [glyphs, reducedMotion, stop, text]);

  const visibleCount = progress.text === text
    ? progress.count
    : reducedMotion
      ? glyphs.length
      : 0;
  const isComplete = visibleCount >= glyphs.length;
  const reveal = useCallback(() => {
    stop();
    setProgress({ text, count: glyphs.length });
  }, [glyphs.length, stop, text]);

  return {
    displayedText: dialogueSlice(text, visibleCount),
    isComplete,
    reveal,
  };
}

export function JrpgDialogueBox({
  speaker,
  tag,
  title,
  fullText,
  displayedText,
  isComplete,
  onReveal,
  onAdvance,
  portrait,
  actions,
}: {
  speaker: string;
  tag: string;
  title?: string | null;
  fullText: string;
  displayedText: string;
  isComplete: boolean;
  onReveal: () => void;
  onAdvance: () => void;
  portrait: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <PixelSurface
      variant="bevel"
      background={m3.color.surfaceContainerHigh}
      style={styles.frame}
      contentStyle={styles.frameContent}
    >
      <View style={styles.row}>
        <PixelSurface
          variant="inset"
          background={m3.accent.stageFloor}
          style={styles.portraitFrame}
          contentStyle={styles.portraitContent}
        >
          {portrait}
        </PixelSurface>

        <View style={styles.copyColumn}>
          <Pressable
            onPress={isComplete ? onAdvance : onReveal}
            accessibilityRole="button"
            accessibilityLabel={fullText}
            style={styles.copyTarget}
          />
          <View pointerEvents="none" style={styles.copyContent}>
            <View style={styles.metaRow}>
              <Text style={styles.speaker}>{speaker}</Text>
              <Text style={styles.tag}>{tag}</Text>
            </View>
            {title ? (
              <Text style={styles.title} accessibilityLabel={title}>
                {keepAllKo(title)}
              </Text>
            ) : null}
            <View style={styles.textTarget}>
              <Text accessible={false} style={styles.line}>
                {keepAllKo(displayedText)}
                {!isComplete ? <Text style={styles.cursor}>▮</Text> : null}
              </Text>
            </View>
          </View>
          {isComplete && actions ? <View style={styles.actions}>{actions}</View> : null}
        </View>
      </View>

      {isComplete && !actions ? (
        <View pointerEvents="none" accessibilityElementsHidden style={styles.continueMark}>
          <View style={styles.continueWide} />
          <View style={styles.continueMid} />
          <View style={styles.continueTip} />
        </View>
      ) : null}
    </PixelSurface>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    maxWidth: 440,
    ...m3.elevation.level2,
  },
  frameContent: {
    paddingVertical: m3.spacing.s3,
    paddingHorizontal: m3.spacing.s5,
    minHeight: 128,
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: m3.spacing.s3,
  },
  portraitFrame: {
    width: 108,
    alignSelf: "flex-start",
  },
  portraitContent: {
    minHeight: 108,
    paddingVertical: m3.spacing.s1,
    paddingHorizontal: m3.spacing.s1,
    alignItems: "center",
    justifyContent: "center",
  },
  copyColumn: {
    flex: 1,
    minWidth: 0,
    position: "relative",
  },
  copyTarget: {
    ...StyleSheet.absoluteFill,
  },
  copyContent: {
    minWidth: 0,
  },
  metaRow: {
    minHeight: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: m3.spacing.s2,
    marginBottom: m3.spacing.s2,
  },
  speaker: {
    paddingVertical: 3,
    paddingHorizontal: m3.spacing.s2,
    backgroundColor: m3.color.primaryContainer,
    color: m3.color.onPrimaryContainer,
    fontFamily: m3.font.mono,
    fontSize: m3.type.labelSmall.size,
    lineHeight: m3.type.labelSmall.line,
  },
  tag: {
    flexShrink: 1,
    color: m3.accent.moodNeutral,
    fontFamily: m3.font.mono,
    fontSize: m3.type.labelSmall.size,
    lineHeight: m3.type.labelSmall.line,
    textAlign: "right",
  },
  title: {
    marginBottom: m3.spacing.s1,
    color: m3.accent.starFocus,
    fontFamily: m3.font.brand,
    fontSize: m3.type.titleSmall.size,
    lineHeight: m3.type.titleSmall.line,
    fontWeight: "700",
  },
  textTarget: {
    minHeight: 32,
    justifyContent: "flex-start",
  },
  line: {
    paddingBottom: 3,
    color: m3.accent.bubbleText,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodyMedium.size,
    lineHeight: m3.type.bodyMedium.line,
  },
  cursor: {
    color: m3.color.primary,
    fontFamily: m3.font.mono,
  },
  actions: {
    width: "100%",
    minWidth: 0,
    alignSelf: "stretch",
    marginTop: "auto",
    zIndex: 1,
  },
  continueMark: {
    position: "absolute",
    right: m3.spacing.s3,
    bottom: m3.spacing.s2,
    alignItems: "center",
    gap: 1,
  },
  continueWide: { width: 10, height: 2, backgroundColor: m3.color.primary },
  continueMid: { width: 6, height: 2, backgroundColor: m3.color.primary },
  continueTip: { width: 2, height: 2, backgroundColor: m3.color.primary },
});
