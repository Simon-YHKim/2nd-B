import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Platform, StyleSheet } from "react-native";
import { useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { PhoneFlatList as FlatList, PhonePressable as Pressable, PhoneView as View } from "@/components/phone/PhoneUIKit";
import { Text } from "@/components/ui/Text";
import { MdCard } from "@/components/m3/MdCard";
import { MdButton } from "@/components/m3/MdButton";
import { accountTransitionSnapshot, captureAccountOwnerLease, subscribeAccountTransition, type AccountOwnerLease } from "@/lib/auth/account-epoch";
import { listOneOffReminders, removeOneOffReminder, type OneOffReminder } from "@/lib/ops/one-off-reminders";
import { disableReminder, enableReminder, getScheduledRoutineIds, remindersSupported } from "@/lib/ops/reminders";
import { systemLocaleFor } from "@/lib/i18n/locales";
import { m3 } from "@/lib/theme/m3";

const PAGE_SIZE = 5;
type Session = { lease: AccountOwnerLease };
type ListState = {
  ownerId: string;
  items: OneOffReminder[];
  scheduled: Set<string>;
  loading: boolean;
  failed: boolean;
  busy: string | null;
  notice: string | null;
};
const empty = (ownerId: string): ListState => ({ ownerId, items: [], scheduled: new Set(), loading: true, failed: false, busy: null, notice: null });

/** The surrounding OpsFrame owns scrolling; only one bounded page is mounted. */
export function ChatRemindersList({ ownerId, onCountChange }: { ownerId: string; onCountChange?: (count: number) => void }) {
  const { t, i18n } = useTranslation("secondb");
  const epoch = useSyncExternalStore(subscribeAccountTransition, accountTransitionSnapshot, accountTransitionSnapshot);
  const [state, setState] = useState(() => empty(ownerId));
  const [reload, setReload] = useState(0);
  const [page, setPage] = useState(0);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const session = useRef<Session | null>(null);
  const pending = useRef<{ ownerId: string; promise: Promise<void> } | null>(null);
  const supported = remindersSupported();
  const onCount = state.ownerId === ownerId && captureAccountOwnerLease(ownerId)
    ? state.items.filter(item => Date.parse(item.startsAtIso) > now && state.scheduled.has(item.id)).length : 0;
  useEffect(() => { onCountChange?.(onCount); }, [onCount, onCountChange]);
  useEffect(() => () => { onCountChange?.(0); }, [onCountChange]);

  useFocusEffect(useCallback(() => {
    if (Platform.OS === "web") return;
    const lease = captureAccountOwnerLease(ownerId);
    if (!lease) return;
    const current: Session = { lease };
    session.current = current;
    const active = () => session.current === current && lease.isCurrent();
    setState(empty(ownerId)); setConfirmId(null); setPage(0); setNow(Date.now());
    void (async () => {
      try {
        // Refocusing during this owner's mutation reads its completed OS state.
        if (pending.current?.ownerId === ownerId) await pending.current.promise;
        if (!active()) return;
        const [items, scheduled] = await Promise.all([listOneOffReminders(ownerId), getScheduledRoutineIds(ownerId)]);
        if (active()) setState({ ...empty(ownerId), items, scheduled, loading: false });
      } catch {
        if (active()) setState({ ...empty(ownerId), loading: false, failed: true });
      }
    })();
    return () => { if (session.current === current) session.current = null; };
  }, [ownerId, reload, epoch]));

  // An open screen also marks an event past when its actual scheduled time arrives.
  useEffect(() => {
    if (Platform.OS === "web" || state.ownerId !== ownerId) return;
    const next = state.items.reduce((first, item) => {
      const time = Date.parse(item.startsAtIso);
      return time > now ? Math.min(first, time) : first;
    }, Infinity);
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(next - now + 1, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [now, ownerId, state.items, state.ownerId]);

  function mutate(item: OneOffReminder, deleting: boolean) {
    const current = session.current;
    if (!current?.lease.isCurrent() || current.lease.ownerId !== ownerId || pending.current || state.loading) return;
    const isOn = state.scheduled.has(item.id);
    if (!deleting && (!supported || Date.parse(item.startsAtIso) <= Date.now())) return;
    const active = () => session.current === current && current.lease.isCurrent();
    setState(previous => ({ ...previous, busy: item.id, notice: null }));
    // Assign a synchronous lock before yielding, including rapid repeated taps.
    const task = { ownerId, promise: Promise.resolve() };
    pending.current = task;
    task.promise = (async () => {
      try {
        if (deleting) {
          const removed = await removeOneOffReminder(ownerId, item.id);
          if (!active()) return;
          if (!removed) throw new Error("reminder_remove_failed");
          setState(previous => ({ ...previous, items: previous.items.filter(row => row.id !== item.id) }));
          setConfirmId(null);
        } else {
          const enabled = isOn ? (await disableReminder(ownerId, item.id), true)
            : await enableReminder(ownerId, item.id, { title: item.title, startsAtIso: item.startsAtIso });
          if (!active()) return;
          const scheduled = await getScheduledRoutineIds(ownerId);
          if (!active()) return;
          setState(previous => ({ ...previous, scheduled,
            notice: enabled && scheduled.has(item.id) === !isOn ? null : "alarmFailed" }));
        }
      } catch {
        if (active()) setState(previous => ({ ...previous, notice: deleting ? "deleteFailed" : "alarmFailed" }));
      } finally {
        if (pending.current === task) pending.current = null;
        if (active()) setState(previous => ({ ...previous, busy: null }));
      }
    })();
  }

  if (Platform.OS === "web" || !captureAccountOwnerLease(ownerId)) return null;
  const visible = state.ownerId === ownerId ? state : empty(ownerId);
  const pageCount = Math.max(1, Math.ceil(visible.items.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageItems = visible.items.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  function renderItem({ item }: { item: OneOffReminder }) {
    const past = Date.parse(item.startsAtIso) <= now;
    const on = !past && visible.scheduled.has(item.id);
    const disabled = !!visible.busy || !supported || (past && !on);
    return <MdCard variant="outlined" style={styles.card}>
      <Text variant="body">{item.title}</Text>
      <Text variant="caption">{new Date(item.startsAtIso).toLocaleString(systemLocaleFor(i18n.language), {
        year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      })}</Text>
      {past ? <Text variant="caption">{t("planSuggestion.oneOff.past")}</Text> : null}
      <View style={styles.actions}>
        <Pressable testID={`chat-reminder-toggle-${item.id}`} accessibilityRole="switch"
          aria-checked={on}
          accessibilityLabel={t("planSuggestion.oneOff.toggleLabel", { title: item.title })}
          accessibilityState={{ checked: on, disabled, busy: visible.busy === item.id }}
          disabled={disabled} onPress={() => mutate(item, false)}
          style={[styles.toggle, on && styles.toggleOn, disabled && styles.disabled]}>
          <Text variant="caption" style={[on && styles.onText, disabled && styles.disabledText]}>{t(`planSuggestion.oneOff.${on ? "on" : "off"}`)}</Text>
        </Pressable>
        <MdButton testID={`chat-reminder-delete-${item.id}`} variant="text" label={t("planSuggestion.oneOff.delete")}
          accessibilityLabel={t("planSuggestion.oneOff.deleteLabel", { title: item.title })}
          disabled={!!visible.busy} onPress={() => { if (!pending.current) setConfirmId(item.id); }} />
      </View>
      {confirmId === item.id ? <View style={styles.confirm}>
        <Text variant="caption">{t("planSuggestion.oneOff.deletePrompt")}</Text>
        <View style={styles.actions}>
          <MdButton testID={`chat-reminder-confirm-${item.id}`} variant="tonal" label={t("planSuggestion.oneOff.confirmDelete")}
            disabled={!!visible.busy} loading={visible.busy === item.id} onPress={() => mutate(item, true)} />
          <MdButton variant="text" label={t("planSuggestion.oneOff.cancel")}
            disabled={!!visible.busy} onPress={() => { if (!pending.current) setConfirmId(null); }} />
        </View>
      </View> : null}
    </MdCard>;
  }
  return <View testID="chat-reminders-list" style={styles.section}>
    <Text variant="heading">{t("planSuggestion.oneOff.title")}</Text>
    <Text variant="caption">{t("planSuggestion.oneOff.deviceNote")}</Text>
    {visible.loading ? <Text variant="caption">{t("planSuggestion.oneOff.loading")}</Text> : visible.failed ? <View style={styles.section}>
      <Text variant="caption" accessibilityLiveRegion="polite">{t("planSuggestion.oneOff.loadFailed")}</Text>
      <MdButton variant="text" label={t("planSuggestion.oneOff.retry")} onPress={() => setReload(value => value + 1)} />
    </View> : <>
      {!supported ? <Text variant="caption">{t("planSuggestion.oneOff.unavailable")}</Text> : null}
      {visible.notice ? <Text variant="caption" accessibilityLiveRegion="polite">{t(`planSuggestion.oneOff.${visible.notice}`)}</Text> : null}
      {visible.items.length ? <FlatList data={pageItems} keyExtractor={item => item.id} renderItem={renderItem}
        scrollEnabled={false} initialNumToRender={PAGE_SIZE} removeClippedSubviews={false}
        extraData={{ scheduled: visible.scheduled, busy: visible.busy, confirmId, now }} />
        : <Text variant="caption">{t("planSuggestion.oneOff.empty")}</Text>}
      {pageCount > 1 ? <View style={styles.pagination}>
        <MdButton testID="chat-reminders-previous" variant="text" label={t("planSuggestion.oneOff.previous")}
          disabled={currentPage === 0 || !!visible.busy} onPress={() => { if (!pending.current) { setPage(Math.max(0, currentPage - 1)); setConfirmId(null); } }} />
        <Text variant="caption">{t("planSuggestion.oneOff.page", { current: currentPage + 1, total: pageCount })}</Text>
        <MdButton testID="chat-reminders-next" variant="text" label={t("planSuggestion.oneOff.next")}
          disabled={currentPage === pageCount - 1 || !!visible.busy} onPress={() => { if (!pending.current) { setPage(Math.min(pageCount - 1, currentPage + 1)); setConfirmId(null); } }} />
      </View> : null}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 8, marginBottom: 16 },
  card: { gap: 8, marginBottom: 8 },
  actions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  confirm: { gap: 8 },
  pagination: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 },
  toggle: { minWidth: 76, minHeight: 44, paddingHorizontal: 16, alignItems: "center", justifyContent: "center",
    backgroundColor: m3.color.surfaceContainer, borderColor: m3.color.outlineVariant, borderWidth: 1, borderRadius: m3.shape.none },
  toggleOn: { backgroundColor: m3.color.primary, borderColor: m3.color.primary },
  onText: { color: m3.color.onPrimary },
  disabled: { backgroundColor: m3.color.surfaceContainer, borderColor: m3.color.outlineVariant },
  disabledText: { color: m3.color.onSurfaceVariant },
});
