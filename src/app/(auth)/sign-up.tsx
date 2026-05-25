import { useMemo, useState } from "react";
import { View, StyleSheet, Alert, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { Link, router } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BirthDateField } from "@/components/auth/BirthDateField";
import { JudgeBadge } from "@/components/auth/JudgeBadge";
import { semantic, spacing } from "@/lib/theme/tokens";
import { ageInYears, signUpWithEmail, AgeGateError } from "@/lib/supabase/auth";
import { isJudgeEmail } from "@/lib/judge/domains";

export default function SignUp() {
  const { t, i18n } = useTranslation("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const judge = useMemo(() => isJudgeEmail(email), [email]);
  const canSubmit = useMemo(() => {
    return email.includes("@") && password.length >= 8 && ageInYears(birthDate) >= 18 && !submitting;
  }, [email, password, birthDate, submitting]);

  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    try {
      const result = await signUpWithEmail({
        email: email.trim(),
        password,
        birthDate,
        locale,
      });
      if (result.judgeMode) Alert.alert(t("judge.welcome"));
      router.replace("/journal");
    } catch (e) {
      if (e instanceof AgeGateError) Alert.alert(t("errors.ageGate"));
      else {
        const msg = locale === "ko" ? "가입에 실패했어요. 잠시 후 다시 시도해 주세요." : "Sign-up failed. Please try again in a moment.";
        Alert.alert(msg);
        if (typeof console !== "undefined") console.warn("[auth] signUp error", (e as Error).message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text variant="caption" color="brand">2nd-Brain</Text>
          <Text variant="heading" style={styles.title}>{t("signUp.title")}</Text>
          <Text variant="body" color="textMuted">{t("signUp.subtitle")}</Text>
          {judge ? <View style={styles.badgeWrap}><JudgeBadge /></View> : null}
        </View>
        <View style={styles.form}>
          <View style={styles.fieldGroup}>
            <Text variant="caption" color="textMuted">{t("signUp.email")}</Text>
            <Input
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              placeholder="you@example.com"
            />
            <Text variant="caption" color="textMuted" style={styles.fieldLabelSpaced}>
              {t("signUp.password")}
            </Text>
            <Input
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
            />
            <Text variant="subtle" color="textSubtle" style={styles.helper}>
              {t("signUp.passwordHelper")}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.fieldGroup}>
            <BirthDateField value={birthDate} onChange={setBirthDate} />
          </View>
          {(email.length > 0 || password.length > 0 || birthDate.length > 0) ? (
            <View style={styles.checklist}>
              <ChecklistItem ok={email.includes("@")} label={email.includes("@") ? t("signUp.checkEmail") : t("signUp.checkEmailMissing")} />
              <ChecklistItem ok={password.length >= 8} label={password.length >= 8 ? t("signUp.checkPassword") : t("signUp.checkPasswordShort")} />
              <ChecklistItem ok={ageInYears(birthDate) >= 18} label={ageInYears(birthDate) >= 18 ? t("signUp.checkAge") : t("signUp.checkAgeBlocked")} />
            </View>
          ) : null}
          <Button
            label={t("signUp.submit")}
            variant="primary"
            disabled={!canSubmit}
            loading={submitting}
            onPress={handleSubmit}
          />
        </View>
        <View style={styles.footer}>
          <Text variant="subtle" color="textMuted">
            {t("signUp.alreadyHaveAccount")}{" "}
            <Link href="/sign-in">
              <Text variant="subtle" color="brand" style={styles.link}>
                {t("signUp.signInLink")}
              </Text>
            </Link>
          </Text>
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
  badgeWrap: { marginTop: spacing.sm },
  form: { gap: spacing.sm },
  fieldGroup: { gap: spacing.sm },
  fieldLabelSpaced: { marginTop: spacing.sm },
  divider: {
    height: 1,
    backgroundColor: semantic.border,
    opacity: 0.5,
    marginVertical: spacing.md,
  },
  helper: { marginTop: -spacing.xs },
  checklist: { gap: spacing.xs, marginTop: spacing.xs, marginBottom: spacing.xs },
  checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  checkDot: { width: 8, height: 8, borderRadius: 4 },
  footer: { marginTop: spacing.xl, alignItems: "center" },
  link: { textDecorationLine: "underline" },
});
