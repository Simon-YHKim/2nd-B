import { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text as RNText,
  View,
} from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { BirthDateField } from "@/components/auth/BirthDateField";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { DeepSpaceLoader, SecondbHead } from "@/components/deepspace";
import { m3TextStyle } from "@/components/m3";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { useAuth } from "@/lib/auth/AuthContext";
import { canSubmitDobCorrection } from "@/lib/account/dob";
import { buildInfoLine } from "@/lib/build-info";
import { m3 } from "@/lib/theme/m3";
import {
  ACCOUNT_DESTINATIONS,
  accountToolFromParam,
  accountExportDeps,
  exportAccountData,
  loadAccountDob,
  saveAccountDob,
} from "./dds-account-actions";

type DobFeedback = "saved" | "failed" | null;
type ExportFeedback = "done" | "failed" | null;

async function deliverAccountExport(json: string, filename: string): Promise<void> {
  if (Platform.OS !== "web") {
    await Share.share({ message: json, title: filename });
    return;
  }

  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("account export download is unavailable");
  }

  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function warnAccountAction(action: "dob-load" | "dob-save" | "export"): void {
  if (typeof console === "undefined") return;
  // Account errors may include backend details. Keep logs categorical so a
  // platform logger can never receive PII or a response payload.
  console.warn(`[account] ${action} failed`);
}

export function DeepSpaceAccountScreen() {
  const { t } = useTranslation(["deepspace", "consent", "common"]);
  const { userId, loading, refresh } = useAuth();
  const { tool } = useLocalSearchParams<{ tool?: string | string[] }>();
  const requestedTool = accountToolFromParam(tool);

  const [dobOpen, setDobOpen] = useState(false);
  const [dobOwner, setDobOwner] = useState<string | null>(null);
  const [origDob, setOrigDob] = useState<string | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [dobLoading, setDobLoading] = useState(false);
  const [dobLoadFailed, setDobLoadFailed] = useState(false);
  const [dobLoadAttempt, setDobLoadAttempt] = useState(0);
  const [dobBusy, setDobBusy] = useState(false);
  const [dobFeedback, setDobFeedback] = useState<DobFeedback>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<ExportFeedback>(null);

  const mountedRef = useRef(true);
  const activeUserRef = useRef(userId);
  const previousUserRef = useRef(userId);
  const authEpochRef = useRef(0);
  const birthDateRef = useRef(birthDate);
  if (previousUserRef.current !== userId) {
    previousUserRef.current = userId;
    authEpochRef.current += 1;
  }
  activeUserRef.current = userId;
  birthDateRef.current = birthDate;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // This route can survive an auth event on web. Reset every session-owned UI
  // bit before user B can inherit user A's open panels, feedback, or busy lock.
  useEffect(() => {
    setDobOpen(false);
    setDobOwner(null);
    setOrigDob(null);
    setBirthDate("");
    setDobLoading(false);
    setDobLoadFailed(false);
    setDobLoadAttempt(0);
    setDobBusy(false);
    setDobFeedback(null);
    setExportOpen(false);
    setExporting(false);
    setExportFeedback(null);
  }, [userId]);

  // Deep links may reveal one tool but never run it. Unknown/multi-valued query
  // params are ignored by accountToolFromParam's explicit allowlist.
  useEffect(() => {
    if (!userId || !requestedTool) return;
    setDobOpen(requestedTool === "dob");
    setExportOpen(requestedTool === "export");
  }, [requestedTool, userId]);

  // Progressive disclosure also avoids loading PII until the user opens the
  // correction tool. dobOwner prevents the prior account's value from flashing
  // if auth changes while this route remains mounted.
  useEffect(() => {
    if (!dobOpen || !userId) return;
    const requestedUser = userId;
    const requestedEpoch = authEpochRef.current;
    let cancelled = false;
    setDobOwner(null);
    setOrigDob(null);
    setBirthDate("");
    setDobFeedback(null);
    setDobLoadFailed(false);
    setDobLoading(true);
    const isActive = () =>
      !cancelled &&
      mountedRef.current &&
      activeUserRef.current === requestedUser &&
      authEpochRef.current === requestedEpoch;
    void loadAccountDob(requestedUser, isActive)
      .then((result) => {
        if (!isActive() || result.status === "cancelled") return;
        if (result.status === "failed") {
          warnAccountAction("dob-load");
          setDobLoadFailed(true);
          setDobOwner(requestedUser);
          return;
        }
        setOrigDob(result.dob);
        setBirthDate(result.dob ?? "");
        setDobOwner(requestedUser);
      })
      .finally(() => {
        if (isActive()) setDobLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dobLoadAttempt, dobOpen, userId]);

  const onSaveDob = useCallback(async () => {
    if (!userId || dobBusy) return;
    const requestedUser = userId;
    const requestedEpoch = authEpochRef.current;
    const submittedDob = birthDate;
    setDobBusy(true);
    setDobFeedback(null);
    const result = await saveAccountDob({
      userId: requestedUser,
      current: origDob,
      next: submittedDob,
      refresh,
      isActive: () =>
        mountedRef.current &&
        activeUserRef.current === requestedUser &&
        authEpochRef.current === requestedEpoch,
    });
    if (
      !mountedRef.current ||
      activeUserRef.current !== requestedUser ||
      authEpochRef.current !== requestedEpoch
    ) return;
    if (result.status === "saved") {
      setOrigDob(submittedDob);
      if (birthDateRef.current === submittedDob) setDobFeedback("saved");
    } else if (result.status === "failed") {
      warnAccountAction("dob-save");
      setDobFeedback("failed");
    }
    setDobBusy(false);
  }, [birthDate, dobBusy, origDob, refresh, userId]);

  const onExportData = useCallback(async () => {
    if (!userId || exporting) return;
    const requestedUser = userId;
    const requestedEpoch = authEpochRef.current;
    setExporting(true);
    setExportFeedback(null);
    const result = await exportAccountData({
      ...accountExportDeps,
      deliver: deliverAccountExport,
      expectedUserId: requestedUser,
      isActive: () =>
        mountedRef.current &&
        activeUserRef.current === requestedUser &&
        authEpochRef.current === requestedEpoch,
    });
    if (
      !mountedRef.current ||
      activeUserRef.current !== requestedUser ||
      authEpochRef.current !== requestedEpoch
    ) return;
    if (result.status === "cancelled") {
      setExporting(false);
      return;
    }
    if (result.status === "failed") {
      warnAccountAction("export");
      setExportFeedback("failed");
    } else {
      setExportFeedback("done");
    }
    setExporting(false);
  }, [exporting, userId]);

  if (loading) {
    return (
      <DeepSpaceScreen active="settings" header="none">
        <View style={styles.centerState}>
          <DeepSpaceLoader variant="dots" caption={t("consent:account.loading")} />
        </View>
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const dobReady = dobOwner === userId && !dobLoading;
  const dobSubmittable = dobReady && canSubmitDobCorrection(origDob, birthDate);

  return (
    <DeepSpaceScreen active="settings" header="none">
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.topBar}>
          <PixelPressable
            variant="bevel"
            onPress={() => router.back()}
            accessibilityLabel={t("common:actions.back")}
            contentStyle={styles.backContent}
          >
            <PixelGlyph name="arrowBack" color={m3.color.onSurface} size={24} />
          </PixelPressable>
          <RNText accessibilityRole="header" style={[m3TextStyle("titleLarge"), styles.title]}>
            {t("deepspace:account.title")}
          </RNText>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <SecondbHead size={64} mood="neutral" />
            <RNText style={[m3TextStyle("bodyMedium"), styles.status]}>
              {t("deepspace:account.status")}
            </RNText>
          </View>

          <PixelSurface variant="frame" contentStyle={styles.navGroup}>
            {ACCOUNT_DESTINATIONS.map((destination) => {
              const label = destination.labelKey === "IDEN" ? "IDEN" : t(destination.labelKey);
              return (
                <PixelPressable
                  key={destination.route}
                  variant="bevel"
                  onPress={() => router.push(destination.route)}
                  accessibilityLabel={label}
                  accessibilityRole="link"
                  fullWidth
                  contentStyle={styles.routeContent}
                >
                  <PixelSurface variant="inset" contentStyle={styles.iconContent}>
                    <PixelGlyph name={destination.icon} color={m3.color.primary} size={24} />
                  </PixelSurface>
                  <RNText style={[m3TextStyle("bodyMedium"), styles.routeLabel]}>{label}</RNText>
                  <PixelGlyph name="chevronRight" color={m3.color.onSurfaceVariant} size={24} />
                </PixelPressable>
              );
            })}
          </PixelSurface>

          <RNText style={[m3TextStyle("bodySmall"), styles.tip]}>
            {t("deepspace:account.tip")}
          </RNText>

          <PixelSurface variant="frame" contentStyle={styles.toolsGroup}>
            <PixelPressable
              variant={dobOpen ? "inset" : "bevel"}
              onPress={() => {
                setDobOpen((open) => !open);
                setExportOpen(false);
              }}
              accessibilityLabel={t("consent:account.dob.label")}
              accessibilityHint={t("consent:account.dob.hint")}
              accessibilityState={{ expanded: dobOpen }}
              fullWidth
              contentStyle={styles.toolHeader}
            >
              <PixelGlyph name="today" color={m3.color.primary} size={24} />
              <RNText style={[m3TextStyle("labelLarge"), styles.toolLabel]}>
                {t("consent:account.dob.label")}
              </RNText>
              <PixelGlyph
                name={dobOpen ? "expandLess" : "expandMore"}
                color={m3.color.onSurfaceVariant}
                size={24}
              />
            </PixelPressable>

            {dobOpen ? (
              <PixelSurface variant="inset" contentStyle={styles.toolBody}>
                <RNText style={[m3TextStyle("bodySmall"), styles.bodyCopy]}>
                  {t("consent:account.dob.hint")}
                </RNText>
                {!dobReady ? (
                  <DeepSpaceLoader variant="dots" caption={t("consent:account.loading")} />
                ) : dobLoadFailed ? (
                  <>
                    <RNText accessibilityRole="alert" style={[m3TextStyle("bodySmall"), styles.error]}>
                      {t("common:errors.network")}
                    </RNText>
                    <PixelPressable
                      variant="bevel"
                      onPress={() => setDobLoadAttempt((attempt) => attempt + 1)}
                      accessibilityLabel={t("common:actions.retry")}
                      fullWidth
                      contentStyle={styles.actionContent}
                    >
                      <PixelGlyph name="refresh" color={m3.color.primary} size={24} />
                      <RNText style={[m3TextStyle("labelLarge"), styles.actionLabel]}>
                        {t("common:actions.retry")}
                      </RNText>
                    </PixelPressable>
                  </>
                ) : (
                  <>
                    <BirthDateField
                      value={birthDate}
                      onChange={(next) => {
                        if (dobBusy) return;
                        setBirthDate(next);
                        setDobFeedback(null);
                      }}
                    />
                    {dobFeedback === "saved" ? (
                      <RNText accessibilityRole="alert" style={[m3TextStyle("bodySmall"), styles.success]}>
                        {t("consent:account.dob.saved")}
                      </RNText>
                    ) : null}
                    {dobFeedback === "failed" ? (
                      <RNText accessibilityRole="alert" style={[m3TextStyle("bodySmall"), styles.error]}>
                        {t("consent:account.dob.saveFailedBody")}
                      </RNText>
                    ) : null}
                    <PixelPressable
                      variant={dobSubmittable && !dobBusy ? "bevel" : "inset"}
                      disabled={!dobSubmittable || dobBusy}
                      onPress={() => void onSaveDob()}
                      accessibilityLabel={t("consent:account.dob.save")}
                      accessibilityHint={t("consent:account.dob.saveHint")}
                      accessibilityState={{ busy: dobBusy }}
                      fullWidth
                      contentStyle={styles.actionContent}
                    >
                      <PixelGlyph
                        name={dobBusy ? "refresh" : "check"}
                        color={dobSubmittable && !dobBusy ? m3.color.primary : m3.disabled.onSurface}
                        size={24}
                      />
                      <RNText
                        style={[
                          m3TextStyle("labelLarge"),
                          dobSubmittable && !dobBusy ? styles.actionLabel : styles.disabledLabel,
                        ]}
                      >
                        {t("consent:account.dob.save")}
                      </RNText>
                    </PixelPressable>
                  </>
                )}
              </PixelSurface>
            ) : null}

            <PixelPressable
              variant={exportOpen ? "inset" : "bevel"}
              onPress={() => {
                setExportOpen((open) => !open);
                setDobOpen(false);
              }}
              accessibilityLabel={t("consent:account.export.label")}
              accessibilityHint={t("consent:account.export.body")}
              accessibilityState={{ expanded: exportOpen }}
              fullWidth
              contentStyle={styles.toolHeader}
            >
              <PixelGlyph name="download" color={m3.color.primary} size={24} />
              <RNText style={[m3TextStyle("labelLarge"), styles.toolLabel]}>
                {t("consent:account.export.label")}
              </RNText>
              <PixelGlyph
                name={exportOpen ? "expandLess" : "expandMore"}
                color={m3.color.onSurfaceVariant}
                size={24}
              />
            </PixelPressable>

            {exportOpen ? (
              <PixelSurface variant="inset" contentStyle={styles.toolBody}>
                <RNText style={[m3TextStyle("bodySmall"), styles.bodyCopy]}>
                  {t("consent:account.export.body")}
                </RNText>
                {exportFeedback === "done" ? (
                  <RNText accessibilityRole="alert" style={[m3TextStyle("bodySmall"), styles.success]}>
                    {t("consent:account.export.done")}
                  </RNText>
                ) : null}
                {exportFeedback === "failed" ? (
                  <RNText accessibilityRole="alert" style={[m3TextStyle("bodySmall"), styles.error]}>
                    {t("consent:account.export.failed")}
                  </RNText>
                ) : null}
                <PixelPressable
                  variant={exporting ? "inset" : "bevel"}
                  disabled={exporting}
                  onPress={() => void onExportData()}
                  accessibilityLabel={t("consent:account.export.button")}
                  accessibilityHint={t("consent:account.export.buttonHint")}
                  accessibilityState={{ busy: exporting }}
                  fullWidth
                  contentStyle={styles.actionContent}
                >
                  <PixelGlyph
                    name={exporting ? "refresh" : "download"}
                    color={exporting ? m3.disabled.onSurface : m3.color.primary}
                    size={24}
                  />
                  <RNText
                    style={[
                      m3TextStyle("labelLarge"),
                      exporting ? styles.disabledLabel : styles.actionLabel,
                    ]}
                  >
                    {t("consent:account.export.button")}
                  </RNText>
                </PixelPressable>
              </PixelSurface>
            ) : null}

            <PixelPressable
              variant="bevel"
              onPress={() => router.push("/privacy")}
              accessibilityLabel={t("deepspace:account.delete")}
              accessibilityHint={t("consent:account.privacy.buttonHint")}
              accessibilityRole="link"
              fullWidth
              contentStyle={styles.toolHeader}
            >
              <PixelGlyph name="trash" color={m3.color.error} size={24} />
              <View style={styles.toolCopy}>
                <RNText style={[m3TextStyle("labelLarge"), styles.dangerLabel]}>
                  {t("deepspace:account.delete")}
                </RNText>
                <RNText style={[m3TextStyle("bodySmall"), styles.bodyCopy]}>
                  {t("consent:account.privacy.label")}
                </RNText>
              </View>
              <PixelGlyph name="chevronRight" color={m3.color.onSurfaceVariant} size={24} />
            </PixelPressable>
          </PixelSurface>

          <RNText style={[m3TextStyle("bodySmall"), styles.footer]}>{buildInfoLine()}</RNText>
        </ScrollView>
      </KeyboardAvoidingView>
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollView: { flex: 1 },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s4,
    paddingHorizontal: m3.spacing.s6,
    paddingVertical: m3.spacing.s2,
  },
  backContent: { minWidth: m3.minTouch, alignItems: "center", paddingHorizontal: m3.spacing.s2 },
  title: { flex: 1, color: m3.color.onSurface },
  scroll: {
    paddingHorizontal: m3.spacing.s8,
    paddingBottom: m3.spacing.s8,
    gap: m3.spacing.s6,
  },
  hero: {
    alignItems: "center",
    gap: m3.spacing.s6,
    paddingVertical: m3.spacing.s8,
  },
  status: {
    maxWidth: 320,
    color: m3.color.onSurfaceVariant,
    textAlign: "center",
  },
  navGroup: { gap: m3.spacing.s2, padding: m3.spacing.s2 },
  routeContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s6,
    paddingVertical: m3.spacing.s2,
    paddingHorizontal: m3.spacing.s4,
  },
  iconContent: { alignItems: "center", justifyContent: "center", padding: m3.spacing.s2 },
  routeLabel: { flex: 1, color: m3.color.onSurface },
  tip: { color: m3.color.onSurfaceVariant, textAlign: "center" },
  toolsGroup: { gap: m3.spacing.s4, padding: m3.spacing.s2 },
  toolHeader: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s6,
    paddingHorizontal: m3.spacing.s4,
  },
  toolLabel: { flex: 1, color: m3.color.onSurface },
  toolCopy: { flex: 1, gap: m3.spacing.s1 },
  toolBody: { gap: m3.spacing.s6, padding: m3.spacing.s6 },
  bodyCopy: { color: m3.color.onSurfaceVariant },
  actionContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s4,
  },
  actionLabel: { color: m3.color.primary },
  disabledLabel: { color: m3.disabled.onSurface },
  success: { color: m3.color.primary },
  error: { color: m3.color.error },
  dangerLabel: { color: m3.color.error },
  footer: { color: m3.color.onSurfaceVariant, textAlign: "center" },
});
