// Shared Ops/assistant component kit (Claude Design ops-assistant.dc.html).
// Presentational + prop-driven: every action is a callback (no auto-execution —
// the screen wires them). deepSpace.* tokens only (no hex literals here), no
// legacy imports, no glassmorphism/pill/em dash. Primary action = mint fill,
// secondary = ghost. Touch targets ≥44px. The 6 domain screens assemble these.

import { type ReactNode } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { deepSpace, deepSpaceRadii, deepSpaceSpacing } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { SecondbStatusHeader } from "@/components/deepspace";
import { OPS_DOMAIN_GROUP, type OpsDomainId, type OpsGroupId } from "@/lib/ops/domains";

// --- domain color mapping (deepSpace palette) --------------------------

const GROUP_COLOR: Record<OpsGroupId, string> = {
  body: deepSpace.accent, //  #46B6FF 몸
  living: deepSpace.accent, //  생활
  learning: deepSpace.accentSoft, // #9FE4FF 배움
  worklife: deepSpace.accentDim, // #7FC9F0 일·커리어
  creative: deepSpace.soul, // #C8B6FF 창작
};

export function domainColor(group: OpsGroupId): string {
  return GROUP_COLOR[group];
}
export function domainColorFor(domain: OpsDomainId): string {
  return GROUP_COLOR[OPS_DOMAIN_GROUP[domain]];
}

// --- primitives --------------------------------------------------------

export function MetaChip({ label, color }: { label: string; color?: string }) {
  return (
    <View style={styles.metaChip}>
      <Text style={[styles.metaChipText, color ? { color } : null]}>{label}</Text>
    </View>
  );
}

export function ProgressBar({ value, color }: { value: number; color?: string }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={styles.progressTrack}>
      <View
        style={[styles.progressFill, { width: `${pct * 100}%`, backgroundColor: color ?? deepSpace.accent }]}
      />
    </View>
  );
}

// --- action row (primary mint / secondary ghost) -----------------------

export interface OpsActionRowProps {
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export function OpsActionRow({ primaryLabel, onPrimary, secondaryLabel, onSecondary }: OpsActionRowProps) {
  return (
    <View style={styles.actionRow}>
      <Pressable
        accessibilityRole="button"
        onPress={onPrimary}
        hitSlop={8}
        style={({ pressed }) => [styles.primaryBtn, pressed ? styles.pressed : null]}
      >
        <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
      </Pressable>
      {secondaryLabel && onSecondary ? (
        <Pressable
          accessibilityRole="button"
          onPress={onSecondary}
          hitSlop={8}
          style={({ pressed }) => [styles.secondaryBtn, pressed ? styles.pressed : null]}
        >
          <Text style={styles.secondaryBtnText}>{secondaryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// --- recommendation card (A) -------------------------------------------

export interface OpsRecommendationCardProps {
  title: string;
  reason: string;
  chips?: string[];
  accent?: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  disclaimer?: string;
}

export function OpsRecommendationCard(props: OpsRecommendationCardProps) {
  const accent = props.accent ?? deepSpace.accent;
  return (
    <View style={styles.recCard}>
      <View style={styles.recTitleRow}>
        <View style={[styles.dot, { backgroundColor: accent }]} />
        <Text style={styles.recTitle}>{props.title}</Text>
      </View>
      <Text style={styles.recReason}>{props.reason}</Text>
      {props.chips && props.chips.length > 0 ? (
        <View style={styles.recChips}>
          {props.chips.map((c) => (
            <MetaChip key={c} label={c} />
          ))}
        </View>
      ) : null}
      <OpsActionRow
        primaryLabel={props.primaryLabel}
        onPrimary={props.onPrimary}
        secondaryLabel={props.secondaryLabel}
        onSecondary={props.onSecondary}
      />
      {props.disclaimer ? <Text style={styles.recDisclaimer}>{props.disclaimer}</Text> : null}
    </View>
  );
}

// --- status chip -------------------------------------------------------

export type OpsChipTone = "active" | "warning" | "muted" | "positive" | "info" | "danger";

const CHIP_TONE: Record<OpsChipTone, { color: string; line: string; bg: string }> = {
  active: { color: deepSpace.mint, line: deepSpace.mintLine, bg: deepSpace.mintBg },
  positive: { color: deepSpace.mint, line: deepSpace.mintLine, bg: deepSpace.mintBg },
  warning: { color: deepSpace.warning, line: deepSpace.warningLine, bg: deepSpace.warningBg },
  danger: { color: deepSpace.dangerText, line: deepSpace.dangerLine, bg: deepSpace.dangerBg },
  info: { color: deepSpace.accentSoft, line: deepSpace.cardLineStrong, bg: deepSpace.card },
  muted: { color: deepSpace.textLo, line: deepSpace.cardLine, bg: deepSpace.card },
};

export function OpsStatusChip({ tone, label }: { tone: OpsChipTone; label: string }) {
  const t = CHIP_TONE[tone];
  return (
    <View style={[styles.statusChip, { borderColor: t.line, backgroundColor: t.bg }]}>
      <Text style={[styles.statusChipText, { color: t.color }]}>{label}</Text>
    </View>
  );
}

// --- reminder row (C) --------------------------------------------------

export interface OpsReminderRowProps {
  title: string;
  schedule: string;
  tone: OpsChipTone;
  statusLabel: string;
  on?: boolean;
  onToggle?: () => void;
  actionLabel?: string;
  onAction?: () => void;
}

export function OpsReminderRow(props: OpsReminderRowProps) {
  return (
    <View style={styles.reminderRow}>
      <View style={styles.reminderTop}>
        <Text style={styles.reminderTitle}>{props.title}</Text>
        {props.onToggle ? (
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: !!props.on }}
            onPress={props.onToggle}
            hitSlop={10}
            style={[styles.toggle, props.on ? styles.toggleOn : styles.toggleOff]}
          >
            <View style={[styles.knob, props.on ? styles.knobOn : styles.knobOff]} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.reminderMeta}>
        <Text style={styles.reminderSchedule}>{props.schedule}</Text>
        <View style={{ marginLeft: "auto" }}>
          <OpsStatusChip tone={props.tone} label={props.statusLabel} />
        </View>
      </View>
      {props.actionLabel && props.onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={props.onAction}
          hitSlop={8}
          style={({ pressed }) => [styles.warnBtn, pressed ? styles.pressed : null]}
        >
          <Text style={styles.warnBtnText}>{props.actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// --- push sheet (B) ----------------------------------------------------

export interface PushOption {
  key: string;
  icon: string;
  label: string;
  sub?: string;
  recommended?: boolean;
  onPress: () => void;
}

export interface OpsPushSheetProps {
  visible: boolean;
  title: string; // "Where should this routine go?"
  subtitle?: string; // routine title · cadence
  needsConsent?: boolean;
  consentLabel?: string;
  options: PushOption[];
  confirmLabel: string; // "Allow and continue"
  onConfirm: () => void;
  onClose: () => void;
}

export function OpsPushSheet(props: OpsPushSheetProps) {
  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={props.onClose} accessibilityRole="button" />
      <View style={styles.sheet}>
        <View style={styles.sheetGrip} />
        <Text style={styles.sheetTitle}>{props.title}</Text>
        {props.subtitle ? <Text style={styles.sheetSubtitle}>{props.subtitle}</Text> : null}
        {props.needsConsent && props.consentLabel ? (
          <View style={styles.consentLine}>
            <Text style={styles.consentIcon}>🔒</Text>
            <Text style={styles.consentText}>{props.consentLabel}</Text>
          </View>
        ) : null}
        <View style={styles.sheetOptions}>
          {props.options.map((o) => (
            <Pressable
              key={o.key}
              accessibilityRole="button"
              onPress={o.onPress}
              hitSlop={6}
              style={({ pressed }) => [
                styles.pushOption,
                o.recommended ? styles.pushOptionRec : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.pushIcon}>{o.icon}</Text>
              <View style={styles.pushOptionBody}>
                <Text style={styles.pushOptionLabel}>{o.label}</Text>
                {o.sub ? <Text style={styles.pushOptionSub}>{o.sub}</Text> : null}
              </View>
              {o.recommended ? <Text style={styles.pushRecTag}>★</Text> : null}
            </Pressable>
          ))}
        </View>
        {props.needsConsent ? (
          <Pressable
            accessibilityRole="button"
            onPress={props.onConfirm}
            hitSlop={6}
            style={({ pressed }) => [styles.primaryBtn, styles.sheetConfirm, pressed ? styles.pressed : null]}
          >
            <Text style={styles.primaryBtnText}>{props.confirmLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

// --- shared states (E) -------------------------------------------------

export type OpsStateVariant = "empty" | "error" | "unlinked" | "rate";

const STATE_ICON: Record<OpsStateVariant, string> = {
  empty: "✦",
  error: "⚠",
  unlinked: "🔗",
  rate: "⏳",
};

export interface OpsStateProps {
  variant: OpsStateVariant;
  title: string;
  body: string;
  ctaLabel?: string;
  onCta?: () => void;
}

export function OpsState(props: OpsStateProps) {
  const danger = props.variant === "error";
  const warn = props.variant === "rate";
  return (
    <View
      style={[
        styles.state,
        danger ? styles.stateDanger : null,
        warn ? styles.stateWarn : null,
      ]}
    >
      <Text style={styles.stateIcon}>{STATE_ICON[props.variant]}</Text>
      <Text style={styles.stateTitle}>{props.title}</Text>
      <Text style={styles.stateBody}>{props.body}</Text>
      {props.ctaLabel && props.onCta ? (
        <Pressable
          accessibilityRole="button"
          onPress={props.onCta}
          hitSlop={8}
          style={({ pressed }) => [
            props.variant === "error" ? styles.secondaryBtn : styles.primaryBtn,
            styles.stateCta,
            pressed ? styles.pressed : null,
          ]}
        >
          <Text style={props.variant === "error" ? styles.secondaryBtnText : styles.primaryBtnText}>
            {props.ctaLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// --- domain picker (F) -------------------------------------------------

export interface DomainTab {
  id: string;
  label: string;
  color: string;
}

export function OpsDomainPicker({
  tabs,
  selected,
  onSelect,
}: {
  tabs: DomainTab[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.pickerRow}
    >
      {tabs.map((tab) => {
        const on = tab.id === selected;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onSelect(tab.id)}
            hitSlop={6}
            style={[styles.pickerChip, on ? styles.pickerChipOn : null]}
          >
            <View style={[styles.dotSm, { backgroundColor: tab.color }]} />
            <Text style={[styles.pickerChipText, on ? styles.pickerChipTextOn : null]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// --- screen frame ------------------------------------------------------

export interface OpsFrameProps {
  title: string;
  bubble?: string;
  tip?: string;
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function OpsFrame({ title, bubble, tip, onBack, children, footer }: OpsFrameProps) {
  return (
    <SafeAreaView style={styles.frame} edges={["top", "bottom"]}>
      <View style={styles.glow} pointerEvents="none" />
      <ScrollView contentContainerStyle={styles.frameScroll} showsVerticalScrollIndicator={false}>
        {bubble ? <SecondbStatusHeader text={bubble} tip={tip ?? ""} /> : null}
        <View style={styles.titleRow}>
          {onBack ? (
            <Pressable accessibilityRole="button" onPress={onBack} hitSlop={10} style={styles.backBtn}>
              <Text style={styles.backIcon}>‹</Text>
            </Pressable>
          ) : null}
          <Text style={styles.title}>{title}</Text>
        </View>
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

// --- styles (deepSpace tokens only) ------------------------------------

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: deepSpace.bg },
  glow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 220,
    backgroundColor: deepSpace.bgGlow,
    opacity: 0.5,
  },
  frameScroll: { padding: deepSpaceSpacing.lg, paddingBottom: 40, gap: deepSpaceSpacing.md },
  titleRow: { flexDirection: "row", alignItems: "center", gap: deepSpaceSpacing.sm },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  backIcon: { color: deepSpace.accentBright, fontSize: 24 },
  title: { fontFamily: fontFamilies.pixelKo, fontSize: 18, color: deepSpace.accentBright },
  footer: { padding: deepSpaceSpacing.lg },

  metaChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    borderRadius: deepSpaceRadii.sm,
  },
  metaChipText: { fontSize: 12, color: deepSpace.textLo },

  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: deepSpace.card,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 4 },

  actionRow: { flexDirection: "row", gap: deepSpaceSpacing.sm },
  primaryBtn: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: deepSpaceRadii.md,
    backgroundColor: deepSpace.mint,
    paddingHorizontal: deepSpaceSpacing.md,
  },
  primaryBtnText: { fontFamily: fontFamilies.pixelKo, fontSize: 14, color: deepSpace.onMint },
  secondaryBtn: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: deepSpaceRadii.md,
    borderWidth: 1,
    borderColor: deepSpace.cardLineStrong,
    paddingHorizontal: deepSpaceSpacing.lg,
  },
  secondaryBtnText: { fontFamily: fontFamilies.pixelKo, fontSize: 14, color: deepSpace.accentSoft },
  pressed: { opacity: 0.7 },

  recCard: {
    padding: deepSpaceSpacing.md,
    borderWidth: 1,
    borderColor: deepSpace.cardLineStrong,
    borderRadius: deepSpaceRadii.lg,
    backgroundColor: deepSpace.card,
    gap: deepSpaceSpacing.sm,
  },
  recTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  dotSm: { width: 7, height: 7, borderRadius: 4 },
  recTitle: { flex: 1, fontFamily: fontFamilies.pixelKo, fontSize: 15, color: deepSpace.textHi, lineHeight: 21 },
  recReason: { fontSize: 14, color: deepSpace.textMid, lineHeight: 21 },
  recChips: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  recDisclaimer: { fontSize: 12, color: deepSpace.textLo, lineHeight: 17 },

  statusChip: { paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderRadius: deepSpaceRadii.sm },
  statusChipText: { fontSize: 12, fontFamily: fontFamilies.pixelKo },

  reminderRow: {
    padding: deepSpaceSpacing.md,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    borderRadius: deepSpaceRadii.md,
    backgroundColor: deepSpace.card,
    gap: deepSpaceSpacing.sm,
  },
  reminderTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  reminderTitle: { flex: 1, fontFamily: fontFamilies.pixelKo, fontSize: 14, color: deepSpace.accentBright },
  reminderMeta: { flexDirection: "row", alignItems: "center", gap: 7 },
  reminderSchedule: { fontSize: 12, color: deepSpace.textLo },
  toggle: { width: 44, height: 26, borderRadius: 13, justifyContent: "center", paddingHorizontal: 3 },
  toggleOn: { backgroundColor: deepSpace.mint, alignItems: "flex-end" },
  toggleOff: { backgroundColor: deepSpace.cardPressed, alignItems: "flex-start" },
  knob: { width: 20, height: 20, borderRadius: 10 },
  knobOn: { backgroundColor: deepSpace.onMint },
  knobOff: { backgroundColor: deepSpace.textLo },
  warnBtn: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: deepSpaceRadii.sm,
    borderWidth: 1,
    borderColor: deepSpace.warningLine,
    backgroundColor: deepSpace.warningBg,
  },
  warnBtnText: { fontFamily: fontFamilies.pixelKo, fontSize: 13, color: deepSpace.warning },

  sheetBackdrop: { flex: 1, backgroundColor: deepSpace.bgEdge, opacity: 0.6 },
  sheet: {
    backgroundColor: deepSpace.bgMid,
    borderTopWidth: 1,
    borderColor: deepSpace.cardLineStrong,
    borderTopLeftRadius: deepSpaceRadii.phone,
    borderTopRightRadius: deepSpaceRadii.phone,
    padding: deepSpaceSpacing.lg,
    paddingBottom: deepSpaceSpacing.xl,
    gap: deepSpaceSpacing.sm,
  },
  sheetGrip: { width: 40, height: 4, borderRadius: 2, backgroundColor: deepSpace.cardLineStrong, alignSelf: "center" },
  sheetTitle: { fontFamily: fontFamilies.pixelKo, fontSize: 16, color: deepSpace.textHi },
  sheetSubtitle: { fontSize: 12, color: deepSpace.textLo },
  consentLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: deepSpaceSpacing.sm,
    borderWidth: 1,
    borderColor: deepSpace.mintLine,
    backgroundColor: deepSpace.mintBg,
    borderRadius: deepSpaceRadii.md,
  },
  consentIcon: { fontSize: 14 },
  consentText: { flex: 1, fontSize: 13, color: deepSpace.textMid, lineHeight: 18 },
  sheetOptions: { gap: 8 },
  pushOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    minHeight: 48,
    padding: deepSpaceSpacing.sm,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
    borderRadius: deepSpaceRadii.md,
  },
  pushOptionRec: { borderColor: deepSpace.mintLine, backgroundColor: deepSpace.mintBg },
  pushIcon: { fontSize: 18 },
  pushOptionBody: { flex: 1 },
  pushOptionLabel: { fontFamily: fontFamilies.pixelKo, fontSize: 14, color: deepSpace.accentBright },
  pushOptionSub: { fontSize: 12, color: deepSpace.textLo, marginTop: 1 },
  pushRecTag: { fontSize: 13, color: deepSpace.mint },
  sheetConfirm: { marginTop: 4 },

  state: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    padding: deepSpaceSpacing.md,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    borderRadius: deepSpaceRadii.lg,
    backgroundColor: deepSpace.card,
  },
  stateDanger: { borderColor: deepSpace.dangerLine, backgroundColor: deepSpace.dangerBg },
  stateWarn: { borderColor: deepSpace.warningLine, backgroundColor: deepSpace.warningBg },
  stateIcon: { fontSize: 26, color: deepSpace.accentSoft },
  stateTitle: { fontFamily: fontFamilies.pixelKo, fontSize: 14, color: deepSpace.accentBright, textAlign: "center" },
  stateBody: { fontSize: 13, color: deepSpace.textLo, textAlign: "center", lineHeight: 18 },
  stateCta: { flex: 0, paddingHorizontal: deepSpaceSpacing.lg, marginTop: 4 },

  pickerRow: { gap: 7, paddingVertical: 2 },
  pickerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 44,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    borderRadius: deepSpaceRadii.md,
  },
  pickerChipOn: { borderColor: deepSpace.accent, backgroundColor: deepSpace.cardPressed },
  pickerChipText: { fontFamily: fontFamilies.pixelKo, fontSize: 13, color: deepSpace.accentSoft },
  pickerChipTextOn: { color: deepSpace.accentBright },
});
