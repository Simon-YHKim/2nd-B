import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import Svg, { Circle, Line } from "react-native-svg";

import { colors, radius, spacing } from "@/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { SecondbHead, SecondbStatusHeader } from "@/components/deepspace";
import { useAuth } from "@/lib/auth/AuthContext";
import { useSignInForm } from "@/lib/auth/useSignInForm";
import { useSignUpForm } from "@/lib/auth/useSignUpForm";
import { useResetPasswordForm } from "@/lib/auth/useResetPasswordForm";
import {
  ageInYears,
  MIN_SELF_CONSENT_AGE,
  type OAuthProvider,
} from "@/lib/supabase/auth";
import {
  allRequiredAcksChecked,
  setAllRequiredAcks,
  type ConsentSelections,
} from "@/lib/auth/consent-selections";
import { formatBirthDateInput } from "@/lib/account/dob";
import { useProgression } from "@/lib/progression/useProgression";
import { systemLocaleFor } from "@/lib/i18n/locales";
import { fetchPrivacyPrefs, savePrivacyPrefs } from "@/lib/supabase/privacy";
import { recordHealthImportConsent } from "@/lib/supabase/consent";
import { healthImportAllowed, ingestHealthSamples } from "@/lib/health/ingest";
import { mockSamplesForRange } from "@/lib/health/sources/mock";
import { OPS_GROUP_IDS, domainsForGroup, type OpsDomainId, type OpsGroupId } from "@/lib/ops/domains";
import { opsRouteForDomain } from "@/lib/ops/nav";
import { recommendForDomain, recommendationsAllowed, type OpsRecommendation } from "@/lib/ops/recommend";
import { buildGoogleCalendarUrl } from "@/lib/ops/push";
import { notifyNow, scheduleRoutineReminder, type ReminderResult } from "@/lib/ops/reminders";
import {
  applyFocusSessionComplete,
  applyLanguageReviewComplete,
  createRoutineFromRecommendation,
  deriveReminder,
  listCompletionsSince,
  listTodayRoutines,
  localDayKey,
  logRoutineCompletion,
  weekStreak,
  type OpsRoutine,
} from "@/lib/ops/routines";
import { createCard, listDueCards, recordReview, type SrsCardRow } from "@/lib/srs/queries";
import type { SrsRating } from "@/lib/srs/scheduler";
import {
  createPomodoro,
  focusJustCompleted,
  pause,
  phaseJustChanged,
  reset,
  start,
  tick,
  type PomodoroState,
} from "@/lib/ops/pomodoro";
import { OPS_DAILY_LIMIT, bumpOpsUsage, readOpsUsage } from "@/lib/ops/usage";
import {
  deleteSource,
  listAllWikiLinks,
  listInferredLinkDetails,
  listSources,
  listWikiPages,
  ratifyLink,
  rejectInferredLink,
  updateSourceTags,
  type InferredLinkDetail,
} from "@/lib/wiki/queries";
import { generateSourcePage } from "@/lib/wiki/phase2";
import { runPhase1 } from "@/lib/wiki/phase1";
import { suggestedTags } from "@/lib/wiki/suggest-tags";
import { exportUserWiki } from "@/lib/wiki/export";
import { backfillEmbeddings, proposeAllRelatedLinks } from "@/lib/wiki/embeddings";
import { captureFromMarkdown } from "@/lib/wiki/capture";
import { pickImportFiles } from "@/lib/wiki/capture-file";
import { splitImportNotes, previewTitle } from "@/lib/wiki/import-notes";
import { exportIden } from "@/lib/iden/iden-export";
import { buildIdenDoc } from "@/lib/iden/build-iden";
import { deleteRecord, getRecordById, listRecentRecords } from "@/lib/records/create";
import type { SourceRow, WikiPageRow } from "@/lib/wiki/types";
import {
  buildDeepResearchView,
  buildDeepWikiView,
  buildDomainsView,
  recencyLabel,
  type RecencyLabels,
  type WikiEdge,
} from "./wiki-graph-view";
import {
  buildRecordsTimeline,
  relatedByTag,
  RECORD_KIND_ICON,
  type TimelineLabels,
  type TimelineRecord,
} from "./records-timeline";

// i18n label builders for the pure date helpers (which stay i18n-free).
type Tx = (key: string, options?: Record<string, unknown>) => string;
function dsTimeLabels(t: Tx): TimelineLabels {
  return {
    today: t("time.today"),
    yesterday: t("time.yesterday"),
    monthDay: (m, d) => t("time.monthDay", { month: m, day: d }),
    now: t("time.now"),
    hoursAgo: (h) => t("time.hoursAgo", { count: h }),
    fallbackTitle: t("time.recordFallback"),
  };
}
function dsRecencyLabels(t: Tx): RecencyLabels {
  return {
    today: t("time.today"),
    yesterday: t("time.yesterday"),
    daysAgo: (n) => t("time.daysAgo", { count: n }),
  };
}

type Row = { label: string; value?: string; onPress?: () => void; on?: boolean };

// Shared loader for the two graph-backed deep-space screens (/wiki + /research).
// Mirrors what the legacy /wiki loads: pages + the full edge set, both bounded.
// A links failure degrades to a zero-edge graph rather than blanking the screen.
function useWikiGraphData() {
  const { userId, loading: authLoading } = useAuth();
  const [pages, setPages] = useState<WikiPageRow[]>([]);
  const [edges, setEdges] = useState<WikiEdge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setLoading(true);
    Promise.all([
      listWikiPages(userId, { limit: 200 }),
      listAllWikiLinks(userId).catch(() => [] as WikiEdge[]),
    ])
      .then(([p, e]) => {
        if (!alive) return;
        setPages(p);
        setEdges(e);
      })
      .catch(() => {
        if (!alive) return;
        setPages([]);
        setEdges([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  return { userId, authLoading, pages, edges, loading };
}

function GraphLoading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.cyan} />
    </View>
  );
}

function Shell({ children, title, subtitle }: { children: ReactNode; title?: string; subtitle?: string }) {
  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.stars}><View style={[styles.star,{left:"12%",top:42}]} /><View style={[styles.star,{right:"18%",top:118,opacity:.55}]} /><View style={[styles.star,{left:"42%",bottom:92,opacity:.5}]} /></View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {title ? <View style={styles.titleRow}><Pressable onPress={() => router.back()}><Text style={styles.back}>‹</Text></Pressable><View><Text style={styles.title}>{title}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}</View></View> : null}
        {children}
      </ScrollView>
    </View>
  );
}

function Card({ children, style }: { children: ReactNode; style?: object }) { return <View style={[styles.card, style]}>{children}</View>; }
function Action({ label, value, onPress }: Row) { return <Pressable onPress={onPress} style={styles.action}><Text style={styles.actionLabel}>{label}</Text>{value ? <Text style={styles.actionValue}>{value}</Text> : <Text style={styles.chev}>›</Text>}</Pressable>; }
function Toggle({ label, value, on = true, onPress }: Row) {
  const body = (
    <>
      <View><Text style={styles.actionLabel}>{label}</Text>{value ? <Text style={styles.actionValue}>{value}</Text> : null}</View>
      <View style={[styles.toggle,on&&styles.toggleOn]}><View style={[styles.knob,on&&styles.knobOn]} /></View>
    </>
  );
  if (onPress) {
    return <Pressable style={styles.action} onPress={onPress} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={label}>{body}</Pressable>;
  }
  return <View style={styles.action}>{body}</View>;
}

export function DeepSpaceGraphDesignScreen() {
  const { t } = useTranslation("deepspace");
  const clusters = [
    { x: 63, y: 135, t: t("graph.clRecords") }, { x: 136, y: 92, t: t("graph.clRelations") }, { x: 219, y: 134, t: t("graph.clKnowledge") }, { x: 106, y: 226, t: t("graph.clTaste") }, { x: 207, y: 225, t: t("graph.clGrowth") },
  ];
  return <Shell title={t("graph.title")} subtitle={t("graph.subtitle", { nodes: 128, edges: 342 })}><SecondbStatusHeader text={t("graph.status")} tip={t("graph.tip")} /><Card style={styles.graphCard}><Svg width="100%" height={310} viewBox="0 0 300 310"><Circle cx={150} cy={160} r={34} fill={colors.soul} opacity={.95}/>{clusters.map((c,i)=><Line key={'l'+i} x1={150} y1={160} x2={c.x} y2={c.y} stroke={colors.borderHi} strokeWidth={1.4}/>) }{clusters.map((c,i)=><Circle key={'c'+i} cx={c.x} cy={c.y} r={22} fill={colors.cyan} opacity={.22}/>) }<Circle cx={150} cy={160} r={9} fill={colors.textHi}/>{[42,86,118,244,257,188,72].map((x,i)=><Circle key={i} cx={x} cy={70+i*30%190} r={4} fill={colors.cyanSoft} opacity={.75}/>)}</Svg><Text style={styles.centerCaption}>{t("graph.me")}</Text>{clusters.map((c)=><Text key={c.t} style={[styles.clusterLabel,{left:c.x-18,top:c.y+23}]}>{c.t}</Text>)}</Card><View style={styles.ctaRow}><Pressable style={styles.primary} onPress={() => router.push('/records')}><Text style={styles.primaryText}>{t("graph.viewClusters")}</Text></Pressable><Pressable style={styles.secondary} onPress={() => router.push('/research')}><Text style={styles.secondaryText}>{t("graph.findConnections")}</Text></Pressable></View></Shell>;
}

export function DeepSpaceIntegrationsScreen() { const { t } = useTranslation("deepspace"); return <Shell title={t("integrations.title")}><SecondbStatusHeader text={t("integrations.status")} tip={t("integrations.tip")} /><Card><Text style={styles.section}>{t("integrations.sectionAssistant")}</Text>{['ChatGPT','Claude','Gemini'].map((x)=><Action key={x} label={x} value={t("integrations.pending")} />)}</Card><Card><Text style={styles.section}>{t("integrations.sectionSources")}</Text><Toggle label="Notion" value={t("integrations.notionValue")} /><Toggle label="Obsidian" value={t("integrations.obsidianValue")} on={false} /><Toggle label={t("integrations.healthLabel")} value={t("integrations.permissionNeeded")} on={false} /></Card><Text style={styles.footer}>{t("integrations.footer")}</Text></Shell>; }

export function DeepSpaceSupportDesignScreen() { const { t } = useTranslation("deepspace"); return <Shell title={t("support.title")}><View style={styles.center}><SecondbHead size={104} mood="positive" /><Text style={styles.prompt}>{t("support.prompt")}</Text></View><Card>{[{label:t("support.askSecondb"),onPress:()=>router.push('/secondb')},{label:t("support.viewManual"),onPress:()=>router.push('/manual')},{label:t("support.emailUs"),onPress:()=>Linking.openURL('mailto:support@2nd-brain.app')},{label:t("support.reportBug"),onPress:()=>Linking.openURL('mailto:support@2nd-brain.app?subject=Bug%20report')}].map((r)=><Action key={r.label} {...r}/>)}</Card><Text style={styles.footer}>{t("support.footer")}</Text></Shell>; }

export function DeepSpaceAccountDesignScreen() { const { t } = useTranslation("deepspace"); const rows: [string, string][] = [[t("account.labelName"),'Simon Kim'],[t("account.labelEmail"),'simon@example.com'],[t("account.labelPassword"),t("account.valueChange")],[t("account.labelLinked"),'Google'],[t("account.labelLanguage"),t("account.valueLanguage")]]; return <Shell title={t("account.title")}><SecondbStatusHeader text={t("account.status")} tip={t("account.tip")} /><View style={styles.center}><View style={styles.avatar}><SecondbHead size={72} mood="neutral" /></View><Text style={styles.prompt}>Simon Kim</Text><Text style={styles.footer}>{t("account.joined", { date: "2026.06" })}</Text></View><Card>{rows.map(([label,value])=><Action key={label} label={label} value={value}/>)}</Card><Pressable style={styles.danger}><Text style={styles.dangerText}>{t("account.delete")}</Text></Pressable></Shell>; }

export function DeepSpacePrivacyDesignScreen() { const { t } = useTranslation("deepspace"); return <Shell title={t("privacy.title")}><SecondbStatusHeader text={t("privacy.status")} tip={t("privacy.tip")} /><Text style={styles.lead}>{t("privacy.lead")}</Text><Card><Toggle label={t("privacy.toggleAnalysis")} value={t("privacy.on")} /><Toggle label={t("privacy.toggleStats")} value={t("privacy.off")} on={false} /><Toggle label={t("privacy.toggleLock")} value={t("privacy.on")} /></Card><Card><Action label={t("privacy.policy")} value={t("privacy.view")}/><Action label={t("privacy.processingLog")} value={t("privacy.last7")}/><Action label={t("privacy.thirdParty")} value={t("privacy.none")}/></Card><Text style={styles.footer}>{t("privacy.footer")}</Text></Shell>; }

// Keyboard-aware shell for the auth screens (sign-in / sign-up / reset). The
// generic Shell above is for in-app graph screens and has no keyboard handling;
// auth forms need KeyboardAvoidingView + scroll padding (ANDROID_QA_GUIDELINES).
function AuthShell({ children }: { children: ReactNode }) {
  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.stars}>
        <View style={[styles.star, { left: "12%", top: 42 }]} />
        <View style={[styles.star, { right: "18%", top: 118, opacity: 0.55 }]} />
        <View style={[styles.star, { left: "42%", bottom: 92, opacity: 0.5 }]} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function AuthToast({ message, tone }: { message: string; tone: "info" | "success" | "danger" }) {
  const toneStyle =
    tone === "success" ? styles.authToastSuccess : tone === "danger" ? styles.authToastDanger : styles.authToastInfo;
  return (
    <View style={styles.authToastWrap} pointerEvents="none">
      <View style={[styles.authToast, toneStyle]} accessibilityRole="alert">
        <Text style={styles.authToastText}>{message}</Text>
      </View>
    </View>
  );
}

// Per-provider button label keys live in the auth namespace (full C7 parity),
// reused by both the legacy and deep-space presentations.
const PROVIDER_SIGNIN_KEY: Record<OAuthProvider, string> = {
  google: "auth:signIn.continueWithGoogle",
  apple: "auth:signIn.continueWithApple",
  kakao: "auth:signIn.continueWithKakao",
  facebook: "auth:signIn.continueWithFacebook",
  github: "auth:signIn.continueWithGithub",
};
const PROVIDER_SIGNUP_KEY: Record<OAuthProvider, string> = {
  google: "auth:signUp.continueWithGoogle",
  apple: "auth:signUp.continueWithApple",
  kakao: "auth:signUp.continueWithKakao",
  facebook: "auth:signUp.continueWithFacebook",
  github: "auth:signUp.continueWithGithub",
};

export function DeepSpaceSignInDesignScreen() {
  const { t } = useTranslation(["deepspace", "auth", "common"]);
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
    resetHelpVisible,
    resetSubmitting,
    resetEmailSentTo,
    visibleProviders,
    naverEnabled,
    handleSubmit,
    handleOAuth,
    handleNaver,
    handleForgotPassword,
  } = useSignInForm();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.cyan} />
      </View>
    );
  }
  if (userId) return <Redirect href="/" />;

  return (
    <AuthShell>
      <View style={styles.authHero}>
        <SecondbHead size={132} mood="positive" />
        <Text style={styles.big}>{t("deepspace:auth.appName")}</Text>
        <Text style={styles.lead}>{t("deepspace:auth.signInLead")}</Text>
      </View>
      <Card>
        <Text style={styles.authLabel}>{t("auth:signIn.email")}</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          placeholder="email@example.com"
          placeholderTextColor={colors.textLo}
          accessibilityLabel={t("auth:signIn.email")}
          style={styles.input}
        />
        <View style={styles.authLabelRow}>
          <Text style={styles.authLabel}>{t("auth:signIn.password")}</Text>
          <Pressable
            onPress={toggleShowPassword}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? t("auth:signIn.hidePasswordLabel") : t("auth:signIn.showPasswordLabel")}
            accessibilityState={{ selected: showPassword }}
            style={styles.eyeBtn}
          >
            <Text style={styles.eyeText}>{showPassword ? t("auth:signIn.hidePasswordLabel") : t("auth:signIn.showPasswordLabel")}</Text>
          </Pressable>
        </View>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoComplete="current-password"
          textContentType="password"
          placeholder="••••••••"
          placeholderTextColor={colors.textLo}
          accessibilityLabel={t("auth:signIn.password")}
          style={styles.input}
          returnKeyType="go"
          onSubmitEditing={() => {
            if (canSubmit) void handleSubmit();
          }}
        />
        <Pressable
          onPress={() => void handleSubmit()}
          disabled={!canSubmit}
          style={[styles.primary, !canSubmit && styles.btnDisabled]}
          accessibilityRole="button"
          accessibilityLabel={t("auth:signIn.submit")}
          accessibilityState={{ disabled: !canSubmit, busy: submitting }}
        >
          <Text style={styles.primaryText}>{submitting ? t("auth:signIn.submitting") : t("auth:signIn.submit")}</Text>
        </Pressable>

        <Pressable onPress={() => router.push("/sign-up")} style={styles.authLinkRow} accessibilityRole="link" accessibilityLabel={t("auth:signIn.signUpLink")}>
          <Text style={styles.link}>{t("deepspace:auth.noAccount")}</Text>
        </Pressable>

        {visibleProviders.length > 0 || naverEnabled ? (
          <View style={styles.authDividerRow}>
            <View style={styles.authDividerLine} />
            <Text style={styles.authDividerLabel}>{t("deepspace:auth.or")}</Text>
            <View style={styles.authDividerLine} />
          </View>
        ) : null}

        {visibleProviders.map((provider) => (
          <Pressable
            key={provider}
            onPress={() => void handleOAuth(provider)}
            disabled={oauthSubmitting || submitting}
            style={[styles.providerBtn, (oauthSubmitting || submitting) && styles.btnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t(PROVIDER_SIGNIN_KEY[provider])}
            accessibilityState={{ disabled: oauthSubmitting || submitting, busy: oauthSubmitting }}
          >
            <Text style={styles.providerBtnText}>{oauthSubmitting ? "…" : t(PROVIDER_SIGNIN_KEY[provider])}</Text>
          </Pressable>
        ))}
        {naverEnabled ? (
          <Pressable
            onPress={handleNaver}
            disabled={oauthSubmitting || submitting}
            style={[styles.providerBtn, (oauthSubmitting || submitting) && styles.btnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t("auth:signIn.continueWithNaver")}
          >
            <Text style={styles.providerBtnText}>{t("auth:signIn.continueWithNaver")}</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => void handleForgotPassword()}
          disabled={resetSubmitting}
          hitSlop={14}
          style={[styles.authForgotRow, resetSubmitting && styles.btnDisabled]}
          accessibilityRole="button"
          accessibilityLabel={t("auth:signIn.resetLabel")}
          accessibilityState={{ disabled: resetSubmitting, busy: resetSubmitting }}
        >
          <Text style={styles.authHelper}>{resetSubmitting ? t("auth:signIn.resetSending") : t("deepspace:auth.forgotPassword")}</Text>
        </Pressable>

        {resetHelpVisible ? (
          <View style={styles.authHelpCard} accessibilityRole="alert">
            <Text style={styles.authHelpTitle}>{resetEmailSentTo ? t("auth:signIn.resetSentTitle") : t("auth:signIn.resetTitle")}</Text>
            <Text style={styles.authHelpBody}>
              {resetEmailSentTo ? t("auth:signIn.resetSentBody", { email: resetEmailSentTo }) : t("auth:signIn.resetBody")}
            </Text>
          </View>
        ) : null}
      </Card>
      {toast ? <AuthToast message={toast.message} tone={toast.tone} /> : null}
    </AuthShell>
  );
}

// Deep-space consent block: drives the SAME ConsentSelections state + helpers the
// legacy ConsentNotice uses, so the C10 ledger (buildSignUpConsentArgs in the
// hook) is byte-for-byte equivalent. Copy comes from the reviewed `consent`
// namespace (notice.*). Styling is deep-space tokens only.
function ConsentCheckRow({ checked, label, emphasize, onToggle }: { checked: boolean; label: string; emphasize?: boolean; onToggle: () => void }) {
  return (
    <Pressable
      style={styles.consentRow}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
    >
      <View style={[styles.consentCheckbox, checked && styles.consentCheckboxOn]}>
        {checked ? <Text style={styles.consentCheckmark}>✓</Text> : null}
      </View>
      <Text style={[styles.consentLabel, emphasize && { color: colors.textTitle }]}>{label}</Text>
    </Pressable>
  );
}

function DeepSpaceConsentBlock({ minor, value, onChange }: { minor: boolean; value: ConsentSelections; onChange: (next: ConsentSelections) => void }) {
  const { t } = useTranslation("consent");
  const allChecked = allRequiredAcksChecked(value);
  const toggle = (key: keyof ConsentSelections) => onChange({ ...value, [key]: !value[key] });
  return (
    <Card>
      <Text style={styles.section}>{t("notice.title")}</Text>
      <Text style={styles.consentIntro}>{t("notice.intro")}</Text>
      {minor ? (
        <View style={styles.minorBanner}>
          <Text style={styles.minorBannerText}>{t("notice.minorBanner")}</Text>
        </View>
      ) : null}
      <Text style={styles.consentGroupLabel}>{t("notice.requiredLabel")}</Text>
      <ConsentCheckRow checked={allChecked} label={t("notice.agreeAll")} emphasize onToggle={() => onChange(setAllRequiredAcks(value, !allChecked))} />
      <View style={styles.consentDivider} />
      <ConsentCheckRow checked={value.service} label={t("notice.ackService")} onToggle={() => toggle("service")} />
      <ConsentCheckRow checked={value.llmProcessing} label={t("notice.ackLlm")} onToggle={() => toggle("llmProcessing")} />
      <ConsentCheckRow checked={value.overseasTransfer} label={t("notice.ackOverseas")} onToggle={() => toggle("overseasTransfer")} />
      <ConsentCheckRow checked={value.sensitiveData} label={t("notice.ackSensitive")} onToggle={() => toggle("sensitiveData")} />
      <Text style={styles.consentGroupLabel}>{t("notice.optionalLabel")}</Text>
      <ConsentCheckRow checked={value.marketing} label={t("notice.optMarketing")} onToggle={() => toggle("marketing")} />
    </Card>
  );
}

export function DeepSpaceSignUpDesignScreen() {
  const { t } = useTranslation(["deepspace", "auth", "common"]);
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
    isMinorAge,
    canSubmit,
    oauthSubmitting,
    existingAccountHelp,
    visibleProviders,
    naverEnabled,
    handleSubmit,
    handleOAuth,
    handleNaver,
  } = useSignUpForm();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.cyan} />
      </View>
    );
  }
  if (userId && !submitting && !judgeWelcome && !toast) return <Redirect href="/" />;

  const birthOk = ageInYears(birthDate) >= MIN_SELF_CONSENT_AGE;
  const showChecklist = email.length > 0 || password.length > 0 || birthDate.length > 0;

  return (
    <AuthShell>
      <View style={styles.authHero}>
        <SecondbHead size={120} mood="neutral" />
        <Text style={styles.big}>{t("deepspace:auth.signUpTitle")}</Text>
        <Text style={styles.lead}>{t("deepspace:auth.signUpLead")}</Text>
        <Text style={styles.authHelper}>{t("deepspace:auth.ageNotice")}</Text>
      </View>
      <Card>
        <Text style={styles.authLabel}>{t("auth:signUp.email")}</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          placeholder="email@example.com"
          placeholderTextColor={colors.textLo}
          accessibilityLabel={t("auth:signUp.email")}
          style={styles.input}
        />
        <Text style={styles.authLabel}>{t("auth:signUp.password")}</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          placeholder="••••••••"
          placeholderTextColor={colors.textLo}
          accessibilityLabel={t("auth:signUp.password")}
          style={styles.input}
        />
        <Text style={styles.authHelper}>{t("auth:signUp.passwordHelper")}</Text>
        <Text style={styles.authLabel}>{t("auth:signUp.birthDate")}</Text>
        <TextInput
          value={birthDate}
          onChangeText={(next) => setBirthDate(formatBirthDateInput(next))}
          autoCapitalize="none"
          keyboardType="number-pad"
          maxLength={10}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textLo}
          accessibilityLabel={t("auth:signUp.birthDate")}
          accessibilityHint={t("auth:signUp.birthDateHelper")}
          style={styles.input}
        />
        <Text style={styles.authHelper}>{t("auth:signUp.birthDateHelper")}</Text>

        {showChecklist ? (
          <View style={{ gap: 6 }}>
            <View style={styles.checklistRow}>
              <View style={[styles.checklistDot, { backgroundColor: email.includes("@") ? colors.mint : colors.textLo }]} />
              <Text style={[styles.checklistText, { color: email.includes("@") ? colors.mint : colors.textMid }]}>
                {email.includes("@") ? t("auth:signUp.checkEmail") : t("auth:signUp.checkEmailMissing")}
              </Text>
            </View>
            <View style={styles.checklistRow}>
              <View style={[styles.checklistDot, { backgroundColor: password.length >= 8 ? colors.mint : colors.textLo }]} />
              <Text style={[styles.checklistText, { color: password.length >= 8 ? colors.mint : colors.textMid }]}>
                {password.length >= 8 ? t("auth:signUp.checkPassword") : t("auth:signUp.checkPasswordShort")}
              </Text>
            </View>
            <View style={styles.checklistRow}>
              <View style={[styles.checklistDot, { backgroundColor: birthOk ? colors.mint : colors.textLo }]} />
              <Text style={[styles.checklistText, { color: birthOk ? colors.mint : colors.textMid }]}>
                {birthOk ? t("auth:signUp.checkAge") : t("auth:signUp.checkAgeBlocked")}
              </Text>
            </View>
          </View>
        ) : null}
      </Card>

      <DeepSpaceConsentBlock minor={isMinorAge} value={consent} onChange={setConsent} />

      {existingAccountHelp ? (
        <View style={styles.authHelpCard} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Text style={styles.authHelpTitle}>{t("auth:signUp.existingAccountTitle")}</Text>
          <Text style={styles.authHelpBody}>{t("auth:signUp.existingAccountBody")}</Text>
          <Pressable style={styles.providerBtn} onPress={() => router.push("/sign-in")} accessibilityRole="button" accessibilityLabel={t("auth:signUp.existingAccountSignIn")}>
            <Text style={styles.providerBtnText}>{t("auth:signUp.existingAccountSignIn")}</Text>
          </Pressable>
        </View>
      ) : null}

      <Card>
        {visibleProviders.length > 0 || naverEnabled ? (
          <View style={styles.authDividerRow}>
            <View style={styles.authDividerLine} />
            <Text style={styles.authDividerLabel}>{t("deepspace:auth.or")}</Text>
            <View style={styles.authDividerLine} />
          </View>
        ) : null}
        {visibleProviders.map((provider) => (
          <Pressable
            key={provider}
            onPress={() => void handleOAuth(provider)}
            disabled={oauthSubmitting || submitting}
            style={[styles.providerBtn, (oauthSubmitting || submitting) && styles.btnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t(PROVIDER_SIGNUP_KEY[provider])}
            accessibilityState={{ disabled: oauthSubmitting || submitting, busy: oauthSubmitting }}
          >
            <Text style={styles.providerBtnText}>{t(PROVIDER_SIGNUP_KEY[provider])}</Text>
          </Pressable>
        ))}
        {naverEnabled ? (
          <Pressable
            onPress={handleNaver}
            disabled={oauthSubmitting || submitting}
            style={[styles.providerBtn, (oauthSubmitting || submitting) && styles.btnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t("auth:signUp.continueWithNaver")}
          >
            <Text style={styles.providerBtnText}>{t("auth:signUp.continueWithNaver")}</Text>
          </Pressable>
        ) : null}
      </Card>

      <Pressable
        onPress={() => void handleSubmit()}
        disabled={!canSubmit}
        style={[styles.primary, !canSubmit && styles.btnDisabled]}
        accessibilityRole="button"
        accessibilityLabel={t("auth:signUp.submit")}
        accessibilityState={{ disabled: !canSubmit, busy: submitting }}
      >
        <Text style={styles.primaryText}>{t("auth:signUp.submit")}</Text>
      </Pressable>

      <Pressable onPress={() => router.push("/sign-in")} style={styles.authLinkRow} accessibilityRole="link" accessibilityLabel={t("auth:signUp.signInLink")}>
        <Text style={styles.link}>{t("deepspace:auth.haveAccount")}</Text>
      </Pressable>
      {toast ? <AuthToast message={toast.message} tone={toast.tone} /> : null}
    </AuthShell>
  );
}

export function DeepSpaceResetPasswordDesignScreen() {
  const { t } = useTranslation(["deepspace", "auth", "common"]);
  const {
    userId,
    loading,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    submitting,
    complete,
    toast,
    helperKey,
    canSubmit,
    handleSubmit,
  } = useResetPasswordForm();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.cyan} />
      </View>
    );
  }

  const helperDanger = helperKey !== "resetPassword.passwordHelper";

  return (
    <AuthShell>
      <View style={styles.authHero}>
        <SecondbHead size={120} mood={complete ? "positive" : "neutral"} />
        <Text style={styles.big}>{complete ? t("auth:resetPassword.doneTitle") : t("auth:resetPassword.title")}</Text>
        <Text style={styles.lead}>{complete ? t("auth:resetPassword.doneSubtitle") : t("auth:resetPassword.subtitle")}</Text>
      </View>
      <Card>
        {!userId ? (
          <>
            <Text style={styles.authHelpTitle}>{t("auth:resetPassword.expiredTitle")}</Text>
            <Text style={styles.authHelpBody}>{t("auth:resetPassword.expiredBody")}</Text>
            <Pressable style={styles.providerBtn} onPress={() => router.replace("/sign-in")} accessibilityRole="link" accessibilityLabel={t("auth:resetPassword.backToSignIn")}>
              <Text style={styles.providerBtnText}>{t("auth:resetPassword.backToSignIn")}</Text>
            </Pressable>
          </>
        ) : complete ? (
          <Pressable style={styles.primary} onPress={() => router.replace("/")} accessibilityRole="button" accessibilityLabel={t("auth:resetPassword.continue")}>
            <Text style={styles.primaryText}>{t("auth:resetPassword.continue")}</Text>
          </Pressable>
        ) : (
          <>
            <Text style={styles.authLabel}>{t("auth:resetPassword.newPassword")}</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              placeholder="••••••••"
              placeholderTextColor={colors.textLo}
              accessibilityLabel={t("auth:resetPassword.newPassword")}
              style={styles.input}
            />
            <Text style={styles.authLabel}>{t("auth:resetPassword.confirmPassword")}</Text>
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              placeholder="••••••••"
              placeholderTextColor={colors.textLo}
              accessibilityLabel={t("auth:resetPassword.confirmPassword")}
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (canSubmit) void handleSubmit();
              }}
            />
            <Text style={[styles.authHelper, helperDanger && styles.authDanger]}>{t(`auth:${helperKey}`)}</Text>
            <Pressable
              onPress={() => void handleSubmit()}
              disabled={!canSubmit}
              style={[styles.primary, !canSubmit && styles.btnDisabled]}
              accessibilityRole="button"
              accessibilityLabel={t("auth:resetPassword.submit")}
              accessibilityState={{ disabled: !canSubmit, busy: submitting }}
            >
              <Text style={styles.primaryText}>{submitting ? t("auth:resetPassword.submitting") : t("auth:resetPassword.submit")}</Text>
            </Pressable>
          </>
        )}
      </Card>
      {toast ? <AuthToast message={toast.message} tone={toast.tone} /> : null}
    </AuthShell>
  );
}

export function DeepSpaceInsightsScreen() {
  const { t } = useTranslation("deepspace");
  return (
    <Shell title={t("insights.title")}>
      <SecondbStatusHeader text={t("insights.status")} tip={t("insights.tip")} mood="positive" />
      <Card>
        <Text style={styles.section}>{t("insights.sectionNow")}</Text>
        <Text style={styles.lead}>{t("insights.lead")}</Text>
        <Text style={styles.footer}>{t("insights.weeklyCap")}</Text>
        <View style={styles.compareRow}>
          <View style={styles.compareCol}><Text style={styles.compareNum}>18</Text><Text style={styles.compareCap}>{t("insights.lastWeek")}</Text></View>
          <Text style={styles.chev}>›</Text>
          <View style={styles.compareCol}><Text style={[styles.compareNum, styles.compareNumHi]}>31</Text><Text style={styles.compareCap}>{t("insights.thisWeek")}</Text></View>
        </View>
        <Text style={styles.delta}>{t("insights.delta", { percent: 72 })}</Text>
      </Card>
      <Card>
        <Text style={styles.section}>{t("insights.sectionFinding")}</Text>
        <Text style={styles.lead}>{t("insights.finding")}</Text>
      </Card>
    </Shell>
  );
}

export function DeepSpaceDataDesignScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const { userId, isMinor } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const [indexing, setIndexing] = useState(false);
  const [indexed, setIndexed] = useState<number | null>(null);

  async function buildIndex() {
    if (!userId || indexing) return;
    setIndexing(true);
    setIndexed(null);
    try {
      const r = await backfillEmbeddings(userId, { locale, minor: isMinor === true });
      setIndexed(r.embedded);
    } catch {
      setIndexed(0);
    } finally {
      setIndexing(false);
    }
  }

  const indexValue = indexing
    ? t("data.indexing")
    : indexed !== null
      ? t("data.indexed", { count: indexed })
      : undefined;

  return (
    <Shell title={t("data.title")} subtitle={t("data.subtitle")}>
      <SecondbStatusHeader text={t("data.status")} tip={t("data.tip")} />
      <View style={styles.statRow}>
        <View style={styles.statBox}><Text style={styles.statNum}>412</Text><Text style={styles.statCap}>{t("data.statPieces")}</Text></View>
        <View style={styles.statBox}><Text style={styles.statNum}>7</Text><Text style={styles.statCap}>{t("data.statChecks")}</Text></View>
      </View>
      <Card>
        <Text style={styles.section}>{t("data.sectionStorage")}</Text>
        <Action label={t("data.onDevice")} value={t("data.encrypted")} />
        <Action label={t("data.cloudSync")} value={t("data.on")} />
      </Card>
      <Card>
        <Action label={t("data.buildIndex")} value={indexValue} onPress={userId && !indexing ? () => void buildIndex() : undefined} />
        <Action label={t("data.exportAll")} onPress={() => router.push("/formats")} />
        <Action label={t("data.deleteAll")} />
      </Card>
    </Shell>
  );
}

export function DeepSpaceThemeScreen() {
  const { t } = useTranslation("deepspace");
  return (
    <Shell title={t("theme.title")}>
      <SecondbStatusHeader text={t("theme.status")} tip={t("theme.tip")} />
      <Card>
        <Text style={styles.section}>{t("theme.sectionTheme")}</Text>
        <Action label={t("theme.themeDeepspace")} value="✓" />
        <Action label={t("theme.themeMidnight")} />
      </Card>
      <Card>
        <Text style={styles.section}>{t("theme.sectionFont")}</Text>
        <Action label={t("theme.fontPixel")} value="✓" />
        <Action label={t("theme.fontReadable")} />
      </Card>
      <Card>
        <Text style={styles.section}>{t("theme.sectionSize")}</Text>
        <View style={styles.sizeRow}>
          <Text style={styles.sizeCap}>{t("theme.small")}</Text>
          <View style={styles.sizeTrack}><View style={styles.sizeKnob} /></View>
          <Text style={styles.sizeCapLg}>{t("theme.large")}</Text>
        </View>
        <Toggle label={t("theme.reduceMotion")} on={false} />
      </Card>
    </Shell>
  );
}

export function DeepSpaceManualScreen() {
  const { t } = useTranslation("deepspace");
  return (
    <Shell title={t("manual.title")}>
      <SecondbStatusHeader text={t("manual.status")} tip={t("manual.tip")} />
      <View style={styles.searchBox}><Text style={styles.searchText}>{t("manual.search")}</Text></View>
      <Card>
        <Text style={styles.section}>{t("manual.sectionStart")}</Text>
        <Action label={t("manual.q1")} />
        <Action label={t("manual.q2")} />
        <Action label={t("manual.q3")} />
      </Card>
      <Card>
        <Text style={styles.section}>{t("manual.sectionData")}</Text>
        <Action label={t("manual.q4")} />
        <Action label={t("manual.q5")} />
        <Action label={t("manual.askDirect")} onPress={() => router.push('/secondb')} />
      </Card>
    </Shell>
  );
}

export function DeepSpacePlansScreen() {
  const { t } = useTranslation("deepspace");
  const proFeats = [t("plans.proFeat1"), t("plans.proFeat2"), t("plans.proFeat3"), t("plans.proFeat4")];
  return (
    <Shell title={t("plans.title")}>
      <SecondbStatusHeader text={t("plans.status")} tip={t("plans.tip")} mood="positive" />
      <Card style={styles.planPro}>
        <View style={styles.planHead}><Text style={styles.planName}>Pro</Text><Text style={styles.planBadge}>{t("plans.recommended")}</Text></View>
        <Text style={styles.planPrice}>₩9,900 <Text style={styles.planPer}>{t("plans.perMonth")}</Text></Text>
        {proFeats.map((x) => <Text key={x} style={styles.planFeat}>✦ {x}</Text>)}
      </Card>
      <Card>
        <View style={styles.planHead}><Text style={styles.planName}>Free</Text><Text style={styles.footer}>{t("plans.currentPlan")}</Text></View>
        <Text style={styles.planFeatDim}>{t("plans.freeFeat")}</Text>
      </Card>
      <Pressable style={styles.primary}><Text style={styles.primaryText}>{t("plans.startPro")}</Text></Pressable>
    </Shell>
  );
}

export function DeepSpacePermissionsScreen() {
  const { t } = useTranslation("deepspace");
  return (
    <Shell title={t("permissions.title")}>
      <SecondbStatusHeader text={t("permissions.status")} tip={t("permissions.tip")} />
      <Card>
        <Toggle label={t("permissions.notif")} value={t("permissions.notifValue")} />
        <Toggle label={t("permissions.photo")} value={t("permissions.photoValue")} on={false} />
        <Toggle label={t("permissions.mic")} value={t("permissions.micValue")} on={false} />
      </Card>
      <Pressable style={styles.primary}><Text style={styles.primaryText}>{t("permissions.continue")}</Text></Pressable>
    </Shell>
  );
}

export function DeepSpaceDiscoverScreen() {
  const { t } = useTranslation("deepspace");
  return (
    <Shell title={t("discover.title")}>
      <SecondbStatusHeader text={t("discover.status")} tip={t("discover.tip")} mood="positive" />
      <Text style={styles.lead}>{t("discover.lead")}</Text>
      <Card>
        <View style={styles.trendHead}><Text style={styles.section}>{t("discover.card1Head")}</Text><Text style={styles.delta}>{t("discover.card1Delta", { percent: 32 })}</Text></View>
        <Text style={styles.planFeatDim}>{t("discover.card1Body")}</Text>
      </Card>
      <Card>
        <View style={styles.trendHead}><Text style={styles.section}>{t("discover.card2Head")}</Text><Text style={styles.delta}>{t("discover.card2Delta", { percent: 18 })}</Text></View>
        <Text style={styles.planFeatDim}>{t("discover.card2Body")}</Text>
      </Card>
      <Text style={styles.footer}>{t("discover.footer")}</Text>
    </Shell>
  );
}

export function DeepSpaceReviewScreen() {
  const { t } = useTranslation("deepspace");
  return (
    <Shell title={t("review.title")}>
      <SecondbStatusHeader text={t("review.status")} tip={t("review.tip")} />
      <Text style={styles.lead}>{t("review.lead")}</Text>
      <Card>
        <Text style={styles.section}>{t("review.section")}</Text>
        <Text style={styles.planFeatDim}>{t("review.body")}</Text>
        <View style={styles.compareRow}>
          <View style={styles.compareCol}><Text style={styles.compareCap}>{t("review.now")}</Text><Text style={styles.compareNum}>61</Text></View>
          <Text style={styles.chev}>›</Text>
          <View style={styles.compareCol}><Text style={styles.compareCap}>{t("review.suggest")}</Text><Text style={[styles.compareNum, styles.compareNumHi]}>68</Text></View>
        </View>
        <Text style={styles.footer}>{t("review.evidence", { count: 5 })}</Text>
      </Card>
      <Text style={styles.footer}>{t("review.footer")}</Text>
      <View style={styles.ctaRow}>
        <Pressable style={styles.secondary}><Text style={styles.secondaryText}>{t("review.hold")}</Text></Pressable>
        <Pressable style={styles.primary}><Text style={styles.primaryText}>{t("review.approve")}</Text></Pressable>
      </View>
    </Shell>
  );
}

function FilterChip({ label, active, violet, onPress }: { label: string; active?: boolean; violet?: boolean; onPress?: () => void }) {
  const inner = (
    <Text style={[styles.fchipText, active && styles.fchipTextActive, violet && styles.fchipTextViolet]}>{label}</Text>
  );
  const chipStyle = [styles.fchip, active && styles.fchipActive, violet && styles.fchipViolet];
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={chipStyle}
        accessibilityRole="button"
        accessibilityState={{ selected: !!active }}
        accessibilityLabel={label}
      >
        {inner}
      </Pressable>
    );
  }
  return <View style={chipStyle}>{inner}</View>;
}

function TimelineRow({ icon, title, time, tag, dim }: { icon: string; title: string; time?: string; tag?: string; dim?: boolean }) {
  return (
    <View style={{ gap: 5 }}>
      <View style={styles.tlRow}>
        <View style={[styles.tlDot, dim && styles.tlDotDim]} />
        <Text style={styles.tlIcon}>{icon}</Text>
        <Text style={[styles.tlTitle, dim && styles.tlTitleDim]} numberOfLines={1}>{title}</Text>
        {time ? <Text style={styles.tlTime}>{time}</Text> : null}
      </View>
      {tag ? <View style={styles.tlTagRow}><Text style={styles.tlTag}>{tag}</Text></View> : null}
    </View>
  );
}

const RECORD_KIND_FILTERS: { id: TimelineRecord["kind"] | null; labelKey: string }[] = [
  { id: null, labelKey: "records.filterAll" },
  { id: "journal", labelKey: "records.filterJournal" },
  { id: "note", labelKey: "records.filterNote" },
  { id: "audit_response", labelKey: "records.filterAudit" },
];

export function DeepSpaceRecordsScreen() {
  const { t } = useTranslation("deepspace");
  const { userId, loading: authLoading } = useAuth();
  const [records, setRecords] = useState<TimelineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<TimelineRecord["kind"] | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setLoading(true);
    listRecentRecords(userId)
      .then((rows) => {
        if (alive) setRecords(rows as TimelineRecord[]);
      })
      .catch(() => {
        if (alive) setRecords([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  const groups = useMemo(() => {
    const filtered = kind === null ? records : records.filter((r) => r.kind === kind);
    return buildRecordsTimeline(filtered, { labels: dsTimeLabels(t) });
  }, [records, kind, t]);

  if (authLoading) {
    return <Shell title={t("records.title")}><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const total = records.length;
  return (
    <Shell title={t("records.title")}>
      <SecondbStatusHeader
        text={total > 0 ? t("records.headerCount", { count: total }) : t("records.headerEmpty")}
        tip={t("records.tip")}
      />
      <Text style={styles.lead}>{t("records.lead")}</Text>
      <View style={styles.filterRow}>
        {RECORD_KIND_FILTERS.map((f) => (
          <FilterChip
            key={f.labelKey}
            label={t(f.labelKey)}
            active={kind === f.id}
            onPress={() => setKind(f.id)}
          />
        ))}
      </View>
      {loading ? (
        <GraphLoading />
      ) : groups.length === 0 ? (
        <View style={styles.wikiPageOpen}>
          <Text style={styles.wikiBody}>{kind === null ? t("records.emptyAll") : t("records.emptyKind")}</Text>
          <Pressable style={styles.primary} onPress={() => router.push("/capture")}>
            <Text style={styles.primaryText}>{t("wiki.addPiece")}</Text>
          </Pressable>
        </View>
      ) : (
        groups.map((g) => (
          <View key={g.label}>
            <Text style={styles.tlLabel}>{g.label}</Text>
            <View style={styles.tlGroup}>
              {g.items.map((it) => (
                <TimelineRow key={it.id} icon={it.icon} title={it.title} time={it.timeLabel || undefined} tag={it.tag} dim={it.dim} />
              ))}
            </View>
          </View>
        ))
      )}
    </Shell>
  );
}

const SOURCE_KIND_ICON: Record<string, string> = {
  inbox: "✎",
  article: "🔗",
  video: "🎬",
  paper: "📄",
  reddit: "💬",
  code: "⌨",
  ai_tool: "🤖",
  self_knowledge: "🪞",
};

function sourceTitle(s: SourceRow, fallback: string): string {
  const title = s.title?.trim();
  return title && title.length > 0 ? title : fallback;
}

export function DeepSpaceInboxScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const { userId, loading: authLoading, isMinor } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [suggestBusyId, setSuggestBusyId] = useState<string | null>(null);

  const load = useMemo(
    () => async (uid: string) => {
      const rows = await listSources(uid, { ingested: false, limit: 50 });
      setSources(rows);
    },
    [],
  );

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setLoading(true);
    load(userId)
      .catch(() => {
        if (alive) setSources([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userId, load]);

  async function promote(s: SourceRow) {
    if (!userId) return;
    setBusyId(s.id);
    try {
      await generateSourcePage(userId, s.id);
      await load(userId);
    } catch {
      // best-effort; the row stays in the queue to retry
    } finally {
      setBusyId(null);
    }
  }

  async function discard(s: SourceRow) {
    if (!userId) return;
    setBusyId(s.id);
    try {
      await deleteSource(userId, s.id);
      await load(userId);
    } catch {
      // best-effort
    } finally {
      setBusyId(null);
    }
  }

  // Accept one AI-suggested tag onto the source before promotion.
  async function acceptTag(s: SourceRow, tag: string) {
    if (!userId || s.tags.includes(tag)) return;
    setBusyId(s.id);
    try {
      await updateSourceTags(userId, s.id, [...s.tags, tag]);
      await load(userId);
    } catch {
      // best-effort; the tag just doesn't stick
    } finally {
      setBusyId(null);
    }
  }

  // On-demand Phase 1 (C1/C3/C9 inside) so the suggestion chips have something
  // to show when nothing was extracted at capture time.
  async function getSuggestions(s: SourceRow) {
    if (!userId) return;
    setSuggestBusyId(s.id);
    try {
      await runPhase1({ userId, sourceId: s.id, locale, minor: isMinor === true });
      await load(userId);
    } catch {
      // best-effort; the button can be tapped again
    } finally {
      setSuggestBusyId(null);
    }
  }

  if (authLoading) {
    return <Shell title={t("inbox.title")}><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const pending = sources.length;
  const [current, ...queue] = sources;
  const suggestions = current ? suggestedTags(current) : [];

  return (
    <Shell title={t("inbox.title")}>
      <SecondbStatusHeader
        text={pending > 0 ? t("inbox.headerPending", { count: pending }) : t("inbox.headerEmpty")}
        tip={t("inbox.tip")}
      />
      {loading ? (
        <GraphLoading />
      ) : pending === 0 ? (
        <View style={styles.wikiPageOpen}>
          <Text style={styles.wikiBody}>{t("inbox.emptyDone")}</Text>
          <Pressable style={styles.primary} onPress={() => router.push("/capture")}>
            <Text style={styles.primaryText}>{t("wiki.addPiece")}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={styles.lead}>{t("inbox.remaining", { count: pending })}</Text>
          <Card style={styles.triageCard}>
            <View style={styles.triageMeta}>
              <Text style={styles.tlIcon}>{SOURCE_KIND_ICON[current.kind] ?? "•"}</Text>
              <Text style={styles.metaLabel}>{current.kind}</Text>
            </View>
            <Text style={styles.triageBody} numberOfLines={3}>{sourceTitle(current, t("inbox.untitled"))}</Text>
            {current.tags.length > 0 ? (
              <View style={styles.filterRow}>
                {current.tags.slice(0, 6).map((tag) => (
                  <FilterChip key={tag} label={`#${tag}`} active />
                ))}
              </View>
            ) : null}
            {suggestions.length > 0 ? (
              <>
                <Text style={styles.footerLeft}>{t("inbox.suggestedLabel")}</Text>
                <View style={styles.filterRow}>
                  {suggestions.map((tag) => (
                    <FilterChip
                      key={tag}
                      label={`+ ${tag}`}
                      onPress={() => void acceptTag(current, tag)}
                    />
                  ))}
                </View>
              </>
            ) : (
              <Pressable
                onPress={() => void getSuggestions(current)}
                disabled={busyId !== null || suggestBusyId !== null}
                style={styles.smallBtnGhost}
                accessibilityRole="button"
                accessibilityLabel={t("inbox.getSuggestions")}
              >
                <Text style={styles.smallBtnGhostText}>
                  {suggestBusyId === current.id ? t("inbox.gettingSuggestions") : t("inbox.getSuggestions")}
                </Text>
              </Pressable>
            )}
            <View style={styles.ctaRow}>
              <Pressable
                style={styles.iconBtn}
                onPress={() => void discard(current)}
                disabled={busyId !== null}
                accessibilityRole="button"
                accessibilityLabel={t("inbox.a11yDiscard")}
              >
                <Text style={styles.iconBtnText}>🗑</Text>
              </Pressable>
              <Pressable
                style={styles.primary}
                onPress={() => void promote(current)}
                disabled={busyId !== null}
                accessibilityRole="button"
                accessibilityLabel={t("inbox.a11yArchive")}
              >
                <Text style={styles.primaryText}>{busyId === current.id ? t("inbox.archiving") : t("inbox.archive")}</Text>
              </Pressable>
            </View>
          </Card>
          {queue.length > 0 ? (
            <>
              <Text style={styles.tlLabel}>{t("inbox.nextUp")}</Text>
              <View style={{ gap: 7 }}>
                {queue.slice(0, 8).map((s, i) => (
                  <View key={s.id} style={[styles.queueItem, i > 0 && styles.queueItemDim]}>
                    <Text style={styles.tlIcon}>{SOURCE_KIND_ICON[s.kind] ?? "•"}</Text>
                    <Text style={styles.queueText} numberOfLines={1}>{sourceTitle(s, t("inbox.untitled"))}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </>
      )}
    </Shell>
  );
}

// Fixed satellite slots around the central god-node; we light up as many as
// there are real hubs (capped at 4). STEP 3 will replace this with true
// clusters — for now it honestly mirrors the top-cited pages.
const RESEARCH_SAT = [
  { cx: 70, cy: 40, r: 5, fill: colors.cyan, stroke: colors.borderHi },
  { cx: 200, cy: 38, r: 4, fill: colors.cyanDim, stroke: colors.borderHi },
  { cx: 95, cy: 92, r: 4, fill: colors.soul, stroke: colors.soulLine },
  { cx: 185, cy: 90, r: 4, fill: colors.cyanDim, stroke: colors.border },
] as const;

export function DeepSpaceResearchScreen() {
  const { t } = useTranslation("deepspace");
  const { userId, authLoading, pages, edges, loading } = useWikiGraphData();
  const view = useMemo(() => buildDeepResearchView(pages, edges), [pages, edges]);

  // propose->ratify: AI-proposed (inferred) links awaiting the user's verdict.
  const [proposals, setProposals] = useState<InferredLinkDetail[]>([]);
  const [proposing, setProposing] = useState(false);
  const [actingKey, setActingKey] = useState<string | null>(null);

  const loadProposals = useMemo(
    () => async (uid: string) => {
      const rows = await listInferredLinkDetails(uid).catch(() => [] as InferredLinkDetail[]);
      setProposals(rows);
    },
    [],
  );

  useEffect(() => {
    if (!userId) return;
    void loadProposals(userId);
  }, [userId, loadProposals]);

  async function findProposals() {
    if (!userId || proposing) return;
    setProposing(true);
    try {
      await proposeAllRelatedLinks(userId);
      await loadProposals(userId);
    } catch {
      // best-effort; nothing new appears
    } finally {
      setProposing(false);
    }
  }

  async function ratify(p: InferredLinkDetail) {
    if (!userId) return;
    const key = `${p.from_page}|${p.to_page}`;
    setActingKey(key);
    try {
      await ratifyLink(userId, p.from_page, p.to_page);
      await loadProposals(userId);
    } catch {
      // best-effort
    } finally {
      setActingKey(null);
    }
  }

  async function reject(p: InferredLinkDetail) {
    if (!userId) return;
    const key = `${p.from_page}|${p.to_page}`;
    setActingKey(key);
    try {
      await rejectInferredLink(userId, p.from_page, p.to_page);
      await loadProposals(userId);
    } catch {
      // best-effort
    } finally {
      setActingKey(null);
    }
  }

  if (authLoading) {
    return <Shell title={t("research.title")}><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const satellites = RESEARCH_SAT.slice(0, Math.max(1, Math.min(view.hubs.length, 4)));
  const headerText =
    view.headline !== null
      ? t("research.headerFound", { count: view.edgeCount })
      : t("research.headerNone");

  return (
    <Shell title={t("research.title")}>
      <SecondbStatusHeader text={headerText} tip={t("research.tip")} mood="positive" />
      <Text style={styles.lead}>{t("research.lead")}</Text>
      {loading ? (
        <GraphLoading />
      ) : view.pageCount === 0 ? (
        <View style={styles.insightViolet}>
          <Text style={styles.insightVioletText}>{t("research.emptyInsight")}</Text>
          <Pressable style={styles.primary} onPress={() => router.push("/capture")}>
            <Text style={styles.primaryText}>{t("wiki.addPiece")}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {view.clusters.length > 0 ? (
            <View style={styles.filterRow}>
              {view.clusters.map((c, i) => (
                <FilterChip key={c.tag} label={`${c.tag} · ${c.count}`} violet={i === 0} />
              ))}
            </View>
          ) : null}
          <View style={styles.researchGraph}>
            <Svg width="100%" height={118} viewBox="0 0 260 118">
              {satellites.map((s, i) => (
                <Line key={`l${i}`} x1={135} y1={62} x2={s.cx} y2={s.cy} stroke={s.stroke} strokeWidth={1} />
              ))}
              {satellites.map((s, i) => (
                <Circle key={`c${i}`} cx={s.cx} cy={s.cy} r={s.r} fill={s.fill} />
              ))}
              <Circle cx={135} cy={62} r={8} fill={colors.textTitle} />
            </Svg>
            <Text style={styles.graphTag}>
              {view.clusters.length > 0
                ? t("research.clusterTag", { tag: view.clusters[0].tag })
                : t("research.clusterDefault")}
            </Text>
          </View>
          {view.headline !== null ? (
            <View style={styles.insightViolet}>
              <Text style={styles.insightVioletText}>{t("research.headline", { title: view.headline.title })}</Text>
              <View style={styles.evRow}>
                <Text style={styles.evChip}>📎 {t("research.chipPages", { count: view.pageCount })}</Text>
                <Text style={styles.evChip}>{t("research.chipLinks", { count: view.headline.inDegree })}</Text>
                {view.orphanCount > 0 ? <Text style={styles.evChip}>{t("research.chipOrphans", { count: view.orphanCount })}</Text> : null}
              </View>
            </View>
          ) : (
            <View style={styles.insightViolet}>
              <Text style={styles.insightVioletText}>{t("research.noLinks")}</Text>
            </View>
          )}
          {view.surprise !== null ? (
            <View style={styles.insightViolet}>
              <Text style={styles.insightVioletText}>
                {t("research.surprise", { from: view.surprise.fromTitle, to: view.surprise.toTitle })}
              </Text>
              <View style={styles.evRow}>
                <Text style={styles.evChip}>{t("research.islandChip", { count: view.islandCount })}</Text>
              </View>
            </View>
          ) : null}

          {/* propose->ratify: AI proposes semantic links, the user decides. */}
          <Text style={styles.tlLabel}>{t("research.proposalsLabel")}</Text>
          {proposals.length === 0 ? (
            <View style={styles.insightViolet}>
              <Text style={styles.insightVioletText}>{t("research.noProposals")}</Text>
            </View>
          ) : (
            proposals.map((p) => {
              const key = `${p.from_page}|${p.to_page}`;
              const busy = actingKey === key;
              return (
                <View key={key} style={styles.opsStep}>
                  <View style={styles.mapRow}>
                    <Text style={styles.mapFrom} numberOfLines={1}>{p.from_title}</Text>
                    <Text style={styles.mapArrow}>↔</Text>
                    <Text style={styles.mapTo} numberOfLines={1}>{p.to_title}</Text>
                  </View>
                  <View style={styles.opsStepFoot}>
                    <Text style={styles.evChip}>{t("research.confidence", { percent: Math.round(p.confidence * 100) })}</Text>
                    <Pressable style={styles.smallBtnGhost} onPress={() => void reject(p)} disabled={busy} accessibilityRole="button" accessibilityLabel={t("research.reject")}>
                      <Text style={styles.smallBtnGhostText}>{t("research.reject")}</Text>
                    </Pressable>
                    <Pressable style={styles.smallBtn} onPress={() => void ratify(p)} disabled={busy} accessibilityRole="button" accessibilityLabel={t("research.ratify")}>
                      <Text style={styles.smallBtnText}>{busy ? t("research.ratifying") : t("research.ratify")}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
          <Pressable
            style={[styles.smallBtnGhost, { marginLeft: 0, alignSelf: "flex-start" }, proposing && { opacity: 0.6 }]}
            onPress={() => void findProposals()}
            disabled={proposing}
            accessibilityRole="button"
            accessibilityLabel={t("research.getProposals")}
          >
            <Text style={styles.smallBtnGhostText}>{proposing ? t("research.gettingProposals") : t("research.getProposals")}</Text>
          </Pressable>
        </>
      )}
    </Shell>
  );
}

type ExportFormat = "iden" | "markdown" | "json" | "pdf";
const FORMAT_CARDS: { id: ExportFormat; name: string; descKey: string }[] = [
  { id: "iden", name: ".iden", descKey: "formats.idenDesc" },
  { id: "markdown", name: "Markdown", descKey: "formats.markdownDesc" },
  { id: "json", name: "JSON", descKey: "formats.jsonDesc" },
  { id: "pdf", name: "PDF", descKey: "formats.pdfDesc" },
];

export function DeepSpaceFormatsScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const { userId, loading: authLoading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [format, setFormat] = useState<ExportFormat>("iden");
  const [includeRecords, setIncludeRecords] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<{ text: string; name: string } | null>(null);
  const [note, setNote] = useState<"copied" | "copyFailed" | "error" | null>(null);

  async function runExport() {
    if (!userId || exporting) return;
    setExporting(true);
    setResult(null);
    setNote(null);
    try {
      if (format === "iden") {
        const r = await exportIden(userId, { locale });
        setResult({ text: r.iden, name: r.idenFilename });
      } else if (format === "pdf") {
        const r = await exportIden(userId, { locale });
        setResult({ text: r.html, name: r.htmlFilename });
      } else if (format === "markdown") {
        const r = await exportUserWiki(userId, { locale, includeRecords });
        setResult({ text: r.prompt, name: "2nd-brain-wiki.md" });
      } else {
        const doc = await buildIdenDoc(userId, { locale });
        setResult({ text: JSON.stringify(doc, null, 2), name: "2nd-brain-iden.json" });
      }
    } catch {
      setNote("error");
    } finally {
      setExporting(false);
    }
  }

  async function copyOrShare() {
    if (!result) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(result.text);
        setNote("copied");
      } catch {
        setNote("copyFailed");
      }
    } else {
      void Share.share({ message: result.text }).catch(() => {});
    }
  }

  function download() {
    if (!result || typeof document === "undefined") return;
    try {
      const blob = new Blob([result.text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // best-effort
    }
  }

  if (authLoading) {
    return <Shell title={t("formats.title")}><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const canDownload = typeof document !== "undefined";
  return (
    <Shell title={t("formats.title")}>
      <SecondbStatusHeader text={t("formats.status")} tip={t("formats.tip")} />
      <Text style={styles.lead}>{t("formats.lead")}</Text>
      <View style={styles.formatGrid}>
        {FORMAT_CARDS.map((f) => {
          const sel = format === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => setFormat(f.id)}
              style={[styles.formatCard, sel && styles.formatCardSel]}
              accessibilityRole="radio"
              accessibilityState={{ selected: sel }}
              accessibilityLabel={f.name}
            >
              <Text style={[styles.formatName, sel && styles.formatNameSel]}>{f.name}</Text>
              <Text style={styles.formatDesc}>{t(f.descKey)}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.tlLabel}>{t("formats.scopeLabel")}</Text>
      <Card>
        <Toggle label={t("formats.scope1")} on />
        <Toggle label={t("formats.scope2")} on />
        <Toggle label={t("formats.scope3")} on={includeRecords} onPress={() => setIncludeRecords((v) => !v)} />
      </Card>
      <Pressable style={[styles.soulPrimary, exporting && { opacity: 0.6 }]} onPress={() => void runExport()} disabled={exporting}>
        <Text style={styles.primaryText}>{exporting ? t("formats.exporting") : t("formats.export")}</Text>
      </Pressable>
      {note === "error" ? <Text style={styles.opsReason}>{t("formats.exportError")}</Text> : null}
      {result !== null ? (
        <View style={styles.wikiPageOpen}>
          <View style={styles.wikiPageHead}>
            <Text style={styles.wikiPageTitle} numberOfLines={1}>{result.name}</Text>
            <Text style={styles.wikiRowConn}>{t("formats.previewChars", { count: result.text.length })}</Text>
          </View>
          <ScrollView style={styles.recBody} nestedScrollEnabled>
            <Text style={styles.recBodyText} selectable>{result.text.slice(0, 4000)}</Text>
          </ScrollView>
          {note === "copied" ? <Text style={styles.delta}>{t("formats.copied")}</Text> : null}
          {note === "copyFailed" ? <Text style={styles.opsReason}>{t("formats.copyFailed")}</Text> : null}
          <View style={styles.ctaRow}>
            <Pressable style={styles.smallBtnGhost} onPress={() => void copyOrShare()} accessibilityRole="button">
              <Text style={styles.smallBtnGhostText}>{typeof navigator !== "undefined" && navigator.clipboard ? t("formats.copy") : t("formats.share")}</Text>
            </Pressable>
            {canDownload ? (
              <Pressable style={styles.smallBtnGhost} onPress={download} accessibilityRole="button">
                <Text style={styles.smallBtnGhostText}>{t("formats.download")}</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.smallBtnGhost} onPress={() => { setResult(null); setNote(null); }} accessibilityRole="button">
              <Text style={styles.smallBtnGhostText}>{t("formats.close")}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </Shell>
  );
}

interface ImportResult {
  imported: number;
  deduped: number;
  failed: number;
}

export function DeepSpaceImportScreen() {
  const { t, i18n } = useTranslation("deepspace");
  const { userId, loading: authLoading, isMinor } = useAuth();
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  // Phase B Slice 1: app-level health_import opt-in state. Off for everyone by
  // default; minors are hard-locked off (healthImportAllowed never passes).
  const [healthPref, setHealthPref] = useState(false);
  const [healthBusy, setHealthBusy] = useState(false);
  const [healthDone, setHealthDone] = useState(false);

  const notes = useMemo(() => splitImportNotes(text), [text]);

  useEffect(() => {
    if (!userId) return;
    void fetchPrivacyPrefs(userId).then((p) => setHealthPref(p.health_import === true));
  }, [userId]);

  const canHealth = healthImportAllowed(isMinor, healthPref);

  // Opt in: persist the pref AND write an explicit sensitive-data consent record
  // (consent_records, the existing ledger) before any ingest can run. Minors
  // can never reach this — the row shows healthMinorLocked instead.
  async function handleHealthConsent() {
    if (!userId || healthBusy || isMinor === true) return;
    setHealthBusy(true);
    try {
      const prefs = { ...(await fetchPrivacyPrefs(userId)), health_import: true };
      await savePrivacyPrefs(userId, prefs);
      // The guard above already excludes minors, so opt-in here is always adult.
      await recordHealthImportConsent({
        userId,
        ageBand: "adult",
        minorTier: "adult",
        locale: i18n.language?.startsWith("ko") ? "ko" : "en",
      });
      setHealthPref(true);
    } catch {
      // Best-effort; the row stays in the opt-in state so the user can retry.
    } finally {
      setHealthBusy(false);
    }
  }

  // Ingest today's activity through the single choke point (gate enforced inside
  // ingestHealthSamples). Slice 1 uses the deterministic mock as the data; the
  // manual/native sources land later behind the same call.
  async function handleHealthIngest() {
    if (!userId || healthBusy || !canHealth) return;
    setHealthBusy(true);
    setHealthDone(false);
    try {
      const now = new Date().toISOString();
      const samples = mockSamplesForRange({ startIso: now, endIso: now });
      await ingestHealthSamples(userId, samples, { isMinor, pref: healthPref });
      setHealthDone(true);
    } catch {
      // Gate rejection or write error: leave the affordance for retry.
    } finally {
      setHealthBusy(false);
    }
  }

  async function handlePickFiles() {
    if (importing || picking) return;
    setPicking(true);
    try {
      // Obsidian has no API — "connecting" it means importing its .md files.
      // Picked file text drops into the same paste box so the review/import
      // flow below handles it. Multiple files join with a --- separator so
      // splitImportNotes keeps them as distinct notes.
      const files = await pickImportFiles();
      if (files.length > 0) {
        const joined = files.map((f) => f.text).join("\n\n---\n\n");
        setText((prev) => (prev.trim() ? `${prev.trim()}\n\n---\n\n${joined}` : joined));
        setResult(null);
      }
    } catch {
      // Picker cancel/permission errors are non-fatal; the box is unchanged.
    } finally {
      setPicking(false);
    }
  }

  async function handleImport() {
    if (!userId || notes.length === 0 || importing) return;
    setImporting(true);
    setResult(null);
    const tally: ImportResult = { imported: 0, deduped: 0, failed: 0 };
    for (const note of notes) {
      try {
        // Same pipeline the clipper uses; user-authored notes are self_knowledge.
        // No LLM here — imported sources land in the inbox for Phase 1/2 later ($0).
        const r = await captureFromMarkdown({ userId, rawMd: note, kindOverride: "self_knowledge" });
        if (r.deduped === "exact_duplicate") tally.deduped += 1;
        else tally.imported += 1;
      } catch {
        tally.failed += 1;
      }
    }
    setResult(tally);
    if (tally.imported > 0 || tally.deduped > 0) setText("");
    setImporting(false);
  }

  if (authLoading) {
    return <Shell title={t("import.title")}><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;

  return (
    <Shell title={t("import.title")}>
      <SecondbStatusHeader text={t("import.status")} tip={t("import.tip")} />
      <Text style={styles.lead}>{t("import.lead")}</Text>

      <Card>
        <Text style={styles.reviewLabel}>{t("import.pasteLabel")}</Text>
        <TextInput
          style={[styles.input, { minHeight: 132, textAlignVertical: "top" }]}
          value={text}
          onChangeText={setText}
          placeholder={t("import.placeholder")}
          placeholderTextColor={colors.textLo}
          multiline
          editable={!importing}
          accessibilityLabel={t("import.pasteLabel")}
        />
        {notes.length > 0 ? (
          <>
            <Text style={styles.tlLabel}>{t("import.detected", { count: notes.length })}</Text>
            {notes.slice(0, 8).map((note, i) => (
              <View key={i} style={styles.mapRow}>
                <Text style={styles.mapArrow}>•</Text>
                <Text style={styles.mapTo} numberOfLines={1}>{previewTitle(note, t("import.untitled"))}</Text>
              </View>
            ))}
            {notes.length > 8 ? <Text style={styles.footerLeft}>{t("import.andMore", { count: notes.length - 8 })}</Text> : null}
          </>
        ) : (
          <Text style={styles.footerLeft}>{t("import.empty")}</Text>
        )}
      </Card>

      {result !== null ? (
        <View style={styles.insightViolet}>
          <Text style={styles.insightVioletText}>{t("import.resultDone", { count: result.imported })}</Text>
          {result.deduped > 0 || result.failed > 0 ? (
            <View style={styles.evRow}>
              {result.deduped > 0 ? <Text style={styles.evChip}>{t("import.resultDuplicate", { count: result.deduped })}</Text> : null}
              {result.failed > 0 ? <Text style={styles.evChip}>{t("import.resultFailed", { count: result.failed })}</Text> : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.ctaRow}>
        <Pressable
          style={styles.secondary}
          onPress={() => { setText(""); setResult(null); }}
          disabled={importing || text.length === 0}
          accessibilityRole="button"
          accessibilityLabel={t("import.clear")}
        >
          <Text style={styles.secondaryText}>{t("import.clear")}</Text>
        </Pressable>
        <Pressable
          style={[styles.primary, styles.primaryWide, (notes.length === 0 || importing) && { opacity: 0.6 }]}
          onPress={() => void handleImport()}
          disabled={notes.length === 0 || importing}
          accessibilityRole="button"
          accessibilityLabel={t("import.importCount", { count: notes.length })}
        >
          <Text style={styles.primaryText}>{importing ? t("import.importing") : t("import.importCount", { count: notes.length })}</Text>
        </Pressable>
      </View>

      <Text style={styles.tlLabel}>{t("import.connectorsLabel")}</Text>
      <View style={{ gap: 8 }}>
        <View style={[styles.sourceRow, styles.sourceRowDim]}><Text style={styles.tlIcon}>🗒</Text><View style={{ flex: 1 }}><Text style={styles.sourceNameDim}>Notion</Text><Text style={styles.sourceDesc}>{t("import.notionDesc")}</Text></View><Text style={styles.sourceSoon}>{t("import.soon")}</Text></View>
        <Pressable
          style={styles.sourceRow}
          onPress={() => void handlePickFiles()}
          disabled={picking || importing}
          accessibilityRole="button"
          accessibilityLabel={t("import.pickFiles")}
        ><Text style={styles.tlIcon}>🔮</Text><View style={{ flex: 1 }}><Text style={styles.sourceName}>Obsidian</Text><Text style={styles.sourceDesc}>{t("import.obsidianDesc")}</Text></View><Text style={styles.sourceCta}>{picking ? t("import.picking") : t("import.pickFiles")}</Text></Pressable>
        {isMinor === true ? (
          <View style={[styles.sourceRow, styles.sourceRowDim]}><Text style={styles.tlIcon}>❤</Text><View style={{ flex: 1 }}><Text style={styles.sourceNameDim}>{t("import.healthName")}</Text><Text style={styles.sourceDesc}>{t("import.healthDesc")}</Text></View><Text style={styles.sourceSoon}>{t("import.healthMinorLocked")}</Text></View>
        ) : !canHealth ? (
          <Pressable
            style={styles.sourceRow}
            onPress={() => void handleHealthConsent()}
            disabled={healthBusy}
            accessibilityRole="button"
            accessibilityLabel={t("import.healthConsentNeeded")}
            accessibilityHint={t("import.healthConnectHint")}
          ><Text style={styles.tlIcon}>❤</Text><View style={{ flex: 1 }}><Text style={styles.sourceName}>{t("import.healthName")}</Text><Text style={styles.sourceDesc}>{t("import.healthDesc")}</Text></View><Text style={styles.sourceCta}>{healthBusy ? t("import.importing") : t("import.healthConsentNeeded")}</Text></Pressable>
        ) : (
          <Pressable
            style={styles.sourceRow}
            onPress={() => void handleHealthIngest()}
            disabled={healthBusy}
            accessibilityRole="button"
            accessibilityLabel={t("import.healthIngest")}
            accessibilityHint={t("import.healthIngestHint")}
          ><Text style={styles.tlIcon}>❤</Text><View style={{ flex: 1 }}><Text style={styles.sourceName}>{t("import.healthName")}</Text><Text style={styles.sourceDesc}>{healthDone ? t("import.healthIngested") : t("import.healthDesc")}</Text></View><Text style={styles.sourceCta}>{healthBusy ? t("import.importing") : t("import.healthIngest")}</Text></Pressable>
        )}
      </View>
    </Shell>
  );
}

interface DetailRecord {
  id: string;
  kind: string;
  body: string | null;
  topic: string | null;
  summary: string | null;
  conclusion: string | null;
  tags: string[] | null;
  created_at: string;
}

const RECORD_KIND_KEY: Record<string, string> = {
  journal: "recordDetail.kindJournal",
  note: "recordDetail.kindNote",
  audit_response: "recordDetail.kindAudit",
};

function recordTitle(r: DetailRecord, fallback: string): string {
  const s = r.summary?.trim() || r.topic?.trim();
  if (s) return s;
  const body = r.body?.trim();
  if (body) {
    const line = body.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
    if (line) return line;
  }
  return fallback;
}

export function DeepSpaceRecordDetailScreen() {
  const { t } = useTranslation("deepspace");
  const { userId, loading: authLoading } = useAuth();
  const params = useLocalSearchParams();
  const idParam = params.id;
  const recordId = Array.isArray(idParam) ? idParam[0] : idParam;

  const [record, setRecord] = useState<DetailRecord | null>(null);
  const [all, setAll] = useState<TimelineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!userId || !recordId) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    Promise.all([getRecordById(userId, recordId), listRecentRecords(userId)])
      .then(([r, rows]) => {
        if (!alive) return;
        setRecord((r as DetailRecord) ?? null);
        setAll(rows as TimelineRecord[]);
      })
      .catch(() => {
        if (alive) setRecord(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userId, recordId]);

  async function handleDelete() {
    if (!userId || !record) return;
    setDeleting(true);
    try {
      await deleteRecord(userId, record.id);
      router.back();
    } catch {
      setDeleting(false);
    }
  }

  if (authLoading) {
    return <Shell title={t("recordDetail.title")}><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;

  if (loading) {
    return <Shell title={t("recordDetail.title")}><GraphLoading /></Shell>;
  }
  if (record === null) {
    return (
      <Shell title={t("recordDetail.title")}>
        <View style={styles.wikiPageOpen}>
          <Text style={styles.wikiBody}>{t("recordDetail.notFound")}</Text>
          <Pressable style={styles.primary} onPress={() => router.replace("/records")}>
            <Text style={styles.primaryText}>{t("recordDetail.toArchive")}</Text>
          </Pressable>
        </View>
      </Shell>
    );
  }

  const related = relatedByTag(record.id, record.tags, all);
  const kindKey = RECORD_KIND_KEY[record.kind];
  const kindLabel = kindKey ? t(kindKey) : t("recordDetail.kindFallback");
  const kindIcon = RECORD_KIND_ICON[record.kind] ?? "•";
  const recencyOpts = { labels: dsRecencyLabels(t) };

  return (
    <Shell title={t("recordDetail.title")}>
      <SecondbStatusHeader
        text={related.length > 0 ? t("recordDetail.headerLinked", { count: related.length }) : t("recordDetail.headerAlone")}
        tip={t("recordDetail.tip")}
      />
      <View style={styles.recMetaRow}>
        <Text style={styles.recMetaType}>{kindIcon} {kindLabel}</Text>
        <Text style={styles.recMetaDot}>·</Text>
        <Text style={styles.recMeta}>{recencyLabel(record.created_at, recencyOpts) || t("recordDetail.kindFallback")}</Text>
        <Text style={styles.recMetaDot}>·</Text>
        <Text style={styles.recMeta}>{t("recordDetail.author")}</Text>
      </View>
      <Text style={styles.recTitle}>{recordTitle(record, t("recordDetail.kindFallback"))}</Text>
      {record.body && record.body.trim().length > 0 ? (
        <View style={styles.recBody}>
          <Text style={styles.recBodyText}>{record.body}</Text>
        </View>
      ) : null}
      {record.tags && record.tags.length > 0 ? (
        <View style={styles.filterRow}>
          {record.tags.slice(0, 5).map((tag) => (
            <FilterChip key={tag} label={`#${tag}`} active />
          ))}
        </View>
      ) : null}
      {record.conclusion && record.conclusion.trim().length > 0 ? (
        <View style={styles.insightViolet}>
          <Text style={styles.insightVioletText}>{record.conclusion}</Text>
        </View>
      ) : null}
      {related.length > 0 ? (
        <>
          <Text style={styles.tlLabel}>{t("recordDetail.linkedRecords")}</Text>
          <View style={styles.tlGroup}>
            {related.map((r) => (
              <TimelineRow
                key={r.id}
                icon={RECORD_KIND_ICON[r.kind] ?? "•"}
                title={recordTitle(r as DetailRecord, t("recordDetail.kindFallback"))}
                time={recencyLabel(r.created_at, recencyOpts) || undefined}
                dim
              />
            ))}
          </View>
        </>
      ) : null}
      <View style={styles.ctaRow}>
        <Pressable style={styles.secondary} onPress={() => router.push("/capture")}>
          <Text style={styles.secondaryText}>{t("recordDetail.newRecord")}</Text>
        </Pressable>
        <Pressable
          style={[styles.iconBtn, styles.iconBtnDanger]}
          onPress={() => void handleDelete()}
          disabled={deleting}
          accessibilityRole="button"
          accessibilityLabel={t("recordDetail.a11yDelete")}
        >
          <Text style={styles.iconBtnText}>🗑</Text>
        </Pressable>
      </View>
    </Shell>
  );
}

// Calendar hand-off needs a start time even for untimed ideas; "tomorrow 9am"
// is an honest, editable default (the calendar app shows the form before save).
function opsNextMorningIso(now: Date = new Date()): string {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(9, 0, 0, 0);
  return next.toISOString();
}

type OpsRunState = "idle" | "working" | "empty" | "error" | "limit" | "off";

export function DeepSpaceOpsScreen() {
  const { t, i18n } = useTranslation("ops");
  const { userId, loading: authLoading, isMinor, hasProfile } = useAuth();
  const progression = useProgression();
  const locale = systemLocaleFor(i18n.language);
  // The model anchors on the EN canonical domain label regardless of UI language.
  const tEn = useMemo(() => i18n.getFixedT("en", "ops"), [i18n]);

  const [group, setGroup] = useState<OpsGroupId | null>(null);
  const [domain, setDomain] = useState<OpsDomainId | null>(null);
  const [recs, setRecs] = useState<OpsRecommendation[]>([]);
  const [runState, setRunState] = useState<OpsRunState>("idle");
  const [usedToday, setUsedToday] = useState(0);
  const [recommendations, setRecommendations] = useState<boolean | null>(null);
  const [todayRoutines, setTodayRoutines] = useState<OpsRoutine[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [streak, setStreak] = useState(0);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [reminderToast, setReminderToast] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void fetchPrivacyPrefs(userId).then((v) => {
      if (!cancelled) setRecommendations(v?.recommendations ?? false);
    });
    void readOpsUsage(userId).then((c) => {
      if (!cancelled) setUsedToday(c);
    });
    void loadToday();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function loadToday() {
    if (!userId) return;
    try {
      const now = new Date();
      const due = await listTodayRoutines(userId, now);
      setTodayRoutines(due);
      const today = localDayKey(now);
      const logs = await listCompletionsSince(userId, today);
      setCompletedIds(new Set(logs.map((l) => l.routine_id)));
      // 7-day window is enough for the capped weekStreak helper.
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekLogs = await listCompletionsSince(userId, localDayKey(weekAgo));
      setStreak(weekStreak(weekLogs, now));
    } catch {
      // best-effort: the today section just stays as-is
    }
  }

  if (authLoading) {
    return <Shell title={t("hero.title")}><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === false) return <Redirect href="/complete-profile" />;

  const dailyLimit = OPS_DAILY_LIMIT[progression.tier];
  const limitReached = usedToday >= dailyLimit;
  const domains = group ? domainsForGroup(group) : [];

  async function runRecommend() {
    if (!userId || !domain || runState === "working") return;
    // D-20 / PROTOCOL §36: honor the minor recommendations lock at the gate
    // (mirrors OpsLegacy). Adults are unaffected; a server-locked minor never
    // reaches the LLM snapshot.
    if (!recommendationsAllowed(isMinor, recommendations)) {
      setRunState("off");
      return;
    }
    if (limitReached) {
      setRunState("limit");
      return;
    }
    setRunState("working");
    setRecs([]);
    try {
      const out = await recommendForDomain({
        userId,
        locale,
        domainId: domain,
        domainLabel: tEn(`domains.${domain}`),
        minor: isMinor === true,
      });
      const used = await bumpOpsUsage(userId);
      setUsedToday(used);
      setRecs(out);
      setRunState(out.length === 0 ? "empty" : "idle");
    } catch {
      setRunState("error");
    }
  }

  function addToCalendar(rec: OpsRecommendation) {
    const url = buildGoogleCalendarUrl({
      title: rec.title,
      description: rec.reason,
      startsAtIso: rec.startsAtIso ?? opsNextMorningIso(),
      durationMinutes: rec.durationMinutes,
      recurrence: rec.recurrence,
    });
    if (url) void Linking.openURL(url).catch(() => {});
  }

  function shareStep(rec: OpsRecommendation) {
    void Share.share({ message: `${rec.title}\n${rec.reason}` }).catch(() => {});
  }

  function reminderNote(result: ReminderResult): string {
    if (result === "scheduled") return t("push.reminderSetNote");
    if (result === "denied") return t("push.reminderDeniedNote");
    if (result === "unavailable") return t("push.reminderUnavailableNote");
    return t("push.reminderFailedNote");
  }

  async function saveRoutine(rec: OpsRecommendation, key: string) {
    if (!userId || !domain || savingKey) return;
    setSavingKey(key);
    try {
      await createRoutineFromRecommendation(userId, domain, rec);
      // The reminder fires from the SAME existing scheduler used by the
      // recommendation cards; a non-recurring rec becomes a one-shot at its
      // start (or next morning if it had none).
      const { reminder_time } = deriveReminder(rec);
      const startsAtIso = rec.startsAtIso ?? opsNextMorningIso();
      const result = await scheduleRoutineReminder({
        title: rec.title,
        description: rec.reason,
        startsAtIso,
        durationMinutes: rec.durationMinutes,
        recurrence: rec.recurrence,
      });
      // reminder_time only informs the persisted row; the toast reflects the
      // scheduler outcome regardless.
      void reminder_time;
      setSavedKeys((prev) => new Set(prev).add(key));
      setRunState("idle");
      // Surface the scheduler outcome and refresh the today list.
      setReminderToast(reminderNote(result));
      await loadToday();
    } catch {
      setReminderToast(t("recommend.error"));
    } finally {
      setSavingKey(null);
    }
  }

  async function completeRoutine(routine: OpsRoutine) {
    if (!userId || completedIds.has(routine.id)) return;
    // Optimistic check — the unique-key upsert is idempotent so a failed write
    // is harmless to retry, and the today list reload reconciles either way.
    setCompletedIds((prev) => new Set(prev).add(routine.id));
    try {
      await logRoutineCompletion(userId, routine.id, localDayKey());
      await loadToday();
    } catch {
      setCompletedIds((prev) => {
        const next = new Set(prev);
        next.delete(routine.id);
        return next;
      });
    }
  }

  return (
    <Shell title={t("hero.title")}>
      <SecondbStatusHeader text={t("today.heading")} tip={t("hero.subtitle")} />
      <View style={styles.opsTodayHead}>
        <Text style={styles.section}>{t("today.heading")}</Text>
        {streak > 0 ? <Text style={styles.timeChipMint}>{t("today.streak", { count: streak })}</Text> : null}
      </View>
      {todayRoutines.length === 0 ? (
        <Text style={styles.opsReason}>{t("today.empty")}</Text>
      ) : (
        todayRoutines.map((routine) => {
          const done = completedIds.has(routine.id);
          return (
            <Pressable
              key={routine.id}
              style={styles.opsTodayRow}
              onPress={() => void completeRoutine(routine)}
              disabled={done}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: done }}
              accessibilityLabel={done ? t("today.doneA11y", { title: routine.title }) : t("today.completeA11y", { title: routine.title })}
            >
              <View style={[styles.opsCheck, done && styles.opsCheckOn]}>
                {done ? <Text style={styles.opsCheckMark}>✓</Text> : null}
              </View>
              <Text style={[styles.opsTodayTitle, done && styles.opsTodayTitleDone]}>{routine.title}</Text>
              <Text style={styles.timeChipCyan}>{routine.recurrence === "daily" ? t("card.daily") : t("card.weekly")}</Text>
            </Pressable>
          );
        })
      )}
      {reminderToast ? <Text style={styles.footerLeft}>{reminderToast}</Text> : null}
      <Text style={styles.lead}>{t("hero.subtitle")}</Text>
      <View style={styles.filterRow}>
        {OPS_GROUP_IDS.map((id) => (
          <FilterChip
            key={id}
            label={t(`groups.${id}`)}
            active={group === id}
            onPress={() => {
              setGroup(id);
              setDomain(null);
              setRecs([]);
              setRunState("idle");
            }}
          />
        ))}
      </View>
      {group ? (
        <View style={styles.filterRow}>
          {domains.map((id) => (
            <FilterChip
              key={id}
              label={t(`domains.${id}`)}
              active={domain === id}
              violet
              onPress={() => {
                // IA (ops-ia §2): the picker is a router. Domains with a
                // dedicated screen push to it (depth 2, Back → /ops); the rest
                // stay in the /ops recommendation flow.
                const route = opsRouteForDomain(id);
                if (route) router.push(route);
                else setDomain(id);
              }}
            />
          ))}
        </View>
      ) : null}
      {domain ? (
        <Pressable
          style={[styles.primary, (runState === "working" || limitReached) && { opacity: 0.6 }]}
          disabled={runState === "working" || limitReached}
          onPress={() => void runRecommend()}
          accessibilityRole="button"
          accessibilityState={{ disabled: runState === "working" || limitReached, busy: runState === "working" }}
        >
          <Text style={styles.primaryText}>{runState === "working" ? t("recommend.working") : t("recommend.cta")}</Text>
        </Pressable>
      ) : null}
      {runState === "limit" || (domain && limitReached) ? <Text style={styles.opsReason}>{t("recommend.limit")}</Text> : null}
      {runState === "empty" ? <Text style={styles.opsReason}>{t("recommend.empty")}</Text> : null}
      {runState === "error" ? <Text style={styles.opsReason}>{t("recommend.error")}</Text> : null}
      {runState === "off" ? <Text style={styles.opsReason}>{t("recommend.off")}</Text> : null}
      {recs.map((rec, i) => (
        <View key={`${i}-${rec.title}`} style={styles.opsStep}>
          <View style={styles.opsStepHead}>
            <Text style={styles.opsStepTitle}>{rec.title}</Text>
            {rec.recurrence ? (
              <Text style={styles.timeChipMint}>{rec.recurrence === "daily" ? t("card.daily") : t("card.weekly")}</Text>
            ) : null}
          </View>
          <Text style={styles.opsReason}>{rec.reason}</Text>
          <View style={styles.opsStepFoot}>
            <Pressable style={styles.smallBtnGhost} onPress={() => shareStep(rec)} accessibilityRole="button" accessibilityLabel={t("card.shareA11y")}>
              <Text style={styles.smallBtnGhostText}>{t("card.share")}</Text>
            </Pressable>
            <Pressable style={styles.smallBtnGhost} onPress={() => addToCalendar(rec)} accessibilityRole="button" accessibilityLabel={t("card.addCalendarA11y")}>
              <Text style={styles.smallBtnGhostText}>{t("card.addCalendar")}</Text>
            </Pressable>
            {(() => {
              const key = `${i}-${rec.title}`;
              const saved = savedKeys.has(key);
              const saving = savingKey === key;
              return (
                <Pressable
                  style={[styles.smallBtn, (saving || saved) && { opacity: 0.6 }]}
                  disabled={saving || saved}
                  onPress={() => void saveRoutine(rec, key)}
                  accessibilityRole="button"
                  accessibilityLabel={t("card.saveRoutineA11y")}
                  accessibilityState={{ disabled: saving || saved, busy: saving }}
                >
                  <Text style={styles.smallBtnText}>
                    {saving ? t("card.saving") : saved ? t("card.saved") : t("card.saveRoutine")}
                  </Text>
                </Pressable>
              );
            })()}
          </View>
        </View>
      ))}
      {recs.length > 0 ? <Text style={styles.footerLeft}>{t("recommend.disclaimerBody")}</Text> : null}
    </Shell>
  );
}

export function DeepSpaceWikiScreen() {
  const { t } = useTranslation("deepspace");
  const { userId, authLoading, pages, edges, loading } = useWikiGraphData();
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const view = useMemo(() => buildDeepWikiView(pages, edges, { activeTag }), [pages, edges, activeTag]);

  if (authLoading) {
    return <Shell title={t("wiki.title")}><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const headerText =
    view.pageCount > 0 ? t("wiki.headerGrowing", { count: view.pageCount }) : t("wiki.headerEmpty");
  const [first, ...rest] = view.pages;

  return (
    <Shell title={t("wiki.title")}>
      <SecondbStatusHeader text={headerText} tip={t("wiki.tip")} mood="positive" />
      <View style={styles.wikiStatRow}>
        <View style={styles.wikiStat}><Text style={styles.wikiStatNum}>{view.pageCount}</Text><Text style={styles.wikiStatCap}>{t("wiki.statPages")}</Text></View>
        <View style={styles.wikiStat}><Text style={[styles.wikiStatNum, styles.wikiStatNumCyan]}>{view.edgeCount}</Text><Text style={styles.wikiStatCap}>{t("wiki.statLinks")}</Text></View>
      </View>
      {view.tagChips.length > 0 ? (
        <View style={styles.filterRow}>
          <FilterChip label={t("wiki.filterAll")} active={activeTag === null} onPress={() => setActiveTag(null)} />
          {view.tagChips.map((c) => (
            <FilterChip
              key={c.tag}
              label={c.tag}
              active={activeTag === c.tag}
              onPress={() => setActiveTag((prev) => (prev === c.tag ? null : c.tag))}
            />
          ))}
        </View>
      ) : null}
      {loading ? (
        <GraphLoading />
      ) : view.pages.length === 0 ? (
        <View style={styles.wikiPageOpen}>
          <Text style={styles.wikiBody}>{activeTag !== null ? t("wiki.emptyTag") : t("wiki.emptyAll")}</Text>
          <Pressable style={styles.primary} onPress={() => router.push("/capture")}>
            <Text style={styles.primaryText}>{t("wiki.addPiece")}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {first ? (
            <View style={styles.wikiPageOpen}>
              <View style={styles.wikiPageHead}>
                <Text style={styles.wikiPageTitle}>{first.title}</Text>
                <Text style={styles.wikiCaret}>⌄</Text>
              </View>
              {first.snippet.length > 0 ? (
                <Text style={styles.wikiBody}>{first.snippet}</Text>
              ) : null}
              <View style={styles.wikiBacklinkRow}>
                <Text style={styles.wikiBacklink}>↩ {t("wiki.backlinks", { count: first.connections })}</Text>
                {first.tags[0] ? <Text style={styles.tlTag}>{first.tags[0]}</Text> : null}
              </View>
            </View>
          ) : null}
          {rest.map((p) => (
            <View key={p.id} style={styles.wikiPageRow}>
              <View style={styles.wikiRowHead}>
                <Text style={styles.wikiRowTitle} numberOfLines={1}>{p.title}</Text>
                <Text style={styles.wikiRowConn}>{t("wiki.connections", { count: p.connections })}</Text>
              </View>
              {p.snippet.length > 0 ? (
                <Text style={styles.wikiRowDesc} numberOfLines={1}>{p.snippet}</Text>
              ) : null}
            </View>
          ))}
        </>
      )}
    </Shell>
  );
}

export function DeepSpaceDomainsScreen() {
  const { t } = useTranslation("deepspace");
  const { userId, authLoading, pages, edges, loading } = useWikiGraphData();
  const view = useMemo(() => buildDomainsView(pages, edges), [pages, edges]);

  if (authLoading) {
    return <Shell title={t("domains.title")}><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const recencyOpts = { labels: dsRecencyLabels(t) };
  return (
    <Shell title={t("domains.title")}>
      <SecondbStatusHeader
        text={view.domains.length > 0 ? t("domains.headerHas") : t("domains.headerEmpty")}
        tip={t("domains.tip")}
      />
      <Text style={styles.lead}>{t("domains.lead")}</Text>
      {loading ? (
        <GraphLoading />
      ) : view.domains.length === 0 ? (
        <View style={styles.wikiPageOpen}>
          <Text style={styles.wikiBody}>{t("domains.empty")}</Text>
          <Pressable style={styles.primary} onPress={() => router.push("/capture")}>
            <Text style={styles.primaryText}>{t("domains.addData")}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.formatGrid}>
            {view.domains.map((d, i) => {
              const active = i === 0;
              return (
                <View
                  key={d.tag}
                  style={[styles.domainCard, active && styles.domainCardActive, !d.recent && styles.domainCardDim]}
                >
                  <Text style={d.recent ? styles.domainName : styles.domainNameDim} numberOfLines={1}>{d.tag}</Text>
                  <View style={styles.domainNumRow}>
                    <Text style={[styles.domainNum, active && styles.domainNumActive, !d.recent && styles.domainNumDim]}>{d.count}</Text>
                    <Text style={styles.domainUnit}>{t("domains.unit")}</Text>
                  </View>
                  <Text style={styles.domainSub}>{recencyLabel(d.lastActivity, recencyOpts) || t("domains.noActivity")}</Text>
                </View>
              );
            })}
          </View>
          {view.topTopics !== null && view.topTopics.titles.length > 0 ? (
            <>
              <Text style={styles.tlLabel}>{t("domains.topicsLabel", { tag: view.topTopics.tag })}</Text>
              <View style={styles.topicCol}>
                {view.topTopics.titles.map((title, i) => (
                  <View key={title} style={styles.topicRow}>
                    <View style={[styles.topicDot, i > 0 && styles.topicDotDim]} />
                    <Text style={i > 0 ? styles.topicTextDim : styles.topicText} numberOfLines={1}>{title}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
          <Pressable style={styles.primary} onPress={() => router.push("/capture")}>
            <Text style={styles.primaryText}>{t("domains.addData")}</Text>
          </Pressable>
        </>
      )}
    </Shell>
  );
}

// Wave 1: deep-space Pomodoro focus timer for the daily_focus ops domain.
// One core thing per screen: the big remaining-time readout. Completing a focus
// phase deterministically ticks daily_focus (applyFocusSessionComplete) and fires
// a one-shot local notification (notifyNow) — both reuse existing modules, no AI.
function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes < 10 ? "0" : ""}${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
}

export function DeepSpaceFocusScreen() {
  const { t } = useTranslation("ops");
  const { userId, loading: authLoading, hasProfile } = useAuth();

  const [timer, setTimer] = useState<PomodoroState>(() => createPomodoro());
  // Tracked separately so the stats line survives a reset (today's completions
  // are a per-day tally, not the in-cycle session count).
  const [doneToday, setDoneToday] = useState(0);

  // ANDROID_QA §4: a single 1s interval drives tick(); it is cleared on unmount
  // AND whenever `running` flips off, so a paused/idle timer holds no live
  // interval. The ref carries the latest state into the interval without
  // re-subscribing every render.
  const timerRef = useRef(timer);
  timerRef.current = timer;

  useEffect(() => {
    if (!timer.running) return;
    const id = setInterval(() => {
      const prev = timerRef.current;
      const next = tick(prev, 1000);
      if (next === prev) return;
      setTimer(next);
      if (focusJustCompleted(prev, next)) {
        setDoneToday((n) => n + 1);
        if (userId) void applyFocusSessionComplete(userId).catch(() => {});
        void notifyNow(t("focus.alarmFocusTitle"), t("focus.alarmFocusBody")).catch(() => {});
      } else if (phaseJustChanged(prev, next)) {
        // break -> focus boundary: ring the same one-shot, different copy.
        void notifyNow(t("focus.alarmBreakTitle"), t("focus.alarmBreakBody")).catch(() => {});
      }
    }, 1000);
    return () => clearInterval(id);
  }, [timer.running, userId, t]);

  if (authLoading) {
    return <Shell title={t("focus.title")}><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === false) return <Redirect href="/complete-profile" />;

  const phaseLabel =
    timer.phase === "focus" ? t("focus.phaseFocus") : timer.phase === "break" ? t("focus.phaseBreak") : t("focus.phaseIdle");
  const showClock = timer.phase === "idle" ? createPomodoro(timer.config).remainingMs : timer.remainingMs;
  const clock = timer.phase === "idle" ? formatClock(timer.config.focusMinutes * 60_000) : formatClock(showClock);

  return (
    <Shell title={t("focus.title")}>
      <SecondbStatusHeader text={t("focus.status")} tip={t("focus.tip")} />
      <View style={styles.focusStage}>
        <Text style={styles.focusPhase}>{phaseLabel}</Text>
        <Text style={styles.focusClock}>{clock}</Text>
      </View>
      <View style={styles.focusControls}>
        {timer.running ? (
          <Pressable style={styles.secondary} onPress={() => setTimer((s) => pause(s))} accessibilityRole="button" accessibilityLabel={t("focus.pause")}>
            <Text style={styles.secondaryText}>{t("focus.pause")}</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.primary} onPress={() => setTimer((s) => start(s))} accessibilityRole="button" accessibilityLabel={t("focus.start")}>
            <Text style={styles.primaryText}>{t("focus.start")}</Text>
          </Pressable>
        )}
        <Pressable style={styles.secondary} onPress={() => { setTimer((s) => reset(s)); }} accessibilityRole="button" accessibilityLabel={t("focus.reset")}>
          <Text style={styles.secondaryText}>{t("focus.reset")}</Text>
        </Pressable>
      </View>
      {/* Progressive disclosure: the stats line is a quiet tally under the timer,
          not a competing graphic. */}
      <Text style={styles.footerLeft}>{t("focus.doneToday", { count: doneToday })}</Text>
    </Shell>
  );
}

// /srs - language_practice spaced-repetition review (Wave 1, vision axis 2:
// personal assistant). One screen, one promise: clear today's due cards. ts-fsrs
// owns the scheduling; grading a card advances it and, when the due queue
// reaches empty, deterministically ticks the user's language_practice routine
// (applyLanguageReviewComplete) — exactly like a focus block ticks daily_focus.
// No AI, no animation lock: the flip is a plain state toggle.
const SRS_RATINGS: { rating: SrsRating; key: string; kind: "again" | "hard" | "good" | "easy" }[] = [
  { rating: 1, key: "srs.again", kind: "again" },
  { rating: 2, key: "srs.hard", kind: "hard" },
  { rating: 3, key: "srs.good", kind: "good" },
  { rating: 4, key: "srs.easy", kind: "easy" },
];

export function DeepSpaceSrsScreen() {
  const { t } = useTranslation("ops");
  const { userId, loading: authLoading, hasProfile } = useAuth();

  const [queue, setQueue] = useState<SrsCardRow[] | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [adding, setAdding] = useState(false);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [busy, setBusy] = useState(false);

  // Load the due queue once auth resolves. A null queue = still loading; an
  // empty array = nothing due (the cleared state).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void listDueCards(userId)
      .then((cards) => {
        if (!cancelled) setQueue(cards);
      })
      .catch(() => {
        if (!cancelled) setQueue([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (authLoading) {
    return <Shell title={t("srs.title")}><GraphLoading /></Shell>;
  }
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === false) return <Redirect href="/complete-profile" />;

  const current = queue && queue.length > 0 ? queue[0] : null;

  const grade = async (rating: SrsRating) => {
    if (!current || busy) return;
    setBusy(true);
    try {
      await recordReview(userId, current.id, rating);
      const rest = (queue ?? []).slice(1);
      setQueue(rest);
      setFlipped(false);
      // Deterministic rule: the due queue reached empty today → tick the
      // language_practice routine (idempotent, reuses logRoutineCompletion).
      if (rest.length === 0) {
        await applyLanguageReviewComplete(userId).catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  };

  const addCard = async () => {
    const f = front.trim();
    const b = back.trim();
    if (!f || !b || busy) return;
    setBusy(true);
    try {
      const created = await createCard(userId, { front: f, back: b });
      setQueue((q) => [...(q ?? []), created]);
      setFront("");
      setBack("");
      setAdding(false);
    } finally {
      setBusy(false);
    }
  };

  if (adding) {
    return (
      <Shell title={t("srs.addTitle")}>
        <Card>
          <Text style={styles.authLabel}>{t("srs.frontLabel")}</Text>
          <TextInput
            style={styles.input}
            value={front}
            onChangeText={setFront}
            placeholder={t("srs.frontPlaceholder")}
            placeholderTextColor={colors.textLo}
            accessibilityLabel={t("srs.frontLabel")}
          />
          <Text style={styles.authLabel}>{t("srs.backLabel")}</Text>
          <TextInput
            style={styles.input}
            value={back}
            onChangeText={setBack}
            placeholder={t("srs.backPlaceholder")}
            placeholderTextColor={colors.textLo}
            accessibilityLabel={t("srs.backLabel")}
          />
        </Card>
        <View style={styles.focusControls}>
          <Pressable style={styles.primary} onPress={() => void addCard()} accessibilityRole="button" accessibilityLabel={t("srs.save")}>
            <Text style={styles.primaryText}>{t("srs.save")}</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => setAdding(false)} accessibilityRole="button" accessibilityLabel={t("srs.cancel")}>
            <Text style={styles.secondaryText}>{t("srs.cancel")}</Text>
          </Pressable>
        </View>
      </Shell>
    );
  }

  return (
    <Shell title={t("srs.title")}>
      <SecondbStatusHeader text={t("srs.status")} tip={t("srs.tip")} />
      {current ? (
        <>
          <Pressable
            style={styles.srsCard}
            onPress={() => setFlipped((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={flipped ? t("srs.showFront") : t("srs.flip")}
          >
            <Text style={styles.srsFaceLabel}>{flipped ? t("srs.backLabel") : t("srs.frontLabel")}</Text>
            <Text style={styles.srsFaceText}>{flipped ? current.back : current.front}</Text>
            {!flipped ? <Text style={styles.srsHint}>{t("srs.flip")}</Text> : null}
          </Pressable>
          {flipped ? (
            <View style={styles.srsRatingRow}>
              {SRS_RATINGS.map((r) => (
                <Pressable
                  key={r.kind}
                  style={styles.srsRatingBtn}
                  disabled={busy}
                  onPress={() => void grade(r.rating)}
                  accessibilityRole="button"
                  accessibilityLabel={t(r.key)}
                >
                  <Text style={styles.srsRatingText}>{t(r.key)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Text style={styles.footerLeft}>{t("srs.remaining", { count: queue?.length ?? 0 })}</Text>
        </>
      ) : (
        <View style={styles.center}>
          <SecondbHead size={104} mood="positive" />
          <Text style={styles.prompt}>{queue === null ? t("srs.loading") : t("srs.cleared")}</Text>
        </View>
      )}
      <Pressable style={styles.secondary} onPress={() => setAdding(true)} accessibilityRole="button" accessibilityLabel={t("srs.addCard")}>
        <Text style={styles.secondaryText}>{t("srs.addCard")}</Text>
      </Pressable>
    </Shell>
  );
}

const styles = StyleSheet.create({ root:{flex:1,backgroundColor:colors.bgDeep}, stars:{...StyleSheet.absoluteFill,overflow:'hidden'}, star:{position:'absolute',width:3,height:3,borderRadius:2,backgroundColor:colors.cyanSoft}, scroll:{padding:spacing.lg,paddingBottom:40,gap:spacing.md}, titleRow:{flexDirection:'row',alignItems:'center',gap:spacing.md,marginBottom:spacing.xs}, back:{color:colors.cyanSoft,fontSize:34,lineHeight:38,fontFamily:fontFamilies.pixelKo}, title:{color:colors.textTitle,fontSize:18,lineHeight:24,fontFamily:fontFamilies.pixelKo}, subtitle:{color:colors.textLo,fontSize:11,lineHeight:17,fontFamily:fontFamilies.readable}, card:{backgroundColor:colors.cardBg,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:spacing.md,gap:spacing.sm}, graphCard:{height:332,overflow:'hidden'}, centerCaption:{position:'absolute',left:0,right:0,top:156,textAlign:'center',color:colors.bgDeep,fontFamily:fontFamilies.pixelKo,fontSize:11}, clusterLabel:{position:'absolute',color:colors.cyanSoft,fontFamily:fontFamilies.readable,fontSize:11}, ctaRow:{flexDirection:'row',gap:spacing.sm}, primary:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:colors.cyan,borderRadius:radius.md,paddingVertical:spacing.md}, primaryText:{color:colors.bgDeep,fontFamily:fontFamilies.pixelKo,fontSize:13}, secondary:{flex:1,alignItems:'center',justifyContent:'center',borderColor:colors.borderHi,borderWidth:1,borderRadius:radius.md,paddingVertical:spacing.md}, secondaryText:{color:colors.cyanSoft,fontFamily:fontFamilies.pixelKo,fontSize:13}, section:{color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:13,marginBottom:spacing.xs}, action:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:colors.border,paddingVertical:spacing.sm}, actionLabel:{color:colors.textHi,fontFamily:fontFamilies.readable,fontSize:14}, actionValue:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:12}, chev:{color:colors.cyanSoft,fontSize:22}, toggle:{width:42,height:24,borderRadius:12,backgroundColor:colors.border,justifyContent:'center',padding:3}, toggleOn:{backgroundColor:colors.cyan}, knob:{width:18,height:18,borderRadius:9,backgroundColor:colors.textLo}, knobOn:{alignSelf:'flex-end',backgroundColor:colors.bgDeep}, footer:{color:colors.textLo,textAlign:'center',fontFamily:fontFamilies.readable,fontSize:12,lineHeight:18}, center:{alignItems:'center',gap:spacing.sm}, prompt:{color:colors.textHi,fontFamily:fontFamilies.pixelKo,fontSize:16,lineHeight:24,textAlign:'center'}, avatar:{width:92,height:92,borderRadius:46,borderWidth:1,borderColor:colors.borderHi,alignItems:'center',justifyContent:'center',backgroundColor:colors.cardBg}, danger:{alignSelf:'center',padding:spacing.md},dangerText:{color:colors.clay,fontFamily:fontFamilies.readable,fontSize:13}, lead:{color:colors.textMid,fontFamily:fontFamilies.readable,fontSize:14,lineHeight:21,textAlign:'center'}, authHero:{alignItems:'center',paddingTop:32,gap:spacing.md}, big:{color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:24,lineHeight:32}, input:{borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.md,color:colors.textHi,fontFamily:fontFamilies.readable,backgroundColor:colors.bgDeep}, link:{color:colors.cyanSoft,textAlign:'center',fontFamily:fontFamilies.readable,paddingTop:spacing.sm}, mail:{fontSize:44,color:colors.cyanSoft}, codeRow:{flexDirection:'row',justifyContent:'center',gap:spacing.xs}, codeCell:{width:40,height:48,borderRadius:radius.sm,borderWidth:1,borderColor:colors.borderHi,backgroundColor:colors.cardBg}, pill:{borderWidth:1,borderColor:colors.border,borderRadius:radius.pill,paddingHorizontal:spacing.sm,paddingVertical:spacing.xs},pillText:{color:colors.cyanSoft,fontFamily:fontFamilies.pixelEn,fontSize:8}, compareRow:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:spacing.lg,paddingVertical:spacing.sm}, compareCol:{alignItems:'center',gap:spacing.xs}, compareNum:{color:colors.textMid,fontFamily:fontFamilies.pixelKo,fontSize:30}, compareNumHi:{color:colors.cyan}, compareCap:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:11}, delta:{color:colors.mint,textAlign:'center',fontFamily:fontFamilies.readable,fontSize:13}, statRow:{flexDirection:'row',gap:spacing.sm}, statBox:{flex:1,alignItems:'center',gap:spacing.xs,backgroundColor:colors.cardBg,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,paddingVertical:spacing.md}, statNum:{color:colors.cyan,fontFamily:fontFamilies.pixelKo,fontSize:28}, statCap:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:11}, sizeRow:{flexDirection:'row',alignItems:'center',gap:spacing.sm}, sizeCap:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:12}, sizeCapLg:{color:colors.textHi,fontFamily:fontFamilies.readable,fontSize:18}, sizeTrack:{flex:1,height:4,borderRadius:2,backgroundColor:colors.border,justifyContent:'center'}, sizeKnob:{width:18,height:18,borderRadius:9,backgroundColor:colors.cyan,marginLeft:'46%'}, searchBox:{backgroundColor:colors.cardBg,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,paddingHorizontal:spacing.md,paddingVertical:spacing.md}, searchText:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:13}, planPro:{borderColor:colors.borderHi}, planHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}, planName:{color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:15}, planBadge:{color:colors.bgDeep,backgroundColor:colors.cyan,fontFamily:fontFamilies.pixelEn,fontSize:8,paddingHorizontal:spacing.sm,paddingVertical:3,borderRadius:radius.sm,overflow:'hidden'}, planPrice:{color:colors.textHi,fontFamily:fontFamilies.pixelKo,fontSize:22,marginVertical:spacing.xs}, planPer:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:12}, planFeat:{color:colors.cyanSoft,fontFamily:fontFamilies.readable,fontSize:13,lineHeight:22}, planFeatDim:{color:colors.textMid,fontFamily:fontFamilies.readable,fontSize:13,lineHeight:20}, trendHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}, primaryWide:{flex:1.6}, filterRow:{flexDirection:'row',flexWrap:'wrap',gap:6}, fchip:{paddingVertical:6,paddingHorizontal:11,borderWidth:1,borderColor:colors.border,borderRadius:radius.sm}, fchipActive:{borderColor:colors.cyan,backgroundColor:colors.cardBg}, fchipViolet:{borderColor:colors.soulLine,backgroundColor:colors.cardBg}, fchipText:{color:colors.cyanSoft,fontFamily:fontFamilies.pixelKo,fontSize:11}, fchipTextActive:{color:colors.textTitle}, fchipTextViolet:{color:colors.soul}, tlLabel:{color:colors.cyanDim,fontFamily:fontFamilies.pixelEn,fontSize:7,letterSpacing:0.7,marginTop:spacing.sm}, tlGroup:{paddingLeft:16,borderLeftWidth:1,borderLeftColor:colors.border,gap:12,marginTop:spacing.xs}, tlRow:{flexDirection:'row',alignItems:'center',gap:9}, tlDot:{width:8,height:8,borderRadius:4,backgroundColor:colors.cyan}, tlDotDim:{backgroundColor:colors.cyanDim}, tlIcon:{fontSize:14}, tlTitle:{flex:1,color:colors.textTitle,fontFamily:fontFamilies.readable,fontSize:12.5}, tlTitleDim:{color:colors.textMid}, tlTime:{color:colors.cyanDim,fontFamily:fontFamilies.readable,fontSize:10}, tlTagRow:{flexDirection:'row',paddingLeft:32}, tlTag:{color:colors.cyanDim,fontFamily:fontFamilies.pixelEn,fontSize:5,letterSpacing:0.4,paddingHorizontal:6,paddingVertical:3,borderWidth:1,borderColor:colors.border,borderRadius:radius.sm}, progressRow:{flexDirection:'row',alignItems:'center',gap:10}, progressTrack:{flex:1,height:6,borderRadius:3,backgroundColor:colors.border,overflow:'hidden'}, progressFill:{height:'100%',borderRadius:3,backgroundColor:colors.cyan}, progressLabel:{color:colors.cyanSoft,fontFamily:fontFamilies.pixelKo,fontSize:11}, triageCard:{borderColor:colors.borderHi}, triageMeta:{flexDirection:'row',alignItems:'center',gap:9}, metaLabel:{color:colors.cyanDim,fontFamily:fontFamilies.pixelEn,fontSize:6,letterSpacing:0.5}, triageBody:{color:colors.textTitle,fontFamily:fontFamilies.readable,fontSize:13.5,lineHeight:21}, footerLeft:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:11,lineHeight:16}, iconBtn:{width:46,paddingVertical:11,borderWidth:1,borderColor:colors.borderHi,borderRadius:radius.md,alignItems:'center',backgroundColor:colors.bgDeep}, iconBtnText:{fontSize:15}, queueItem:{flexDirection:'row',alignItems:'center',gap:9,paddingVertical:9,paddingHorizontal:11,borderWidth:1,borderColor:colors.border,borderRadius:radius.sm,backgroundColor:colors.cardBg}, queueItemDim:{opacity:0.6}, queueText:{flex:1,color:colors.textMid,fontFamily:fontFamilies.readable,fontSize:12}, researchGraph:{height:118,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,backgroundColor:colors.bgDeep,overflow:'hidden',justifyContent:'center',alignItems:'center'}, graphTag:{position:'absolute',bottom:14,color:colors.textMid,fontFamily:fontFamilies.pixelKo,fontSize:10}, insightViolet:{borderWidth:1,borderColor:colors.soulLine,borderRadius:radius.lg,backgroundColor:colors.cardBg,padding:spacing.md,gap:spacing.sm}, insightVioletText:{color:colors.textTitle,fontFamily:fontFamilies.readable,fontSize:13,lineHeight:20}, evRow:{flexDirection:'row',gap:6}, evChip:{color:colors.cyanDim,fontFamily:fontFamilies.readable,fontSize:10,paddingHorizontal:8,paddingVertical:4,borderWidth:1,borderColor:colors.border,borderRadius:radius.sm}, formatGrid:{flexDirection:'row',flexWrap:'wrap',gap:9}, formatCard:{width:'47%',padding:13,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg,gap:4}, formatCardSel:{borderColor:colors.soulLine}, formatName:{color:colors.cyanSoft,fontFamily:fontFamilies.pixelKo,fontSize:13}, formatNameSel:{color:colors.soul}, formatDesc:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:10.5,lineHeight:15}, soulPrimary:{alignItems:'center',justifyContent:'center',backgroundColor:colors.soul,borderRadius:radius.md,paddingVertical:spacing.md}, sourceRow:{flexDirection:'row',alignItems:'center',gap:11,paddingVertical:11,paddingHorizontal:13,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg}, sourceRowDim:{opacity:0.7}, sourceName:{color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:13}, sourceNameDim:{color:colors.textMid,fontFamily:fontFamilies.pixelKo,fontSize:13}, sourceDesc:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:10}, sourceCta:{color:colors.cyan,fontFamily:fontFamilies.pixelKo,fontSize:11}, sourceSoon:{color:colors.cyanDim,fontFamily:fontFamilies.readable,fontSize:10}, reviewLabel:{color:colors.cyanBright,fontFamily:fontFamilies.pixelEn,fontSize:7,letterSpacing:0.7,marginBottom:spacing.xs}, mapRow:{flexDirection:'row',alignItems:'center',gap:8}, mapFrom:{color:colors.cyanSoft,fontFamily:fontFamilies.readable,fontSize:12}, mapArrow:{color:colors.cyanDim,fontFamily:fontFamilies.readable,fontSize:12}, mapTo:{color:colors.textTitle,fontFamily:fontFamilies.readable,fontSize:12}, recMetaRow:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap'}, recMetaType:{color:colors.cyanSoft,fontFamily:fontFamilies.readable,fontSize:11}, recMetaDot:{color:colors.textLo,fontSize:11}, recMeta:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:11}, recTitle:{color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:17,lineHeight:24}, recBody:{borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg,padding:spacing.md}, recBodyText:{color:colors.textHi,fontFamily:fontFamilies.readable,fontSize:12.5,lineHeight:20}, iconBtnDanger:{borderColor:colors.clay}, opsStep:{borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,backgroundColor:colors.cardBg,padding:spacing.md,gap:spacing.sm}, opsStepHead:{flexDirection:'row',alignItems:'flex-start',gap:spacing.sm}, opsStepTitle:{flex:1,color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:13.5,lineHeight:19}, timeChipMint:{color:colors.mint,fontFamily:fontFamilies.readable,fontSize:10,borderWidth:1,borderColor:colors.mint,borderRadius:radius.sm,paddingHorizontal:8,paddingVertical:3,overflow:'hidden'}, timeChipCyan:{color:colors.textMid,fontFamily:fontFamilies.readable,fontSize:10,borderWidth:1,borderColor:colors.border,borderRadius:radius.sm,paddingHorizontal:8,paddingVertical:3,overflow:'hidden'}, opsReason:{color:colors.textMid,fontFamily:fontFamilies.readable,fontSize:11.5,lineHeight:17}, opsStepFoot:{flexDirection:'row',alignItems:'center',gap:spacing.sm}, smallBtn:{marginLeft:'auto',backgroundColor:colors.cyan,borderRadius:radius.sm,paddingHorizontal:12,paddingVertical:7}, smallBtnText:{color:colors.bgDeep,fontFamily:fontFamilies.pixelKo,fontSize:11}, smallBtnGhost:{marginLeft:'auto',borderWidth:1,borderColor:colors.borderHi,borderRadius:radius.sm,paddingHorizontal:12,paddingVertical:7}, smallBtnGhostText:{color:colors.cyanSoft,fontFamily:fontFamilies.pixelKo,fontSize:11}, wikiStatRow:{flexDirection:'row',gap:spacing.sm}, wikiStat:{flex:1,flexDirection:'row',alignItems:'baseline',gap:6,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg,paddingHorizontal:13,paddingVertical:11}, wikiStatNum:{color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:20}, wikiStatNumCyan:{color:colors.cyan}, wikiStatCap:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:10.5}, wikiPageOpen:{borderWidth:1,borderColor:colors.borderHi,borderRadius:radius.lg,backgroundColor:colors.cardBg,padding:spacing.md,gap:spacing.sm}, wikiPageHead:{flexDirection:'row',alignItems:'center',gap:7}, wikiPageTitle:{flex:1,color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:13.5}, wikiCaret:{color:colors.cyanDim,fontSize:14}, wikiBody:{color:colors.textHi,fontFamily:fontFamilies.readable,fontSize:11.5,lineHeight:18}, wikiBacklinkRow:{flexDirection:'row',gap:6,flexWrap:'wrap',alignItems:'center'}, wikiBacklink:{color:colors.cyanSoft,fontFamily:fontFamilies.readable,fontSize:9.5,borderWidth:1,borderColor:colors.soulLine,borderRadius:radius.sm,paddingHorizontal:8,paddingVertical:4,overflow:'hidden'}, wikiPageRow:{borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg,paddingHorizontal:13,paddingVertical:11,gap:5}, wikiRowHead:{flexDirection:'row',alignItems:'center',gap:7}, wikiRowTitle:{flex:1,color:colors.cyanSoft,fontFamily:fontFamilies.pixelKo,fontSize:13}, wikiRowConn:{color:colors.cyanDim,fontFamily:fontFamilies.readable,fontSize:9.5}, wikiRowDesc:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:11}, domainCard:{width:'47%',padding:14,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg,gap:8}, domainCardActive:{borderColor:colors.cyan}, domainCardDim:{borderStyle:'dashed',borderColor:colors.borderHi,opacity:0.65}, domainName:{color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:14}, domainNameDim:{color:colors.textMid,fontFamily:fontFamilies.pixelKo,fontSize:14}, domainNumRow:{flexDirection:'row',alignItems:'baseline',gap:5}, domainNum:{color:colors.cyanSoft,fontFamily:fontFamilies.pixelKo,fontSize:22}, domainNumActive:{color:colors.cyan}, domainNumDim:{color:colors.textLo}, domainUnit:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:10}, domainSub:{color:colors.cyanDim,fontFamily:fontFamilies.readable,fontSize:9.5}, topicCol:{gap:8}, topicRow:{flexDirection:'row',alignItems:'center',gap:9,paddingVertical:10,paddingHorizontal:13,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg}, topicDot:{width:6,height:6,borderRadius:3,backgroundColor:colors.cyan}, topicDotDim:{backgroundColor:colors.cyanDim}, topicText:{flex:1,color:colors.textTitle,fontFamily:fontFamilies.readable,fontSize:12.5}, topicTextDim:{flex:1,color:colors.textMid,fontFamily:fontFamilies.readable,fontSize:12.5}, opsTodayHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}, opsTodayRow:{minHeight:48,flexDirection:'row',alignItems:'center',gap:spacing.sm,paddingVertical:spacing.sm,paddingHorizontal:spacing.md,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.cardBg}, opsCheck:{width:22,height:22,borderRadius:radius.sm,borderWidth:1,borderColor:colors.borderHi,alignItems:'center',justifyContent:'center'}, opsCheckOn:{backgroundColor:colors.cyan,borderColor:colors.cyan}, opsCheckMark:{color:colors.bgDeep,fontSize:13,fontFamily:fontFamilies.pixelKo}, opsTodayTitle:{flex:1,color:colors.textTitle,fontFamily:fontFamilies.readable,fontSize:13,lineHeight:19}, opsTodayTitleDone:{color:colors.textLo,textDecorationLine:'line-through'},
  // --- focus timer (Wave 1, daily_focus) ---
  focusStage:{alignItems:'center',justifyContent:'center',paddingVertical:spacing.xl,gap:spacing.sm},
  focusPhase:{color:colors.cyanDim,fontFamily:fontFamilies.pixelEn,fontSize:8,letterSpacing:1.2,textTransform:'uppercase'},
  focusClock:{color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:64,lineHeight:72},
  focusControls:{flexDirection:'row',gap:spacing.sm},
  // --- srs review (Wave 1, language_practice) ---
  srsCard:{minHeight:200,backgroundColor:colors.cardBg,borderWidth:1,borderColor:colors.borderHi,borderRadius:radius.lg,padding:spacing.lg,alignItems:'center',justifyContent:'center',gap:spacing.md},
  srsFaceLabel:{color:colors.cyanDim,fontFamily:fontFamilies.pixelEn,fontSize:8,letterSpacing:1.2,textTransform:'uppercase'},
  srsFaceText:{color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:24,lineHeight:34,textAlign:'center'},
  srsHint:{color:colors.textLo,fontFamily:fontFamilies.readable,fontSize:11},
  srsRatingRow:{flexDirection:'row',gap:spacing.xs},
  srsRatingBtn:{flex:1,alignItems:'center',justifyContent:'center',borderColor:colors.borderHi,borderWidth:1,borderRadius:radius.md,paddingVertical:spacing.md},
  srsRatingText:{color:colors.cyanSoft,fontFamily:fontFamilies.pixelKo,fontSize:12},
  // --- auth (sign-in / sign-up / reset) deep-space presentation ---
  authLabel:{color:colors.textMid,fontFamily:fontFamilies.pixelEn,fontSize:7,letterSpacing:0.7,textTransform:'uppercase',marginBottom:4},
  authLabelRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  eyeBtn:{minWidth:44,minHeight:36,alignItems:'flex-end',justifyContent:'center'},
  eyeText:{color:colors.cyanSoft,fontFamily:fontFamilies.readable,fontSize:11},
  providerBtn:{alignItems:'center',justifyContent:'center',borderColor:colors.borderHi,borderWidth:1,borderRadius:radius.md,paddingVertical:spacing.md},
  providerBtnText:{color:colors.cyanSoft,fontFamily:fontFamilies.pixelKo,fontSize:13},
  btnDisabled:{opacity:0.45},
  authDividerRow:{flexDirection:'row',alignItems:'center',gap:spacing.md,marginVertical:spacing.xs},
  authDividerLine:{flex:1,height:StyleSheet.hairlineWidth,backgroundColor:colors.border},
  authDividerLabel:{color:colors.textLo,fontFamily:fontFamilies.pixelEn,fontSize:7,letterSpacing:0.7,textTransform:'uppercase'},
  authDanger:{color:colors.clay,fontFamily:fontFamilies.readable,fontSize:12,lineHeight:18},
  authHelper:{color:colors.textMid,fontFamily:fontFamilies.readable,fontSize:11.5,lineHeight:17},
  authLinkRow:{minHeight:44,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},
  authForgotRow:{minHeight:44,alignItems:'center',justifyContent:'center'},
  authHelpCard:{borderWidth:1,borderColor:colors.borderHi,borderRadius:radius.md,backgroundColor:colors.cardBg,padding:spacing.md,gap:spacing.sm},
  authHelpTitle:{color:colors.textTitle,fontFamily:fontFamilies.pixelKo,fontSize:13},
  authHelpBody:{color:colors.textMid,fontFamily:fontFamilies.readable,fontSize:11.5,lineHeight:18},
  authToastWrap:{position:'absolute',left:spacing.lg,right:spacing.lg,bottom:spacing.xl,alignItems:'stretch'},
  authToast:{borderWidth:1,borderRadius:radius.md,paddingVertical:spacing.sm,paddingHorizontal:spacing.md},
  authToastInfo:{borderColor:colors.borderHi,backgroundColor:colors.cardBg},
  authToastSuccess:{borderColor:colors.mint,backgroundColor:colors.cardBg},
  authToastDanger:{borderColor:colors.clay,backgroundColor:colors.cardBg},
  authToastText:{color:colors.textHi,fontFamily:fontFamilies.readable,fontSize:12.5,lineHeight:18},
  consentGroupLabel:{color:colors.cyanBright,fontFamily:fontFamilies.pixelEn,fontSize:7,letterSpacing:0.7,textTransform:'uppercase',marginTop:spacing.xs},
  consentIntro:{color:colors.textMid,fontFamily:fontFamilies.readable,fontSize:11.5,lineHeight:18},
  consentRow:{flexDirection:'row',alignItems:'flex-start',gap:spacing.sm,minHeight:40,paddingVertical:spacing.xs},
  consentCheckbox:{width:22,height:22,borderRadius:radius.sm,borderWidth:1,borderColor:colors.borderHi,alignItems:'center',justifyContent:'center',marginTop:1},
  consentCheckboxOn:{borderColor:colors.cyan,backgroundColor:colors.cyan},
  consentCheckmark:{color:colors.bgDeep,fontFamily:fontFamilies.readable,fontSize:13,lineHeight:15},
  consentLabel:{flex:1,color:colors.textHi,fontFamily:fontFamilies.readable,fontSize:12,lineHeight:18},
  consentDivider:{height:1,backgroundColor:colors.border,opacity:0.6,marginVertical:spacing.xs},
  minorBanner:{borderWidth:1,borderLeftWidth:4,borderColor:colors.soulLine,borderRadius:radius.sm,backgroundColor:colors.cardBg,padding:spacing.sm},
  minorBannerText:{color:colors.soul,fontFamily:fontFamilies.readable,fontSize:11.5,lineHeight:18},
  checklistRow:{flexDirection:'row',alignItems:'center',gap:spacing.sm,minHeight:24},
  checklistDot:{width:8,height:8,borderRadius:4},
  checklistText:{flex:1,fontFamily:fontFamilies.readable,fontSize:11.5}});
