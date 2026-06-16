// Ratify bottom-sheet (memo §3f): renders a SelfModelProposal via the tested
// display model (formatProposalForDisplay) and returns the user's decision. Pure
// presentation - it neither calls the LLM nor writes; the host screen (/review)
// wires proposeSelfModelChange + applyRatify + persist. RN component, covered by
// check-constraints a11y + emulator QA like every screen here (no jest in node env).

import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { formatProposalForDisplay } from "@/lib/persona/proposal-display";
import type { RatifyDecision, SelfModelProposal } from "@/lib/persona/proposal";

export function RatifySheet({
  proposal,
  locale,
  visible,
  onDecision,
  onClose,
}: {
  proposal: SelfModelProposal | null;
  locale: "en" | "ko";
  visible: boolean;
  onDecision: (decision: RatifyDecision) => void;
  onClose: () => void;
}) {
  if (!proposal) return null;
  const d = formatProposalForDisplay(proposal, locale);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={d.declineLabel}
      />
      <View style={styles.sheet} accessibilityViewIsModal>
        <ScrollView contentContainerStyle={styles.body}>
          <Text variant="caption" color="textMuted">{d.targetLabel}</Text>
          <Text variant="body" style={styles.title}>{d.title}</Text>

          <View style={styles.diff}>
            <Text variant="caption" color="textMuted">{d.beforeLabel}</Text>
            <Text variant="body">{d.before}</Text>
            <Text variant="caption" color="textMuted" style={styles.afterLabel}>{d.afterLabel}</Text>
            <Text variant="body" color="brand">{d.after}</Text>
          </View>

          <Text variant="subtle" color="textMuted" style={styles.rationale}>{d.rationale}</Text>
          <Text variant="caption" color="textSubtle" style={styles.note}>{d.ratifyNote}</Text>

          <View style={styles.actions}>
            <Button label={d.declineLabel} variant="secondary" onPress={() => onDecision("decline")} />
            <Button label={d.ratifyLabel} variant="primary" onPress={() => onDecision("ratify")} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(7,10,24,0.6)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "80%",
    backgroundColor: semantic.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderTopWidth: 1,
    borderColor: semantic.border,
  },
  body: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.lg },
  title: { marginTop: 2, marginBottom: spacing.sm },
  diff: {
    backgroundColor: semantic.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: semantic.border,
    padding: spacing.sm,
  },
  afterLabel: { marginTop: spacing.sm },
  rationale: { marginTop: spacing.sm },
  note: { marginTop: 4 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, justifyContent: "flex-end" },
});
