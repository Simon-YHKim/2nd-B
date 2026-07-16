// C10: the self-consent age floor. The authoritative gate is the server-side
// BEFORE INSERT trigger (0030_server_age_gate), with the users_birth_date_sane
// CHECK (0028) as a backstop; auth.ts mirrors the floor client-side for
// fast-fail UX. Entry is a calendar picker (never free text), so the value is
// always a real ISO date or "" — the age status below still drives the gate copy
// and the caller's submit guard, unchanged.

import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";

import { spacing } from "@/lib/theme/tokens";
import { ageInYears, MIN_SELF_CONSENT_AGE } from "@/lib/supabase/auth";
import { DateField } from "@/components/m3";
import { todayISO } from "@/components/m3/date-picker/calendar-math";

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
  const today = todayISO();
  // Open the year grid near a plausible birth year so the user is not decades of
  // taps away from theirs; picking is still unconstrained down to 1900.
  const defaultCursor = `${Number(today.slice(0, 4)) - 20}-01-01`;

  return (
    <DateField
      label={t("signUp.birthDate")}
      value={value}
      onChange={onChange}
      minDate="1900-01-01"
      maxDate={today}
      initialView="year"
      initialCursorDate={defaultCursor}
      error={showError}
      supportingText={
        showError
          ? t(status === "underage" ? "errors.ageGate" : "errors.invalidBirthDate")
          : t("signUp.birthDateHelper")
      }
      accessibilityLabel={t("signUp.birthDate")}
      accessibilityHint={t("signUp.birthDateHelper")}
      containerStyle={styles.row}
    />
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: spacing.md },
});
