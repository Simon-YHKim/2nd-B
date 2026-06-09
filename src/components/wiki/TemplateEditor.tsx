// Full edit form for one of the user's own clipper formats (/formats → edit).
// Controlled fields for every editable column; slug / ownerId / isShared are
// owned by the parent (slug is the upsert key; isShared is the list's toggle).
// Save runs validateTemplateDraft first — including the C-vocabulary gate, since
// a shared format is community-visible. Token-only styling per DESIGN.md.

import { useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useTranslation } from "react-i18next";

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
const TARGET_OPTIONS: (TargetCategory | "")[] = ["", ...TARGET_CATEGORIES];

export interface TemplateEditorProps {
  initial: CustomClipperTemplate;
  locale: Locale;
  saving: boolean;
  onSave: (draft: TemplateDraft) => void;
  onCancel: () => void;
}

export function TemplateEditor({ initial, locale, saving, onSave, onCancel }: TemplateEditorProps) {
  const { t } = useTranslation("formats");
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
  const te = (key: string, options?: Record<string, string>) => t(`editor.${key}`, { lng: locale, ...options });

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text variant="caption" color="brand" style={styles.eyebrow}>
          {te("eyebrow")}
        </Text>
        <Text variant="heading" style={{ fontSize: 20 }} numberOfLines={2}>
          {headerName}
        </Text>
      </View>

      {/* Name (both locales) */}
      <Field label={te("name")}>
        <Input value={nameKo} onChangeText={setNameKo} placeholder={te("nameKoPlaceholder")} />
        <Input value={nameEn} onChangeText={setNameEn} placeholder={te("nameEnPlaceholder")} autoCapitalize="words" />
      </Field>

      {/* Description (both locales) */}
      <Field label={te("description")} hint={te("descriptionHint")}>
        <Input
          value={whatKo}
          onChangeText={setWhatKo}
          placeholder={te("descriptionKoPlaceholder")}
          multiline
          numberOfLines={2}
          textAlignVertical="top"
          style={styles.area}
        />
        <Input
          value={whatEn}
          onChangeText={setWhatEn}
          placeholder={te("descriptionEnPlaceholder")}
          multiline
          numberOfLines={2}
          textAlignVertical="top"
          style={styles.area}
        />
      </Field>

      {/* Source type */}
      <Field label={te("sourceType")} hint={te("sourceTypeHint")}>
        <SelectRow
          options={SOURCE_KINDS}
          value={baseKind}
          onSelect={setBaseKind}
          labelOf={(k) => k}
        />
      </Field>

      {/* Filing area */}
      <Field label={te("filingArea")}>
        <SelectRow
          options={TARGET_OPTIONS}
          value={targetCategory}
          onSelect={setTargetCategory}
          labelOf={(c) => (c === "" ? te("noArea") : c)}
        />
      </Field>

      {/* Auto-match links */}
      <Field label={te("autoMatchLinks")} hint={te("autoMatchLinksHint")}>
        <TagField
          values={triggers}
          onChange={setTriggers}
          locale={locale}
          addLabel={te("addLinkRule")}
        />
      </Field>

      {/* Default tags (sanitized to lowercase-hyphen) */}
      <Field label={te("defaultTags")}>
        <TagField
          values={defaultTags}
          onChange={setDefaultTags}
          sanitize={sanitizeTag}
          locale={locale}
          addLabel={te("addTag")}
        />
      </Field>

      {/* Saved folder */}
      <Field label={te("savedFolder")} hint={te("savedFolderHint")}>
        <Input value={wikiTarget} onChangeText={setWikiTarget} placeholder="tools/" autoCapitalize="none" autoCorrect={false} />
      </Field>

      {/* Details to save */}
      <Field
        label={te("detailsToSave")}
        hint={te("detailsToSaveHint")}
      >
        {aiProps.length === 0 ? (
          <Text variant="subtle" color="textSubtle">
            {te("noneYet")}
          </Text>
        ) : null}
        {aiProps.map((p, i) => (
          <View key={i} style={styles.propCard}>
            <View style={styles.propTopRow}>
              <Input
                value={p.name}
                onChangeText={(t) => updateProp(i, { name: t })}
                placeholder={te("detailNamePlaceholder")}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.propNameInput}
              />
              <Pressable
                onPress={() => removeProp(i)}
                hitSlop={14}
                style={styles.propRemove}
                accessibilityRole="button"
                accessibilityLabel={te("removeDetail")}
              >
                <Text variant="caption" color="textSubtle">{te("remove")}</Text>
              </Pressable>
            </View>
            <SelectRow
              options={PROP_TYPES}
              value={p.type}
              onSelect={(t) => updateProp(i, { type: t })}
              labelOf={(t) => te(`propTypes.${t}`)}
            />
            <Input
              value={p.describe.ko}
              onChangeText={(t) => updateDescribe(i, "ko", t)}
              placeholder={te("fillKoPlaceholder")}
            />
            <Input
              value={p.describe.en}
              onChangeText={(t) => updateDescribe(i, "en", t)}
              placeholder={te("fillEnPlaceholder")}
            />
          </View>
        ))}
        <Pressable
          onPress={addProp}
          style={styles.addPropBtn}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel={te("addDetail")}
        >
          <Text variant="caption" color="brand">{te("addDetail")}</Text>
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
          label={saving ? te("saving") : te("save")}
          variant="primary"
          loading={saving}
          onPress={handleSave}
          full
        />
        <PremiumButton
          label={te("cancel")}
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
  const { t } = useTranslation("formats");
  const te = (key: string, options?: Record<string, string>) => t(`editor.${key}`, { lng: locale, ...options });
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
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={te("removeValue", { value: t })}
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
        <Pressable onPress={add} style={styles.tagAddBtn} accessibilityRole="button" accessibilityLabel={addLabel}>
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
    // O-11 P2: GB language is solid 2px sharp corners, not dashed.
    borderWidth: 2,
    borderColor: semantic.brand,
    borderRadius: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: "center",
  },
  errorBox: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: semantic.danger,
    borderStartWidth: 3,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: semantic.surface,
  },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
