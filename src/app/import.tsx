// Import external self-knowledge. The route keeps LLM locale plumbing local,
// while all user-facing copy lives in the import locale namespace.

import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Platform, KeyboardAvoidingView } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumAppShell, PremiumCard, PremiumButton, PremiumTextarea, PremiumLoadingState, SceneHero, PremiumToast } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { cosmic, radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { useKeyboard } from "@/lib/ui/useKeyboard";
import { VILLAGE_UI } from "@/lib/village-ui";
import { callGemini } from "@/lib/llm/gemini";
import {
  buildExtractionPrompt,
  INGEST_SYSTEM,
  parseIngestResult,
  renderIngestMarkdown,
  type IngestResult,
} from "@/lib/wiki/import-external";
import { captureFromMarkdown } from "@/lib/wiki/capture";

type Phase = "input" | "analyzing" | "result" | "saved";
type Toast = { message: string; tone: "danger" | "info" | "success" };

export default function ImportExternal() {
  const { t, i18n } = useTranslation("import");
  const { userId, loading, isMinor, hasProfile } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const kbHeight = useKeyboard();

  const [raw, setRaw] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [result, setResult] = useState<IngestResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  // True when the smart sort failed and we fell back to the local parser, so
  // the result view can disclose the basic pass honestly.
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(h);
  }, [toast]);

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
  // No-profile OAuth session must not reach this LLM surface; collect DOB and
  // consent first on /complete-profile.
  if (hasProfile === false) return <Redirect href="/complete-profile" />;

  async function copyPrompt() {
    const prompt = buildExtractionPrompt(locale);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(prompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        // Native / unsupported: place it in the paste box so the user can
        // long-press to copy it without overwriting existing pasted material.
        if (raw.trim().length === 0) setRaw(prompt);
        setToast({ tone: "info", message: t("toast.promptPlaced") });
      }
    } catch {
      if (raw.trim().length === 0) setRaw(prompt);
    }
  }

  async function analyze() {
    if (!userId || raw.trim().length === 0 || phase === "analyzing") return;
    setPhase("analyzing");
    setDegraded(false);
    try {
      const reply = await callGemini({ userId, locale, purpose: "import_ingest", system: INGEST_SYSTEM, user: raw.trim(), minor: isMinor === true });
      setResult(parseIngestResult(reply.text, raw.trim()));
      setPhase("result");
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[import] analyze failed", (e as Error).message);
      setResult(parseIngestResult("", raw.trim()));
      setDegraded(true);
      setPhase("result");
    }
  }

  async function save() {
    if (!userId || !result || saving) return;
    setSaving(true);
    try {
      await captureFromMarkdown({
        userId,
        rawMd: renderIngestMarkdown(result, locale),
        fallbackUrl: null,
        kindOverride: "self_knowledge",
        userTags: result.tags,
        track: result.track,
      });
      setPhase("saved");
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[import] save failed", (e as Error).message);
      setToast({ tone: "danger", message: t("toast.saveFailed") });
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setRaw("");
    setResult(null);
    setDegraded(false);
    setPhase("input");
  }

  const trackLabel = result?.track === "pro" ? t("result.track.pro") : t("result.track.life");

  return (
    <PremiumAppShell>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.scroll, Platform.OS === "android" && { paddingBottom: Math.max(styles.scroll.paddingBottom || 0, kbHeight + 24) }]} keyboardShouldPersistTaps="handled">
          <SceneHero
            eyebrow={t("hero.eyebrow")}
            title={t("hero.title")}
            subtitle={t("hero.subtitle")}
            island={VILLAGE_UI.knowledge.island}
            worker={VILLAGE_UI.knowledge.worker}
            accent={VILLAGE_UI.knowledge.accent}
            speech={t("hero.speech")}
          />

          {phase === "input" || phase === "analyzing" ? (
            <>
              <PremiumCard
                eyebrow={t("promptCard.eyebrow")}
                title={t("promptCard.title")}
                accent={cosmic.soulViolet}
              >
                <Text variant="body" color="textMuted">
                  {t("promptCard.description")}
                </Text>
                <PremiumButton
                  label={copied ? t("promptCard.copied") : t("promptCard.copy")}
                  variant="secondary"
                  onPress={copyPrompt}
                  accessibilityHint={t("promptCard.copyHint")}
                />
              </PremiumCard>

              <PremiumCard
                eyebrow={t("pasteCard.eyebrow")}
                title={t("pasteCard.title")}
                accent={cosmic.signalMint}
              >
                <Text variant="body" color="textMuted">
                  {t("pasteCard.description")}
                </Text>
                <PremiumTextarea
                  value={raw}
                  onChangeText={setRaw}
                  editable={phase !== "analyzing"}
                  placeholder={t("pasteCard.placeholder")}
                  accessibilityLabel={t("pasteCard.accessibilityLabel")}
                  style={{ minHeight: 160 }}
                />
                <PremiumButton
                  label={t("pasteCard.sort")}
                  variant="primary"
                  loading={phase === "analyzing"}
                  disabled={raw.trim().length === 0 || phase === "analyzing"}
                  onPress={analyze}
                  accessibilityHint={t("pasteCard.sortHint")}
                  full
                />
              </PremiumCard>
            </>
          ) : null}

          {(phase === "result" || phase === "saved") && result ? (
            <>
              <PremiumCard
                eyebrow={t("result.eyebrow")}
                title={t("result.title")}
                accent={cosmic.pixelLamp}
                glow
              >
                {degraded ? (
                  <View style={styles.degradedNote} accessibilityRole="alert">
                    <Text variant="subtle" color="textMuted">
                      {t("result.degraded")}
                    </Text>
                  </View>
                ) : null}
                {result.summary ? <Text variant="body">{result.summary}</Text> : null}
                <View style={styles.tagRow}>
                  {result.tags.map((tag) => (
                    <View key={tag} style={styles.tagChip}><Text variant="caption" color="brand">#{tag}</Text></View>
                  ))}
                </View>
                <Text variant="subtle" color="textSubtle">
                  {t("result.meta", { count: result.items.length, track: trackLabel })}
                </Text>
              </PremiumCard>

              {result.items.map((item, index) => (
                <View key={index} style={styles.itemRow}>
                  <View style={[styles.itemDot, { backgroundColor: SECTION_ACCENT[item.section] }]} />
                  <View style={{ flex: 1 }}>
                    <Text variant="body">{item.title}</Text>
                    {item.detail ? <Text variant="subtle" color="textMuted">{item.detail}</Text> : null}
                  </View>
                </View>
              ))}

              {phase === "result" ? (
                <PremiumButton
                  label={t("result.keep")}
                  variant="primary"
                  loading={saving}
                  disabled={saving}
                  onPress={save}
                  accessibilityHint={t("result.keepHint")}
                  full
                />
              ) : (
                <PremiumCard accent={cosmic.signalMint} glow>
                  <Text variant="body" color="brand">{t("saved.title")}</Text>
                  <Text variant="subtle" color="textMuted">
                    {t("saved.body")}
                  </Text>
                  <View style={styles.savedActions}>
                    <PremiumButton label={t("saved.graph")} variant="secondary" onPress={() => router.push("/")} accessibilityHint={t("saved.graphHint")} style={{ flex: 1 }} />
                    <PremiumButton label={t("saved.more")} variant="ghost" onPress={reset} accessibilityHint={t("saved.moreHint")} style={{ flex: 1 }} />
                  </View>
                </PremiumCard>
              )}
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
      {toast ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <PremiumToast message={toast.message} tone={toast.tone} />
        </View>
      ) : null}
    </PremiumAppShell>
  );
}

const SECTION_ACCENT: Record<string, string> = {
  trait: cosmic.soulViolet,
  value: cosmic.pixelLamp,
  relationship: cosmic.pixelLamp,
  motivation: cosmic.signalMint,
  context: cosmic.signalBlue,
  preference: cosmic.dreamPink,
};

const styles = StyleSheet.create({
  scroll: { gap: spacing.lg, paddingBottom: 120 },
  center: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
  degradedNote: {
    backgroundColor: semantic.surfaceAlt,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  tagChip: {
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  itemRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingHorizontal: spacing.sm },
  itemDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  savedActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  toastWrap: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.xl, alignItems: "stretch" },
});
