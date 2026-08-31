import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BackHandler, Modal, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { m3TextStyle } from "@/components/m3";
import { PixelDither, PixelGateShell, PixelPressable, PixelScrim, PixelSurface } from "@/components/pixel";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth/AuthContext";
import { prefersReducedMotion } from "@/lib/motion/signature";
import { consumeFirstStarChatNudge } from "@/lib/onboarding/state";
import {
  BFI_PAGE_COUNT,
  BFI_SCALE,
  BfiOwnerRequestGuard,
  BfiOwnerSubmitLock,
  OneShotGate,
  bfiPageIndices,
  bfiReadOwner,
  bfiSurveyCopy,
  completeBfiForOwner,
  loadBfiLensWithTimeout,
  refreshBfiProfileForOwner,
  saveBfiForOwner,
  visibleBfiLensSnapshot,
  type BfiLensSnapshot,
  type BfiLensTraits,
  type BfiLocale,
} from "@/lib/persona/big-five-screen";
import { BFI_ITEMS, scoreBfi, type BfiResponses } from "@/lib/persona/bfi";
import { loadLatestBfi } from "@/lib/persona/build";
import { createRecord } from "@/lib/records/create";
import { getSupabaseClient } from "@/lib/supabase/client";
import { m3 } from "@/lib/theme/m3";

const BFI_READ_TIMEOUT_MS = 8_000;
const SAVE_CELEBRATION_MS = 800;

type PixelActionTone = "primary" | "secondary" | "danger";

function PixelAction({
  label,
  icon,
  onPress,
  disabled = false,
  busy = false,
  tone = "secondary",
  accessibilityHint,
}: {
  label: string;
  icon: "arrow_back" | "arrow_forward" | "check" | "close" | "refresh" | "replay" | "star";
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: PixelActionTone;
  accessibilityHint?: string;
}) {
  const background = disabled
    ? m3.color.surfaceVariant
    : tone === "primary"
      ? m3.color.primary
      : tone === "danger"
        ? m3.color.errorContainer
        : m3.color.surfaceContainerHigh;
  const color = disabled
    ? m3.color.onSurfaceVariant
    : tone === "primary"
      ? m3.color.onPrimary
      : tone === "danger"
        ? m3.color.onErrorContainer
        : m3.color.onSurface;

  return (
    <PixelPressable
      fullWidth
      onPress={onPress}
      disabled={disabled}
      background={background}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, busy }}
      rootStyle={styles.actionRoot}
      contentStyle={styles.actionContent}
    >
      <PixelGlyph name={icon} color={color} size={24} />
      <Text style={[m3TextStyle("labelLarge"), { color }]}>{label}</Text>
    </PixelPressable>
  );
}

function ScreenTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <PixelSurface variant="frame" contentStyle={styles.titleSurface}>
      <View style={styles.titleRow}>
        <PixelGlyph name="star" color={m3.color.primary} size={24} />
        <Text style={[m3TextStyle("titleLarge"), styles.titleText]}>{title}</Text>
      </View>
      <Text style={[m3TextStyle("bodyMedium"), styles.mutedText]}>{subtitle}</Text>
    </PixelSurface>
  );
}

function CenterState({
  icon,
  title,
  body,
  action,
}: {
  icon: "refresh" | "warning" | "star";
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <PixelSurface variant="bevel" contentStyle={styles.centerState}>
      <PixelGlyph
        name={icon}
        color={icon === "warning" ? m3.color.error : m3.color.primary}
        size={48}
      />
      <Text style={[m3TextStyle("titleMedium"), styles.centerText]}>{title}</Text>
      <Text style={[m3TextStyle("bodyMedium"), styles.centerBody]}>{body}</Text>
      {action ? <View style={styles.stateAction}>{action}</View> : null}
    </PixelSurface>
  );
}

function TraitCells({ label, value }: { label: string; value: number }) {
  const filled = Math.round(Math.max(0, Math.min(100, value)) / 10);
  return (
    <View
      style={styles.traitRow}
      accessibilityRole="progressbar"
      accessibilityLabel={`${label} ${value}`}
      accessibilityValue={{ min: 0, max: 100, now: value }}
    >
      <View style={styles.traitHead}>
        <Text style={[m3TextStyle("bodyMedium"), styles.traitLabel]}>{label}</Text>
        <Text style={[m3TextStyle("labelLarge"), styles.traitValue]}>{value}</Text>
      </View>
      <View style={styles.cells} pointerEvents="none">
        {Array.from({ length: 10 }, (_, index) => (
          <View
            key={index}
            style={[
              styles.cell,
              { backgroundColor: index < filled ? m3.color.primary : m3.color.surfaceVariant },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function ReadyLens({
  traits,
  onRetake,
}: {
  traits: BfiLensTraits;
  onRetake: () => void;
}) {
  const { t } = useTranslation(["home", "common"]);
  const rows: { key: keyof BfiLensTraits; label: string }[] = [
    { key: "openness", label: t("home:ds.lens.traitOpenness") },
    { key: "conscientiousness", label: t("home:ds.lens.traitConscientiousness") },
    { key: "extraversion", label: t("home:ds.lens.traitExtraversion") },
    { key: "agreeableness", label: t("home:ds.lens.traitAgreeableness") },
    { key: "neuroticism", label: t("home:ds.lens.traitNeuroticism") },
  ];

  return (
    <>
      <PixelSurface variant="inset" contentStyle={styles.traitsSurface}>
        {rows.map((row) => (
          <TraitCells key={row.key} label={row.label} value={traits[row.key]} />
        ))}
      </PixelSurface>
      <View style={styles.actionsStack}>
        <PixelAction
          label={t("home:ds.lens.retake")}
          icon="replay"
          onPress={onRetake}
          tone="primary"
        />
        <PixelAction
          label={t("home:ds.lens.extraFrameworks")}
          icon="arrow_forward"
          onPress={() => router.push("/attachment")}
        />
        <PixelAction
          label={t("home:ds.lens.addData")}
          icon="star"
          onPress={() => router.push("/capture")}
        />
      </View>
    </>
  );
}

function LensContent({
  snapshot,
  onStart,
  onRetry,
}: {
  snapshot: BfiLensSnapshot;
  onStart: () => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation(["home", "big-five"]);

  if (snapshot.status === "ready") {
    return <ReadyLens traits={snapshot.traits} onRetake={onStart} />;
  }
  if (snapshot.status === "empty") {
    return (
      <CenterState
        icon="star"
        title={t("home:ds.lens.emptyTitle")}
        body={t("home:ds.lens.emptyBody")}
        action={
          <PixelAction
            label={t("home:ds.lens.emptyCta")}
            icon="arrow_forward"
            onPress={onStart}
            tone="primary"
          />
        }
      />
    );
  }
  if (snapshot.status === "error" || snapshot.status === "timeout") {
    return (
      <CenterState
        icon="warning"
        title={t("home:ds.lens.errorTitle")}
        body={t("home:ds.lens.errorBody")}
        action={
          <PixelAction
            label={t("home:ds.lens.errorCta")}
            icon="refresh"
            onPress={onRetry}
            tone="primary"
          />
        }
      />
    );
  }
  return (
    <CenterState
      icon="refresh"
      title={t("big-five:loading")}
      body={t("home:ds.lens.subtitle")}
    />
  );
}

function LensShell({
  snapshot,
  onStart,
  onRetry,
}: {
  snapshot: BfiLensSnapshot;
  onStart: () => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation("home");
  return (
    <DeepSpaceScreen
      active="lens"
      variant="windowed"
      header="none"
      title={t("ds.lens.headline")}
      onBack={() => router.back()}
    >
      <ScrollView contentContainerStyle={styles.screenScroll} keyboardShouldPersistTaps="handled">
        <ScreenTitle title={t("ds.lens.headline")} subtitle={t("ds.lens.subtitle")} />
        <LensContent snapshot={snapshot} onStart={onStart} onRetry={onRetry} />
      </ScrollView>
    </DeepSpaceScreen>
  );
}

function GateLoading() {
  const { t } = useTranslation(["big-five", "home"]);
  return (
    <PixelGateShell contentContainerStyle={styles.gateContent}>
      <CenterState
        icon="refresh"
        title={t("big-five:loading")}
        body={t("home:ds.lens.subtitle")}
      />
    </PixelGateShell>
  );
}

function SignedOutGate() {
  const { t } = useTranslation(["auth", "deepspace"]);
  return (
    <PixelGateShell contentContainerStyle={styles.gateContent}>
      <CenterState
        icon="star"
        title={t("auth:signIn.title")}
        body={t("auth:signIn.subtitle")}
        action={
          <PixelAction
            label={t("deepspace:auth.signIn")}
            icon="arrow_forward"
            onPress={() => router.replace("/sign-in")}
            tone="primary"
          />
        }
      />
    </PixelGateShell>
  );
}

function ProfileGate({
  failed,
  retrying,
  onRetry,
}: {
  failed: boolean;
  retrying: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation(["home", "auth"]);
  return (
    <DeepSpaceScreen
      active="lens"
      variant="windowed"
      header="none"
      title={t("home:ds.lens.headline")}
      onBack={() => router.back()}
    >
      <View style={styles.profileGate}>
        {failed ? (
          <CenterState
            icon="warning"
            title={t("home:ds.lens.errorTitle")}
            body={t("home:ds.lens.errorBody")}
            action={
              <PixelAction
                label={t("home:ds.lens.errorCta")}
                icon="refresh"
                onPress={onRetry}
                disabled={retrying}
                tone="primary"
              />
            }
          />
        ) : (
          <CenterState
            icon="star"
            title={t("auth:completeProfile.title")}
            body={t("auth:completeProfile.subtitle")}
            action={
              <PixelAction
                label={t("auth:completeProfile.submit")}
                icon="arrow_forward"
                onPress={() => router.push("/complete-profile")}
                tone="primary"
              />
            }
          />
        )}
      </View>
    </DeepSpaceScreen>
  );
}

function SurveyIntro({
  locale,
  onStart,
  onCancel,
}: {
  locale: BfiLocale;
  onStart: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation(["big-five", "common"]);
  const copy = bfiSurveyCopy(locale);
  return (
    <PixelSurface variant="bevel" contentStyle={styles.introSurface}>
      <PixelGlyph name="star" color={m3.color.primary} size={48} />
      <Text style={[m3TextStyle("labelLarge"), styles.brandText]}>{t("common:quantBeforeStart")}</Text>
      <Text style={[m3TextStyle("titleLarge"), styles.centerText]}>{t("big-five:title")}</Text>
      <View style={styles.introStats}>
        <View style={styles.introStat}>
          <Text style={[m3TextStyle("labelMedium"), styles.mutedText]}>{t("common:quantItems")}</Text>
          <Text style={m3TextStyle("titleMedium")}>{BFI_ITEMS.length}</Text>
        </View>
        <View style={styles.introStat}>
          <Text style={[m3TextStyle("labelMedium"), styles.mutedText]}>{t("common:quantPages")}</Text>
          <Text style={m3TextStyle("titleMedium")}>{BFI_PAGE_COUNT}</Text>
        </View>
      </View>
      <Text style={[m3TextStyle("bodyMedium"), styles.centerBody]}>{copy.intro}</Text>
      <Text style={[m3TextStyle("bodySmall"), styles.centerBody]}>{copy.citation}</Text>
      <View style={styles.actionsStack}>
        <PixelAction
          label={t("common:quantStart")}
          icon="arrow_forward"
          onPress={onStart}
          tone="primary"
        />
        <PixelAction
          label={t("common:quantNotNow")}
          icon="close"
          onPress={onCancel}
        />
      </View>
    </PixelSurface>
  );
}

function ProgressCells({ answered }: { answered: number }) {
  const { t } = useTranslation("deepspace");
  const percent = Math.round((answered / BFI_ITEMS.length) * 100);
  const filled = Math.round(percent / 10);
  const label = t("quant.progressLabel", { percent });
  return (
    <View
      style={styles.progressBlock}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent, text: label }}
    >
      <View style={styles.cells} pointerEvents="none">
        {Array.from({ length: 10 }, (_, index) => (
          <View
            key={index}
            style={[
              styles.progressCell,
              { backgroundColor: index < filled ? m3.color.primary : m3.color.surfaceVariant },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function ScaleChoices({
  itemId,
  question,
  locale,
  value,
  disabled,
  onSelect,
}: {
  itemId: number;
  question: string;
  locale: BfiLocale;
  value?: number;
  disabled: boolean;
  onSelect: (itemId: number, value: number) => void;
}) {
  const { t } = useTranslation("common");
  return (
    <View
      style={styles.choices}
      accessibilityRole="radiogroup"
      accessibilityLabel={question}
    >
      {BFI_SCALE.map((choice) => {
        const selected = value === choice.value;
        const color = selected ? m3.color.onPrimary : m3.color.onSurface;
        return (
          <PixelPressable
            key={choice.value}
            onPress={() => onSelect(itemId, choice.value)}
            disabled={disabled}
            background={selected ? m3.color.primary : m3.color.surfaceContainerHigh}
            accessibilityRole="radio"
            accessibilityLabel={`${question}, ${choice.value}, ${choice[locale]}`}
            accessibilityHint={selected ? t("likertSelectedHint") : t("likertSelectHint")}
            accessibilityState={{ checked: selected, selected }}
            rootStyle={styles.choiceRoot}
            contentStyle={styles.choiceContent}
          >
            <PixelGlyph name={selected ? "check" : "radio_unchecked"} color={color} size={24} />
            <Text style={[m3TextStyle("labelLarge"), { color }]}>{choice.value}</Text>
          </PixelPressable>
        );
      })}
    </View>
  );
}

function QuestionCard({
  index,
  locale,
  value,
  disabled,
  onSelect,
}: {
  index: number;
  locale: BfiLocale;
  value?: number;
  disabled: boolean;
  onSelect: (itemId: number, value: number) => void;
}) {
  const item = BFI_ITEMS[index];
  const question = `${item.id}. ${locale === "ko" ? item.ko : item.en}`;
  return (
    <PixelSurface variant="frame" contentStyle={styles.questionSurface}>
      <Text style={[m3TextStyle("bodyLarge"), styles.questionText]}>{question}</Text>
      <Text style={[m3TextStyle("bodySmall"), styles.mutedText]}>
        {locale === "ko" ? item.subtitleKo : item.subtitleEn}
      </Text>
      <ScaleChoices
        itemId={item.id}
        question={question}
        locale={locale}
        value={value}
        disabled={disabled}
        onSelect={onSelect}
      />
      <View style={styles.scaleLegend}>
        <Text style={[m3TextStyle("bodySmall"), styles.mutedText]}>{BFI_SCALE[0][locale]}</Text>
        <Text style={[m3TextStyle("bodySmall"), styles.mutedText]}>{BFI_SCALE[4][locale]}</Text>
      </View>
    </PixelSurface>
  );
}

function ExitConfirm({
  visible,
  locale,
  onCancel,
  onExit,
}: {
  visible: boolean;
  locale: BfiLocale;
  onCancel: () => void;
  onExit: () => void;
}) {
  const { t } = useTranslation("big-five");
  const copy = bfiSurveyCopy(locale);
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
      <View style={styles.modalRoot}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <PixelScrim />
        </View>
        <View
          style={styles.modalCard}
          accessibilityViewIsModal
          accessibilityLabel={t("exit.notice")}
        >
          <PixelSurface variant="bevel" contentStyle={styles.exitSurface}>
            <PixelGlyph name="warning" color={m3.color.error} size={48} />
            <Text style={[m3TextStyle("titleMedium"), styles.centerText]}>{t("exit.title")}</Text>
            <Text style={[m3TextStyle("bodyMedium"), styles.centerBody]}>{copy.exit}</Text>
            <View style={styles.actionsStack}>
              <PixelAction
                label={t("exit.cancel")}
                icon="arrow_back"
                onPress={onCancel}
                accessibilityHint={t("exit.cancelHint")}
              />
              <PixelAction
                label={t("exit.confirm")}
                icon="close"
                onPress={onExit}
                tone="danger"
                accessibilityHint={t("exit.confirmHint")}
              />
            </View>
          </PixelSurface>
        </View>
      </View>
    </Modal>
  );
}

function SavedState({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation(["big-five", "auth"]);
  const [settled, setSettled] = useState(() => prefersReducedMotion());

  useEffect(() => {
    if (settled) return;
    const timer = setTimeout(() => setSettled(true), SAVE_CELEBRATION_MS);
    return () => clearTimeout(timer);
  }, [settled]);

  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite">
      <PixelSurface variant="bevel" contentStyle={styles.centerState}>
        <PixelDither density={50} style={styles.savedDither} />
        <PixelGlyph name={settled ? "check" : "star"} color={m3.color.primary} size={48} />
        <Text style={[m3TextStyle("titleMedium"), styles.centerText]}>{t("big-five:saved")}</Text>
        <PixelAction
          label={t("auth:completeProfile.submit")}
          icon="arrow_forward"
          onPress={onDone}
          tone="primary"
        />
      </PixelSurface>
    </View>
  );
}

function PixelBigFiveSurvey({
  ownerId,
  activeOwnerIdRef,
  onComplete,
  onCancel,
}: {
  ownerId: string;
  activeOwnerIdRef: { current: string | null };
  onComplete: (ownerId: string) => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation(["big-five", "common", "deepspace", "home"]);
  const locale = (i18n.language === "ko" ? "ko" : "en") as BfiLocale;
  const copy = bfiSurveyCopy(locale);
  const [phase, setPhase] = useState<"intro" | "questions" | "saved">("intro");
  const [responses, setResponses] = useState<BfiResponses>({});
  const [page, setPage] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const submitLockRef = useRef(new BfiOwnerSubmitLock());
  const completionGateRef = useRef(new OneShotGate());
  const mountedRef = useRef(true);

  const result = useMemo(() => scoreBfi(responses), [responses]);
  const pageIndices = useMemo(() => bfiPageIndices(page), [page]);
  const pageStart = pageIndices[0] ?? 0;
  const pageEnd = (pageIndices.at(-1) ?? -1) + 1;
  const lastPage = page === BFI_PAGE_COUNT - 1;
  const dirty = result.answered > 0;

  useEffect(() => {
    mountedRef.current = true;
    completionGateRef.current = new OneShotGate();
    return () => {
      mountedRef.current = false;
      submitLockRef.current.invalidate();
      completionGateRef.current.invalidate();
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [page]);

  const handleSavedDone = useCallback(() => {
    completeBfiForOwner({
      ownerId,
      getActiveOwnerId: () => (mountedRef.current ? activeOwnerIdRef.current : null),
      gate: completionGateRef.current,
      consumeNudge: consumeFirstStarChatNudge,
      onNudge: () => {
        router.replace({ pathname: "/secondb", params: { fromNode: t("big-five:title") } });
      },
      onComplete: () => onComplete(ownerId),
    });
  }, [activeOwnerIdRef, onComplete, ownerId, t]);

  const requestBack = useCallback(() => {
    if (submitting) return;
    if (phase === "saved") {
      handleSavedDone();
      return;
    }
    if (phase === "questions" && dirty) {
      setExitOpen(true);
      return;
    }
    onCancel();
  }, [dirty, handleSavedDone, onCancel, phase, submitting]);

  useEffect(() => {
    if (phase !== "saved" && !submitting && (phase !== "questions" || !dirty)) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (submitting) return true;
      if (phase === "saved") handleSavedDone();
      else if (exitOpen) setExitOpen(false);
      else setExitOpen(true);
      return true;
    });
    return () => subscription.remove();
  }, [dirty, exitOpen, handleSavedDone, phase, submitting]);

  function setResponse(itemId: number, value: number) {
    if (submitting) return;
    setResponses((previous) => ({ ...previous, [itemId]: value }));
  }

  async function handleSubmit() {
    const outcome = await saveBfiForOwner({
      ownerId,
      locale,
      responses,
      lock: submitLockRef.current,
      getActiveOwnerId: () => (mountedRef.current ? activeOwnerIdRef.current : null),
      onAcquired: () => {
        setSubmitting(true);
        setSaveError(false);
      },
      write: createRecord,
    });

    if (!mountedRef.current || activeOwnerIdRef.current !== ownerId) return;
    if (outcome === "saved") {
      setExitOpen(false);
      setSubmitting(false);
      setPhase("saved");
    } else if (outcome === "failed") {
      setSubmitting(false);
      setSaveError(true);
      if (typeof console !== "undefined") console.warn("[big-five] save failed");
    }
  }

  return (
    <DeepSpaceScreen
      active="lens"
      variant="windowed"
      header="none"
      title={t("big-five:counter")}
      onBack={requestBack}
    >
      {phase === "intro" ? (
        <ScrollView contentContainerStyle={styles.surveyScroll} keyboardShouldPersistTaps="handled">
          <SurveyIntro locale={locale} onStart={() => setPhase("questions")} onCancel={onCancel} />
        </ScrollView>
      ) : phase === "saved" ? (
        <View style={styles.savedWrap}>
          <SavedState onDone={handleSavedDone} />
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.surveyScroll}
          keyboardShouldPersistTaps="handled"
        >
          <ScreenTitle title={t("big-five:counter")} subtitle={copy.instruction} />
          <PixelSurface variant="inset" contentStyle={styles.progressSurface}>
            <View style={styles.progressHead}>
              <Text style={[m3TextStyle("labelMedium"), styles.mutedText]}>
                {t("deepspace:quant.pageCounter", { current: page + 1, total: BFI_PAGE_COUNT })}
              </Text>
              <Text style={[m3TextStyle("labelMedium"), styles.mutedText]}>
                {t("deepspace:quant.answered", { answered: result.answered, total: BFI_ITEMS.length })}
              </Text>
            </View>
            <ProgressCells answered={result.answered} />
          </PixelSurface>

          {pageIndices.map((index) => (
            <QuestionCard
              key={BFI_ITEMS[index].id}
              index={index}
              locale={locale}
              value={responses[BFI_ITEMS[index].id]}
              disabled={submitting}
              onSelect={setResponse}
            />
          ))}

          <Text style={[m3TextStyle("bodySmall"), styles.rangeText]}>
            {t("deepspace:quant.rangeNote", { from: pageStart + 1, to: pageEnd })}
          </Text>

          {saveError ? (
            <View accessibilityRole="alert" accessibilityLiveRegion="assertive">
              <PixelSurface variant="frame" background={m3.color.errorContainer} contentStyle={styles.errorSurface}>
                <PixelGlyph name="warning" color={m3.color.onErrorContainer} size={24} />
                <Text style={[m3TextStyle("bodyMedium"), styles.errorText]}>{copy.failure}</Text>
              </PixelSurface>
            </View>
          ) : null}

          {submitting ? (
            <View
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              accessibilityState={{ busy: true }}
            >
              <PixelSurface variant="inset" contentStyle={styles.savingSurface}>
                <PixelGlyph name="refresh" color={m3.color.primary} size={24} />
                <Text style={[m3TextStyle("bodyMedium"), styles.brandText]}>
                  {t("home:ds.capture.saving")}
                </Text>
              </PixelSurface>
            </View>
          ) : null}

          <View style={styles.pagerActions}>
            <PixelAction
              label={t("common:quantBack")}
              icon="arrow_back"
              onPress={() => setPage((current) => Math.max(0, current - 1))}
              disabled={page === 0 || submitting}
              accessibilityHint={t("common:quantPrevHint")}
            />
            {lastPage ? (
              <PixelAction
                label={submitting ? t("home:ds.capture.saving") : t("common:quantSaveResult")}
                icon="check"
                onPress={() => void handleSubmit()}
                disabled={!result.complete || submitting}
                busy={submitting}
                tone="primary"
                accessibilityHint={t("common:quantSubmitHint")}
              />
            ) : (
              <PixelAction
                label={t("common:quantNext")}
                icon="arrow_forward"
                onPress={() => setPage((current) => Math.min(BFI_PAGE_COUNT - 1, current + 1))}
                disabled={submitting}
                tone="primary"
                accessibilityHint={t("common:quantNextHint")}
              />
            )}
          </View>
        </ScrollView>
      )}

      <ExitConfirm
        visible={exitOpen && phase === "questions" && !submitting}
        locale={locale}
        onCancel={() => setExitOpen(false)}
        onExit={() => {
          setExitOpen(false);
          onCancel();
        }}
      />
    </DeepSpaceScreen>
  );
}

export function DeepSpaceBigFiveScreen() {
  const {
    userId,
    loading,
    hasProfile,
    profileProbeFailed,
    refresh,
  } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const [surveyOwnerId, setSurveyOwnerId] = useState<string | null>(null);
  const [profileRetryOwnerId, setProfileRetryOwnerId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<BfiLensSnapshot>({ status: "idle", ownerId: null });
  const readGuardRef = useRef(new BfiOwnerRequestGuard());
  const profileRetryLockRef = useRef(new BfiOwnerSubmitLock());
  const mountedRef = useRef(true);
  const activeOwnerIdRef = useRef<string | null>(loading ? null : userId);
  activeOwnerIdRef.current = loading ? null : userId;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      readGuardRef.current.invalidate();
      profileRetryLockRef.current.invalidate();
    };
  }, []);

  useEffect(() => {
    profileRetryLockRef.current.invalidate();
    setProfileRetryOwnerId(null);
    setSurveyOwnerId(null);
  }, [userId]);

  useEffect(() => {
    const ownerId = bfiReadOwner({ loading, userId, hasProfile, profileProbeFailed });
    if (ownerId === null) {
      readGuardRef.current.invalidate();
      return;
    }

    const ticket = readGuardRef.current.begin(ownerId);
    setSnapshot({ status: "loading", ownerId });
    void loadBfiLensWithTimeout(
      () => loadLatestBfi(getSupabaseClient(), ownerId),
      BFI_READ_TIMEOUT_MS,
    ).then((result) => {
      if (!readGuardRef.current.settle(ticket, activeOwnerIdRef.current)) return;
      if (result.status === "ready") {
        setSnapshot({ status: "ready", ownerId, traits: result.traits });
      } else {
        setSnapshot({ status: result.status, ownerId });
      }
    });

    return () => readGuardRef.current.cancel(ticket);
  }, [hasProfile, loading, profileProbeFailed, reloadKey, userId]);

  if (loading) return <GateLoading />;
  if (!userId) return <SignedOutGate />;
  if (profileProbeFailed) {
    return (
      <ProfileGate
        failed
        retrying={profileRetryOwnerId === userId}
        onRetry={() => {
          void refreshBfiProfileForOwner({
            ownerId: userId,
            lock: profileRetryLockRef.current,
            getActiveOwnerId: () => (mountedRef.current ? activeOwnerIdRef.current : null),
            onAcquired: () => setProfileRetryOwnerId(userId),
            refresh,
          }).then((outcome) => {
            if (
              outcome !== "complete" ||
              !mountedRef.current ||
              activeOwnerIdRef.current !== userId
            ) {
              return;
            }
            setProfileRetryOwnerId(null);
          });
        }}
      />
    );
  }
  if (hasProfile === null) return <GateLoading />;
  if (hasProfile !== true) {
    return <ProfileGate failed={false} retrying={false} onRetry={() => undefined} />;
  }

  if (surveyOwnerId === userId) {
    return (
      <PixelBigFiveSurvey
        key={userId}
        ownerId={userId}
        activeOwnerIdRef={activeOwnerIdRef}
        onCancel={() => setSurveyOwnerId(null)}
        onComplete={(completedOwnerId) => {
          if (activeOwnerIdRef.current !== completedOwnerId) return;
          setSurveyOwnerId(null);
          setReloadKey((current) => current + 1);
        }}
      />
    );
  }

  const visible = visibleBfiLensSnapshot(snapshot, userId);
  return (
    <LensShell
      snapshot={visible}
      onStart={() => setSurveyOwnerId(userId)}
      onRetry={() => setReloadKey((current) => current + 1)}
    />
  );
}

const styles = StyleSheet.create({
  actionRoot: { alignSelf: "stretch", minHeight: 44 },
  actionContent: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s3,
  },
  screenScroll: {
    flexGrow: 1,
    gap: m3.spacing.s6,
    padding: m3.spacing.s6,
    paddingBottom: m3.spacing.s8 * 6,
  },
  surveyScroll: {
    flexGrow: 1,
    gap: m3.spacing.s6,
    padding: m3.spacing.s6,
    paddingBottom: m3.spacing.s8 * 6,
  },
  gateContent: { justifyContent: "center", gap: m3.spacing.s6 },
  titleSurface: { gap: m3.spacing.s4 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: m3.spacing.s4 },
  titleText: { flex: 1, color: m3.color.onSurface },
  mutedText: { color: m3.color.onSurfaceVariant },
  brandText: { color: m3.color.primary, textAlign: "center" },
  centerState: {
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s6,
    minHeight: 240,
  },
  centerText: { color: m3.color.onSurface, textAlign: "center" },
  centerBody: { color: m3.color.onSurfaceVariant, textAlign: "center" },
  stateAction: { alignSelf: "stretch", width: "100%", marginTop: m3.spacing.s4 },
  traitsSurface: { gap: m3.spacing.s6 },
  traitRow: { gap: m3.spacing.s3 },
  traitHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  traitLabel: { flex: 1, color: m3.color.onSurface },
  traitValue: { color: m3.color.primary },
  cells: { flexDirection: "row", gap: m3.spacing.s1 },
  cell: { flex: 1, height: m3.spacing.s4 },
  actionsStack: { alignSelf: "stretch", gap: m3.spacing.s4, width: "100%" },
  profileGate: { flex: 1, justifyContent: "center", padding: m3.spacing.s6 },
  introSurface: { alignItems: "center", gap: m3.spacing.s6 },
  introStats: { flexDirection: "row", alignSelf: "stretch", gap: m3.spacing.s4 },
  introStat: {
    flex: 1,
    alignItems: "center",
    gap: m3.spacing.s2,
    backgroundColor: m3.color.surfaceVariant,
    padding: m3.spacing.s4,
  },
  progressSurface: { gap: m3.spacing.s4 },
  progressHead: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: m3.spacing.s4 },
  progressBlock: { gap: m3.spacing.s2 },
  progressCell: { flex: 1, height: m3.spacing.s3 },
  questionSurface: { gap: m3.spacing.s4 },
  questionText: { color: m3.color.onSurface, paddingBottom: m3.spacing.s1 },
  choices: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    gap: m3.spacing.s2,
  },
  choiceRoot: { flexGrow: 1, flexBasis: 44, minWidth: 44, minHeight: 44 },
  choiceContent: { minHeight: 44, alignItems: "center", gap: m3.spacing.s1, paddingHorizontal: m3.spacing.s2 },
  scaleLegend: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: m3.spacing.s4 },
  rangeText: { color: m3.color.onSurfaceVariant, textAlign: "center" },
  errorSurface: { flexDirection: "row", alignItems: "center", gap: m3.spacing.s4 },
  errorText: { flex: 1, color: m3.color.onErrorContainer },
  savingSurface: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: m3.spacing.s4 },
  pagerActions: { gap: m3.spacing.s4 },
  modalRoot: { flex: 1, alignItems: "center", justifyContent: "center", padding: m3.spacing.s8 },
  modalCard: { width: "100%", maxWidth: 420 },
  exitSurface: { gap: m3.spacing.s6, alignItems: "center" },
  savedWrap: { flex: 1, justifyContent: "center", padding: m3.spacing.s6 },
  savedDither: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
});
