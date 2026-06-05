// Premium save flourish for the quant assessments (MBTI / BFI / ECR-S). On a
// successful save we play a brief momo moment over a dim scrim instead of a
// bare system alert, then hand off to /persona. Rendered in a transparent
// Modal so it reliably covers the screen regardless of the host layout.
// Honours reduced motion (shorter hold) and announces the message to readers.

import { useEffect, useRef } from "react";
import { Modal, View, StyleSheet } from "react-native";

import { Text } from "@/components/ui/Text";
import { CompanionMoment } from "@/components/art/CompanionSprite";
import { prefersReducedMotion } from "@/lib/motion/signature";
import { spacing } from "@/lib/theme/tokens";

// Momo filing the freshly-saved record + the journal-saved premium cue burst.
const MOMENT = { companion: "momo", state: "store", cue: "journal_saved" } as const;

export function QuantSaveCelebration({ message, onDone }: { message: string; onDone: () => void }) {
  // Callers pass a fresh inline arrow for onDone each render, so keep the latest
  // in a ref and start the timer once on mount; parent re-renders during the
  // hold must not restart (and thus delay/cancel) the countdown.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    // CompanionMoment plays for ~1.5s; navigate just after it settles, or after
    // a short beat when motion is reduced (the moment then holds, doesn't fade).
    const t = setTimeout(() => onDoneRef.current(), prefersReducedMotion() ? 900 : 1600);
    return () => clearTimeout(t);
  }, []);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDone}>
      <View style={styles.scrim} accessibilityRole="alert" accessibilityLabel={message}>
        <CompanionMoment moment={MOMENT} />
        <Text variant="body" color="text" style={styles.message}>
          {message}
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(2, 4, 10, 0.78)",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  message: { textAlign: "center" },
});
