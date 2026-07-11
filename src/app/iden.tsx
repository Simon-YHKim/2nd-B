// IDEN export screen (queue C wiring). Turns the user's stored self-knowledge
// into the portable `.iden` file + the one-page CV sheet, then lets them copy /
// share it (the AI-readable half) or open the sheet (the human-readable half).
//
// Web-safe by construction: no native-only modules at module scope. The rich
// WebView preview + native PDF/share path is the device-QA follow-up; here the
// `.iden` text (copy/share) and a web "open sheet" (print -> PDF) cover both
// runtimes with deps already in the app.

import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Platform, Share, Pressable } from "react-native";
import Svg, { Path, Rect as SvgRect, Circle as SvgCircle } from "react-native-svg";
import * as Clipboard from "expo-clipboard";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumAppShell, PremiumLoadingState, PremiumModal, PremiumToast, SceneHero } from "@/components/premium";
import { canonIden } from "@/lib/canon";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { type IdenViewData } from "@/components/deep-space/DeepSpaceViews";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { exportIden, type IdenExport } from "@/lib/iden/iden-export";
import { buildIdenDoc } from "@/lib/iden/build-iden";
import type { IdenDoc } from "@/lib/iden/types";
import { m3 } from "@/lib/theme/m3";
import { MdButton, MdChip } from "@/components/m3";
import { VILLAGE_UI } from "@/lib/village-ui";

type Toast = { tone: "info" | "success" | "danger"; message: string };

// rev2 IdenScreen (sb-screens-extra) — the "AI에 전달" target cards. Brand marks
// are letter avatars tinted with each product's brand color; every card routes
// to the integrations surface (reference: go('connect')).
// KO copy sourced from the design canon (src/lib/canon → public/proto/data)
const AI_TARGETS = canonIden.targets;

type IdenFormat = "Markdown" | "JSON" | "PDF";
// Same three values as the IdenFormat union above — the canon array is the
// render order, the union stays the compile-time contract for `fmt`.
const IDEN_FORMATS = canonIden.formats as IdenFormat[];

// rev2 IdenScreen include-toggle categories = the 4 fixed canon export sections
// (canonIden.rows). Each category gates a set of REAL IdenDoc field keys so a
// toggle is never decorative: turning a category off drops its fields from every
// export artifact (.iden / JSON / PDF). `raw` maps to no field — raw source text
// is never composed into the doc — and is off by default (canon "기본 제외").
const ROW_FIELDS: Record<string, string[]> = {
  northstar: ["patterns", "type", "attachment"], // interpretive identity signals behind the one-liner
  bigfive: ["traits"], // Big Five trait scores
  domains: ["cores", "contents", "drivers"], // pattern cores + vault domains + value drivers
  raw: [], // raw notes: not in the doc, sensitive, off by default
};

// English mirrors for the KO-only canon row labels/subs (iden supports en/ko).
const ROW_EN: Record<string, { label: string; sub: string }> = {
  northstar: { label: "North-star sentence", sub: "You in one line" },
  bigfive: { label: "Big Five", sub: "Big Five included" },
  domains: { label: "7-domain summary", sub: "Starlight · confidence" },
  raw: { label: "Raw notes", sub: "Sensitive — off by default" },
};

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
  const { t, i18n } = useTranslation("iden");
  const isKo = i18n.language === "ko";
  const locale = (isKo ? "ko" : "en") as "en" | "ko";
  const { userId, loading, isMinor } = useAuth();
  const [data, setData] = useState<IdenViewData | null | undefined>(undefined);
  const [hasError, setHasError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // rev2 P5a data sovereignty: the canon include-toggles (canonIden.rows) gate
  // real doc fields; an excluded category never leaves the device in ANY export
  // format. `excluded` holds canon ROW ids (not field keys). `raw` starts off.
  const [doc, setDoc] = useState<IdenDoc | null>(null);
  const [excluded, setExcluded] = useState<string[]>(["raw"]);
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
  // Include = every doc field whose canon category is enabled. Excluded ROW ids
  // expand to their gated field keys (ROW_FIELDS); those keys are dropped.
  const includeKeys = useCallback(() => {
    if (!doc) return undefined;
    const dropped = new Set<string>();
    for (const rowId of excluded) for (const k of ROW_FIELDS[rowId] ?? []) dropped.add(k);
    return doc.fields.map((f) => f.key).filter((k) => !dropped.has(k));
  }, [doc, excluded]);

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
      setNotice(t("ds.jsonCopied"));
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[iden] json copy failed", (e as Error).message);
      setNotice(t("ds.copyFailed"));
    }
  }, [userId, hasData, locale, isMinor, includeKeys, isKo]);

  // rev2 IdenScreen: 형식 chips drive what 내보내기 emits — Markdown = the
  // `.iden` text via the share sheet, JSON = clipboard, PDF = the printable
  // sheet (web print dialog; on native it is honest about needing web).
  const [fmt, setFmt] = useState<IdenFormat>("Markdown");

  const handlePreview = useCallback(async () => {
    if (!userId || !hasData) return;
    try {
      const result = await exportIden(userId, { locale, minor: isMinor === true, include: includeKeys() });
      if (Platform.OS === "web") {
        openSheetInNewTab(result.html);
      } else {
        setNotice(t("ds.previewWebOnly"));
      }
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[iden] preview failed", (e as Error).message);
    }
  }, [userId, hasData, locale, isMinor, includeKeys, isKo]);

  const handleExport = useCallback(async () => {
    if (fmt === "JSON") {
      await handleCopyJson();
      return;
    }
    if (fmt === "PDF") {
      await handlePreview();
      return;
    }
    await handleSend();
  }, [fmt, handleCopyJson, handlePreview, handleSend]);

  // Non-data states keep the prior IdenView behaviors: spinner while loading,
  // retry on error, and a gather-first CTA when the vault is empty.
  const stateBody = !hasData ? (
    <View style={dsIden.center}>
      {!hasError && data === undefined ? (
        <PremiumLoadingState message={t("ds.loading")} />
      ) : hasError ? (
        <View style={dsIden.stateBlock}>
          <Text variant="body" color="textMuted">
            {t("ds.loadError")}
          </Text>
          <MdButton variant="tonal" label={t("ds.retry")} onPress={() => setReloadKey((k) => k + 1)} />
        </View>
      ) : (
        <View style={dsIden.stateBlock}>
          <Text variant="body" color="textMuted">
            {t("ds.empty")}
          </Text>
          <MdButton variant="filled" label={t("ds.startGathering")} onPress={() => router.push("/interview")} />
        </View>
      )}
    </View>
  ) : null;

  return (
    <DeepSpaceScreen
      active="iden"
      header="none"
      variant="windowed"
      title={t("ds.screenTitle")}
      onBack={() => router.back()}
    >
      {stateBody ?? (
        <ScrollView contentContainerStyle={dsIden.scroll}>
          {/* file hero (rev2: tertiary-container plate, badge tile, mono filename) */}
          <View style={dsIden.hero}>
            <View style={dsIden.heroTile}>
              <Svg width={30} height={30} viewBox="0 0 24 24">
                <SvgRect x={3} y={5} width={18} height={14} rx={2.5} stroke={m3.color.onTertiaryContainer} strokeWidth={1.8} fill="none" />
                <SvgCircle cx={9} cy={11} r={2.2} fill={m3.color.onTertiaryContainer} />
                <Path d="M6.2 16.4c.5-1.6 1.6-2.4 2.8-2.4s2.3.8 2.8 2.4M14.5 9.5h4M14.5 13h4" stroke={m3.color.onTertiaryContainer} strokeWidth={1.6} strokeLinecap="round" fill="none" />
              </Svg>
            </View>
            <Text style={dsIden.heroName}>{data!.name}</Text>
            <View style={dsIden.heroChips}>
              <View style={dsIden.versionChip}>
                <Text style={dsIden.versionChipText}>{`v${data!.version}`}</Text>
              </View>
              <View style={dsIden.localChip}>
                <Svg width={12} height={12} viewBox="0 0 24 24">
                  <Path d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h1zm2 0h6V8a3 3 0 0 0-6 0v2z" fill={m3.color.onPrimary} />
                </Svg>
                <Text style={dsIden.localChipText}>{t("ds.signed")}</Text>
              </View>
            </View>
          </View>

          {/* 무엇을 담을까요 — the 4 fixed canon export categories (canonIden.rows).
              Deliberate canon deviation: the canon `bigfive` sub is a fabricated
              score line ("O72 C58 …"); we render the account's REAL Big Five values
              (data.bigFive, derived from measured/derived traits) or a neutral
              descriptor when absent — never a faked score. Toggle = canon blue
              (m3.color.primary), matching the settings M3 switch. */}
          <Text style={dsIden.sectionLabel}>{t("ds.whatGoesIn")}</Text>
          <View style={dsIden.rowsCard}>
            {canonIden.rows.map((row, i) => {
              const on = !excluded.includes(row.id);
              const label = isKo ? row.label : ROW_EN[row.id]?.label ?? row.label;
              const sub =
                row.id === "bigfive"
                  ? data!.bigFive ?? (isKo ? "검증 결과 포함" : ROW_EN.bigfive.sub)
                  : isKo
                    ? row.sub
                    : ROW_EN[row.id]?.sub ?? row.sub;
              const sensitive = row.id === "raw";
              return (
                <View key={row.id} style={[dsIden.row, i > 0 && dsIden.rowDivider]}>
                  <View style={dsIden.rowText}>
                    <Text style={dsIden.rowLabel}>{label}</Text>
                    <Text style={[dsIden.rowSub, sensitive && dsIden.rowSubSensitive]}>{sub}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="switch"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={label}
                    onPress={() => setExcluded((prev) => (on ? [...prev, row.id] : prev.filter((k) => k !== row.id)))}
                    hitSlop={8}
                    style={[
                      dsIden.switchTrack,
                      { borderColor: on ? m3.color.primary : m3.color.outline, backgroundColor: on ? m3.color.primary : m3.color.surfaceContainerHighest },
                    ]}
                  >
                    <View style={[dsIden.switchThumb, on ? dsIden.switchThumbOn : dsIden.switchThumbOff]} />
                  </Pressable>
                </View>
              );
            })}
          </View>
          <Text style={dsIden.rowsFootnote}>
            {isKo ? "끄면 어떤 형식으로도 나가지 않아요." : "Off = leaves in no format."}
          </Text>

          {/* 형식 */}
          <Text style={dsIden.sectionLabel}>{t("ds.format")}</Text>
          <View style={dsIden.chips}>
            {IDEN_FORMATS.map((f) => (
              <MdChip key={f} kind="filter" label={f} selected={fmt === f} onPress={() => setFmt(f)} />
            ))}
          </View>

          {/* AI에 전달 */}
          <Text style={dsIden.sectionLabel}>{t("ds.sendToAi")}</Text>
          <View style={dsIden.targetGrid}>
            {AI_TARGETS.map((tg) => (
              <Pressable
                key={tg.k}
                style={dsIden.targetCard}
                onPress={() => router.push("/integrations")}
                accessibilityRole="button"
                accessibilityLabel={tg.k}
              >
                <View style={[dsIden.targetBadge, { backgroundColor: tg.c }]}>
                  <Text style={dsIden.targetBadgeText}>{tg.k[0]}</Text>
                </View>
                <Text style={dsIden.targetName}>{tg.k}</Text>
              </Pressable>
            ))}
          </View>

          <View style={dsIden.actions}>
            <MdButton
              variant="filled"
              style={dsIden.actionMain}
              label={t("ds.export")}
              onPress={handleExport}
            />
            <MdButton variant="outlined" label={t("ds.preview")} onPress={handlePreview} />
          </View>
          {notice ? (
            <Text variant="caption" color="textSubtle" accessibilityLiveRegion="polite" style={dsIden.notice}>
              {notice}
            </Text>
          ) : null}
          <View style={dsIden.lockRow}>
            <Svg width={14} height={14} viewBox="0 0 24 24">
              <Path d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h1zm2 0h6V8a3 3 0 0 0-6 0v2z" fill={m3.color.onSurfaceVariant} />
            </Svg>
            <Text style={dsIden.lockText}>
              {isKo ? "내 기기에서 서명돼요. 원문은 동의 없이 나가지 않아요." : "Signed on your device. Raw notes never leave without consent."}
            </Text>
          </View>
        </ScrollView>
      )}
    </DeepSpaceScreen>
  );
}

const dsIden = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 28, gap: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  stateBlock: { alignItems: "center", gap: 14 },
  hero: {
    marginTop: 4,
    borderRadius: m3.shape.large,
    overflow: "hidden",
    backgroundColor: m3.color.tertiaryContainer,
    alignItems: "center",
    padding: 18,
    ...m3.elevation.level1,
  },
  heroTile: {
    width: 56,
    height: 56,
    borderRadius: 16,
    marginBottom: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: m3.color.surface,
    ...m3.elevation.level1,
  },
  heroName: { fontFamily: m3.font.mono, fontSize: 18, color: m3.color.onTertiaryContainer },
  heroChips: { flexDirection: "row", gap: 6, marginTop: 8 },
  versionChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: m3.color.surface,
  },
  versionChipText: { fontSize: 11, fontWeight: "600", color: m3.color.onSurfaceVariant },
  localChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: m3.color.primary,
  },
  localChipText: { fontSize: 11, fontWeight: "600", color: m3.color.onPrimary },
  sectionLabel: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.6,
    color: m3.color.onSurfaceVariant,
  },
  rowsCard: {
    borderRadius: m3.shape.medium,
    backgroundColor: m3.color.surfaceContainerHigh,
    padding: 4,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 12 },
  rowDivider: { borderTopWidth: 1, borderTopColor: m3.color.outlineVariant },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 16, lineHeight: 22, color: m3.color.onSurface },
  rowSub: { fontSize: 12, lineHeight: 16, color: m3.color.onSurfaceVariant },
  // Sensitive (raw notes) sub reads as a caution, matching the canon tertiary tint.
  rowSubSensitive: { color: m3.color.tertiary },
  // M3 include-switch (1:1 with the settings M3Switch): 52×32 track, 2dp border,
  // thumb 16→24, canon blue (primary) when on. Guarantees the reference accent on
  // web too (the RN built-in Switch renders an off-palette green on react-native-web).
  switchTrack: { width: 52, height: 32, borderRadius: 9999, borderWidth: 2, justifyContent: "center" },
  switchThumb: { position: "absolute", borderRadius: 9999 },
  switchThumbOn: { width: 24, height: 24, right: 2, backgroundColor: m3.color.onPrimary },
  switchThumbOff: { width: 16, height: 16, left: 7, backgroundColor: m3.color.outline },
  rowsFootnote: { fontSize: 12, color: m3.color.onSurfaceVariant, marginTop: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  targetGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  targetCard: {
    flexBasis: "48%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: m3.shape.medium,
    borderWidth: 1,
    borderColor: m3.color.outline,
  },
  targetBadge: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  targetBadgeText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  targetName: { fontSize: 14, color: m3.color.onSurface },
  actions: { flexDirection: "row", gap: 8, marginTop: 22 },
  actionMain: { flex: 1 },
  notice: { textAlign: "center", marginTop: 8 },
  lockRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12 },
  lockText: { fontSize: 12, color: m3.color.onSurfaceVariant },
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
