import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useTranslation } from "react-i18next";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton, MdCard } from "@/components/m3";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth/AuthContext";
import { accountTransitionPendingFromSnapshot, accountTransitionSnapshot, subscribeAccountTransition } from "@/lib/auth/account-epoch";
import { allRequiredAcksChecked, emptyConsentSelections, REQUIRED_ACK_KEYS } from "@/lib/auth/consent-selections";
import { isAvailableUiLocale, type AvailableUiLocale } from "@/lib/i18n/locales";
import { loadServiceConsent, matchesServiceConsentContract, saveServiceConsent, ServiceConsentError, type ServiceConsentStatus } from "@/lib/privacy/service-consent";
import { m3 } from "@/lib/theme/m3";

const ACK_COPY = {
  service: "ackService", llmProcessing: "ackLlm", overseasTransfer: "ackOverseas",
  sensitiveData: "ackSensitive", safetyNotice: "ackSafety",
} as const;

/** The key fences both account changes and an A -> B -> A epoch transition. */
export default function ServiceConsentScreen() {
  const { userId, loading } = useAuth();
  const { t, i18n } = useTranslation("consent");
  const transition = useSyncExternalStore(subscribeAccountTransition, accountTransitionSnapshot, accountTransitionSnapshot);
  const language = i18n.language.split("-")[0];
  const locale = isAvailableUiLocale(language) ? language : "en";
  if (!loading && !userId) return <Redirect href="/sign-in" />;
  return (
    <DeepSpaceScreen active="settings" header="none" variant="windowed" title={t("serviceControl.title")} onBack={() => router.back()}>
      {loading || !userId || accountTransitionPendingFromSnapshot(transition) ? (
        <Text style={styles.loading}>{t("serviceControl.loading")}</Text>
      ) : <ConsentForm key={`${userId}:${transition}:${locale}`} userId={userId} locale={locale} />}
    </DeepSpaceScreen>
  );
}

function ConsentForm({ userId, locale }: { userId: string; locale: AvailableUiLocale }) {
  const { t } = useTranslation("consent");
  const [status, setStatus] = useState<ServiceConsentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [selections, setSelections] = useState(emptyConsentSelections);
  const [notice, setNotice] = useState<"loadError" | "saveError" | "conflict" | "saved" | "withdrawn" | null>(null);
  const [reload, setReload] = useState(0);
  const lifecycle = useRef<AbortController | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    setLoading(true);
    setStatus(null);
    setReviewing(false);
    setSelections(emptyConsentSelections());
    void loadServiceConsent(userId, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setStatus(result);
      setNotice(null);
    }).catch(() => {
      if (!controller.signal.aborted) setNotice("loadError");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => { controller.abort(); };
  }, [userId, reload]);

  async function save(action: "grant" | "revoke") {
    const controller = lifecycle.current;
    if (!status || !controller || controller.signal.aborted || inFlight.current) return;
    if (action === "grant" && (!reviewing || !allRequiredAcksChecked(selections))) return;
    inFlight.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const result = await saveServiceConsent({ userId, status, action, selections, locale, signal: controller.signal });
      if (controller.signal.aborted) return;
      setStatus(result);
      setNotice(action === "grant" ? "saved" : "withdrawn");
      setReviewing(false);
      setSelections(emptyConsentSelections());
    } catch (error) {
      if (controller.signal.aborted) return;
      // A dropped response can follow a committed write. Re-read before any
      // retry; never infer that the prior server state is still current.
      setStatus(null);
      setReviewing(false);
      setSelections(emptyConsentSelections());
      setNotice(error instanceof ServiceConsentError && error.code === "conflict" ? "conflict" : "saveError");
    } finally {
      inFlight.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text variant="body">{t("serviceControl.intro")}</Text>
      <MdCard variant="outlined" style={styles.card}>
        {loading ? <Text>{t("serviceControl.loading")}</Text> : null}
        {notice ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite">{t(`serviceControl.${notice}`)}</Text> : null}
        {!loading && !status ? <MdButton label={t("serviceControl.reload")} variant="outlined" onPress={() => setReload((value) => value + 1)} /> : null}
        {status ? <>
          <Text variant="body" style={styles.heading}>{t(`serviceControl.states.${status.state}`)}</Text>
          {status.state === "blocked" && status.can_grant ? <>
            <Text variant="subtle">{t("serviceControl.blockedHelp")}</Text>
            <MdButton label={t("serviceControl.privacySettings")} variant="text" disabled={busy} onPress={() => router.push("/privacy")} />
          </> : null}
          {status.state === "uncovered" && status.mode === "collect" ? <Text variant="subtle">{t("serviceControl.collect")}</Text> : null}
          {!matchesServiceConsentContract(status) ? <Text>{t("serviceControl.updateRequired")}</Text> : null}
          {!status.can_grant ? <Text>{t("serviceControl.ineligible")}</Text> : null}
          {!reviewing && status.state !== "granted" && status.can_grant && matchesServiceConsentContract(status) ? (
            <MdButton label={t("serviceControl.review")} disabled={busy} onPress={() => { setSelections(emptyConsentSelections()); setReviewing(true); }} />
          ) : null}
          {reviewing ? <View style={styles.review}>
            <Text variant="body">{t("notice.intro")}</Text>
            <Text variant="subtle">{t("serviceControl.versions", { consent: status.consent_version, policy: status.policy_version, terms: status.terms_version })}</Text>
            {REQUIRED_ACK_KEYS.map((key) => <Pressable key={key}
              accessibilityRole="checkbox" accessibilityLabel={t(`notice.${ACK_COPY[key]}`)}
              accessibilityState={{ checked: selections[key], disabled: busy }} disabled={busy}
              onPress={() => setSelections((previous) => ({ ...previous, [key]: !previous[key] }))}
              style={[styles.checkbox, selections[key] && styles.selected]}>
              <Text style={styles.check} accessible={false}>{selections[key] ? "✓" : "□"}</Text>
              <Text variant="body" style={styles.ack}>{t(`notice.${ACK_COPY[key]}`)}</Text>
            </Pressable>)}
            <MdButton label={t("serviceControl.agree")} disabled={busy || !allRequiredAcksChecked(selections)} loading={busy} onPress={() => void save("grant")} />
            <MdButton label={t("serviceControl.cancel")} variant="text" disabled={busy} onPress={() => { setReviewing(false); setSelections(emptyConsentSelections()); }} />
          </View> : null}
          {status.state !== "revoked" ? <View style={styles.review}>
            <Text variant="subtle">{t("serviceControl.withdrawHelp")}</Text>
            <MdButton label={t("serviceControl.withdraw")} variant="outlined" disabled={busy} loading={busy} onPress={() => void save("revoke")} />
          </View> : null}
        </> : null}
      </MdCard>
      <Text variant="subtle">{t("serviceControl.limits")}</Text>
      <MdButton label={t("detail.title")} variant="text" disabled={busy} onPress={() => router.push("/consent-notice")} />
      <MdButton label={t("serviceControl.policy")} variant="text" disabled={busy} onPress={() => router.push("/privacy-policy")} />
      <MdButton label={t("serviceControl.terms")} variant="text" disabled={busy} onPress={() => router.push("/terms")} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: m3.spacing.s4, gap: m3.spacing.s4, paddingBottom: m3.spacing.s6 },
  loading: { padding: m3.spacing.s4 },
  card: { gap: m3.spacing.s4 },
  heading: { fontWeight: "700" },
  review: { gap: m3.spacing.s3 },
  checkbox: { flexDirection: "row", gap: m3.spacing.s3, padding: m3.spacing.s3, minHeight: 48, borderWidth: 1, borderColor: m3.color.outline },
  selected: { borderColor: m3.color.primary, backgroundColor: m3.color.primaryContainer },
  check: { color: m3.color.primary },
  ack: { flex: 1, flexShrink: 1 },
});
