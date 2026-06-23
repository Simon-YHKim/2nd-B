// Settings screen — primarily the "Danger zone" for data deletion.
// Three modes per user requirement: select-only (handled inline on
// /journal etc.), partial (per-kind / per-tag), and full (everything).

import { type ReactNode, useEffect, useState } from "react";
import { ActivityIndicator, TouchableOpacity, ScrollView, StyleSheet, View, type AccessibilityRole, type StyleProp, type ViewStyle, KeyboardAvoidingView, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumLoadingState, PremiumModal, PremiumToast } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { SecondbStatusHeader } from "@/components/deepspace";
import { deepSpace, deepSpaceRadii, semantic, spacing, withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { useAuth } from "@/lib/auth/AuthContext";
import { signOut } from "@/lib/supabase/auth";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceLinks } from "@/components/deep-space/DeepSpaceLinks";
import { useCrewDensity, CREW_DENSITY_ORDER, type CrewDensity } from "@/lib/settings/crew-density";
import { AVAILABLE_UI_LOCALES, UI_LOCALE_META } from "@/lib/i18n/locales";
import {
  deleteAllChatUsage,
  deleteAllUserData,
  deleteAllWikiPages,
  deleteRecordsByKind,
  deleteRecordsByTag,
  deleteUningestedSources,
} from "@/lib/records/delete-bulk";

const CONFIRM_PHRASE = "DELETE";
type SettingsToast = { message: string; tone: "info" | "success" | "danger" };
type PendingConfirm = { message: string; onYes: () => Promise<void> } | null;
type ActionError = { title: string; body: string; retry?: () => void } | null;
type SettingsDisclosureKey = "crew" | "data" | "language";
type DataDeleteStep = "records" | "assessments" | "library" | "full";

const DATA_DELETE_STEPS: DataDeleteStep[] = ["records", "assessments", "library", "full"];

const CREW_DENSITY_LABEL: Record<"en" | "ko", Record<CrewDensity, string>> = {
  en: { none: "None", few: "Few", some: "Some", many: "Many" },
  ko: { none: "없음", few: "적게", some: "보통", many: "많이" },
};

type SettingsActionButtonProps = {
  label: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  loading?: boolean;
  onPress?: () => void | Promise<void>;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
  /** Segmented/toggle membership — announces selected state to screen readers. */
  selected?: boolean;
};

function SettingsActionButton({
  label,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = "button",
  variant = "secondary",
  disabled,
  loading,
  onPress,
  style,
  full = true,
  selected,
}: SettingsActionButtonProps) {
  const isDisabled = disabled || loading;
  const labelColor = isDisabled
    ? withAlpha(deepSpace.text, 0.5)
    : variant === "primary"
      ? deepSpace.onMint
      : variant === "danger"
        ? deepSpace.textHi
        : deepSpace.text;

  return (
    <View
      style={[
        styles.settingsButton,
        full ? styles.settingsButtonFull : null,
        style,
        variant === "primary"
          ? styles.settingsButtonPrimary
          : variant === "danger"
            ? styles.settingsButtonDanger
            : styles.settingsButtonSecondary,
        isDisabled ? styles.settingsButtonDisabled : null,
      ]}
    >
      <TouchableOpacity
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: isDisabled, busy: loading, selected }}
        disabled={isDisabled}
        onPress={onPress ? () => void onPress() : undefined}
        style={styles.settingsButtonPressable}
        activeOpacity={0.78}
      >
        {loading ? <ActivityIndicator size="small" color={labelColor} /> : null}
        <Text style={[styles.settingsButtonLabel, { color: labelColor }]}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
}

function Button(props: SettingsActionButtonProps) {
  return <SettingsActionButton {...props} />;
}

type DisclosureSectionProps = {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  tone?: "brand" | "warning";
  children: ReactNode;
};

function DisclosureSection({
  title,
  expanded,
  onToggle,
  tone = "brand",
  children,
}: DisclosureSectionProps) {
  const borderStartColor = tone === "warning" ? semantic.warning : semantic.brand;
  const textColor: keyof typeof semantic = tone === "warning" ? "warning" : "brand";

  return (
    <View style={[styles.section, { borderStartColor }]}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={styles.disclosureHeader}
        activeOpacity={0.78}
      >
        <Text variant="caption" color={textColor} style={styles.sectionEyebrow}>
          {title}
        </Text>
        <Text variant="caption" color={textColor} style={styles.disclosureIndicator}>
          {expanded ? "-" : "+"}
        </Text>
      </TouchableOpacity>
      {expanded ? <View style={styles.disclosureBody}>{children}</View> : null}
    </View>
  );
}

export default function Settings() {
  const { t, i18n } = useTranslation("settings");
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const { density: crewDensity, setDensity: setCrewDensity } = useCrewDensity();

  const [busy, setBusy] = useState<string | null>(null);
  const [fullDeleteConfirm, setFullDeleteConfirm] = useState("");
  const [toast, setToast] = useState<SettingsToast | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  const [actionError, setActionError] = useState<ActionError>(null);
  const [dataDeleteStep, setDataDeleteStep] = useState<DataDeleteStep>("records");
  const [openDisclosures, setOpenDisclosures] = useState<Record<SettingsDisclosureKey, boolean>>({
    crew: false,
    data: false,
    language: false,
  });

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timeout);
  }, [toast]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.glow} pointerEvents="none" />
        <View style={styles.center}>
          <PremiumLoadingState message={t("loading")} />
        </View>
      </View>
    );
  }
  if (!userId) {
    return <Redirect href="/sign-in" />;
  }

  function confirm(message: string, onYes: () => Promise<void>): void {
    setPendingConfirm({ message, onYes });
  }

  // Surface a calm, product-tone failure with a retry. The raw error stays in
  // the console for debugging and never appears in the user-facing Alert text.
  function showActionError(
    context: string,
    error: unknown,
    title: string,
    body: string,
    retry?: () => void,
  ): void {
    console.warn(`[settings] ${context} failed`, error);
    setActionError({ title, body, retry });
  }

  function showSuccess(message: string): void {
    setToast({ tone: "success", message });
  }

  function runPendingConfirm(): void {
    const current = pendingConfirm;
    setPendingConfirm(null);
    if (current) void current.onYes();
  }

  function retryActionError(): void {
    const current = actionError;
    setActionError(null);
    current?.retry?.();
  }

  function toggleDisclosure(key: SettingsDisclosureKey): void {
    setOpenDisclosures((current) => ({ ...current, [key]: !current[key] }));
  }

  async function runDeleteKind(kind: "journal" | "note" | "audit_response", label: string) {
    if (!userId) return;
    setBusy(label);
    try {
      const n = await deleteRecordsByKind(userId, kind);
      showSuccess(locale === "ko" ? `${n}개 삭제됨` : `Deleted ${n}`);
    } catch (e) {
      showActionError(
        `deleteRecordsByKind(${kind})`,
        e,
        locale === "ko" ? "삭제하지 못했어요" : "Couldn't delete",
        locale === "ko"
          ? "기록을 지우는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요."
          : "Something went wrong while clearing these records. Please try again in a moment.",
        () => void runDeleteKind(kind, label),
      );
    } finally {
      setBusy(null);
    }
  }

  async function runDeleteByTag(tags: string[], label: string) {
    if (!userId) return;
    setBusy(label);
    try {
      const n = await deleteRecordsByTag(userId, tags);
      showSuccess(locale === "ko" ? `${n}개 삭제됨` : `Deleted ${n}`);
    } catch (e) {
      showActionError(
        `deleteRecordsByTag(${tags.join(",")})`,
        e,
        locale === "ko" ? "삭제하지 못했어요" : "Couldn't delete",
        locale === "ko"
          ? "결과를 지우는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요."
          : "Something went wrong while clearing these results. Please try again in a moment.",
        () => void runDeleteByTag(tags, label),
      );
    } finally {
      setBusy(null);
    }
  }

  async function runDeleteWikiPages() {
    if (!userId) return;
    setBusy("wikiPages");
    try {
      const n = await deleteAllWikiPages(userId);
      showSuccess(locale === "ko" ? `${n}개 위키 페이지 삭제됨` : `Deleted ${n} wiki pages`);
    } catch (e) {
      showActionError(
        "deleteAllWikiPages",
        e,
        locale === "ko" ? "삭제하지 못했어요" : "Couldn't delete",
        locale === "ko"
          ? "위키 페이지를 지우는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요."
          : "Something went wrong while clearing your wiki pages. Please try again in a moment.",
        () => void runDeleteWikiPages(),
      );
    } finally {
      setBusy(null);
    }
  }

  async function runDeleteUningestedSources() {
    if (!userId) return;
    setBusy("sources");
    try {
      const n = await deleteUningestedSources(userId);
      showSuccess(locale === "ko" ? `${n}개 캡처 삭제됨` : `Deleted ${n} captures`);
    } catch (e) {
      showActionError(
        "deleteUningestedSources",
        e,
        locale === "ko" ? "삭제하지 못했어요" : "Couldn't delete",
        locale === "ko"
          ? "캡처를 지우는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요."
          : "Something went wrong while clearing these captures. Please try again in a moment.",
        () => void runDeleteUningestedSources(),
      );
    } finally {
      setBusy(null);
    }
  }

  async function runResetChatUsage() {
    if (!userId) return;
    setBusy("chat");
    try {
      const n = await deleteAllChatUsage(userId);
      showSuccess(locale === "ko" ? `${n}일치 사용량 리셋됨` : `Reset ${n} days of usage`);
    } catch (e) {
      showActionError(
        "deleteAllChatUsage",
        e,
        locale === "ko" ? "리셋하지 못했어요" : "Couldn't reset",
        locale === "ko"
          ? "사용량을 리셋하는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요."
          : "Something went wrong while resetting usage. Please try again in a moment.",
        () => void runResetChatUsage(),
      );
    } finally {
      setBusy(null);
    }
  }

  async function runFullWipe() {
    if (!userId) return;
    setBusy("full");
    let routingAfterWipe = false;
    try {
      const result = await deleteAllUserData(userId);
      showSuccess(
        locale === "ko"
          ? `전체 삭제 완료: 기록 ${result.records} · 캡처 ${result.sources} · 위키 ${result.wikiPages} · 사용량 ${result.chatUsage}`
          : `Full wipe complete: records ${result.records} · sources ${result.sources} · wiki ${result.wikiPages} · usage ${result.chatUsage}`,
      );
      setFullDeleteConfirm("");
      routingAfterWipe = true;
      setTimeout(() => router.replace("/capture"), 900);
    } catch (e) {
      showActionError(
        "deleteAllUserData",
        e,
        locale === "ko" ? "전체 삭제를 끝내지 못했어요" : "Couldn't finish the full wipe",
        locale === "ko"
          ? "일부 데이터가 남아 있을 수 있어요. 잠시 후 다시 시도하면 남은 데이터를 마저 정리합니다."
          : "Some data may remain. Try again in a moment to finish clearing what's left.",
        () => void runFullWipe(),
      );
    } finally {
      if (!routingAfterWipe) setBusy(null);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.glow} pointerEvents="none" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <SecondbStatusHeader
          text={locale === "ko" ? "필요한 걸 여기서 맞춰요." : "Tune what you need, right here."}
          tip={
            locale === "ko"
              ? "삭제는 되돌릴 수 없어요. 필요한 건 먼저 내보내기로."
              : "Deletion cannot be undone. Export anything you need first."
          }
        />
        <Text variant="heading" style={styles.title}>{locale === "ko" ? "설정" : "Settings"}</Text>

        {/* Navigation hub (A-to-Z Phase 12) — the settings sub-screens. */}
        {/* Destructive op in flight: a persistent banner explains why actions
            and sign-out are disabled, instead of letting the user escape a
            half-finished wipe by navigating away or signing out. */}
        {busy !== null ? (
          <View style={styles.busyBanner} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <Text variant="caption" color="textMuted">
              {locale === "ko"
                ? "작업을 처리하는 중이에요. 끝날 때까지 다른 작업과 로그아웃은 잠시 멈춰둘게요."
                : "Working on it. Other actions and sign-out are paused until this finishes."}
            </Text>
          </View>
        ) : null}

        {/* O-R1 settings restructure (39-screen audit, 4.5/10: "25+ choices,
            no grouping"): the seven equal-weight nav buttons split into two
            scannable groups (Gestalt: same meaning, same cluster), and the
            "Theme (quick toggle)" disclosure is GONE — it duplicated the
            /theme page button two rows above it (same action, two places). */}
        <View style={styles.section}>
          <Text variant="caption" color="textMuted" style={styles.sectionEyebrow}>
            {locale === "ko" ? "내 계정" : "My account"}
          </Text>
          <Button
            label={t("nav.profile")}
            accessibilityHint={t("nav.profileHint")}
            variant="secondary"
            onPress={() => router.push("/profile")}
          />
          <Button
            label={t("nav.privacy")}
            accessibilityHint={t("nav.privacyHint")}
            variant="secondary"
            onPress={() => router.push("/privacy")}
          />
          <Button
            label={t("nav.account")}
            accessibilityHint={t("nav.accountHint")}
            variant="secondary"
            onPress={() => router.push("/account")}
          />
        </View>

        <View style={styles.section}>
          <Text variant="caption" color="textMuted" style={styles.sectionEyebrow}>
            {locale === "ko" ? "앱" : "App"}
          </Text>
          <Button
            label={t("nav.theme")}
            accessibilityHint={t("nav.themeHint")}
            variant="secondary"
            onPress={() => router.push("/theme")}
          />
          <Button
            label={t("nav.data")}
            accessibilityHint={t("nav.dataHint")}
            variant="secondary"
            onPress={() => router.push("/data")}
          />
          <Button
            label={t("nav.records")}
            accessibilityHint={t("nav.recordsHint")}
            variant="secondary"
            onPress={() => router.push("/records")}
          />
          <Button
            label={t("nav.support")}
            accessibilityHint={t("nav.supportHint")}
            variant="secondary"
            onPress={() => router.push("/support")}
          />
        </View>

        {/* O-31 Stage③ (nav-contract §3): in deep-space mode, surface the full
            설정 second-tier so 요금제 /plans, 권한 /permissions, 운영진단 /ops
            (no legacy nav button) are reachable directly from 설정 (누락 0).
            Legacy mode renders nothing here — the sections above are its nav. */}
        {isDeepSpaceUI() ? (
          <DeepSpaceLinks
            groups={[
              {
                title: locale === "ko" ? "설정" : "Settings",
                items: [
                  { key: "account", label: locale === "ko" ? "계정" : "Account", route: "/account" },
                  { key: "plans", label: locale === "ko" ? "요금제" : "Plans", route: "/plans" },
                  { key: "privacy", label: locale === "ko" ? "개인정보" : "Privacy", route: "/privacy" },
                  { key: "permissions", label: locale === "ko" ? "권한" : "Permissions", route: "/permissions" },
                  { key: "data", label: locale === "ko" ? "데이터" : "Data", route: "/data" },
                  { key: "theme", label: locale === "ko" ? "테마" : "Theme", route: "/theme" },
                  { key: "support", label: locale === "ko" ? "지원" : "Support", route: "/support" },
                  { key: "manual", label: locale === "ko" ? "매뉴얼" : "Manual", route: "/manual" },
                  { key: "integrations", label: locale === "ko" ? "연동" : "Integrations", route: "/integrations" },
                  { key: "museum", label: locale === "ko" ? "AI 뮤지엄" : "AI Museum", route: "/museum" },
                  { key: "ops", label: locale === "ko" ? "운영 진단" : "Routines", route: "/ops" },
                ],
              },
            ]}
          />
        ) : null}

        <DisclosureSection
          // O-R2 (2) language-pack infra: first in-app language switch for
          // signed-in users (auth screens had a toggle, settings had none).
          // Renders from AVAILABLE_UI_LOCALES - options appear as packs ship.
          title={locale === "ko" ? "언어" : "Language"}
          expanded={openDisclosures.language}
          onToggle={() => toggleDisclosure("language")}
        >
          <Text variant="subtle" color="textMuted">
            {t("language.body")}
          </Text>
          <View style={styles.crewRow}>
            {AVAILABLE_UI_LOCALES.map((code, index) => {
              const meta = UI_LOCALE_META[code];
              const optionLabel = meta.beta ? `${meta.nativeName} ${t("language.betaTag")}` : meta.nativeName;
              const isActive = i18n.language === code;
              return (
                <Button
                  key={code}
                  label={optionLabel}
                  accessibilityRole="radio"
                  accessibilityLabel={t("language.optionA11yLabel", {
                    label: optionLabel,
                    index: index + 1,
                    total: AVAILABLE_UI_LOCALES.length,
                    state: isActive ? t("language.stateSelected") : t("language.stateAvailable"),
                  })}
                  accessibilityHint={t("language.useLanguageHint", { label: optionLabel })}
                  variant={isActive ? "primary" : "secondary"}
                  selected={isActive}
                  onPress={() => {
                    void i18n.changeLanguage(code);
                  }}
                  full={false}
                />
              );
            })}
          </View>
        </DisclosureSection>

        <DisclosureSection
          title={locale === "ko" ? "그래프 크루 (장식 로봇)" : "Graph crew (decorative)"}
          expanded={openDisclosures.crew}
          onToggle={() => toggleDisclosure("crew")}
        >
          <Text variant="subtle" color="textMuted">
            {locale === "ko"
              ? "기록 보관소 크루가 그래프를 돌아다니는 양. 노드 수에 비례하며, 없음~많이로 조절하거나 완전히 끌 수 있어요."
              : "How many records-crew sprites wander the graph. Scales with your node count; set anywhere from none to many."}
          </Text>
          <View style={styles.crewRow}>
            {CREW_DENSITY_ORDER.map((d) => (
              <Button
                key={d}
                label={CREW_DENSITY_LABEL[locale][d]}
                accessibilityHint={t("actions.crewDensityHint", { density: CREW_DENSITY_LABEL[locale][d] })}
                variant={crewDensity === d ? "primary" : "secondary"}
                selected={crewDensity === d}
                onPress={() => setCrewDensity(d)}
                full={false}
              />
            ))}
          </View>
        </DisclosureSection>

        <DisclosureSection
          // Was titled identically to the nav.data button above (two controls,
          // same name, different destinations — audit confusion finding).
          title={locale === "ko" ? "데이터 삭제 (위험 구역)" : "Delete data (danger zone)"}
          expanded={openDisclosures.data}
          onToggle={() => toggleDisclosure("data")}
          tone="warning"
        >
          <Text variant="subtle" color="textMuted">
            {t("dataWizard.body")}
          </Text>
          <View style={styles.deleteWizardGrid}>
            {DATA_DELETE_STEPS.map((step, index) => {
              const stepSelected = dataDeleteStep === step;
              const stepLabel = t(`dataWizard.${step}.label`);
              return (
                <Button
                  key={step}
                  label={stepLabel}
                  accessibilityRole="radio"
                  accessibilityLabel={t("dataWizard.optionA11yLabel", {
                    label: stepLabel,
                    index: index + 1,
                    total: DATA_DELETE_STEPS.length,
                    state: stepSelected ? t("dataWizard.stateSelected") : t("dataWizard.stateAvailable"),
                  })}
                  accessibilityHint={stepSelected ? t("dataWizard.selectedHint") : t(`dataWizard.${step}.hint`)}
                  variant={stepSelected ? (step === "full" ? "danger" : "primary") : "secondary"}
                  selected={stepSelected}
                  onPress={() => setDataDeleteStep(step)}
                  full={false}
                  style={styles.deleteWizardOption}
                />
              );
            })}
          </View>
          <Text variant="subtle" color={dataDeleteStep === "full" ? "danger" : "textMuted"}>
            {t(`dataWizard.${dataDeleteStep}.body`)}
          </Text>

          {dataDeleteStep === "records" ? (
          <View style={styles.destructiveGroup}>
            <Text variant="caption" color="warning" style={styles.sectionEyebrow}>
              {locale === "ko" ? "부분 삭제: 종류별" : "Partial: by kind"}
            </Text>
            <Text variant="subtle" color="textMuted">
              {locale === "ko"
                ? "특정 종류의 기록만 삭제. 다른 종류와 위키는 그대로 둡니다."
                : "Delete one kind only. Other kinds and your wiki stay."}
            </Text>
            <Button
              label={locale === "ko" ? "모든 일기 삭제" : "Delete all journals"}
              accessibilityHint={t("actions.deleteJournalsHint")}
              variant="danger"
              disabled={busy !== null}
              onPress={() =>
                confirm(
                  locale === "ko" ? "모든 일기를 삭제합니다." : "Delete every journal entry.",
                  () => runDeleteKind("journal", "journal"),
                )
              }
            />
            <Button
              label={locale === "ko" ? "모든 노트 삭제" : "Delete all notes"}
              accessibilityHint={t("actions.deleteNotesHint")}
              variant="danger"
              disabled={busy !== null}
              onPress={() =>
                confirm(
                  locale === "ko" ? "모든 노트를 삭제합니다 (평가 결과 포함)." : "Delete every note (assessments included).",
                  () => runDeleteKind("note", "note"),
                )
              }
            />
            <Button
              label={locale === "ko" ? "과거의 나 응답 삭제" : "Delete audit responses"}
              accessibilityHint={t("actions.deleteAuditHint")}
              variant="danger"
              disabled={busy !== null}
              onPress={() =>
                confirm(
                  locale === "ko" ? "모든 과거의 나 응답을 삭제합니다." : "Delete every audit response.",
                  () => runDeleteKind("audit_response", "audit"),
                )
              }
            />
          </View>
          ) : null}

          {dataDeleteStep === "assessments" ? (
          <View style={styles.destructiveGroup}>
            <Text variant="caption" color="warning" style={styles.sectionEyebrow}>
              {locale === "ko" ? "부분 삭제: 평가 결과" : "Partial: by assessment"}
            </Text>
            <Button
              label={locale === "ko" ? "Big Five (BFI-44) 결과 삭제" : "Delete Big Five (BFI-44) results"}
              accessibilityHint={t("actions.deleteBfiHint")}
              variant="danger"
              disabled={busy !== null}
              onPress={() =>
                confirm(
                  locale === "ko"
                    ? "저장된 모든 BFI-44 결과를 삭제합니다. 이전 TIPI 결과가 있으면 함께 삭제합니다."
                    : "Delete every saved BFI-44 result. Include older TIPI records if present.",
                  () => runDeleteByTag(["bfi", "tipi"], "bfi"),
                )
              }
            />
            <Button
              label={locale === "ko" ? "애착 (ECR) 결과 삭제" : "Delete Attachment (ECR) results"}
              accessibilityHint={t("actions.deleteEcrHint")}
              variant="danger"
              disabled={busy !== null}
              onPress={() =>
                confirm(
                  locale === "ko" ? "저장된 모든 ECR 결과를 삭제합니다." : "Delete every saved ECR result.",
                  () => runDeleteByTag(["ecr"], "ecr"),
                )
              }
            />
            <Button
              label={locale === "ko" ? "MBTI 참고 결과 삭제" : "Delete MBTI reference results"}
              accessibilityHint={t("actions.deleteMbtiHint")}
              variant="danger"
              disabled={busy !== null}
              onPress={() =>
                confirm(
                  locale === "ko" ? "저장된 모든 MBTI 참고 결과를 삭제합니다." : "Delete every saved MBTI reference result.",
                  () => runDeleteByTag(["mbti"], "mbti"),
                )
              }
            />
          </View>
          ) : null}

          {dataDeleteStep === "library" ? (
          <View style={styles.destructiveGroup}>
            <Text variant="caption" color="warning" style={styles.sectionEyebrow}>
              {locale === "ko" ? "부분 삭제: 위키/캡처/사용량" : "Partial: wiki / captures / usage"}
            </Text>
            <Button
              label={locale === "ko" ? "모든 위키 페이지 삭제" : "Delete all wiki pages"}
              accessibilityHint={t("actions.deleteWikiHint")}
              variant="danger"
              disabled={busy !== null}
              onPress={() =>
                confirm(
                  locale === "ko"
                    ? "위키 페이지와 페이지 간 연결이 모두 삭제됩니다. 받은편지함 자료는 남아요."
                    : "Wiki pages and their page-to-page links are wiped. Inbox sources stay.",
                  () => runDeleteWikiPages(),
                )
              }
            />
            <Button
              label={locale === "ko" ? "미발전 캡처 삭제 (받은편지함의 미정리분)" : "Delete un-ingested captures"}
              accessibilityHint={t("actions.deleteUningestedHint")}
              variant="danger"
              disabled={busy !== null}
              onPress={() =>
                confirm(
                  locale === "ko" ? "위키로 발전시키지 않은 캡처만 삭제합니다." : "Only sources that haven't been promoted to a wiki page.",
                  () => runDeleteUningestedSources(),
                )
              }
            />
            <Button
              label={locale === "ko" ? "세컨비 일일 사용량 리셋" : "Reset SecondB daily usage"}
              accessibilityHint={t("actions.resetUsageHint")}
              variant="danger"
              disabled={busy !== null}
              onPress={() =>
                confirm(
                  locale === "ko" ? "오늘과 과거 모든 사용량 카운터를 비웁니다." : "Clear today's and all past usage counters.",
                  () => runResetChatUsage(),
                )
              }
            />
          </View>
          ) : null}

          {dataDeleteStep === "full" ? (
          <View style={styles.destructiveGroup}>
            <Text variant="caption" color="danger" style={styles.sectionEyebrow}>
              {locale === "ko" ? "위험: 전체 삭제" : "Danger: full wipe"}
            </Text>
            <Text variant="subtle" color="textMuted">
              {locale === "ko"
                ? "기록 · 캡처 · 위키 페이지 · 세컨비 사용량을 한 번에 모두 삭제합니다. 계정은 유지되지만 0부터 다시 시작합니다."
                : "Wipes records, sources, wiki pages, and SecondB usage in one shot. The account stays but you start from zero."}
            </Text>
            <Text variant="subtle" color="textMuted">
              {t("dataWizard.full.retained")}
            </Text>
            <Text variant="subtle" color="danger">
              {locale === "ko"
                ? "이 작업은 되돌릴 수 없어요. 필요한 내용은 먼저 내보내기로 챙겨두세요."
                : "This cannot be undone. Export anything you need first."}
            </Text>
            <Text variant="subtle" color="textMuted">
              {locale === "ko" ? `진행하려면 "${CONFIRM_PHRASE}" 라고 입력하세요.` : `To proceed, type "${CONFIRM_PHRASE}" below.`}
            </Text>
            <Input
              value={fullDeleteConfirm}
              onChangeText={setFullDeleteConfirm}
              placeholder={CONFIRM_PHRASE}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel={t("actions.fullWipeInputLabel", { phrase: CONFIRM_PHRASE })}
            />
            <Button
              label={locale === "ko" ? "전체 데이터 삭제" : "Delete everything"}
              accessibilityHint={t("actions.fullWipeHint")}
              variant="danger"
              disabled={fullDeleteConfirm !== CONFIRM_PHRASE || busy !== null}
              loading={busy === "full"}
              onPress={() =>
                confirm(
                  locale === "ko" ? "마지막 확인: 모든 데이터가 사라집니다. 익스포트는 미리 받으셨나요?" : "Final check: everything will be gone. Did you export first?",
                  () => runFullWipe(),
                )
              }
            />
          </View>
          ) : null}
        </DisclosureSection>

        <View style={styles.actions}>
          <Button
            label={locale === "ko" ? "로그아웃" : "Sign out"}
            accessibilityHint={t("actions.signOutHint")}
            variant="secondary"
            disabled={busy !== null}
            onPress={async () => {
              try {
                await signOut();
                // Go straight to /sign-in. Routing via "/" could briefly render
                // with a stale session before the SIGNED_OUT event lands.
                router.replace("/sign-in");
              } catch (e) {
                showActionError(
                  "signOut",
                  e,
                  locale === "ko" ? "로그아웃하지 못했어요" : "Couldn't sign out",
                  locale === "ko"
                    ? "로그아웃 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요."
                    : "Something went wrong while signing out. Please try again in a moment.",
                );
              }
            }}
          />
        </View>
      </ScrollView>
</KeyboardAvoidingView>
      {toast ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <PremiumToast message={toast.message} tone={toast.tone} />
        </View>
      ) : null}
      <PremiumModal
        visible={pendingConfirm !== null}
        onClose={() => setPendingConfirm(null)}
        accessibilityLabel={t("modals.confirm.label")}
      >
        <Text variant="heading">{t("modals.confirm.title")}</Text>
        <Text variant="body" color="textMuted" style={styles.modalBody}>
          {pendingConfirm?.message}
        </Text>
        <View style={styles.modalActions}>
          <Button
            label={t("modals.confirm.cancel")}
            variant="secondary"
            onPress={() => setPendingConfirm(null)}
            style={styles.modalButton}
            accessibilityHint={t("modals.confirm.cancelHint")}
          />
          <Button
            label={t("modals.confirm.delete")}
            variant="danger"
            onPress={runPendingConfirm}
            loading={busy !== null}
            style={styles.modalButton}
            accessibilityHint={t("modals.confirm.deleteHint")}
          />
        </View>
      </PremiumModal>
      <PremiumModal
        visible={actionError !== null}
        onClose={() => setActionError(null)}
        accessibilityLabel={t("modals.feedback.label")}
      >
        <Text variant="heading">{actionError?.title}</Text>
        <Text variant="body" color="textMuted" style={styles.modalBody}>
          {actionError?.body}
        </Text>
        <View style={styles.modalActions}>
          <Button
            label={t("modals.feedback.dismiss")}
            variant="secondary"
            onPress={() => setActionError(null)}
            style={styles.modalButton}
            accessibilityHint={t("modals.feedback.dismissHint")}
          />
          {actionError?.retry ? (
            <Button
              label={t("modals.feedback.retry")}
              variant="primary"
              onPress={retryActionError}
              loading={busy !== null}
              style={styles.modalButton}
              accessibilityHint={t("modals.feedback.retryHint")}
            />
          ) : null}
        </View>
      </PremiumModal>
    </View>
  );
}

const styles = StyleSheet.create({
  // Deep-space shell (replaces the legacy PremiumAppShell light cosmic body).
  screen: { flex: 1, backgroundColor: deepSpace.bg },
  glow: { position: "absolute", top: 0, left: 0, right: 0, height: 200, backgroundColor: deepSpace.bgGlow },
  center: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: spacing.lg },
  header: { gap: spacing.xs, marginBottom: spacing.md },
  title: { fontSize: 20, color: deepSpace.textHi, marginBottom: spacing.xs },
  section: {
    backgroundColor: deepSpace.card,
    borderColor: deepSpace.cardLine,
    borderWidth: 1,
    borderRadius: deepSpaceRadii.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionEyebrow: { letterSpacing: 0, fontWeight: "700" },
  disclosureHeader: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  disclosureHeaderPressed: {
    opacity: 0.78,
  },
  disclosureIndicator: {
    minWidth: 24,
    textAlign: "right",
    fontWeight: "800",
  },
  disclosureBody: {
    gap: spacing.sm,
  },
  destructiveGroup: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: deepSpace.cardLine,
  },
  deleteWizardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  deleteWizardOption: {
    flexGrow: 1,
    flexBasis: "47%",
    minWidth: 148,
  },
  busyBanner: {
    backgroundColor: deepSpace.card,
    borderColor: deepSpace.cardLine,
    borderWidth: 1,
    borderRadius: deepSpaceRadii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  settingsButton: {
    minHeight: 48,
    borderRadius: deepSpaceRadii.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  settingsButtonFull: {
    alignSelf: "stretch",
    width: "100%",
  },
  settingsButtonPressable: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  settingsButtonPrimary: {
    backgroundColor: deepSpace.mint,
    borderColor: deepSpace.mint,
  },
  settingsButtonSecondary: {
    backgroundColor: deepSpace.card,
    borderColor: deepSpace.cardLineStrong,
  },
  settingsButtonDanger: {
    backgroundColor: semantic.zoneRed,
    borderColor: semantic.zoneRed,
  },
  settingsButtonDisabled: {
    backgroundColor: withAlpha(deepSpace.text, 0.08),
    borderColor: deepSpace.cardLine,
  },
  settingsButtonPressed: {
    opacity: 0.78,
  },
  settingsButtonLabel: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "center",
    fontFamily: fontFamilies.pixelKo,
  },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  toastWrap: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.xl, alignItems: "stretch" },
  modalBody: { lineHeight: 21 },
  modalActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  modalButton: { flex: 1 },
  crewRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
});