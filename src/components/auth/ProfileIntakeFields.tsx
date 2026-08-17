// Onboarding name + goal (0127, Simon 2026-08-16 L4).
//
// Both optional, and that is not politeness. Onboarding is where people leave,
// and neither field unlocks anything: the app worked without a name for its
// whole life (the IDEN export has been printing 나/You as a fallback), and the
// goal has its own screen with a propose->ratify flow behind it.
//
// They are asked HERE, though, rather than left to settings, because the seventh
// home star is now `profile` and these are two of its three fixed slots. Filling
// them during onboarding lights that star at L2 on first open, so a new account
// never lands on a home screen with a dead star nobody explained.
//
// The goal is stored as the 북극성 문장 (records + northstar_sentence tag), not
// as a users column. One place answers "what is this person aiming at", and it
// keeps every revision instead of overwriting.
import { StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";

import { Field } from "@/components/m3";
import { spacing } from "@/lib/theme/tokens";

/** Mirrors the users.display_name CHECK in 0127. */
export const DISPLAY_NAME_MAX = 40;
/** A one-line sentence, not an essay. The northstar screen edits it later. */
export const GOAL_MAX = 80;

export interface IntakeFieldProps {
  value: string;
  onChange: (next: string) => void;
}

export function NameField({ value, onChange }: IntakeFieldProps) {
  const { t } = useTranslation("auth");
  return (
    <Field
      label={t("profileIntake.nameLabel")}
      value={value}
      onChangeText={(v) => onChange(v.slice(0, DISPLAY_NAME_MAX))}
      placeholder={t("profileIntake.namePlaceholder")}
      supportingText={t("profileIntake.nameHint")}
      maxLength={DISPLAY_NAME_MAX}
      autoCapitalize="none"
      autoCorrect={false}
      containerStyle={styles.field}
      accessibilityLabel={t("profileIntake.nameLabel")}
    />
  );
}

export function GoalField({ value, onChange }: IntakeFieldProps) {
  const { t } = useTranslation("auth");
  return (
    <Field
      label={t("profileIntake.goalLabel")}
      value={value}
      onChangeText={(v) => onChange(v.slice(0, GOAL_MAX))}
      placeholder={t("profileIntake.goalPlaceholder")}
      supportingText={t("profileIntake.goalHint")}
      maxLength={GOAL_MAX}
      containerStyle={styles.field}
      accessibilityLabel={t("profileIntake.goalLabel")}
    />
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: spacing.sm },
});
