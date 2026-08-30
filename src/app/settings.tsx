// Settings screen — rev2 M3 toggle-card top (모양 / 기능 / 데이터 연동, cloned
// 1:1 from reference-app SettingsScreen + docs/clone-audit capture 09-settings)
// over the retained functional settings surface (account nav, language,
// the one-area-at-a-time data-delete danger zone, sign-out).
// The M3 rows are the capture-matching visuals; the sections below carry the
// account/data/language/danger-zone behavior and localized helper copy.

import { type ReactNode, useCallback, useEffect, useState } from "react";

import { isDevSurfaceEnabled } from "@/lib/dev/gate";
import { reactExpression } from "@/lib/companion/expression";
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
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { canonGlyph } from "@/components/pixel/pixel-glyphs";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { PremiumLoadingState, PremiumModal, PremiumToast } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Input } from "@/components/ui/Input";
import { MdButton } from "@/components/m3";
import { m3TextStyle } from "@/components/m3/typeface";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { deepSpace, flattenAlpha, semantic, spacing } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { fontFamilies } from "@/theme/typography";
import { useAuth } from "@/lib/auth/AuthContext";
import { useTheme } from "@/lib/theme/ThemeContext";
import { signOut } from "@/lib/supabase/auth";
import { isDeepSpaceUI } from "@/lib/ui-mode";
// Direct module import (NOT the components/deepspace barrel) — the barrel has a
// known require cycle that crashed the /settings path once already (PR 711).
import { SecondbStatusHeader } from "@/components/deep-space/SecondbStatusHeader";
import { AVAILABLE_UI_LOCALES, UI_LOCALE_META, type AvailableUiLocale } from "@/lib/i18n/locales";
import { resetCoachmarks } from "@/lib/onboarding/coachmarks-gate";
import { buildInfoLine } from "@/lib/build-info";
import {
  DEFAULT_WIKI_AUTO_PROMOTE,
  getWikiAutoPromote,
  setWikiAutoPromote,
} from "@/lib/wiki/auto-promote";
import { useNoticeCenter } from "@/app/notices";
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
type SettingsDisclosureKey = "data" | "language";
type DataDeleteStep = "records" | "assessments" | "library" | "full";

const DATA_DELETE_STEPS: DataDeleteStep[] = ["records", "assessments", "library", "full"];

const SETTINGS_SURFACE_COPY: Record<
  AvailableUiLocale,
  {
    news: string;
    notices: string;
    noticesSub: string;
    reasoning: string;
    reasoningSub: string;
    wikiAuto: string;
    wikiAutoSub: string;
    devScreens: string;
    devScreensSub: string;
  }
> = {
  en: {
    news: "News",
    notices: "Notices",
    noticesSub: "Patch notes · developer news",
    reasoning: "Reasoning",
    reasoningSub: "Automatic runs · item selection",
    wikiAuto: "Auto wiki pages",
    wikiAutoSub: "Turn new captures into wiki pages by themselves",
    devScreens: "Developer",
    devScreensSub: "Open every screen directly",
  },
  ko: {
    news: "소식",
    notices: "공지사항",
    noticesSub: "패치노트 · 개발자 소식",
    reasoning: "리즈닝",
    reasoningSub: "자동 실행 · 자료 선택",
    wikiAuto: "위키 자동 만들기",
    wikiAutoSub: "새로 담은 자료를 알아서 위키 페이지로 만들어요",
    devScreens: "개발자",
    devScreensSub: "모든 화면에 바로 들어가기",
  },
  es: {
    news: "Novedades",
    notices: "Avisos",
    noticesSub: "Notas de versión · noticias del desarrollador",
    reasoning: "Razonamiento",
    reasoningSub: "Ejecuciones automáticas · selección de material",
    wikiAuto: "Páginas wiki automáticas",
    wikiAutoSub: "Convierte las capturas nuevas en páginas wiki",
    devScreens: "Desarrollador",
    devScreensSub: "Abre cualquier pantalla directamente",
  },
  pt: {
    news: "Novidades",
    notices: "Avisos",
    noticesSub: "Notas de versão · notícias do desenvolvedor",
    reasoning: "Raciocínio",
    reasoningSub: "Execuções automáticas · seleção de material",
    wikiAuto: "Páginas wiki automáticas",
    wikiAutoSub: "Transforma capturas novas em páginas wiki",
    devScreens: "Desenvolvedor",
    devScreensSub: "Abra qualquer tela diretamente",
  },
  id: {
    news: "Kabar baru",
    notices: "Pemberitahuan",
    noticesSub: "Catatan rilis · kabar pengembang",
    reasoning: "Penalaran",
    reasoningSub: "Jalankan otomatis · pilih materi",
    wikiAuto: "Halaman wiki otomatis",
    wikiAutoSub: "Ubah tangkapan baru menjadi halaman wiki",
    devScreens: "Pengembang",
    devScreensSub: "Buka layar mana pun secara langsung",
  },
};

// ── M3 toggle-card kit (rev2 clone) ───────────────────────────────────────
//
// 아이콘 좌표는 여기 없다 — `components/pixel/pixel-glyphs.ts` 가 정본이다.
// 원래 이 자리에 `ICON_PATHS` 라는 열다섯 개짜리 문자열 SVG 레지스트리가 있었다.
// 저장소에서 **다섯 번째**였고, 열다섯 중 열셋이 다른 레지스트리와 같은 아이콘을
// 각자 다른 곡선으로 그리고 있었다(같은 `bedtime` 이 네 벌 있었다).
//
// `name` 을 좁은 union 으로 두지 않는 이유: 이 화면은 설정 행 정의에서 이름을
// 받아 오고 그중 일부는 캐논에서 온다. 모르는 이름이 오면 예외 대신 눈에 보이는
// 대체 표시로 떨어지는 편이 낫다 — `canonGlyph()` 가 그 판단을 한 곳에서 한다.
function M3Icon({ name, color, size = 20 }: { name: string; color: string; size?: number; fill?: boolean }) {
  // `fill` 은 받기만 하고 아무 일도 하지 않는다. 전에는 채움/선을 갈랐지만 rect
  // 글리프는 언제나 채워져 있어 그 구분이 없어졌다(강조는 색이 한다).
  return <PixelGlyph name={canonGlyph(name)} color={color} size={size} />;
}

// M3 Switch (1:1 from reference-app MdSwitch): 52×32 track, 2dp border, thumb
// 16→24. Colors via m3.color tokens (no hex). Announces switch role + checked.
function M3Switch({ checked, onChange, accessibilityLabel }: { checked: boolean; onChange: (v: boolean) => void; accessibilityLabel?: string }) {
  if (isDeepSpaceUI()) {
    return (
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked }}
        accessibilityLabel={accessibilityLabel}
        onPress={() => onChange(!checked)}
        hitSlop={12}
        style={m3Styles.pixelSwitchPressable}
      >
        <PixelSurface
          variant={checked ? "bevel" : "inset"}
          background={checked ? m3.color.primaryContainer : m3.color.surfaceVariant}
          contentStyle={m3Styles.pixelSwitchContent}
        >
          <View
            style={[
              m3Styles.pixelSwitchThumb,
              checked ? m3Styles.pixelSwitchThumbChecked : m3Styles.pixelSwitchThumbOff,
            ]}
          />
        </PixelSurface>
      </Pressable>
    );
  }
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
  if (isDeepSpaceUI()) {
    return (
      <PixelSurface
        variant={active ? "bevel" : "inset"}
        background={active ? m3.color.primaryContainer : m3.color.surfaceVariant}
        style={m3Styles.pixelIconBadge}
        contentStyle={m3Styles.pixelIconBadgeContent}
      >
        <M3Icon name={icon} fill={active} color={active ? m3.color.onPrimaryContainer : m3.color.onSurfaceVariant} />
      </PixelSurface>
    );
  }
  return (
    <View style={[m3Styles.iconBadge, { backgroundColor: active ? m3.color.primary : m3.color.surfaceContainerHighest }]}>
      <M3Icon name={icon} fill={active} color={active ? m3.color.onPrimary : m3.color.onSurfaceVariant} />
    </View>
  );
}

function M3SectionLabel({ children, action }: { children: string; action?: ReactNode }) {
  const pixel = isDeepSpaceUI();
  return (
    <View style={m3Styles.sectionLabelRow}>
      <RNText style={[m3Styles.sectionLabel, pixel ? m3Styles.pixelSectionLabel : null]}>{children}</RNText>
      {action}
    </View>
  );
}

function M3Group({ children }: { children: ReactNode }) {
  if (isDeepSpaceUI()) {
    return (
      <PixelSurface variant="bevel" style={m3Styles.pixelGroup} contentStyle={m3Styles.pixelGroupContent}>
        {children}
      </PixelSurface>
    );
  }
  return <View style={m3Styles.card}>{children}</View>;
}
function M3Divider() {
  return <View style={[m3Styles.divider, isDeepSpaceUI() ? m3Styles.pixelDivider : null]} />;
}

function M3ToggleRow({ icon, label, sub, subAccessibilityLabel, checked, onChange }: { icon: string; label: string; sub: string; subAccessibilityLabel?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const pixel = isDeepSpaceUI();
  return (
    <View style={[m3Styles.row, pixel ? m3Styles.pixelRow : null]}>
      <M3IconBadge icon={icon} active={checked} />
      <View style={m3Styles.rowText}>
        <RNText style={[m3Styles.rowLabel, pixel ? m3Styles.pixelRowLabel : null]}>{label}</RNText>
        {/* subAccessibilityLabel: when sub went through keepAllKo, screen readers
            get the raw string (U+2060 joiners disorient braille / char review). */}
        <RNText style={[m3Styles.rowSub, pixel ? m3Styles.pixelRowSub : null]} accessibilityLabel={subAccessibilityLabel}>{sub}</RNText>
      </View>
      <M3Switch checked={checked} onChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

// Navigation row (replaces M3ConnectRow): the old rows flipped a LOCAL boolean
// and rendered "연결됨·동기화 중" — no account link, no sync, ever (audit
// pattern A, fake success). Until a real per-source connector exists, settings
// hands off honestly to the import/integration surfaces instead of claiming a
// state that isn't there.
function M3LinkRow({ icon, label, sub, badge, onPress }: { icon: string; label: string; sub?: string; badge?: number; onPress: () => void }) {
  const [held, setHeld] = useState(false);
  const pixel = isDeepSpaceUI();
  return (
    <Pressable
      style={[m3Styles.row, pixel ? m3Styles.pixelRow : null, pixel && held ? m3Styles.pixelRowPressed : null]}
      onPress={onPress}
      onPressIn={() => setHeld(true)}
      onPressOut={() => setHeld(false)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={sub}
    >
      <M3IconBadge icon={icon} active={false} />
      <View style={m3Styles.rowText}>
        <RNText style={[m3Styles.rowLabel, pixel ? m3Styles.pixelRowLabel : null]}>{label}</RNText>
        {sub ? <RNText style={[m3Styles.rowSub, pixel ? m3Styles.pixelRowSub : null]}>{sub}</RNText> : null}
      </View>
      {badge && badge > 0 ? (
        <View style={m3Styles.rowBadge}>
          <RNText style={[m3Styles.rowBadgeText, pixel ? m3Styles.pixelRowBadgeText : null]}>{badge}</RNText>
        </View>
      ) : null}
      <M3Icon name="chevron_right" size={20} color={m3.color.onSurfaceVariant} />
    </Pressable>
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
  const [held, setHeld] = useState(false);
  const isDisabled = disabled || loading;
  const labelColor = isDisabled
    ? BTN_DISABLED_LABEL
    : variant === "primary"
      ? deepSpace.onMint
      : variant === "danger"
        ? deepSpace.textHi
        : deepSpace.text;

  if (isDeepSpaceUI()) {
    const background = isDisabled
      ? BTN_DISABLED_BG
      : variant === "primary"
        ? deepSpace.mint
        : variant === "danger"
          ? semantic.zoneRed
          : m3.color.surfaceContainerHigh;
    return (
      <Pressable
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: isDisabled, busy: loading, selected }}
        disabled={isDisabled}
        onPress={onPress ? () => void onPress() : undefined}
        onPressIn={() => setHeld(true)}
        onPressOut={() => setHeld(false)}
        style={[styles.pixelButtonRoot, full ? styles.settingsButtonFull : null, style]}
      >
        <View style={held ? styles.pixelButtonHeld : null}>
          <PixelSurface
            variant={isDisabled ? "frame" : "bevel"}
            pressed={held && !isDisabled}
            background={background}
            style={styles.pixelButtonSurface}
            contentStyle={styles.pixelButtonContent}
          >
            {loading ? <ActivityIndicator size="small" color={labelColor} /> : null}
            <Text style={[styles.pixelButtonLabel, { color: labelColor }]}>{label}</Text>
          </PixelSurface>
        </View>
      </Pressable>
    );
  }

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
  const [held, setHeld] = useState(false);
  const pixel = isDeepSpaceUI();
  const borderStartColor = tone === "warning" ? semantic.warning : semantic.brand;
  const textColor: keyof typeof semantic = tone === "warning" ? "warning" : "brand";
  const contents = (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded }}
        onPress={onToggle}
        onPressIn={() => setHeld(true)}
        onPressOut={() => setHeld(false)}
        style={[
          styles.disclosureHeader,
          held
            ? pixel
              ? styles.pixelDisclosureHeaderPressed
              : styles.disclosureHeaderPressed
            : null,
        ]}
      >
        <Text variant="caption" color={textColor} style={styles.sectionEyebrow}>
          {title}
        </Text>
        <Text variant="caption" color={textColor} style={styles.disclosureIndicator}>
          {expanded ? "-" : "+"}
        </Text>
      </Pressable>
      {expanded ? <View style={styles.disclosureBody}>{children}</View> : null}
    </>
  );

  if (pixel) {
    return (
      <PixelSurface
        variant="frame"
        background={m3.color.surfaceContainer}
        style={styles.pixelDisclosure}
        contentStyle={styles.pixelDisclosureContent}
      >
        <View pointerEvents="none" style={[styles.pixelDisclosureTone, { backgroundColor: borderStartColor }]} />
        {contents}
      </PixelSurface>
    );
  }

  return (
    <View style={[styles.section, { borderStartColor }]}>
      {contents}
    </View>
  );
}

export default function Settings() {
  const { t, i18n } = useTranslation("settings");
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const displayLocale = AVAILABLE_UI_LOCALES.includes(i18n.language as AvailableUiLocale)
    ? (i18n.language as AvailableUiLocale)
    : "en";
  const { mode, setMode } = useTheme();
  const dark = mode === "dark";
  const noticeCenter = useNoticeCenter(userId);

  // Wiki auto-promotion. Server-persisted (users.reasoning_prefs.wikiAuto) so the
  // policy does not silently differ per device — the exact failure 0093 fixed for
  // its sibling toggle. Optimistic: the switch moves immediately and the write is
  // fail-soft, so a network blip never eats the tap.
  const [wikiAutoPromote, setWikiAutoPromoteState] = useState(DEFAULT_WIKI_AUTO_PROMOTE);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void getWikiAutoPromote(userId).then((v) => {
      if (alive) setWikiAutoPromoteState(v);
    });
    return () => {
      alive = false;
    };
  }, [userId]);
  const onToggleWikiAutoPromote = useCallback(
    (next: boolean) => {
      if (!userId) return;
      setWikiAutoPromoteState(next);
      void setWikiAutoPromote(userId, next);
    },
    [userId],
  );

  const [busy, setBusy] = useState<string | null>(null);
  const [fullDeleteConfirm, setFullDeleteConfirm] = useState("");
  const [toast, setToast] = useState<SettingsToast | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  const [actionError, setActionError] = useState<ActionError>(null);
  const [dataDeleteStep, setDataDeleteStep] = useState<DataDeleteStep>("records");
  const [openDisclosures, setOpenDisclosures] = useState<Record<SettingsDisclosureKey, boolean>>({
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

  async function runDeleteKind(kind: "journal" | "note" | "audit_response", label: string) {
    if (!userId) return;
    setBusy(label);
    try {
      const n = await deleteRecordsByKind(userId, kind);
      reactExpression("sad"); // 데이터가 지워졌다 — the head registers the loss
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
      reactExpression("sad"); // 데이터가 지워졌다 — the head registers the loss
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
      reactExpression("sad");
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
      reactExpression("sad");
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

  const newSurfaceCopy = SETTINGS_SURFACE_COPY[displayLocale];

  return (
    <Chrome>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, isDeepSpaceUI() ? styles.pixelScroll : null]}
          keyboardShouldPersistTaps="handled"
        >
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
        <RNText style={[m3Styles.headline, isDeepSpaceUI() ? m3Styles.pixelHeadline : null]}>{t("settings")}</RNText>
        {/* Guidance line (kept from the companion era — OldGuidanceCopyResidue
            pins this SecondB-voiced wording; rev2 drops the header, not the copy). */}
        {isDeepSpaceUI() && (
          <Text variant="caption" color="textMuted" style={styles.guidance}>
            {t("subtitleFull")}
          </Text>
        )}

        {/* PIXEL-CLAY reference starts with identity. We keep the production
            profile route and user-owned data instead of importing its sample
            avatar/name. Legacy keeps the original lower navigation cluster. */}
        {isDeepSpaceUI() ? (
          <>
            <M3SectionLabel>{t("myAccount")}</M3SectionLabel>
            <M3Group>
              <M3LinkRow
                icon="person"
                label={t("nav.profile")}
                sub={t("nav.profileHint")}
                onPress={() => router.push("/profile")}
              />
            </M3Group>
          </>
        ) : null}

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
        </M3Group>

        {/* 소식 */}
        <M3SectionLabel>{newSurfaceCopy.news}</M3SectionLabel>
        <M3Group>
          <M3LinkRow
            icon="campaign"
            label={newSurfaceCopy.notices}
            sub={newSurfaceCopy.noticesSub}
            badge={noticeCenter.unreadCount}
            onPress={() => router.push("/notices")}
          />
        </M3Group>

        {/* 구독 — the entry point docs/legal/refund-policy.md has named since
            2026-07-17 ("앱 내 [설정 → 구독 관리]"). It is a link row, not a set of
            buttons: cancel and refund are consequential enough to deserve their
            own screen with the eligibility numbers next to them. */}
        <M3SectionLabel action={<MdButton label={t("plans")} variant="text" onPress={() => router.push("/plans")} accessibilityLabel={t("plans")} />}>
          {t("subscription.sectionLabel")}
        </M3SectionLabel>
        <M3Group>
          <M3LinkRow
            icon="credit_card"
            label={t("subscription.rowLabel")}
            sub={t("subscription.rowSub")}
            onPress={() => router.push("/subscription")}
          />
        </M3Group>

        {/* 기능 */}
        <M3SectionLabel>{t("features")}</M3SectionLabel>
        <M3Group>
          <M3LinkRow
            icon="bolt"
            label={newSurfaceCopy.reasoning}
            sub={newSurfaceCopy.reasoningSub}
            onPress={() => router.push("/reasoning")}
          />
          <M3Divider />
          {/* Not a placebo: the consumer is maybeAutoPromoteSource at the capture
              save path. OFF by default on cost grounds — promotion embeds the new
              page, one paid call per capture, and re-promoting re-bills. With it
              off the user promotes from the source's own detail screen instead. */}
          <M3ToggleRow
            icon="auto_stories"
            label={newSurfaceCopy.wikiAuto}
            sub={newSurfaceCopy.wikiAutoSub}
            checked={wikiAutoPromote}
            onChange={onToggleWikiAutoPromote}
          />
          {/* No placebo controls here (audit pattern A, same rule as M3LinkRow
              above): the former 자동 분류/앱 잠금/온디바이스/통화 녹음/제안 알림/강조 색
              rows persisted a local pref that NOTHING consumed — 앱 잠금 promised
              biometrics with no lock, 온디바이스 defaulted ON while analysis runs
              through cloud Gemini (C1). A control returns only WITH its behavior
              (pref plumbing kept in src/lib/settings/app-features.ts). */}
        </M3Group>

        {/* 데이터 연동 — honest hand-offs only. The old three rows here showed
            "연결됨·동기화 중" off a local toggle while syncing NOTHING. */}
        <M3SectionLabel action={<MdButton label={t("all")} variant="text" onPress={() => router.push("/integrations")} accessibilityLabel={t("allIntegrations")} />}>
          {t("dataConnections")}
        </M3SectionLabel>
        <M3Group>
          <M3LinkRow icon="sync_alt" label={t("manageIntegrations")} sub={t("manageIntegrationsDesc")} onPress={() => router.push("/integrations")} />
          <M3Divider />
          <M3LinkRow icon="upload_file" label={t("importData")} sub={t("importDataDesc")} onPress={() => router.push("/import-hub")} />
        </M3Group>

        {/* 개발자 — 개발/QA 빌드에서만 보인다 (Simon 2026-08-19, 결정 콘솔 V2 의견).
            앱 안 어디에서도 링크되지 않는 화면이 실제로 여럿 있어서(`/canon` ·
            `/deepspace-*` · 딥링크 전용 두 개) 살아 있는지 확인할 방법이 없었다.
            프로덕션에서는 이 절 자체가 렌더되지 않으므로 죽은 행이 남지 않는다. */}
        {isDevSurfaceEnabled() ? (
          <>
            <M3SectionLabel>{newSurfaceCopy.devScreens}</M3SectionLabel>
            <M3Group>
              <M3LinkRow
                icon="bubble_chart"
                label={newSurfaceCopy.devScreens}
                sub={newSurfaceCopy.devScreensSub}
                onPress={() => router.push("/dev-screens")}
              />
            </M3Group>
          </>
        ) : null}

        {/* Destructive op in flight: a persistent banner explains why actions
            and sign-out are disabled, instead of letting the user escape a
            half-finished wipe by navigating away or signing out. */}
        {busy !== null ? (
          isDeepSpaceUI() ? (
            <PixelSurface
              variant="inset"
              style={styles.pixelBusyBanner}
              contentStyle={styles.pixelBusyContent}
            >
              <View accessibilityRole="alert" accessibilityLiveRegion="polite">
                <Text variant="caption" color="textMuted">
                  {t("workingPaused")}
                </Text>
              </View>
            </PixelSurface>
          ) : (
            <View style={styles.busyBanner} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <Text variant="caption" color="textMuted">
                {t("workingPaused")}
              </Text>
            </View>
          )
        ) : null}

        {/* The active PIXEL-CLAY surface exposes every production destination
            once. The old DeepSpaceLinks block repeated routes already shown
            above; legacy retains its original two button clusters. */}
        {isDeepSpaceUI() ? (
          <>
            <M3SectionLabel>{t("account")}</M3SectionLabel>
            <M3Group>
              <M3LinkRow icon="person" label={t("nav.account")} sub={t("nav.accountHint")} onPress={() => router.push("/account")} />
              <M3Divider />
              <M3LinkRow icon="lock" label={t("nav.privacy")} sub={t("nav.privacyHint")} onPress={() => router.push("/privacy")} />
            </M3Group>

            <M3SectionLabel>{t("app")}</M3SectionLabel>
            <M3Group>
              <M3LinkRow icon="settings" label={t("nav.theme")} sub={t("nav.themeHint")} onPress={() => router.push("/theme")} />
              <M3Divider />
              <M3LinkRow icon="article" label={t("nav.data")} sub={t("nav.dataHint")} onPress={() => router.push("/data")} />
              <M3Divider />
              <M3LinkRow icon="book" label={t("nav.records")} sub={t("nav.recordsHint")} onPress={() => router.push("/records")} />
              <M3Divider />
              <M3LinkRow icon="lock" label={t("permissions")} onPress={() => router.push("/permissions")} />
            </M3Group>

            <M3SectionLabel>{t("support")}</M3SectionLabel>
            <M3Group>
              <M3LinkRow icon="info" label={t("nav.support")} sub={t("nav.supportHint")} onPress={() => router.push("/support")} />
              <M3Divider />
              <M3LinkRow icon="book" label={t("manual")} onPress={() => router.push("/manual")} />
              <M3Divider />
              <M3LinkRow icon="box" label={t("aiMuseum")} onPress={() => router.push("/museum")} />
              <M3Divider />
              <M3LinkRow icon="ops" label={t("routines")} onPress={() => router.push("/ops")} />
              <M3Divider />
              <M3LinkRow
                icon="refresh"
                label={t("resetCoachmarks")}
                sub={t("resetCoachmarksDesc")}
                onPress={() => {
                  resetCoachmarks();
                  router.replace("/");
                }}
              />
            </M3Group>
          </>
        ) : (
          <>
            <View style={styles.section}>
              <Text variant="caption" color="textMuted" style={styles.sectionEyebrow}>
                {t("myAccount")}
              </Text>
              <Button label={t("nav.profile")} accessibilityHint={t("nav.profileHint")} variant="secondary" onPress={() => router.push("/profile")} />
              <Button label={t("nav.privacy")} accessibilityHint={t("nav.privacyHint")} variant="secondary" onPress={() => router.push("/privacy")} />
              <Button label={t("nav.account")} accessibilityHint={t("nav.accountHint")} variant="secondary" onPress={() => router.push("/account")} />
            </View>
            <View style={styles.section}>
              <Text variant="caption" color="textMuted" style={styles.sectionEyebrow}>
                {t("app")}
              </Text>
              <Button label={t("nav.theme")} accessibilityHint={t("nav.themeHint")} variant="secondary" onPress={() => router.push("/theme")} />
              <Button
                label={t("resetCoachmarks")}
                accessibilityHint={t("resetCoachmarksDesc")}
                variant="secondary"
                onPress={() => {
                  resetCoachmarks();
                  router.replace("/");
                }}
              />
              <Button label={t("nav.data")} accessibilityHint={t("nav.dataHint")} variant="secondary" onPress={() => router.push("/data")} />
              <Button label={t("nav.records")} accessibilityHint={t("nav.recordsHint")} variant="secondary" onPress={() => router.push("/records")} />
              <Button label={t("nav.support")} accessibilityHint={t("nav.supportHint")} variant="secondary" onPress={() => router.push("/support")} />
            </View>
          </>
        )}

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

        {/* 그래프 크루 밀도 control removed (audit pattern A, same rule as the
            feature switches above): the crew only draws in CrewLayer, which
            mounts inside NavGraph — and NavGraph is reachable on neither
            production surface. Home early-returns <DeepSpaceShell/> for
            isDeepSpaceUI() (index.tsx), and /graph is wrapped in DevOnlyRoute.
            So every density here moved a slider the user could never see the
            effect of. The pref plumbing stays in lib/settings/crew-density.ts:
            a control returns only WITH its screen. */}

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

        {/* The real bundle identity, not a frozen string. This line existed to
            answer "which bundle is this?" during an incident — the 2026-06-26
            head-touch crash was prolonged by embedded-vs-OTA uncertainty — and a
            hardcoded locale value ("Build 0.0.6 · OTA ota-2026-06-27a", still
            claiming 0.0.6 on a 0.1.0 build) defeats exactly that purpose.
            buildInfoLine() reads expo-updates, same as the account screen. */}
        <Text variant="caption" color="textMuted" style={styles.buildMarker}>
          {buildInfoLine()}
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
  pixelHeadline: { ...m3TextStyle("headlineSmall") },
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: m3.spacing.s5,
    marginBottom: m3.spacing.s3,
  },
  sectionLabel: { ...koType(14, 20, 0.1, "500"), color: m3.color.onSurfaceVariant },
  pixelSectionLabel: { ...m3TextStyle("labelLarge") },
  card: { backgroundColor: m3.color.surfaceContainerHighest, borderRadius: m3.shape.medium, padding: m3.spacing.s1 },
  pixelGroup: { alignSelf: "stretch" },
  pixelGroupContent: { paddingHorizontal: 0, paddingVertical: 0 },
  divider: { height: 1, backgroundColor: m3.color.outlineVariant, marginHorizontal: m3.spacing.s3 },
  pixelDivider: { height: m3.spacing.s1, backgroundColor: m3.color.surface, marginHorizontal: m3.spacing.s4 },
  row: { flexDirection: "row", alignItems: "center", gap: m3.spacing.s3, paddingVertical: m3.spacing.s3, paddingHorizontal: m3.spacing.s3 },
  pixelRow: { minHeight: 56, gap: m3.spacing.s4, paddingVertical: m3.spacing.s4, paddingHorizontal: m3.spacing.s6 },
  pixelRowPressed: { transform: [{ translateY: m3.spacing.s1 }], backgroundColor: m3.color.surfaceVariant },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { ...koType(16, 22, 0.15, "400"), color: m3.color.onSurface },
  pixelRowLabel: { ...m3TextStyle("titleMedium") },
  rowSub: { ...koType(12, 16, 0.3, "400"), color: m3.color.onSurfaceVariant, marginTop: 1 },
  pixelRowSub: { ...m3TextStyle("labelSmall"), marginTop: m3.spacing.s1 },
  iconBadge: { width: 38, height: 38, borderRadius: m3.shape.none, alignItems: "center", justifyContent: "center" },
  pixelIconBadge: { width: 42, height: 42 },
  pixelIconBadgeContent: { width: 38, height: 38, paddingHorizontal: 0, paddingVertical: 0, alignItems: "center", justifyContent: "center" },
  rowBadge: { minWidth: 24, height: 24, borderRadius: m3.shape.none, paddingHorizontal: 7, alignItems: "center", justifyContent: "center", backgroundColor: m3.accent.alertDot },
  rowBadgeText: { ...koType(12, 16, 0, "700"), color: m3.color.onPrimary },
  pixelRowBadgeText: { ...m3TextStyle("labelLarge") },
  switchTrack: { width: 52, height: 32, borderRadius: m3.shape.none, borderWidth: 2, justifyContent: "center" },
  switchThumb: { position: "absolute", borderRadius: m3.shape.none },
  pixelSwitchPressable: { minWidth: m3.minTouch, minHeight: m3.minTouch, alignItems: "center", justifyContent: "center" },
  pixelSwitchContent: { width: 36, height: 20, paddingHorizontal: 0, paddingVertical: 0, justifyContent: "center" },
  pixelSwitchThumb: { position: "absolute", width: 12, height: 12, backgroundColor: m3.color.onPrimaryContainer },
  pixelSwitchThumbChecked: { right: m3.spacing.s2 },
  pixelSwitchThumbOff: { left: m3.spacing.s2, backgroundColor: m3.color.onSurfaceVariant },
});

// PIXEL-CLAY 규칙 4 — 정적 반투명 금지. 비활성 버튼은 바탕이 겹쳐 있다:
//   섹션 카드(deepSpace.card) → 버튼 배경(text @ 0.08) → 라벨(text @ 0.5).
// 라벨을 카드 위에서 합성하면 실제보다 어두워진다. 쌓인 순서대로 합성한다.
const BTN_DISABLED_BG = flattenAlpha(deepSpace.text, 0.08, deepSpace.card);
const BTN_DISABLED_LABEL = flattenAlpha(deepSpace.text, 0.5, BTN_DISABLED_BG);

const styles = StyleSheet.create({
  // Deep-space shell (replaces the legacy PremiumAppShell light cosmic body).
  screen: { flex: 1, backgroundColor: deepSpace.bg },
  glow: { position: "absolute", top: 0, left: 0, right: 0, height: 200, backgroundColor: deepSpace.bgGlow },
  center: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: spacing.lg },
  pixelScroll: {
    paddingHorizontal: m3.spacing.s8,
    paddingTop: m3.spacing.s4,
    paddingBottom: m3.spacing.s8,
    gap: 0,
  },
  header: { gap: spacing.xs, marginBottom: spacing.md },
  title: { fontSize: 20, color: deepSpace.textHi, marginBottom: spacing.xs },
  guidance: { marginTop: -6, marginBottom: spacing.xs },
  section: {
    backgroundColor: deepSpace.card,
    borderColor: deepSpace.cardLine,
    borderWidth: 1,
    borderRadius: m3.shape.large,
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
  pixelDisclosureHeaderPressed: {
    transform: [{ translateY: m3.spacing.s1 }],
    backgroundColor: m3.color.surfaceVariant,
  },
  disclosureIndicator: {
    minWidth: 24,
    textAlign: "right",
    fontWeight: "800",
  },
  disclosureBody: {
    gap: spacing.sm,
  },
  pixelDisclosure: { alignSelf: "stretch", marginTop: m3.spacing.s5 },
  pixelDisclosureContent: {
    position: "relative",
    paddingHorizontal: m3.spacing.s6,
    paddingVertical: m3.spacing.s4,
  },
  pixelDisclosureTone: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: m3.spacing.s1,
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
    borderRadius: m3.shape.medium,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pixelBusyBanner: { alignSelf: "stretch", marginTop: m3.spacing.s5 },
  pixelBusyContent: { paddingHorizontal: m3.spacing.s6, paddingVertical: m3.spacing.s4 },
  pixelButtonRoot: { alignSelf: "stretch", minHeight: m3.minTouch },
  pixelButtonHeld: { transform: [{ translateY: m3.spacing.s1 }] },
  pixelButtonSurface: { alignSelf: "stretch", minHeight: m3.minTouch },
  pixelButtonContent: {
    minHeight: 40,
    paddingHorizontal: m3.spacing.s6,
    paddingVertical: m3.spacing.s3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s4,
  },
  pixelButtonLabel: {
    ...m3TextStyle("labelLarge"),
    textAlign: "center",
  },
  settingsButton: {
    minHeight: 48,
    borderRadius: m3.shape.medium,
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
    backgroundColor: BTN_DISABLED_BG,
    borderColor: deepSpace.cardLine,
  },
  settingsButtonPressed: {
    opacity: 0.78,
  },
  settingsButtonLabel: {
    fontSize: 15,
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
  // 빌드 표식은 무대 바닥 위의 글자다. `opacity` 대신 흐려진 색을 미리 만든다
  // (PIXEL-CLAY 규칙 4).
  buildMarker: {
    marginTop: spacing.md,
    textAlign: "center",
    color: flattenAlpha(m3.color.onSurfaceVariant, 0.6, m3.accent.stageFloor),
  },
});
