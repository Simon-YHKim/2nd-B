// Read-only view of a clipper format's classification "양식" — how the AI files
// a piece under this format. Shared by /formats (tap a format to see it, item
// 1a) and the AI add-format preview (item 1b). Locale-resolved strings come in
// already picked, so this component is locale-agnostic for the values.

import { View, StyleSheet } from "react-native";

import { Text } from "@/components/ui/Text";
import { radii, semantic, spacing } from "@/lib/theme/tokens";

export interface FormatSchemaInput {
  name: string;
  baseKind: string;
  what: string;
  targetCategory: string;
  defaultTags: readonly string[];
  triggers: readonly string[];
  /** describe is already locale-resolved. */
  aiProperties: readonly { name: string; type: string; describe: string }[];
}

function formatPropertyType(type: string, ko: boolean): string {
  if (type === "number") return ko ? "숫자" : "Number";
  if (type === "multitext") return ko ? "목록" : "List";
  return ko ? "짧은 글" : "Text";
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text variant="caption" color="textMuted" style={styles.fieldLabel}>{label}</Text>
      <Text variant="body">{value}</Text>
    </View>
  );
}

export function FormatSchemaView({ schema, locale }: { schema: FormatSchemaInput; locale: "en" | "ko" }) {
  const ko = locale === "ko";
  return (
    <View style={styles.wrap}>
      <Field label={ko ? "이름" : "Name"} value={schema.name} />
      {schema.what ? <Field label={ko ? "설명" : "What it is"} value={schema.what} /> : null}
      <Field label={ko ? "기본 종류" : "Main type"} value={schema.baseKind} />
      {schema.targetCategory ? (
        <Field label={ko ? "위키 영역" : "Wiki area"} value={schema.targetCategory} />
      ) : null}

      {schema.defaultTags.length > 0 ? (
        <View style={styles.field}>
          <Text variant="caption" color="textMuted" style={styles.fieldLabel}>{ko ? "기본 해시태그" : "Default tags"}</Text>
          <View style={styles.chipRow}>
            {schema.defaultTags.map((t) => (
              <View key={t} style={styles.chip}><Text style={styles.chipText}>#{t}</Text></View>
            ))}
          </View>
        </View>
      ) : null}

      {schema.triggers.length > 0 ? (
        <View style={styles.field}>
          <Text variant="caption" color="textMuted" style={styles.fieldLabel}>{ko ? "자동 매칭 링크" : "Auto-match links"}</Text>
          {schema.triggers.slice(0, 8).map((t) => (
            <Text key={t} variant="subtle" color="textSubtle" numberOfLines={1}>{t}</Text>
          ))}
        </View>
      ) : null}

      <View style={styles.field}>
        <Text variant="caption" color="textMuted" style={styles.fieldLabel}>
          {ko ? "자료마다 저장하는 세부 항목" : "Details saved from each piece"}
        </Text>
        {schema.aiProperties.length === 0 ? (
          <Text variant="subtle" color="textSubtle">
            {ko ? "요약, 해시태그, 관련도 같은 공통 항목만 저장해요." : "Only common fields such as summary, tags, and relevance are saved."}
          </Text>
        ) : (
          schema.aiProperties.map((p) => (
            <View key={p.name} style={styles.propRow}>
              <View style={styles.propHeader}>
                <View style={styles.propDot} />
                <Text variant="caption" style={styles.propName} numberOfLines={1}>
                  {p.name}
                </Text>
                <View style={styles.typeChip}>
                  <Text style={styles.typeText}>{formatPropertyType(p.type, ko)}</Text>
                </View>
              </View>
              {p.describe ? (
                <Text variant="subtle" color="textMuted" style={styles.propDesc}>{p.describe}</Text>
              ) : null}
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  field: { gap: 2 },
  fieldLabel: { letterSpacing: 0 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: 2 },
  chip: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: semantic.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chipText: { color: semantic.brand, fontSize: 12, lineHeight: 16 },
  propRow: {
    marginTop: spacing.xs,
    gap: spacing.xs,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surfaceAlt,
    padding: spacing.sm,
  },
  propHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  propDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: semantic.brand },
  propName: { flex: 1 },
  typeChip: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: semantic.border,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  typeText: { color: semantic.textSubtle, fontSize: 11, lineHeight: 14 },
  propDesc: { lineHeight: 18 },
});
