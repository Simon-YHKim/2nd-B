// /ops - Routines (O-R3 P1, vision axis 2: personal assistant).
//
// One screen, one promise: pick ONE life area, get a few concrete next steps
// drawn from your own pieces, and hand the ones you accept to YOUR apps
// (calendar / share sheet). Push consent is standing (Simon, 2026-06-11):
// the first push asks once, stores privacy_prefs.ops_push = true, and the
// Privacy screen owns the off switch. The consent ask renders INLINE (no
// overlay - touch rule O-7).

import { useEffect, useMemo, useRef, useState } from "react";
import { Linking, Platform, ScrollView, Share, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect } from "expo-router";

import { PremiumAppShell, PremiumLoadingState, SceneHero } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { gameboy } from "@/lib/theme/gameboy-tokens";
import { semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { useProgression } from "@/lib/progression/useProgression";
import { VILLAGE_UI } from "@/lib/village-ui";
import { systemLocaleFor } from "@/lib/i18n/locales";
import { fetchPrivacyPrefs, savePrivacyPrefs } from "@/lib/supabase/privacy";
import type { PrivacyPrefs } from "@/lib/privacy/prefs";
import { OPS_GROUP_IDS, domainsForGroup, type OpsDomainId, type OpsGroupId } from "@/lib/ops/domains";
import { recommendForDomain, recommendationsAllowed, type OpsRecommendation } from "@/lib/ops/recommend";
import { buildChecklistShareText, buildGoogleCalendarUrl, buildIcsEvent } from "@/lib/ops/push";
import { addEventToDeviceCalendar, deviceCalendarSupported } from "@/lib/ops/device-calendar";
import { remindersSupported, scheduleRoutineReminder } from "@/lib/ops/reminders";
import { OPS_DAILY_LIMIT, bumpOpsUsage, readOpsUsage } from "@/lib/ops/usage";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceOpsScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";

type RunState = "idle" | "working" | "empty" | "error" | "limit" | "off";

// Recommendations without their own time still need one for calendar hand-off;
// "tomorrow morning" is an honest, editable default (the user's calendar app
// shows the form before saving anyway).
function nextMorningIso(now: Date = new Date()): string {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(9, 0, 0, 0);
  return next.toISOString();
}

function OpsLegacy() {
  const { t, i18n } = useTranslation("ops");
  const { userId, loading, isMinor, hasProfile } = useAuth();
  const progression = useProgression();
  const locale = systemLocaleFor(i18n.language);
  // The model anchors on the EN canonical domain label regardless of UI language.
  const tEn = useMemo(() => i18n.getFixedT("en", "ops"), [i18n]);

  const [group, setGroup] = useState<OpsGroupId | null>(null);
  const [domain, setDomain] = useState<OpsDomainId | null>(null);
  const [recs, setRecs] = useState<OpsRecommendation[]>([]);
  const [runState, setRunState] = useState<RunState>("idle");
  const [usedToday, setUsedToday] = useState(0);
  const [prefs, setPrefs] = useState<PrivacyPrefs | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  // One-line outcome of the last device hand-off / reminder attempt.
  const [pushNote, setPushNote] = useState<
    "saved" | "denied" | "reminded" | "remindDenied" | "remindFailed" | null
  >(null);
  const pendingPushRef = useRef<(() => void) | null>(null);
  // Stable for the lifetime of the screen: native runtime + module present.
  const deviceCalendar = useMemo(() => deviceCalendarSupported(), []);
  const deviceReminders = useMemo(() => remindersSupported(), []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void fetchPrivacyPrefs(userId).then((value) => {
      if (!cancelled) setPrefs(value);
    });
    void readOpsUsage(userId).then((count) => {
      if (!cancelled) setUsedToday(count);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={t("loading")} />
        </View>
      </PremiumAppShell>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === false) return <Redirect href="/complete-profile" />;

  const dailyLimit = OPS_DAILY_LIMIT[progression.tier];
  const limitReached = usedToday >= dailyLimit;
  const domains = group ? domainsForGroup(group) : [];

  function selectGroup(next: OpsGroupId): void {
    setGroup(next);
    setDomain(null);
  }

  async function runRecommend(): Promise<void> {
    if (!userId || !domain || runState === "working") return;
    // D-20 / PROTOCOL §36: honor the minor recommendations lock at the gate. `recommendations`
    // is server-clamped OFF and non-promotable for 16-17 minors (privacy/prefs.ts); without this
    // the wiki snapshot reached the recommend LLM call ungated. Adults are unaffected.
    if (!recommendationsAllowed(isMinor, prefs?.recommendations)) {
      setRunState("off");
      return;
    }
    if (limitReached) {
      setRunState("limit");
      return;
    }
    setRunState("working");
    setRecs([]);
    setPushNote(null);
    try {
      const out = await recommendForDomain({
        userId,
        locale,
        domainId: domain,
        domainLabel: tEn(`domains.${domain}`),
        minor: isMinor === true,
        recommendationsPref: prefs?.recommendations,
        // Explicit user run (and a quota bump below) - never serve the cache.
        forceFresh: true,
      });
      const used = await bumpOpsUsage(userId);
      setUsedToday(used);
      setRecs(out);
      setRunState(out.length === 0 ? "empty" : "idle");
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[ops] recommend failed", (e as Error).message);
      setRunState("error");
    }
  }

  // Standing-consent gate: allowed -> push immediately; not yet -> hold the
  // action and unfold the inline ask. "Not now" keeps the card untouched.
  function requestPush(action: () => void): void {
    if (prefs?.ops_push) {
      action();
      return;
    }
    pendingPushRef.current = action;
    setConsentOpen(true);
  }

  async function agreeAndPush(): Promise<void> {
    if (!userId) return;
    const base = prefs ?? (await fetchPrivacyPrefs(userId));
    const next = { ...base, ops_push: true };
    try {
      await savePrivacyPrefs(userId, next);
      setPrefs(next);
    } catch (e) {
      // The push the user just approved still runs; only persistence failed
      // (they'll be asked again next time - honest degradation).
      if (typeof console !== "undefined") console.warn("[ops] consent save failed", (e as Error).message);
    }
    const pending = pendingPushRef.current;
    pendingPushRef.current = null;
    setConsentOpen(false);
    pending?.();
  }

  function declinePush(): void {
    pendingPushRef.current = null;
    setConsentOpen(false);
  }

  function openGoogleCalendar(rec: OpsRecommendation): void {
    const url = buildGoogleCalendarUrl({
      title: rec.title,
      description: rec.reason,
      startsAtIso: rec.startsAtIso ?? nextMorningIso(),
      durationMinutes: rec.durationMinutes,
      recurrence: rec.recurrence,
    });
    if (!url) return;
    void Linking.openURL(url).catch((e) => {
      if (typeof console !== "undefined") console.warn("[ops] calendar open failed", (e as Error).message);
    });
  }

  function downloadIcs(rec: OpsRecommendation): void {
    const ics = buildIcsEvent({
      title: rec.title,
      description: rec.reason,
      startsAtIso: rec.startsAtIso ?? nextMorningIso(),
      durationMinutes: rec.durationMinutes,
      recurrence: rec.recurrence,
    });
    if (!ics || typeof document === "undefined") return;
    try {
      const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "2nd-brain-routine.ics";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[ops] ics download failed", (e as Error).message);
    }
  }

  function shareChecklist(rec: OpsRecommendation): void {
    const message = buildChecklistShareText(rec.title, rec.checklist ?? [rec.reason]);
    void Share.share({ message }).catch((e) => {
      if (typeof console !== "undefined") console.warn("[ops] share failed", (e as Error).message);
    });
  }

  // P2: prefilled OS event form - the user reviews and saves inside their own
  // calendar app (Samsung/Google/Apple all sit behind the device provider).
  async function addToDeviceCalendar(rec: OpsRecommendation): Promise<void> {
    setPushNote(null);
    const result = await addEventToDeviceCalendar({
      title: rec.title,
      description: rec.reason,
      startsAtIso: rec.startsAtIso ?? nextMorningIso(),
      durationMinutes: rec.durationMinutes,
      recurrence: rec.recurrence,
    });
    if (result === "saved") setPushNote("saved");
    else if (result === "denied") setPushNote("denied");
    // canceled: the user closed the OS form on purpose - no copy needed.
  }

  // On-device reminder: NOT behind the ops_push gate - nothing leaves the
  // device or this app; the explicit tap + the OS notification permission
  // prompt are the consent (see src/lib/ops/reminders.ts).
  async function remindRoutine(rec: OpsRecommendation): Promise<void> {
    setPushNote(null);
    const result = await scheduleRoutineReminder({
      title: rec.title,
      description: rec.reason,
      startsAtIso: rec.startsAtIso ?? nextMorningIso(),
      recurrence: rec.recurrence,
    });
    if (result === "scheduled") setPushNote("reminded");
    else if (result === "denied") setPushNote("remindDenied");
    else if (result === "error") setPushNote("remindFailed");
  }

  const PUSH_NOTE_KEY: Record<NonNullable<typeof pushNote>, string> = {
    saved: "push.savedNote",
    denied: "push.deniedNote",
    reminded: "push.reminderSetNote",
    remindDenied: "push.reminderDeniedNote",
    remindFailed: "push.reminderFailedNote",
  };
  const pushNoteIsDanger = pushNote === "denied" || pushNote === "remindDenied" || pushNote === "remindFailed";

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SceneHero
          eyebrow={t("hero.title")}
          title={t("hero.title")}
          subtitle={t("hero.subtitle")}
          island={VILLAGE_UI.rhythm.island}
          worker={VILLAGE_UI.rhythm.worker}
          accent={VILLAGE_UI.rhythm.accent}
          speech={VILLAGE_UI.rhythm.speech[locale]}
        />

        <View style={styles.chipRow}>
          {OPS_GROUP_IDS.map((id, index) => (
            <Button
              key={id}
              label={t(`groups.${id}`)}
              accessibilityRole="radio"
              accessibilityLabel={t("picker.optionA11yLabel", {
                label: t(`groups.${id}`),
                index: index + 1,
                total: OPS_GROUP_IDS.length,
                state: group === id ? t("picker.stateSelected") : t("picker.stateAvailable"),
              })}
              accessibilityHint={t("picker.groupHint")}
              variant={group === id ? "primary" : "secondary"}
              accessibilityState={{ selected: group === id }}
              onPress={() => selectGroup(id)}
              full={false}
            />
          ))}
        </View>

        {group ? (
          <View style={styles.chipRow}>
            {domains.map((id, index) => (
              <Button
                key={id}
                label={t(`domains.${id}`)}
                accessibilityRole="radio"
                accessibilityLabel={t("picker.optionA11yLabel", {
                  label: t(`domains.${id}`),
                  index: index + 1,
                  total: domains.length,
                  state: domain === id ? t("picker.stateSelected") : t("picker.stateAvailable"),
                })}
                accessibilityHint={t("picker.domainHint")}
                variant={domain === id ? "primary" : "secondary"}
                accessibilityState={{ selected: domain === id }}
                onPress={() => setDomain(id)}
                full={false}
              />
            ))}
          </View>
        ) : (
          <Text variant="subtle" color="textSubtle">
            {t("states.emptyDomain")}
          </Text>
        )}

        {domain ? (
          <Button
            label={runState === "working" ? t("recommend.working") : t("recommend.cta")}
            accessibilityHint={t("recommend.ctaHint")}
            onPress={() => void runRecommend()}
            disabled={runState === "working" || limitReached}
          />
        ) : null}

        {runState === "limit" || (domain && limitReached) ? (
          <Text variant="subtle" color="textMuted">
            {t("recommend.limit")}
          </Text>
        ) : null}
        {runState === "empty" ? (
          <Text variant="subtle" color="textMuted">
            {t("recommend.empty")}
          </Text>
        ) : null}
        {runState === "error" ? (
          <Text variant="subtle" color="danger">
            {t("recommend.error")}
          </Text>
        ) : null}
        {runState === "off" ? (
          <Text variant="subtle" color="textMuted">
            {t("recommend.off")}
          </Text>
        ) : null}

        {consentOpen ? (
          <View style={styles.consentCard}>
            <Text variant="body" color="text">
              {t("consent.title")}
            </Text>
            <Text variant="subtle" color="textMuted">
              {t("consent.body")}
            </Text>
            <View style={styles.actionRow}>
              <Button
                label={t("consent.agree")}
                accessibilityHint={t("consent.agreeHint")}
                onPress={() => void agreeAndPush()}
                full={false}
              />
              <Button
                label={t("consent.later")}
                accessibilityHint={t("consent.laterHint")}
                variant="ghost"
                onPress={declinePush}
                full={false}
              />
            </View>
          </View>
        ) : null}

        {recs.map((rec, index) => (
          <View key={`${index}-${rec.title}`} style={styles.recCard}>
            <Text variant="body" color="text">
              {rec.title}
            </Text>
            <Text variant="subtle" color="textMuted">
              {rec.reason}
            </Text>
            {rec.durationMinutes || rec.recurrence ? (
              <Text variant="subtle" color="textSubtle">
                {[
                  rec.durationMinutes ? t("card.durationLabel", { minutes: rec.durationMinutes }) : null,
                  rec.recurrence === "daily" ? t("card.daily") : rec.recurrence === "weekly" ? t("card.weekly") : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            ) : null}
            <View style={styles.actionRow}>
              {deviceCalendar ? (
                <Button
                  label={t("card.addDevice")}
                  accessibilityHint={t("card.addDeviceHint")}
                  variant="secondary"
                  onPress={() => requestPush(() => void addToDeviceCalendar(rec))}
                  full={false}
                />
              ) : null}
              <Button
                label={t("card.addGoogle")}
                accessibilityHint={t("card.addGoogleHint")}
                variant="secondary"
                onPress={() => requestPush(() => openGoogleCalendar(rec))}
                full={false}
              />
              {Platform.OS === "web" ? (
                <Button
                  label={t("card.downloadIcs")}
                  accessibilityHint={t("card.downloadIcsHint")}
                  variant="secondary"
                  onPress={() => requestPush(() => downloadIcs(rec))}
                  full={false}
                />
              ) : null}
              <Button
                label={t("card.shareList")}
                accessibilityHint={t("card.shareListHint")}
                variant="secondary"
                onPress={() => requestPush(() => shareChecklist(rec))}
                full={false}
              />
              {deviceReminders ? (
                <Button
                  label={t("card.remind")}
                  accessibilityHint={t("card.remindHint")}
                  variant="secondary"
                  onPress={() => void remindRoutine(rec)}
                  full={false}
                />
              ) : null}
            </View>
          </View>
        ))}

        {pushNote ? (
          // liveRegion: the OS form/prompt already closed, so without this
          // announce a screen-reader user gets no confirmation of the outcome.
          <Text
            variant="subtle"
            color={pushNoteIsDanger ? "danger" : "textMuted"}
            accessibilityLiveRegion="polite"
          >
            {t(PUSH_NOTE_KEY[pushNote])}
          </Text>
        ) : null}

        {recs.length > 0 ? (
          <Text variant="subtle" color="textSubtle">
            {t("recommend.disclaimerBody")}
          </Text>
        ) : null}
      </ScrollView>
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  recCard: {
    gap: spacing.xs,
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: gameboy.borderWidth,
    borderRadius: gameboy.radius,
    padding: spacing.md,
  },
  consentCard: {
    gap: spacing.xs,
    backgroundColor: semantic.surface,
    borderColor: semantic.brand,
    borderWidth: gameboy.borderWidth,
    borderRadius: gameboy.radius,
    padding: spacing.md,
  },
});

export default function Ops() {
  if (isDeepSpaceUI()) return <DeepSpaceOpsScreen />;
  return <OpsLegacy />;
}
