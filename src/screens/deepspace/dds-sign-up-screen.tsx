import { useEffect, useRef, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useTranslation } from "react-i18next";

import { BirthDateField } from "@/components/auth/BirthDateField";
import { SecondbHead } from "@/components/deepspace";
import { PixelGateShell, PixelPressable, PixelSurface } from "@/components/pixel";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import {
  REQUIRED_ACK_KEYS,
  allRequiredAcksChecked,
  setAllRequiredAcks,
  type ConsentSelections,
} from "@/lib/auth/consent-selections";
import { useSignUpForm } from "@/lib/auth/useSignUpForm";
import { ageInYears, MIN_SELF_CONSENT_AGE, type OAuthProvider } from "@/lib/supabase/auth";
import { m3 } from "@/lib/theme/m3";

const PROVIDER_KEY: Record<OAuthProvider, string> = {
  google: "auth:signUp.continueWithGoogle",
  apple: "auth:signUp.continueWithApple",
  kakao: "auth:signUp.continueWithKakao",
  facebook: "auth:signUp.continueWithFacebook",
  github: "auth:signUp.continueWithGithub",
};

const CONSENT_KEY: Record<keyof ConsentSelections, string> = {
  service: "consent:notice.ackService",
  llmProcessing: "consent:notice.ackLlm",
  overseasTransfer: "consent:notice.ackOverseas",
  sensitiveData: "consent:notice.ackSensitive",
  safetyNotice: "consent:notice.ackSafety",
  marketing: "consent:notice.optMarketing",
};

const PROVIDER_MARK: Record<OAuthProvider | "naver", string> = {
  google: "G",
  apple: "A",
  kakao: "K",
  facebook: "f",
  github: "GH",
  naver: "N",
};

type FocusedField = "email" | "password" | "code" | null;

export function DeepSpaceSignUpDesignScreen() {
  const { t, i18n } = useTranslation(["deepspace", "auth", "common", "consent"]);
  const {
    userId,
    loading,
    submitting,
    judgeWelcome,
    toast,
    email,
    setEmail,
    password,
    setPassword,
    birthDate,
    setBirthDate,
    consent,
    setConsent,
    judge,
    isMinorAge,
    canSubmit,
    oauthSubmitting,
    existingAccountHelp,
    confirmSentTo,
    confirmCode,
    setConfirmCode,
    canVerifyConfirmCode,
    confirmVerifying,
    handleVerifyConfirmCode,
    visibleProviders,
    naverEnabled,
    handleSubmit,
    handleOAuth,
    handleNaver,
    canLeaveGate,
  } = useSignUpForm();
  const passwordRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const previousConfirmRef = useRef<string | null>(null);
  const [focusedField, setFocusedField] = useState<FocusedField>(null);
  const locale = i18n.language === "ko" ? "ko" : "en";

  useEffect(() => {
    const newlyPrimary = confirmSentTo !== null && previousConfirmRef.current !== confirmSentTo;
    previousConfirmRef.current = confirmSentTo;
    if (newlyPrimary) scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [confirmSentTo]);

  if (loading) {
    return (
      <PixelGateShell contentContainerStyle={styles.loadingShell}>
        <View style={styles.loadingHero}>
          <PixelSurface variant="inset" style={styles.headFrame} contentStyle={styles.headContent}>
            <View accessibilityRole="image" accessibilityLabel={t("auth:common.entryArtwork")}>
              <SecondbHead size={72} mood="neutral" />
            </View>
          </PixelSurface>
          <PixelSurface variant="frame" style={styles.loadingMessage} contentStyle={styles.loadingSurface}>
            <Text style={styles.helper}>{t("auth:common.checking")}</Text>
          </PixelSurface>
        </View>
      </PixelGateShell>
    );
  }

  // An email sign-up can establish the session before profile/consent
  // sequencing has settled. Keep the gate mounted for those owned states.
  if (userId && !submitting && !judgeWelcome && !toast) return <Redirect href="/" />;

  const actionBusy = submitting || oauthSubmitting || confirmVerifying;
  const formLocked = actionBusy || confirmSentTo !== null;
  const submitDisabled = !canSubmit || actionBusy;
  const birthOk = ageInYears(birthDate) >= MIN_SELF_CONSENT_AGE;
  const showChecklist = email.length > 0 || password.length > 0 || birthDate.length > 0;

  return (
    <PixelGateShell scrollRef={scrollRef} contentContainerStyle={styles.shell}>
      <View style={styles.topBar}>
        <PixelPressable
          variant="frame"
          onPress={() => {
            if (canLeaveGate()) router.push("/");
          }}
          disabled={actionBusy}
          accessibilityLabel={t("common:navGraph.drilldown.back")}
          accessibilityHint={t("common:navGraph.drilldown.backHint")}
          rootStyle={styles.squareAction}
          contentStyle={styles.squareActionContent}
        >
          <PixelGlyph name="arrowBack" color={m3.color.primary} size={24} />
        </PixelPressable>
        <Text style={styles.brand}>{t("deepspace:auth.brandLabel")}</Text>
        <PixelPressable
          variant="frame"
          onPress={() => {
            if (canLeaveGate()) void i18n.changeLanguage(locale === "ko" ? "en" : "ko");
          }}
          disabled={actionBusy}
          accessibilityLabel={
            locale === "ko"
              ? t("auth:language.switchToEnglishLabel")
              : t("auth:language.switchToKoreanLabel")
          }
          accessibilityHint={
            locale === "ko"
              ? t("auth:language.switchToEnglishHint")
              : t("auth:language.switchToKoreanHint")
          }
          rootStyle={styles.localeRoot}
          contentStyle={styles.localeContent}
        >
          <Text style={styles.localeText}>{locale === "ko" ? "EN" : "KO"}</Text>
        </PixelPressable>
      </View>

      <PixelSurface variant="frame" style={styles.heroSurface} contentStyle={styles.hero}>
        <PixelSurface variant="inset" style={styles.headFrame} contentStyle={styles.headContent}>
          <View accessibilityRole="image" accessibilityLabel={t("auth:common.entryArtwork")}>
            <SecondbHead size={72} mood="neutral" />
          </View>
        </PixelSurface>
        <Text style={styles.title}>{t("deepspace:auth.signUpTitle")}</Text>
        <Text style={styles.lead}>{t("deepspace:auth.signUpLead")}</Text>
        <Text style={styles.ageNotice}>{t("deepspace:auth.ageNotice")}</Text>
        {judge ? (
          <PixelSurface variant="inset" contentStyle={styles.judgeBadge}>
            <PixelGlyph name="badge" color={m3.color.tertiary} size={16} />
            <Text style={styles.judgeText}>{t("auth:judge.badge")}</Text>
          </PixelSurface>
        ) : null}
      </PixelSurface>

      {confirmSentTo ? (
        <PixelSurface
          variant="frame"
          background={m3.color.primaryContainer}
          style={styles.sectionSurface}
          contentStyle={styles.sectionContent}
        >
          <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.sectionContent}>
            <Text style={styles.sectionTitle}>{t("auth:signUp.confirmSentTitle")}</Text>
            <Text style={styles.bodyText}>
              {t("auth:signUp.confirmSentBody", { email: confirmSentTo })}
            </Text>
            <Text style={styles.label}>{t("auth:signUp.confirmCodeLabel")}</Text>
            <PixelSurface
              variant="inset"
              background={
                confirmVerifying
                  ? m3.color.surfaceContainerHighest
                  : focusedField === "code"
                    ? m3.color.primaryContainer
                    : m3.color.surfaceVariant
              }
              style={styles.inputSurface}
              contentStyle={styles.inputContent}
            >
              <TextInput
                value={confirmCode}
                onChangeText={(value) => setConfirmCode(value.replace(/\D/g, "").slice(0, 6))}
                editable={!actionBusy}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={6}
                placeholder="000000"
                placeholderTextColor={m3.color.onSurfaceVariant}
                accessibilityLabel={t("auth:signUp.confirmCodeLabel")}
                accessibilityHint={t("auth:signUp.confirmCodeHint")}
                style={styles.codeInput}
                returnKeyType="go"
                onFocus={() => setFocusedField("code")}
                onBlur={() => setFocusedField(null)}
                onSubmitEditing={() => {
                  if (canVerifyConfirmCode) void handleVerifyConfirmCode();
                }}
              />
            </PixelSurface>
            <PixelPressable
              variant={canVerifyConfirmCode ? "bevel" : "inset"}
              onPress={() => void handleVerifyConfirmCode()}
              disabled={!canVerifyConfirmCode}
              accessibilityLabel={t("auth:signUp.confirmCodeVerify")}
              accessibilityState={{ busy: confirmVerifying }}
              background={
                canVerifyConfirmCode ? m3.color.primary : m3.color.surfaceContainerHighest
              }
              fullWidth
              contentStyle={styles.primaryContent}
            >
              <PixelGlyph
                name="check"
                color={canVerifyConfirmCode ? m3.color.onPrimary : m3.color.onSurfaceVariant}
                size={20}
              />
              <Text style={[styles.primaryText, !canVerifyConfirmCode && styles.disabledText]}>
                {confirmVerifying
                  ? t("auth:resetPassword.verifying")
                  : t("auth:signUp.confirmCodeVerify")}
              </Text>
            </PixelPressable>
          </View>
        </PixelSurface>
      ) : null}

      <PixelSurface variant="frame" style={styles.sectionSurface} contentStyle={styles.formContent}>
        <Text style={styles.label}>{t("auth:signUp.email")}</Text>
        <PixelSurface
          variant="inset"
          background={
            actionBusy
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
            editable={!actionBusy}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            placeholder="email@example.com"
            placeholderTextColor={m3.color.onSurfaceVariant}
            accessibilityLabel={t("auth:signUp.email")}
            accessibilityHint={t("auth:signUp.emailHint")}
            style={styles.input}
            returnKeyType="next"
            blurOnSubmit={false}
            onFocus={() => setFocusedField("email")}
            onBlur={() => setFocusedField(null)}
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
        </PixelSurface>

        <Text style={styles.label}>{t("auth:signUp.password")}</Text>
        <PixelSurface
          variant="inset"
          background={
            formLocked
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
            editable={!formLocked}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            placeholder="••••••••"
            placeholderTextColor={m3.color.onSurfaceVariant}
            accessibilityLabel={t("auth:signUp.password")}
            accessibilityHint={t("auth:signUp.passwordHint")}
            style={styles.input}
            returnKeyType="done"
            onFocus={() => setFocusedField("password")}
            onBlur={() => setFocusedField(null)}
            onSubmitEditing={() => {
              if (!submitDisabled) void handleSubmit();
            }}
          />
        </PixelSurface>
        <Text style={styles.helper}>{t("auth:signUp.passwordHelper")}</Text>

        <View pointerEvents={formLocked ? "none" : "auto"}>
          <BirthDateField value={birthDate} onChange={setBirthDate} />
        </View>

        {showChecklist ? (
          <View style={styles.checklist}>
            <StatusRow
              ok={email.includes("@")}
              label={
                email.includes("@")
                  ? t("auth:signUp.checkEmail")
                  : t("auth:signUp.checkEmailMissing")
              }
            />
            <StatusRow
              ok={password.length >= 8}
              label={
                password.length >= 8
                  ? t("auth:signUp.checkPassword")
                  : t("auth:signUp.checkPasswordShort")
              }
            />
            <StatusRow
              ok={birthOk}
              label={birthOk ? t("auth:signUp.checkAge") : t("auth:signUp.checkAgeBlocked")}
            />
          </View>
        ) : null}
      </PixelSurface>

      <ConsentBlock
        minor={isMinorAge}
        value={consent}
        disabled={formLocked}
        onChange={setConsent}
        canLeaveGate={canLeaveGate}
      />

      {existingAccountHelp ? (
        <PixelSurface
          variant="frame"
          background={m3.color.errorContainer}
          style={styles.sectionSurface}
          contentStyle={styles.sectionContent}
        >
          <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.sectionContent}>
            <Text style={[styles.sectionTitle, styles.errorText]}>
              {t("auth:signUp.existingAccountTitle")}
            </Text>
            <Text style={[styles.bodyText, styles.errorText]}>
              {t("auth:signUp.existingAccountBody")}
            </Text>
            <PixelPressable
              variant="bevel"
              onPress={() => {
                if (canLeaveGate()) router.push("/sign-in");
              }}
              disabled={actionBusy}
              accessibilityLabel={t("auth:signUp.existingAccountSignIn")}
              accessibilityHint={t("auth:signUp.signInHint")}
              fullWidth
              contentStyle={styles.linkContent}
            >
              <Text style={styles.linkText}>{t("auth:signUp.existingAccountSignIn")}</Text>
              <PixelGlyph name="arrowForward" color={m3.color.primary} size={20} />
            </PixelPressable>
          </View>
        </PixelSurface>
      ) : null}

      {visibleProviders.length > 0 || naverEnabled ? (
        <PixelSurface variant="frame" style={styles.sectionSurface} contentStyle={styles.providerSection}>
          <View style={styles.dividerRow}>
            <View style={styles.dividerCell} />
            <Text style={styles.dividerText}>{t("deepspace:auth.or")}</Text>
            <View style={styles.dividerCell} />
          </View>
          <View style={styles.providers}>
            {visibleProviders.map((provider) => (
              <ProviderButton
                key={provider}
                provider={provider}
                label={t(PROVIDER_KEY[provider])}
                disabled={formLocked}
                busy={oauthSubmitting}
                onPress={() => void handleOAuth(provider)}
              />
            ))}
            {naverEnabled ? (
              <ProviderButton
                provider="naver"
                label={t("auth:signUp.continueWithNaver")}
                disabled={formLocked}
                busy={oauthSubmitting}
                onPress={() => void handleNaver()}
              />
            ) : null}
          </View>
        </PixelSurface>
      ) : null}

      <PixelSurface variant="flat" style={styles.footerSurface} contentStyle={styles.footer}>
        <PixelPressable
          variant="frame"
          onPress={() => {
            if (canLeaveGate()) router.push("/sign-in");
          }}
          disabled={actionBusy}
          accessibilityRole="link"
          accessibilityLabel={t("auth:signUp.signInLink")}
          accessibilityHint={t("auth:signUp.signInHint")}
          fullWidth
          contentStyle={styles.linkContent}
        >
          <View style={styles.footerCopy}>
            <Text style={styles.helper}>{t("auth:signUp.alreadyHaveAccount")}</Text>
            <Text style={styles.linkText}>{t("auth:signUp.signInLink")}</Text>
          </View>
          <PixelGlyph name="arrowForward" color={m3.color.primary} size={20} />
        </PixelPressable>
        <View style={styles.footerLinks}>
          <FooterLink
            label={t("auth:signUp.manualLink")}
            hint={t("auth:signUp.manualHint")}
            disabled={actionBusy}
            onPress={() => {
              if (canLeaveGate()) router.push("/manual");
            }}
          />
          <FooterLink
            label={t("deepspace:ds.plans.legalTerms")}
            hint={t("deepspace:auth.legalConsent")}
            disabled={actionBusy}
            onPress={() => {
              if (canLeaveGate()) router.push("/terms");
            }}
          />
        </View>
      </PixelSurface>

      {/* PixelGateShell owns safe-area and IME padding. Until that shared shell
          exposes a fixed-footer slot, the primary CTA stays last in scroll flow
          after every legal link. This keeps 320dp layouts reachable without an
          absolute footer covering consent; native keyboard behavior remains a
          HUMAN QA item rather than a claimed sticky-footer pass. */}
      <PixelPressable
        variant={submitDisabled ? "inset" : "bevel"}
        onPress={() => void handleSubmit()}
        disabled={submitDisabled}
        accessibilityLabel={t("auth:signUp.submit")}
        accessibilityState={{ busy: submitting }}
        background={submitDisabled ? m3.color.surfaceContainerHighest : m3.color.primary}
        fullWidth
        contentStyle={styles.primaryContent}
      >
        <PixelGlyph
          name="badge"
          color={submitDisabled ? m3.color.onSurfaceVariant : m3.color.onPrimary}
          size={22}
        />
        <Text style={[styles.primaryText, submitDisabled && styles.disabledText]}>
          {t("auth:signUp.submit")}
        </Text>
      </PixelPressable>

      {toast ? <SignUpToast message={toast.message} tone={toast.tone} /> : null}
    </PixelGateShell>
  );
}

function ConsentBlock({
  minor,
  value,
  disabled,
  onChange,
  canLeaveGate,
}: {
  minor: boolean;
  value: ConsentSelections;
  disabled: boolean;
  onChange: (next: ConsentSelections) => void;
  canLeaveGate: () => boolean;
}) {
  const { t } = useTranslation("consent");
  const allChecked = allRequiredAcksChecked(value);

  function toggle(key: keyof ConsentSelections): void {
    if (disabled) return;
    onChange({ ...value, [key]: !value[key] });
  }

  return (
    <PixelSurface variant="frame" style={styles.sectionSurface} contentStyle={styles.consentContent}>
      <Text style={styles.sectionTitle}>{t("notice.title")}</Text>
      <Text style={styles.bodyText}>{t("notice.intro")}</Text>
      {minor ? (
        <PixelSurface
          variant="inset"
          background={m3.color.tertiaryContainer}
          contentStyle={styles.minorBanner}
        >
          <Text style={styles.minorText}>{t("notice.minorBanner")}</Text>
        </PixelSurface>
      ) : null}
      <Text style={styles.groupLabel}>{t("notice.requiredLabel")}</Text>
      <ConsentCheckRow
        checked={allChecked}
        label={t("notice.agreeAll")}
        disabled={disabled}
        onToggle={() => onChange(setAllRequiredAcks(value, !allChecked))}
      />
      {REQUIRED_ACK_KEYS.map((key) => (
        <ConsentCheckRow
          key={key}
          checked={value[key]}
          label={t(CONSENT_KEY[key])}
          disabled={disabled}
          onToggle={() => toggle(key)}
          onDetail={() => {
            if (canLeaveGate()) {
              router.push({ pathname: "/consent-notice", params: { item: key } });
            }
          }}
          detailLabel={`${t(`detail.${key}.title`)} ${t("notice.detailLink")}`}
        />
      ))}
      <Text style={styles.groupLabel}>{t("notice.optionalLabel")}</Text>
      <ConsentCheckRow
        checked={value.marketing}
        label={t(CONSENT_KEY.marketing)}
        disabled={disabled}
        onToggle={() => toggle("marketing")}
        onDetail={() => {
          if (canLeaveGate()) {
            router.push({ pathname: "/consent-notice", params: { item: "marketing" } });
          }
        }}
        detailLabel={`${t("detail.marketing.title")} ${t("notice.detailLink")}`}
      />
    </PixelSurface>
  );
}

function ConsentCheckRow({
  checked,
  label,
  disabled,
  onToggle,
  onDetail,
  detailLabel,
}: {
  checked: boolean;
  label: string;
  disabled: boolean;
  onToggle: () => void;
  onDetail?: () => void;
  detailLabel?: string;
}) {
  return (
    <View style={styles.consentRow}>
      <PixelPressable
        variant={checked ? "inset" : "frame"}
        onPress={onToggle}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked }}
        rootStyle={styles.consentToggleRoot}
        fullWidth
        contentStyle={styles.consentToggle}
      >
        <PixelSurface
          variant={checked ? "inset" : "frame"}
          background={checked ? m3.color.primary : m3.color.surfaceVariant}
          style={styles.checkbox}
          contentStyle={styles.checkboxContent}
        >
          {checked ? <PixelGlyph name="check" color={m3.color.onPrimary} size={16} /> : null}
        </PixelSurface>
        <Text style={[styles.consentText, disabled && styles.disabledText]}>{label}</Text>
      </PixelPressable>
      {onDetail ? (
        <PixelPressable
          variant="frame"
          onPress={onDetail}
          disabled={disabled}
          accessibilityLabel={detailLabel}
          accessibilityHint={label}
          rootStyle={styles.detailRoot}
          contentStyle={styles.detailContent}
        >
          <PixelGlyph name="chevronRight" color={m3.color.primary} size={20} />
        </PixelPressable>
      ) : null}
    </View>
  );
}

function StatusRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <PixelSurface
      variant="inset"
      background={ok ? m3.color.tertiaryContainer : m3.color.surfaceVariant}
      contentStyle={styles.statusRow}
    >
      <PixelGlyph
        name={ok ? "check" : "close"}
        color={ok ? m3.color.onTertiaryContainer : m3.color.onSurfaceVariant}
        size={16}
      />
      <Text style={[styles.statusText, ok && styles.statusOk]}>{label}</Text>
    </PixelSurface>
  );
}

function ProviderButton({
  provider,
  label,
  disabled,
  busy,
  onPress,
}: {
  provider: OAuthProvider | "naver";
  label: string;
  disabled: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <PixelPressable
      variant="bevel"
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      accessibilityState={{ busy }}
      rootStyle={styles.providerRoot}
      contentStyle={styles.providerContent}
    >
      <PixelSurface variant="inset" style={styles.providerMark} contentStyle={styles.providerMarkContent}>
        <Text style={styles.providerMarkText}>{PROVIDER_MARK[provider]}</Text>
      </PixelSurface>
      <Text style={styles.providerText}>{label}</Text>
    </PixelPressable>
  );
}

function FooterLink({
  label,
  hint,
  disabled,
  onPress,
}: {
  label: string;
  hint: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <PixelPressable
      variant="frame"
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint={hint}
      rootStyle={styles.footerLinkRoot}
      contentStyle={styles.footerLinkContent}
    >
      <PixelGlyph name="article" color={m3.color.onSurfaceVariant} size={16} />
      <Text style={styles.footerLinkText}>{label}</Text>
    </PixelPressable>
  );
}

function SignUpToast({
  message,
  tone,
}: {
  message: string;
  tone: "info" | "success" | "danger";
}) {
  const background =
    tone === "danger"
      ? m3.color.errorContainer
      : tone === "success"
        ? m3.color.tertiaryContainer
        : m3.color.primaryContainer;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion={tone === "danger" ? "assertive" : "polite"}
    >
      <PixelSurface variant="frame" background={background} contentStyle={styles.toast}>
        <Text
          style={[
            styles.toastText,
            tone === "danger"
              ? styles.toastDanger
              : tone === "success"
                ? styles.toastSuccess
                : styles.toastInfo,
          ]}
        >
          {message}
        </Text>
      </PixelSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    gap: m3.spacing.s5,
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
  loadingMessage: { alignSelf: "stretch" },
  loadingSurface: {
    minHeight: m3.minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
  topBar: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: m3.spacing.s2,
  },
  squareAction: { width: m3.minTouch, minHeight: m3.minTouch },
  squareActionContent: {
    minHeight: m3.minTouch,
    alignItems: "center",
    justifyContent: "center",
    padding: m3.spacing.s2,
  },
  localeRoot: { minWidth: 56, minHeight: m3.minTouch },
  localeContent: {
    minHeight: m3.minTouch,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: m3.spacing.s2,
  },
  localeText: {
    color: m3.color.primary,
    fontFamily: m3.font.mono,
    fontSize: m3.type.labelLarge.size,
    lineHeight: m3.type.labelLarge.line,
    fontWeight: "700",
  },
  brand: {
    flex: 1,
    color: m3.color.primary,
    fontFamily: m3.font.mono,
    fontSize: m3.type.labelMedium.size,
    lineHeight: m3.type.labelMedium.line,
    fontWeight: "700",
    textAlign: "center",
  },
  heroSurface: { alignSelf: "stretch" },
  hero: { alignItems: "center", gap: m3.spacing.s2, padding: m3.spacing.s4 },
  headFrame: { width: 96, height: 96 },
  headContent: { flex: 1, alignItems: "center", justifyContent: "center", padding: m3.spacing.s2 },
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
  ageNotice: {
    color: m3.color.tertiary,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodySmall.size,
    lineHeight: m3.type.bodySmall.line,
    textAlign: "center",
  },
  judgeBadge: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s2,
  },
  judgeText: {
    color: m3.color.onTertiaryContainer,
    fontFamily: m3.font.mono,
    fontSize: m3.type.labelSmall.size,
    lineHeight: m3.type.labelSmall.line,
    fontWeight: "700",
  },
  sectionSurface: { alignSelf: "stretch" },
  sectionContent: { gap: m3.spacing.s3, padding: m3.spacing.s4 },
  sectionTitle: {
    color: m3.color.onSurface,
    fontFamily: m3.font.brand,
    fontSize: m3.type.titleMedium.size,
    lineHeight: m3.type.titleMedium.line,
    fontWeight: "700",
  },
  bodyText: {
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodyMedium.size,
    lineHeight: m3.type.bodyMedium.line,
  },
  formContent: { gap: m3.spacing.s3, padding: m3.spacing.s4 },
  label: {
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.brand,
    fontSize: m3.type.labelMedium.size,
    lineHeight: m3.type.labelMedium.line,
    fontWeight: "700",
  },
  inputSurface: { alignSelf: "stretch" },
  inputContent: {
    minHeight: 48,
    paddingHorizontal: 0,
    paddingVertical: 0,
    justifyContent: "center",
  },
  input: {
    minHeight: 48,
    paddingHorizontal: m3.spacing.s4,
    paddingVertical: m3.spacing.s2,
    color: m3.color.onSurface,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodyLarge.size,
    lineHeight: m3.type.bodyLarge.line,
  },
  codeInput: {
    minHeight: 48,
    paddingHorizontal: m3.spacing.s4,
    paddingVertical: m3.spacing.s2,
    color: m3.color.onSurface,
    fontFamily: m3.font.mono,
    fontSize: m3.type.titleLarge.size,
    lineHeight: m3.type.titleLarge.line,
    letterSpacing: m3.spacing.s2,
    textAlign: "center",
  },
  helper: {
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodySmall.size,
    lineHeight: m3.type.bodySmall.line,
  },
  checklist: { gap: m3.spacing.s2 },
  statusRow: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s2,
  },
  statusText: {
    flex: 1,
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodySmall.size,
    lineHeight: m3.type.bodySmall.line,
  },
  statusOk: { color: m3.color.onTertiaryContainer },
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
  errorText: { color: m3.color.onErrorContainer },
  linkContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: m3.spacing.s3,
  },
  linkText: {
    flexShrink: 1,
    color: m3.color.primary,
    fontFamily: m3.font.brand,
    fontSize: m3.type.labelLarge.size,
    lineHeight: m3.type.labelLarge.line,
    fontWeight: "700",
  },
  consentContent: { gap: m3.spacing.s2, padding: m3.spacing.s4 },
  minorBanner: { gap: m3.spacing.s2, padding: m3.spacing.s3 },
  minorText: {
    color: m3.color.onTertiaryContainer,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodySmall.size,
    lineHeight: m3.type.bodySmall.line,
  },
  groupLabel: {
    color: m3.color.primary,
    fontFamily: m3.font.mono,
    fontSize: m3.type.labelSmall.size,
    lineHeight: m3.type.labelSmall.line,
    fontWeight: "700",
  },
  consentRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: m3.spacing.s2,
  },
  consentToggleRoot: { flex: 1, minWidth: 0 },
  consentToggle: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s3,
    paddingHorizontal: m3.spacing.s3,
  },
  checkbox: { width: 28, height: 28 },
  checkboxContent: { flex: 1, alignItems: "center", justifyContent: "center", padding: 0 },
  consentText: {
    flex: 1,
    color: m3.color.onSurface,
    fontFamily: m3.font.brand,
    fontSize: m3.type.bodySmall.size,
    lineHeight: m3.type.bodySmall.line,
  },
  detailRoot: { width: 48, minHeight: 56 },
  detailContent: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    padding: m3.spacing.s2,
  },
  providerSection: { gap: m3.spacing.s3, padding: m3.spacing.s4 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: m3.spacing.s3 },
  dividerCell: { flex: 1, height: m3.spacing.s1, backgroundColor: m3.color.outlineVariant },
  dividerText: {
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.mono,
    fontSize: m3.type.labelSmall.size,
    lineHeight: m3.type.labelSmall.line,
  },
  providers: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    gap: m3.spacing.s2,
  },
  providerRoot: { flexBasis: "47%", flexGrow: 1, flexShrink: 1, minWidth: 112 },
  providerContent: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s2,
  },
  providerMark: { width: 32, height: 32 },
  providerMarkContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },
  providerMarkText: {
    color: m3.color.primary,
    fontFamily: m3.font.mono,
    fontSize: m3.type.labelMedium.size,
    lineHeight: m3.type.labelMedium.line,
    fontWeight: "700",
    textAlign: "center",
  },
  providerText: {
    flex: 1,
    flexShrink: 1,
    color: m3.color.onSurface,
    fontFamily: m3.font.brand,
    fontSize: m3.type.labelSmall.size,
    lineHeight: m3.type.labelSmall.line,
  },
  footerSurface: { alignSelf: "stretch" },
  footer: { gap: m3.spacing.s3, paddingHorizontal: 0 },
  footerCopy: { flex: 1, gap: m3.spacing.s1 },
  footerLinks: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    gap: m3.spacing.s2,
  },
  footerLinkRoot: { flexBasis: "47%", flexGrow: 1, flexShrink: 1, minWidth: 112 },
  footerLinkContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s2,
    paddingHorizontal: m3.spacing.s2,
  },
  footerLinkText: {
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
  toastDanger: { color: m3.color.onErrorContainer },
  toastSuccess: { color: m3.color.onTertiaryContainer },
  toastInfo: { color: m3.color.onPrimaryContainer },
});
