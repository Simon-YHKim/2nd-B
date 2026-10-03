// The health data card on the deep-space privacy screen (DeepSpacePrivacyDesignScreen).
//
// The consent is given with one tap on the import screen, so this card withdraws it with one
// tap and deletes what it let in (lib/health/withdraw.ts). It never turns the consent on:
// that stays on the import screen, behind its explanation and the separate-consent record.
// The card shares the privacy screen's busy flag, because every save there writes the whole
// prefs object and two at once would put back what the other turned off. For the same reason
// every strict read it makes goes back to the screen (onPrefsKnown), so the screen's other
// toggles save on top of what the server holds now, not a copy from when the screen opened.
// The flag is held only until the consent is known to be off and that copy has reached the
// screen; the deletes that follow do not touch the prefs. When the outcome is not known, the
// screen's copy is withdrawn (onPrefsUnknown) until a fresh strict read replaces it.
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth/AuthContext";
import { beginAccountSessionLease } from "@/lib/auth/account-session-lease";
import { healthCardMode, healthWithdrawDeps, withdrawHealthImport } from "@/lib/health/withdraw";
import { useFocusRefetch } from "@/lib/nav/use-focus-refetch";
import type { PrivacyPrefs } from "@/lib/privacy/prefs";
import { countHealthSamples } from "@/lib/supabase/health";
import { readPrivacyPrefsStrict } from "@/lib/supabase/privacy-strict";
import { ddsStyles as styles } from "./dds-styles";

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
  /** The server state is not known after a withdrawal; the screen must not save from its copy. */
  onPrefsUnknown: (ownerId: string) => void;
}

export function HealthWithdrawCard({ busy, onBusyChange, onOpenImport, onPrefsKnown, onPrefsUnknown }: HealthWithdrawCardProps) {
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
  const unknownRef = useRef(onPrefsUnknown);
  unknownRef.current = onPrefsUnknown;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  /** Bumped whenever the screen becomes busy: a read that overlapped a save there is older than its copy. */
  const busyEpochRef = useRef(0);
  useEffect(() => {
    if (busy) busyEpochRef.current += 1;
  }, [busy]);
  const mountedRef = useRef(true);
  const runningRef = useRef(false);
  /** Bumped by every load and every withdrawal; an answer from an older one is dropped. */
  const generationRef = useRef(0);
  const loadedOwnerRef = useRef<string | null>(null);
  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  useFocusRefetch(() => {
    if (!runningRef.current && !busyRef.current) setReload((n) => n + 1);
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
    const epoch = busyEpochRef.current;
    const startedBusy = busyRef.current;
    void readPrivacyPrefsStrict(owner).then(
      (prefs) => {
        if (!current()) return;
        // Hand it to the screen only if no save there overlapped this read.
        if (!startedBusy && !busyRef.current && busyEpochRef.current === epoch) knownRef.current(owner, prefs);
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
    let holdingBusy = true;
    const releaseBusy = () => {
      if (!holdingBusy) return;
      holdingBusy = false;
      if (mountedRef.current) onBusyChange(false);
    };
    runningRef.current = true;
    setRunning(true);
    onBusyChange(true);
    setNotice(null);
    let settled = false;
    try {
      const outcome = await withdrawHealthImport(owner, healthWithdrawDeps(() => lease.assertCurrent(), (prefs) => {
        if (!current()) return;
        // The screen's other toggles may save again from here on: give them this copy first.
        knownRef.current(owner, prefs);
        setConsent(false);
        releaseBusy();
      }));
      if (outcome.kind === "aborted" || !current()) {
        settled = true;
        return;
      }
      if (outcome.kind === "uncertain") return;
      settled = true;
      if (outcome.prefs) {
        knownRef.current(owner, outcome.prefs);
        setConsent(outcome.prefs.health_import === true);
      }
      if (outcome.kind === "unchanged") {
        setNotice({ kind: fromResidue ? "deleteFailed" : "unchanged" });
      } else if (outcome.kind === "done") {
        setCount(0);
        setNotice(outcome.exact ? { kind: "done", deleted: outcome.deleted } : { kind: "done", deleted: 0 });
      } else {
        setCount(outcome.remaining);
        setNotice({ kind: "partial", remaining: outcome.remaining });
      }
    } catch {
      // A failure the flow could not classify: what landed is not known.
    } finally {
      if (!settled && current()) {
        // The consent may be on or off: the screen must not save from a copy that may be stale.
        unknownRef.current(owner);
        setConsent("error");
        setNotice({ kind: "uncertain" });
        setReload((n) => n + 1);
      }
      lease.release();
      runningRef.current = false;
      if (mountedRef.current) setRunning(false);
      releaseBusy();
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
