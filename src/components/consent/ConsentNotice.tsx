// C10 (task B2): the privacy / consent notice shown in the sign-up and
// complete-profile flows. Controlled component — the parent owns the
// ConsentSelections state and gates its submit button on
// allRequiredAcksChecked(). For a teen sign-up (14 to 17) it surfaces the
// high-privacy banner. Copy lives in locales/{en,ko}/consent.json (notice.*)
// and tracks the version constants in src/lib/supabase/consent.ts.
//
// NOTE (legal): the wording here is placeholder pending legal review
// (LEXICON_LAST_LEGAL_REVIEW is null). Refine the notice + version constants
// before a real-user launch — do not treat this as final consent language.

import { View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { PreferenceCheckRow } from "@/components/ui/PreferenceToggle";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import {
  allRequiredAcksChecked,
  setAllRequiredAcks,
  type ConsentSelections,
} from "@/lib/auth/consent-selections";

interface ConsentNoticeProps {
  minor: boolean;
  value: ConsentSelections;
  onChange: (next: ConsentSelections) => void;
}

export function ConsentNotice({ minor, value, onChange }: ConsentNoticeProps) {
  const { t, i18n } = useTranslation("consent");
  const allChecked = allRequiredAcksChecked(value);
  // KO group labels drop tracking to 0 (Hangul reads worse when tracked); EN
  // keeps the stylized caption tracking.
  const groupLabelTracking = { letterSpacing: i18n.language === "ko" ? 0 : 1 };

  function toggle(key: keyof ConsentSelections): void {
    onChange({ ...value, [key]: !value[key] });
  }

  return (
    <View style={styles.card}>
      <Text variant="heading" style={styles.title}>
        {t("notice.title")}
      </Text>
      <Text variant="body" color="textMuted">
        {t("notice.intro")}
      </Text>

      {minor ? (
        <View style={styles.minorBanner}>
          <Text variant="subtle" color="text">
            {t("notice.minorBanner")}
          </Text>
        </View>
      ) : null}

      <View style={styles.purposes}>
        <Text variant="caption" color="brand" style={[styles.groupLabel, groupLabelTracking]}>
          {t("notice.purposesTitle")}
        </Text>
        <Text variant="subtle" color="textMuted">
          {t("notice.items")}
        </Text>
        <Text variant="subtle" color="textMuted">
          {t("notice.purposeService")}
        </Text>
        <Text variant="subtle" color="textMuted">
          {t("notice.retention")}
        </Text>
        <Text variant="subtle" color="textSubtle">
          {t("notice.rights")}
        </Text>
      </View>

      <View style={styles.group}>
        <Text variant="caption" color="brand" style={[styles.groupLabel, groupLabelTracking]}>
          {t("notice.requiredLabel")}
        </Text>
        <PreferenceCheckRow
          checked={allChecked}
          label={t("notice.agreeAll")}
          emphasize
          onToggle={() => onChange(setAllRequiredAcks(value, !allChecked))}
        />
        <View style={styles.divider} />
        <PreferenceCheckRow checked={value.service} label={t("notice.ackService")} onToggle={() => toggle("service")} />
        <PreferenceCheckRow checked={value.llmProcessing} label={t("notice.ackLlm")} onToggle={() => toggle("llmProcessing")} />
        <PreferenceCheckRow
          checked={value.overseasTransfer}
          label={t("notice.ackOverseas")}
          onToggle={() => toggle("overseasTransfer")}
        />
        <PreferenceCheckRow
          checked={value.sensitiveData}
          label={t("notice.ackSensitive")}
          onToggle={() => toggle("sensitiveData")}
        />
      </View>

      <View style={styles.group}>
        <Text variant="caption" color="textMuted" style={[styles.groupLabel, groupLabelTracking]}>
          {t("notice.optionalLabel")}
        </Text>
        <PreferenceCheckRow checked={value.marketing} label={t("notice.optMarketing")} onToggle={() => toggle("marketing")} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  title: { marginTop: 0 },
  minorBanner: {
    backgroundColor: semantic.surface,
    borderColor: semantic.brand,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: radii.sm,
    padding: spacing.sm,
  },
  purposes: {
    gap: spacing.xs,
    borderTopColor: semantic.border,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
  },
  group: { gap: spacing.xs },
  // Tracking is applied per-locale (groupLabelTracking) so KO is not over-spaced.
  groupLabel: { fontWeight: "700", marginTop: spacing.xs },
  divider: { height: 1, backgroundColor: semantic.border, opacity: 0.5 },
});
