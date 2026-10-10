import { subscribePrivacyChanges } from "@/lib/privacy/changes";
import { PhoneFlatList as FlatList } from "@/components/phone/PhoneUIKit";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Linking,
  Platform,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { Redirect } from "expo-router";
import { useTranslation } from "react-i18next";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import type { AnyGlyphName } from "@/components/pixel/pixel-glyphs";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { Text } from "@/components/ui/Text";
import { IosButton, IosCardHeader, IosGroup, IosIconButton, IosRow, IosText } from "@/components/dashboard/board/IosParts";
import { phoneIos } from "@/lib/theme/phone-ios";
import { usePhoneDesign } from "@/lib/theme/phone-design-context";
import { useAuth } from "@/lib/auth/AuthContext";
import { useAppRouter } from "@/lib/nav/phone-embed";
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
import { readOpsPresentation, writeOpsPresentation } from "@/lib/ops/presentation";
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
  routineReminderId,
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
  { icon: "lightbulb", label: "tools.imagine.label", sub: "tools.imagine.sub", route: "/imagine" },
  { icon: "share", label: "tools.shareCard.label", sub: "tools.shareCard.sub", route: "/share-card" },
  { icon: "book", label: "tools.srs.label", sub: "tools.srs.sub", route: "/srs" },
  { icon: "bubble", label: "tools.callReflection.label", sub: "tools.callReflection.sub", route: "/call-reflection" },
  { icon: "book", label: "tools.reading.label", sub: "tools.reading.sub", route: "/reading" },
  { icon: "sparkle", label: "tools.sideProject.label", sub: "tools.sideProject.sub", route: "/side-project" },
] as const satisfies ReadonlyArray<{
  icon: AnyGlyphName;
  label: string;
  sub: string;
  route: string;
}>;

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
    <View style={boardStyles.recommendation}>
      <IosCardHeader glyph="sparkle" title={recommendation.title} />
      <IosText variant="body" style={boardStyles.text}>
        {recommendation.reason}
      </IosText>
      {recommendation.durationMinutes || recommendation.recurrence ? (
        <IosText variant="caption" style={boardStyles.muted}>
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
        </IosText>
      ) : null}
      <View style={boardStyles.actions}>
        {deviceCalendar ? (
          <IosButton
            glyph="schedule"
            label={t("card.addDevice")}
            onPress={() => onPush("device", recommendation)}
          />
        ) : null}
        <IosButton
          glyph="schedule"
          label={t("card.addGoogle")}
          onPress={() => onPush("google", recommendation)}
        />
        {Platform.OS === "web" ? (
          <IosButton
            glyph="download"
            label={t("card.downloadIcs")}
            onPress={() => onPush("ics", recommendation)}
          />
        ) : null}
        <IosButton
          glyph="share"
          label={t("card.shareList")}
          onPress={() => onPush("share", recommendation)}
        />
        {deviceReminders ? (
          <IosButton
            glyph="schedule"
            label={t("card.remind")}
            onPress={() => onRemind(recommendation)}
          />
        ) : null}
        <IosButton
          glyph="check"
          label={saving ? t("card.saving") : saved ? t("card.saved") : t("card.saveRoutine")}
          disabled={saving || saved}
          busy={saving}
          onPress={() => onSave(recommendation, itemKey)}
        />
      </View>
    </View>
  );
}

function SectionHeading({ icon, title, body, trailing }: {
  icon: AnyGlyphName; title: string; body?: string; trailing?: string;
}) {
  const phone = usePhoneDesign();
  if (phone) return (
    <View style={styles.headingStack}>
      <IosCardHeader glyph={icon} title={title} trailing={trailing ? (
        <IosText variant="caption" style={phoneSettingsStyles.summary}>{trailing}</IosText>
      ) : null} />
      {body ? <IosText variant="caption" style={phoneSettingsStyles.body}>{body}</IosText> : null}
    </View>
  );
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
      {trailing ? <Text variant="caption" style={styles.sectionSummary}>{trailing}</Text> : null}
    </View>
  );
}

export function DeepSpaceOpsScreen({ surface = "settings" }: { surface?: "settings" | "board" } = {}) {
  const router = useAppRouter();
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

  const [group, setGroup] = useState<OpsGroupId | null>(() => readOpsPresentation().group);
  const [domain, setDomain] = useState<OpsDomainId | null>(() => readOpsPresentation().domain);
  const [recommendations, setRecommendations] = useState<OpsRecommendation[]>(() => readOpsPresentation().recommendations);
  const [adherence, setAdherence] = useState<string | null>(() => readOpsPresentation().adherence);
  const [runState, setRunState] = useState<"idle" | "working" | "empty" | "error" | "limit" | "off">("idle");
  const [savedKeys, setSavedKeys] = useState<Set<string>>(() => new Set(readOpsPresentation().savedKeys));
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
    const prior = readOpsPresentation();
    setGroup(prior.group);
    setDomain(prior.domain);
    setRecommendations(prior.recommendations);
    setAdherence(prior.adherence);
    setRunState("idle");
    setSavedKeys(new Set(readOpsPresentation().savedKeys));
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

  useEffect(() => subscribePrivacyChanges((change) => {
    if (change.ownerId !== userId) return;
    runRequestRef.current += 1;
    setRecommendations([]); setAdherence(null); setSavedKeys(new Set());
    setConsentOpen(false); pendingPushRef.current = null;
    setRunState("idle"); setReloadNonce((value) => value + 1);
  }), [userId]);

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
      setSavedKeys(new Set());
      setAdherence(stats ? adherenceChip(stats, i18n.language?.toLowerCase().startsWith("ko") ?? false) : null);
      setRunState(result.length === 0 ? "empty" : "idle");
      writeOpsPresentation({ group, domain: selectedDomain, recommendations: result,
        adherence: stats ? adherenceChip(stats, i18n.language?.toLowerCase().startsWith("ko") ?? false) : null, savedKeys: [] });
      if (result.length > 0) router.push("/dashboard?panel=recommendations" as never);
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
    let routine: OpsRoutine;
    try {
      routine = await createRoutineFromRecommendation(ownerId, selectedDomain, recommendation);
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
      reminderResult = await scheduleRoutineReminder(
        {
          title: recommendation.title,
          description: recommendation.reason,
          startsAtIso: recommendation.startsAtIso ?? nextMorningIso(),
          durationMinutes: recommendation.durationMinutes,
          recurrence: recommendation.recurrence,
        },
        { ownerId, identifier: routineReminderId(ownerId, routine.id) },
      );
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
        // An unsaved recommendation has no owner-visible stable id to cancel.
        // Keep this explicit reminder to one delivery; saved routines use the
        // deterministic id above and may repeat safely.
        recurrence: undefined,
      }, { ownerId });
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
        anchor.download = "polascope-routine.ics";
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

  useEffect(() => {
    if (userId && isCurrentOwner(userId)) writeOpsPresentation({ group, domain, recommendations, adherence, savedKeys: [...savedKeys] });
  }, [userId, group, domain, recommendations, adherence, savedKeys, isCurrentOwner]);

  const shell = (body: ReactNode) => surface === "board" ? <>{body}</> : (
    <DeepSpaceScreen
      active="ops"
      header="none"
      variant="windowed"
      title={t("phone.apps.assistant")}
      onBack={() => router.back()}
    >
      {body}
    </DeepSpaceScreen>
  );

  const recommendationHeader = <IosCardHeader glyph="sparkle" title={t("phone.todayRecommendations")} trailing={
    <IosIconButton glyph="settings" label={t("phone.recommendationSettings")} onPress={() => router.push("/ops")} />
  } />;
  const boardState = (message: string, retry?: () => void) => <View testID="board-recommendations" style={boardStyles.stack}>
    {recommendationHeader}
    <IosText variant="caption" accessibilityRole={retry ? "alert" : undefined} style={boardStyles.muted}>{message}</IosText>
    {retry ? <IosButton glyph="refresh" label={t("common:actions.retry")} onPress={retry} /> : null}
  </View>;
  if (authLoading) {
    if (surface === "board") return boardState(t("common:states.loading"));
    return shell(
      <View style={styles.center}>
        <StatePanel icon="schedule" message={t("common:states.loading")} />
      </View>,
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === null) {
    if (surface === "board") return boardState(t("common:states.loading"));
    return shell(
      <View style={styles.center}>
        <StatePanel icon="schedule" message={t("common:states.loading")} />
      </View>,
    );
  }
  if (profileProbeFailed) {
    if (surface === "board") return boardState(t("common:errors.network"), () => void refreshAuth());
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
      <SectionHeading icon="sparkle" title={t("phone.recommendationSettings")} body={t("hero.subtitle")} />
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
      <SectionHeading icon="schedule" title={t("hero.title")} trailing={
        ownerToday.kind === "ready" || ownerToday.kind === "empty"
          ? `${t("home.ringCount", { done: todayDone, total: todayData.routines.length })} · ${t("today.streak", { count: todayData.streak })}`
          : undefined
      } />
      {ownerToday.kind === "loading" ? (
        <StatePanel icon="schedule" message={t("common:states.loading")} />
      ) : ownerToday.kind === "timeout" || ownerToday.kind === "error" ? (
        <StatePanel
          icon="warning"
          message={t(ownerToday.kind === "timeout" ? "common:errors.network" : "common:errors.unknown")}
          retryLabel={t("common:actions.retry")}
          onRetry={retryReads}
        />
      ) : null}
    </View>
  );

  if (surface === "board") return <View testID="board-recommendations" style={boardStyles.stack}>
    {recommendationHeader}
    {notice ? <IosText variant="caption" accessibilityLiveRegion="polite" accessibilityRole={notice.tone === "danger" ? "alert" : undefined}
      style={boardStyles.muted}>{notice.keys.map((key) => t(key)).join(" ")}</IosText> : null}
    {ownerPrefs.kind === "loading" ? <IosText variant="caption" style={boardStyles.muted}>{t("common:states.loading")}</IosText>
      : ownerPrefs.kind !== "ready" ? <View style={boardStyles.stack}>
        <IosText variant="caption" accessibilityRole="alert" style={boardStyles.muted}>{t("common:errors.network")}</IosText>
        <IosButton glyph="refresh" label={t("common:actions.retry")} onPress={retryReads} />
      </View>
      : !recommendationsAllowed(isMinor, ownerPrefs.data.recommendations) ? <IosText variant="caption" style={boardStyles.muted}>{t("recommend.off")}</IosText>
      : <>
        {recommendations.length === 0 ? <IosText variant="caption" style={boardStyles.muted}>{t("phone.noRecommendations")}</IosText> : null}
        {adherence && recommendations.length > 0 ? <IosText variant="caption" style={boardStyles.muted}>{adherence}</IosText> : null}
        {consentOpen ? <View style={boardStyles.stack}>
          <IosCardHeader glyph="share" title={t("consent.title")} />
          <IosText variant="caption" style={boardStyles.muted}>{t("consent.body")}</IosText>
          <View style={boardStyles.actions}>
            <IosButton glyph="check" label={t("consent.agree")} disabled={consentSaving} busy={consentSaving} onPress={() => void agreeAndPush()} />
            <IosButton glyph="close" label={t("consent.later")} disabled={consentSaving} onPress={declinePush} />
          </View>
        </View> : null}
        {recommendations.map((recommendation, index) => {
          const itemKey = `${domain ?? "none"}:${index}`;
          return <RecommendationCard key={itemKey} recommendation={recommendation} itemKey={itemKey}
            saved={savedKeys.has(itemKey)} saving={savingKey === itemKey} deviceCalendar={deviceCalendar}
            deviceReminders={deviceReminders} t={t} onPush={requestPush}
            onRemind={(item) => void remindRecommendation(item)} onSave={(item, key) => void saveRoutine(item, key)} />;
        })}
        {recommendations.length > 0 ? <IosText variant="caption" style={boardStyles.muted}>{t("recommend.disclaimerBody")}</IosText> : null}
        {recommendations.length > 0 ? <>
        {ownerPicks.kind === "loading" ? <IosText variant="caption" style={boardStyles.muted}>{t("common:states.loading")}</IosText>
          : ownerPicks.kind === "timeout" || ownerPicks.kind === "error" ? <View style={boardStyles.stack}>
            <IosText variant="caption" accessibilityRole="alert" style={boardStyles.muted}>{t(ownerPicks.kind === "timeout" ? "common:errors.network" : "common:errors.unknown")}</IosText>
            <IosButton glyph="refresh" label={t("common:actions.retry")} onPress={retryReads} />
          </View> : null}
        {picksData && (picksData.picks.length > 0 || picksData.suggestions.length > 0) ? <View style={boardStyles.stack}>
          <IosCardHeader glyph="inbox" title={t("today.title")} />
          <IosGroup>
            {picksData.picks.map((id) => <IosRow key={id} title={t(`today.pick.${id}`)}
              onPress={() => router.push(OPS_TODAY_ROUTES[id] as never)} />)}
            {picksData.suggestions.map((id) => <IosRow key={`next-${id}`} title={t(`today.next.${id}`)}
              onPress={() => router.push(OPS_TODAY_ROUTES[id] as never)} />)}
          </IosGroup>
        </View> : null}
        </> : null}
      </>}
  </View>;

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
        onPress={() => router.push("/reminders")}
        accessibilityRole="link"
        accessibilityLabel={t("card.remind")}
        contentStyle={styles.patternContent}
      >
        <View style={styles.sectionCopy}>
          <SectionHeading icon="schedule" title={t("card.remind")} />
        </View>
        <PixelGlyph name="chevron_right" color={m3.color.onSurface} size={18} />
      </PixelPressable>

      <PixelPressable
        fullWidth
        onPress={() => router.push("/insights")}
        accessibilityRole="link"
        accessibilityLabel={t("home.patternsTitle")}
        contentStyle={styles.patternContent}
      >
        <View style={styles.sectionCopy}>
          <SectionHeading icon="sparkle" title={t("home.patternsTitle")} body={t("home.patternsSub")} />
        </View>
        <PixelGlyph name="chevron_right" color={m3.color.onSurface} size={20} />
      </PixelPressable>

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
  headingStack: { gap: m3.spacing.s1 },
  sectionHeading: { flexDirection: "row", alignItems: "flex-start", gap: m3.spacing.s3 },
  sectionCopy: { flex: 1, minWidth: 0, gap: m3.spacing.s1 },
  sectionTitle: { color: m3.color.onSurface },
  sectionBody: { color: m3.color.onSurfaceVariant, lineHeight: m3.type.bodySmall.line },
  sectionSummary: { color: m3.color.onSurfaceVariant, flexShrink: 1, minWidth: 0, textAlign: "right" },
  routineContent: { minHeight: m3.minTouch, flexDirection: "row", alignItems: "center", gap: m3.spacing.s3 },
  routineTitle: { flex: 1, minWidth: 0, color: m3.color.onSurface, lineHeight: m3.type.bodyMedium.line },
  routineDone: { flex: 1, minWidth: 0, color: m3.color.onSurfaceVariant, lineHeight: m3.type.bodyMedium.line, textDecorationLine: "line-through" },
  routineMeta: { color: m3.color.onSurfaceVariant, textAlign: "right" },
  noticeContent: { minHeight: m3.minTouch, flexDirection: "row", alignItems: "center", gap: m3.spacing.s2 },
  noticeText: { flex: 1, color: m3.color.onSurface, lineHeight: m3.type.bodyMedium.line },
  noticeDanger: { flex: 1, color: m3.color.error, lineHeight: m3.type.bodyMedium.line },
  patternContent: { minHeight: m3.minTouch, flexDirection: "row", alignItems: "center", gap: m3.spacing.s3 },
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

// Phone-only styles; the standalone /ops surface keeps its existing styles.
const boardStyles = StyleSheet.create({
  stack: { gap: 6 },
  text: { color: phoneIos.label },
  muted: { color: phoneIos.label2 },
  recommendation: { gap: 6, paddingTop: 6, borderTopWidth: 2, borderTopColor: phoneIos.fill },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});

const phoneSettingsStyles = StyleSheet.create({
  summary: { color: phoneIos.label2, flexShrink: 1, minWidth: 0, textAlign: "right" },
  body: { color: phoneIos.label2, lineHeight: 18 },
});
