// dds-auth-screens: the deep-space reset-password screen + the shared auth shell,
// moved verbatim from DeepSpaceDesignScreens.tsx (P5 megafile split, tranche 1),
// and a re-export of the sign-in screen (dds-sign-in-screen). DeepSpaceDesignScreens
// re-exports them so every route import is unchanged.
//
// 2026-10-05: the unrouted sign-up copy that lived here (DeepSpaceSignUpDesignScreen
// + its consent block, provider row and toast) left the repo with the
// `EXPO_PUBLIC_UI=legacy` lever (Simon decision Q-261004-11). The /sign-up route
// renders dds-sign-up-screen.tsx; the copy is in E:/Legacy/2ndB (MANIFEST batch
// qa261004-lever) and git history.
import { useCallback, useEffect, useRef, type ReactNode, type Ref } from "react";
import { BackHandler, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { KeyboardAvoidingArea } from "@/lib/ui/keyboard";
import { router, useFocusEffect, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useGoHomeStop } from "@/lib/nav/go-home";
import { useTranslation } from "react-i18next";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { deepSpace, flattenAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { Text } from "@/components/ui/Text";
import { ddsStyles as styles } from "./dds-styles";
import { useResetPasswordForm } from "@/lib/auth/useResetPasswordForm";
import { useAuth } from "@/lib/auth/AuthContext";
import { InlineLoader } from "@/components/ui/InlineLoader";
import { ShareRefusedLine } from "@/components/capture/ShareRefusedLine";
import { PixelGateShell, PixelPressable, PixelSurface } from "@/components/pixel";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { m3TextStyle } from "@/components/m3/typeface";
import { useFontStyle } from "@/lib/settings/readable-font";

// Shared starfield, seeded as fractional positions so it scales to any viewport
// (mirrors DeepSpaceBackdrop). Static — no animation lock risk (ANDROID_QA).
const AUTH_STARS = [
  { x: 0.14, y: 0.07, r: 1.4, o: 0.5 },
  { x: 0.82, y: 0.11, r: 1.2, o: 0.42 },
  { x: 0.5, y: 0.2, r: 1.1, o: 0.3 },
  { x: 0.28, y: 0.52, r: 1.1, o: 0.3 },
  { x: 0.74, y: 0.46, r: 1, o: 0.26 },
  { x: 0.16, y: 0.78, r: 1, o: 0.24 },
] as const;

// Deep-space auth backdrop: top-center radial glow over the shared starfield,
// reproducing the canon `radial-gradient(120% 80% at 50% 0%, ...)` (sb-surfaces
// AuthScreen) with tokens only. The buttons float directly on this — no card.
function AuthBackdrop() {
  const { width, height } = useWindowDimensions();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="auth-top-glow" cx="50%" cy="0%" rx="120%" ry="78%">
            <Stop offset="0" stopColor={deepSpace.bgMid} stopOpacity="0.9" />
            <Stop offset="0.55" stopColor={deepSpace.bgMid} stopOpacity="0.28" />
            <Stop offset="0.78" stopColor={deepSpace.bgEdge} stopOpacity="1" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill={deepSpace.bgEdge} />
        <Rect x="0" y="0" width={width} height={height} fill="url(#auth-top-glow)" />
        {/* 별 — 원이 아니라 정수 rect 다(PIXEL-CLAY 규칙 1). 흐린 정도는
            `fillOpacity` 가 아니라 **미리 합성한 색**이 낸다(규칙 4). */}
        {AUTH_STARS.map((s, i) => {
          const size = s.r < 1.2 ? 2 : 3;
          return (
            <Rect
              key={i}
              x={Math.round(s.x * width - size / 2)}
              y={Math.round(s.y * height - size / 2)}
              width={size}
              height={size}
              fill={flattenAlpha(deepSpace.accentSoft, s.o, deepSpace.bgEdge)}
            />
          );
        })}
      </Svg>
    </View>
  );
}

// Keyboard-aware shell for the auth screens (sign-in / sign-up / reset). The
// generic Shell above is for in-app graph screens and has no keyboard handling;
// auth forms need KeyboardAvoidingArea + scroll padding (ANDROID_QA_GUIDELINES).
export function AuthShell({ children, scrollRef }: { children: ReactNode; scrollRef?: Ref<ScrollView> }) {
  // Reserve the Android bottom inset: under edge-to-edge (Expo SDK 56 default)
  // the shared scroll's fixed paddingBottom:40 lets the last CTA on a tall
  // sign-up/reset form draw under the 3-button nav bar. insets.bottom clears it.
  //
  // The TOP inset lives on the KeyboardAvoidingArea (it only ever manages its
  // own bottom padding, on iOS and Android alike), NOT on the
  // ScrollView or its content container: content-container padding scrolls away
  // — /consent-notice auto-scrolls to its ?item= target on mount, which would
  // put the arrival card right back under the status bar — and ScrollView
  // frame padding is the documented RN clipping footgun. Padding the non-scroll
  // frame starts the viewport below the status bar at EVERY scroll position,
  // while AuthBackdrop (outside the area) keeps painting full-bleed behind it.
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <AuthBackdrop />
      <KeyboardAvoidingArea
        style={{ flex: 1, paddingTop: insets.top }}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(40, insets.bottom + 24) }]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingArea>
    </View>
  );
}

export { DeepSpaceSignInDesignScreen } from "./dds-sign-in-screen";

function ResetAction({
  onPress,
  label,
  hint,
  disabled = false,
  busy = false,
  secondary = false,
  role = "button",
}: {
  onPress: () => void;
  label: string;
  hint?: string;
  disabled?: boolean;
  busy?: boolean;
  secondary?: boolean;
  role?: "button" | "link";
}) {
  const background = disabled
    ? m3.color.surfaceVariant
    : secondary
      ? m3.color.surfaceContainerHigh
      : m3.color.primary;
  const foreground = disabled
    ? m3.color.onSurfaceVariant
    : secondary
      ? m3.color.onSurface
      : m3.color.onPrimary;

  return (
    <PixelPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ busy }}
      fullWidth
      variant={disabled ? "inset" : "bevel"}
      background={background}
      contentStyle={resetStyles.actionContent}
    >
      <Text style={[m3TextStyle("labelLarge"), { color: foreground, textAlign: "center" }]}>{label}</Text>
    </PixelPressable>
  );
}

function ResetField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <View style={resetStyles.fieldGroup}>
      <Text style={[m3TextStyle("labelMedium"), resetStyles.fieldLabel]}>{label}</Text>
      <PixelSurface variant="inset" background={m3.color.surfaceContainerHigh} contentStyle={resetStyles.fieldSurface}>
        {children}
      </PixelSurface>
    </View>
  );
}

export function DeepSpaceResetPasswordDesignScreen() {
  const { t } = useTranslation(["deepspace", "auth", "common"]);
  const navigation = useNavigation();
  const { sessionUnavailable, refresh } = useAuth();
  // Subscribes the raw TextInputs to the readable-font switch. Text components
  // already subscribe themselves; calling m3TextStyle again on this render gives
  // form controls the same current face instead of freezing the boot-time value.
  useFontStyle();
  const {
    loading,
    userId,
    step,
    recoveryActive,
    recoveryPending,
    exitLocked,
    email,
    setEmail,
    canSendCode,
    sendSubmitting,
    resendSeconds,
    handleSendCode,
    code,
    setCode,
    canVerify,
    verifying,
    handleVerifyCode,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    submitting,
    cancelling,
    cancelled,
    toast,
    helperKey,
    canSubmit,
    handleSubmit,
    handleCancelRecovery,
  } = useResetPasswordForm();
  // Keep this before the loading return. A cold recovery link renders the loader
  // first and the form after AuthContext hydrates; moving the ref below the return
  // changes hook count between those renders.
  const confirmRef = useRef<TextInput>(null);

  usePreventRemove(exitLocked, useCallback(() => {}, []));
  useGoHomeStop(() => exitLocked); // a home jump from above stops here (gate NS-02)

  // Keep native Back aligned with the visible recovery controls. Before a
  // recovery session exists, Back returns to sign-in. Once the password step
  // owns a recovery session, leaving early would silently abandon the reset;
  // consume Back until the change completes, then send the completed flow home.
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android") return undefined;

      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (exitLocked) return true;
        router.replace(step === "done" || userId ? "/" : "/sign-in");
        return true;
      });
      return () => sub.remove();
    }, [exitLocked, step, userId]),
  );

  // usePreventRemove owns route removal; native-stack gestures and the long-press
  // back menu must read the same lock instead of maintaining a second policy.
  useEffect(() => {
    navigation.setOptions({
      gestureEnabled: !exitLocked,
      headerBackButtonMenuEnabled: false,
    });
  }, [exitLocked, navigation]);

  useEffect(() => {
    if (cancelled && !exitLocked) router.replace("/sign-in");
  }, [cancelled, exitLocked]);

  if (loading) {
    return <InlineLoader />;
  }

  const helperDanger = helperKey !== "resetPassword.passwordHelper";
  const exitHref = userId ? "/" : "/sign-in";
  const exitLabel = userId
    ? t("common:actions.back")
    : t("auth:resetPassword.backToSignIn");
  const exitHint = userId
    ? t("auth:resetPassword.continueHint")
    : t("auth:resetPassword.backToSignInHint");
  const title =
    step === "done"
      ? t("auth:resetPassword.doneTitle")
      : step === "password"
        ? t("auth:resetPassword.title")
        : step === "verify"
          ? t("auth:resetPassword.verify")
          : t("deepspace:auth.forgotPassword");
  const subtitle =
    step === "done"
      ? t("auth:resetPassword.doneSubtitle")
      : step === "password"
        ? t("auth:resetPassword.subtitle")
        : step === "verify"
          ? t("auth:resetPassword.verifySubtitle")
          : t("auth:resetPassword.requestSubtitle");
  const statusGlyph = step === "done" ? "check" : step === "verify" ? "inbox" : "lock";

  return (
    <PixelGateShell contentContainerStyle={resetStyles.scroll}>
      <View style={resetStyles.header}>
        {(step === "request" || step === "verify") && !exitLocked ? (
          <Pressable
            onPress={() => router.replace(exitHref)}
            accessibilityRole="link"
            accessibilityLabel={exitLabel}
            accessibilityHint={exitHint}
            style={resetStyles.back}
          >
            <PixelGlyph name="arrow_back" color={m3.color.onBackground} size={24} />
          </Pressable>
        ) : (
          <View style={resetStyles.back} />
        )}
        <Text style={[m3TextStyle("titleLarge"), resetStyles.headerTitle]}>{t("deepspace:auth.resetTitle")}</Text>
      </View>

      <View style={resetStyles.hero}>
        <PixelSurface variant="frame" background={m3.color.primaryContainer} style={resetStyles.heroGlyph} contentStyle={resetStyles.heroGlyphContent}>
          <PixelGlyph name={statusGlyph} color={m3.color.onPrimaryContainer} size={24} />
        </PixelSurface>
        <View style={resetStyles.heroCopy}>
          <Text style={[m3TextStyle("headlineSmall"), resetStyles.title]}>{title}</Text>
          <Text style={[m3TextStyle("bodyLarge"), resetStyles.subtitle]}>{subtitle}</Text>
        </View>
      </View>

      <ShareRefusedLine />

      {sessionUnavailable ? (
        <View accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <PixelSurface
            variant="frame"
            background={m3.color.errorContainer}
            contentStyle={resetStyles.sessionAlert}
          >
            <Text style={[m3TextStyle("bodyMedium"), resetStyles.toastDanger]}>
              {t("auth:common.sessionUnavailable")}
            </Text>
            <ResetAction
              onPress={() => void refresh()}
              label={t("common:actions.retry")}
            />
          </PixelSurface>
        </View>
      ) : null}

      <View style={resetStyles.form}>
        {step === "request" || step === "verify" ? (
          <>
            <ResetField label={t("auth:resetPassword.emailLabel")}>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                placeholder="email@example.com"
                placeholderTextColor={m3.color.onSurfaceVariant}
                accessibilityLabel={t("auth:resetPassword.emailLabel")}
                accessibilityHint={t("auth:resetPassword.requestSubtitle")}
                style={[resetStyles.input, m3TextStyle("bodyLarge")]}
                editable={!sendSubmitting && !recoveryPending}
                returnKeyType="send"
                onSubmitEditing={() => {
                  if (canSendCode) void handleSendCode();
                }}
              />
            </ResetField>
            <ResetAction
              onPress={() => void handleSendCode()}
              disabled={!canSendCode}
              busy={sendSubmitting}
              secondary={step === "verify"}
              label={
                sendSubmitting
                  ? t("auth:resetPassword.sending")
                  : resendSeconds > 0
                    ? t("auth:resetPassword.resendWait", { seconds: resendSeconds })
                    : step === "verify"
                      ? t("auth:resetPassword.resend")
                      : t("auth:resetPassword.sendCode")
              }
            />
            {step === "verify" ? (
              <>
                <ResetField label={t("auth:resetPassword.codeLabel")}>
                  <TextInput
                    value={code}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    maxLength={6}
                    placeholder="000000"
                    placeholderTextColor={m3.color.onSurfaceVariant}
                    accessibilityLabel={t("auth:resetPassword.codeLabel")}
                    accessibilityHint={t("auth:resetPassword.codeHint")}
                    style={[resetStyles.input, resetStyles.codeInput, m3TextStyle("headlineSmall")]}
                    editable={!sendSubmitting && !recoveryPending}
                    returnKeyType="go"
                    onSubmitEditing={() => {
                      if (canVerify) void handleVerifyCode();
                    }}
                  />
                </ResetField>
                <Text style={[m3TextStyle("bodySmall"), resetStyles.helper]}>{t("auth:resetPassword.codeHelper")}</Text>
                <ResetAction
                  onPress={() => void handleVerifyCode()}
                  disabled={!canVerify}
                  busy={verifying}
                  label={verifying ? t("auth:resetPassword.verifying") : t("auth:resetPassword.verify")}
                />
              </>
            ) : null}
          </>
        ) : step === "done" ? (
          <ResetAction
            onPress={() => router.replace("/")}
            label={t("auth:resetPassword.continue")}
            hint={t("auth:resetPassword.continueHint")}
          />
        ) : (
          <>
            <ResetField label={t("auth:resetPassword.newPassword")}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                placeholder="••••••••"
                placeholderTextColor={m3.color.onSurfaceVariant}
                accessibilityLabel={t("auth:resetPassword.newPassword")}
                accessibilityHint={t("auth:resetPassword.newPasswordHint")}
                editable={recoveryActive && !recoveryPending && !submitting}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => confirmRef.current?.focus()}
                style={[resetStyles.input, m3TextStyle("bodyLarge")]}
              />
            </ResetField>
            <ResetField label={t("auth:resetPassword.confirmPassword")}>
              <TextInput
                ref={confirmRef}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                placeholder="••••••••"
                placeholderTextColor={m3.color.onSurfaceVariant}
                accessibilityLabel={t("auth:resetPassword.confirmPassword")}
                accessibilityHint={t("auth:resetPassword.confirmPasswordHint")}
                style={[resetStyles.input, m3TextStyle("bodyLarge")]}
                editable={recoveryActive && !recoveryPending && !submitting}
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (canSubmit) void handleSubmit();
                }}
              />
            </ResetField>
            <Text
              accessibilityLiveRegion="polite"
              style={[
                m3TextStyle("bodySmall"),
                resetStyles.helper,
                helperDanger && resetStyles.helperDanger,
              ]}
            >
              {t(`auth:${helperKey}`)}
            </Text>
            <ResetAction
              onPress={() => void handleSubmit()}
              disabled={!canSubmit}
              busy={submitting}
              label={submitting ? t("auth:resetPassword.submitting") : t("auth:resetPassword.submit")}
              hint={t("auth:resetPassword.submitHint")}
            />
            <ResetAction
              onPress={() => void handleCancelRecovery()}
              disabled={recoveryPending || submitting || cancelling}
              busy={cancelling}
              secondary
              label={t("auth:completeProfile.cancel")}
              hint={t("auth:completeProfile.cancelHint")}
            />
          </>
        )}
      </View>

      {toast ? (
        <View accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <PixelSurface
            variant="frame"
            background={
              toast.tone === "danger" ? m3.color.errorContainer : m3.color.surfaceContainerHigh
            }
            contentStyle={resetStyles.toastContent}
          >
            <Text
              style={[
                m3TextStyle("bodyMedium"),
                resetStyles.toastText,
                toast.tone === "danger" && resetStyles.toastDanger,
                toast.tone === "success" && resetStyles.toastSuccess,
              ]}
            >
              {toast.message}
            </Text>
          </PixelSurface>
        </View>
      ) : null}
    </PixelGateShell>
  );
}

const resetStyles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: m3.spacing.s6 * 2,
    gap: m3.spacing.s8,
  },
  header: { minHeight: m3.minTouch, flexDirection: "row", alignItems: "center", gap: m3.spacing.s4 },
  back: { width: m3.minTouch, height: m3.minTouch, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: m3.color.onBackground, paddingBottom: Platform.OS === "android" ? m3.spacing.s1 : 0 },
  hero: { flexDirection: "row", alignItems: "flex-start", gap: m3.spacing.s6 },
  heroGlyph: { width: m3.minTouch, height: m3.minTouch },
  heroGlyphContent: { flex: 1, paddingHorizontal: 0, paddingVertical: 0, alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1, gap: m3.spacing.s3 },
  title: { color: m3.color.onBackground, paddingBottom: Platform.OS === "android" ? m3.spacing.s1 : 0 },
  subtitle: { color: m3.color.onSurfaceVariant, paddingBottom: Platform.OS === "android" ? m3.spacing.s1 : 0 },
  form: { gap: m3.spacing.s6 },
  fieldGroup: { gap: m3.spacing.s2 },
  fieldLabel: { color: m3.color.onSurfaceVariant, paddingBottom: Platform.OS === "android" ? m3.spacing.s1 : 0 },
  fieldSurface: { minHeight: m3.minTouch, paddingHorizontal: 0, paddingVertical: 0, justifyContent: "center" },
  input: {
    minHeight: m3.minTouch,
    paddingHorizontal: m3.spacing.s6,
    paddingVertical: m3.spacing.s4,
    color: m3.color.onSurface,
    borderRadius: m3.shape.none,
  },
  codeInput: { textAlign: "center", letterSpacing: 0 },
  helper: { color: m3.color.onSurfaceVariant, paddingBottom: Platform.OS === "android" ? m3.spacing.s1 : 0 },
  helperDanger: { color: m3.color.error },
  actionContent: { minHeight: m3.minTouch, alignItems: "center", justifyContent: "center" },
  sessionAlert: { gap: m3.spacing.s4, paddingVertical: m3.spacing.s4, paddingHorizontal: m3.spacing.s6 },
  toastContent: { paddingVertical: m3.spacing.s4, paddingHorizontal: m3.spacing.s6 },
  toastText: { color: m3.color.primary },
  toastDanger: { color: m3.color.onErrorContainer },
  toastSuccess: { color: m3.accent.moodPositive },
});

