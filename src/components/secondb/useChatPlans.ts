import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import { useTranslation } from "react-i18next";
import { captureAccountOwnerLease } from "@/lib/auth/account-epoch";
import { getChatPlanSuggestions, isCurrentChatPlanSuggestion, type ChatPlanSuggestion, type ChatPlanSuggestionState } from "@/lib/chat/plan-suggestions";
import { saveChatPlan } from "@/lib/chat/save-plan";
import type { ChatPlanDraft } from "@/lib/chat/plan-draft";
import type { ChatAction } from "./ChatActionBar";

const candidateKey = (candidate: ChatPlanSuggestion) => `${candidate.conversationId}:${candidate.replyIndex}:${candidate.kind}`;

/** A suggestion opens an editor. Only its confirm handler may save or schedule. */
export function useChatPlans(userId: string | null, state: ChatPlanSuggestionState) {
  const { t } = useTranslation("secondb");
  const [selected, setSelected] = useState<ChatPlanSuggestion | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sheetNotice, setSheetNotice] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const live = useRef({ userId, state });
  live.current = { userId, state };
  const inFlight = useRef<object | null>(null);
  // A failed response does not end this confirmation. Keep its UUID across
  // retries and sheet reopenings; distinct proposals may save identical content.
  const routineIds = useRef(new Map<string, string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; inFlight.current = null; };
  }, []);
  useEffect(() => {
    inFlight.current = null;
    routineIds.current.clear();
    setBusy(false);
    setSelected(null);
    setNotice(null);
    setSheetNotice(null);
    setAccepted(new Set());
  }, [userId, state.conversationId]);

  function open(candidate: ChatPlanSuggestion) {
    if (inFlight.current || !userId || !captureAccountOwnerLease(userId)
      || !isCurrentChatPlanSuggestion(candidate, live.current.state)) return;
    setNotice(null);
    setSheetNotice(null);
    setSelected(candidate);
  }

  async function confirm(draft: ChatPlanDraft) {
    if (!selected || !userId || inFlight.current || accepted.has(candidateKey(selected))) return;
    const lease = captureAccountOwnerLease(userId);
    if (!lease) return;
    if (draft.kind !== selected.kind || !isCurrentChatPlanSuggestion(selected, live.current.state)) {
      setSheetNotice(t("planSuggestion.stale"));
      return;
    }
    const operation = {};
    inFlight.current = operation;
    setBusy(true);
    setSheetNotice(null);
    const generation = state.conversationId;
    const current = () => mounted.current && inFlight.current === operation && lease.isCurrent()
      && live.current.userId === userId && live.current.state.conversationId === generation;
    try {
      const key = candidateKey(selected);
      let routineId = routineIds.current.get(key);
      if (draft.kind === "routine" && !routineId) {
        routineId = Crypto.randomUUID();
        routineIds.current.set(key, routineId);
      }
      const result = await saveChatPlan(userId, draft, { routineId });
      if (!current()) return;
      if (result.status === "saved" || result.status === "scheduled" || result.status === "exported") {
        setAccepted(previous => new Set(previous).add(candidateKey(selected)));
        const reminder = selected.kind === "reminder";
        const key = result.status === "exported" ? "calendarCreated"
          : result.status === "scheduled" ? "reminderSaved"
            : reminder ? result.notification === "scheduled" ? "reminderSaved"
              : result.notification === "denied" ? "reminderSavedReminderDenied"
                : result.notification === "error" ? "reminderSavedReminderFailed" : "reminderSavedNoReminder"
            : result.notification === "denied" ? "routineSavedReminderDenied"
              : result.notification === "error" ? "routineSavedReminderFailed"
                : result.notification === "unavailable" ? "routineSavedNoReminder" : "routineSaved";
        setNotice(t(`planSuggestion.${key}`));
        setSelected(null);
      } else {
        const key = result.status === "invalid" && result.validation ? `validation.${result.validation}`
          : result.status === "denied" ? "reminderDenied"
            : result.status === "unavailable" ? "unavailable"
              : result.status === "stale" ? "stale" : "saveFailed";
        setSheetNotice(t(`planSuggestion.${key}`));
      }
    } catch {
      if (current()) setSheetNotice(t("planSuggestion.saveFailed"));
    } finally {
      if (inFlight.current === operation) {
        inFlight.current = null;
        if (mounted.current) setBusy(false);
      }
    }
  }

  const actions: ChatAction[] = getChatPlanSuggestions(state)
    .filter(candidate => !accepted.has(candidateKey(candidate)))
    .map(candidate => ({
      id: `plan-${candidate.kind}`, label: t(`planSuggestion.${candidate.kind}Button`),
      hint: t("planSuggestion.reviewHint"), disabled: busy,
      onPress: () => open(candidate),
    }));
  return {
    actions, notice, busy,
    sheetKey: selected ? `${userId}:${candidateKey(selected)}` : "closed",
    sheetProps: {
      suggestion: selected, busy, notice: sheetNotice, webReminder: Platform.OS === "web",
      onClose: () => { if (!inFlight.current) setSelected(null); }, onConfirm: confirm,
    },
  };
}
