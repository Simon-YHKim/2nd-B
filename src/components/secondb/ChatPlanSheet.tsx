import { useState } from "react";
import { StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PhoneView as View, PhoneScrollView as ScrollView, PhonePressable as Pressable } from "@/components/phone/PhoneUIKit";
import { ScreenModal } from "@/components/ui/ScreenModal";
import { Text } from "@/components/ui/Text";
import { Field } from "@/components/m3/Field";
import { MdButton } from "@/components/m3/MdButton";
import { SegBtn } from "@/components/m3/SegBtn";
import { DateField } from "@/components/m3/date-picker";
import { isValidISO, todayISO } from "@/components/m3/date-picker/calendar-math";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { PixelScrim } from "@/components/pixel/PixelDither";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { KeyboardAvoidingArea } from "@/lib/ui/keyboard";
import { OPS_DOMAIN_GROUP, OPS_GROUP_IDS, domainsForGroup, type OpsGroupId } from "@/lib/ops/domains";
import { m3 } from "@/lib/theme/m3";
import type { ChatPlanSuggestion } from "@/lib/chat/plan-suggestions";
import type { ChatPlanDraft } from "@/lib/chat/plan-draft";

export interface ChatPlanSheetProps {
  suggestion: ChatPlanSuggestion | null;
  busy: boolean;
  notice?: string | null;
  onClose: () => void;
  onConfirm: (draft: ChatPlanDraft) => void;
  webReminder?: boolean;
}

const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/** Key this editor by owner + candidate; all writes stay in the parent's confirmed path. */
export function ChatPlanSheet({ suggestion, busy, notice, onClose, onConfirm, webReminder = false }: ChatPlanSheetProps) {
  const { t } = useTranslation("secondb");
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<ChatPlanDraft>(() => ({
    kind: suggestion?.kind ?? "routine",
    title: suggestion?.title ?? "",
    recurrence: suggestion?.recurrence ?? "daily",
    weekday: suggestion?.weekday ?? null,
    date: suggestion?.kind === "reminder" ? suggestion.date ?? "" : "",
    time: suggestion?.time ?? "",
    domainId: suggestion?.domainId ?? "daily_focus",
    exportConsent: false,
  }));
  const [group, setGroup] = useState<OpsGroupId>(() => OPS_DOMAIN_GROUP[draft.domainId]);
  if (!suggestion) return null;
  const reminder = draft.kind === "reminder";
  const exporting = reminder && webReminder;
  const timeValid = CLOCK.test(draft.time.trim());
  const dateValid = isValidISO(draft.date) && draft.date >= todayISO();
  const weekdayValid = draft.weekday !== null && Number.isInteger(draft.weekday) && draft.weekday >= 0 && draft.weekday <= 6;
  const valid = !!draft.title.trim()
    && (reminder ? dateValid && timeValid : (!draft.time.trim() || timeValid) && (draft.recurrence === "daily" || weekdayValid))
    && (!exporting || draft.exportConsent);
  function update(patch: Partial<ChatPlanDraft>) { if (!busy) setDraft(previous => ({ ...previous, ...patch })); }
  function close() { if (!busy) onClose(); }
  function confirm() {
    if (busy || !valid) return;
    onConfirm({ ...draft, title: draft.title.trim(), time: draft.time.trim(), date: reminder ? draft.date : "", weekday: draft.recurrence === "weekly" ? draft.weekday : null });
  }

  return <ScreenModal visible transparent animationType="none" transitionKind="sheet" statusBarTranslucent onRequestClose={close}>
    <KeyboardAvoidingArea style={styles.root}>
      <View style={StyleSheet.absoluteFill} accessible={false} onStartShouldSetResponder={() => !busy} onResponderRelease={close}>
        <PixelScrim />
      </View>
      <View style={styles.column} accessibilityViewIsModal onAccessibilityEscape={close} testID="chat-plan-sheet">
        <PixelSurface variant="bevel" shrink style={styles.surface} contentStyle={styles.content}>
          <View style={styles.header}>
            <Text variant="heading" style={styles.heading} accessibilityRole="header">{t(reminder ? "planSuggestion.reminderTitle" : "planSuggestion.routineTitle")}</Text>
            <MdButton variant="text" label={t("common:actions.close")} onPress={close} disabled={busy} testID="chat-plan-close" />
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.fields} keyboardShouldPersistTaps="handled">
            <Text variant="caption">{t("planSuggestion.reviewHint")}</Text>
            <Field label={t("planSuggestion.titleLabel")} value={draft.title} onChangeText={title => update({ title })}
              editable={!busy} maxLength={80} returnKeyType="done" testID="chat-plan-title" />
            {reminder ? (
              <View pointerEvents={busy ? "none" : "auto"}>
                <DateField label={t("planSuggestion.dateLabel")} value={draft.date} onChange={date => update({ date })} minDate={todayISO()}
                  supportingText={!dateValid ? t("planSuggestion.validation.date") : undefined} />
              </View>
            ) : <>
              <Text variant="caption">{t("planSuggestion.cadence")}</Text>
              <SegBtn disabled={busy} selected={[draft.recurrence]} segments={[
                { key: "daily", label: t("planSuggestion.daily") }, { key: "weekly", label: t("planSuggestion.weekly") },
              ]} onSelect={key => { if (key === "daily" || key === "weekly") update({ recurrence: key }); }} />
              {draft.recurrence === "weekly" ? <View>
                <Text variant="caption">{t("planSuggestion.weekday")}</Text>
                <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel={t("planSuggestion.weekday")}>
                  {[0, 1, 2, 3, 4, 5, 6].map(day => <Pressable key={day} accessibilityRole="radio"
                    accessibilityLabel={t(`planSuggestion.weekdays.${day}`)} accessibilityState={{ checked: draft.weekday === day, disabled: busy }}
                    aria-checked={draft.weekday === day} disabled={busy} onPress={() => update({ weekday: day })}
                    style={[styles.choice, draft.weekday === day && styles.selected]} testID={`chat-plan-weekday-${day}`}>
                    <Text variant="caption">{t(`planSuggestion.weekdays.${day}`)}</Text>
                  </Pressable>)}
                </View>
              </View> : null}
            </>}
            <Field label={t(reminder ? "planSuggestion.timeLabel" : "planSuggestion.timeOptional")} value={draft.time}
              onChangeText={time => update({ time })} editable={!busy} placeholder="HH:mm" maxLength={5} autoCorrect={false}
              autoCapitalize="none" returnKeyType="done" testID="chat-plan-time"
              supportingText={draft.time && !timeValid || reminder && !draft.time ? t("planSuggestion.validation.time") : undefined} />
            {!reminder ? <>
              <Text variant="caption">{t("planSuggestion.category")}</Text>
              <ScrollView horizontal style={styles.groups} contentContainerStyle={styles.groupRow} showsHorizontalScrollIndicator={false}>
                {OPS_GROUP_IDS.map(id => <Pressable key={id} accessibilityRole="tab" accessibilityLabel={t(`ops:groups.${id}`)}
                  accessibilityState={{ selected: group === id, disabled: busy }} aria-selected={group === id} disabled={busy} onPress={() => setGroup(id)}
                  style={[styles.choice, group === id && styles.selected]} testID={`chat-plan-group-${id}`}>
                  <Text variant="caption">{t(`ops:groups.${id}`)}</Text>
                </Pressable>)}
              </ScrollView>
              <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel={t("planSuggestion.category")}>
                {domainsForGroup(group).map(id => <Pressable key={id} accessibilityRole="radio" accessibilityLabel={t(`ops:domains.${id}`)}
                  accessibilityState={{ checked: draft.domainId === id, disabled: busy }} aria-checked={draft.domainId === id}
                  disabled={busy} onPress={() => update({ domainId: id })} style={[styles.choice, draft.domainId === id && styles.selected]}
                  testID={`chat-plan-domain-${id}`}><Text variant="caption">{t(`ops:domains.${id}`)}</Text></Pressable>)}
              </View>
            </> : null}
            {exporting ? <>
              <Text variant="caption" testID="chat-plan-web-notice">{t("planSuggestion.webNotice")}</Text>
              <Pressable accessibilityRole="checkbox" accessibilityLabel={t("planSuggestion.exportConsent")}
                accessibilityState={{ checked: draft.exportConsent, disabled: busy }} aria-checked={draft.exportConsent}
                disabled={busy} onPress={() => update({ exportConsent: !draft.exportConsent })} style={styles.consent} testID="chat-plan-export-consent">
                <PixelGlyph name={draft.exportConsent ? "check" : "radioUnchecked"} size={20} color={m3.color.primary} />
                <Text variant="caption" style={styles.consentText}>{t("planSuggestion.exportConsent")}</Text>
              </Pressable>
            </> : null}
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            {notice ? <Text variant="caption" accessibilityRole="alert" accessibilityLiveRegion="polite" testID="chat-plan-notice">{notice}</Text> : null}
            <MdButton label={t(exporting ? "planSuggestion.exportCalendar" : reminder ? "planSuggestion.scheduleReminder" : "planSuggestion.saveRoutine")}
              onPress={confirm} disabled={busy || !valid} loading={busy} testID="chat-plan-confirm" />
          </View>
        </PixelSurface>
      </View>
    </KeyboardAvoidingArea>
  </ScreenModal>;
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end", alignItems: "center" },
  column: { width: "100%", maxWidth: 560, maxHeight: "92%" },
  surface: { maxHeight: "100%" },
  content: { padding: 0, minHeight: 0 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  heading: { flex: 1, flexShrink: 1 },
  scroll: { flexShrink: 1, minHeight: 0 },
  fields: { gap: 12, padding: 16 },
  footer: { gap: 8, paddingHorizontal: 16, paddingTop: 8 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { minHeight: 44, paddingHorizontal: 12, justifyContent: "center", borderWidth: 1, borderColor: m3.color.outlineVariant },
  selected: { backgroundColor: m3.color.secondaryContainer, borderColor: m3.color.primary },
  groups: { height: 48, flexGrow: 0, flexShrink: 0 },
  groupRow: { gap: 8, alignItems: "center" },
  consent: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
  consentText: { flex: 1 },
});
