// C5: testimonials require explicit consent before insert.
// This dialog captures consent_given_at + share_with_judges_flag and
// passes them to the caller. Approval for public display is a separate flag.

import { useState } from "react";
import { Modal, View, StyleSheet, Pressable, Switch } from "react-native";
import { useTranslation } from "react-i18next";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";

export interface TestimonialConsent {
  consentGivenAt: string;
  shareWithJudgesFlag: boolean;
  approvedForPublic: boolean;
}

export interface ConsentDialogProps {
  visible: boolean;
  onSubmit: (consent: TestimonialConsent) => void;
  onDecline: () => void;
}

export function ConsentDialog({ visible, onSubmit, onDecline }: ConsentDialogProps) {
  const { t } = useTranslation("consent");
  const [shareWithJudges, setShareWithJudges] = useState(true);
  const [approvedPublic, setApprovedPublic] = useState(false);

  function handleAgree(): void {
    onSubmit({
      consentGivenAt: new Date().toISOString(),
      shareWithJudgesFlag: shareWithJudges,
      approvedForPublic: approvedPublic,
    });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDecline}>
      <Pressable style={styles.backdrop} onPress={onDecline}>
        <View style={styles.card}>
          <Text variant="heading">{t("testimonial.title")}</Text>
          <Text variant="body" color="textMuted">{t("testimonial.body")}</Text>

          <View style={styles.row}>
            <Text variant="body">{t("testimonial.shareWithJudges")}</Text>
            <Switch value={shareWithJudges} onValueChange={setShareWithJudges} />
          </View>
          <View style={styles.row}>
            <Text variant="body">{t("testimonial.approveForPublic")}</Text>
            <Switch value={approvedPublic} onValueChange={setApprovedPublic} />
          </View>

          <View style={styles.actions}>
            <Button label={t("testimonial.decline")} variant="secondary" onPress={onDecline} />
            <Button label={t("testimonial.agree")} variant="primary" onPress={handleAgree} />
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.md,
    width: "100%",
    maxWidth: 480,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  actions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
  },
});
