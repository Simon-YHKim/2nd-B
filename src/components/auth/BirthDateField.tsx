// C10: enforce the self-consent age floor at the UI layer. The authoritative gate
// is the server-side BEFORE INSERT trigger (0030_server_age_gate), with the
// users_birth_date_sane CHECK (0028) as a backstop -- the legacy
// users_birth_date_min_age CHECK was dropped in 0028. auth.ts mirrors the floor
// client-side for fast-fail UX.

import { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";

import { spacing } from "@/lib/theme/tokens";
import { ageInYears, MIN_SELF_CONSENT_AGE } from "@/lib/supabase/auth";
import { formatBirthDateInput } from "@/lib/account/dob";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";

export interface BirthDateFieldProps {
  value: string; // YYYY-MM-DD
  onChange: (next: string) => void;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function BirthDateField({ value, onChange }: BirthDateFieldProps) {
  const { t } = useTranslation("auth");
  const status = useMemo(() => {
    if (!value) return "empty";
    if (!ISO_DATE.test(value)) return "malformed";
    const age = ageInYears(value);
    if (age < 0) return "malformed";
    if (age < MIN_SELF_CONSENT_AGE) return "underage";
    return "ok";
  }, [value]);

  const showError = value.length > 0 && (status === "underage" || status === "malformed");

  return (
    <View style={styles.row}>
      <Text variant="caption" color="textMuted">{t("signUp.birthDate")}</Text>
      <Input
        value={value}
        placeholder="YYYY-MM-DD"
        onChangeText={(next) => onChange(formatBirthDateInput(next))}
        autoCapitalize="none"
        keyboardType="number-pad"
        maxLength={10}
        accessibilityLabel={t("signUp.birthDate")}
        accessibilityHint={t("signUp.birthDateHelper")}
      />
      <Text variant="subtle" color={showError ? "danger" : "textSubtle"}>
        {showError
          ? t(status === "underage" ? "errors.ageGate" : "errors.invalidBirthDate")
          : t("signUp.birthDateHelper")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.xs, marginBottom: spacing.md },
});
