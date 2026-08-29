// IDEN export screen (queue C wiring). Turns the user's stored self-knowledge
// into the portable `.iden` file + the one-page CV sheet, then lets them copy /
// share it (the AI-readable half) or open the sheet (the human-readable half).
//
// Web-safe by construction: no native-only modules at module scope. The rich
// WebView preview + native PDF/share path is the device-QA follow-up; here the
// `.iden` text (copy/share) and a web "open sheet" (print -> PDF) cover both
// runtimes with deps already in the app.

import { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, Platform, Share, Pressable } from "react-native";
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
import { cosmic, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { buildIdenExport } from "@/lib/iden/iden-export";
import {
  createIdenSessionController,
  loadPersistedIden,
  visibleIdenDocForExport,
  type IdenSession,
} from "@/lib/iden/load-persisted-iden";
import type { IdenDoc } from "@/lib/iden/types";
import { useFocusRefetch } from "@/lib/nav/use-focus-refetch";
import { m3 } from "@/lib/theme/m3";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
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

// Persisted categories gate real IdenDoc fields. The canon's raw row is filtered
// out below because this document has no raw payload for such a toggle to gate.
const ROW_FIELDS: Record<string, string[]> = {
  northstar: [],
  bigfive: ["traits"],
  domains: ["contents", "drivers"],
};

type IdenLocale = "en" | "ko" | "es" | "pt" | "id";

const IDEN_ROW_COPY: Record<IdenLocale, Record<string, { label: string; sub: string }>> = {
  en: {
    northstar: { label: "North-star sentence", sub: "You in one line" },
    bigfive: { label: "Traits", sub: "Saved derived scores" },
    domains: { label: "Saved context", sub: "Counts · grounded signals" },
  },
  ko: {
    northstar: { label: "북극성 문장", sub: "나를 한 줄로" },
    bigfive: { label: "특성", sub: "저장된 파생 점수" },
    domains: { label: "저장된 맥락", sub: "건수 · 근거 신호" },
  },
  es: {
    northstar: { label: "Frase de estrella guía", sub: "Tú en una línea" },
    bigfive: { label: "Rasgos", sub: "Puntuaciones derivadas guardadas" },
    domains: { label: "Contexto guardado", sub: "Conteos · señales con base" },
  },
  pt: {
    northstar: { label: "Frase da estrela guia", sub: "Você em uma linha" },
    bigfive: { label: "Traços", sub: "Pontuações derivadas salvas" },
    domains: { label: "Contexto salvo", sub: "Contagens · sinais fundamentados" },
  },
  id: {
    northstar: { label: "Kalimat bintang penuntun", sub: "Dirimu dalam satu baris" },
    bigfive: { label: "Sifat", sub: "Skor turunan tersimpan" },
    domains: { label: "Konteks tersimpan", sub: "Jumlah · sinyal berdasar" },
  },
};

const IDEN_FOOTNOTE_COPY: Record<IdenLocale, string> = {
  en: "Only enabled, currently displayed items are serialized into every format.",
  ko: "켜 둔 현재 표시 항목만 모든 형식에 직렬화돼요.",
  es: "Solo los elementos visibles y activados se serializan en cada formato.",
  pt: "Somente os itens atuais, visíveis e ativados são serializados em cada formato.",
  id: "Hanya item saat ini yang terlihat dan aktif yang diserialkan ke setiap format.",
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

function usePersistedIdenSession(args: {
  userId: string | null;
  authLoading: boolean;
  hasProfile: boolean | null;
  profileProbeFailed: boolean;
  isMinor: boolean | null;
  locale: "en" | "ko";
}) {
  const { userId, authLoading, hasProfile, profileProbeFailed, isMinor, locale } = args;
  const [session, setSession] = useState<IdenSession | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const controllerRef = useRef<ReturnType<typeof createIdenSessionController> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createIdenSessionController({
      load: (loadUserId, loadOpts) => loadPersistedIden(loadUserId, loadOpts),
      onChange: setSession,
    });
  }
  const canRead = Boolean(
    !authLoading &&
      userId &&
      hasProfile === true &&
      profileProbeFailed === false &&
      isMinor !== null,
  );

  useEffect(() => {
    if (!canRead || !userId) {
      controllerRef.current?.clear();
      return;
    }
    const loadUserId = userId;
    const controller = controllerRef.current;
    if (!controller) return;
    const request = controller.load(loadUserId, { locale });
    return () => {
      controllerRef.current?.cancel(request.requestId);
    };
  }, [canRead, userId, locale, reloadKey]);

  useFocusRefetch(() => setReloadKey((key) => key + 1), canRead);

  return {
    canRead,
    session: canRead && session?.userId === userId ? session : null,
    retry: () => setReloadKey((key) => key + 1),
  };
}

export default function IdenExportScreen() {
  if (isDeepSpaceUI()) return <IdenExportScreenDeepSpace />;
  return <IdenExportScreenLegacy />;
}

// Deep-space IDEN: the canonical default surface. Lifecycle events only read
// the already-persisted snapshot; they never rebuild identity behind the user.
function IdenExportScreenDeepSpace() {
  const { t, i18n } = useTranslation("iden");
  const isKo = i18n.language === "ko";
  const locale = (isKo ? "ko" : "en") as "en" | "ko";
  const uiLocale = (["ko", "es", "pt", "id"].find((lang) => i18n.language.startsWith(lang)) ?? "en") as IdenLocale;
  const { userId, loading, hasProfile, profileProbeFailed, isMinor } = useAuth();
  const { session, retry } = usePersistedIdenSession({
    userId,
    authLoading: loading,
    hasProfile,
    profileProbeFailed,
    isMinor,
    locale,
  });
  const doc = session?.status === "ready" ? session.doc : null;
  const [excluded, setExcluded] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(null), 2400);
    return () => clearTimeout(timeout);
  }, [notice]);

  const traits = doc?.fields.find((field) => field.key === "traits");
  const data: IdenViewData | null = doc
    ? {
        name: `${doc.name}.iden`,
        version: doc.iden,
        northStar: doc.oneLiner,
        bigFive:
          traits && (traits.viz === "radar" || traits.viz === "bar")
            ? Object.entries(traits.data)
                .map(([label, value]) => `${label} ${Math.round(value * 100)}`)
                .join(" · ")
            : null,
      }
    : null;
  const hasData = doc !== null;

  // "Send to AI" exports the real `.iden` text and opens the share sheet (queue
  // C export/share path). When there's no IDEN yet, the empty-state CTA instead
  // routes the user to start gathering, so the action always advances them.
  // Every artifact is serialized from the document currently held by this
  // user-keyed session. No export action re-fetches or rebuilds identity.
  const currentExportDoc = useCallback((): IdenDoc => {
    if (!doc) throw new Error("IDEN snapshot is not ready");
    return visibleIdenDocForExport(doc, excluded);
  }, [doc, excluded]);

  const handleSend = useCallback(async () => {
    if (!hasData) {
      router.push("/interview");
      return;
    }
    try {
      const result = buildIdenExport(currentExportDoc(), { locale });
      await Share.share({ message: result.iden });
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[iden] export/share failed", (e as Error).message);
    }
  }, [hasData, locale, currentExportDoc]);

  const handleCopyJson = useCallback(async () => {
    if (!hasData) return;
    try {
      const result = buildIdenExport(currentExportDoc(), { locale });
      await Clipboard.setStringAsync(result.json);
      setNotice(t("ds.jsonCopied"));
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[iden] json copy failed", (e as Error).message);
      setNotice(t("ds.copyFailed"));
    }
  }, [hasData, locale, currentExportDoc, t]);

  // rev2 IdenScreen: 형식 chips drive what 내보내기 emits — Markdown = the
  // `.iden` text via the share sheet, JSON = clipboard, PDF = the printable
  // sheet (web print dialog; on native it is honest about needing web).
  const [fmt, setFmt] = useState<IdenFormat>("Markdown");

  const handlePreview = useCallback(async () => {
    if (!hasData) return;
    try {
      const result = buildIdenExport(currentExportDoc(), { locale });
      if (Platform.OS === "web") {
        openSheetInNewTab(result.html);
      } else {
        setNotice(t("ds.previewWebOnly"));
      }
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[iden] preview failed", (e as Error).message);
    }
  }, [hasData, locale, currentExportDoc, t]);

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

  if (!loading && !userId) return <Redirect href="/sign-in" />;
  if (!loading && hasProfile === false && !profileProbeFailed) return <Redirect href="/complete-profile" />;

  const stateBody = !hasData ? (
    <View style={dsIden.center}>
      {session?.status === "error" ? (
        <View style={dsIden.stateBlock}>
          <Text variant="body" color="textMuted">
            {t("ds.loadError")}
          </Text>
          <MdButton variant="tonal" label={t("ds.retry")} onPress={retry} />
        </View>
      ) : session?.status === "empty" ? (
        <View style={dsIden.stateBlock}>
          <Text variant="body" color="textMuted">
            {t("ds.empty")}
          </Text>
          <MdButton variant="filled" label={t("ds.startGathering")} onPress={() => router.push("/interview")} />
        </View>
      ) : (
        <PremiumLoadingState message={t("ds.loading")} />
      )}
    </View>
  ) : null;

  const exportRows = canonIden.rows
    .filter((row) => row.id !== "raw")
    .filter((row) => {
      if (!doc) return false;
      if (row.id === "northstar") return doc.oneLiner.length > 0;
      return (ROW_FIELDS[row.id] ?? []).some((key) => doc.fields.some((field) => field.key === key));
    });

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
              <PixelGlyph name="badge" color={m3.color.onTertiaryContainer} size={30} />
            </View>
            <Text style={dsIden.heroName}>{data!.name}</Text>
            <View style={dsIden.heroChips}>
              <View style={dsIden.versionChip}>
                <Text style={dsIden.versionChipText}>{`v${data!.version}`}</Text>
              </View>
            </View>
          </View>

          {/* Only categories backed by the currently loaded persisted document
              are shown. Raw notes are absent because the document has no raw
              payload to gate, and a no-op privacy switch would be misleading. */}
          <Text style={dsIden.sectionLabel}>{t("ds.whatGoesIn")}</Text>
          <View style={dsIden.rowsCard}>
            {exportRows.map((row, i) => {
              const on = !excluded.includes(row.id);
              const rowCopy = IDEN_ROW_COPY[uiLocale][row.id];
              const label = rowCopy?.label ?? row.label;
              const sub =
                row.id === "northstar"
                  ? data!.northStar
                  : row.id === "bigfive"
                    ? data!.bigFive ?? IDEN_ROW_COPY[uiLocale].bigfive.sub
                  : rowCopy?.sub ?? row.sub;
              return (
                <View key={row.id} style={[dsIden.row, i > 0 && dsIden.rowDivider]}>
                  <View style={dsIden.rowText}>
                    <Text style={dsIden.rowLabel}>{label}</Text>
                    <Text style={dsIden.rowSub}>{sub}</Text>
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
              {/* Export applies the same visible-row projection used by these
                  switches and omits hidden narrative fields. */}
            {IDEN_FOOTNOTE_COPY[uiLocale]}
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
    borderRadius: m3.shape.none,
    marginBottom: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: m3.color.surface,
    ...m3.elevation.level1,
  },
  heroName: { fontFamily: m3.font.mono, fontSize: 15, color: m3.color.onTertiaryContainer },
  heroChips: { flexDirection: "row", gap: 6, marginTop: 8 },
  versionChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: m3.shape.none,
    backgroundColor: m3.color.surface,
  },
  versionChipText: { fontSize: 11, fontWeight: "600", color: m3.color.onSurfaceVariant },
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
  // M3 include-switch (1:1 with the settings M3Switch): 52×32 track, 2dp border,
  // thumb 16→24, canon blue (primary) when on. Guarantees the reference accent on
  // web too (the RN built-in Switch renders an off-palette green on react-native-web).
  switchTrack: { width: 52, height: 32, borderRadius: m3.shape.none, borderWidth: 2, justifyContent: "center" },
  switchThumb: { position: "absolute", borderRadius: m3.shape.none },
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
  targetBadge: { width: 30, height: 30, borderRadius: m3.shape.none, alignItems: "center", justifyContent: "center" },
  targetBadgeText: { color: m3.color.onPrimary, fontWeight: "700", fontSize: 14 },
  targetName: { fontSize: 14, color: m3.color.onSurface },
  actions: { flexDirection: "row", gap: 8, marginTop: 22 },
  actionMain: { flex: 1 },
  notice: { textAlign: "center", marginTop: 8 },
});

function IdenExportScreenLegacy() {
  const { t, i18n } = useTranslation("iden");
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const { userId, loading, hasProfile, profileProbeFailed, isMinor } = useAuth();
  const { session, retry } = usePersistedIdenSession({
    userId,
    authLoading: loading,
    hasProfile,
    profileProbeFailed,
    isMinor,
    locale,
  });
  const doc = session?.status === "ready" ? session.doc : null;
  const [resultOpen, setResultOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const notify = useCallback((next: Toast) => {
    setToast(next);
    setTimeout(() => setToast(null), 2400);
  }, []);

  const currentResult = useCallback(() => {
    if (!doc) return null;
    return buildIdenExport(visibleIdenDocForExport(doc, []), { locale });
  }, [doc, locale]);

  const handleBuild = useCallback(() => {
    if (!doc) return;
    setResultOpen(true);
  }, [doc]);

  const handleCopy = useCallback(async () => {
    const result = currentResult();
    if (!result) return;
    try {
      await Clipboard.setStringAsync(result.iden);
      notify({ tone: "success", message: t("result.copied") });
    } catch {
      notify({ tone: "danger", message: t("error") });
    }
  }, [currentResult, notify, t]);

  const handleShare = useCallback(async () => {
    const result = currentResult();
    if (!result) return;
    try {
      await Share.share({ message: result.iden });
    } catch {
      /* user dismissed the share sheet */
    }
  }, [currentResult]);

  if (!loading && !userId) return <Redirect href="/sign-in" />;
  if (!loading && hasProfile === false && !profileProbeFailed) return <Redirect href="/complete-profile" />;
  if (loading || !userId || profileProbeFailed || hasProfile !== true || isMinor === null) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={t("loading")} />
        </View>
      </PremiumAppShell>
    );
  }
  if (session?.status === "error") {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <Text variant="body" color="textMuted">{t("ds.loadError")}</Text>
          <Button label={t("ds.retry")} onPress={retry} />
        </View>
      </PremiumAppShell>
    );
  }

  if (session?.status === "empty") {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <Text variant="body" color="textMuted">{t("ds.empty")}</Text>
          <Button label={t("ds.startGathering")} onPress={() => router.push("/interview")} />
        </View>
      </PremiumAppShell>
    );
  }

  if (!doc) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={t("loading")} />
        </View>
      </PremiumAppShell>
    );
  }

  const isWeb = Platform.OS === "web";
  const renderedResult = resultOpen ? currentResult() : null;

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
            label={t("ds.export")}
            onPress={handleBuild}
            accessibilityHint={t("generate.accessibilityHint")}
          />
        </View>
      </ScrollView>

      <PremiumModal visible={resultOpen && renderedResult !== null} onClose={() => setResultOpen(false)}>
        <Text variant="heading" color="text">{t("result.title")}</Text>
        <Text variant="caption" color="textMuted" style={styles.hint}>{t("result.hint")}</Text>
        <ScrollView style={styles.codeBox}>
          <Text variant="caption" color="textMuted" style={styles.code} selectable>{renderedResult?.iden}</Text>
        </ScrollView>
        <View style={styles.actions}>
          <Button label={t("result.copy")} onPress={handleCopy} />
          {isWeb ? (
            <Button label={t("result.openSheet")} variant="secondary" onPress={() => {
              const result = currentResult();
              if (result) openSheetInNewTab(result.html);
            }} />
          ) : (
            <Button label={t("result.share")} variant="secondary" onPress={handleShare} />
          )}
          <Button label={t("result.close")} variant="ghost" onPress={() => setResultOpen(false)} />
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
    borderRadius: 0,
    backgroundColor: semantic.surface,
  },
  hint: { marginTop: spacing.xs },
  codeBox: {
    maxHeight: 280,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 0,
    backgroundColor: semantic.background,
  },
  code: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
});
