// AI add-format flow (item 1b). Top: an AI chat input where the user describes
// the kind of material + how they'd file it. AI drafts a clipper format (JSON,
// via proposeClipperTemplate — C1/C3/C9 + C-vocabulary guard live there), shown
// as a read-only preview; on the user's consent it's saved via saveTemplate.
//
// proposeClipperTemplate returns null in mock mode / on a bad or filtered reply,
// so the UI shows a "couldn't draft" hint rather than failing.

import { useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";

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
        setError(ko ? "형식을 만들지 못했어요. 더 구체적으로 적고 다시 시도해 주세요." : "Couldn't draft a format. Add detail and try again.");
      } else {
        setProposed(p);
      }
    } catch (e) {
      setError((e as Error).message);
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
      setError((e as Error).message);
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
      <Text variant="heading">{ko ? "형식 추가" : "Add a format"}</Text>
      <Text variant="subtle" color="textMuted">
        {ko
          ? "어떤 자료를 어떻게 정리하고 싶은지 적어주세요. AI가 형식 초안을 JSON으로 만들어 드려요."
          : "Describe the material and how you'd file it. AI drafts a format (JSON)."}
      </Text>

      <Input
        value={input}
        onChangeText={setInput}
        placeholder={
          ko
            ? "예: 팟캐스트 에피소드 — 출연자와 핵심 주장을 정리하고 싶어요"
            : "e.g. Podcast episodes — capture the guest and key claims"
        }
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />

      <PremiumButton
        label={generating ? (ko ? "만드는 중…" : "Drafting…") : (ko ? "AI로 형식 만들기" : "Draft with AI")}
        variant="primary"
        onPress={generate}
        loading={generating}
        disabled={generating || input.trim().length === 0}
        full
      />

      {error ? <Text variant="subtle" color="danger">{error}</Text> : null}

      {schema ? (
        <PremiumCard accent={semantic.brand} eyebrow={ko ? "제안된 형식" : "Proposed format"} title={schema.name}>
          <FormatSchemaView schema={schema} locale={locale} />
          <View style={styles.actions}>
            <PremiumButton
              label={ko ? "이 형식 추가" : "Add this format"}
              variant="primary"
              onPress={add}
              loading={saving}
              disabled={saving}
              style={{ flex: 1 }}
            />
            <PremiumButton
              label={ko ? "다시" : "Redo"}
              variant="secondary"
              onPress={() => setProposed(null)}
              disabled={saving}
            />
          </View>
        </PremiumCard>
      ) : null}

      <PremiumButton label={ko ? "취소" : "Cancel"} variant="ghost" onPress={onCancel} disabled={saving} full />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.md, paddingBottom: spacing.xl },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
});
