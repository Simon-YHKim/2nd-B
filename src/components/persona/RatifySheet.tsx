// Ratify bottom-sheet (memo §3f): renders a SelfModelProposal via the tested
// display model (formatProposalForDisplay) and returns the user's decision. Pure
// presentation - it neither calls the LLM nor writes; the host screen (/review)
// wires proposeSelfModelChange + applyRatify + persist. RN component, covered by
// check-constraints a11y + emulator QA like every screen here (no jest in node env).

import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { PixelScrim } from "@/components/pixel/PixelDither";
import { formatProposalForDisplay } from "@/lib/persona/proposal-display";
import type { RatifyDecision, SelfModelProposal } from "@/lib/persona/proposal";

export async function runRatifyDecisionOnce<T>(
  pendingRef: { current: boolean },
  operation: () => Promise<T>,
): Promise<{ started: false } | { started: true; value: T }> {
  if (pendingRef.current) return { started: false };
  pendingRef.current = true;
  try {
    return { started: true, value: await operation() };
  } finally {
    pendingRef.current = false;
  }
}

export function RatifySheet({
  proposal,
  locale,
  visible,
  pending = false,
  pendingLabel,
  onDecision,
  onClose,
}: {
  proposal: SelfModelProposal | null;
  locale: "en" | "ko";
  visible: boolean;
  pending?: boolean;
  pendingLabel?: string;
  onDecision: (decision: RatifyDecision) => void | Promise<void>;
  onClose: () => void;
}) {
  if (!proposal) return null;
  const d = formatProposalForDisplay(proposal, locale);
  const closeIfIdle = () => {
    if (!pending) onClose();
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={closeIfIdle}>
      <Pressable
        style={styles.backdrop}
        onPress={closeIfIdle}
        disabled={pending}
        accessibilityRole="button"
        accessibilityLabel={pending ? pendingLabel : d.declineLabel}
      >
        {/* 모달 스크림은 **디더**다. 바탕을 모르는 자리라(모달은 어느 화면 위에도
            뜬다) `flattenAlpha` 를 쓸 수 없다 — 규칙 4 가 정확히 이 경우를 위해
            "평탄화 말고 디더"라고 못박고 있다. 타일은 4×4 중 12픽셀이 캐논 바닥색,
            4픽셀 투명이라 반투명이 한 픽셀도 없다. */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <PixelScrim />
        </View>
      </Pressable>
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
          {/* 저항 존중(세션 01): 제안은 거울이지 정체성이 아니다. 이 한 줄이
              "거절해도 된다"를 명시해서, 밀어내는 것도 정당한 사용이 된다. */}
          <Text variant="caption" color="textSubtle" style={styles.note}>{d.mirrorNote}</Text>

          {pending && pendingLabel ? (
            <Text variant="caption" color="textMuted" style={styles.pending}>{pendingLabel}</Text>
          ) : null}
          <View style={styles.actions}>
            <Button label={d.declineLabel} variant="secondary" disabled={pending} onPress={() => onDecision("decline")} />
            <Button label={d.ratifyLabel} variant="primary" disabled={pending} loading={pending} onPress={() => onDecision("ratify")} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
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
  pending: { marginTop: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, justifyContent: "flex-end" },
});
