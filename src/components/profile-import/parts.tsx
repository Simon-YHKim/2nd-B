import { useState } from "react";
import { StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { PhonePressable as Pressable, PhoneView as View } from "@/components/phone/PhoneUIKit";
import { Text } from "@/components/ui/Text";
import { Field, MdButton, MdCard, MdChip, m3TextStyle } from "@/components/m3";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { m3 } from "@/lib/theme/m3";
import { useFontStyle } from "@/lib/settings/readable-font";
import { checkboxSpaceKeyProps } from "@/lib/ui/checkbox-space-key";
import { needsContextConfirmation, type ContextItem, type ContextSource, type ReviewedContext } from "@/lib/import/profile-context";
import { PROFILE_DETAIL_FIELDS, profileChoiceLabelKey, type ProfileDetails, type ProfileDetailKey } from "@/lib/persona/profile-details";

export function useImportStyles() {
  useFontStyle();
  return createImportStyles();
}
const createImportStyles = () => StyleSheet.create({
  flex: { flex: 1 }, body: { padding: 20, gap: 16, width: "100%", maxWidth: 640, alignSelf: "center" },
  heading: { ...m3TextStyle("headlineSmall"), color: m3.color.onSurface },
  text: { ...m3TextStyle("bodyLarge"), color: m3.color.onSurface },
  muted: { ...m3TextStyle("bodyMedium"), color: m3.color.onSurfaceVariant },
  small: { ...m3TextStyle("bodySmall"), color: m3.color.onSurfaceVariant },
  accent: { color: m3.color.primary }, error: { ...m3TextStyle("bodyMedium"), color: m3.color.error },
  stack: { gap: 12 }, row: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  checkbox: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, paddingVertical: 8 },
  check: { width: 24, height: 24, borderWidth: 2, borderColor: m3.color.primary, alignItems: "center", justifyContent: "center" },
  card: { padding: 16, gap: 12 }, quote: { borderLeftWidth: 2, borderLeftColor: m3.color.outlineVariant, paddingLeft: 12, gap: 6 },
  actions: { gap: 10 }, selected: { borderColor: m3.color.primary },
  modal: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: m3.color.scrim },
});
export function ImportCheck({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: () => void }) {
  const s = useImportStyles();
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked, disabled }} aria-checked={checked}
    disabled={disabled} onPress={onChange} {...checkboxSpaceKeyProps(onChange, !disabled)} style={s.checkbox}>
    <View style={s.check}>{checked ? <PixelGlyph name="check" size={18} color={m3.color.primary} /> : null}</View>
    <Text style={[s.text, s.flex]}>{label}</Text>
  </Pressable>;
}

export function ContextReviewCard({ item, sources, value, onChange }: {
  item: ContextItem; sources: ContextSource[]; value: ReviewedContext[string]; onChange: (value: ReviewedContext[string]) => void;
}) {
  const { t } = useTranslation("profile");
  const s = useImportStyles();
  const [details, setDetails] = useState(false); const [editing, setEditing] = useState(false);
  const needsConfirmation = needsContextConfirmation(item, sources);
  const blocked = needsConfirmation && !value.confirmed;
  return <MdCard variant="outlined" style={[s.card, value.selected && s.selected]}>
    <View style={s.row}>
      <Text style={[s.small, s.accent]}>{t(`contextImport.category.${item.category}`)}</Text>
      <Text style={s.small}>{t(`contextImport.basis.${item.reported_basis}`)}</Text>
    </View>
    <ImportCheck label={value.statement} checked={value.selected} disabled={blocked}
      onChange={() => onChange({ ...value, selected: !value.selected })} />
    {editing ? <Field accessibilityLabel={t("contextImport.edit")} multiline maxLength={800} value={value.statement}
      onChangeText={(statement) => onChange({ ...value, statement, confirmed: false, selected: needsConfirmation ? false : value.selected })} /> : null}
    {needsConfirmation ? <>
      {blocked ? <Text style={s.small}>{t("contextImport.needsConfirmation")}</Text> : null}
      <ImportCheck label={t("contextImport.confirmInference")} checked={value.confirmed}
        onChange={() => onChange({ ...value, confirmed: !value.confirmed, selected: value.confirmed ? false : value.selected })} />
    </> : null}
    <View style={s.row}>
      <MdButton variant="text" label={t("contextImport.edit")} onPress={() => setEditing(!editing)} />
      <MdButton variant="text" label={t("contextImport.source")} accessibilityState={{ expanded: details }} onPress={() => setDetails(!details)} />
    </View>
    {details ? <View style={s.stack}>
      <Text style={s.small}>{t("contextImport.sourceReported")}</Text>
      {sources.length === 0 ? <Text style={s.muted}>{t("contextImport.noSource")}</Text> : sources.map((source) =>
        <View key={source.id} style={s.quote}>
          {source.label ? <Text style={s.small}>{source.label}</Text> : null}
          <Text style={s.text}>{source.excerpt ?? t("contextImport.noSource")}</Text>
          {source.occurred_at ? <Text style={s.small}>{source.occurred_at}</Text> : null}
        </View>)}
      {item.valid_time.description || item.valid_time.from || item.valid_time.to ? <Text style={s.small}>
        {t("contextImport.when")}: {[item.valid_time.description, item.valid_time.from, item.valid_time.to].filter(Boolean).join(" · ")}
      </Text> : null}
      {item.conflicts_with.length ? <Text style={s.small}>{t("contextImport.conflict")}</Text> : null}
    </View> : null}
  </MdCard>;
}

export function ProfileChangeReview({ current, patch, adult, onChange, disabled }: {
  current: ProfileDetails; patch: ProfileDetails; adult: boolean; disabled: boolean; onChange: (patch: ProfileDetails) => void;
}) {
  const { t } = useTranslation(["profile", "deepspace"]);
  const s = useImportStyles();
  const [open, setOpen] = useState(false);
  const set = (key: ProfileDetailKey, value: string | undefined) => {
    const next = { ...patch }; if (value === undefined) delete next[key]; else next[key] = value;
    onChange(next);
  };
  const valueLabel = (key: ProfileDetailKey, value?: string) => {
    if (!value) return t("contextImport.notSet");
    const field = PROFILE_DETAIL_FIELDS.find((f) => f.key === key);
    return field?.kind === "choice" ? t(`deepspace:profileDetails.${profileChoiceLabelKey(key, value)}`) : value;
  };
  return <MdCard variant="outlined" style={s.card}>
    <MdButton variant="text" label={t("contextImport.profileChanges")} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} />
    <Text style={s.small}>{t("contextImport.profileChangesHint")}</Text>
    {open ? PROFILE_DETAIL_FIELDS.filter((f) => !f.adultOnly || adult).map((field) => <View key={field.key} style={s.stack}>
      <Text style={s.text}>{t(`deepspace:profileDetails.${field.key}Label`)}</Text>
      <Text style={s.small}>{t("contextImport.currentValue")}: {valueLabel(field.key, current[field.key])}</Text>
      <View style={s.row}>
        <MdChip kind="filter" label={t("contextImport.keep")} selected={patch[field.key] === undefined} disabled={disabled}
          onPress={() => set(field.key, undefined)} />
        <MdChip kind="filter" label={t("contextImport.change")} selected={patch[field.key] !== undefined} disabled={disabled}
          onPress={() => set(field.key, current[field.key] ?? "")} />
      </View>
      {patch[field.key] !== undefined ? field.kind === "text" ? <Field label={t("contextImport.newValue")} value={patch[field.key]}
        editable={!disabled} maxLength={field.maxLen} onChangeText={(value) => set(field.key, value)} /> : <View style={s.row}>
        {field.choices?.map((choice) => <MdChip key={choice} kind="filter" label={valueLabel(field.key, choice)}
          selected={patch[field.key] === choice} disabled={disabled} onPress={() => set(field.key, choice)} />)}
      </View> : null}
    </View>) : null}
  </MdCard>;
}
