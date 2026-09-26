import { useRef, useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { Redirect, router } from "expo-router";
import Svg, { Rect } from "react-native-svg";
import {
  AccountDeletionNoticePanel,
  useAccountDeletionNotice,
} from "@/components/account/AccountDeletionNotice";
import { useTranslation } from "react-i18next";

import { BusinessFooter } from "@/components/deepspace/BusinessFooter";
import { LoadingPolaris } from "@/components/deepspace/LoadingPolaris";
import { PixelGateShell, PixelPressable, PixelSurface } from "@/components/pixel";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelStarSvg } from "@/components/pixel/PixelStarSvg";
import { type OAuthProvider } from "@/lib/supabase/auth";
import { useAuth } from "@/lib/auth/AuthContext";
import { useSignInForm } from "@/lib/auth/useSignInForm";
import {
  resetPasswordHref,
  runAuthActionOnce,
} from "@/lib/auth/sign-in-screen-contract";
import { m3 } from "@/lib/theme/m3";

const SIGN_IN_PROVIDERS = ["google", "apple", "github"] as const satisfies readonly OAuthProvider[];

type SignInProvider = (typeof SIGN_IN_PROVIDERS)[number];
type PixelBrandCell = readonly [
  x: number,
  y: number,
  width: number,
  height: number,
  fill?: string,
];

const PROVIDER_KEY: Record<SignInProvider, string> = {
  google: "auth:signIn.continueWithGoogle",
  apple: "auth:signIn.continueWithApple",
  github: "auth:signIn.continueWithGithub",
};

// PIXEL-CLAY v4 시안의 실제 브랜드 실루엣을 16 x 16 정수 격자로 옮겼다.
// Google의 네 색은 앱 팔레트가 아니라 브랜드 식별에 필요한 고정 색상이다.
const PIXEL_BRAND_CELLS: Record<SignInProvider, readonly PixelBrandCell[]> = {
  google: [
    [5, 2, 6, 2, "#EA4335"],
    [3, 4, 2, 1, "#EA4335"],
    [11, 4, 2, 1, "#EA4335"],
    [2, 5, 2, 4, "#FBBC05"],
    [2, 9, 2, 2, "#34A853"],
    [3, 11, 2, 1, "#34A853"],
    [5, 12, 6, 2, "#34A853"],
    [8, 7, 6, 2, "#4285F4"],
    [12, 9, 2, 2, "#4285F4"],
    [11, 11, 2, 1, "#4285F4"],
  ],
  apple: [
    [9, 0, 3, 1],
    [10, 1, 2, 1],
    [8, 2, 1, 1],
    [4, 3, 3, 1],
    [9, 3, 3, 1],
    [3, 4, 9, 1],
    [2, 5, 9, 3],
    [2, 8, 11, 2],
    [3, 10, 10, 2],
    [4, 12, 8, 1],
    [5, 13, 2, 1],
    [9, 13, 2, 1],
  ],
  github: [
    [3, 1, 2, 1],
    [11, 1, 2, 1],
    [3, 2, 3, 1],
    [10, 2, 3, 1],
    [3, 3, 10, 1],
    [2, 4, 12, 1],
    [1, 5, 14, 4],
    [2, 9, 12, 1],
    [3, 10, 10, 1],
    [4, 11, 3, 1],
    [9, 11, 3, 1],
    [0, 10, 2, 1],
    [0, 11, 1, 1],
  ],
};

type FocusedField = "email" | "password" | null;

function ProviderBrandIcon({ provider }: { provider: SignInProvider }) {
  return (
    <Svg width={32} height={32} viewBox="0 0 16 16">
      {PIXEL_BRAND_CELLS[provider].map(([x, y, width, height, fill], index) => (
        <Rect
          // 각 브랜드의 셀 목록은 정적이며 순서도 고정돼 있다.
          key={`${provider}-${index}`}
          x={x}
          y={y}
          width={width}
          height={height}
          fill={fill ?? m3.color.onSurface}
        />
      ))}
    </Svg>
  );
}

function PolarisLayer({ radius, fill }: { radius: number; fill: string }) {
  return (
    <Svg width={112} height={112} viewBox="0 0 112 112">
      <PixelStarSvg cx={56} cy={56} r={radius} fill={fill} />
    </Svg>
  );
}

function SignInPolaris({ label }: { label: string }) {
  return (
    <View accessibilityRole="image" accessibilityLabel={label} style={styles.polarisGraphic}>
      <View style={styles.polarisLayer}>
        <PolarisLayer radius={44} fill={m3.accent.polarisEdge} />
      </View>
      <View style={styles.polarisLayer}>
        <PolarisLayer radius={28} fill={m3.accent.polaris} />
      </View>
      <View style={styles.polarisLayer}>
        <PolarisLayer radius={10} fill={m3.accent.skyStarWhite} />
      </View>
    </View>
  );
}

export function DeepSpaceSignInDesignScreen() {
  const { t } = useTranslation(["deepspace", "auth", "common", "settings", "home"]);
  const {
    userId,
    loading,
    email,
    setEmail,
    password,
    setPassword,
    showPassword,
    toggleShowPassword,
    submitting,
    oauthSubmitting,
    canSubmit,
    toast,
    visibleProviders,
    handleSubmit,
    handleOAuth,
  } = useSignInForm();
  // AUTH-01: startup can end without ever classifying the session. That is not
  // "signed out" - it is unknown - so the form is shown with an explicit,
  // announced error and a bounded retry instead of pretending it is a clean
  // signed-out entry. refresh() re-reads the session under the same 8s guard.
  const { sessionUnavailable, refresh } = useAuth();
  const passwordRef = useRef<TextInput>(null);
  const actionLock = useRef(false);
  const [focusedField, setFocusedField] = useState<FocusedField>(null);

  // 확인된 삭제 영수증은 두 게스트 가드보다 앞선다. 방금 계정을 지운 사람에게
  // 서버가 무엇을 지웠고 무엇을 확인하지 못했는지 말해 줄 자리가 여기뿐이다.
  // 세션 로딩 중에도, 늦게 도착한 userId 로도 이 결과를 밀어내면 안 된다.
  const deletionNotice = useAccountDeletionNotice();
  if (deletionNotice) return <AccountDeletionNoticePanel notice={deletionNotice} />;

  if (loading) {
    return (
      <PixelGateShell contentContainerStyle={styles.loadingShell}>
        <View style={styles.loadingHero}>
          <LoadingPolaris size={112} accessibilityLabel={t("home:ds.home.polaris")} />
          <Text style={styles.brand}>{t("deepspace:auth.brandLabel")}</Text>
          <PixelSurface variant="frame" contentStyle={styles.loadingSurface}>
            <Text style={styles.helper}>{t("auth:common.checking")}</Text>
          </PixelSurface>
        </View>
      </PixelGateShell>
    );
  }
  if (userId) return <Redirect href="/" />;

  const authBusy = submitting || oauthSubmitting;
  const submitDisabled = !canSubmit || oauthSubmitting;
  const signInProviders = SIGN_IN_PROVIDERS.filter((provider) =>
    visibleProviders.includes(provider),
  );

  async function submit(): Promise<void> {
    if (submitDisabled) return;
    await runAuthActionOnce(actionLock, handleSubmit);
  }

  async function startProvider(provider: SignInProvider): Promise<void> {
    if (authBusy) return;
    await runAuthActionOnce(actionLock, () => handleOAuth(provider));
  }

  return (
    <PixelGateShell contentContainerStyle={styles.shell}>
      <View style={styles.hero}>
        <SignInPolaris label={t("home:ds.home.polaris")} />
        <Text style={styles.brand}>{t("deepspace:auth.brandLabel")}</Text>
        <Text style={styles.title}>{t("deepspace:auth.signInTitle")}</Text>
        <Text style={styles.lead}>{t("deepspace:auth.signInLead")}</Text>
      </View>

      {sessionUnavailable ? (
        <View accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <PixelSurface
            variant="frame"
            background={m3.color.errorContainer}
            contentStyle={styles.sessionAlert}
          >
            <Text style={[styles.toastText, styles.toastDanger]}>
              {t("auth:common.sessionUnavailable")}
            </Text>
            <PixelPressable
              variant="bevel"
              onPress={() => void refresh()}
              accessibilityLabel={t("common:actions.retry")}
              background={m3.color.primary}
              fullWidth
              contentStyle={styles.sessionRetry}
            >
              <Text style={styles.sessionRetryLabel}>{t("common:actions.retry")}</Text>
            </PixelPressable>
          </PixelSurface>
        </View>
      ) : null}

      <View style={[styles.formSurface, styles.form]}>
        <Text style={styles.label}>{t("auth:signIn.email")}</Text>
        <PixelSurface
          variant="inset"
          background={
            authBusy
              ? m3.color.surfaceContainerHighest
              : focusedField === "email"
                ? m3.color.primaryContainer
                : m3.color.surfaceVariant
          }
          style={styles.inputSurface}
          contentStyle={styles.inputContent}
        >
          <TextInput
            value={email}
            onChangeText={setEmail}
            editable={!authBusy}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            placeholder="email@example.com"
            placeholderTextColor={m3.color.onSurfaceVariant}
            accessibilityLabel={t("auth:signIn.email")}
            accessibilityHint={t("auth:signIn.emailHint")}
            style={styles.input}
            returnKeyType="next"
            blurOnSubmit={false}
            onFocus={() => setFocusedField("email")}
            onBlur={() => setFocusedField(null)}
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
        </PixelSurface>

        <View style={styles.passwordLabelRow}>
          <Text style={styles.label}>{t("auth:signIn.password")}</Text>
          <PixelPressable
            variant="frame"
            onPress={toggleShowPassword}
            disabled={authBusy}
            accessibilityLabel={
              showPassword
                ? t("auth:signIn.hidePasswordLabel")
                : t("auth:signIn.showPasswordLabel")
            }
            accessibilityHint={
              showPassword
                ? t("auth:signIn.hidePasswordHint")
                : t("auth:signIn.showPasswordHint")
            }
            accessibilityState={{ selected: showPassword }}
            rootStyle={styles.eyeRoot}
            contentStyle={styles.eyeContent}
          >
            <PixelGlyph
              name={showPassword ? "visibilityOff" : "visibility"}
              color={m3.color.primary}
              size={24}
            />
          </PixelPressable>
        </View>
        <PixelSurface
          variant="inset"
          background={
            authBusy
              ? m3.color.surfaceContainerHighest
              : focusedField === "password"
                ? m3.color.primaryContainer
                : m3.color.surfaceVariant
          }
          style={styles.inputSurface}
          contentStyle={styles.inputContent}
        >
          <TextInput
            ref={passwordRef}
            value={password}
            onChangeText={setPassword}
            editable={!authBusy}
            secureTextEntry={!showPassword}
            autoComplete="current-password"
            textContentType="password"
            placeholder="••••••••"
            placeholderTextColor={m3.color.onSurfaceVariant}
            accessibilityLabel={t("auth:signIn.password")}
            accessibilityHint={t("auth:signIn.passwordHint")}
            style={styles.input}
            returnKeyType="go"
            onFocus={() => setFocusedField("password")}
            onBlur={() => setFocusedField(null)}
            onSubmitEditing={() => {
              if (!submitDisabled) void submit();
            }}
          />
        </PixelSurface>

        <PixelPressable
          variant="bevel"
          onPress={() => void submit()}
          disabled={submitDisabled}
          accessibilityLabel={t("auth:signIn.submit")}
          accessibilityState={{ busy: submitting }}
          background={submitDisabled ? m3.color.surfaceContainerHighest : m3.color.primary}
          fullWidth
          contentStyle={styles.primaryContent}
        >
          <PixelGlyph
            name="lock"
            color={submitDisabled ? m3.color.onSurfaceVariant : m3.color.onPrimary}
            size={24}
          />
          <Text style={[styles.primaryText, submitDisabled && styles.disabledText]}>
            {submitting ? t("auth:signIn.submitting") : t("auth:signIn.submit")}
          </Text>
        </PixelPressable>

        <PixelPressable
          variant="bevel"
          onPress={() => router.push(resetPasswordHref(email))}
          disabled={authBusy}
          accessibilityRole="link"
          accessibilityLabel={t("auth:signIn.resetLabel")}
          accessibilityHint={t("auth:resetPassword.requestSubtitle")}
          fullWidth
          contentStyle={styles.linkContent}
        >
          <Text style={styles.linkText}>{t("deepspace:auth.forgotPassword")}</Text>
          <PixelGlyph name="arrowForward" color={m3.color.primary} size={16} />
        </PixelPressable>

        {signInProviders.length > 0 ? (
          <>
            <View style={styles.dividerRow}>
              <View style={styles.dividerCell} />
              <Text style={styles.dividerText}>{t("deepspace:auth.or")}</Text>
              <View style={styles.dividerCell} />
            </View>
            <View style={styles.providers}>
              {signInProviders.map((provider) => (
                <PixelPressable
                  key={provider}
                  variant="bevel"
                  onPress={() => void startProvider(provider)}
                  disabled={authBusy}
                  accessibilityLabel={t(PROVIDER_KEY[provider])}
                  accessibilityState={{ busy: oauthSubmitting }}
                  rootStyle={styles.providerRoot}
                  contentStyle={styles.providerContent}
                >
                  <ProviderBrandIcon provider={provider} />
                  <Text style={styles.providerText}>{t(PROVIDER_KEY[provider])}</Text>
                </PixelPressable>
              ))}
            </View>
          </>
        ) : null}
      </View>

      <View style={styles.actionInset}>
        <PixelPressable
          variant="bevel"
          onPress={() => router.push("/sign-up")}
          disabled={authBusy}
          accessibilityRole="link"
          accessibilityLabel={t("auth:signIn.signUpLink")}
          accessibilityHint={t("auth:signIn.signUpHint")}
          fullWidth
          contentStyle={styles.signUpContent}
        >
          <View style={styles.signUpCopy}>
            <Text style={styles.helper}>{t("auth:signIn.noAccount")}</Text>
            <Text style={styles.signUpText}>{t("auth:signIn.signUpLink")}</Text>
          </View>
          <PixelGlyph name="arrowForward" color={m3.color.primary} size={24} />
        </PixelPressable>
      </View>

      <View style={styles.legal}>
        <Text style={styles.legalLead}>{t("deepspace:auth.legalConsent")}</Text>
        <View style={[styles.legalLinks, styles.actionInset]}>
          <LegalLink
            label={t("deepspace:ds.plans.legalTerms")}
            onPress={() => router.push("/terms")}
          />
          <LegalLink
            label={t("settings:nav.privacy")}
            onPress={() => router.push("/privacy-policy")}
          />
          <LegalLink
            label={t("deepspace:ds.plans.legalRefund")}
            onPress={() => router.push("/refund")}
          />
        </View>
        {/* 전자상거래법 표시의무 푸터. 반드시 동의 링크 **아래**다.
            값이 등록되기 전(BUSINESS_INFO null)에는 아무것도 그리지 않는다:
            src/lib/legal/business-info.ts. 이 화면을 dds-auth-screens 에서
            들어낼 때 같이 딸려오지 않아서 통합 중에 되살렸다 — 빠지면 로그인
            화면에서 사업자 정보 고지가 조용히 사라진다. */}
        <BusinessFooter />
      </View>

      {toast ? (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion={toast.tone === "danger" ? "assertive" : "polite"}
        >
          <PixelSurface
            variant="frame"
            background={
              toast.tone === "danger"
                ? m3.color.errorContainer
                : toast.tone === "success"
                  ? m3.color.tertiaryContainer
                  : m3.color.primaryContainer
            }
            contentStyle={styles.toast}
          >
            <Text
              style={[
                styles.toastText,
                toast.tone === "danger"
                  ? styles.toastDanger
                  : toast.tone === "success"
                    ? styles.toastSuccess
                    : styles.toastInfo,
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

function LegalLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <PixelPressable
      variant="bevel"
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      rootStyle={styles.legalRoot}
      contentStyle={styles.legalLink}
    >
      <PixelGlyph name="article" color={m3.color.onSurfaceVariant} size={16} />
      <Text style={styles.legalText}>{label}</Text>
    </PixelPressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    gap: m3.spacing.s6,
    ...(Platform.OS === "web"
      ? { width: "100%" as const, maxWidth: 520, alignSelf: "center" as const }
      : {}),
  },
  loadingShell: {
    justifyContent: "center",
    ...(Platform.OS === "web"
      ? { width: "100%" as const, maxWidth: 520, alignSelf: "center" as const }
      : {}),
  },
  loadingHero: { alignItems: "center", gap: m3.spacing.s4 },
  loadingSurface: { minHeight: m3.minTouch, alignItems: "center", justifyContent: "center" },
  hero: { alignItems: "center", gap: m3.spacing.s2 },
  polarisGraphic: { width: 112, height: 112, alignItems: "center", justifyContent: "center" },
  polarisLayer: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    color: m3.color.primary,
    fontFamily: m3.font.mono,
    fontSize: m3.type.labelMedium.size,
    lineHeight: m3.type.labelMedium.line,
    fontWeight: "700",
    textAlign: "center",
  },
  title: {
    color: m3.color.onSurface,
    fontFamily: m3.font.brand,
    fontSize: m3.type.headlineSmall.size,
    lineHeight: m3.type.headlineSmall.line,
    fontWeight: "700",
    textAlign: "center",
  },
  lead: {
    maxWidth: 360,
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodyMedium.size,
    lineHeight: m3.type.bodyMedium.line,
    textAlign: "center",
  },
  formSurface: { alignSelf: "stretch" },
  form: { gap: m3.spacing.s3, padding: m3.spacing.s4 },
  label: {
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.brand,
    fontSize: m3.type.labelMedium.size,
    lineHeight: m3.type.labelMedium.line,
    fontWeight: "700",
  },
  inputSurface: { alignSelf: "stretch" },
  inputContent: { minHeight: 48, paddingHorizontal: 0, paddingVertical: 0, justifyContent: "center" },
  input: {
    minHeight: 48,
    paddingHorizontal: m3.spacing.s4,
    paddingVertical: m3.spacing.s2,
    color: m3.color.onSurface,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodyLarge.size,
    lineHeight: m3.type.bodyLarge.line,
  },
  passwordLabelRow: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: m3.spacing.s2,
  },
  eyeRoot: { width: m3.minTouch, minHeight: m3.minTouch },
  eyeContent: { minHeight: m3.minTouch, alignItems: "center", padding: m3.spacing.s2 },
  primaryContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s3,
  },
  primaryText: {
    color: m3.color.onPrimary,
    fontFamily: m3.font.brand,
    fontSize: m3.type.labelLarge.size,
    lineHeight: m3.type.labelLarge.line,
    fontWeight: "700",
  },
  disabledText: { color: m3.color.onSurfaceVariant },
  linkContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: m3.spacing.s3,
  },
  linkText: {
    flex: 1,
    color: m3.color.primary,
    fontFamily: m3.font.brand,
    fontSize: m3.type.labelLarge.size,
    lineHeight: m3.type.labelLarge.line,
  },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: m3.spacing.s3 },
  dividerCell: { flex: 1, height: m3.spacing.s1, backgroundColor: m3.color.outlineVariant },
  dividerText: {
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.mono,
    fontSize: m3.type.labelSmall.size,
    lineHeight: m3.type.labelSmall.line,
  },
  providers: { flexDirection: "row", flexWrap: "wrap", alignItems: "stretch", gap: m3.spacing.s3 },
  providerRoot: { flexBasis: "47%", flexGrow: 1, flexShrink: 1, minWidth: 112 },
  providerContent: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s3,
  },
  providerText: {
    flex: 1,
    flexShrink: 1,
    color: m3.color.onSurface,
    fontFamily: m3.font.brand,
    fontSize: m3.type.labelMedium.size,
    lineHeight: m3.type.labelMedium.line,
  },
  signUpContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: m3.spacing.s3,
  },
  signUpCopy: { flex: 1, gap: m3.spacing.s1 },
  helper: {
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodySmall.size,
    lineHeight: m3.type.bodySmall.line,
  },
  signUpText: {
    color: m3.color.primary,
    fontFamily: m3.font.brand,
    fontSize: m3.type.labelLarge.size,
    lineHeight: m3.type.labelLarge.line,
    fontWeight: "700",
  },
  actionInset: { alignSelf: "stretch", paddingHorizontal: m3.spacing.s4 },
  legal: { gap: m3.spacing.s3, paddingHorizontal: 0 },
  legalLead: {
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodySmall.size,
    lineHeight: m3.type.bodySmall.line,
    textAlign: "center",
  },
  legalLinks: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "stretch",
    gap: m3.spacing.s2,
  },
  legalRoot: { flexGrow: 1, flexShrink: 1, flexBasis: "30%", minWidth: 96 },
  legalLink: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s2,
    paddingHorizontal: m3.spacing.s2,
  },
  legalText: {
    flexShrink: 1,
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.brand,
    fontSize: m3.type.labelSmall.size,
    lineHeight: m3.type.labelSmall.line,
    textAlign: "center",
  },
  toast: { minHeight: m3.minTouch, justifyContent: "center" },
  toastText: {
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodyMedium.size,
    lineHeight: m3.type.bodyMedium.line,
    textAlign: "center",
  },
  sessionAlert: { minHeight: m3.minTouch, justifyContent: "center", gap: 8, paddingVertical: 8 },
  sessionRetry: { minHeight: m3.minTouch, alignItems: "center", justifyContent: "center" },
  sessionRetryLabel: {
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodyMedium.size,
    lineHeight: m3.type.bodyMedium.line,
    color: m3.color.onPrimary,
  },
  toastDanger: { color: m3.color.onErrorContainer },
  toastSuccess: { color: m3.color.onTertiaryContainer },
  toastInfo: { color: m3.color.onPrimaryContainer },
});
