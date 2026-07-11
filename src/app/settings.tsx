// Settings screen — rev2 M3 toggle-card top (모양 / 기능 / 데이터 연동, cloned
// 1:1 from reference-app SettingsScreen + docs/clone-audit capture 09-settings)
// over the retained functional settings surface (account nav, language,
// decorative crew, the one-area-at-a-time data-delete danger zone, sign-out).
// The M3 rows are the capture-matching visuals; the sections below carry the
// account/data/language/danger-zone behavior and localized helper copy.

import { type ReactNode, useEffect, useState } from "react";
import {
  ActivityIndicator,
  TouchableOpacity,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
  type AccessibilityRole,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SvgXml } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumLoadingState, PremiumModal, PremiumToast } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { MdButton } from "@/components/m3";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { deepSpace, deepSpaceRadii, semantic, spacing, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { fontFamilies } from "@/theme/typography";
import { useAuth } from "@/lib/auth/AuthContext";
import { useTheme } from "@/lib/theme/ThemeContext";
import { signOut } from "@/lib/supabase/auth";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceLinks } from "@/components/deep-space/DeepSpaceLinks";
// Direct module import (NOT the components/deepspace barrel) — the barrel has a
// known require cycle that crashed the /settings path once already (PR 711).
import { SecondbStatusHeader } from "@/components/deep-space/SecondbStatusHeader";
import { useCrewDensity, CREW_DENSITY_ORDER, type CrewDensity } from "@/lib/settings/crew-density";
import {
  useAppFeatures,
  type AccentPalette,
  type ConnectionKey,
  type FeatureKey,
} from "@/lib/settings/app-features";
import { AVAILABLE_UI_LOCALES, UI_LOCALE_META } from "@/lib/i18n/locales";
import { keepAllKo } from "@/lib/i18n/keep-all";
import { resetCoachmarks } from "@/lib/onboarding/coachmarks-gate";
import {
  deleteAllChatUsage,
  deleteAllUserData,
  deleteAllWikiPages,
  deleteRecordsByKind,
  deleteRecordsByTag,
  deleteUningestedSources,
} from "@/lib/records/delete-bulk";

const CONFIRM_PHRASE = "DELETE";
type SettingsToast = { message: string; tone: "info" | "success" | "danger" };
type PendingConfirm = { message: string; onYes: () => Promise<void> } | null;
type ActionError = { title: string; body: string; retry?: () => void } | null;
type SettingsDisclosureKey = "crew" | "data" | "language";
type DataDeleteStep = "records" | "assessments" | "library" | "full";

const DATA_DELETE_STEPS: DataDeleteStep[] = ["records", "assessments", "library", "full"];

const CREW_DENSITY_LABEL: Record<"en" | "ko", Record<CrewDensity, string>> = {
  en: { none: "None", few: "Few", some: "Some", many: "Many" },
  ko: { none: "없음", few: "적게", some: "보통", many: "많이" },
};

// ── M3 toggle-card kit (rev2 clone) ─────────────────────────────────────────
// Icons: 1:1 stroke idiom from reference-app sb-data.jsx ICON_SVG (currentColor
// stroke 2dp; 1.4dp + fill when `fill`).
const ICON_PATHS: Record<string, string> = {
  bedtime: '<path d="M20 14.2A8 8 0 1 1 10.2 4.4 6.8 6.8 0 0 0 20 14.2Z"/>',
  auto_awesome:
    '<path d="M11 3c.4 3.2 2.3 5.1 5.5 5.5-3.2.4-5.1 2.3-5.5 5.5-.4-3.2-2.3-5.1-5.5-5.5C8.7 8.1 10.6 6.2 11 3Z"/><path d="M18 13c.2 1.5 1 2.3 2.5 2.5-1.5.2-2.3 1-2.5 2.5-.2-1.5-1-2.3-2.5-2.5 1.5-.2 2.3-1 2.5-2.5Z"/>',
  bubble_chart: '<circle cx="9" cy="10" r="4"/><circle cx="17" cy="8" r="2.3"/><circle cx="16.4" cy="15.6" r="3"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  badge:
    '<rect x="3" y="6" width="18" height="13" rx="2.2"/><path d="M9.5 4h5v2.8h-5z"/><circle cx="9" cy="12.5" r="1.8"/><path d="M14 11.5h4M14 14.5h4M6.2 16.3h6.5"/>',
  mic: '<rect x="9.4" y="3.5" width="5.2" height="11" rx="2.6"/><path d="M6 11.2a6 6 0 0 0 12 0M12 17.2V20.5"/>',
  forum: '<path d="M3 5h12v8H7l-4 3.2z"/><path d="M8 13.2V15h9l3 2.4V9.5h-2.5"/>',
  auto_stories:
    '<path d="M12 6.2C9.8 4.8 6.8 4.4 4 5v12.5c2.8-.6 5.8-.2 8 1.2 2.2-1.4 5.2-1.8 8-1.2V5c-2.8-.6-5.8-.2-8 1.2Z"/><path d="M12 6.2v12.5"/>',
  check: '<path d="M5 12.5 10 17 19 7"/>',
};

function M3Icon({ name, color, size = 20, fill = false }: { name: string; color: string; size?: number; fill?: boolean }) {
  const inner = ICON_PATHS[name] ?? ICON_PATHS.auto_awesome;
  const xml =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="${fill ? "currentColor" : "none"}" stroke="currentColor" stroke-width="${fill ? 1.4 : 2}" ` +
    `stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  return <SvgXml xml={xml} width={size} height={size} color={color} />;
}

// M3 Switch (1:1 from reference-app MdSwitch): 52×32 track, 2dp border, thumb
// 16→24. Colors via m3.color tokens (no hex). Announces switch role + checked.
function M3Switch({ checked, onChange, accessibilityLabel }: { checked: boolean; onChange: (v: boolean) => void; accessibilityLabel?: string }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      onPress={() => onChange(!checked)}
      hitSlop={8}
      style={[
        m3Styles.switchTrack,
        { borderColor: checked ? m3.color.primary : m3.color.outline, backgroundColor: checked ? m3.color.primary : m3.color.surfaceContainerHighest },
      ]}
    >
      <View
        style={[
          m3Styles.switchThumb,
          checked
            ? { width: 24, height: 24, right: 2, backgroundColor: m3.color.onPrimary }
            : { width: 16, height: 16, left: 7, backgroundColor: m3.color.outline },
        ]}
      />
    </Pressable>
  );
}

function M3IconBadge({ icon, active }: { icon: string; active: boolean }) {
  return (
    <View style={[m3Styles.iconBadge, { backgroundColor: active ? m3.color.primary : m3.color.surfaceContainerHighest }]}>
      <M3Icon name={icon} fill={active} color={active ? m3.color.onPrimary : m3.color.onSurfaceVariant} />
    </View>
  );
}

function M3SectionLabel({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <View style={m3Styles.sectionLabelRow}>
      <RNText style={m3Styles.sectionLabel}>{children}</RNText>
      {action}
    </View>
  );
}

function M3Group({ children }: { children: ReactNode }) {
  return <View style={m3Styles.card}>{children}</View>;
}
function M3Divider() {
  return <View style={m3Styles.divider} />;
}

function M3ToggleRow({ icon, label, sub, subAccessibilityLabel, checked, onChange }: { icon: string; label: string; sub: string; subAccessibilityLabel?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={m3Styles.row}>
      <M3IconBadge icon={icon} active={checked} />
      <View style={m3Styles.rowText}>
        <RNText style={m3Styles.rowLabel}>{label}</RNText>
        {/* subAccessibilityLabel: when sub went through keepAllKo, screen readers
            get the raw string (U+2060 joiners disorient braille / char review). */}
        <RNText style={m3Styles.rowSub} accessibilityLabel={subAccessibilityLabel}>{sub}</RNText>
      </View>
      <M3Switch checked={checked} onChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

function M3ConnectRow({ icon, label, sub, connected, connectLabel, connectedLabel, onToggle }: { icon: string; label: string; sub: string; connected: boolean; connectLabel: string; connectedLabel: string; onToggle: () => void }) {
  return (
    <View style={m3Styles.row}>
      <M3IconBadge icon={icon} active={connected} />
      <View style={m3Styles.rowText}>
        <RNText style={m3Styles.rowLabel}>{label}</RNText>
        <RNText style={m3Styles.rowSub}>{connected ? connectedLabel : sub}</RNText>
      </View>
      <MdButton
        label={connected ? connectLabel : label}
        variant={connected ? "tonal" : "outlined"}
        icon={connected ? <M3Icon name="check" size={16} color={m3.color.onSecondaryContainer} /> : undefined}
        onPress={onToggle}
        accessibilityLabel={`${label} ${connectLabel}`}
        style={m3Styles.connectBtn}
      />
    </View>
  );
}

// 강조 색 (별빛 팔레트) — the segmented 시안/바이올렛 control from the capture.
function M3PaletteSeg({ palette, onSelect, labels }: { palette: AccentPalette; onSelect: (p: AccentPalette) => void; labels: Record<AccentPalette, string> }) {
  const opts: AccentPalette[] = ["cyan", "violet"];
  return (
    <View style={m3Styles.seg} accessibilityRole="radiogroup">
      {opts.map((key, i) => {
        const on = palette === key;
        return (
          <Pressable
            key={key}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            accessibilityLabel={labels[key]}
            onPress={() => onSelect(key)}
            style={[m3Styles.segBtn, i > 0 && m3Styles.segDivider, on && m3Styles.segBtnOn]}
          >
            {on ? <M3Icon name="check" size={16} color={m3.color.onSecondaryContainer} /> : null}
            <RNText style={[m3Styles.segLabel, { color: on ? m3.color.onSecondaryContainer : m3.color.onSurface }]}>{labels[key]}</RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

type SettingsActionButtonProps = {
  label: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  loading?: boolean;
  onPress?: () => void | Promise<void>;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
  /** Segmented/toggle membership — announces selected state to screen readers. */
  selected?: boolean;
};

function SettingsActionButton({
  label,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = "button",
  variant = "secondary",
  disabled,
  loading,
  onPress,
  style,
  full = true,
  selected,
}: SettingsActionButtonProps) {
  const isDisabled = disabled || loading;
  const labelColor = isDisabled
    ? withAlpha(deepSpace.text, 0.5)
    : variant === "primary"
      ? deepSpace.onMint
      : variant === "danger"
        ? deepSpace.textHi
        : deepSpace.text;

  return (
    <View
      style={[
        styles.settingsButton,
        full ? styles.settingsButtonFull : null,
        style,
        variant === "primary"
          ? styles.settingsButtonPrimary
          : variant === "danger"
            ? styles.settingsButtonDanger
            : styles.settingsButtonSecondary,
        isDisabled ? styles.settingsButtonDisabled : null,
      ]}
    >
      <TouchableOpacity
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: isDisabled, busy: loading, selected }}
        disabled={isDisabled}
        onPress={onPress ? () => void onPress() : undefined}
        style={styles.settingsButtonPressable}
        activeOpacity={0.78}
      >
        {loading ? <ActivityIndicator size="small" color={labelColor} /> : null}
        <Text style={[styles.settingsButtonLabel, { color: labelColor }]}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
}

function Button(props: SettingsActionButtonProps) {
  return <SettingsActionButton {...props} />;
}

type DisclosureSectionProps = {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  tone?: "brand" | "warning";
  children: ReactNode;
};

function DisclosureSection({
  title,
  expanded,
  onToggle,
  tone = "brand",
  children,
}: DisclosureSectionProps) {
  const borderStartColor = tone === "warning" ? semantic.warning : semantic.brand;
  const textColor: keyof typeof semantic = tone === "warning" ? "warning" : "brand";

  return (
    <View style={[styles.section, { borderStartColor }]}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={styles.disclosureHeader}
        activeOpacity={0.78}
      >
        <Text variant="caption" color={textColor} style={styles.sectionEyebrow}>
          {title}
        </Text>
        <Text variant="caption" color={textColor} style={styles.disclosureIndicator}>
          {expanded ? "-" : "+"}
        </Text>
      </TouchableOpacity>
      {expanded ? <View style={styles.disclosureBody}>{children}</View> : null}
    </View>
  );
}

export default function Settings() {
  const { t, i18n } = useTranslation("settings");
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const { mode, setMode } = useTheme();
  const dark = mode === "dark";
  const { density: crewDensity, setDensity: setCrewDensity } = useCrewDensity();
  const { features, setFeature, connections, setConnection, palette, setPalette } = useAppFeatures();

  const [busy, setBusy] = useState<string | null>(null);
  const [fullDeleteConfirm, setFullDeleteConfirm] = useState("");
  const [toast, setToast] = useState<SettingsToast | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  const [actionError, setActionError] = useState<ActionError>(null);
  const [dataDeleteStep, setDataDeleteStep] = useState<DataDeleteStep>("records");
  const [openDisclosures, setOpenDisclosures] = useState<Record<SettingsDisclosureKey, boolean>>({
    crew: false,
    data: false,
    language: false,
  });

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timeout);
  }, [toast]);

  if (loading) {
    const loadingBody = (
      <View style={styles.center}>
        <PremiumLoadingState message={t("loading")} />
      </View>
    );
    // rev2: settings is a windowed ROOT tab (dock visible, no top bar/companion).
    return isDeepSpaceUI() ? (
      <DeepSpaceScreen active="settings" header="none" variant="windowed">
        {loadingBody}
      </DeepSpaceScreen>
    ) : (
      <View style={styles.screen}>
        <View style={styles.glow} pointerEvents="none" />
        {loadingBody}
      </View>
    );
  }
  if (!userId) {
    return <Redirect href="/sign-in" />;
  }

  function confirm(message: string, onYes: () => Promise<void>): void {
    setPendingConfirm({ message, onYes });
  }

  // Surface a calm, product-tone failure with a retry. The raw error stays in
  // the console for debugging and never appears in the user-facing Alert text.
  function showActionError(
    context: string,
    error: unknown,
    title: string,
    body: string,
    retry?: () => void,
  ): void {
    console.warn(`[settings] ${context} failed`, error);
    setActionError({ title, body, retry });
  }

  function showSuccess(message: string): void {
    setToast({ tone: "success", message });
  }

  function runPendingConfirm(): void {
    const current = pendingConfirm;
    setPendingConfirm(null);
    if (current) void current.onYes();
  }

  function retryActionError(): void {
    const current = actionError;
    setActionError(null);
    current?.retry?.();
  }

  function toggleDisclosure(key: SettingsDisclosureKey): void {
    setOpenDisclosures((current) => ({ ...current, [key]: !current[key] }));
  }

  const featureOn = (key: FeatureKey): boolean => features[key];
  const toggleFeature = (key: FeatureKey) => setFeature(key, !features[key]);
  const toggleConnection = (key: ConnectionKey) => setConnection(key, !connections[key]);

  async function runDeleteKind(kind: "journal" | "note" | "audit_response", label: string) {
    if (!userId) return;
    setBusy(label);
    try {
      const n = await deleteRecordsByKind(userId, kind);
      showSuccess(t("deletedN", { n }));
    } catch (e) {
      showActionError(
        `deleteRecordsByKind(${kind})`,
        e,
        t("couldntDelete"),
        t("clearRecordsError"),
        () => void runDeleteKind(kind, label),
      );
    } finally {
      setBusy(null);
    }
  }

  async function runDeleteByTag(tags: string[], label: string) {
    if (!userId) return;
    setBusy(label);
    try {
      const n = await deleteRecordsByTag(userId, tags);
      showSuccess(t("deletedN", { n }));
    } catch (e) {
      showActionError(
        `deleteRecordsByTag(${tags.join(",")})`,
        e,
        t("couldntDelete"),
        t("clearResultsError"),
        () => void runDeleteByTag(tags, label),
      );
    } finally {
      setBusy(null);
    }
  }

  async function runDeleteWikiPages() {
    if (!userId) return;
    setBusy("wikiPages");
    try {
      const n = await deleteAllWikiPages(userId);
      showSuccess(t("deletedNWiki", { n }));
    } catch (e) {
      showActionError(
        "deleteAllWikiPages",
        e,
        t("couldntDelete"),
        t("clearWikiError"),
        () => void runDeleteWikiPages(),
      );
    } finally {
      setBusy(null);
    }
  }

  async function runDeleteUningestedSources() {
    if (!userId) return;
    setBusy("sources");
    try {
      const n = await deleteUningestedSources(userId);
      showSuccess(t("deletedNCaptures", { n }));
    } catch (e) {
      showActionError(
        "deleteUningestedSources",
        e,
        t("couldntDelete"),
        t("clearCapturesError"),
        () => void runDeleteUningestedSources(),
      );
    } finally {
      setBusy(null);
    }
  }

  async function runResetChatUsage() {
    if (!userId) return;
    setBusy("chat");
    try {
      const n = await deleteAllChatUsage(userId);
      showSuccess(t("resetNDays", { n }));
    } catch (e) {
      showActionError(
        "deleteAllChatUsage",
        e,
        t("couldntReset"),
        t("resetUsageError"),
        () => void runResetChatUsage(),
      );
    } finally {
      setBusy(null);
    }
  }

  async function runFullWipe() {
    if (!userId) return;
    setBusy("full");
    let routingAfterWipe = false;
    try {
      const result = await deleteAllUserData(userId);
      showSuccess(
        t("wipeComplete", { r: result.records, s: result.sources, w: result.wikiPages, u: result.chatUsage }),
      );
      setFullDeleteConfirm("");
      routingAfterWipe = true;
      setTimeout(() => router.replace("/capture"), 900);
    } catch (e) {
      showActionError(
        "deleteAllUserData",
        e,
        t("couldntWipe"),
        t("wipeRemainBody"),
        () => void runFullWipe(),
      );
    } finally {
      if (!routingAfterWipe) setBusy(null);
    }
  }

  // rev2: settings is a windowed ROOT tab — the dock stays visible, no top bar
  // and no companion header (sb-app §4: companion is capture/chat/records only).
  const Chrome = ({ children }: { children: ReactNode }) =>
    isDeepSpaceUI() ? (
      <DeepSpaceScreen active="settings" header="none" variant="windowed">
        {children}
      </DeepSpaceScreen>
    ) : (
      <View style={styles.screen}>
        <View style={styles.glow} pointerEvents="none" />
        {children}
      </View>
    );

  const paletteLabels: Record<AccentPalette, string> = {
    cyan: t("cyan"),
    violet: t("violet"),
  };

  return (
    <Chrome>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Legacy track keeps its pre-rev2 companion header EXACTLY (it is the
            live-pinned track); only the deep-space track trades it for the
            caption below (sb-app §4: no companion outside capture/chat/records). */}
        {!isDeepSpaceUI() && (
          <SecondbStatusHeader
            text={t("tuneSettings")}
            tip={
              t("deletionUndo")
            }
          />
        )}
        <RNText style={m3Styles.headline}>{t("settings")}</RNText>
        {/* Guidance line (kept from the companion era — OldGuidanceCopyResidue
            pins this SecondB-voiced wording; rev2 drops the header, not the copy). */}
        {isDeepSpaceUI() && (
          <Text variant="caption" color="textMuted" style={styles.guidance}>
            {t("subtitleFull")}
          </Text>
        )}

        {/* ── rev2 M3 toggle-card clone (모양 / 기능 / 데이터 연동) ── */}
        {/* 모양 */}
        <M3SectionLabel>{t("appearance")}</M3SectionLabel>
        <M3Group>
          <M3ToggleRow
            icon="bedtime"
            label={t("darkMode")}
            sub={t("deepSpaceTone")}
            checked={dark}
            onChange={(v) => setMode(v ? "dark" : "light")}
          />
          <M3Divider />
          <View style={m3Styles.row}>
            <M3IconBadge icon="auto_awesome" active={false} />
            <View style={m3Styles.rowText}>
              <RNText style={m3Styles.rowLabel}>{t("accentColor")}</RNText>
              <RNText style={m3Styles.rowSub}>{t("starlightPalette")}</RNText>
            </View>
            <M3PaletteSeg palette={palette} onSelect={setPalette} labels={paletteLabels} />
          </View>
        </M3Group>

        {/* 기능 */}
        <M3SectionLabel>{t("features")}</M3SectionLabel>
        <M3Group>
          <M3ToggleRow icon="auto_awesome" label={t("autoTagging")} sub={t("autoTaggingDesc")} checked={featureOn("autotag")} onChange={() => toggleFeature("autotag")} />
          <M3Divider />
          <M3ToggleRow icon="bubble_chart" label={t("suggestionAlerts")} sub={t("suggestionAlertsDesc")} checked={featureOn("notify")} onChange={() => toggleFeature("notify")} />
          <M3Divider />
          <M3ToggleRow icon="lock" label={t("appLock")} sub={t("appLockDesc")} checked={featureOn("applock")} onChange={() => toggleFeature("applock")} />
          <M3Divider />
          <M3ToggleRow icon="badge" label={t("onDeviceFirst")} sub={t("onDeviceFirstDesc")} checked={featureOn("ondevice")} onChange={() => toggleFeature("ondevice")} />
          <M3Divider />
          <M3ToggleRow
            icon="mic"
            label={t("callRecording")}
            sub={keepAllKo(t("callRecordingDesc"))}
            subAccessibilityLabel={t("callRecordingDesc")}
            checked={featureOn("callrec")}
            onChange={() => toggleFeature("callrec")}
          />
        </M3Group>

        {/* 데이터 연동 */}
        <M3SectionLabel action={<MdButton label={t("all")} variant="text" onPress={() => router.push("/integrations")} accessibilityLabel={t("allIntegrations")} />}>
          {t("dataConnections")}
        </M3SectionLabel>
        <M3Group>
          <M3ConnectRow icon="forum" label={t("googleCalendar")} sub={t("googleCalendarDesc")} connected={connections.cal} connectLabel={t("connected")} connectedLabel={t("connectedSyncing")} onToggle={() => toggleConnection("cal")} />
          <M3Divider />
          <M3ConnectRow icon="bedtime" label={t("appleHealth")} sub={t("appleHealthDesc")} connected={connections.health} connectLabel={t("connected")} connectedLabel={t("connectedSyncing")} onToggle={() => toggleConnection("health")} />
          <M3Divider />
          <M3ConnectRow icon="auto_stories" label="Notion" sub={t("importNotes")} connected={connections.notion} connectLabel={t("connected")} connectedLabel={t("connectedSyncing")} onToggle={() => toggleConnection("notion")} />
        </M3Group>

        {/* Destructive op in flight: a persistent banner explains why actions
            and sign-out are disabled, instead of letting the user escape a
            half-finished wipe by navigating away or signing out. */}
        {busy !== null ? (
          <View style={styles.busyBanner} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <Text variant="caption" color="textMuted">
              {t("workingPaused")}
            </Text>
          </View>
        ) : null}

        {/* O-R1 settings restructure (39-screen audit, 4.5/10: "25+ choices,
            no grouping"): the seven equal-weight nav buttons split into two
            scannable groups (Gestalt: same meaning, same cluster), and the
            "Theme (quick toggle)" disclosure is GONE — it duplicated the
            /theme page button two rows above it (same action, two places). */}
        <View style={styles.section}>
          <Text variant="caption" color="textMuted" style={styles.sectionEyebrow}>
            {t("myAccount")}
          </Text>
          <Button
            label={t("nav.profile")}
            accessibilityHint={t("nav.profileHint")}
            variant="secondary"
            onPress={() => router.push("/profile")}
          />
          <Button
            label={t("nav.privacy")}
            accessibilityHint={t("nav.privacyHint")}
            variant="secondary"
            onPress={() => router.push("/privacy")}
          />
          <Button
            label={t("nav.account")}
            accessibilityHint={t("nav.accountHint")}
            variant="secondary"
            onPress={() => router.push("/account")}
          />
        </View>

        <View style={styles.section}>
          <Text variant="caption" color="textMuted" style={styles.sectionEyebrow}>
            {t("app")}
          </Text>
          <Button
            label={t("nav.theme")}
            accessibilityHint={t("nav.themeHint")}
            variant="secondary"
            onPress={() => router.push("/theme")}
          />
          {/* Screen-Spec 09: 코치마크 리셋 — clears the seen flag and returns
              home so the 4-step guide plays again immediately. */}
          <Button
            label={t("resetCoachmarks")}
            accessibilityHint={
              t("resetCoachmarksDesc")
            }
            variant="secondary"
            onPress={() => {
              resetCoachmarks();
              router.replace("/");
            }}
          />
          <Button
            label={t("nav.data")}
            accessibilityHint={t("nav.dataHint")}
            variant="secondary"
            onPress={() => router.push("/data")}
          />
          <Button
            label={t("nav.records")}
            accessibilityHint={t("nav.recordsHint")}
            variant="secondary"
            onPress={() => router.push("/records")}
          />
          <Button
            label={t("nav.support")}
            accessibilityHint={t("nav.supportHint")}
            variant="secondary"
            onPress={() => router.push("/support")}
          />
        </View>

        {/* O-31 Stage③ (nav-contract §3): in deep-space mode, surface the full
            설정 second-tier so 요금제 /plans, 권한 /permissions, 운영진단 /ops
            (no legacy nav button) are reachable directly from 설정 (누락 0).
            Legacy mode renders nothing here — the sections above are its nav. */}
        {isDeepSpaceUI() ? (
          <DeepSpaceLinks
            groups={[
              {
                title: t("settings"),
                items: [
                  { key: "account", label: t("account"), route: "/account" },
                  { key: "plans", label: t("plans"), route: "/plans" },
                  { key: "privacy", label: t("privacy"), route: "/privacy" },
                  { key: "permissions", label: t("permissions"), route: "/permissions" },
                  { key: "data", label: t("data"), route: "/data" },
                  { key: "theme", label: t("theme"), route: "/theme" },
                  { key: "support", label: t("support"), route: "/support" },
                  { key: "manual", label: t("manual"), route: "/manual" },
                  { key: "integrations", label: t("integrations"), route: "/integrations" },
                  { key: "museum", label: t("aiMuseum"), route: "/museum" },
                  { key: "ops", label: t("routines"), route: "/ops" },
                ],
              },
            ]}
          />
        ) : null}

        <DisclosureSection
          // O-R2 (2) language-pack infra: first in-app language switch for
          // signed-in users (auth screens had a toggle, settings had none).
          // Renders from AVAILABLE_UI_LOCALES - options appear as packs ship.
          title={t("language.title")}
          expanded={openDisclosures.language}
          onToggle={() => toggleDisclosure("language")}
        >
          <Text variant="subtle" color="textMuted">
            {t("language.body")}
          </Text>
          <View style={styles.crewRow}>
            {AVAILABLE_UI_LOCALES.map((code, index) => {
              const meta = UI_LOCALE_META[code];
              const optionLabel = meta.beta ? `${meta.nativeName} ${t("language.betaTag")}` : meta.nativeName;
              const isActive = i18n.language === code;
              return (
                <Button
                  key={code}
                  label={optionLabel}
                  accessibilityRole="radio"
                  accessibilityLabel={t("language.optionA11yLabel", {
                    label: optionLabel,
                    index: index + 1,
                    total: AVAILABLE_UI_LOCALES.length,
                    state: isActive ? t("language.stateSelected") : t("language.stateAvailable"),
                  })}
                  accessibilityHint={t("language.useLanguageHint", { label: optionLabel })}
                  variant={isActive ? "primary" : "secondary"}
                  selected={isActive}
                  onPress={() => {
                    void i18n.changeLanguage(code);
                  }}
                  full={false}
                />
              );
            })}
          </View>
        </DisclosureSection>

        <DisclosureSection
          title={t("graphCrew")}
          expanded={openDisclosures.crew}
          onToggle={() => toggleDisclosure("crew")}
        >
          <Text variant="subtle" color="textMuted">
            {t("graphCrewDesc")}
          </Text>
          <View style={styles.crewRow}>
            {CREW_DENSITY_ORDER.map((d) => (
              <Button
                key={d}
                label={CREW_DENSITY_LABEL[locale][d]}
                accessibilityHint={t("actions.crewDensityHint", { density: CREW_DENSITY_LABEL[locale][d] })}
                variant={crewDensity === d ? "primary" : "secondary"}
                selected={crewDensity === d}
                onPress={() => setCrewDensity(d)}
                full={false}
              />
            ))}
          </View>
        </DisclosureSection>

        <DisclosureSection
          // Was titled identically to the nav.data button above (two controls,
          // same name, different destinations — audit confusion finding).
          title={t("deleteData")}
          expanded={openDisclosures.data}
          onToggle={() => toggleDisclosure("data")}
          tone="warning"
        >
          <Text variant="subtle" color="textMuted">
            {t("dataWizard.body")}
          </Text>
          <View style={styles.deleteWizardGrid}>
            {DATA_DELETE_STEPS.map((step, index) => {
              const stepSelected = dataDeleteStep === step;
              const stepLabel = t(`dataWizard.${step}.label`);
              return (
                <Button
                  key={step}
                  label={stepLabel}
                  accessibilityRole="radio"
                  accessibilityLabel={t("dataWizard.optionA11yLabel", {
                    label: stepLabel,
                    index: index + 1,
                    total: DATA_DELETE_STEPS.length,
                    state: stepSelected ? t("dataWizard.stateSelected") : t("dataWizard.stateAvailable"),
                  })}
                  accessibilityHint={stepSelected ? t("dataWizard.selectedHint") : t(`dataWizard.${step}.hint`)}
                  variant={stepSelected ? (step === "full" ? "danger" : "primary") : "secondary"}
                  selected={stepSelected}
                  onPress={() => setDataDeleteStep(step)}
                  full={false}
                  style={styles.deleteWizardOption}
                />
              );
            })}
          </View>
          <Text variant="subtle" color={dataDeleteStep === "full" ? "danger" : "textMuted"}>
            {t(`dataWizard.${dataDeleteStep}.body`)}
          </Text>

          {dataDeleteStep === "records" ? (
          <View style={styles.destructiveGroup}>
            <Text variant="caption" color="warning" style={styles.sectionEyebrow}>
              {t("partialByKind")}
            </Text>
            <Text variant="subtle" color="textMuted">
              {t("partialByKindDesc")}
            </Text>
            <Button
              label={t("delAllJournals")}
              accessibilityHint={t("actions.deleteJournalsHint")}
              variant="danger"
              disabled={busy !== null}
              onPress={() =>
                confirm(
                  t("delAllJournalsDesc"),
                  () => runDeleteKind("journal", "journal"),
                )
              }
            />
            <Button
              label={t("delAllNotes")}
              accessibilityHint={t("actions.deleteNotesHint")}
              variant="danger"
              disabled={busy !== null}
              onPress={() =>
                confirm(
                  t("delAllNotesDesc"),
                  () => runDeleteKind("note", "note"),
                )
              }
            />
            <Button
              label={t("delAudit")}
              accessibilityHint={t("actions.deleteAuditHint")}
              variant="danger"
              disabled={busy !== null}
              onPress={() =>
                confirm(
                  t("delAuditDesc"),
                  () => runDeleteKind("audit_response", "audit"),
                )
              }
            />
          </View>
          ) : null}

          {dataDeleteStep === "assessments" ? (
          <View style={styles.destructiveGroup}>
            <Text variant="caption" color="warning" style={styles.sectionEyebrow}>
              {t("partialByAssessment")}
            </Text>
            <Button
              label={t("delBigFive")}
              accessibilityHint={t("actions.deleteBfiHint")}
              variant="danger"
              disabled={busy !== null}
              onPress={() =>
                confirm(
                  t("delBigFiveDesc"),
                  () => runDeleteByTag(["bfi", "tipi"], "bfi"),
                )
              }
            />
            <Button
              label={t("delEcr")}
              accessibilityHint={t("actions.deleteEcrHint")}
              variant="danger"
              disabled={busy !== null}
              onPress={() =>
                confirm(
                  t("delEcrDesc"),
                  () => runDeleteByTag(["ecr"], "ecr"),
                )
              }
            />
            <Button
              label={t("delMbti")}
              accessibilityHint={t("actions.deleteMbtiHint")}
              variant="danger"
              disabled={busy !== null}
              onPress={() =>
                confirm(
                  t("delMbtiDesc"),
                  () => runDeleteByTag(["mbti"], "mbti"),
                )
              }
            />
          </View>
          ) : null}

          {dataDeleteStep === "library" ? (
          <View style={styles.destructiveGroup}>
            <Text variant="caption" color="warning" style={styles.sectionEyebrow}>
              {t("partialWiki")}
            </Text>
            <Button
              label={t("delAllWiki")}
              accessibilityHint={t("actions.deleteWikiHint")}
              variant="danger"
              disabled={busy !== null}
              onPress={() =>
                confirm(
                  t("delAllWikiDesc"),
                  () => runDeleteWikiPages(),
                )
              }
            />
            <Button
              label={t("delUningested")}
              accessibilityHint={t("actions.deleteUningestedHint")}
              variant="danger"
              disabled={busy !== null}
              onPress={() =>
                confirm(
                  t("delUningestedDesc"),
                  () => runDeleteUningestedSources(),
                )
              }
            />
            <Button
              label={t("resetDaily")}
              accessibilityHint={t("actions.resetUsageHint")}
              variant="danger"
              disabled={busy !== null}
              onPress={() =>
                confirm(
                  t("resetDailyDesc"),
                  () => runResetChatUsage(),
                )
              }
            />
          </View>
          ) : null}

          {dataDeleteStep === "full" ? (
          <View style={styles.destructiveGroup}>
            <Text variant="caption" color="danger" style={styles.sectionEyebrow}>
              {t("dangerFullWipe")}
            </Text>
            <Text variant="subtle" color="textMuted">
              {t("dangerFullWipeDesc")}
            </Text>
            <Text variant="subtle" color="textMuted">
              {t("dataWizard.full.retained")}
            </Text>
            <Text variant="subtle" color="danger">
              {t("cannotUndoExport")}
            </Text>
            <Text variant="subtle" color="textMuted">
              {locale === "ko" ? `진행하려면 "${CONFIRM_PHRASE}" 라고 입력하세요.` : `To proceed, type "${CONFIRM_PHRASE}" below.`}
            </Text>
            <Input
              value={fullDeleteConfirm}
              onChangeText={setFullDeleteConfirm}
              placeholder={CONFIRM_PHRASE}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel={t("actions.fullWipeInputLabel", { phrase: CONFIRM_PHRASE })}
            />
            <Button
              label={t("deleteEverything")}
              accessibilityHint={t("actions.fullWipeHint")}
              variant="danger"
              disabled={fullDeleteConfirm !== CONFIRM_PHRASE || busy !== null}
              loading={busy === "full"}
              onPress={() =>
                confirm(
                  t("finalCheck"),
                  () => runFullWipe(),
                )
              }
            />
          </View>
          ) : null}
        </DisclosureSection>

        <View style={styles.actions}>
          <Button
            label={t("signOut")}
            accessibilityHint={t("actions.signOutHint")}
            variant="secondary"
            disabled={busy !== null}
            onPress={async () => {
              try {
                await signOut();
                // Go straight to /sign-in. Routing via "/" could briefly render
                // with a stale session before the SIGNED_OUT event lands.
                router.replace("/sign-in");
              } catch (e) {
                showActionError(
                  "signOut",
                  e,
                  t("couldntSignOut"),
                  t("signOutError"),
                );
              }
            }}
          />
        </View>

        <Text variant="caption" color="textMuted" style={styles.buildMarker}>
          {t("buildInfo")}
        </Text>
      </ScrollView>
</KeyboardAvoidingView>
      {toast ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <PremiumToast message={toast.message} tone={toast.tone} />
        </View>
      ) : null}
      <PremiumModal
        visible={pendingConfirm !== null}
        onClose={() => setPendingConfirm(null)}
        accessibilityLabel={t("modals.confirm.label")}
      >
        <Text variant="heading">{t("modals.confirm.title")}</Text>
        <Text variant="body" color="textMuted" style={styles.modalBody}>
          {pendingConfirm?.message}
        </Text>
        <View style={styles.modalActions}>
          <Button
            label={t("modals.confirm.cancel")}
            variant="secondary"
            onPress={() => setPendingConfirm(null)}
            style={styles.modalButton}
            accessibilityHint={t("modals.confirm.cancelHint")}
          />
          <Button
            label={t("modals.confirm.delete")}
            variant="danger"
            onPress={runPendingConfirm}
            loading={busy !== null}
            style={styles.modalButton}
            accessibilityHint={t("modals.confirm.deleteHint")}
          />
        </View>
      </PremiumModal>
      <PremiumModal
        visible={actionError !== null}
        onClose={() => setActionError(null)}
        accessibilityLabel={t("modals.feedback.label")}
      >
        <Text variant="heading">{actionError?.title}</Text>
        <Text variant="body" color="textMuted" style={styles.modalBody}>
          {actionError?.body}
        </Text>
        <View style={styles.modalActions}>
          <Button
            label={t("modals.feedback.dismiss")}
            variant="secondary"
            onPress={() => setActionError(null)}
            style={styles.modalButton}
            accessibilityHint={t("modals.feedback.dismissHint")}
          />
          {actionError?.retry ? (
            <Button
              label={t("modals.feedback.retry")}
              variant="primary"
              onPress={retryActionError}
              loading={busy !== null}
              style={styles.modalButton}
              accessibilityHint={t("modals.feedback.retryHint")}
            />
          ) : null}
        </View>
      </PremiumModal>
    </Chrome>
  );
}

const koType = (size: number, line: number, tracking: number, weight: TextStyle["fontWeight"]): TextStyle => ({
  fontFamily: fontFamilies.sans,
  fontSize: size,
  lineHeight: line,
  letterSpacing: tracking,
  fontWeight: weight,
});

const m3Styles = StyleSheet.create({
  headline: { ...koType(24, 32, 0, "600"), color: m3.color.onSurface, marginTop: m3.spacing.s2, marginBottom: m3.spacing.s1 },
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: m3.spacing.s5,
    marginBottom: m3.spacing.s3,
  },
  sectionLabel: { ...koType(14, 20, 0.1, "500"), color: m3.color.onSurfaceVariant },
  card: { backgroundColor: m3.color.surfaceContainerHighest, borderRadius: m3.shape.medium, padding: m3.spacing.s1 },
  divider: { height: 1, backgroundColor: m3.color.outlineVariant, marginHorizontal: m3.spacing.s3 },
  row: { flexDirection: "row", alignItems: "center", gap: m3.spacing.s3, paddingVertical: m3.spacing.s3, paddingHorizontal: m3.spacing.s3 },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { ...koType(16, 22, 0.15, "400"), color: m3.color.onSurface },
  rowSub: { ...koType(12, 16, 0.3, "400"), color: m3.color.onSurfaceVariant, marginTop: 1 },
  iconBadge: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  switchTrack: { width: 52, height: 32, borderRadius: 9999, borderWidth: 2, justifyContent: "center" },
  switchThumb: { position: "absolute", borderRadius: 9999 },
  connectBtn: { minHeight: 36, paddingHorizontal: m3.spacing.s4 },
  seg: { flexDirection: "row", borderWidth: 1, borderColor: m3.color.outline, borderRadius: m3.shape.small, overflow: "hidden" },
  segBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36 },
  segBtnOn: { backgroundColor: m3.color.secondaryContainer },
  segDivider: { borderLeftWidth: 1, borderLeftColor: m3.color.outline },
  segLabel: { ...koType(13, 16, 0.1, "500") },
});

const styles = StyleSheet.create({
  // Deep-space shell (replaces the legacy PremiumAppShell light cosmic body).
  screen: { flex: 1, backgroundColor: deepSpace.bg },
  glow: { position: "absolute", top: 0, left: 0, right: 0, height: 200, backgroundColor: deepSpace.bgGlow },
  center: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: spacing.lg },
  header: { gap: spacing.xs, marginBottom: spacing.md },
  title: { fontSize: 20, color: deepSpace.textHi, marginBottom: spacing.xs },
  guidance: { marginTop: -6, marginBottom: spacing.xs },
  section: {
    backgroundColor: deepSpace.card,
    borderColor: deepSpace.cardLine,
    borderWidth: 1,
    borderRadius: deepSpaceRadii.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionEyebrow: { letterSpacing: 0, fontWeight: "700" },
  disclosureHeader: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  disclosureHeaderPressed: {
    opacity: 0.78,
  },
  disclosureIndicator: {
    minWidth: 24,
    textAlign: "right",
    fontWeight: "800",
  },
  disclosureBody: {
    gap: spacing.sm,
  },
  destructiveGroup: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: deepSpace.cardLine,
  },
  deleteWizardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  deleteWizardOption: {
    flexGrow: 1,
    flexBasis: "47%",
    minWidth: 148,
  },
  busyBanner: {
    backgroundColor: deepSpace.card,
    borderColor: deepSpace.cardLine,
    borderWidth: 1,
    borderRadius: deepSpaceRadii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  settingsButton: {
    minHeight: 48,
    borderRadius: deepSpaceRadii.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  settingsButtonFull: {
    alignSelf: "stretch",
    width: "100%",
  },
  settingsButtonPressable: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  settingsButtonPrimary: {
    backgroundColor: deepSpace.mint,
    borderColor: deepSpace.mint,
  },
  settingsButtonSecondary: {
    backgroundColor: deepSpace.card,
    borderColor: deepSpace.cardLineStrong,
  },
  settingsButtonDanger: {
    backgroundColor: semantic.zoneRed,
    borderColor: semantic.zoneRed,
  },
  settingsButtonDisabled: {
    backgroundColor: withAlpha(deepSpace.text, 0.08),
    borderColor: deepSpace.cardLine,
  },
  settingsButtonPressed: {
    opacity: 0.78,
  },
  settingsButtonLabel: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "center",
    fontFamily: fontFamilies.pixelKo,
  },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  toastWrap: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.xl, alignItems: "stretch" },
  modalBody: { lineHeight: 21 },
  modalActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  modalButton: { flex: 1 },
  crewRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  buildMarker: { marginTop: spacing.md, textAlign: "center", opacity: 0.6 },
});
