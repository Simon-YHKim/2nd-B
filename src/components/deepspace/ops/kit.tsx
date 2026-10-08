// Shared Ops/assistant component kit (Claude Design ops-assistant.dc.html).
// Presentational + prop-driven: every action is a callback (no auto-execution —
// the screen wires them). deepSpace.* tokens only (no hex literals here), no
// legacy imports, no glassmorphism/pill/em dash. Primary action = mint fill,
// secondary = ghost. Touch targets ≥44px. The 6 domain screens assemble these.

import React, { createContext, useContext, type ReactNode } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
} from "react-native";
import { PhonePressable as Pressable, PhoneView as View } from "@/components/phone/PhoneUIKit";
import { PlainText as RNText } from "@/components/ui/PlainText";
import { router } from "expo-router";

import { deepSpace, deepSpaceRadii, deepSpaceSpacing, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { Text } from "@/components/ui/Text";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelRoundRect } from "@/components/pixel/PixelRoundRect";
import { PixelDither } from "@/components/pixel/PixelDither";
import { IosLargeTitle } from "@/components/dashboard/board/IosParts";
import { phoneIos } from "@/lib/theme/phone-ios";
import { phoneStyleSheet } from "@/lib/theme/phone-design";
import { usePhoneDesign } from "@/lib/theme/phone-design-context";
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
  const styles = useOpsStyles();
  return (
    <View style={styles.metaChip}>
      <Text variant="subtle" style={[styles.metaChipText, color ? { color } : null]}>{label}</Text>
    </View>
  );
}

export function ProgressBar({ value, color }: { value: number; color?: string }) {
  const styles = useOpsStyles();
  const phone = usePhoneDesign();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={styles.progressTrack}>
      <View
        style={[styles.progressFill, { width: `${pct * 100}%`, backgroundColor: phone ? phoneIos.blue : color ?? deepSpace.accent }]}
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
  const styles = useOpsStyles();
  return (
    <View style={styles.actionRow}>
      <Pressable
        accessibilityRole="button"
        onPress={onPrimary}
        hitSlop={8}
        style={styles.primaryBtn}
      >
        <Text variant="caption" style={styles.primaryBtnText}>{primaryLabel}</Text>
      </Pressable>
      {secondaryLabel && onSecondary ? (
        <Pressable
          accessibilityRole="button"
          onPress={onSecondary}
          hitSlop={8}
          style={styles.secondaryBtn}
        >
          <Text variant="caption" style={styles.secondaryBtnText}>{secondaryLabel}</Text>
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
  const styles = useOpsStyles();
  const accent = usePhoneDesign() ? phoneIos.blue : props.accent ?? deepSpace.accent;
  return (
    <View style={styles.recCard}>
      <View style={styles.recTitleRow}>
        <View style={[styles.dot, { backgroundColor: accent }]} />
        <Text variant="heading" style={styles.recTitle}>{props.title}</Text>
      </View>
      <Text variant="body" style={styles.recReason}>{props.reason}</Text>
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
      {props.disclaimer ? <Text variant="subtle" style={styles.recDisclaimer}>{props.disclaimer}</Text> : null}
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
  const styles = useOpsStyles();
  const t = usePhoneDesign() ? PHONE_CHIP_TONE[tone] : CHIP_TONE[tone];
  return (
    <View style={[styles.statusChip, { borderColor: t.line, backgroundColor: t.bg }]}>
      <Text variant="caption" style={[styles.statusChipText, { color: t.color }]}>{label}</Text>
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
  const styles = useOpsStyles();
  const phone = usePhoneDesign();
  return (
    <View style={styles.reminderRow}>
      <View style={styles.reminderTop}>
        <Text variant="heading" style={styles.reminderTitle}>{props.title}</Text>
        {props.onToggle && phone ? (
          <OpsPhoneSwitch checked={!!props.on} label={props.title} onPress={props.onToggle} />
        ) : props.onToggle ? (
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: !!props.on }}
            aria-checked={!!props.on}
            onPress={props.onToggle}
            hitSlop={10}
            style={[styles.toggle, props.on ? styles.toggleOn : styles.toggleOff]}
          >
            <View style={[styles.knob, props.on ? styles.knobOn : styles.knobOff]} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.reminderMeta}>
        <Text variant="subtle" style={styles.reminderSchedule}>{props.schedule}</Text>
        <View style={{ marginLeft: "auto" }}>
          <OpsStatusChip tone={props.tone} label={props.statusLabel} />
        </View>
      </View>
      {props.actionLabel && props.onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={props.onAction}
          hitSlop={8}
          style={styles.warnBtn}
        >
          <Text variant="caption" style={styles.warnBtnText}>{props.actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A 26px stepped track inside a 44px touch target. */
export function OpsPhoneSwitch({ checked, label, onPress }: { checked: boolean; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked }}
    aria-checked={checked} onPress={onPress} style={phoneSwitchStyles.touch}>
    <PixelRoundRect corner="pill" fill={checked ? phoneIos.green : phoneIos.fill}
      style={[phoneSwitchStyles.track, { alignItems: checked ? "flex-end" : "flex-start" }]}>
      <PixelRoundRect corner="small" fill={phoneIos.cell} style={phoneSwitchStyles.thumb} />
    </PixelRoundRect>
  </Pressable>;
}

// --- push sheet (B) ----------------------------------------------------

export interface PushOption {
  key: string;
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
  closeLabel?: string;
  options: PushOption[];
  confirmLabel: string; // "Allow and continue"
  onConfirm: () => void;
  onClose: () => void;
}

export function OpsPushSheet(props: OpsPushSheetProps) {
  const styles = useOpsStyles();
  const phone = usePhoneDesign();
  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose}>
      <Pressable
        style={styles.sheetBackdrop}
        onPress={props.onClose}
        accessibilityRole="button"
        accessibilityLabel={props.closeLabel}
      >
        {phone ? <PixelDither density={50} /> : null}
      </Pressable>
      <View style={styles.sheet}>
        <View style={styles.sheetGrip} />
        <Text variant="heading" style={styles.sheetTitle}>{props.title}</Text>
        {props.subtitle ? <Text variant="subtle" style={styles.sheetSubtitle}>{props.subtitle}</Text> : null}
        {props.needsConsent && props.consentLabel ? (
          <View style={styles.consentLine}>
            <RNText style={styles.consentBadge}>LOCK</RNText>
            <Text variant="body" style={styles.consentText}>{props.consentLabel}</Text>
          </View>
        ) : null}
        <View style={styles.sheetOptions}>
          {props.options.map((o) => (
            <Pressable
              key={o.key}
              accessibilityRole="button"
              onPress={o.onPress}
              hitSlop={6}
              style={[styles.pushOption, o.recommended ? styles.pushOptionRec : null]}
            >
              <View style={styles.pushOptionBody}>
                <Text variant="caption" style={styles.pushOptionLabel}>{o.label}</Text>
                {o.sub ? <Text variant="subtle" style={styles.pushOptionSub}>{o.sub}</Text> : null}
              </View>
              {o.recommended ? <RNText style={styles.pushRecTag}>REC</RNText> : null}
            </Pressable>
          ))}
        </View>
        {props.needsConsent ? (
          <Pressable
            accessibilityRole="button"
            onPress={props.onConfirm}
            hitSlop={6}
            style={[styles.primaryBtn, styles.sheetConfirm]}
          >
            <Text variant="caption" style={styles.primaryBtnText}>{props.confirmLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

// --- shared states (E) -------------------------------------------------

export type OpsStateVariant = "empty" | "error" | "unlinked" | "rate";

const STATE_BADGE: Record<OpsStateVariant, string> = {
  empty: "NEW",
  error: "ERR",
  unlinked: "LINK",
  rate: "WAIT",
};

export interface OpsStateProps {
  variant: OpsStateVariant;
  title: string;
  body: string;
  ctaLabel?: string;
  onCta?: () => void;
}

export function OpsState(props: OpsStateProps) {
  const styles = useOpsStyles();
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
      <RNText style={styles.stateBadge}>{STATE_BADGE[props.variant]}</RNText>
      <Text variant="heading" style={styles.stateTitle}>{props.title}</Text>
      <Text variant="body" style={styles.stateBody}>{props.body}</Text>
      {props.ctaLabel && props.onCta ? (
        <Pressable
          accessibilityRole="button"
          onPress={props.onCta}
          hitSlop={8}
          style={[props.variant === "error" ? styles.secondaryBtn : styles.primaryBtn, styles.stateCta]}
        >
          <Text variant="caption" style={props.variant === "error" ? styles.secondaryBtnText : styles.primaryBtnText}>
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
  const styles = useOpsStyles();
  const phone = usePhoneDesign();
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
            aria-selected={on}
            onPress={() => onSelect(tab.id)}
            hitSlop={6}
            style={[styles.pickerChip, on ? styles.pickerChipOn : null]}
          >
            <View style={[styles.dotSm, { backgroundColor: phone ? (on ? phoneIos.blue : phoneIos.gray3) : tab.color }]} />
            <Text variant="caption" style={[styles.pickerChipText, on ? styles.pickerChipTextOn : null]}>{tab.label}</Text>
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

type EmbeddedFrame = { onBack: () => void; backLabel: string };
const OpsEmbeddedFrameContext = createContext<EmbeddedFrame | null>(null);

/** The phone owns scrolling and navigation; domain screens keep their real data/actions. */
export function OpsEmbeddedFrameHost({ onBack, backLabel, children }: EmbeddedFrame & { children: ReactNode }) {
  return (
    <OpsEmbeddedFrameContext.Provider value={{ onBack, backLabel }}>
      {children}
    </OpsEmbeddedFrameContext.Provider>
  );
}

// rev2 windowed shell (sb-app §4): the M3 top app bar carries the title; the
// mini companion bubble retires (companion belongs to capture/chat/records
// only). `bubble`/`tip` stay in the props contract so the seven call sites
// don't churn, but they no longer render.
export function OpsFrame({ title, onBack, children, footer }: OpsFrameProps) {
  const phone = usePhoneDesign();
  const styles = useOpsStyles();
  const embedded = useContext(OpsEmbeddedFrameContext);
  if (embedded) {
    return (
      <View style={styles.embeddedFrame}>
        <View style={styles.embeddedHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={embedded.backLabel}
            onPress={embedded.onBack}
            style={styles.embeddedBack}
          >
            <PixelGlyph name={phone ? "chevron_left" : "arrow_back"} color={phone ? phoneIos.blue : deepSpace.accentBright} size={24} />
            {phone ? <Text variant="caption" style={styles.embeddedBackText}>{embedded.backLabel}</Text> : null}
          </Pressable>
          {!phone ? <Text variant="heading" numberOfLines={2} style={styles.embeddedTitle}>{title}</Text> : null}
        </View>
        {phone ? <IosLargeTitle>{title}</IosLargeTitle> : null}
        {children}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    );
  }
  return (
    <DeepSpaceScreen
      active="lens"
      header="none"
      variant="windowed"
      title={title}
      onBack={onBack ?? (() => router.back())}
    >
      <ScrollView contentContainerStyle={styles.frameScroll} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </DeepSpaceScreen>
  );
}

// --- styles (deepSpace tokens only) ------------------------------------

const clayStyles = StyleSheet.create({
  embeddedFrame: {
    gap: deepSpaceSpacing.md,
    padding: deepSpaceSpacing.md,
    backgroundColor: deepSpace.bgMid,
  },
  embeddedHeader: { flexDirection: "row", alignItems: "center", gap: deepSpaceSpacing.sm },
  embeddedBack: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  embeddedTitle: { flex: 1, color: deepSpace.accentBright },
  embeddedBackText: { color: deepSpace.accentBright },
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
  title: { fontSize: 18, color: deepSpace.accentBright },
  footer: { padding: deepSpaceSpacing.lg },

  metaChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    borderRadius: m3.shape.small,
  },
  metaChipText: { fontSize: 12, color: deepSpace.textLo },

  progressTrack: {
    height: 8,
    borderRadius: m3.shape.none,
    backgroundColor: deepSpace.card,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: m3.shape.none },

  actionRow: { flexDirection: "row", gap: deepSpaceSpacing.sm },
  primaryBtn: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: m3.shape.medium,
    backgroundColor: deepSpace.mint,
    paddingHorizontal: deepSpaceSpacing.md,
  },
  primaryBtnText: { fontSize: 14, color: deepSpace.onMint },
  secondaryBtn: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: m3.shape.medium,
    borderWidth: 1,
    borderColor: deepSpace.cardLineStrong,
    paddingHorizontal: deepSpaceSpacing.lg,
  },
  secondaryBtnText: { fontSize: 14, color: deepSpace.accentSoft },
  pressed: { opacity: 0.7 },

  recCard: {
    padding: deepSpaceSpacing.md,
    borderWidth: 1,
    borderColor: deepSpace.cardLineStrong,
    borderRadius: m3.shape.large,
    backgroundColor: deepSpace.card,
    gap: deepSpaceSpacing.sm,
  },
  recTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: m3.shape.none, marginTop: 6 },
  dotSm: { width: 7, height: 7, borderRadius: m3.shape.none },
  recTitle: { flex: 1, fontSize: 15, color: deepSpace.textHi },
  recReason: { fontSize: 14, color: deepSpace.textMid },
  recChips: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  recDisclaimer: { fontSize: 12, color: deepSpace.textLo },

  statusChip: { paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderRadius: m3.shape.small },
  statusChipText: { fontSize: 12 },

  reminderRow: {
    padding: deepSpaceSpacing.md,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    borderRadius: m3.shape.medium,
    backgroundColor: deepSpace.card,
    gap: deepSpaceSpacing.sm,
  },
  reminderTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  reminderTitle: { flex: 1, fontSize: 14, color: deepSpace.accentBright },
  reminderMeta: { flexDirection: "row", alignItems: "center", gap: 7 },
  reminderSchedule: { fontSize: 12, color: deepSpace.textLo },
  toggle: { width: 44, height: 26, borderRadius: m3.shape.none, justifyContent: "center", paddingHorizontal: 3 },
  toggleOn: { backgroundColor: deepSpace.mint, alignItems: "flex-end" },
  toggleOff: { backgroundColor: deepSpace.cardPressed, alignItems: "flex-start" },
  knob: { width: 20, height: 20, borderRadius: m3.shape.none },
  knobOn: { backgroundColor: deepSpace.onMint },
  knobOff: { backgroundColor: deepSpace.textLo },
  warnBtn: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: m3.shape.small,
    borderWidth: 1,
    borderColor: deepSpace.warningLine,
    backgroundColor: deepSpace.warningBg,
  },
  warnBtnText: { fontSize: 13, color: deepSpace.warning },

  sheetBackdrop: { flex: 1, backgroundColor: withAlpha(deepSpace.bgEdge, 0.6) },
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
  sheetGrip: { width: 40, height: 4, borderRadius: m3.shape.none, backgroundColor: deepSpace.cardLineStrong, alignSelf: "center" },
  sheetTitle: { fontSize: 16, color: deepSpace.textHi },
  sheetSubtitle: { fontSize: 12, color: deepSpace.textLo },
  consentLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: deepSpaceSpacing.sm,
    borderWidth: 1,
    borderColor: deepSpace.mintLine,
    backgroundColor: deepSpace.mintBg,
    borderRadius: m3.shape.medium,
  },
  consentBadge: {
    minWidth: 42,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: deepSpace.mintLine,
    borderRadius: m3.shape.small,
    color: deepSpace.mint,
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },
  consentText: { flex: 1, fontSize: 13, color: deepSpace.textMid },
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
    borderRadius: m3.shape.medium,
  },
  pushOptionRec: { borderColor: deepSpace.mintLine, backgroundColor: deepSpace.mintBg },
  pushOptionBody: { flex: 1 },
  pushOptionLabel: { fontSize: 14, color: deepSpace.accentBright },
  pushOptionSub: { fontSize: 12, color: deepSpace.textLo, marginTop: 1 },
  pushRecTag: {
    minWidth: 34,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: deepSpace.mintLine,
    borderRadius: m3.shape.small,
    color: deepSpace.mint,
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },
  sheetConfirm: { marginTop: 4 },

  state: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    padding: deepSpaceSpacing.md,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    borderRadius: m3.shape.large,
    backgroundColor: deepSpace.card,
  },
  stateDanger: { borderColor: deepSpace.dangerLine, backgroundColor: deepSpace.dangerBg },
  stateWarn: { borderColor: deepSpace.warningLine, backgroundColor: deepSpace.warningBg },
  stateBadge: {
    minWidth: 48,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: deepSpace.cardLineStrong,
    borderRadius: m3.shape.small,
    color: deepSpace.accentSoft,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  stateTitle: { fontSize: 14, color: deepSpace.accentBright, textAlign: "center" },
  stateBody: { fontSize: 13, color: deepSpace.textLo, textAlign: "center" },
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
    borderRadius: m3.shape.medium,
  },
  pickerChipOn: { borderColor: deepSpace.accent, backgroundColor: deepSpace.cardPressed },
  pickerChipText: { fontSize: 13, color: deepSpace.accentSoft },
  pickerChipTextOn: { color: deepSpace.accentBright },
});

const PHONE_CHIP_TONE: typeof CHIP_TONE = {
  active: { color: phoneIos.blue, line: phoneIos.fill, bg: phoneIos.fill },
  positive: { color: phoneIos.blue, line: phoneIos.fill, bg: phoneIos.fill },
  warning: { color: phoneIos.orange, line: phoneIos.fill, bg: phoneIos.fill },
  danger: { color: phoneIos.red, line: phoneIos.fill, bg: phoneIos.fill },
  info: { color: phoneIos.blue, line: phoneIos.fill, bg: phoneIos.fill },
  muted: { color: phoneIos.label2, line: phoneIos.fill, bg: phoneIos.fill },
};

const phoneBaseStyles = phoneStyleSheet(clayStyles);
const iosStyles = {
  ...phoneBaseStyles,
  embeddedFrame: { ...clayStyles.embeddedFrame, backgroundColor: phoneIos.grouped, paddingHorizontal: 14, paddingBottom: 20, gap: 14 },
  embeddedHeader: { ...clayStyles.embeddedHeader, gap: 0, marginLeft: -10 },
  embeddedBack: { minWidth: 44, minHeight: 44, flexDirection: "row" as const, alignItems: "center" as const, paddingHorizontal: 6 },
  embeddedBackText: { color: phoneIos.blue },
  footer: { paddingTop: 4, paddingBottom: 12 },
  primaryBtn: { ...phoneBaseStyles.primaryBtn, backgroundColor: phoneIos.blue },
  primaryBtnText: { ...clayStyles.primaryBtnText, color: phoneIos.onBlue },
  secondaryBtn: { ...phoneBaseStyles.secondaryBtn, backgroundColor: phoneIos.fill, borderWidth: 0 },
  secondaryBtnText: { ...clayStyles.secondaryBtnText, color: phoneIos.blue },
  recCard: { ...phoneBaseStyles.recCard, borderWidth: 0, backgroundColor: phoneIos.cell, padding: 14, gap: 10 },
  recTitle: { ...clayStyles.recTitle, color: phoneIos.label, fontFamily: "Galmuri11Bold", lineHeight: 22 },
  recReason: { ...clayStyles.recReason, color: phoneIos.label, lineHeight: 22 },
  state: { ...phoneBaseStyles.state, borderWidth: 0, backgroundColor: phoneIos.cell, padding: 18 },
  stateDanger: { borderWidth: 0, backgroundColor: phoneIos.cell },
  stateWarn: { borderWidth: 0, backgroundColor: phoneIos.cell },
  stateBadge: { ...phoneBaseStyles.stateBadge, color: phoneIos.blue, borderWidth: 0 },
  toggleOn: { ...clayStyles.toggleOn, backgroundColor: phoneIos.green },
  toggleOff: { ...clayStyles.toggleOff, backgroundColor: phoneIos.fill },
  knobOn: { backgroundColor: phoneIos.cell },
  knobOff: { backgroundColor: phoneIos.cell },
  pickerChip: { ...phoneBaseStyles.pickerChip, borderWidth: 0, backgroundColor: phoneIos.fill },
  pickerChipOn: { borderColor: phoneIos.cell, backgroundColor: phoneIos.cell },
  pickerChipText: { ...clayStyles.pickerChipText, color: phoneIos.label2 },
  pickerChipTextOn: { color: phoneIos.blue },
  sheetBackdrop: { flex: 1, backgroundColor: "transparent" },
  sheet: { ...phoneBaseStyles.sheet, backgroundColor: phoneIos.grouped, borderTopWidth: 0 },
  sheetGrip: { ...phoneBaseStyles.sheetGrip, backgroundColor: phoneIos.gray3 },
  pushOption: { ...phoneBaseStyles.pushOption, backgroundColor: phoneIos.cell, borderWidth: 0 },
  pushOptionRec: { backgroundColor: phoneIos.cell, borderColor: phoneIos.blue },
  pushOptionLabel: { ...clayStyles.pushOptionLabel, color: phoneIos.blue },
};

function useOpsStyles() {
  return usePhoneDesign() ? iosStyles : clayStyles;
}

const phoneSwitchStyles = StyleSheet.create({
  touch: { minWidth: 44, minHeight: 44, justifyContent: "center" },
  track: { width: 44, height: 26, justifyContent: "center", paddingHorizontal: 3 },
  thumb: { width: 20, height: 20 },
});
