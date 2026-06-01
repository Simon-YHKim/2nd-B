// C10 (task B1): high-privacy settings screen. Binds the privacy_prefs key set
// (src/lib/privacy/prefs.ts) to per-pref switches over users.privacy_prefs.
//
// Privacy-by-design: every key starts OFF. 14-17 minors are held at high
// privacy — outward-sharing / profiling / external-processing keys are locked
// and only long_term_memory can be promoted (isPrivacyPrefEditable). Reads are
// fail-soft (defaults before the 0032 migration applies); a failed write
// reverts the optimistic toggle and surfaces a message.

import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Switch, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect } from "expo-router";

import { PremiumAppShell, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  PRIVACY_PREF_KEYS,
  defaultPrivacyPrefs,
  isPrivacyPrefEditable,
  type PrivacyPrefKey,
  type PrivacyPrefs,
} from "@/lib/privacy/prefs";
import { fetchPrivacyPrefs, savePrivacyPrefs } from "@/lib/supabase/privacy";

export default function Privacy() {
  const { t } = useTranslation("consent");
  const { userId, isMinor, loading } = useAuth();
  const minor = isMinor === true;

  const [prefs, setPrefs] = useState<PrivacyPrefs>(defaultPrivacyPrefs());
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
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const onToggle = useCallback(
    async (key: PrivacyPrefKey, next: boolean) => {
      if (!userId) return;
      if (!isPrivacyPrefEditable(key, minor)) return;
      const prev = prefs;
      const updated: PrivacyPrefs = { ...prefs, [key]: next };
      setPrefs(updated);
      setSaveError(false);
      try {
        await savePrivacyPrefs(userId, updated);
      } catch {
        // Revert the optimistic flip and tell the user. Pre-migration the
        // privacy_prefs column may not exist yet, so this path is expected
        // until the 0032 migration is applied.
        if (mounted.current) {
          setPrefs(prev);
          setSaveError(true);
        }
      }
    },
    [userId, prefs, minor],
  );

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SceneHero
          eyebrow={t("privacy.eyebrow")}
          title={t("privacy.title")}
          subtitle={t("privacy.subtitle")}
          island="relationship"
          worker="gadi"
          speech={t("privacy.speech")}
        />

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
          <Text variant="caption" color="brand" style={styles.sectionEyebrow}>
            {t("privacy.sectionLabel")}
          </Text>
          {PRIVACY_PREF_KEYS.map((key) => {
            const editable = isPrivacyPrefEditable(key, minor);
            return (
              <View key={key} style={styles.prefRow}>
                <View style={styles.prefCopy}>
                  <View style={styles.prefLabelRow}>
                    <Text variant="body" color={editable ? "text" : "textMuted"}>
                      {t(`privacy.keys.${key}.label`)}
                    </Text>
                    {!editable ? (
                      <Text variant="subtle" color="textSubtle" style={styles.lockedTag}>
                        {t("privacy.lockedTag")}
                      </Text>
                    ) : null}
                  </View>
                  <Text variant="subtle" color="textMuted">
                    {t(`privacy.keys.${key}.desc`)}
                  </Text>
                </View>
                <Switch
                  value={prefs[key]}
                  disabled={!ready || !editable}
                  onValueChange={(v) => {
                    void onToggle(key, v);
                  }}
                  trackColor={{ false: semantic.border, true: semantic.brand }}
                />
              </View>
            );
          })}
        </View>
      </ScrollView>
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl, gap: spacing.lg },
  minorBanner: {
    backgroundColor: semantic.surface,
    borderColor: semantic.brand,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: radii.sm,
    padding: spacing.md,
  },
  saveError: { paddingHorizontal: spacing.xs },
  section: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderLeftColor: semantic.brand,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  sectionEyebrow: { letterSpacing: 1, fontWeight: "700" },
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  prefCopy: { flex: 1, gap: 2 },
  prefLabelRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  lockedTag: {
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.xs,
  },
});
