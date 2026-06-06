// Full edit form for one of the user's own clipper formats (/formats → edit).
// Controlled fields for every editable column; slug / ownerId / isShared are
// owned by the parent (slug is the upsert key; isShared is the list's toggle).
// Save runs validateTemplateDraft first — including the C-vocabulary gate, since
// a shared format is community-visible. Token-only styling per DESIGN.md.

import { useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";

import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { PremiumButton } from "@/components/premium";
import { semantic, radii, spacing, typography } from "@/lib/theme/tokens";
import {
  TARGET_CATEGORIES,
  type ClipperAiProperty,
  type TargetCategory,
} from "@/lib/wiki/clipper-templates";
import { SOURCE_KINDS, type SourceKind } from "@/lib/wiki/types";
import type { CustomClipperTemplate } from "@/lib/wiki/template-queries";
import { validateTemplateDraft, type TemplateDraft } from "@/lib/wiki/template-validate";
import { sanitizeTag } from "@/lib/wiki/tags";

type Locale = "en" | "ko";
type PropType = ClipperAiProperty["type"];

const PROP_TYPES: PropType[] = ["text", "multitext", "number"];
const PROP_TYPE_LABEL: Record<PropType, { en: string; ko: string }> = {
  text: { en: "Text", ko: "텍스트" },
  multitext: { en: "Long", ko: "여러 줄" },
  number: { en: "Number", ko: "숫자" },
};
const TARGET_OPTIONS: (TargetCategory | "")[] = ["", ...TARGET_CATEGORIES];

export interface TemplateEditorProps {
  initial: CustomClipperTemplate;
  locale: Locale;
  saving: boolean;
  onSave: (draft: TemplateDraft) => void;
  onCancel: () => void;
}

export function TemplateEditor({ initial, locale, saving, onSave, onCancel }: TemplateEditorProps) {
  const [nameKo, setNameKo] = useState(initial.name.ko);
  const [nameEn, setNameEn] = useState(initial.name.en);
  const [whatKo, setWhatKo] = useState(initial.what.ko);
  const [whatEn, setWhatEn] = useState(initial.what.en);
  const [baseKind, setBaseKind] = useState<SourceKind>(initial.baseKind);
  const [targetCategory, setTargetCategory] = useState<TargetCategory | "">(initial.targetCategory);
  const [triggers, setTriggers] = useState<string[]>(initial.triggers);
  const [defaultTags, setDefaultTags] = useState<string[]>(initial.defaultTags);
  const [wikiTarget, setWikiTarget] = useState(initial.wikiTarget);
  const [aiProps, setAiProps] = useState<ClipperAiProperty[]>(initial.aiProperties);
  const [errors, setErrors] = useState<string[]>([]);

  function updateProp(i: number, patch: Partial<ClipperAiProperty>) {
    setAiProps((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  function updateDescribe(i: number, lang: Locale, value: string) {
    setAiProps((prev) =>
      prev.map((p, idx) => (idx === i ? { ...p, describe: { ...p.describe, [lang]: value } } : p)),
    );
  }
  function addProp() {
    setAiProps((prev) => [...prev, { name: "", type: "text", describe: { en: "", ko: "" } }]);
  }
  function removeProp(i: number) {
    setAiProps((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleSave() {
    const draft: TemplateDraft = {
      baseKind,
      name: { en: nameEn.trim(), ko: nameKo.trim() },
      what: { en: whatEn.trim(), ko: whatKo.trim() },
      triggers,
      defaultTags,
      targetCategory,
      wikiTarget: wikiTarget.trim(),
      // Drop blank-named properties so an empty "add" row never persists.
      aiProperties: aiProps.filter((p) => p.name.trim().length > 0),
    };
    const v = validateTemplateDraft(draft, locale);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors([]);
    onSave(draft);
  }

  const headerName = (locale === "ko" ? initial.name.ko : initial.name.en) || initial.name.en || initial.name.ko;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text variant="caption" color="brand" style={styles.eyebrow}>
          {locale === "ko" ? "형식 편집" : "Edit format"}
        </Text>
        <Text variant="heading" style={{ fontSize: 20 }} numberOfLines={1}>
          {headerName}
        </Text>
      </View>

      {/* Name (both locales) */}
      <Field label={locale === "ko" ? "이름" : "Name"}>
        <Input value={nameKo} onChangeText={setNameKo} placeholder={locale === "ko" ? "한글 이름" : "Korean name"} />
        <Input value={nameEn} onChangeText={setNameEn} placeholder={locale === "ko" ? "영어 이름" : "English name"} autoCapitalize="words" />
      </Field>

      {/* Description (both locales) */}
      <Field label={locale === "ko" ? "설명" : "Description"} hint={locale === "ko" ? "이 형식이 무엇인지 한 줄로" : "One line on what this format is"}>
        <Input
          value={whatKo}
          onChangeText={setWhatKo}
          placeholder={locale === "ko" ? "한 줄 설명" : "Korean one-liner"}
          multiline
          numberOfLines={2}
          textAlignVertical="top"
          style={styles.area}
        />
        <Input
          value={whatEn}
          onChangeText={setWhatEn}
          placeholder={locale === "ko" ? "영어 한 줄 설명" : "English one-liner"}
          multiline
          numberOfLines={2}
          textAlignVertical="top"
          style={styles.area}
        />
      </Field>

      {/* Source type */}
      <Field label={locale === "ko" ? "자료 종류" : "Source type"} hint={locale === "ko" ? "저장할 때 어떤 자료로 분류할지 정해요" : "Choose how captures using this format are saved."}>
        <SelectRow
          options={SOURCE_KINDS}
          value={baseKind}
          onSelect={setBaseKind}
          labelOf={(k) => k}
        />
      </Field>

      {/* Filing area */}
      <Field label={locale === "ko" ? "분류 위치" : "Filing area"}>
        <SelectRow
          options={TARGET_OPTIONS}
          value={targetCategory}
          onSelect={setTargetCategory}
          labelOf={(c) => (c === "" ? (locale === "ko" ? "아직 정하지 않음" : "No area yet") : c)}
        />
      </Field>

      {/* Auto-match links */}
      <Field label={locale === "ko" ? "자동 연결 조건" : "Auto-match links"} hint={locale === "ko" ? "맞는 주소를 캡처하면 이 형식으로 자동 분류돼요." : "Matching links are filed with this format automatically."}>
        <TagField
          values={triggers}
          onChange={setTriggers}
          locale={locale}
          addLabel={locale === "ko" ? "조건 추가" : "Add link rule"}
        />
      </Field>

      {/* Default tags (sanitized to lowercase-hyphen) */}
      <Field label={locale === "ko" ? "기본 태그" : "Default tags"}>
        <TagField
          values={defaultTags}
          onChange={setDefaultTags}
          sanitize={sanitizeTag}
          locale={locale}
          addLabel={locale === "ko" ? "태그 추가" : "Add tag"}
        />
      </Field>

      {/* Saved folder */}
      <Field label={locale === "ko" ? "저장 폴더" : "Saved folder"} hint={locale === "ko" ? "선택 사항이에요. 예: tools/" : "Optional folder name. For example: tools/"}>
        <Input value={wikiTarget} onChangeText={setWikiTarget} placeholder="tools/" autoCapitalize="none" autoCorrect={false} />
      </Field>

      {/* Details to save */}
      <Field
        label={locale === "ko" ? "저장할 세부 정보" : "Details to save"}
        hint={locale === "ko" ? "내용을 읽고 함께 저장할 항목이에요" : "Details to extract and save from each capture."}
      >
        {aiProps.length === 0 ? (
          <Text variant="subtle" color="textSubtle">
            {locale === "ko" ? "아직 없음" : "None yet"}
          </Text>
        ) : null}
        {aiProps.map((p, i) => (
          <View key={i} style={styles.propCard}>
            <View style={styles.propTopRow}>
              <Input
                value={p.name}
                onChangeText={(t) => updateProp(i, { name: t })}
                placeholder={locale === "ko" ? "세부 정보 이름 (예: 주제 영역)" : "Detail name (e.g. topic area)"}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.propNameInput}
              />
              <Pressable
                onPress={() => removeProp(i)}
                hitSlop={6}
                style={styles.propRemove}
                accessibilityRole="button"
                accessibilityLabel={locale === "ko" ? "세부 정보 삭제" : "Remove detail"}
              >
                <Text variant="caption" color="textSubtle">{locale === "ko" ? "삭제" : "Remove"}</Text>
              </Pressable>
            </View>
            <SelectRow
              options={PROP_TYPES}
              value={p.type}
              onSelect={(t) => updateProp(i, { type: t })}
              labelOf={(t) => PROP_TYPE_LABEL[t][locale]}
            />
            <Input
              value={p.describe.ko}
              onChangeText={(t) => updateDescribe(i, "ko", t)}
              placeholder={locale === "ko" ? "무엇을 채울지 (한글)" : "What to fill (Korean)"}
            />
            <Input
              value={p.describe.en}
              onChangeText={(t) => updateDescribe(i, "en", t)}
              placeholder={locale === "ko" ? "무엇을 채울지 (영어)" : "What to fill (English)"}
            />
          </View>
        ))}
        <Pressable
          onPress={addProp}
          style={styles.addPropBtn}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={locale === "ko" ? "세부 정보 추가" : "Add detail"}
        >
          <Text variant="caption" color="brand">{locale === "ko" ? "세부 정보 추가" : "Add detail"}</Text>
        </Pressable>
      </Field>

      {errors.length > 0 ? (
        <View style={styles.errorBox}>
          {errors.map((e) => (
            <Text key={e} variant="subtle" style={{ color: semantic.danger }}>
              {e}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <PremiumButton
          label={saving ? (locale === "ko" ? "저장 중" : "Saving") : (locale === "ko" ? "저장" : "Save")}
          variant="primary"
          loading={saving}
          onPress={handleSave}
          full
        />
        <PremiumButton
          label={locale === "ko" ? "취소" : "Cancel"}
          variant="ghost"
          disabled={saving}
          onPress={onCancel}
          full
        />
      </View>
    </View>
  );
}

/** Label + optional hint wrapper for one field group. */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text variant="caption" color="textMuted" style={styles.fieldLabel}>{label}</Text>
      {hint ? <Text variant="subtle" color="textSubtle">{hint}</Text> : null}
      {children}
    </View>
  );
}

/** Single-select chip row. Selected chip is mint (the one screen accent). */
function SelectRow<T extends string>({
  options,
  value,
  onSelect,
  labelOf,
}: {
  options: readonly T[];
  value: T;
  onSelect: (v: T) => void;
  labelOf: (v: T) => string;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onSelect(opt)}
            hitSlop={8}
            style={[styles.selChip, active && styles.selChipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={labelOf(opt)}
          >
            <Text style={[styles.selChipText, active && styles.selChipTextActive]}>{labelOf(opt)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Removable chips + an inline add input. Optional sanitizer for tags. */
function TagField({
  values,
  onChange,
  sanitize,
  locale,
  addLabel,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  sanitize?: (s: string) => string;
  locale: Locale;
  addLabel: string;
}) {
  const [v, setV] = useState("");
  function add() {
    const raw = v.trim();
    if (raw.length === 0) return;
    const norm = sanitize ? sanitize(raw) : raw;
    if (norm.length === 0 || values.includes(norm)) {
      setV("");
      return;
    }
    onChange([...values, norm].slice(0, 12));
    setV("");
  }
  return (
    <View style={styles.tagWrap}>
      {values.map((t) => (
        <Pressable
          key={t}
          onPress={() => onChange(values.filter((x) => x !== t))}
          style={styles.tagChip}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={locale === "ko" ? `${t} 삭제` : `Remove ${t}`}
        >
          <Text style={styles.tagChipText}>{t} ✕</Text>
        </Pressable>
      ))}
      <View style={styles.tagInputRow}>
        <Input
          value={v}
          onChangeText={setV}
          placeholder={addLabel}
          onSubmitEditing={add}
          returnKeyType="done"
          blurOnSubmit={false}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.tagInput}
        />
        <Pressable onPress={add} style={styles.tagAddBtn} hitSlop={4} accessibilityRole="button" accessibilityLabel={addLabel}>
          <Text style={styles.tagAddBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  headerRow: { gap: 2 },
  eyebrow: { letterSpacing: 0, fontWeight: "700" },
  field: { gap: spacing.xs },
  fieldLabel: { letterSpacing: 0, fontWeight: "600" },
  area: { minHeight: 56, paddingTop: spacing.sm },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  selChip: {
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: semantic.surfaceAlt,
    minHeight: 44,
    justifyContent: "center",
  },
  selChipActive: { backgroundColor: semantic.brand, borderColor: semantic.brand },
  selChipText: { color: semantic.textMuted, fontSize: typography.sizes.sm, fontWeight: "600" },
  selChipTextActive: { color: semantic.background, fontWeight: "700" },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, alignItems: "center" },
  tagChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surfaceAlt,
    minHeight: 44,
    justifyContent: "center",
  },
  tagChipText: { color: semantic.textMuted, fontSize: typography.sizes.xs, fontWeight: "600" },
  tagInputRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minWidth: 140, flex: 1 },
  tagInput: { flex: 1, minHeight: 44 },
  tagAddBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: semantic.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  tagAddBtnText: { color: semantic.brand, fontSize: typography.sizes.lg, fontWeight: "700", lineHeight: 20 },
  propCard: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: radii.md,
    backgroundColor: semantic.surfaceAlt,
    padding: spacing.sm,
  },
  propTopRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  propNameInput: { flexGrow: 1, flexShrink: 1, minWidth: 180 },
  propRemove: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, minHeight: 44, justifyContent: "center" },
  addPropBtn: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: semantic.brand,
    borderStyle: "dashed",
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: "center",
  },
  errorBox: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: semantic.danger,
    borderLeftWidth: 3,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: semantic.surface,
  },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
