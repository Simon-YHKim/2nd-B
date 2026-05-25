// C10: enforce age >= 18 at the UI layer. Server (auth.ts) and DB
// (users_birth_date_min_age CHECK) are the second and third lines of defense.

import { useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";

import { semantic, spacing } from "@/lib/theme/tokens";
import { ageInYears } from "@/lib/supabase/auth";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";

export interface BirthDateFieldProps {
  value: string; // YYYY-MM-DD
  onChange: (next: string) => void;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function BirthDateField({ value, onChange }: BirthDateFieldProps) {
  const { t } = useTranslation("auth");
  const [touched, setTouched] = useState(false);

  const status = useMemo(() => {
    if (!value) return "empty";
    if (!ISO_DATE.test(value)) return "malformed";
    const age = ageInYears(value);
    if (age < 0) return "malformed";
    if (age < 18) return "underage";
    return "ok";
  }, [value]);

  const showError = touched && (status === "underage" || status === "malformed");

  return (
    <View style={styles.row}>
      <Text variant="caption" color="textMuted">{t("signUp.birthDate")}</Text>
      <Input
        value={value}
        placeholder="YYYY-MM-DD"
        onChangeText={onChange}
        onBlur={() => setTouched(true)}
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
      />
      <Text variant="subtle" color={showError ? "danger" : "textSubtle"}>
        {showError
          ? t(status === "underage" ? "errors.ageGate" : "errors.invalidEmail")
          : t("signUp.birthDateHelper")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.xs, marginBottom: spacing.md },
});

void semantic;
