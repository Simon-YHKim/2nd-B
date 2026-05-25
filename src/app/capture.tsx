// Capture screen — the user-facing entrypoint into the RAG ingest pipeline.
// Accepts a URL + raw clipper markdown (or just a free-form note), calls
// captureFromMarkdown() which uploads to Supabase Storage and inserts a
// sources row, then either clears the form (capture-another-immediately
// flow) or navigates back to the journal.

import { useMemo, useState } from "react";
import { View, StyleSheet, Alert, ScrollView, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { radii, semantic, spacing, typography } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { captureFromMarkdown } from "@/lib/wiki/capture";
import { detectClipperKind } from "@/lib/wiki/clipper-kind";
import { buildSourcePayload } from "@/lib/wiki/ingest-helpers";
import type { SourceKind } from "@/lib/wiki/types";

const KIND_LABEL: Record<SourceKind, { en: string; ko: string }> = {
  inbox: { en: "Inbox", ko: "받은편지함" },
  article: { en: "Article", ko: "아티클" },
  video: { en: "Video", ko: "영상" },
  paper: { en: "Paper", ko: "논문" },
  reddit: { en: "Reddit", ko: "레딧" },
  code: { en: "Code", ko: "코드" },
  ai_tool: { en: "AI Tool", ko: "AI 도구" },
  self_knowledge: { en: "Self-Knowledge", ko: "자기 이해" },
};

export default function Capture() {
  const { t, i18n } = useTranslation("capture");
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";

  const [url, setUrl] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [kindOverride, setKindOverride] = useState<SourceKind | null>(null);

  // Live preview of the detected clipper kind so the user sees what they'll
  // get before submitting.
  const detected = useMemo<SourceKind>(() => {
    if (url.trim().length === 0) return "inbox";
    return detectClipperKind(url.trim());
  }, [url]);

  // Live preview of the parsed payload so the user can verify
  // title/slug/tags before submitting.
  const preview = useMemo(() => {
    if (body.trim().length === 0) return null;
    try {
      return buildSourcePayload(body, url.trim().length > 0 ? url.trim() : null, kindOverride);
    } catch {
      return null;
    }
  }, [body, url, kindOverride]);

  const canSubmit = userId !== null && body.trim().length > 0 && !submitting;

  if (loading) return null;
  if (!userId) {
    router.replace("/sign-in");
    return null;
  }

  async function handleSubmit(): Promise<void> {
    if (!userId) return;
    setSubmitting(true);
    try {
      const result = await captureFromMarkdown({
        userId,
        rawMd: body,
        fallbackUrl: url.trim().length > 0 ? url.trim() : null,
        kindOverride,
      });
      const msg =
        locale === "ko"
          ? `${KIND_LABEL[result.source.kind].ko}로 저장됐어요: ${result.source.title}`
          : `Captured as ${KIND_LABEL[result.source.kind].en}: ${result.source.title}`;
      Alert.alert(msg);
      setUrl("");
      setBody("");
      setKindOverride(null);
    } catch (e) {
      const msg =
        locale === "ko"
          ? "저장에 실패했어요. 잠시 후 다시 시도해 주세요."
          : "Could not save. Please try again in a moment.";
      Alert.alert(msg);
      if (typeof console !== "undefined") console.warn("[capture] error", (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text variant="caption" color="brand">
              2nd-Brain
            </Text>
            <Text variant="heading" style={styles.title}>
              {t("title")}
            </Text>
            <Text variant="body" color="textMuted">
              {t("subtitle")}
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.fieldGroup}>
              <Text variant="caption" color="textMuted">
                {t("url.label")}
              </Text>
              <Input
                value={url}
                onChangeText={setUrl}
                placeholder={t("url.placeholder")}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                inputMode="url"
              />
              {url.trim().length > 0 ? (
                <View style={styles.detectedRow}>
                  <View style={styles.detectedDot} />
                  <Text variant="subtle" color="textMuted">
                    {locale === "ko"
                      ? `자동 인식: ${KIND_LABEL[(kindOverride ?? detected)].ko}`
                      : `${kindOverride ? "Override" : "Detected"}: ${KIND_LABEL[(kindOverride ?? detected)].en}`}
                  </Text>
                </View>
              ) : null}
              <View style={styles.kindOverrideRow}>
                {(["inbox", "article", "video", "paper", "reddit", "code", "ai_tool", "self_knowledge"] as SourceKind[]).map((k) => {
                  const active = (kindOverride ?? detected) === k;
                  return (
                    <Pressable
                      key={k}
                      onPress={() => setKindOverride(k === detected ? null : k)}
                      style={[styles.kindOverrideChip, active && styles.kindOverrideChipActive]}
                      hitSlop={2}
                    >
                      <Text variant="caption" color={active ? "background" : "textMuted"}>
                        {KIND_LABEL[k][locale]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text variant="caption" color="textMuted">
                {t("body.label")}
              </Text>
              <Input
                value={body}
                onChangeText={setBody}
                placeholder={t("body.placeholder")}
                multiline
                numberOfLines={12}
                textAlignVertical="top"
                style={styles.textarea}
              />
              <View style={styles.helperRow}>
                <Text variant="subtle" color="textSubtle" style={styles.helper}>
                  {t("body.helper")}
                </Text>
                <Text variant="subtle" color="textSubtle">
                  {body.length.toLocaleString()} {locale === "ko" ? "자" : "chars"}
                </Text>
              </View>
            </View>

            {preview ? (
              <View style={styles.previewCard}>
                <Text variant="caption" color="brand">
                  {locale === "ko" ? "미리보기" : "Preview"}
                </Text>
                <Text variant="subtle" color="textMuted">
                  <Text variant="subtle" color="textSubtle">
                    {locale === "ko" ? "제목: " : "Title: "}
                  </Text>
                  {preview.payload.title}
                </Text>
                <Text variant="subtle" color="textMuted">
                  <Text variant="subtle" color="textSubtle">
                    {locale === "ko" ? "슬러그: " : "Slug: "}
                  </Text>
                  {preview.suggested_slug}
                </Text>
                {preview.payload.tags.length > 0 ? (
                  <Text variant="subtle" color="textMuted">
                    <Text variant="subtle" color="textSubtle">
                      {locale === "ko" ? "태그: " : "Tags: "}
                    </Text>
                    {preview.payload.tags.join(", ")}
                  </Text>
                ) : null}
              </View>
            ) : null}

            <Button
              label={t("submit")}
              variant="primary"
              onPress={handleSubmit}
              disabled={!canSubmit}
              loading={submitting}
            />
            <Button label={t("cancel")} variant="secondary" onPress={() => router.back()} disabled={submitting} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xl, gap: spacing.lg },
  header: { gap: spacing.xs, marginBottom: spacing.lg },
  title: { marginTop: spacing.xs },
  form: { gap: spacing.md },
  fieldGroup: { gap: spacing.sm },
  detectedRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: -spacing.xs },
  detectedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: semantic.brand },
  textarea: {
    minHeight: 240,
    paddingTop: spacing.md,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, monospace" }),
    fontSize: typography.sizes.sm,
    borderRadius: radii.md,
  },
  helper: { marginTop: -spacing.xs, flex: 1 },
  helperRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm },
  kindOverrideRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs },
  kindOverrideChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surfaceAlt,
  },
  kindOverrideChipActive: { backgroundColor: semantic.brand, borderColor: semantic.brand },
  previewCard: {
    backgroundColor: semantic.surfaceAlt,
    borderColor: semantic.brand,
    borderLeftWidth: 3,
    borderRadius: radii.sm,
    padding: spacing.sm,
    gap: 2,
  },
});
