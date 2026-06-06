// task C: account controls — the minor/adult self-service rights surface.
//   - DOB correction (re-validated server-side by the 0030 trigger).
//   - Privacy & consent controls (link to /privacy, where sharing / profiling /
//     processing are withdrawn per-key; teens stay locked to high-privacy).
//   - Account deletion (terminal): a best-effort client content wipe, then the
//     delete-account Edge Function (service role) erases public.users -> cascade
//     across every owned table + the auth.users row, then sign out. If the
//     function isn't deployed yet the content wipe + sign out still run and the
//     residual erasure is logged for the operator (C11 SLA backstop).
//
// Age-out (17 -> 18) needs no dedicated flow: useAuth().isMinor is computed live
// from birth_date, so a former minor's locks lift automatically on /privacy.

import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View, KeyboardAvoidingView, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumAppShell, PremiumLoadingState, PremiumModal, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BirthDateField } from "@/components/auth/BirthDateField";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { signOut } from "@/lib/supabase/auth";
import { fetchBirthDate, updateBirthDate } from "@/lib/supabase/account";
import { canSubmitDobCorrection } from "@/lib/account/dob";
import { deleteAllUserData, requestAccountDeletion } from "@/lib/records/delete-bulk";
import { VILLAGE_UI } from "@/lib/village-ui";

const CONFIRM_PHRASE = "DELETE";
type AccountFeedbackModal = "dobRetry" | "deleteConfirm" | "deleteFailed" | null;

export default function Account() {
  const { t, i18n } = useTranslation("consent");
  const { userId, loading, refresh } = useAuth();
  const locale: "en" | "ko" = i18n.language === "ko" ? "ko" : "en";
  // KO eyebrows drop tracking to 0 (Hangul reads worse when tracked); EN keeps
  // the light caption tracking.
  const eyebrowTracking = { letterSpacing: locale === "ko" ? 0 : 0.5 };

  const [origDob, setOrigDob] = useState<string | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [dobBusy, setDobBusy] = useState(false);
  const [dobSaved, setDobSaved] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState<AccountFeedbackModal>(null);
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
      // Re-probe auth so isMinor/hasProfile reflect the corrected birth_date
      // immediately (minor locks + crisis routing depend on it) instead of
      // staying stale until the next auth event.
      void refresh();
      if (mounted.current) {
        setOrigDob(birthDate);
        setDobSaved(true);
      }
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[account] dob save failed", (e as Error).message);
      setFeedbackModal("dobRetry");
    } finally {
      if (mounted.current) setDobBusy(false);
    }
  }, [userId, origDob, birthDate, t, locale, refresh]);

  const runDeleteAccount = useCallback(() => {
    if (!userId) return;
    void (async () => {
      setDeleting(true);
      // Once deleteAllUserData resolves, the client content (wiki pages, sources,
      // records, chat usage, ...) is irreversibly gone. Track that so a later
      // failure does not falsely claim the data is intact, and does not offer a
      // Retry that would re-run the (now destructive no-op) wipe.
      try {
        // The destructive cascade is irreversible AND not atomic: deleteAllUserData
        // deletes wiki_pages -> sources -> records -> chat_usage sequentially and
        // can throw partway (leaving some content already gone), and even a fully
        // successful client wipe is followed by the terminal service-role cascade
        // (requestAccountDeletion, which throws unless the edge function confirms
        // { deleted: true }). From the moment we invoke it we can no longer promise
        // the data is intact, so any failure below must tell the truth and must
        // NOT offer a re-wipe Retry.
        await deleteAllUserData(userId);
        await requestAccountDeletion();
        await signOut();
        router.replace("/sign-in");
      } catch (e) {
        // Do NOT sign out with a false "deleted" confirmation while the account
        // row / RLS-protected data may still remain. Erasure is terminal only on
        // success. Some content may already be gone, so never claim the data is
        // intact, and offer no Retry (it could re-run an already-destructive wipe).
        if (typeof console !== "undefined") console.warn("[account] deletion failed", (e as Error).message);
        setFeedbackModal("deleteFailed");
        if (mounted.current) setDeleting(false);
      }
    })();
  }, [userId, t, locale]);

  const onDeleteAccount = useCallback(() => {
    if (!userId) return;
    setFeedbackModal("deleteConfirm");
  }, [userId]);

  if (loading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={locale === "ko" ? "계정을 불러오는 중이에요…" : "Loading account…"} />
        </View>
      </PremiumAppShell>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const dobSubmittable = canSubmitDobCorrection(origDob, birthDate);
  const feedbackModalTitle =
    feedbackModal === "deleteConfirm"
      ? t("account.delete.confirmTitle")
      : feedbackModal === "deleteFailed"
        ? t("account.delete.failed")
        : t("account.dob.saveFailed");
  const feedbackModalBody =
    feedbackModal === "deleteConfirm"
      ? t("account.delete.confirmBody")
      : feedbackModal === "deleteFailed"
        ? (
            locale === "ko"
              ? "계정 삭제를 끝내지 못했어요. 일부 콘텐츠는 이미 삭제됐을 수 있고, 계정과 로그인 정보는 아직 남아 있을 수 있어요. support@2nd-brain.app 로 문의해 주시면 도와드릴게요."
              : "We couldn't finish deleting your account. Some content may already be removed, and your account and login may still exist. Please contact support@2nd-brain.app and we'll help."
          )
        : (
            locale === "ko"
              ? "생일을 저장하지 못했어요. 잠시 후 다시 시도해 주세요."
              : "We couldn't save your birth date. Please try again in a moment."
          );
  const modalPrimaryLabel = feedbackModal === "deleteConfirm"
    ? t("account.delete.confirmCta")
    : (locale === "ko" ? "다시 시도" : "Retry");
  const modalAccessibilityLabel = feedbackModal === "deleteConfirm"
    ? (locale === "ko" ? "계정 삭제 최종 확인" : "Account deletion confirmation")
    : (locale === "ko" ? "계정 피드백 안내" : "Account feedback notice");

  function handleFeedbackPrimary() {
    const current = feedbackModal;
    setFeedbackModal(null);
    if (current === "deleteConfirm") {
      runDeleteAccount();
      return;
    }
    if (current === "dobRetry") {
      void onSaveDob();
    }
  }

  return (
    <PremiumAppShell>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
<ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
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
          <Text variant="caption" color="brand" style={[styles.eyebrow, eyebrowTracking]}>
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
            accessibilityHint={
              locale === "ko"
                ? "생년월일을 저장하고 나이 기반 개인정보 설정에 반영합니다."
                : "Saves your birth date and updates age-based privacy settings."
            }
          />
        </View>

        {/* Privacy & consent controls */}
        <View style={[styles.section, { borderLeftColor: cosmic.signalMint }]}>
          <Text variant="caption" color="brand" style={[styles.eyebrow, eyebrowTracking]}>
            {t("account.privacy.label")}
          </Text>
          <Text variant="subtle" color="textMuted">
            {t("account.privacy.body")}
          </Text>
          <Button
            label={t("account.privacy.button")}
            variant="secondary"
            onPress={() => router.push("/privacy")}
            accessibilityHint={
              locale === "ko" ? "개인정보와 동의 설정 화면을 엽니다." : "Opens privacy and consent settings."
            }
          />
        </View>

        {/* Danger zone: delete account */}
        <View style={[styles.section, { borderLeftColor: semantic.danger }]}>
          <Text variant="caption" color="danger" style={[styles.eyebrow, eyebrowTracking]}>
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
            accessibilityLabel={locale === "ko" ? "계정 삭제 확인 문구" : "Account deletion confirmation phrase"}
            accessibilityHint={
              locale === "ko"
                ? "계정 삭제 버튼을 활성화하려면 DELETE를 입력합니다."
                : "Type DELETE to enable the account deletion button."
            }
          />
          <Button
            label={t("account.delete.button")}
            variant="danger"
            disabled={deleteConfirm !== CONFIRM_PHRASE || deleting}
            loading={deleting}
            onPress={onDeleteAccount}
            accessibilityHint={
              locale === "ko"
                ? "계정과 데이터를 삭제하기 전 최종 확인을 엽니다."
                : "Opens a final confirmation before deleting your account and data."
            }
          />
        </View>
      </ScrollView>
</KeyboardAvoidingView>
      <PremiumModal
        visible={feedbackModal !== null}
        onClose={() => setFeedbackModal(null)}
        accessibilityLabel={modalAccessibilityLabel}
      >
        <Text variant="heading">{feedbackModalTitle}</Text>
        <Text variant="body" color="textMuted" style={styles.modalBody}>
          {feedbackModalBody}
        </Text>
        <View style={styles.modalActions}>
          <Button
            label={feedbackModal === "deleteConfirm" ? t("account.delete.cancel") : (locale === "ko" ? "닫기" : "Dismiss")}
            variant="secondary"
            onPress={() => setFeedbackModal(null)}
            style={styles.modalButton}
            accessibilityHint={locale === "ko" ? "안내를 닫습니다." : "Dismisses this notice."}
          />
          {feedbackModal !== "deleteFailed" ? (
            <Button
              label={modalPrimaryLabel}
              variant={feedbackModal === "deleteConfirm" ? "danger" : "primary"}
              onPress={handleFeedbackPrimary}
              loading={dobBusy || deleting}
              style={styles.modalButton}
              accessibilityHint={
                feedbackModal === "deleteConfirm"
                  ? (
                      locale === "ko"
                        ? "계정과 데이터 삭제를 시작합니다."
                        : "Starts account and data deletion."
                    )
                  : (
                      locale === "ko"
                        ? "생년월일 저장을 다시 시도합니다."
                        : "Retries saving your birth date."
                    )
              }
            />
          ) : null}
        </View>
      </PremiumModal>
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
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
  // Tracking is applied per-locale (eyebrowTracking) so KO labels are not
  // over-spaced (caption is 14px); EN keeps the light caption tracking.
  eyebrow: { fontWeight: "700" },
  modalBody: { lineHeight: 21 },
  modalActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  modalButton: { flex: 1 },
});
