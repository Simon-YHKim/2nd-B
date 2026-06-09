// C10 (task B1): high-privacy settings screen. Binds the privacy_prefs key set
// (src/lib/privacy/prefs.ts) to per-pref switches over users.privacy_prefs.
//
// Privacy-by-design: every key starts OFF. 14-17 minors are held at high
// privacy — outward-sharing / profiling / external-processing keys are locked
// and only long_term_memory can be promoted (isPrivacyPrefEditable). Reads are
// fail-soft (defaults before the 0032 migration applies); a failed write
// reverts the optimistic toggle and surfaces a message.

import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect } from "expo-router";

import { PremiumAppShell, PremiumLoadingState, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { PreferenceToggleRow } from "@/components/ui/PreferenceToggle";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  VISIBLE_PRIVACY_KEYS,
  defaultPrivacyPrefs,
  isPrivacyPrefEditable,
  type PrivacyPrefKey,
  type PrivacyPrefs,
} from "@/lib/privacy/prefs";
import { fetchPrivacyPrefs, savePrivacyPrefs } from "@/lib/supabase/privacy";
import { setAnalyticsConsent } from "@/lib/analytics";
import { createPrivacySaveQueue } from "@/lib/privacy/analytics-consent-queue";
import { VILLAGE_UI } from "@/lib/village-ui";

export default function Privacy() {
  const { t, i18n } = useTranslation("consent");
  const { userId, isMinor, loading } = useAuth();
  const minor = isMinor === true;
  const locale = i18n.language === "ko" ? "ko" : "en";
  // KO eyebrows drop tracking to 0 (Hangul reads worse when tracked); EN keeps
  // the light caption tracking.
  const eyebrowTracking = { letterSpacing: locale === "ko" ? 0 : 0.5 };

  const [prefs, setPrefs] = useState<PrivacyPrefs>(defaultPrivacyPrefs());
  const minorRef = useRef(minor);
  minorRef.current = minor;
  // Mirror the latest prefs into a ref kept current every render, so two rapid
  // toggles in the same tick compose off the freshest value: the second toggle
  // reads the first's synchronous prefsRef update in onToggle, not a stale
  // render-time `prefs` closure.
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  // Serializes whole-object privacy writes (so they land in submission order) and
  // applies the analytics gate monotonically: an external_analytics opt-out takes
  // effect immediately and no older save completion can re-enable it. See the
  // analytics-consent-queue module (where the async ordering is unit-tested).
  const saveQueue = useRef(
    createPrivacySaveQueue({
      applyAnalyticsConsent: (granted) => setAnalyticsConsent(granted, { isMinor: minorRef.current }),
      latestAnalyticsOn: () => prefsRef.current.external_analytics,
    }),
  ).current;
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const loaded = await fetchPrivacyPrefs(userId);
      if (!cancelled && mounted.current) {
        setPrefs(loaded);
        setReady(true);
        // Gate web analytics (GA4/Clarity/PostHog) on the external_analytics
        // pref — they load only when the user has opted in.
        setAnalyticsConsent(loaded.external_analytics, { isMinor: minor });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const onToggle = useCallback(
    (key: PrivacyPrefKey, next: boolean) => {
      if (!userId) return;
      if (!isPrivacyPrefEditable(key, minor)) return;
      // Compose from prefsRef (kept current each render + updated synchronously
      // here) so two rapid toggles in the same tick don't clobber each other:
      // the second toggle reads the first's update here, not a stale closure.
      const updated: PrivacyPrefs = { ...prefsRef.current, [key]: next };
      prefsRef.current = updated;
      setPrefs(updated);
      setSaveError(false);
      // Persist through the monotonic save queue: writes land in submission order,
      // an external_analytics opt-out applies immediately, and no stale completion
      // re-enables analytics. Each save sends the latest prefsRef at exec time.
      saveQueue.submit({
        save: () => savePrivacyPrefs(userId, prefsRef.current),
        optOut: key === "external_analytics" && next === false,
        onError: () => {
          // Revert only this key off the latest state and tell the user, so a
          // concurrent toggle of another key survives the revert. Pre-migration
          // the privacy_prefs column may not exist yet, so this path is expected
          // until the 0032 migration is applied.
          if (mounted.current) {
            const reverted: PrivacyPrefs = { ...prefsRef.current, [key]: !next };
            prefsRef.current = reverted;
            setPrefs(reverted);
            setSaveError(true);
          }
        },
      });
    },
    [userId, minor, saveQueue],
  );

  if (loading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={locale === "ko" ? "개인정보 설정을 불러오는 중이에요…" : "Loading privacy settings…"} />
        </View>
      </PremiumAppShell>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SceneHero
          eyebrow={t("privacy.eyebrow")}
          title={t("privacy.title")}
          subtitle={t("privacy.subtitle")}
          island={VILLAGE_UI.relation.island}
          worker={VILLAGE_UI.relation.worker}
          accent={VILLAGE_UI.relation.accent}
          speech={t("privacy.speech")}
        />

        <View style={styles.trustNote}>
          <Text variant="caption" color="brand" style={[styles.sectionEyebrow, eyebrowTracking]}>
            {t("privacy.trustTitle")}
          </Text>
          <Text variant="subtle" color="textMuted">
            {t("privacy.trustBody")}
          </Text>
        </View>

        {minor ? (
          <View style={styles.minorBanner}>
            <Text variant="subtle" color="text">
              {t("privacy.minorLockNote")}
            </Text>
          </View>
        ) : null}

        {saveError ? (
          <Text variant="subtle" color="danger" style={styles.saveError}>
            {t("privacy.saveError")}
          </Text>
        ) : null}

        <View style={styles.section}>
          <Text variant="caption" color="brand" style={[styles.sectionEyebrow, eyebrowTracking]}>
            {t("privacy.sectionLabel")}
          </Text>
          {/* D-12: render ONLY enforced controls. The other privacy_prefs keys
              are retained (prefs.ts) but were non-functional toggles — a false
              promise — so they are replaced by the honest statement below. */}
          {VISIBLE_PRIVACY_KEYS.map((key) => {
            const editable = isPrivacyPrefEditable(key, minor);
            return (
              <PreferenceToggleRow
                key={key}
                label={t(`privacy.keys.${key}.label`)}
                description={t(`privacy.keys.${key}.desc`)}
                value={prefs[key]}
                disabled={!ready || !editable}
                muted={!editable}
                lockedLabel={!editable ? t("privacy.lockedTag") : undefined}
                onValueChange={(v) => {
                  void onToggle(key, v);
                }}
              />
            );
          })}
          <Text variant="subtle" color="textMuted" style={styles.localFirstNote}>
            {t("privacy.localFirstStatement")}
          </Text>
        </View>
      </ScrollView>
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl, gap: spacing.lg },
  center: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
  minorBanner: {
    backgroundColor: semantic.surface,
    borderColor: semantic.brand,
    borderWidth: 1,
    borderStartWidth: 4,
    borderRadius: radii.sm,
    padding: spacing.md,
  },
  saveError: { paddingHorizontal: spacing.xs },
  trustNote: {
    backgroundColor: semantic.surface,
    borderColor: "rgba(114,242,199,0.34)",
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  section: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderStartWidth: 4,
    borderStartColor: semantic.brand,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  // Tracking is applied per-locale (eyebrowTracking) so the KO section label is
  // not over-spaced (caption is 14px); EN keeps the light caption tracking.
  sectionEyebrow: { fontWeight: "700" },
  localFirstNote: { marginTop: spacing.sm },
});
