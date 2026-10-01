// The health data card on the deep-space privacy screen (DeepSpacePrivacyDesignScreen).
//
// The consent is given with one tap on the import screen, so this card withdraws it with one
// tap and deletes what it let in (lib/health/withdraw.ts). It never turns the consent on:
// that stays on the import screen, behind its explanation and the separate-consent record.
// The card shares the privacy screen's busy flag, because every save there writes the whole
// prefs object and two at once would put back what the other turned off.
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth/AuthContext";
import { beginAccountSessionLease } from "@/lib/auth/account-session-lease";
import { healthCardMode, healthWithdrawDeps, withdrawHealthImport } from "@/lib/health/withdraw";
import type { PrivacyPrefs } from "@/lib/privacy/prefs";
import { countHealthSamples } from "@/lib/supabase/health";
import { readPrivacyPrefsStrict } from "@/lib/supabase/privacy-strict";
import { ddsStyles as styles } from "./dds-styles";

type Notice =
  | { kind: "unchanged" }
  | { kind: "done"; deleted: number }
  | { kind: "partial"; remaining: number | null };

export interface HealthWithdrawCardProps {
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onOpenImport: () => void;
  /** The prefs this card saved, so the screen's cached copy does not put the consent back. */
  onPrefsSaved: (ownerId: string, prefs: PrivacyPrefs) => void;
}

export function HealthWithdrawCard({ busy, onBusyChange, onOpenImport, onPrefsSaved }: HealthWithdrawCardProps) {
  const { t } = useTranslation("deepspace");
  const { userId, isMinor } = useAuth();
  const [consent, setConsent] = useState<boolean | "loading" | "error">("loading");
  const [count, setCount] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [running, setRunning] = useState(false);
  const [reload, setReload] = useState(0);
  const userRef = useRef(userId);
  userRef.current = userId;
  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  useEffect(() => {
    setConsent("loading");
    setCount(null);
    setNotice(null);
    if (!userId) return;
    const owner = userId;
    let cancelled = false;
    const current = () => !cancelled && userRef.current === owner;
    void readPrivacyPrefsStrict(owner).then(
      (prefs) => { if (current()) setConsent(prefs.health_import === true); },
      () => { if (current()) setConsent("error"); },
    );
    void countHealthSamples(owner).then(
      (rows) => { if (current()) setCount(rows); },
      () => { if (current()) setCount(null); },
    );
    return () => {
      cancelled = true;
    };
  }, [userId, reload]);

  async function withdraw() {
    if (!userId || busy || running) return;
    const owner = userId;
    const lease = beginAccountSessionLease(owner);
    setRunning(true);
    onBusyChange(true);
    setNotice(null);
    try {
      const outcome = await withdrawHealthImport(owner, healthWithdrawDeps(() => lease.assertCurrent()));
      if (outcome.kind === "aborted" || !mountedRef.current || userRef.current !== owner) return;
      if (outcome.kind === "unchanged") {
        setNotice({ kind: "unchanged" });
        return;
      }
      if (outcome.saved) onPrefsSaved(owner, outcome.saved);
      setConsent(false);
      if (outcome.kind === "done") {
        setCount(0);
        setNotice({ kind: "done", deleted: outcome.deleted });
      } else {
        setCount(outcome.remaining);
        setNotice({ kind: "partial", remaining: outcome.remaining });
      }
    } catch {
      if (mountedRef.current && userRef.current === owner) setNotice({ kind: "unchanged" });
    } finally {
      lease.release();
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
          <Pressable style={styles.secondary} onPress={() => void withdraw()} disabled={locked} accessibilityRole="button" accessibilityLabel={t("privacyHealth.turnOffA11y")}>
            <Text variant="body" style={styles.secondaryText}>{t("privacyHealth.turnOff")}</Text>
          </Pressable>
        </>
      ) : mode.kind === "residue" ? (
        <>
          <Text variant="body" style={styles.lead}>{t("privacyHealth.residueBody", { count: mode.count })}</Text>
          <Pressable style={styles.secondary} onPress={() => void withdraw()} disabled={locked} accessibilityRole="button" accessibilityLabel={t("privacyHealth.deleteRest")}>
            <Text variant="body" style={styles.secondaryText}>{t("privacyHealth.deleteRest")}</Text>
          </Pressable>
        </>
      ) : mode.locked ? (
        <Text variant="subtle" style={styles.footer}>{t("import.healthMinorLocked")}</Text>
      ) : (
        <>
          <Text variant="subtle" style={styles.footer}>{t("privacyHealth.offBody")}</Text>
          <Pressable onPress={onOpenImport} disabled={locked} accessibilityRole="link" accessibilityLabel={t("privacyHealth.openImport")}>
            <Text variant="body" style={styles.link}>{t("privacyHealth.openImport")}</Text>
          </Pressable>
        </>
      )}
      {noticeText ? (
        <Text variant="subtle" style={styles.footer} accessibilityLiveRegion="polite">{noticeText}</Text>
      ) : null}
    </View>
  );
}
