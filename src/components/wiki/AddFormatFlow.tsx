// AI add-format flow (item 1b). Top: an AI chat input where the user describes
// the kind of material + how they'd file it. AI drafts a clipper format
// via proposeClipperTemplate (C1/C3/C9 + C-vocabulary guard live there), shown
// as a read-only preview; on the user's consent it's saved via saveTemplate.
//
// proposeClipperTemplate returns null in mock mode / on a bad or filtered reply,
// so the UI shows a "couldn't draft" hint rather than failing.

import { useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { PremiumButton, PremiumCard } from "@/components/premium";
import { semantic, spacing } from "@/lib/theme/tokens";
import { proposeClipperTemplate, type ProposedClipperTemplate } from "@/lib/wiki/propose-template";
import { saveTemplate, type CustomClipperTemplate } from "@/lib/wiki/template-queries";
import { FormatSchemaView, type FormatSchemaInput } from "./FormatSchemaView";

export function AddFormatFlow({
  userId,
  locale,
  onSaved,
  onCancel,
}: {
  userId: string;
  locale: "en" | "ko";
  onSaved: (t: CustomClipperTemplate) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("formats");
  const ko = locale === "ko";
  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [proposed, setProposed] = useState<ProposedClipperTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (input.trim().length === 0 || generating) return;
    setGenerating(true);
    setError(null);
    setProposed(null);
    try {
      const p = await proposeClipperTemplate(userId, input.trim(), null, locale);
      if (!p) {
        setError(t("add.errorNeedDetail"));
      } else {
        setProposed(p);
      }
    } catch (e) {
      console.warn("[AddFormatFlow] draft failed", (e as Error).message);
      setError(t("add.errorDraft"));
    } finally {
      setGenerating(false);
    }
  }

  async function add() {
    if (!proposed || saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveTemplate({
        ownerId: userId,
        slug: proposed.slug,
        baseKind: proposed.baseKind,
        name: proposed.name,
        what: proposed.what,
        defaultTags: proposed.defaultTags,
        targetCategory: proposed.targetCategory,
        aiProperties: proposed.aiProperties,
        triggers: [],
        shared: false,
      });
      onSaved(saved);
    } catch (e) {
      console.warn("[AddFormatFlow] save failed", (e as Error).message);
      setError(t("add.errorSave"));
    } finally {
      setSaving(false);
    }
  }

  const schema: FormatSchemaInput | null = proposed
    ? {
        name: (ko ? proposed.name.ko : proposed.name.en) || proposed.name.en || proposed.name.ko,
        baseKind: proposed.baseKind,
        what: (ko ? proposed.what.ko : proposed.what.en) || proposed.what.en || proposed.what.ko,
        targetCategory: proposed.targetCategory,
        defaultTags: proposed.defaultTags,
        triggers: [],
        aiProperties: proposed.aiProperties.map((p) => ({
          name: p.name,
          type: p.type,
          describe: ko ? p.describe.ko : p.describe.en,
        })),
      }
    : null;

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Text variant="heading">{t("add.title")}</Text>
      <Text variant="subtle" color="textMuted">
        {t("add.body")}
      </Text>

      <Input
        value={input}
        onChangeText={setInput}
        placeholder={t("add.placeholder")}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />

      <PremiumButton
        label={generating ? t("add.drafting") : t("add.draft")}
        variant="primary"
        onPress={generate}
        loading={generating}
        disabled={generating || input.trim().length === 0}
        full
      />

      {error ? <Text variant="subtle" color="danger">{error}</Text> : null}

      {schema ? (
        <PremiumCard accent={semantic.brand} eyebrow={t("add.proposedEyebrow")} title={schema.name}>
          <FormatSchemaView schema={schema} locale={locale} />
          <View style={styles.actions}>
            <PremiumButton
              label={t("add.addThis")}
              variant="primary"
              onPress={add}
              loading={saving}
              disabled={saving}
              style={styles.primaryAction}
            />
            <PremiumButton
              label={t("add.redo")}
              variant="secondary"
              onPress={() => setProposed(null)}
              disabled={saving}
              style={styles.secondaryAction}
            />
          </View>
        </PremiumCard>
      ) : null}

      <PremiumButton label={t("add.cancel")} variant="ghost" onPress={onCancel} disabled={saving} full />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.md, paddingBottom: spacing.xl },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  primaryAction: { flexGrow: 1, flexShrink: 1, minWidth: 180 },
  secondaryAction: { flexGrow: 1, flexShrink: 1, minWidth: 96 },
});
