// Post-OAuth profile completion. Users who sign in via Google land here when
// the public.users row doesn't exist yet — we need their date of birth to
// satisfy C10 (18+ gate) before letting them into the app.

import { useMemo, useState } from "react";
import { View, StyleSheet, Alert, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { BirthDateField } from "@/components/auth/BirthDateField";
import { semantic, spacing } from "@/lib/theme/tokens";
import { ageInYears, ensureUserProfile, AgeGateError, signOut } from "@/lib/supabase/auth";
import { useAuth } from "@/lib/auth/AuthContext";

export default function CompleteProfile() {
  const { t, i18n } = useTranslation("auth");
  const { userId, hasProfile } = useAuth();
  const [birthDate, setBirthDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const canSubmit = useMemo(() => {
    return userId !== null && ageInYears(birthDate) >= 18 && !submitting;
  }, [userId, birthDate, submitting]);

  // Already has a profile — bounce to journal. Possible if the user navigates
  // here manually after completing setup.
  if (userId && hasProfile) {
    router.replace("/");
    return null;
  }

  // Not signed in at all — bounce to sign-in.
  if (userId === null) {
    router.replace("/sign-in");
    return null;
  }

  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    try {
      const result = await ensureUserProfile({ birthDate, locale });
      if (result.judgeMode) Alert.alert(t("judge.welcome"));
      router.replace("/");
    } catch (e) {
      if (e instanceof AgeGateError) {
        Alert.alert(t("errors.ageGate"));
        // C10: under-18 OAuth users are signed out immediately so the
        // session doesn't linger after the prompt is rejected.
        try {
          await signOut();
        } catch {
          // best effort
        }
        router.replace("/");
        return;
      }
      const msg =
        locale === "ko"
          ? "프로필 저장에 실패했어요. 잠시 후 다시 시도해 주세요."
          : "Could not save your profile. Please try again in a moment.";
      Alert.alert(msg);
      if (typeof console !== "undefined") console.warn("[auth] completeProfile error", (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(): Promise<void> {
    try {
      await signOut();
    } catch {
      // best effort
    }
    router.replace("/");
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text variant="caption" color="brand">
            2nd-Brain
          </Text>
          <Text variant="heading" style={styles.title}>
            {t("completeProfile.title")}
          </Text>
          <Text variant="body" color="textMuted">
            {t("completeProfile.subtitle")}
          </Text>
        </View>

        <View style={styles.form}>
          <BirthDateField value={birthDate} onChange={setBirthDate} />

          {birthDate.length > 0 ? (
            <View style={styles.checklist}>
              <ChecklistItem
                ok={ageInYears(birthDate) >= 18}
                label={ageInYears(birthDate) >= 18 ? t("signUp.checkAge") : t("signUp.checkAgeBlocked")}
              />
            </View>
          ) : null}

          <View style={{ height: spacing.sm }} />

          <Button
            label={t("completeProfile.submit")}
            variant="primary"
            disabled={!canSubmit}
            loading={submitting}
            onPress={handleSubmit}
          />
          <Button label={t("completeProfile.cancel")} variant="secondary" onPress={handleCancel} disabled={submitting} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function ChecklistItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={styles.checkRow}>
      <View style={[styles.checkDot, { backgroundColor: ok ? semantic.success : semantic.textSubtle }]} />
      <Text variant="subtle" color={ok ? "success" : "textMuted"}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl },
  header: { gap: spacing.xs, marginBottom: spacing.xl },
  title: { marginTop: spacing.xs },
  form: { gap: spacing.sm },
  checklist: { gap: spacing.xs, marginTop: spacing.xs, marginBottom: spacing.xs },
  checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  checkDot: { width: 8, height: 8, borderRadius: 4 },
});
