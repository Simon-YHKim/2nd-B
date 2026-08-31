// Big Five (BFI-44) personality questionnaire — John, Donahue, & Kentle
// (1991). 44 items, 5-point Likert. Public domain. Replaces the older TIPI
// 10-item screener (Sprint 5) for better per-trait precision. Result is
// saved as a record so it surfaces in /persona and feeds Inference Engine.

import { useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, KeyboardAvoidingView, Platform, BackHandler } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumAppShell, PremiumLoadingState, PremiumToast, PremiumModal } from "@/components/premium";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { androidElevation, androidElevationStyle } from "@/lib/theme/gameboy-tokens";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceBigFiveScreen } from "@/screens/deepspace/dds-big-five-screen";
import { useAuth } from "@/lib/auth/AuthContext";
import { createRecord } from "@/lib/records/create";
import {
  BFI_ITEMS,
  scoreBfi,
  type BfiResponses,
} from "@/lib/persona/bfi";
import {
  BFI_SCALE,
  BfiOwnerSubmitLock,
  OneShotGate,
  bfiSurveyCopy,
  completeBfiForOwner,
  saveBfiForOwner,
} from "@/lib/persona/big-five-screen";
import { QuantIntroModal } from "@/components/quant/QuantIntroModal";
import { LikertChoiceGroup } from "@/components/quant/LikertChoiceGroup";
import { QuantPager } from "@/components/quant/QuantPager";
import { QuantSaveCelebration } from "@/components/quant/QuantSaveCelebration";
import { consumeFirstStarChatNudge } from "@/lib/onboarding/state";

type Toast = { message: string; tone: "danger" | "info" | "success" };

// Rollback renderer. It keeps the established premium-shell output while the
// PIXEL-CLAY route lives in an isolated direct renderer. Both skins share the
// exact BFI scale, scoring/payload authority and owner-safe write controller.
function BigFiveSurvey({ onComplete, onCancel }: { onComplete: () => void; onCancel: () => void }) {
  const { userId, loading } = useAuth();
  const { t } = useTranslation("big-five");
  const activeOwnerIdRef = useRef<string | null>(loading ? null : userId);
  activeOwnerIdRef.current = loading ? null : userId;

  if (loading) {
    return (
      <View style={styles.center}>
        <PremiumLoadingState message={t("loading")} />
      </View>
    );
  }
  if (!userId) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <BigFiveSurveyOwner
      key={userId}
      ownerId={userId}
      activeOwnerIdRef={activeOwnerIdRef}
      onComplete={onComplete}
      onCancel={onCancel}
    />
  );
}

function BigFiveSurveyOwner({
  ownerId,
  activeOwnerIdRef,
  onComplete,
  onCancel,
}: {
  ownerId: string;
  activeOwnerIdRef: { current: string | null };
  onComplete: () => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation("big-five");
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const copy = bfiSurveyCopy(locale);

  const [responses, setResponses] = useState<BfiResponses>({});
  const [submitting, setSubmitting] = useState(false);
  const [started, setStarted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const submitLockRef = useRef(new BfiOwnerSubmitLock());
  const completionGateRef = useRef(new OneShotGate());
  const mountedRef = useRef(true);

  const result = useMemo(() => scoreBfi(responses), [responses]);

  useEffect(() => {
    mountedRef.current = true;
    completionGateRef.current = new OneShotGate();
    return () => {
      mountedRef.current = false;
      submitLockRef.current.invalidate();
      completionGateRef.current.invalidate();
    };
  }, []);

  // Android hardware back handler: intercept navigation back requests while the
  // survey is in progress to prevent accidental loss of responses.
  useEffect(() => {
    if (!started || Object.keys(responses).length === 0 || saved) return;

    const onBackPress = () => {
      if (submitting) return true;
      setExitConfirmOpen(true);
      return true; // Consume the event, preventing immediate navigation back
    };

    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => subscription.remove();
  }, [started, responses, saved, submitting]);

  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(h);
  }, [toast]);

  function setResponse(itemId: number, value: number) {
    if (submitting) return;
    setResponses((prev) => ({ ...prev, [itemId]: value }));
  }

  async function handleSubmit() {
    const outcome = await saveBfiForOwner({
      ownerId,
      locale,
      responses,
      lock: submitLockRef.current,
      getActiveOwnerId: () => (mountedRef.current ? activeOwnerIdRef.current : null),
      onAcquired: () => {
        setExitConfirmOpen(false);
        setSubmitting(true);
        setToast(null);
      },
      write: createRecord,
    });

    if (!mountedRef.current || activeOwnerIdRef.current !== ownerId) return;
    if (outcome === "saved") {
      setExitConfirmOpen(false);
      setSubmitting(false);
      setSaved(true);
    } else if (outcome === "failed") {
      setSubmitting(false);
      if (typeof console !== "undefined") console.warn("[big-five] save failed");
      setToast({
        tone: "danger",
        message: copy.failure,
      });
    }
  }

  function handleSavedDone() {
    completeBfiForOwner({
      ownerId,
      getActiveOwnerId: () => (mountedRef.current ? activeOwnerIdRef.current : null),
      gate: completionGateRef.current,
      consumeNudge: consumeFirstStarChatNudge,
      onNudge: () => {
        router.replace({ pathname: "/secondb", params: { fromNode: t("title") } });
      },
      onComplete,
    });
  }

  return (
    <>
      {!started ? (
        <QuantIntroModal
          toolKey="bfi"
          title={t("title")}
          itemCount={BFI_ITEMS.length}
          perPage={5}
          estimatedMinutes={8}
          description={copy.intro}
          citation={copy.citation}
          locale={locale}
          onStart={() => setStarted(true)}
          onCancel={onCancel}
        />
      ) : null}

      {started ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.header}>
            <Text variant="caption" color="brand">
              {t("counter")}
            </Text>
            <Text variant="body" color="textMuted">
              {copy.instruction}
            </Text>
          </View>

          <QuantPager
            totalItems={BFI_ITEMS.length}
            perPage={5}
            answered={result.answered}
            complete={result.complete}
            onSubmit={handleSubmit}
            submitDisabled={!result.complete || submitting}
            submitLoading={submitting}
            locale={locale}
            renderItem={(idx) => {
              const item = BFI_ITEMS[idx];
              const value = responses[item.id];
              return (
                <View style={styles.itemCard}>
                  <Text variant="body" style={{ marginBottom: 2 }}>
                    {item.id}. {locale === "ko" ? item.ko : item.en}
                  </Text>
                  <Text variant="subtle" color="textSubtle" style={{ marginBottom: spacing.xs }}>
                    {locale === "ko" ? item.subtitleKo : item.subtitleEn}
                  </Text>
                  <LikertChoiceGroup
                    choices={BFI_SCALE.map((s) => ({ value: s.value, label: s[locale] }))}
                    locale={locale}
                    onSelect={(next) => setResponse(item.id, next)}
                    question={`${item.id}. ${locale === "ko" ? item.ko : item.en}`}
                    value={value}
                  />
                  <View style={styles.scaleLegend}>
                    <Text variant="subtle" color="textMuted">
                      {locale === "ko" ? BFI_SCALE[0].ko : BFI_SCALE[0].en}
                    </Text>
                    <Text variant="subtle" color="textMuted">
                      {locale === "ko" ? BFI_SCALE[4].ko : BFI_SCALE[4].en}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        </KeyboardAvoidingView>
      ) : null}

      {saved ? (
        <QuantSaveCelebration
          message={t("saved")}
          onDone={handleSavedDone}
        />
      ) : null}

      {toast ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <PremiumToast message={toast.message} tone={toast.tone} />
        </View>
      ) : null}

      <PremiumModal
        visible={exitConfirmOpen}
        onClose={() => setExitConfirmOpen(false)}
        accessibilityLabel={t("exit.notice")}
      >
        <Text variant="heading">
          {t("exit.title")}
        </Text>
        <Text variant="body" color="textMuted" style={{ marginVertical: spacing.sm, lineHeight: 21 }}>
          {copy.exit}
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
          <Button
            label={t("exit.cancel")}
            variant="secondary"
            onPress={() => setExitConfirmOpen(false)}
            style={{ flex: 1 }}
            accessibilityHint={t("exit.cancelHint")}
          />
          <Button
            label={t("exit.confirm")}
            variant="primary"
            onPress={() => {
              setExitConfirmOpen(false);
              onCancel();
            }}
            style={{ flex: 1 }}
            accessibilityHint={t("exit.confirmHint")}
          />
        </View>
      </PremiumModal>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
  header: {
    gap: spacing.xs,
    marginBottom: spacing.md,
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderStartColor: cosmic.signalMint,
    borderWidth: 1,
    borderStartWidth: 3,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  itemCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    shadowColor: cosmic.signalMint,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    ...androidElevationStyle(androidElevation.card),
  },
  scaleLegend: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  toastWrap: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.xl, alignItems: "stretch" },
});

// Legacy rollback skin: the survey directly, in the premium shell.
function BigFiveLegacy() {
  return (
    <PremiumAppShell>
      <BigFiveSurvey onComplete={() => router.replace("/persona")} onCancel={() => router.back()} />
    </PremiumAppShell>
  );
}

export default function BigFive() {
  if (isDeepSpaceUI()) return <DeepSpaceBigFiveScreen />;
  return <BigFiveLegacy />;
}
