// IDEN export screen (queue C wiring). Turns the user's stored self-knowledge
// into the portable `.iden` file + the one-page CV sheet, then lets them copy /
// share it (the AI-readable half) or open the sheet (the human-readable half).
//
// Web-safe by construction: no native-only modules at module scope. The rich
// WebView preview + native PDF/share path is the device-QA follow-up; here the
// `.iden` text (copy/share) and a web "open sheet" (print -> PDF) cover both
// runtimes with deps already in the app.

import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Platform, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useTranslation } from "react-i18next";
import { Redirect } from "expo-router";

import { PremiumAppShell, PremiumLoadingState, PremiumModal, PremiumToast, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { exportIden, type IdenExport } from "@/lib/iden/iden-export";
import { VILLAGE_UI } from "@/lib/village-ui";

type Toast = { tone: "info" | "success" | "danger"; message: string };

// Open the rendered CV sheet in a new tab so the browser print dialog can save
// it as an A4 PDF. Web-only; reached through globalThis so no DOM lib types or
// native bundling are pulled in.
function openSheetInNewTab(html: string): void {
  const g = globalThis as unknown as {
    open?: (url?: string, target?: string) => { document?: { write: (s: string) => void; close: () => void } } | null;
  };
  const win = g.open?.("", "_blank");
  if (win?.document) {
    win.document.write(html);
    win.document.close();
  }
}

export default function IdenExportScreen() {
  const { t, i18n } = useTranslation("iden");
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const { userId, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IdenExport | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const notify = useCallback((next: Toast) => {
    setToast(next);
    setTimeout(() => setToast(null), 2400);
  }, []);

  const handleBuild = useCallback(async () => {
    if (!userId || busy) return;
    setBusy(true);
    try {
      setResult(await exportIden(userId, { locale }));
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[iden] export failed", (e as Error).message);
      notify({ tone: "danger", message: t("error") });
    } finally {
      setBusy(false);
    }
  }, [userId, busy, locale, notify, t]);

  const handleCopy = useCallback(async () => {
    if (!result) return;
    try {
      await Clipboard.setStringAsync(result.iden);
      notify({ tone: "success", message: t("result.copied") });
    } catch {
      notify({ tone: "danger", message: t("error") });
    }
  }, [result, notify, t]);

  const handleShare = useCallback(async () => {
    if (!result) return;
    try {
      await Share.share({ message: result.iden });
    } catch {
      /* user dismissed the share sheet */
    }
  }, [result]);

  if (loading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={t("loading")} />
        </View>
      </PremiumAppShell>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  const isWeb = Platform.OS === "web";

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <SceneHero
          eyebrow={t("hero.eyebrow")}
          title={t("hero.title")}
          subtitle={t("hero.subtitle")}
          island={VILLAGE_UI.records.island}
          worker={VILLAGE_UI.records.worker}
          accent={VILLAGE_UI.records.accent}
          speech={t("hero.speech")}
        />

        <View style={[styles.section, { borderStartColor: cosmic.soulViolet }]}>
          <Text variant="body" color="textMuted">{t("intro.body")}</Text>
          <Button
            label={t("generate.button")}
            onPress={handleBuild}
            loading={busy}
            accessibilityHint={t("generate.accessibilityHint")}
          />
        </View>
      </ScrollView>

      <PremiumModal visible={result !== null} onClose={() => setResult(null)}>
        <Text variant="heading" color="text">{t("result.title")}</Text>
        <Text variant="caption" color="textMuted" style={styles.hint}>{t("result.hint")}</Text>
        <ScrollView style={styles.codeBox}>
          <Text variant="caption" color="textMuted" style={styles.code} selectable>{result?.iden}</Text>
        </ScrollView>
        <View style={styles.actions}>
          <Button label={t("result.copy")} onPress={handleCopy} />
          {isWeb ? (
            <Button label={t("result.openSheet")} variant="secondary" onPress={() => result && openSheetInNewTab(result.html)} />
          ) : (
            <Button label={t("result.share")} variant="secondary" onPress={handleShare} />
          )}
          <Button label={t("result.close")} variant="ghost" onPress={() => setResult(null)} />
        </View>
      </PremiumModal>

      {toast && <PremiumToast message={toast.message} tone={toast.tone} />}
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  scroll: { padding: spacing.lg, gap: spacing.lg },
  section: {
    gap: spacing.md,
    padding: spacing.lg,
    borderStartWidth: 3,
    borderRadius: radii.lg,
    backgroundColor: semantic.surface,
  },
  hint: { marginTop: spacing.xs },
  codeBox: {
    maxHeight: 280,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: semantic.background,
  },
  code: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
});
