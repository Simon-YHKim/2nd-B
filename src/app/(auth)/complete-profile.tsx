import { Image } from "expo-image";
// Post-OAuth profile completion. Users who sign in via Google land here when
// the public.users row doesn't exist yet — we need their date of birth to
// satisfy C10 (age gate) before letting them into the app.

import { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumAppShell, PremiumToast } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { BirthDateField } from "@/components/auth/BirthDateField";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { ageInYears, ensureUserProfile, AgeGateError, signOut, MIN_SELF_CONSENT_AGE } from "@/lib/supabase/auth";
import { useAuth } from "@/lib/auth/AuthContext";
import { InlineLoader } from "@/components/ui/InlineLoader";
import { ConsentNotice } from "@/components/consent/ConsentNotice";
import {
  emptyConsentSelections,
  allRequiredAcksChecked,
  buildSignUpConsentArgs,
} from "@/lib/auth/consent-selections";
import { recordConsentBestEffort } from "@/lib/supabase/consent";
import { useKeyboard } from "@/lib/ui/useKeyboard";

const ADULT_AGE = 18;
type CompleteProfileToast = { message: string; tone: "info" | "success" | "danger" };

const authHero = require("../../../public/assets/2ndb-production-premium-v1/auth/auth_secondb_gate_hero_hq.png");

export default function CompleteProfile() {
  const { t, i18n } = useTranslation("auth");
  const { userId, hasProfile, loading } = useAuth();
  const [birthDate, setBirthDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [consent, setConsent] = useState(emptyConsentSelections());
  const [toast, setToast] = useState<CompleteProfileToast | null>(null);
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const kbHeight = useKeyboard();

  const age = ageInYears(birthDate);
  const isMinorAge = age >= MIN_SELF_CONSENT_AGE && age < ADULT_AGE;
  const canSubmit = useMemo(() => {
    return (
      userId !== null &&
      ageInYears(birthDate) >= MIN_SELF_CONSENT_AGE &&
      allRequiredAcksChecked(consent) &&
      !submitting
    );
  }, [userId, birthDate, consent, submitting]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timeout);
  }, [toast]);

  // Still resolving the session/profile — show the branded checking state. The
  // redirects below read userId === null while loading, which would otherwise
  // bounce a freshly-signed-in OAuth user back to /sign-in before auth settles.
  if (loading) {
    return <InlineLoader message={t("common.checking")} />;
  }

  // Already has a profile — bounce to journal. Possible if the user navigates
  // here manually after completing setup.
  if (userId && hasProfile) {
    return <Redirect href="/" />;
  }

  // Not signed in at all — bounce to sign-in.
  if (userId === null) {
    return <Redirect href="/sign-in" />;
  }

  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    try {
      const result = await ensureUserProfile({ birthDate, locale });
      // Record the consent the user just gave. Await before navigating so a
      // web router.replace can't cancel the in-flight write (see sign-up).
      // Still best-effort: a failure logs at error level, never blocks entry.
      // Only on a fresh profile (created): when the users row already exists,
      // ensureUserProfile returns early WITHOUT persisting this birth_date, so
      // its age_band would be derived from a never-saved DOB — and the original
      // sign-up consent already exists. Skip the write in that case.
      if (userId && result.created) {
        await recordConsentBestEffort(
          buildSignUpConsentArgs({ userId, isMinor: isMinorAge, locale, selections: consent }),
        );
      }
      if (result.judgeMode) {
        setToast({ tone: "success", message: t("judge.welcome") });
        setTimeout(() => router.replace("/"), 900);
        return;
      }
      router.replace("/");
    } catch (e) {
      if (e instanceof AgeGateError) {
        setToast({ tone: "danger", message: t("errors.ageGate") });
        await new Promise((resolve) => setTimeout(resolve, 900));
        // C10: under-14 OAuth users are signed out immediately so the
        // session doesn't linger after the prompt is rejected.
        try {
          await signOut();
        } catch {
          // best effort
        }
        router.replace("/");
        return;
      }
      setToast({ tone: "danger", message: t("errors.completeProfileSaveFailed") });
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
    <PremiumAppShell>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, Platform.OS === "android" && { paddingBottom: Math.max(styles.scroll.paddingBottom || 0, kbHeight + 24) }]}
          keyboardShouldPersistTaps="handled"
        >
        <View style={styles.header}>
          <Text variant="caption" color="brand">
            2nd-Brain
          </Text>
          <View style={styles.heroRow}>
            <View style={styles.heroCopy}>
              <Text variant="heading" style={styles.title}>
                {t("completeProfile.title")}
              </Text>
              <Text variant="body" color="textMuted">
                {t("completeProfile.subtitle")}
              </Text>
            </View>
            <Image
              source={authHero}
              style={styles.heroImg}
              resizeMode="contain"
              accessibilityRole="image"
              accessibilityLabel={t("common.entryArtwork")}
            />
          </View>
        </View>

        <View style={styles.form}>
          <BirthDateField value={birthDate} onChange={setBirthDate} />

          {birthDate.length > 0 ? (
            <View style={styles.checklist}>
              <ChecklistItem
                ok={ageInYears(birthDate) >= MIN_SELF_CONSENT_AGE}
                label={ageInYears(birthDate) >= MIN_SELF_CONSENT_AGE ? t("signUp.checkAge") : t("signUp.checkAgeBlocked")}
              />
            </View>
          ) : null}

          <View style={{ height: spacing.sm }} />

          <ConsentNotice minor={isMinorAge} value={consent} onChange={setConsent} />

          <View style={{ height: spacing.sm }} />

          <Button
            label={t("completeProfile.submit")}
            variant="primary"
            disabled={!canSubmit}
            loading={submitting}
            onPress={handleSubmit}
            accessibilityHint={t("completeProfile.submitHint")}
            full
            style={styles.submitButton}
          />
          <Button
            label={t("completeProfile.cancel")}
            variant="secondary"
            onPress={handleCancel}
            disabled={submitting}
            accessibilityHint={t("completeProfile.cancelHint")}
            full
            style={styles.submitButton}
          />
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {toast ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <PremiumToast message={toast.message} tone={toast.tone} />
        </View>
      ) : null}
    </PremiumAppShell>
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
  scroll: {
    paddingBottom: spacing.xl,
    // Web only: cap the auth column (cycle-4 live QA) — no-op on native.
    ...(Platform.OS === "web" ? { width: "100%" as const, maxWidth: 520, alignSelf: "center" as const } : {}),
  },
  header: { gap: spacing.sm, marginBottom: spacing.lg },
  heroRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  heroCopy: { flex: 1, gap: spacing.xs },
  heroImg: { width: 112, height: 112 },
  title: { marginTop: 0 },
  form: {
    gap: spacing.sm,
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.lg,
    shadowColor: cosmic.soulViolet,
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  checklist: { gap: spacing.xs, marginTop: spacing.xs, marginBottom: spacing.xs },
  submitButton: { alignSelf: "stretch", width: "100%" },
  toastWrap: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.xl, alignItems: "stretch" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  checkDot: { width: 8, height: 8, borderRadius: 4 },
});
