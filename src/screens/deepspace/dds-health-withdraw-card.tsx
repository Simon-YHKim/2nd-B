// The health data card on the deep-space privacy screen (DeepSpacePrivacyDesignScreen).
//
// The consent is given with one tap on the import screen, so this card withdraws it with one
// tap and deletes what it let in (lib/health/withdraw.ts). It never turns the consent on:
// that stays on the import screen, behind its explanation and the separate-consent record.
// The card shares the privacy screen's busy flag, because every save there writes the whole
// prefs object and two at once would put back what the other turned off. For the same reason
// every strict read it makes goes back to the screen (onPrefsKnown), so the screen's other
// toggles save on top of what the server holds now, not a copy from when the screen opened.
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { withTimeout } from "@/lib/async/with-timeout";
import { useAuth } from "@/lib/auth/AuthContext";
import { beginAccountSessionLease } from "@/lib/auth/account-session-lease";
import { healthCardMode, healthWithdrawDeps, withdrawHealthImport } from "@/lib/health/withdraw";
import { useFocusRefetch } from "@/lib/nav/use-focus-refetch";
import type { PrivacyPrefs } from "@/lib/privacy/prefs";
import { countHealthSamples } from "@/lib/supabase/health";
import { readPrivacyPrefsStrict } from "@/lib/supabase/privacy-strict";
import { ddsStyles as styles } from "./dds-styles";

/** A request with no answer must not hold the screen's busy flag for good. */
const WITHDRAW_DEADLINE_MS = 60_000;

type Notice =
  | { kind: "unchanged" }
  | { kind: "deleteFailed" }
  | { kind: "uncertain" }
  | { kind: "done"; deleted: number }
  | { kind: "partial"; remaining: number | null };

export interface HealthWithdrawCardProps {
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onOpenImport: () => void;
  /** Prefs this card has just read or saved for this owner, newest first. */
  onPrefsKnown: (ownerId: string, prefs: PrivacyPrefs) => void;
}

export function HealthWithdrawCard({ busy, onBusyChange, onOpenImport, onPrefsKnown }: HealthWithdrawCardProps) {
  const { t } = useTranslation("deepspace");
  const { userId, isMinor } = useAuth();
  const [consent, setConsent] = useState<boolean | "loading" | "error">("loading");
  const [count, setCount] = useState<number | null | "loading">("loading");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [running, setRunning] = useState(false);
  const [reload, setReload] = useState(0);
  const userRef = useRef(userId);
  userRef.current = userId;
  const knownRef = useRef(onPrefsKnown);
  knownRef.current = onPrefsKnown;
  const mountedRef = useRef(true);
  const runningRef = useRef(false);
  /** Bumped by every load and every withdrawal; an answer from an older one is dropped. */
  const generationRef = useRef(0);
  const loadedOwnerRef = useRef<string | null>(null);
  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  useFocusRefetch(() => {
    if (!runningRef.current) setReload((n) => n + 1);
  }, Boolean(userId));

  useEffect(() => {
    if (loadedOwnerRef.current !== userId) {
      loadedOwnerRef.current = userId;
      setConsent("loading");
      setCount("loading");
      setNotice(null);
    }
    if (!userId) return;
    const owner = userId;
    const generation = ++generationRef.current;
    const current = () => mountedRef.current && generationRef.current === generation && userRef.current === owner;
    void readPrivacyPrefsStrict(owner).then(
      (prefs) => {
        if (!current()) return;
        knownRef.current(owner, prefs);
        setConsent(prefs.health_import === true);
      },
      () => { if (current()) setConsent("error"); },
    );
    void countHealthSamples(owner).then(
      (rows) => { if (current()) setCount(rows); },
      () => { if (current()) setCount(null); },
    );
  }, [userId, reload]);

  async function withdraw(fromResidue: boolean) {
    if (!userId || busy || runningRef.current) return;
    const owner = userId;
    const generation = ++generationRef.current;
    const lease = beginAccountSessionLease(owner);
    const current = () => mountedRef.current && generationRef.current === generation && userRef.current === owner;
    runningRef.current = true;
    setRunning(true);
    onBusyChange(true);
    setNotice(null);
    try {
      const outcome = await withTimeout(
        withdrawHealthImport(owner, healthWithdrawDeps(() => lease.assertCurrent())),
        WITHDRAW_DEADLINE_MS,
        "health_withdraw",
      );
      if (outcome.kind === "aborted" || !current()) return;
      if (outcome.kind === "uncertain") {
        setConsent("error");
        setNotice({ kind: "uncertain" });
        return;
      }
      if (outcome.prefs) {
        knownRef.current(owner, outcome.prefs);
        setConsent(outcome.prefs.health_import === true);
      }
      if (outcome.kind === "unchanged") {
        setNotice({ kind: fromResidue ? "deleteFailed" : "unchanged" });
      } else if (outcome.kind === "done") {
        setCount(0);
        setNotice({ kind: "done", deleted: outcome.deleted });
      } else {
        setCount(outcome.remaining);
        setNotice({ kind: "partial", remaining: outcome.remaining });
      }
    } catch {
      // Timed out or failed in a way the flow could not classify: what landed is unknown.
      if (current()) {
        setConsent("error");
        setNotice({ kind: "uncertain" });
      }
    } finally {
      lease.release();
      runningRef.current = false;
      if (mountedRef.current) {
        setRunning(false);
        onBusyChange(false);
      }
    }
  }

  const mode = healthCardMode({ consent, count, minor: isMinor !== false });
  const locked = busy || running;
  const noticeText =
    notice === null ? null
    : notice.kind === "unchanged" ? t("privacyHealth.unchanged")
    : notice.kind === "deleteFailed" ? t("privacyHealth.deleteFailed")
    : notice.kind === "uncertain" ? t("privacyHealth.uncertain")
    : notice.kind === "done" ? (notice.deleted > 0 ? t("privacyHealth.done", { count: notice.deleted }) : t("privacyHealth.doneNone"))
    : notice.remaining !== null ? t("privacyHealth.partial", { count: notice.remaining })
    : t("privacyHealth.partialNoCount");

  return (
    <View style={styles.card}>
      <Text variant="caption" style={styles.section}>{t("privacyHealth.title")}</Text>
      {mode.kind === "loading" ? (
        <Text variant="subtle" style={styles.footer}>{t("reviewLoading")}</Text>
      ) : mode.kind === "unknown" ? (
        <>
          <Text variant="subtle" style={styles.footer}>{t("privacyHealth.loadFailed")}</Text>
          <Pressable style={styles.secondary} onPress={() => setReload((n) => n + 1)} disabled={locked} accessibilityRole="button" accessibilityLabel={t("privacyHealth.retryLoad")}>
            <Text variant="body" style={styles.secondaryText}>{t("privacyHealth.retryLoad")}</Text>
          </Pressable>
        </>
      ) : mode.kind === "on" ? (
        <>
          <Text variant="body" style={styles.lead}>
            {mode.count !== null && mode.count > 0 ? t("privacyHealth.onBody", { count: mode.count }) : t("privacyHealth.onBodyNoCount")}
          </Text>
          <Text variant="subtle" style={styles.footer}>{t("privacyHealth.keeps")}</Text>
          <Pressable style={styles.secondary} onPress={() => void withdraw(false)} disabled={locked} accessibilityRole="button" accessibilityLabel={t("privacyHealth.turnOff")}>
            <Text variant="body" style={styles.secondaryText}>{t("privacyHealth.turnOff")}</Text>
          </Pressable>
        </>
      ) : mode.kind === "residue" ? (
        <>
          <Text variant="body" style={styles.lead}>
            {mode.count !== null ? t("privacyHealth.residueBody", { count: mode.count }) : t("privacyHealth.residueUnknown")}
          </Text>
          <Pressable style={styles.secondary} onPress={() => void withdraw(true)} disabled={locked} accessibilityRole="button" accessibilityLabel={t("privacyHealth.deleteRest")}>
            <Text variant="body" style={styles.secondaryText}>{t("privacyHealth.deleteRest")}</Text>
          </Pressable>
        </>
      ) : mode.locked ? (
        <Text variant="subtle" style={styles.footer}>{t("import.healthMinorLocked")}</Text>
      ) : (
        <>
          <Text variant="subtle" style={styles.footer}>{t("privacyHealth.offBody")}</Text>
          <Pressable style={styles.secondary} onPress={onOpenImport} disabled={locked} accessibilityRole="link" accessibilityLabel={t("privacyHealth.openImport")}>
            <Text variant="body" style={styles.secondaryText}>{t("privacyHealth.openImport")}</Text>
          </Pressable>
        </>
      )}
      {noticeText ? (
        <Text variant="subtle" style={styles.footer} accessibilityLiveRegion="polite">{noticeText}</Text>
      ) : null}
    </View>
  );
}
