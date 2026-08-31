import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  FlatList,
  Linking,
  Platform,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { Redirect, router } from "expo-router";
import { useTranslation } from "react-i18next";
import Svg, { Rect } from "react-native-svg";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import type { AnyGlyphName } from "@/components/pixel/pixel-glyphs";
import { ringCells } from "@/components/pixel/pixel-line";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth/AuthContext";
import { systemLocaleFor } from "@/lib/i18n/locales";
import {
  OPS_GROUP_IDS,
  domainsForGroup,
  type OpsDomainId,
  type OpsGroupId,
} from "@/lib/ops/domains";
import { gatherAdherenceStats } from "@/lib/ops/signals";
import { adherenceChip } from "@/lib/ops/grounding";
import { loadPickCandidates } from "@/lib/ops/load-picks";
import { opsRouteForDomain } from "@/lib/ops/nav";
import {
  recommendForDomain,
  recommendationsAllowed,
  type OpsRecommendation,
} from "@/lib/ops/recommend";
import {
  addEventToDeviceCalendar,
  deviceCalendarSupported,
} from "@/lib/ops/device-calendar";
import {
  buildChecklistShareText,
  buildGoogleCalendarUrl,
  buildIcsEvent,
  type OpsEventInput,
} from "@/lib/ops/push";
import {
  remindersSupported,
  scheduleRoutineReminder,
  type ReminderResult,
} from "@/lib/ops/reminders";
import {
  createRoutineFromRecommendation,
  listCompletionsSince,
  listTodayRoutines,
  localDayKey,
  logRoutineCompletion,
  weekStreak,
  type OpsRoutine,
} from "@/lib/ops/routines";
import { pickToday, type PickId, type TodayPicks } from "@/lib/ops/today-picks";
import { OPS_DAILY_LIMIT, bumpOpsUsage, readOpsUsage } from "@/lib/ops/usage";
import type { PrivacyPrefs } from "@/lib/privacy/prefs";
import { resolvePrivacyPrefs } from "@/lib/privacy/prefs";
import { useProgression } from "@/lib/progression/useProgression";
import { getSupabaseClient } from "@/lib/supabase/client";
import { savePrivacyPrefs } from "@/lib/supabase/privacy";
import { m3 } from "@/lib/theme/m3";

export const OPS_SCREEN_TIMEOUT_MS = 8_000;

class OpsReadTimeoutError extends Error {
  constructor() {
    super("ops_read_timeout");
    this.name = "OpsReadTimeoutError";
  }
}

export function withOpsTimeout<T>(work: Promise<T>, ms = OPS_SCREEN_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new OpsReadTimeoutError());
    }, ms);
    void work.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

type ReadState<T> =
  | { kind: "loading" | "timeout" | "error"; ownerId: string | null }
  | { kind: "empty" | "ready"; ownerId: string; data: T };

interface TodayData {
  routines: OpsRoutine[];
  completedIds: Set<string>;
  streak: number;
}

interface ActionNotice {
  tone: "normal" | "danger";
  keys: string[];
}

interface PendingPush {
  ownerId: string;
  run: () => Promise<void>;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

const EMPTY_TODAY: TodayData = {
  routines: [],
  completedIds: new Set<string>(),
  streak: 0,
};

export const OPS_TODAY_ROUTES: Readonly<Record<PickId, string>> = {
  routine: "/reminders",
  milestone: "/milestones",
  reading: "/reading",
  meals: "/meals",
  records: "/records",
  esm: "/esm",
};

export const OPS_TOOL_ROUTES = [
  { icon: "timer", label: "tools.focus.label", sub: "tools.focus.sub", route: "/focus" },
  { icon: "schedule", label: "tools.reminders.label", sub: "tools.reminders.sub", route: "/reminders" },
  { icon: "lightbulb", label: "tools.imagine.label", sub: "tools.imagine.sub", route: "/imagine" },
  { icon: "share", label: "tools.shareCard.label", sub: "tools.shareCard.sub", route: "/share-card" },
  { icon: "book", label: "tools.srs.label", sub: "tools.srs.sub", route: "/srs" },
  { icon: "bubble", label: "tools.callReflection.label", sub: "tools.callReflection.sub", route: "/call-reflection" },
  { icon: "book", label: "tools.reading.label", sub: "tools.reading.sub", route: "/reading" },
  { icon: "badge", label: "tools.milestones.label", sub: "tools.milestones.sub", route: "/milestones" },
  { icon: "box", label: "tools.ledger.label", sub: "tools.ledger.sub", route: "/ledger" },
  { icon: "sparkle", label: "tools.sideProject.label", sub: "tools.sideProject.sub", route: "/side-project" },
  { icon: "fire", label: "tools.meals.label", sub: "tools.meals.sub", route: "/meals" },
] as const satisfies ReadonlyArray<{
  icon: AnyGlyphName;
  label: string;
  sub: string;
  route: string;
}>;

const RING_POINTS = ringCells(29, 29, 22, 6);

function readKindFor(error: unknown): "timeout" | "error" {
  return error instanceof OpsReadTimeoutError ? "timeout" : "error";
}

function nextMorningIso(now: Date = new Date()): string {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(9, 0, 0, 0);
  return next.toISOString();
}

async function loadPrivacyPrefsStrict(userId: string): Promise<PrivacyPrefs> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("privacy_prefs")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  const stored = (data?.privacy_prefs as Record<string, unknown> | null | undefined) ?? null;
  return resolvePrivacyPrefs(stored);
}

async function loadTodayData(userId: string, now: Date): Promise<TodayData> {
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const today = localDayKey(now);
  const [routines, logs] = await Promise.all([
    listTodayRoutines(userId, now),
    listCompletionsSince(userId, localDayKey(weekAgo)),
  ]);
  return {
    routines,
    completedIds: new Set(logs.filter((log) => log.completed_on === today).map((log) => log.routine_id)),
    streak: weekStreak(logs, now),
  };
}

function StatePanel({
  icon,
  message,
  retryLabel,
  onRetry,
}: {
  icon: AnyGlyphName;
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
}) {
  return (
    <PixelSurface variant="frame" style={styles.stateSurface} contentStyle={styles.stateContent}>
      <PixelGlyph name={icon} color={m3.color.primary} size={24} />
      <Text variant="body" style={styles.stateMessage}>
        {message}
      </Text>
      {retryLabel && onRetry ? (
        <PixelPressable
          fullWidth
          onPress={onRetry}
          accessibilityLabel={retryLabel}
          contentStyle={styles.actionContent}
        >
          <PixelGlyph name="refresh" color={m3.color.onSurface} size={18} />
          <Text variant="body" style={styles.actionText}>
            {retryLabel}
          </Text>
        </PixelPressable>
      ) : null}
    </PixelSurface>
  );
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const lit = total > 0 ? Math.round(RING_POINTS.length * Math.min(1, done / total)) : 0;
  return (
    <Svg width={58} height={58} viewBox="0 0 58 58" accessibilityElementsHidden>
      {RING_POINTS.map((point, index) => (
        <Rect
          key={`${point.x}-${point.y}`}
          x={point.x}
          y={point.y}
          width={6}
          height={6}
          fill={index < lit ? m3.color.primary : m3.color.surfaceVariant}
        />
      ))}
    </Svg>
  );
}

function ChoiceButton({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <PixelPressable
      fullWidth
      variant={selected ? "inset" : "bevel"}
      background={selected ? m3.color.primaryContainer : m3.color.surfaceContainerHigh}
      rootStyle={styles.choiceRoot}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      contentStyle={styles.choiceContent}
    >
      <Text variant="caption" style={selected ? styles.choiceTextSelected : styles.choiceText}>
        {label}
      </Text>
    </PixelPressable>
  );
}

function ActionButton({
  icon,
  label,
  disabled = false,
  busy = false,
  onPress,
}: {
  icon: AnyGlyphName;
  label: string;
  disabled?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  return (
    <PixelPressable
      fullWidth
      rootStyle={styles.recActionRoot}
      disabled={disabled}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityState={{ busy }}
      contentStyle={styles.recActionContent}
    >
      <PixelGlyph name={icon} color={disabled ? m3.color.onSurfaceVariant : m3.color.onSurface} size={18} />
      <Text variant="caption" style={disabled ? styles.actionTextDisabled : styles.recActionText}>
        {label}
      </Text>
    </PixelPressable>
  );
}

function RecommendationCard({
  recommendation,
  itemKey,
  saved,
  saving,
  deviceCalendar,
  deviceReminders,
  t,
  onPush,
  onRemind,
  onSave,
}: {
  recommendation: OpsRecommendation;
  itemKey: string;
  saved: boolean;
  saving: boolean;
  deviceCalendar: boolean;
  deviceReminders: boolean;
  t: Translate;
  onPush: (kind: "device" | "google" | "ics" | "share", recommendation: OpsRecommendation) => void;
  onRemind: (recommendation: OpsRecommendation) => void;
  onSave: (recommendation: OpsRecommendation, itemKey: string) => void;
}) {
  return (
    <PixelSurface variant="bevel" contentStyle={styles.recContent}>
      <View style={styles.recHeading}>
        <PixelGlyph name="sparkle" color={m3.color.primary} size={20} />
        <Text variant="heading" style={styles.recTitle}>
          {recommendation.title}
        </Text>
      </View>
      <Text variant="body" style={styles.recReason}>
        {recommendation.reason}
      </Text>
      {recommendation.durationMinutes || recommendation.recurrence ? (
        <Text variant="caption" style={styles.recMeta}>
          {[
            recommendation.durationMinutes
              ? t("card.durationLabel", { minutes: recommendation.durationMinutes })
              : null,
            recommendation.recurrence === "daily"
              ? t("card.daily")
              : recommendation.recurrence === "weekly"
                ? t("card.weekly")
                : null,
          ]
            .filter((value): value is string => value !== null)
            .join(" · ")}
        </Text>
      ) : null}
      <View style={styles.recActions}>
        {deviceCalendar ? (
          <ActionButton
            icon="schedule"
            label={t("card.addDevice")}
            onPress={() => onPush("device", recommendation)}
          />
        ) : null}
        <ActionButton
          icon="schedule"
          label={t("card.addGoogle")}
          onPress={() => onPush("google", recommendation)}
        />
        {Platform.OS === "web" ? (
          <ActionButton
            icon="download"
            label={t("card.downloadIcs")}
            onPress={() => onPush("ics", recommendation)}
          />
        ) : null}
        <ActionButton
          icon="share"
          label={t("card.shareList")}
          onPress={() => onPush("share", recommendation)}
        />
        {deviceReminders ? (
          <ActionButton
            icon="schedule"
            label={t("card.remind")}
            onPress={() => onRemind(recommendation)}
          />
        ) : null}
        <ActionButton
          icon="check"
          label={saving ? t("card.saving") : saved ? t("card.saved") : t("card.saveRoutine")}
          disabled={saving || saved}
          busy={saving}
          onPress={() => onSave(recommendation, itemKey)}
        />
      </View>
    </PixelSurface>
  );
}

function SectionHeading({ icon, title, body }: { icon: AnyGlyphName; title: string; body?: string }) {
  return (
    <View style={styles.sectionHeading}>
      <PixelGlyph name={icon} color={m3.color.primary} size={20} />
      <View style={styles.sectionCopy}>
        <Text variant="heading" style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
        {body ? (
          <Text variant="caption" style={styles.sectionBody}>
            {body}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function DeepSpaceOpsScreen() {
  const { t, i18n } = useTranslation(["ops", "common", "consent"]);
  const {
    userId,
    loading: authLoading,
    isMinor,
    hasProfile,
    profileProbeFailed,
    refresh: refreshAuth,
  } = useAuth();
  const progression = useProgression();
  const locale = systemLocaleFor(i18n.language);
  const tEn = useMemo(() => i18n.getFixedT("en", "ops"), [i18n]);

  const [group, setGroup] = useState<OpsGroupId | null>(null);
  const [domain, setDomain] = useState<OpsDomainId | null>(null);
  const [recommendations, setRecommendations] = useState<OpsRecommendation[]>([]);
  const [adherence, setAdherence] = useState<string | null>(null);
  const [runState, setRunState] = useState<"idle" | "working" | "empty" | "error" | "limit" | "off">("idle");
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentSaving, setConsentSaving] = useState(false);
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [prefsState, setPrefsState] = useState<ReadState<PrivacyPrefs>>({ kind: "loading", ownerId: null });
  const [usageState, setUsageState] = useState<ReadState<number>>({ kind: "loading", ownerId: null });
  const [todayState, setTodayState] = useState<ReadState<TodayData>>({ kind: "loading", ownerId: null });
  const [picksState, setPicksState] = useState<ReadState<TodayPicks>>({ kind: "loading", ownerId: null });

  const mountedRef = useRef(true);
  const ownerRef = useRef<string | null>(userId);
  const readRequestRef = useRef(0);
  const runRequestRef = useRef(0);
  const pendingPushRef = useRef<PendingPush | null>(null);
  ownerRef.current = userId;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pendingPushRef.current = null;
    };
  }, []);

  const isCurrentOwner = useCallback(
    (ownerId: string) => mountedRef.current && ownerRef.current === ownerId,
    [],
  );

  useEffect(() => {
    runRequestRef.current += 1;
    pendingPushRef.current = null;
    setConsentOpen(false);
    setConsentSaving(false);
    setGroup(null);
    setDomain(null);
    setRecommendations([]);
    setAdherence(null);
    setRunState("idle");
    setSavedKeys(new Set());
    setSavingKey(null);
    setCompletingIds(new Set());
    setNotice(null);
  }, [userId]);

  useEffect(() => {
    if (authLoading || !userId || hasProfile !== true || profileProbeFailed) return;
    let active = true;
    const ownerId = userId;
    const requestId = ++readRequestRef.current;
    const now = new Date();
    const current = () => active && requestId === readRequestRef.current && isCurrentOwner(ownerId);

    setPrefsState({ kind: "loading", ownerId });
    setUsageState({ kind: "loading", ownerId });
    setTodayState({ kind: "loading", ownerId });
    setPicksState({ kind: "loading", ownerId });

    void withOpsTimeout(loadPrivacyPrefsStrict(ownerId)).then(
      (data) => {
        if (current()) setPrefsState({ kind: "ready", ownerId, data });
      },
      (error: unknown) => {
        if (current()) setPrefsState({ kind: readKindFor(error), ownerId });
      },
    );
    void withOpsTimeout(readOpsUsage(ownerId, now, { failOnReadError: true })).then(
      (data) => {
        if (current()) setUsageState({ kind: "ready", ownerId, data });
      },
      (error: unknown) => {
        if (current()) setUsageState({ kind: readKindFor(error), ownerId });
      },
    );
    void withOpsTimeout(loadTodayData(ownerId, now)).then(
      (data) => {
        if (current()) setTodayState({ kind: data.routines.length === 0 ? "empty" : "ready", ownerId, data });
      },
      (error: unknown) => {
        if (current()) setTodayState({ kind: readKindFor(error), ownerId });
      },
    );
    void withOpsTimeout(loadPickCandidates(ownerId, now, { failOnReadError: true })).then(
      (candidates) => {
        if (!current()) return;
        const data = pickToday(candidates, now.getTime());
        setPicksState({ kind: data.picks.length === 0 ? "empty" : "ready", ownerId, data });
      },
      (error: unknown) => {
        if (current()) setPicksState({ kind: readKindFor(error), ownerId });
      },
    );

    return () => {
      active = false;
    };
  }, [authLoading, hasProfile, isCurrentOwner, profileProbeFailed, reloadNonce, userId]);

  const ownerPrefs = prefsState.ownerId === userId ? prefsState : { kind: "loading", ownerId: userId } as ReadState<PrivacyPrefs>;
  const ownerUsage = usageState.ownerId === userId ? usageState : { kind: "loading", ownerId: userId } as ReadState<number>;
  const ownerToday = todayState.ownerId === userId ? todayState : { kind: "loading", ownerId: userId } as ReadState<TodayData>;
  const ownerPicks = picksState.ownerId === userId ? picksState : { kind: "loading", ownerId: userId } as ReadState<TodayPicks>;

  const domains = group ? domainsForGroup(group) : [];
  const dailyLimit = OPS_DAILY_LIMIT[progression.tier];
  const usedToday = ownerUsage.kind === "ready" ? ownerUsage.data : null;
  const limitReached = usedToday !== null && usedToday >= dailyLimit;
  const deviceCalendar = useMemo(() => deviceCalendarSupported(), []);
  const deviceReminders = useMemo(() => remindersSupported(), []);

  const retryReads = () => setReloadNonce((value) => value + 1);

  function selectGroup(nextGroup: OpsGroupId): void {
    if (runState === "working") return;
    setGroup(nextGroup);
    setDomain(null);
    setRecommendations([]);
    setAdherence(null);
    setRunState("idle");
  }

  function selectDomain(nextDomain: OpsDomainId): void {
    if (runState === "working") return;
    const route = opsRouteForDomain(nextDomain);
    if (route) {
      router.push(route);
      return;
    }
    setDomain(nextDomain);
    setRecommendations([]);
    setAdherence(null);
    setRunState("idle");
  }

  async function runRecommendation(): Promise<void> {
    if (!userId || !domain || runState === "working") return;
    const ownerId = userId;
    const selectedDomain = domain;
    if (ownerPrefs.kind !== "ready" || ownerUsage.kind !== "ready" || progression.loading) {
      setRunState("error");
      return;
    }
    if (!recommendationsAllowed(isMinor, ownerPrefs.data.recommendations)) {
      setRunState("off");
      return;
    }
    if (ownerUsage.data >= dailyLimit) {
      setRunState("limit");
      return;
    }

    const requestId = ++runRequestRef.current;
    setRunState("working");
    setRecommendations([]);
    setAdherence(null);
    setNotice(null);
    try {
      const result = await recommendForDomain({
        userId: ownerId,
        locale,
        domainId: selectedDomain,
        domainLabel: tEn(`domains.${selectedDomain}`),
        minor: isMinor === true,
        recommendationsPref: ownerPrefs.data.recommendations,
        forceFresh: true,
      });
      const [nextUsage, stats] = await Promise.all([
        bumpOpsUsage(ownerId),
        result.length > 0
          ? gatherAdherenceStats(ownerId, selectedDomain).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (!isCurrentOwner(ownerId) || requestId !== runRequestRef.current) return;
      setUsageState({ kind: "ready", ownerId, data: nextUsage });
      setRecommendations(result);
      setAdherence(stats ? adherenceChip(stats, i18n.language?.toLowerCase().startsWith("ko") ?? false) : null);
      setRunState(result.length === 0 ? "empty" : "idle");
    } catch {
      if (isCurrentOwner(ownerId) && requestId === runRequestRef.current) setRunState("error");
    }
  }

  function updateCompletion(ownerId: string, routineId: string, checked: boolean): void {
    setTodayState((current) => {
      if (current.ownerId !== ownerId || (current.kind !== "ready" && current.kind !== "empty")) return current;
      const completedIds = new Set(current.data.completedIds);
      if (checked) completedIds.add(routineId);
      else completedIds.delete(routineId);
      return { ...current, data: { ...current.data, completedIds } };
    });
  }

  async function completeRoutine(routine: OpsRoutine): Promise<void> {
    if (!userId || completingIds.has(routine.id)) return;
    const ownerId = userId;
    updateCompletion(ownerId, routine.id, true);
    setCompletingIds((current) => new Set(current).add(routine.id));
    setNotice(null);
    try {
      await logRoutineCompletion(ownerId, routine.id, localDayKey());
    } catch {
      if (isCurrentOwner(ownerId)) {
        updateCompletion(ownerId, routine.id, false);
        setNotice({ tone: "danger", keys: ["common:errors.unknown"] });
      }
    } finally {
      if (isCurrentOwner(ownerId)) {
        setCompletingIds((current) => {
          const next = new Set(current);
          next.delete(routine.id);
          return next;
        });
      }
    }
  }

  function reminderNotice(result: ReminderResult): ActionNotice {
    if (result === "scheduled") return { tone: "normal", keys: ["push.reminderSetNote"] };
    if (result === "denied") return { tone: "danger", keys: ["push.reminderDeniedNote"] };
    if (result === "unavailable") return { tone: "normal", keys: ["push.reminderUnavailableNote"] };
    return { tone: "danger", keys: ["push.reminderFailedNote"] };
  }

  async function saveRoutine(recommendation: OpsRecommendation, itemKey: string): Promise<void> {
    if (!userId || !domain || savingKey || savedKeys.has(itemKey)) return;
    const ownerId = userId;
    const selectedDomain = domain;
    setSavingKey(itemKey);
    setNotice(null);
    try {
      await createRoutineFromRecommendation(ownerId, selectedDomain, recommendation);
    } catch {
      if (isCurrentOwner(ownerId)) {
        setSavingKey(null);
        setNotice({ tone: "danger", keys: ["common:errors.unknown"] });
      }
      return;
    }

    if (!isCurrentOwner(ownerId)) return;
    setSavedKeys((current) => new Set(current).add(itemKey));
    setSavingKey(null);
    setReloadNonce((value) => value + 1);

    let reminderResult: ReminderResult = "error";
    try {
      reminderResult = await scheduleRoutineReminder({
        title: recommendation.title,
        description: recommendation.reason,
        startsAtIso: recommendation.startsAtIso ?? nextMorningIso(),
        durationMinutes: recommendation.durationMinutes,
        recurrence: recommendation.recurrence,
      });
    } catch {
      reminderResult = "error";
    }
    if (isCurrentOwner(ownerId)) setNotice(reminderNotice(reminderResult));
  }

  async function remindRecommendation(recommendation: OpsRecommendation): Promise<void> {
    if (!userId) return;
    const ownerId = userId;
    setNotice(null);
    let result: ReminderResult = "error";
    try {
      result = await scheduleRoutineReminder({
        title: recommendation.title,
        description: recommendation.reason,
        startsAtIso: recommendation.startsAtIso ?? nextMorningIso(),
        durationMinutes: recommendation.durationMinutes,
        recurrence: recommendation.recurrence,
      });
    } catch {
      result = "error";
    }
    if (isCurrentOwner(ownerId)) setNotice(reminderNotice(result));
  }

  function eventFor(recommendation: OpsRecommendation): OpsEventInput {
    return {
      title: recommendation.title,
      description: recommendation.reason,
      startsAtIso: recommendation.startsAtIso ?? nextMorningIso(),
      durationMinutes: recommendation.durationMinutes,
      recurrence: recommendation.recurrence,
    };
  }

  async function runExternalAction(
    ownerId: string,
    kind: "device" | "google" | "ics" | "share",
    recommendation: OpsRecommendation,
  ): Promise<void> {
    const input = eventFor(recommendation);
    try {
      if (kind === "device") {
        const result = await addEventToDeviceCalendar(input);
        if (!isCurrentOwner(ownerId)) return;
        if (result === "saved") setNotice({ tone: "normal", keys: ["push.savedNote"] });
        else if (result === "denied") setNotice({ tone: "danger", keys: ["push.deniedNote"] });
        else if (result === "unavailable" || result === "error") {
          setNotice({ tone: "danger", keys: ["common:errors.unknown"] });
        }
        return;
      }
      if (kind === "google") {
        const url = buildGoogleCalendarUrl(input);
        if (!url) throw new Error("calendar_payload_invalid");
        await Linking.openURL(url);
        return;
      }
      if (kind === "ics") {
        const ics = buildIcsEvent(input);
        if (!ics || typeof document === "undefined") throw new Error("ics_unavailable");
        const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "2nd-brain-routine.ics";
        anchor.click();
        URL.revokeObjectURL(url);
        return;
      }
      await Share.share({
        message: buildChecklistShareText(
          recommendation.title,
          recommendation.checklist ?? [recommendation.reason],
        ),
      });
    } catch {
      if (isCurrentOwner(ownerId)) {
        setNotice({ tone: "danger", keys: ["common:errors.unknown"] });
      }
    }
  }

  function requestPush(
    kind: "device" | "google" | "ics" | "share",
    recommendation: OpsRecommendation,
  ): void {
    if (!userId) return;
    if (ownerPrefs.kind !== "ready") {
      setNotice({ tone: "danger", keys: ["common:errors.network"] });
      return;
    }
    const ownerId = userId;
    const run = async () => {
      if (isCurrentOwner(ownerId)) await runExternalAction(ownerId, kind, recommendation);
    };
    if (ownerPrefs.data.ops_push) {
      void run();
      return;
    }
    pendingPushRef.current = { ownerId, run };
    setConsentOpen(true);
  }

  function declinePush(): void {
    pendingPushRef.current = null;
    setConsentOpen(false);
  }

  async function agreeAndPush(): Promise<void> {
    const pending = pendingPushRef.current;
    if (!userId || !pending || pending.ownerId !== userId || ownerPrefs.kind !== "ready" || consentSaving) return;
    const ownerId = userId;
    setConsentSaving(true);
    const nextPrefs = { ...ownerPrefs.data, ops_push: true };
    let persisted = true;
    try {
      await savePrivacyPrefs(ownerId, nextPrefs);
      if (isCurrentOwner(ownerId)) setPrefsState({ kind: "ready", ownerId, data: nextPrefs });
    } catch {
      persisted = false;
    }
    if (!isCurrentOwner(ownerId)) return;
    pendingPushRef.current = null;
    setConsentOpen(false);
    setConsentSaving(false);
    await pending.run();
    if (isCurrentOwner(ownerId) && !persisted) {
      setNotice({
        tone: "danger",
        keys: ["consent:privacy.saveError", "consent:privacy.keys.ops_push.desc"],
      });
    }
  }

  const shell = (body: ReactNode) => (
    <DeepSpaceScreen
      active="ops"
      header="none"
      variant="windowed"
      title={t("todaysAssistant")}
      onBack={() => router.back()}
    >
      {body}
    </DeepSpaceScreen>
  );

  if (authLoading) {
    return shell(
      <View style={styles.center}>
        <StatePanel icon="schedule" message={t("common:states.loading")} />
      </View>,
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === null) {
    return shell(
      <View style={styles.center}>
        <StatePanel icon="schedule" message={t("common:states.loading")} />
      </View>,
    );
  }
  if (profileProbeFailed) {
    return shell(
      <View style={styles.center}>
        <StatePanel
          icon="warning"
          message={t("common:errors.network")}
          retryLabel={t("common:actions.retry")}
          onRetry={() => void refreshAuth()}
        />
      </View>,
    );
  }
  if (hasProfile === false) return <Redirect href="/complete-profile" />;

  const todayData = ownerToday.kind === "ready" || ownerToday.kind === "empty" ? ownerToday.data : EMPTY_TODAY;
  const todayDone = todayData.routines.filter((routine) => todayData.completedIds.has(routine.id)).length;
  const picksData = ownerPicks.kind === "ready" || ownerPicks.kind === "empty" ? ownerPicks.data : null;
  const recommendationReadsPending = ownerPrefs.kind === "loading" || ownerUsage.kind === "loading";
  const recommendationReadsFailed = [ownerPrefs.kind, ownerUsage.kind].some(
    (kind) => kind === "timeout" || kind === "error",
  );

  const listHeader = (
    <View style={styles.headerStack}>
      <SectionHeading icon="schedule" title={t("today.heading")} />
      {ownerToday.kind === "loading" ? (
        <StatePanel icon="schedule" message={t("common:states.loading")} />
      ) : ownerToday.kind === "timeout" || ownerToday.kind === "error" ? (
        <StatePanel
          icon="warning"
          message={t(ownerToday.kind === "timeout" ? "common:errors.network" : "common:errors.unknown")}
          retryLabel={t("common:actions.retry")}
          onRetry={retryReads}
        />
      ) : (
        <PixelSurface variant="bevel" background={m3.color.primaryContainer} contentStyle={styles.heroContent}>
          <ProgressRing done={todayDone} total={todayData.routines.length} />
          <View style={styles.heroCopy}>
            <Text variant="heading" style={styles.heroCount}>
              {t("home.ringCount", { done: todayDone, total: todayData.routines.length })}
            </Text>
            <Text variant="caption" style={styles.heroStreak}>
              {t("today.streak", { count: todayData.streak })}
            </Text>
          </View>
        </PixelSurface>
      )}
    </View>
  );

  const listFooter = (
    <View style={styles.footerStack}>
      {notice ? (
        <PixelSurface variant="inset" contentStyle={styles.noticeContent}>
          <PixelGlyph name={notice.tone === "danger" ? "warning" : "check"} color={notice.tone === "danger" ? m3.color.error : m3.color.primary} size={20} />
          <Text
            variant="body"
            style={notice.tone === "danger" ? styles.noticeDanger : styles.noticeText}
            accessibilityRole={notice.tone === "danger" ? "alert" : undefined}
            accessibilityLiveRegion="polite"
          >
            {notice.keys.map((key) => t(key)).join(" ")}
          </Text>
        </PixelSurface>
      ) : null}

      <PixelPressable
        fullWidth
        onPress={() => router.push("/insights")}
        accessibilityRole="link"
        accessibilityLabel={t("home.patternsTitle")}
        contentStyle={styles.patternContent}
      >
        <PixelGlyph name="sparkle" color={m3.color.primary} size={24} />
        <View style={styles.patternCopy}>
          <Text variant="body" style={styles.patternTitle}>{t("home.patternsTitle")}</Text>
          <Text variant="caption" style={styles.patternBody}>{t("home.patternsSub")}</Text>
        </View>
        <PixelGlyph name="chevron_right" color={m3.color.onSurface} size={20} />
      </PixelPressable>

      <SectionHeading icon="sparkle" title={t("home.takeEyebrow")} body={t("hero.subtitle")} />
      <PixelPressable
        fullWidth
        onPress={() => router.push("/reminders")}
        accessibilityRole="link"
        accessibilityLabel={t("card.remind")}
        contentStyle={styles.actionContent}
      >
        <PixelGlyph name="schedule" color={m3.color.onSurface} size={18} />
        <Text variant="body" style={styles.actionText}>{t("card.remind")}</Text>
        <PixelGlyph name="chevron_right" color={m3.color.onSurface} size={18} />
      </PixelPressable>

      <View style={styles.choiceGrid}>
        {OPS_GROUP_IDS.map((id) => (
          <ChoiceButton
            key={id}
            label={t(`groups.${id}`)}
            selected={group === id}
            disabled={runState === "working"}
            onPress={() => selectGroup(id)}
          />
        ))}
      </View>
      {group ? (
        <View style={styles.choiceGrid}>
          {domains.map((id) => (
            <ChoiceButton
              key={id}
              label={t(`domains.${id}`)}
              selected={domain === id}
              disabled={runState === "working"}
              onPress={() => selectDomain(id)}
            />
          ))}
        </View>
      ) : (
        <Text variant="body" style={styles.helperText}>{t("states.emptyDomain")}</Text>
      )}

      {domain ? (
        recommendationReadsPending ? (
          <StatePanel icon="schedule" message={t("common:states.loading")} />
        ) : recommendationReadsFailed ? (
          <StatePanel
            icon="warning"
            message={t("common:errors.network")}
            retryLabel={t("common:actions.retry")}
            onRetry={retryReads}
          />
        ) : (
          <PixelPressable
            fullWidth
            disabled={runState === "working" || limitReached}
            onPress={() => void runRecommendation()}
            accessibilityLabel={runState === "working" ? t("recommend.working") : t("recommend.cta")}
            accessibilityHint={t("recommend.ctaHint")}
            accessibilityState={{ busy: runState === "working" }}
            contentStyle={styles.primaryContent}
          >
            <PixelGlyph name="sparkle" color={m3.color.onSurface} size={20} />
            <Text variant="body" style={styles.primaryText}>
              {runState === "working" ? t("recommend.working") : t("recommend.cta")}
            </Text>
          </PixelPressable>
        )
      ) : null}

      {runState === "limit" || (domain && limitReached) ? <Text variant="body" style={styles.helperText}>{t("recommend.limit")}</Text> : null}
      {runState === "empty" ? <Text variant="body" style={styles.helperText}>{t("recommend.empty")}</Text> : null}
      {runState === "error" ? <Text variant="body" style={styles.errorText} accessibilityRole="alert">{t("recommend.error")}</Text> : null}
      {runState === "off" ? <Text variant="body" style={styles.helperText}>{t("recommend.off")}</Text> : null}
      {adherence && recommendations.length > 0 ? <Text variant="caption" style={styles.adherence}>{adherence}</Text> : null}

      {consentOpen ? (
        <PixelSurface variant="inset" contentStyle={styles.consentContent}>
          <SectionHeading icon="share" title={t("consent.title")} body={t("consent.body")} />
          <View style={styles.consentActions}>
            <ActionButton
              icon="check"
              label={t("consent.agree")}
              disabled={consentSaving}
              busy={consentSaving}
              onPress={() => void agreeAndPush()}
            />
            <ActionButton icon="close" label={t("consent.later")} disabled={consentSaving} onPress={declinePush} />
          </View>
        </PixelSurface>
      ) : null}

      <View style={styles.recommendations}>
        {recommendations.map((recommendation, index) => {
          const itemKey = `${domain ?? "none"}:${index}`;
          return (
            <RecommendationCard
              key={itemKey}
              recommendation={recommendation}
              itemKey={itemKey}
              saved={savedKeys.has(itemKey)}
              saving={savingKey === itemKey}
              deviceCalendar={deviceCalendar}
              deviceReminders={deviceReminders}
              t={t}
              onPush={requestPush}
              onRemind={(item) => void remindRecommendation(item)}
              onSave={(item, key) => void saveRoutine(item, key)}
            />
          );
        })}
      </View>
      {recommendations.length > 0 ? <Text variant="caption" style={styles.helperText}>{t("recommend.disclaimerBody")}</Text> : null}

      <SectionHeading
        icon="inbox"
        title={t("today.title")}
        body={ownerPicks.kind === "ready" ? t("today.hint") : ownerPicks.kind === "empty" ? t("today.nothingHint") : undefined}
      />
      {ownerPicks.kind === "loading" ? (
        <StatePanel icon="schedule" message={t("common:states.loading")} />
      ) : ownerPicks.kind === "timeout" || ownerPicks.kind === "error" ? (
        <StatePanel
          icon="warning"
          message={t(ownerPicks.kind === "timeout" ? "common:errors.network" : "common:errors.unknown")}
          retryLabel={t("common:actions.retry")}
          onRetry={retryReads}
        />
      ) : picksData ? (
        <View style={styles.pickStack}>
          {picksData.picks.map((id) => (
            <PixelPressable
              key={id}
              fullWidth
              onPress={() => router.push(OPS_TODAY_ROUTES[id] as never)}
              accessibilityRole="link"
              accessibilityLabel={t(`today.pick.${id}`)}
              contentStyle={styles.routeContent}
            >
              <PixelGlyph name="check" color={m3.color.primary} size={18} />
              <Text variant="body" style={styles.routeText}>{t(`today.pick.${id}`)}</Text>
              <PixelGlyph name="chevron_right" color={m3.color.onSurface} size={18} />
            </PixelPressable>
          ))}
          {picksData.suggestions.map((id) => (
            <PixelPressable
              key={`next-${id}`}
              fullWidth
              variant="inset"
              onPress={() => router.push(OPS_TODAY_ROUTES[id] as never)}
              accessibilityRole="link"
              accessibilityLabel={t(`today.next.${id}`)}
              contentStyle={styles.routeContent}
            >
              <PixelGlyph name="arrow_forward" color={m3.color.onSurfaceVariant} size={18} />
              <Text variant="body" style={styles.routeTextMuted}>{t(`today.next.${id}`)}</Text>
              <PixelGlyph name="chevron_right" color={m3.color.onSurfaceVariant} size={18} />
            </PixelPressable>
          ))}
        </View>
      ) : null}

      <SectionHeading icon="box" title={t("home.toolsLabel")} />
      <View style={styles.toolGrid}>
        {OPS_TOOL_ROUTES.map((tool) => (
          <PixelPressable
            key={tool.route}
            fullWidth
            rootStyle={styles.toolRoot}
            onPress={() => router.push(tool.route as never)}
            accessibilityRole="link"
            accessibilityLabel={t(tool.label)}
            contentStyle={styles.toolContent}
          >
            <PixelGlyph name={tool.icon} color={m3.color.primary} size={20} />
            <View style={styles.toolCopy}>
              <Text variant="body" style={styles.toolTitle}>{t(tool.label)}</Text>
              <Text variant="caption" style={styles.toolSub}>{t(tool.sub)}</Text>
            </View>
          </PixelPressable>
        ))}
      </View>
    </View>
  );

  return shell(
    <FlatList
      data={ownerToday.kind === "ready" ? ownerToday.data.routines : []}
      keyExtractor={(routine) => routine.id}
      renderItem={({ item }) => {
        const done = ownerToday.kind === "ready" && ownerToday.data.completedIds.has(item.id);
        const completing = completingIds.has(item.id);
        return (
          <PixelPressable
            fullWidth
            variant={done ? "inset" : "bevel"}
            disabled={done || completing}
            onPress={() => void completeRoutine(item)}
            accessibilityRole="checkbox"
            accessibilityLabel={done ? t("today.doneA11y", { title: item.title }) : t("today.completeA11y", { title: item.title })}
            accessibilityState={{ checked: done, busy: completing }}
            contentStyle={styles.routineContent}
          >
            <PixelGlyph name={done ? "check" : "schedule"} color={done ? m3.color.primary : m3.color.onSurfaceVariant} size={20} />
            <Text variant="body" style={done ? styles.routineDone : styles.routineTitle}>{item.title}</Text>
            <Text variant="caption" style={styles.routineMeta}>
              {item.recurrence === "daily" ? t("card.daily") : t("card.weekly")}
            </Text>
          </PixelPressable>
        );
      }}
      ItemSeparatorComponent={() => <View style={styles.itemGap} />}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={ownerToday.kind === "empty" ? <StatePanel icon="inbox" message={t("today.empty")} /> : null}
      ListFooterComponent={listFooter}
      contentContainerStyle={styles.listContent}
      removeClippedSubviews={Platform.OS === "android"}
    />,
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", padding: m3.spacing.s4 },
  listContent: { padding: m3.spacing.s4, paddingBottom: m3.spacing.s8 },
  headerStack: { gap: m3.spacing.s3, marginBottom: m3.spacing.s3 },
  footerStack: { gap: m3.spacing.s4, marginTop: m3.spacing.s4 },
  itemGap: { height: m3.spacing.s2 },
  stateSurface: { width: "100%" },
  stateContent: { gap: m3.spacing.s3, alignItems: "flex-start" },
  stateMessage: { color: m3.color.onSurfaceVariant, lineHeight: m3.type.bodyMedium.line, paddingBottom: m3.spacing.s1 },
  sectionHeading: { flexDirection: "row", alignItems: "flex-start", gap: m3.spacing.s3 },
  sectionCopy: { flex: 1, minWidth: 0, gap: m3.spacing.s1 },
  sectionTitle: { color: m3.color.onSurface },
  sectionBody: { color: m3.color.onSurfaceVariant, lineHeight: m3.type.bodySmall.line },
  heroContent: { minHeight: 92, flexDirection: "row", alignItems: "center", gap: m3.spacing.s4, paddingVertical: m3.spacing.s4 },
  heroCopy: { flex: 1, gap: m3.spacing.s2 },
  heroCount: { color: m3.color.onPrimaryContainer, fontFamily: m3.font.mono },
  heroStreak: { color: m3.color.onSurfaceVariant },
  routineContent: { minHeight: m3.minTouch, flexDirection: "row", alignItems: "center", gap: m3.spacing.s3 },
  routineTitle: { flex: 1, minWidth: 0, color: m3.color.onSurface, lineHeight: m3.type.bodyMedium.line },
  routineDone: { flex: 1, minWidth: 0, color: m3.color.onSurfaceVariant, lineHeight: m3.type.bodyMedium.line, textDecorationLine: "line-through" },
  routineMeta: { color: m3.color.onSurfaceVariant, textAlign: "right" },
  noticeContent: { minHeight: m3.minTouch, flexDirection: "row", alignItems: "center", gap: m3.spacing.s2 },
  noticeText: { flex: 1, color: m3.color.onSurface, lineHeight: m3.type.bodyMedium.line },
  noticeDanger: { flex: 1, color: m3.color.error, lineHeight: m3.type.bodyMedium.line },
  patternContent: { minHeight: m3.minTouch, flexDirection: "row", alignItems: "center", gap: m3.spacing.s3 },
  patternCopy: { flex: 1, minWidth: 0, gap: m3.spacing.s1 },
  patternTitle: { color: m3.color.onSurface },
  patternBody: { color: m3.color.onSurfaceVariant, lineHeight: m3.type.bodySmall.line },
  actionContent: { minHeight: m3.minTouch, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: m3.spacing.s2 },
  actionText: { flex: 1, color: m3.color.onSurface, textAlign: "center" },
  choiceGrid: { flexDirection: "row", flexWrap: "wrap", gap: m3.spacing.s2 },
  choiceRoot: { width: "48%", minWidth: 128, flexGrow: 1 },
  choiceContent: { minHeight: m3.minTouch, alignItems: "center", justifyContent: "center" },
  choiceText: { color: m3.color.onSurface, textAlign: "center" },
  choiceTextSelected: { color: m3.color.onPrimaryContainer, textAlign: "center" },
  helperText: { color: m3.color.onSurfaceVariant, lineHeight: m3.type.bodyMedium.line },
  errorText: { color: m3.color.error, lineHeight: m3.type.bodyMedium.line },
  primaryContent: { minHeight: m3.minTouch, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: m3.spacing.s2 },
  primaryText: { color: m3.color.onSurface, textAlign: "center" },
  adherence: { color: m3.color.primary, fontFamily: m3.font.mono },
  consentContent: { gap: m3.spacing.s3, paddingVertical: m3.spacing.s4 },
  consentActions: { flexDirection: "row", flexWrap: "wrap", gap: m3.spacing.s2 },
  recommendations: { gap: m3.spacing.s3 },
  recContent: { gap: m3.spacing.s3, paddingVertical: m3.spacing.s4 },
  recHeading: { flexDirection: "row", alignItems: "flex-start", gap: m3.spacing.s2 },
  recTitle: { flex: 1, minWidth: 0, color: m3.color.onSurface, lineHeight: m3.type.titleMedium.line },
  recReason: { color: m3.color.onSurfaceVariant, lineHeight: m3.type.bodyMedium.line },
  recMeta: { color: m3.color.primary, fontFamily: m3.font.mono },
  recActions: { flexDirection: "row", flexWrap: "wrap", gap: m3.spacing.s2 },
  recActionRoot: { minWidth: 128, flexBasis: 140, flexGrow: 1 },
  recActionContent: { minHeight: m3.minTouch, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: m3.spacing.s2 },
  recActionText: { flex: 1, color: m3.color.onSurface, textAlign: "center" },
  actionTextDisabled: { flex: 1, color: m3.color.onSurfaceVariant, textAlign: "center" },
  pickStack: { gap: m3.spacing.s2 },
  routeContent: { minHeight: m3.minTouch, flexDirection: "row", alignItems: "center", gap: m3.spacing.s2 },
  routeText: { flex: 1, minWidth: 0, color: m3.color.onSurface, lineHeight: m3.type.bodyMedium.line },
  routeTextMuted: { flex: 1, minWidth: 0, color: m3.color.onSurfaceVariant, lineHeight: m3.type.bodyMedium.line },
  toolGrid: { flexDirection: "row", flexWrap: "wrap", gap: m3.spacing.s2 },
  toolRoot: { width: "48%", minWidth: 128, flexGrow: 1 },
  toolContent: { minHeight: 72, flexDirection: "row", alignItems: "flex-start", gap: m3.spacing.s2 },
  toolCopy: { flex: 1, minWidth: 0, gap: m3.spacing.s1 },
  toolTitle: { color: m3.color.onSurface, lineHeight: m3.type.bodyMedium.line },
  toolSub: { color: m3.color.onSurfaceVariant, lineHeight: m3.type.bodySmall.line },
});
