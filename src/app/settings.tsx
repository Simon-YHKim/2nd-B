// Settings screen — primarily the "Danger zone" for data deletion.
// Three modes per user requirement: select-only (handled inline on
// /journal etc.), partial (per-kind / per-tag), and full (everything).

import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle, KeyboardAvoidingView, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumAppShell, PremiumLoadingState, PremiumModal, PremiumToast, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { signOut } from "@/lib/supabase/auth";
import { useTheme } from "@/lib/theme/ThemeContext";
import { useCrewDensity, CREW_DENSITY_ORDER, type CrewDensity } from "@/lib/settings/crew-density";
import { VILLAGE_UI } from "@/lib/village-ui";
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

const CREW_DENSITY_LABEL: Record<"en" | "ko", Record<CrewDensity, string>> = {
  en: { none: "None", few: "Few", some: "Some", many: "Many" },
  ko: { none: "없음", few: "적게", some: "보통", many: "많이" },
};

type SettingsActionButtonProps = {
  label: string;
  accessibilityHint?: string;
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
  accessibilityHint,
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
    ? "rgba(232,236,248,0.58)"
    : variant === "primary"
      ? cosmic.space950
      : variant === "danger"
        ? cosmic.guardRose
        : cosmic.moonWhite;

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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: isDisabled, busy: loading, selected }}
        disabled={isDisabled}
        onPress={onPress ? () => void onPress() : undefined}
        style={({ pressed }) => [
          styles.settingsButtonPressable,
          pressed ? styles.settingsButtonPressed : null,
        ]}
      >
        {loading ? <ActivityIndicator size="small" color={labelColor} /> : null}
        <Text style={[styles.settingsButtonLabel, { color: labelColor }]}>{label}</Text>
      </Pressable>
    </View>
  );
}

function Button(props: SettingsActionButtonProps) {
  return <SettingsActionButton {...props} />;
}

export default function Settings() {
  const { t, i18n } = useTranslation("settings");
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const { mode, toggle } = useTheme();
  const { density: crewDensity, setDensity: setCrewDensity } = useCrewDensity();

  const [busy, setBusy] = useState<string | null>(null);
  const [fullDeleteConfirm, setFullDeleteConfirm] = useState("");
  const [toast, setToast] = useState<SettingsToast | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  const [actionError, setActionError] = useState<ActionError>(null);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timeout);
  }, [toast]);

  if (loading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={t("loading")} />
        </View>
      </PremiumAppShell>
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
    <PremiumAppShell>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
<ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <SceneHero
          eyebrow={locale === "ko" ? "08. 설정" : "08. Settings"}
          title={locale === "ko" ? "설정을 정리해요" : "Tune your settings"}
          subtitle={
            locale === "ko"
              ? "테마 · 데이터 · 프로필 · 지원"
              : "Theme · data · profile · support"
          }
          island={VILLAGE_UI.relation.island}
          worker={VILLAGE_UI.relation.worker}
          accent={VILLAGE_UI.relation.accent}
          speech={
            locale === "ko"
              ? "삭제는 되돌릴 수 없어요. 필요한 조각은 먼저 내보내기로 챙겨두세요."
              : "Deletion cannot be undone. Export anything you need before clearing data."
          }        />

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

        <View style={[styles.section, { borderLeftColor: cosmic.soulViolet }]}>
          <Text variant="caption" color="textMuted" style={styles.sectionEyebrow}>
            {t("nav.eyebrow")}
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

        <View style={[styles.section, { borderLeftColor: semantic.brand }]}>
          <Text variant="caption" color="brand" style={styles.sectionEyebrow}>
            {locale === "ko" ? "테마 (빠른 전환)" : "Theme (quick toggle)"}
          </Text>
          <Text variant="subtle" color="textMuted">
            {locale === "ko"
              ? "메인 화면의 어두운 하늘 톤이 기본. 밝은 톤도 시도해 보세요."
              : "Defaults to the loader's dark-sky tone. Light is also available."}
          </Text>
          <View style={styles.themeRow}>
            <Button
              label={locale === "ko" ? "다크" : "Dark"}
              accessibilityHint={locale === "ko" ? "이 기기에 다크 테마를 적용합니다." : "Applies dark theme on this device."}
              variant={mode === "dark" ? "primary" : "secondary"}
              selected={mode === "dark"}
              onPress={() => { if (mode !== "dark") toggle(); }}
              style={styles.themeButton}
            />
            <Button
              label={locale === "ko" ? "라이트" : "Light"}
              accessibilityHint={locale === "ko" ? "이 기기에 라이트 테마를 적용합니다." : "Applies light theme on this device."}
              variant={mode === "light" ? "primary" : "secondary"}
              selected={mode === "light"}
              onPress={() => { if (mode !== "light") toggle(); }}
              style={styles.themeButton}
            />
          </View>
        </View>

        <View style={[styles.section, { borderLeftColor: semantic.brand }]}>
          <Text variant="caption" color="brand" style={styles.sectionEyebrow}>
            {locale === "ko" ? "그래프 크루 (장식 로봇)" : "Graph crew (decorative)"}
          </Text>
          <Text variant="subtle" color="textMuted">
            {locale === "ko"
              ? "기록 보관소 크루가 그래프를 돌아다니는 양. 노드 수에 비례하며, 없음~많이로 조절하거나 완전히 끌 수 있어요."
              : "How many records-crew sprites wander the graph. Scales with your node count; set anywhere from none to many."}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
            {CREW_DENSITY_ORDER.map((d) => (
              <Button
                key={d}
                label={CREW_DENSITY_LABEL[locale][d]}
                accessibilityHint={
                  locale === "ko"
                    ? `장식 그래프 크루 밀도를 ${CREW_DENSITY_LABEL[locale][d]}로 설정합니다.`
                    : `Sets decorative graph crew density to ${CREW_DENSITY_LABEL.en[d]}.`
                }
                variant={crewDensity === d ? "primary" : "secondary"}
                selected={crewDensity === d}
                onPress={() => setCrewDensity(d)}
                full={false}
              />
            ))}
          </View>
        </View>

        <View style={[styles.section, { borderLeftColor: semantic.warning }]}>
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
            accessibilityHint={
              locale === "ko"
                ? "모든 일기를 삭제하기 전에 확인 대화상자를 엽니다."
                : "Opens a confirmation before deleting every journal entry."
            }
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
            accessibilityHint={
              locale === "ko"
                ? "모든 노트를 삭제하기 전에 확인 대화상자를 엽니다."
                : "Opens a confirmation before deleting every note."
            }
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
            accessibilityHint={
              locale === "ko"
                ? "모든 과거의 나 응답을 삭제하기 전에 확인 대화상자를 엽니다."
                : "Opens a confirmation before deleting every audit response."
            }
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

        <View style={[styles.section, { borderLeftColor: semantic.warning }]}>
          <Text variant="caption" color="warning" style={styles.sectionEyebrow}>
            {locale === "ko" ? "부분 삭제: 평가 결과" : "Partial: by assessment"}
          </Text>
          <Button
            label={locale === "ko" ? "Big Five (BFI-44) 결과 삭제" : "Delete Big Five (BFI-44) results"}
            accessibilityHint={
              locale === "ko"
                ? "저장된 Big Five 결과를 삭제하기 전에 확인 대화상자를 엽니다."
                : "Opens a confirmation before deleting saved Big Five results."
            }
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
            accessibilityHint={
              locale === "ko"
                ? "저장된 애착 결과를 삭제하기 전에 확인 대화상자를 엽니다."
                : "Opens a confirmation before deleting saved Attachment results."
            }
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
            accessibilityHint={
              locale === "ko"
                ? "저장된 MBTI 참고 결과를 삭제하기 전에 확인 대화상자를 엽니다."
                : "Opens a confirmation before deleting saved MBTI reference results."
            }
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

        <View style={[styles.section, { borderLeftColor: semantic.warning }]}>
          <Text variant="caption" color="warning" style={styles.sectionEyebrow}>
            {locale === "ko" ? "부분 삭제: 위키/캡처/사용량" : "Partial: wiki / captures / usage"}
          </Text>
          <Button
            label={locale === "ko" ? "모든 위키 페이지 삭제" : "Delete all wiki pages"}
            accessibilityHint={
              locale === "ko"
                ? "모든 위키 페이지를 삭제하기 전에 확인 대화상자를 엽니다."
                : "Opens a confirmation before deleting every wiki page."
            }
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
            accessibilityHint={
              locale === "ko"
                ? "아직 위키로 발전시키지 않은 캡처를 삭제하기 전에 확인 대화상자를 엽니다."
                : "Opens a confirmation before deleting captures not yet promoted to wiki."
            }
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
            accessibilityHint={
              locale === "ko"
                ? "일일 사용량 카운터를 리셋하기 전에 확인 대화상자를 엽니다."
                : "Opens a confirmation before resetting daily usage counters."
            }
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

        <View style={[styles.section, { borderLeftColor: semantic.danger }]}>
          <Text variant="caption" color="danger" style={styles.sectionEyebrow}>
            {locale === "ko" ? "위험: 전체 삭제" : "Danger: full wipe"}
          </Text>
          <Text variant="subtle" color="textMuted">
            {locale === "ko"
              ? "기록 · 캡처 · 위키 페이지 · 세컨비 사용량을 한 번에 모두 삭제합니다. 계정은 유지되지만 0부터 다시 시작합니다."
              : "Wipes records, sources, wiki pages, and SecondB usage in one shot. The account stays but you start from zero."}
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
            accessibilityLabel={
              locale === "ko"
                ? `전체 삭제 확인. ${CONFIRM_PHRASE}를 입력하면 삭제 버튼이 켜집니다.`
                : `Full wipe confirmation. Type ${CONFIRM_PHRASE} to enable the delete button.`
            }
          />
          <Button
            label={locale === "ko" ? "전체 데이터 삭제" : "Delete everything"}
            accessibilityHint={
              locale === "ko"
                ? "기록, 캡처, 위키 페이지, 사용량을 모두 삭제하기 전에 DELETE 입력과 확인이 필요합니다."
                : "Requires typed DELETE confirmation before wiping records, sources, wiki pages, and usage."
            }
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
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
  scroll: { paddingBottom: spacing.xl, gap: spacing.lg },
  header: { gap: spacing.xs, marginBottom: spacing.md },
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
  sectionEyebrow: { letterSpacing: 0, fontWeight: "700" },
  busyBanner: {
    backgroundColor: semantic.surfaceAlt,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  settingsButton: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    elevation: 1,
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
    backgroundColor: cosmic.signalMint,
    borderColor: cosmic.signalMint,
  },
  settingsButtonSecondary: {
    backgroundColor: cosmic.space700,
    borderColor: "rgba(141,152,184,0.56)",
  },
  settingsButtonDanger: {
    backgroundColor: "rgba(255,122,144,0.22)",
    borderColor: cosmic.guardRose,
  },
  settingsButtonDisabled: {
    backgroundColor: "rgba(141,152,184,0.12)",
    borderColor: "rgba(141,152,184,0.28)",
    elevation: 0,
  },
  settingsButtonPressed: {
    opacity: 0.78,
  },
  settingsButtonLabel: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "center",
  },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  toastWrap: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.xl, alignItems: "stretch" },
  modalBody: { lineHeight: 21 },
  modalActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  modalButton: { flex: 1 },
  themeRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  themeButton: {
    flex: 1,
    minHeight: 48,
    backgroundColor: cosmic.space700,
    borderColor: "rgba(141,152,184,0.56)",
  },
});
