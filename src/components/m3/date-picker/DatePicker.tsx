// M3 calendar date picker (rev2 migration). A tap-to-open field + modal calendar
// that REPLACES free-text date entry app-wide — the user always picks from a
// calendar, never types a date. Built on the m3.* token foundation + dayjs (both
// existing deps), so it renders identically on web (GitHub Pages), iOS, and
// Android with no new dependency and no @react-native-community/datetimepicker
// (which has no web support).
//
// Exports:
//   <DateField>  — full calendar date, value/onChange are ISO "YYYY-MM-DD".
//   <YearField>  — year-only picker, value/onChange are "YYYY" (커리어 achievements).
//
// Android QA (ANDROID_QA_GUIDELINES.md): the modal card carries `elevation`
// (level3) to avoid the Shine-through z-order bug; the RN <Modal onRequestClose>
// wires the hardware back button to Cancel; the year list is a virtualised
// FlatList, never a .map() over a long scroll range.
import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTranslation } from "react-i18next";
import Svg, { Path } from "react-native-svg";

import { m3 } from "@/lib/theme/m3";

import { m3TextStyle } from "../typeface";
import {
  isDisabledISO,
  isValidISO,
  isoMonth0,
  isoYear,
  monthGrid,
  todayISO,
  toISO,
  yearsDescending,
} from "./calendar-math";

// ---------------------------------------------------------------------------
// Localised month / weekday labels. Following the repo convention (career.tsx
// renders KO/EN copy inline off `i18n.language`), these live in-component rather
// than exploding the i18n JSON with 19 keys × 5 locales. KO is exact; every
// other pack renders the EN labels (matches i18n fallbackLng="en").
// ---------------------------------------------------------------------------
const WEEKDAYS_EN = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];
const MONTHS_LONG_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

interface DateLabels {
  ko: boolean;
  weekdays: string[];
  monthYear: (year: number, month0: number) => string;
  formatLong: (iso: string) => string;
  formatYear: (year: number) => string;
}

function useDateLabels(): DateLabels {
  const { i18n } = useTranslation();
  const ko = (i18n.language ?? "en").startsWith("ko");
  return useMemo<DateLabels>(
    () => ({
      ko,
      weekdays: ko ? WEEKDAYS_KO : WEEKDAYS_EN,
      monthYear: (year, month0) =>
        ko ? `${year}년 ${month0 + 1}월` : `${MONTHS_LONG_EN[month0]} ${year}`,
      formatLong: (iso) => {
        const y = Number(iso.slice(0, 4));
        const m0 = Number(iso.slice(5, 7)) - 1;
        const d = Number(iso.slice(8, 10));
        return ko ? `${y}년 ${m0 + 1}월 ${d}일` : `${MONTHS_SHORT_EN[m0]} ${d}, ${y}`;
      },
      formatYear: (year) => (ko ? `${year}년` : String(year)),
    }),
    [ko],
  );
}

// ---------------------------------------------------------------------------
// Glyphs (inline SVG, no asset load — mirrors ui/EyeIcon.tsx).
// ---------------------------------------------------------------------------
const CHEVRON_PATH: Record<"left" | "right" | "down", string> = {
  left: "M15 6l-6 6 6 6",
  right: "M9 6l6 6-6 6",
  down: "M6 9l6 6 6-6",
};

function Chevron({
  direction,
  size = 22,
  color,
}: {
  direction: "left" | "right" | "down";
  size?: number;
  color: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d={CHEVRON_PATH[direction]} />
    </Svg>
  );
}

function CalendarGlyph({ size = 20, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M7 3v3M17 3v3" />
      <Path d="M4 8h16M5 6h14a1 1 0 011 1v12a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1Z" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Year grid (shared by the calendar's year view and the standalone YearField).
// ---------------------------------------------------------------------------
function YearGrid({
  minYear,
  maxYear,
  selectedYear,
  onSelect,
}: {
  minYear: number;
  maxYear: number;
  selectedYear: number | null;
  onSelect: (year: number) => void;
}) {
  const data = useMemo(() => yearsDescending(minYear, maxYear), [minYear, maxYear]);
  return (
    <FlatList
      data={data}
      keyExtractor={(y) => String(y)}
      numColumns={4}
      style={styles.yearList}
      contentContainerStyle={styles.yearListContent}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => {
        const on = item === selectedYear;
        return (
          <View style={styles.yearCellWrap}>
            <Pressable
              onPress={() => onSelect(item)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={String(item)}
              style={[styles.yearCell, on && styles.yearCellOn]}
            >
              <Text style={[m3TextStyle("bodyLarge"), { color: on ? m3.color.onPrimary : m3.color.onSurface }]}>
                {item}
              </Text>
            </Pressable>
          </View>
        );
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Calendar modal.
// ---------------------------------------------------------------------------
interface CalendarModalProps {
  visible: boolean;
  valueISO: string;
  minISO?: string;
  maxISO?: string;
  initialView?: "day" | "year";
  initialCursorISO?: string;
  onCancel: () => void;
  onConfirm: (iso: string) => void;
}

function CalendarModal({
  visible,
  valueISO,
  minISO,
  maxISO,
  initialView = "day",
  initialCursorISO,
  onCancel,
  onConfirm,
}: CalendarModalProps) {
  const { t } = useTranslation("common");
  const labels = useDateLabels();

  const todayStr = useMemo(() => todayISO(), [visible]);
  const minYear = minISO ? Number(minISO.slice(0, 4)) : 1900;
  const maxYear = maxISO ? Number(maxISO.slice(0, 4)) : Number(todayStr.slice(0, 4)) + 5;

  const [view, setView] = useState<"day" | "year">(initialView);
  const [selected, setSelected] = useState("");
  const [cursorY, setCursorY] = useState(maxYear);
  const [cursorM, setCursorM] = useState(0);

  // Re-seed every time the modal opens so a reopen reflects the latest value.
  useEffect(() => {
    if (!visible) return;
    const base = isValidISO(valueISO)
      ? valueISO
      : initialCursorISO && isValidISO(initialCursorISO)
        ? initialCursorISO
        : todayStr;
    setSelected(isValidISO(valueISO) ? valueISO : "");
    setCursorY(Math.min(Math.max(Number(base.slice(0, 4)), minYear), maxYear));
    setCursorM(Number(base.slice(5, 7)) - 1);
    setView(initialView);
  }, [visible, valueISO, initialCursorISO, initialView, todayStr, minYear, maxYear]);

  const grid = useMemo(() => monthGrid(cursorY, cursorM), [cursorY, cursorM]);
  const prevDisabled = cursorY <= minYear && cursorM <= 0;
  const nextDisabled = cursorY >= maxYear && cursorM >= 11;
  const canConfirm = selected !== "" && !isDisabledISO(selected, minISO, maxISO);

  function shiftMonth(delta: number) {
    let m = cursorM + delta;
    let y = cursorY;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    if (y < minYear) {
      y = minYear;
      m = 0;
    } else if (y > maxYear) {
      y = maxYear;
      m = 11;
    }
    setCursorY(y);
    setCursorM(m);
  }

  const disabledInk = { color: m3.color.onSurfaceVariant, opacity: 0.38 } as const;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel={t("actions.cancel")}>
        <Pressable
          style={styles.card}
          onPress={(e) => e.stopPropagation()}
          accessibilityViewIsModal
          accessibilityLabel={t("datePicker.title")}
        >
          <Text style={[m3TextStyle("labelLarge"), styles.eyebrow]}>{t("datePicker.title")}</Text>
          <Text style={[m3TextStyle("headlineSmall"), styles.headline]} numberOfLines={1}>
            {selected ? labels.formatLong(selected) : t("datePicker.placeholder")}
          </Text>
          <View style={styles.divider} />

          {view === "day" ? (
            <>
              <View style={styles.navRow}>
                <Pressable
                  onPress={() => shiftMonth(-1)}
                  disabled={prevDisabled}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: prevDisabled }}
                  accessibilityLabel={labels.ko ? "이전 달" : "Previous month"}
                  style={[styles.navBtn, prevDisabled && styles.navBtnOff]}
                >
                  <Chevron direction="left" color={m3.color.onSurfaceVariant} />
                </Pressable>

                <Pressable
                  onPress={() => setView("year")}
                  accessibilityRole="button"
                  accessibilityLabel={labels.monthYear(cursorY, cursorM)}
                  accessibilityHint={labels.ko ? "연도를 선택하려면 누르세요" : "Opens year selection"}
                  style={styles.monthLabelBtn}
                >
                  <Text style={[m3TextStyle("titleMedium"), styles.monthLabel]}>
                    {labels.monthYear(cursorY, cursorM)}
                  </Text>
                  <Chevron direction="down" size={18} color={m3.color.onSurfaceVariant} />
                </Pressable>

                <Pressable
                  onPress={() => shiftMonth(1)}
                  disabled={nextDisabled}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: nextDisabled }}
                  accessibilityLabel={labels.ko ? "다음 달" : "Next month"}
                  style={[styles.navBtn, nextDisabled && styles.navBtnOff]}
                >
                  <Chevron direction="right" color={m3.color.onSurfaceVariant} />
                </Pressable>
              </View>

              <View style={styles.weekHeader}>
                {labels.weekdays.map((w, i) => (
                  <View key={i} style={styles.weekCell}>
                    <Text style={[m3TextStyle("labelMedium"), styles.weekTxt]}>{w}</Text>
                  </View>
                ))}
              </View>

              {grid.map((week, wi) => (
                <View key={wi} style={styles.weekRow}>
                  {week.map((cell, ci) => {
                    if (cell === null) return <View key={ci} style={styles.dayCell} />;
                    const disabled = isDisabledISO(cell.iso, minISO, maxISO);
                    const isSel = cell.iso === selected;
                    const isToday = cell.iso === todayStr;
                    return (
                      <Pressable
                        key={ci}
                        disabled={disabled}
                        onPress={() => setSelected(cell.iso)}
                        style={styles.dayCell}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSel, disabled }}
                        accessibilityLabel={labels.formatLong(cell.iso)}
                      >
                        <View style={[styles.dayInner, isSel && styles.daySel, !isSel && isToday && styles.dayToday]}>
                          <Text
                            style={[
                              m3TextStyle("bodyMedium"),
                              disabled ? disabledInk : { color: isSel ? m3.color.onPrimary : m3.color.onSurface },
                            ]}
                          >
                            {cell.day}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </>
          ) : (
            <YearGrid
              minYear={minYear}
              maxYear={maxYear}
              selectedYear={isValidISO(selected) ? isoYear(selected) : cursorY}
              onSelect={(y) => {
                setCursorY(y);
                setView("day");
              }}
            />
          )}

          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.textBtn} accessibilityRole="button">
              <Text style={[m3TextStyle("labelLarge"), { color: m3.color.primary }]}>{t("actions.cancel")}</Text>
            </Pressable>
            <Pressable
              onPress={() => canConfirm && onConfirm(selected)}
              disabled={!canConfirm}
              style={styles.textBtn}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canConfirm }}
            >
              <Text style={[m3TextStyle("labelLarge"), canConfirm ? { color: m3.color.primary } : disabledInk]}>
                {t("datePicker.confirm")}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Year-only modal (커리어 achievement year).
// ---------------------------------------------------------------------------
function YearModal({
  visible,
  value,
  minYear,
  maxYear,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  value: string;
  minYear: number;
  maxYear: number;
  onCancel: () => void;
  onConfirm: (year: string) => void;
}) {
  const { t } = useTranslation("common");
  const selectedYear = /^\d{4}$/.test(value) ? Number(value) : null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel={t("actions.cancel")}>
        <Pressable
          style={styles.card}
          onPress={(e) => e.stopPropagation()}
          accessibilityViewIsModal
          accessibilityLabel={t("datePicker.yearTitle")}
        >
          <Text style={[m3TextStyle("labelLarge"), styles.eyebrow]}>{t("datePicker.yearTitle")}</Text>
          <View style={styles.divider} />
          <YearGrid
            minYear={minYear}
            maxYear={maxYear}
            selectedYear={selectedYear}
            onSelect={(y) => onConfirm(String(y))}
          />
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.textBtn} accessibilityRole="button">
              <Text style={[m3TextStyle("labelLarge"), { color: m3.color.primary }]}>{t("actions.cancel")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Trigger field (read-only, opens a picker). Mirrors m3/Field's outlined box.
// ---------------------------------------------------------------------------
function TriggerField({
  label,
  display,
  placeholder,
  glyph,
  error,
  supportingText,
  containerStyle,
  accessibilityLabel,
  accessibilityHint,
  onPress,
}: {
  label?: string;
  display: string;
  placeholder: string;
  glyph: "calendar" | "chevron";
  error?: boolean;
  supportingText?: string;
  containerStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  onPress: () => void;
}) {
  const borderColor = error ? m3.color.error : m3.color.outline;
  const labelColor = error ? m3.color.error : m3.color.onSurfaceVariant;
  const supportColor = error ? m3.color.error : m3.color.onSurfaceVariant;
  const hasValue = display.length > 0;
  return (
    <View style={containerStyle}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        accessibilityValue={{ text: hasValue ? display : placeholder }}
        style={[styles.box, { borderColor }]}
      >
        {label ? (
          <Text style={[m3TextStyle("bodySmall"), { color: labelColor }]} numberOfLines={1}>
            {label}
          </Text>
        ) : null}
        <View style={styles.triggerRow}>
          <Text
            style={[styles.triggerValue, { color: hasValue ? m3.color.onSurface : m3.color.onSurfaceVariant }]}
            numberOfLines={1}
          >
            {hasValue ? display : placeholder}
          </Text>
          {glyph === "calendar" ? (
            <CalendarGlyph color={m3.color.onSurfaceVariant} />
          ) : (
            <Chevron direction="down" size={20} color={m3.color.onSurfaceVariant} />
          )}
        </View>
      </Pressable>
      {supportingText ? (
        <Text style={[m3TextStyle("bodySmall"), styles.support, { color: supportColor }]} numberOfLines={2}>
          {supportingText}
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Public: DateField
// ---------------------------------------------------------------------------
export interface DateFieldProps {
  /** ISO "YYYY-MM-DD", or "" when unset. */
  value: string;
  onChange: (iso: string) => void;
  label?: string;
  placeholder?: string;
  /** Earliest selectable date, ISO. */
  minDate?: string;
  /** Latest selectable date, ISO. */
  maxDate?: string;
  /** Which view opens first — "year" is right for a birth date (jump decades). */
  initialView?: "day" | "year";
  /** Month to show when there is no value yet, ISO. */
  initialCursorDate?: string;
  error?: boolean;
  supportingText?: string;
  containerStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function DateField({
  value,
  onChange,
  label,
  placeholder,
  minDate,
  maxDate,
  initialView = "day",
  initialCursorDate,
  error,
  supportingText,
  containerStyle,
  accessibilityLabel,
  accessibilityHint,
}: DateFieldProps) {
  const { t } = useTranslation("common");
  const labels = useDateLabels();
  const [open, setOpen] = useState(false);
  const display = isValidISO(value) ? labels.formatLong(value) : "";
  return (
    <>
      <TriggerField
        label={label}
        display={display}
        placeholder={placeholder ?? t("datePicker.placeholder")}
        glyph="calendar"
        error={error}
        supportingText={supportingText}
        containerStyle={containerStyle}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        onPress={() => setOpen(true)}
      />
      <CalendarModal
        visible={open}
        valueISO={value}
        minISO={minDate}
        maxISO={maxDate}
        initialView={initialView}
        initialCursorISO={initialCursorDate}
        onCancel={() => setOpen(false)}
        onConfirm={(iso) => {
          setOpen(false);
          onChange(iso);
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Public: YearField
// ---------------------------------------------------------------------------
export interface YearFieldProps {
  /** "YYYY", or "" when unset. */
  value: string;
  onChange: (year: string) => void;
  label?: string;
  placeholder?: string;
  minYear?: number;
  maxYear?: number;
  error?: boolean;
  supportingText?: string;
  containerStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function YearField({
  value,
  onChange,
  label,
  placeholder,
  minYear,
  maxYear,
  error,
  supportingText,
  containerStyle,
  accessibilityLabel,
  accessibilityHint,
}: YearFieldProps) {
  const { t } = useTranslation("common");
  const labels = useDateLabels();
  const [open, setOpen] = useState(false);
  const thisYear = Number(todayISO().slice(0, 4));
  const resolvedMax = maxYear ?? thisYear;
  const resolvedMin = minYear ?? resolvedMax - 100;
  const display = /^\d{4}$/.test(value) ? labels.formatYear(Number(value)) : "";
  return (
    <>
      <TriggerField
        label={label}
        display={display}
        placeholder={placeholder ?? t("datePicker.yearPlaceholder")}
        glyph="chevron"
        error={error}
        supportingText={supportingText}
        containerStyle={containerStyle}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        onPress={() => setOpen(true)}
      />
      <YearModal
        visible={open}
        value={value}
        minYear={resolvedMin}
        maxYear={resolvedMax}
        onCancel={() => setOpen(false)}
        onConfirm={(year) => {
          setOpen(false);
          onChange(year);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  // Trigger field (outlined box, mirrors m3/Field).
  box: {
    borderWidth: 1,
    borderRadius: m3.shape.extraSmall,
    paddingHorizontal: m3.spacing.s4,
    paddingVertical: m3.spacing.s2,
    minHeight: 56,
    justifyContent: "center",
  },
  triggerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: m3.spacing.s2 },
  triggerValue: { flex: 1, fontSize: 16, fontFamily: m3.font.brand },
  support: { marginTop: m3.spacing.s1, marginHorizontal: m3.spacing.s4 },

  // Modal shell.
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: m3.spacing.s5,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: m3.color.surfaceContainerHigh,
    borderRadius: m3.shape.extraLarge,
    padding: m3.spacing.s5,
    ...m3.elevation.level3,
  },
  eyebrow: { color: m3.color.onSurfaceVariant },
  headline: { color: m3.color.onSurface, marginTop: m3.spacing.s1 },
  divider: { height: 1, backgroundColor: m3.color.outlineVariant, marginVertical: m3.spacing.s3 },

  // Month navigation.
  navRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: m3.spacing.s2 },
  navBtn: { padding: m3.spacing.s2, borderRadius: m3.shape.full },
  navBtnOff: { opacity: 0.38 },
  monthLabelBtn: { flexDirection: "row", alignItems: "center", gap: m3.spacing.s1, paddingHorizontal: m3.spacing.s2, paddingVertical: m3.spacing.s1 },
  monthLabel: { color: m3.color.onSurface },

  // Day grid.
  weekHeader: { flexDirection: "row" },
  weekCell: { flex: 1, alignItems: "center", paddingVertical: 6 },
  weekTxt: { color: m3.color.onSurfaceVariant, textAlign: "center" },
  weekRow: { flexDirection: "row" },
  dayCell: { flex: 1, aspectRatio: 1, alignItems: "center", justifyContent: "center", padding: 2 },
  dayInner: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  daySel: { backgroundColor: m3.color.primary },
  dayToday: { borderWidth: 1, borderColor: m3.color.primary },

  // Year grid.
  yearList: { maxHeight: 300, alignSelf: "stretch" },
  yearListContent: { paddingVertical: m3.spacing.s2 },
  yearCellWrap: { flex: 1, padding: m3.spacing.s1 },
  yearCell: { paddingVertical: m3.spacing.s3, borderRadius: m3.shape.large, alignItems: "center" },
  yearCellOn: { backgroundColor: m3.color.primary },

  // Actions.
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: m3.spacing.s2, marginTop: m3.spacing.s3 },
  textBtn: { paddingVertical: m3.spacing.s2, paddingHorizontal: m3.spacing.s3, borderRadius: m3.shape.full },
});
