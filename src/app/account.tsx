// task C: account controls — the minor/adult self-service rights surface.
//   - DOB correction (re-validated server-side by the 0030 trigger).
//   - Privacy & consent controls (link to /privacy, where sharing / profiling /
//     processing are withdrawn per-key; teens stay locked to high-privacy).
//   - Account deletion (erase all data + sign out; full account removal is
//     processed via support within the C11 SLA — auth-user removal needs a
//     service_role path that is a separate follow-up).
//
// Age-out (17 -> 18) needs no dedicated flow: useAuth().isMinor is computed live
// from birth_date, so a former minor's locks lift automatically on /privacy.

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumAppShell, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BirthDateField } from "@/components/auth/BirthDateField";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { signOut } from "@/lib/supabase/auth";
import { fetchBirthDate, updateBirthDate } from "@/lib/supabase/account";
import { canSubmitDobCorrection } from "@/lib/account/dob";
import { deleteAllUserData } from "@/lib/records/delete-bulk";
import { VILLAGE_UI } from "@/lib/village-ui";

const CONFIRM_PHRASE = "DELETE";

export default function Account() {
  const { t, i18n } = useTranslation("consent");
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [origDob, setOrigDob] = useState<string | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [dobBusy, setDobBusy] = useState(false);
  const [dobSaved, setDobSaved] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const dob = await fetchBirthDate(userId);
      if (!cancelled && mounted.current && dob) {
        setOrigDob(dob);
        setBirthDate(dob);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const onSaveDob = useCallback(async () => {
    if (!userId || !canSubmitDobCorrection(origDob, birthDate)) return;
    setDobBusy(true);
    setDobSaved(false);
    try {
      await updateBirthDate(userId, birthDate);
      if (mounted.current) {
        setOrigDob(birthDate);
        setDobSaved(true);
      }
    } catch (e) {
      Alert.alert(t("account.dob.saveFailed"), (e as Error).message);
    } finally {
      if (mounted.current) setDobBusy(false);
    }
  }, [userId, origDob, birthDate, t]);

  const onDeleteAccount = useCallback(() => {
    if (!userId) return;
    Alert.alert(t("account.delete.confirmTitle"), t("account.delete.confirmBody"), [
      { text: t("account.delete.cancel"), style: "cancel" },
      {
        text: t("account.delete.confirmCta"),
        style: "destructive",
        onPress: () => {
          void (async () => {
            setDeleting(true);
            try {
              await deleteAllUserData(userId);
              await signOut();
              router.replace("/sign-in");
            } catch (e) {
              Alert.alert(t("account.delete.failed"), (e as Error).message);
              if (mounted.current) setDeleting(false);
            }
          })();
        },
      },
    ]);
  }, [userId, t]);

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  const dobSubmittable = canSubmitDobCorrection(origDob, birthDate);

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SceneHero
          eyebrow={t("account.eyebrow")}
          title={t("account.title")}
          subtitle={t("account.subtitle")}
          island={VILLAGE_UI.relation.island}
          worker={VILLAGE_UI.relation.worker}
          accent={VILLAGE_UI.relation.accent}
          speech={t("account.speech")}
        />

        {/* DOB correction */}
        <View style={[styles.section, { borderLeftColor: semantic.brand }]}>
          <Text variant="caption" color="brand" style={styles.eyebrow}>
            {t("account.dob.label")}
          </Text>
          <Text variant="subtle" color="textMuted">
            {t("account.dob.hint")}
          </Text>
          <BirthDateField value={birthDate} onChange={(v) => { setBirthDate(v); setDobSaved(false); }} />
          {dobSaved ? (
            <Text variant="subtle" color="success">
              {t("account.dob.saved")}
            </Text>
          ) : null}
          <Button
            label={t("account.dob.save")}
            variant="primary"
            disabled={!dobSubmittable || dobBusy}
            loading={dobBusy}
            onPress={() => { void onSaveDob(); }}
          />
        </View>

        {/* Privacy & consent controls */}
        <View style={[styles.section, { borderLeftColor: cosmic.signalMint }]}>
          <Text variant="caption" color="brand" style={styles.eyebrow}>
            {t("account.privacy.label")}
          </Text>
          <Text variant="subtle" color="textMuted">
            {t("account.privacy.body")}
          </Text>
          <Button
            label={t("account.privacy.button")}
            variant="secondary"
            onPress={() => router.push("/privacy")}
          />
        </View>

        {/* Danger zone: delete account */}
        <View style={[styles.section, { borderLeftColor: semantic.danger }]}>
          <Text variant="caption" color="danger" style={styles.eyebrow}>
            {t("account.delete.label")}
          </Text>
          <Text variant="subtle" color="textMuted">
            {t("account.delete.body")}
          </Text>
          <Text variant="subtle" color="textSubtle">
            {t("account.delete.supportNote")}
          </Text>
          <Text variant="subtle" color="textMuted">
            {t("account.delete.confirmHint", { phrase: CONFIRM_PHRASE })}
          </Text>
          <Input
            value={deleteConfirm}
            onChangeText={setDeleteConfirm}
            placeholder={CONFIRM_PHRASE}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Button
            label={t("account.delete.button")}
            variant="primary"
            disabled={deleteConfirm !== CONFIRM_PHRASE || deleting}
            loading={deleting}
            onPress={onDeleteAccount}
          />
        </View>
      </ScrollView>
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl, gap: spacing.lg },
  section: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
    shadowColor: cosmic.soulViolet,
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  eyebrow: { letterSpacing: 1, fontWeight: "700" },
});
