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
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingArea } from "@/lib/ui/keyboard";
import { Redirect, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";

import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { Field, MdButton, MdChip } from "@/components/m3";
import { PixelSurface } from "@/components/pixel";
import { Text } from "@/components/ui/Text";
import { PremiumLoadingState, PremiumToast } from "@/components/premium";
import { useAuth } from "@/lib/auth/AuthContext";
import { DEFAULT_AVATAR_SPEC, type AvatarSpec } from "@/lib/avatar";
import { fetchAvatarSpec } from "@/lib/supabase/avatar-spec";
import { useAppRouter, useHardwareBack } from "@/lib/nav/phone-embed";
import { deepSpace, deepSpaceSpacing } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { useKeyboard } from "@/lib/ui/useKeyboard";
import { invalidateProfileStarLevel } from "@/lib/persona/load-profile-star";
import {
  PROFILE_DETAIL_FIELDS,
  type ProfileDetailKey,
  type ProfileDetails,
  profileChoiceLabelKey,
} from "@/lib/persona/profile-details";
import { fetchProfileDetails, saveProfileDetails } from "@/lib/supabase/profile-details";
import {
  DISPLAY_NAME_MAX_LENGTH,
  fetchDisplayName,
  saveDisplayName,
} from "@/lib/supabase/display-name";
import { loadProfileIdentity } from "@/screens/deepspace/dds-profile-identity";

export default function ProfileDetailsScreen() {
  // Phone-aware: inside the dashboard phone, cancel steps the phone's stack.
  const router = useAppRouter();
  const { t } = useTranslation(["deepspace", "common", "profile"]);
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
  const [displayName, setDisplayName] = useState("");
  const [nameLoadState, setNameLoadState] = useState<{
    userId: string | null;
    status: "idle" | "loading" | "ready" | "error";
  }>({ userId: null, status: "idle" });
  const [nameReloadKey, setNameReloadKey] = useState(0);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "danger" } | null>(null);
  const regionRef = useRef<TextInput>(null);
  const householdRef = useRef<TextInput>(null);
  const activeUserIdRef = useRef(userId);
  const saveOperationRef = useRef(0);
  // 마지막으로 읽었거나 저장한 이름. 저장 버튼은 이름이 이것과 다를 때만 이름도 쓴다.
  const savedNameRef = useRef("");
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
  }, [router]);

  // Through the phone's claim stack inside the dashboard phone (see useHardwareBack).
  useHardwareBack(
    useCallback(() => {
      onCancel();
      return true;
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

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    savedNameRef.current = "";
    setDisplayName("");
    setNameLoadState({ userId, status: "loading" });
    void fetchDisplayName(userId)
      .then(async (name) => {
        // 저장된 이름이 없으면 앱이 지금 이름으로 보여 주는 값(/profile 과 같은 규칙: 로그인
        // 이메일 앞부분)을 칸에 미리 채운다(Simon 2026-10-07). 기준값도 그 값이라 사용자가
        // 고치지 않으면 저장하지 않는다 - 이메일 앞부분이 저절로 이름으로 굳지 않게.
        const shown = name?.trim() ? name : await loadProfileIdentity(userId).catch(() => null);
        if (!alive) return;
        savedNameRef.current = shown ?? "";
        setDisplayName(shown ?? "");
        setNameLoadState({ userId, status: "ready" });
      })
      .catch(() => {
        if (!alive) return;
        setDisplayName("");
        setNameLoadState({ userId, status: "error" });
      });
    return () => { alive = false; };
  }, [userId, nameReloadKey]);

  // 아바타 초상화(Simon 2026-10-07). 저장된 것이 없거나 못 읽으면 기본 아바타를 그린다 -
  // 그림일 뿐이라 이 화면의 저장을 막지 않는다. 스튜디오에서 돌아오면 다시 읽는다.
  const [avatar, setAvatar] = useState<{ owner: string; spec: AvatarSpec } | null>(null);
  useFocusEffect(useCallback(() => {
    if (!userId) return;
    let alive = true;
    void fetchAvatarSpec(userId).then(
      (spec) => { if (alive) setAvatar({ owner: userId, spec: spec ?? DEFAULT_AVATAR_SPEC }); },
      () => { if (alive) setAvatar({ owner: userId, spec: DEFAULT_AVATAR_SPEC }); },
    );
    return () => { alive = false; };
  }, [userId]));

  const readyForUser = loadState.userId === userId && loadState.status === "ready";
  const nameReadyForUser = nameLoadState.userId === userId && nameLoadState.status === "ready";

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
    // 이름 저장 버튼은 없어졌다(Simon 2026-10-07). 이름도 이 저장이 함께 한다 - 확인된 주인의
    // 이름을 읽었고(nameReadyForUser) 그 뒤 바뀐 경우에만. 읽기에 실패한 이름은 쓰지 않는다
    // (빈 값으로 덮어쓰지 않기 위해).
    let step: "details" | "name" = "details";
    try {
      await saveProfileDetails(saveUserId, details);
      if (!isCurrentOperation()) return;
      if (nameReadyForUser && displayName !== savedNameRef.current) {
        step = "name";
        const savedName = await saveDisplayName(saveUserId, displayName);
        if (!isCurrentOperation()) return;
        savedNameRef.current = savedName ?? "";
        setDisplayName(savedName ?? "");
      }
      invalidateProfileStarLevel(saveUserId);
      setToast({ message: t("deepspace:profileDetails.saved"), tone: "success" });
    } catch {
      if (!isCurrentOperation()) return;
      setToast({
        message: step === "name"
          ? t("deepspace:profileDetails.nameSaveError")
          : t("deepspace:profileDetails.saveError"),
        tone: "danger",
      });
    } finally {
      if (isCurrentOperation()) setSaving(false);
    }
  }, [userId, readyForUser, nameReadyForUser, details, displayName, saving, t]);

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
      <KeyboardAvoidingArea style={styles.fill}>
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
          <PixelSurface
            variant="frame"
            style={styles.fieldSurface}
            contentStyle={[styles.fieldContent, styles.avatarContent]}
          >
            {avatar?.owner === userId ? (
              <AvatarPreview spec={avatar.spec} size={128} />
            ) : (
              <View style={styles.avatarPlaceholder} />
            )}
            <MdButton
              variant="outlined"
              label={t("profile:avatarStudio.label")}
              onPress={() => router.push("/avatar-studio")}
              style={styles.saveButton}
            />
          </PixelSurface>

          <PixelSurface
            variant="frame"
            style={styles.fieldSurface}
            contentStyle={styles.fieldContent}
          >
            <Text style={styles.label}>{t("deepspace:profileDetails.nameLabel")}</Text>
            {nameLoadState.userId === userId && nameLoadState.status === "error" ? (
              <View style={styles.nameError} accessibilityRole="alert">
                <Text style={styles.nameErrorText}>
                  {t("deepspace:profileDetails.nameLoadError")}
                </Text>
                <MdButton
                  variant="outlined"
                  label={t("common:actions.retry")}
                  onPress={() => setNameReloadKey((key) => key + 1)}
                />
              </View>
            ) : nameReadyForUser ? (
              <Field
                value={displayName}
                onChangeText={(value) => setDisplayName(value.slice(0, DISPLAY_NAME_MAX_LENGTH))}
                maxLength={DISPLAY_NAME_MAX_LENGTH}
                editable={!saving}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                accessibilityLabel={t("deepspace:profileDetails.nameLabel")}
              />
            ) : (
              <Text style={styles.hint}>{t("deepspace:profileDetails.nameLoading")}</Text>
            )}
          </PixelSurface>

          {/* 안내 · 진행 칸 · 민감정보 안내 상자는 Simon 이 걷어냈다(2026-10-07). 민감정보는 여전히
              묻지 않는다 - 항목 목록(PROFILE_DETAIL_FIELDS)에 없다. */}
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
                        style={styles.choiceChip}
                        label={t(`deepspace:profileDetails.${profileChoiceLabelKey(field.key, choice)}`)}
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
      </KeyboardAvoidingArea>
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
  fieldSurface: { alignSelf: "stretch" },
  fieldContent: { gap: m3.spacing.s2, padding: deepSpaceSpacing.md },
  avatarContent: { alignItems: "center" },
  avatarPlaceholder: { width: 128, height: 128 },
  nameError: { gap: m3.spacing.s2 },
  nameErrorText: { color: m3.color.error, lineHeight: m3.type.bodyMedium.line },
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
  // MdChip's 1px border on each side sits outside its semantic Pressable on
  // web. Reserve one spacing unit so one-character labels still expose 44px.
  choiceChip: { minWidth: m3.minTouch + m3.spacing.s1 },
  saveButton: { alignSelf: "stretch", width: "100%" },
});
