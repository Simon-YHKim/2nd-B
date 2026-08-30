// 내 생활 정보 — 프로필 상세 입력 (Simon 2026-08-18, D2).
//
// 일곱 번째 별이 프로필로 확정되면서 "채운 만큼 밝아지는" 별이 됐는데, 채울
// 칸이 이름과 생일뿐이었다. 이 화면이 그 눈금을 만든다.
//
// 화면 규칙 두 가지를 지킨다:
//   - 전부 선택 입력이다. 비워도 저장되고 앱은 그대로 동작한다.
//   - 왜 묻는지를 항목마다 한 줄로 말한다. 이유 없이 묻는 칸이 하나라도 있으면
//     이 화면은 설문지가 되고, 사용자는 답할 이유가 없다.
//
// ⚠ 민감정보는 여기서 묻지 않는다(PIPA 제23조). 근거는
// `lib/persona/profile-details.ts` 헤더와 0132 마이그레이션 주석에 있다.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Redirect, router, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { Field, MdButton, MdChip } from "@/components/m3";
import { PixelSurface } from "@/components/pixel";
import { Text } from "@/components/ui/Text";
import { PremiumLoadingState, PremiumToast } from "@/components/premium";
import { useAuth } from "@/lib/auth/AuthContext";
import { deepSpace, deepSpaceSpacing } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { useKeyboard } from "@/lib/ui/useKeyboard";
import {
  PROFILE_DETAIL_FIELDS,
  PROFILE_DETAIL_TOTAL,
  countFilledDetails,
  type ProfileDetailKey,
  type ProfileDetails,
} from "@/lib/persona/profile-details";
import { fetchProfileDetails, saveProfileDetails } from "@/lib/supabase/profile-details";

/** 선택지 값 -> 로케일 키. 값 자체를 화면에 보여주면 안 되므로 표로 잇는다. */
const CHOICE_LABEL: Readonly<Record<string, string>> = {
  morning: "rhythmMorning",
  evening: "rhythmEvening",
  flexible: "rhythmFlexible",
  irregular: "rhythmIrregular",
  dawn: "hoursDawn",
  afternoon: "hoursAfternoon",
  night: "hoursNight",
  varies: "hoursVaries",
  weekdays: "daysWeekdays",
  weekends: "daysWeekends",
  shift: "daysShift",
};

/**
 * `morning` 이 하루 리듬과 근무 시간대 양쪽에 있어서 키가 겹친다. 필드별로
 * 접두사를 붙여 각자의 라벨을 찾는다 - 표 하나로 뭉개면 "오전" 과 "아침형" 이
 * 같은 말이 된다.
 */
function choiceLabelKey(field: ProfileDetailKey, value: string): string {
  if (field === "workHours") {
    const map: Record<string, string> = {
      dawn: "hoursDawn",
      morning: "hoursMorning",
      afternoon: "hoursAfternoon",
      evening: "hoursEvening",
      night: "hoursNight",
      varies: "hoursVaries",
    };
    return map[value] ?? value;
  }
  if (field === "workDays") {
    const map: Record<string, string> = {
      weekdays: "daysWeekdays",
      weekends: "daysWeekends",
      shift: "daysShift",
      varies: "daysVaries",
    };
    return map[value] ?? value;
  }
  return CHOICE_LABEL[value] ?? value;
}

export default function ProfileDetailsScreen() {
  const { t } = useTranslation(["deepspace", "common"]);
  const {
    userId,
    hasProfile,
    profileProbeFailed,
    loading: authLoading,
    refresh: refreshAuth,
  } = useAuth();
  const [details, setDetails] = useState<ProfileDetails>({});
  const [loadState, setLoadState] = useState<{
    userId: string | null;
    status: "idle" | "loading" | "ready" | "error";
  }>({ userId: null, status: "idle" });
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "danger" } | null>(null);
  const regionRef = useRef<TextInput>(null);
  const householdRef = useRef<TextInput>(null);
  const activeUserIdRef = useRef(userId);
  const saveOperationRef = useRef(0);
  const kbHeight = useKeyboard();
  activeUserIdRef.current = userId;

  // 상단 취소와 Android 하드웨어 뒤로가기는 같은 한 경로를 쓴다. 스택 없이
  // 딥링크로 들어온 경우에도 앱을 종료하지 않고 프로필 허브로 돌아간다.
  const onCancel = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/profile");
  }, []);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        onCancel();
        return true;
      });
      return () => sub.remove();
    }, [onCancel]),
  );

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    // Never show one account's values under another account while the next
    // request is in flight. The user id travels with the load state, and Save
    // stays closed until that exact user's read succeeds.
    saveOperationRef.current += 1;
    setSaving(false);
    setDetails({});
    setToast(null);
    setLoadState({ userId, status: "loading" });
    void fetchProfileDetails(userId)
      .then((d) => {
        if (!alive) return;
        setDetails(d);
        setLoadState({ userId, status: "ready" });
      })
      .catch(() => {
        if (!alive) return;
        setDetails({});
        setLoadState({ userId, status: "error" });
      });
    return () => {
      alive = false;
    };
  }, [userId, reloadKey]);

  const filled = useMemo(() => countFilledDetails(details), [details]);
  const readyForUser = loadState.userId === userId && loadState.status === "ready";

  const set = useCallback((key: ProfileDetailKey, value: string) => {
    setDetails((prev) => ({ ...prev, [key]: value }));
  }, []);

  const onSave = useCallback(async () => {
    if (!userId || !readyForUser || saving) return;
    const saveUserId = userId;
    const operation = ++saveOperationRef.current;
    const isCurrentOperation = () =>
      saveOperationRef.current === operation && activeUserIdRef.current === saveUserId;
    setSaving(true);
    try {
      await saveProfileDetails(saveUserId, details);
      if (!isCurrentOperation()) return;
      setToast({ message: t("deepspace:profileDetails.saved"), tone: "success" });
    } catch {
      if (!isCurrentOperation()) return;
      setToast({ message: t("deepspace:profileDetails.saveError"), tone: "danger" });
    } finally {
      if (isCurrentOperation()) setSaving(false);
    }
  }, [userId, readyForUser, details, saving, t]);

  const title = t("deepspace:profileDetails.screenTitle");

  // ⚠ authLoading 을 **먼저** 본다. 순서가 이 화면의 버그였다.
  //
  // 처음엔 `!userId -> /sign-in` 을 맨 앞에 뒀는데, 인증이 해석되는 짧은 창에는
  // userId 가 null 이라 로그인한 사용자도 /sign-in 으로 튕겼다. 그러면 sign-in 이
  // "이미 세션이 있네" 하고 다시 밀어내고, 결국 홈 → 온보딩까지 갔다. 이 화면만
  // 온보딩으로 새던 이유가 이것이고, 실제 브라우저로 열어 보고서야 드러났다
  // (테스트는 소스만 읽어서 전부 초록이었다).
  //
  // career-input 같은 이웃 화면들이 loading 을 먼저 보는 이유가 같다.
  if (authLoading) {
    return (
      <DeepSpaceScreen
        active="lens"
        header="none"
        variant="museumLike"
        title={title}
        onBack={onCancel}
      >
        <View style={styles.center}>
          <PremiumLoadingState message={title} />
        </View>
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;
  // A failed profile probe must not send an existing user through profile setup.
  // AuthContext re-probes while we keep the screen neutral. A confirmed missing
  // profile, however, has a real recovery destination and must not spin forever.
  if (hasProfile === false && profileProbeFailed) {
    return (
      <DeepSpaceScreen
        active="lens"
        header="none"
        variant="museumLike"
        title={title}
        onBack={onCancel}
      >
        <View style={styles.loadError} accessibilityRole="alert">
          <Text style={styles.loadErrorText}>{t("common:errors.network")}</Text>
          <MdButton
            variant="filled"
            label={t("common:actions.retry")}
            onPress={() => void refreshAuth()}
          />
        </View>
      </DeepSpaceScreen>
    );
  }
  if (hasProfile === false) return <Redirect href="/complete-profile" />;
  if (hasProfile !== true) {
    return (
      <DeepSpaceScreen
        active="lens"
        header="none"
        variant="museumLike"
        title={title}
        onBack={onCancel}
      >
        <View style={styles.center}>
          <PremiumLoadingState message={title} />
        </View>
      </DeepSpaceScreen>
    );
  }
  const currentLoadStatus = loadState.userId === userId ? loadState.status : "loading";
  if (currentLoadStatus === "error") {
    return (
      <DeepSpaceScreen
        active="lens"
        header="none"
        variant="museumLike"
        title={title}
        onBack={onCancel}
      >
        <View style={styles.loadError} accessibilityRole="alert">
          <Text style={styles.loadErrorText}>{t("common:errors.network")}</Text>
          <MdButton
            variant="filled"
            label={t("common:actions.retry")}
            onPress={() => setReloadKey((key) => key + 1)}
          />
        </View>
      </DeepSpaceScreen>
    );
  }
  if (currentLoadStatus !== "ready") {
    return (
      <DeepSpaceScreen
        active="lens"
        header="none"
        variant="museumLike"
        title={title}
        onBack={onCancel}
      >
        <View style={styles.center}>
          <PremiumLoadingState message={title} />
        </View>
      </DeepSpaceScreen>
    );
  }

  return (
    <DeepSpaceScreen
      active="lens"
      header="none"
      variant="museumLike"
      title={title}
      onBack={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.fill}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            Platform.OS === "android" && {
              paddingBottom: Math.max(deepSpaceSpacing.xl, kbHeight + deepSpaceSpacing.lg),
            },
          ]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          {/* profilesetup의 inset+진행 레일 패턴만 파생한다. 아바타·핸들·목업
              진행률은 만들지 않고 실제 생활정보 7칸만 센다. */}
          <PixelSurface
            variant="inset"
            style={styles.summarySurface}
            contentStyle={styles.summaryContent}
          >
            <Text style={styles.intro}>{t("deepspace:profileDetails.intro")}</Text>
            <View style={styles.progressRow}>
                  <View
                    accessible
                    accessibilityRole="progressbar"
                    accessibilityLabel={title}
                    accessibilityValue={{
                      text: t("deepspace:profileDetails.progress", {
                        filled,
                        total: PROFILE_DETAIL_TOTAL,
                      }),
                    }}
                style={styles.progressTrack}
              >
                {PROFILE_DETAIL_FIELDS.map((field) => (
                  <View
                    key={field.key}
                    style={[
                      styles.progressCell,
                      details[field.key]?.trim() ? styles.progressCellDone : null,
                    ]}
                  />
                ))}
              </View>
              <Text
                accessible={false}
                accessibilityElementsHidden
                importantForAccessibility="no"
                style={styles.progress}
              >
                {t("deepspace:profileDetails.progress", { filled, total: PROFILE_DETAIL_TOTAL })}
              </Text>
            </View>
            {/* 무엇을 안 묻는지도 말해 준다. 안 묻는다는 사실은 물어보는 것만큼 중요하다. */}
            <Text style={styles.notSensitive}>{t("deepspace:profileDetails.notSensitive")}</Text>
          </PixelSurface>

          {PROFILE_DETAIL_FIELDS.map((field) => {
            const value = details[field.key] ?? "";
            return (
              <PixelSurface
                key={field.key}
                variant="frame"
                style={styles.fieldSurface}
                contentStyle={styles.fieldContent}
              >
                <Text style={styles.label}>{t(`deepspace:profileDetails.${field.key}Label`)}</Text>
                <Text style={styles.hint}>{t(`deepspace:profileDetails.${field.key}Hint`)}</Text>
                {field.kind === "text" ? (
                  <Field
                    ref={
                      field.key === "region"
                        ? regionRef
                        : field.key === "household"
                          ? householdRef
                          : undefined
                    }
                    value={value}
                    onChangeText={(v) => set(field.key, v)}
                    maxLength={field.maxLen}
                    editable={!saving}
                    returnKeyType={
                      field.key === "occupation" || field.key === "region" ? "next" : "done"
                    }
                    blurOnSubmit={field.key !== "occupation" && field.key !== "region"}
                    onSubmitEditing={() => {
                      if (field.key === "occupation") regionRef.current?.focus();
                      if (field.key === "region") householdRef.current?.focus();
                    }}
                    textAlignVertical="center"
                    accessibilityLabel={t(`deepspace:profileDetails.${field.key}Label`)}
                  />
                ) : (
                  <View style={styles.choices}>
                    {(field.choices ?? []).map((choice) => (
                      <MdChip
                        key={choice}
                        kind="filter"
                        label={t(`deepspace:profileDetails.${choiceLabelKey(field.key, choice)}`)}
                        selected={value === choice}
                        // 같은 칩을 다시 누르면 해제된다. 한 번 고르면 못 무르는
                        // 선택지는 "선택 입력" 이 아니다. 저장 중에는 핸들러 자체를
                        // 빼서 터치·키보드·접근성 활성화가 새 스냅샷을 만들지 못한다.
                        onPress={
                          saving ? undefined : () => set(field.key, value === choice ? "" : choice)
                        }
                      />
                    ))}
                  </View>
                )}
              </PixelSurface>
            );
          })}

          <MdButton
            variant="filled"
            label={t("deepspace:profileDetails.save")}
            loading={saving}
            disabled={!readyForUser || saving}
            onPress={() => void onSave()}
            style={styles.saveButton}
          />
        </ScrollView>
      </KeyboardAvoidingView>
      {toast ? <PremiumToast message={toast.message} tone={toast.tone} /> : null}
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadError: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s6,
    padding: deepSpaceSpacing.lg,
  },
  loadErrorText: {
    color: m3.color.onBackground,
    fontSize: m3.type.bodyLarge.size,
    lineHeight: m3.type.bodyLarge.line,
    paddingBottom: m3.spacing.s1,
    textAlign: "center",
  },
  content: {
    padding: deepSpaceSpacing.lg,
    gap: deepSpaceSpacing.md,
    paddingBottom: deepSpaceSpacing.xl,
    ...(Platform.OS === "web"
      ? { width: "100%" as const, maxWidth: 520, alignSelf: "center" as const }
      : {}),
  },
  summarySurface: { alignSelf: "stretch" },
  summaryContent: { gap: deepSpaceSpacing.sm, padding: deepSpaceSpacing.md },
  intro: {
    fontSize: m3.type.bodyLarge.size,
    lineHeight: m3.type.bodyLarge.line,
    paddingBottom: m3.spacing.s1,
    color: deepSpace.textHi,
  },
  progressRow: { flexDirection: "row", alignItems: "center", gap: deepSpaceSpacing.sm },
  progressTrack: {
    flex: 1,
    height: m3.spacing.s4,
    flexDirection: "row",
    gap: m3.spacing.s1,
    padding: m3.spacing.s1,
    backgroundColor: m3.color.surface,
  },
  progressCell: { flex: 1, backgroundColor: deepSpace.cardLine },
  progressCellDone: { backgroundColor: m3.color.primary },
  progress: {
    flexShrink: 0,
    fontSize: m3.type.bodySmall.size,
    lineHeight: m3.type.bodySmall.line,
    paddingBottom: m3.spacing.s1,
    color: deepSpace.accentSoft,
  },
  notSensitive: {
    fontSize: m3.type.bodySmall.size,
    lineHeight: m3.type.bodySmall.line,
    paddingBottom: m3.spacing.s1,
    color: deepSpace.textLo,
  },
  fieldSurface: { alignSelf: "stretch" },
  fieldContent: { gap: m3.spacing.s2, padding: deepSpaceSpacing.md },
  label: {
    fontSize: m3.type.bodyLarge.size,
    lineHeight: m3.type.bodyLarge.line,
    paddingBottom: m3.spacing.s1,
    color: deepSpace.textHi,
  },
  hint: {
    fontSize: m3.type.bodyMedium.size,
    lineHeight: m3.type.bodyMedium.line,
    paddingBottom: m3.spacing.s1,
    color: deepSpace.textLo,
  },
  choices: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: m3.spacing.s2,
    marginTop: m3.spacing.s1,
  },
  saveButton: { alignSelf: "stretch", width: "100%" },
});
