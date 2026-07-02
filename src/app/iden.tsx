// IDEN export screen (queue C wiring). Turns the user's stored self-knowledge
// into the portable `.iden` file + the one-page CV sheet, then lets them copy /
// share it (the AI-readable half) or open the sheet (the human-readable half).
//
// Web-safe by construction: no native-only modules at module scope. The rich
// WebView preview + native PDF/share path is the device-QA follow-up; here the
// `.iden` text (copy/share) and a web "open sheet" (print -> PDF) cover both
// runtimes with deps already in the app.

import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Platform, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumAppShell, PremiumLoadingState, PremiumModal, PremiumToast, SceneHero } from "@/components/premium";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { IdenView, type IdenViewData } from "@/components/deep-space/DeepSpaceViews";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { exportIden, type IdenExport } from "@/lib/iden/iden-export";
import { buildIdenDoc } from "@/lib/iden/build-iden";
import type { IdenDoc } from "@/lib/iden/types";
import { MdButton, MdChip } from "@/components/m3";
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
  if (isDeepSpaceUI()) return <IdenExportScreenDeepSpace />;
  return <IdenExportScreenLegacy />;
}

// Deep-space IDEN: the canonical default surface. Fetches the user's real
// IdenDoc (buildIdenDoc — persona + vault counts) and feeds IdenView; renders a
// proper loading/empty/error state instead of the prior hardcoded "simon.iden".
function IdenExportScreenDeepSpace() {
  const { i18n } = useTranslation("iden");
  const isKo = i18n.language === "ko";
  const locale = (isKo ? "ko" : "en") as "en" | "ko";
  const { userId, loading, isMinor } = useAuth();
  const [data, setData] = useState<IdenViewData | null | undefined>(undefined);
  const [hasError, setHasError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // rev2 P5a data sovereignty: the loaded doc's fields drive include-toggles;
  // an excluded field never leaves the device in ANY export format.
  const [doc, setDoc] = useState<IdenDoc | null>(null);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(null), 2400);
    return () => clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (loading) return;
    if (!userId) {
      setData(null);
      setHasError(false);
      return;
    }
    let cancelled = false;
    setHasError(false);
    setData(undefined); // undefined drives the loading state in IdenView
    buildIdenDoc(userId, { locale, minor: isMinor === true })
      .then((doc) => {
        if (cancelled) return;
        // composeIdenDoc inserts the traits ScoreMap in fixed O,C,E,A,N order
        // with 0..1 values; map to the "O72 C58 E41 A67 N39" line. Absent when
        // there's no measured/derived trait field yet (never a fabricated line).
        const traits = doc.fields.find((f) => f.key === "traits");
        const letters = ["O", "C", "E", "A", "N"];
        const bigFive =
          traits && (traits.viz === "radar" || traits.viz === "bar")
            ? Object.values(traits.data)
                .map((v, i) => `${letters[i] ?? ""}${Math.round(v * 100)}`)
                .join(" ")
            : null;
        setDoc(doc);
        setData({ name: `${doc.name}.iden`, version: doc.iden, northStar: doc.oneLiner, bigFive });
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setHasError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, loading, locale, isMinor, reloadKey]);

  const hasData = !hasError && data != null;

  // "Send to AI" exports the real `.iden` text and opens the share sheet (queue
  // C export/share path). When there's no IDEN yet, the empty-state CTA instead
  // routes the user to start gathering, so the action always advances them.
  // Include = every doc field minus the user's exclusions (P5a toggles).
  const includeKeys = useCallback(
    () => (doc ? doc.fields.map((f) => f.key).filter((k) => !excluded.includes(k)) : undefined),
    [doc, excluded],
  );

  const handleSend = useCallback(async () => {
    if (!userId) return;
    if (!hasData) {
      router.push("/interview");
      return;
    }
    try {
      const result = await exportIden(userId, { locale, minor: isMinor === true, include: includeKeys() });
      await Share.share({ message: result.iden });
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[iden] export/share failed", (e as Error).message);
    }
  }, [userId, hasData, locale, isMinor, includeKeys]);

  const handleCopyJson = useCallback(async () => {
    if (!userId || !hasData) return;
    try {
      const result = await exportIden(userId, { locale, minor: isMinor === true, include: includeKeys() });
      await Clipboard.setStringAsync(result.json);
      setNotice(isKo ? "JSON을 복사했어요" : "JSON copied");
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[iden] json copy failed", (e as Error).message);
      setNotice(isKo ? "복사하지 못했어요" : "Could not copy");
    }
  }, [userId, hasData, locale, isMinor, includeKeys, isKo]);

  return (
    <DeepSpaceScreen active="iden">
      <IdenView
        data={hasError ? null : data}
        loading={!hasError && data === undefined}
        hasError={hasError}
        isKo={isKo}
        onSend={handleSend}
        onRetry={() => setReloadKey((k) => k + 1)}
        footer={
          doc && hasData ? (
            <View style={dsIden.footer}>
              <Text variant="caption" color="textMuted">
                {isKo ? "내보낼 항목 (끄면 어떤 형식으로도 안 나가요)" : "Fields to export (off = leaves in no format)"}
              </Text>
              <View style={dsIden.chips}>
                {doc.fields.map((field) => {
                  const on = !excluded.includes(field.key);
                  return (
                    <MdChip
                      key={field.key}
                      kind="filter"
                      label={field.label}
                      selected={on}
                      onPress={() =>
                        setExcluded((prev) =>
                          on ? [...prev, field.key] : prev.filter((k) => k !== field.key),
                        )
                      }
                    />
                  );
                })}
              </View>
              <MdButton
                variant="outlined"
                label={isKo ? "JSON 복사" : "Copy JSON"}
                onPress={handleCopyJson}
              />
              {notice ? (
                <Text variant="caption" color="textSubtle" accessibilityLiveRegion="polite">
                  {notice}
                </Text>
              ) : null}
            </View>
          ) : null
        }
      />
    </DeepSpaceScreen>
  );
}

const dsIden = StyleSheet.create({
  footer: { gap: spacing.sm, marginTop: spacing.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});

function IdenExportScreenLegacy() {
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
