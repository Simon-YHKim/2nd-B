import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { captureAccountOwnerLease, subscribeAccountTransition } from "../auth/account-epoch";
import { currentPrivacyChange, subscribePrivacyChanges } from "../privacy/changes";
import { DASHBOARD_GENERATION_ENABLED, requestBoardGeneration } from "./generation-client";
import { EMPTY_GENERATED_BOARD, type GeneratedBoard } from "./board/generated";

export function useGeneratedBoard(ownerId: string, isMinor: boolean | null, locale: string, summaryOpen: boolean, refresh = 0) {
  const [snapshot, setSnapshot] = useState<{ owner: string; value: GeneratedBoard } | null>(null);
  useFocusEffect(useCallback(() => {
    if (!DASHBOARD_GENERATION_ENABLED || isMinor !== false) return;
    const owner = captureAccountOwnerLease(ownerId); if (!owner) return;
    let active = true; let generation = 0; let controller: AbortController | null = null;
    const clear = () => { generation += 1; controller?.abort(); controller = null; setSnapshot(null); };
    const read = async () => {
      if (!active || !owner.isCurrent() || AppState.currentState === "background" || controller) return;
      if (currentPrivacyChange(ownerId)?.prefs.recommendations === false) {
        setSnapshot({ owner: ownerId, value: { ...EMPTY_GENERATED_BOARD, states: { note: "denied", triage: "denied", summary: "denied" } } });
        return;
      }
      const current = ++generation; controller = new AbortController();
      setSnapshot((previous) => previous?.owner === ownerId ? previous : { owner: ownerId,
        value: { ...EMPTY_GENERATED_BOARD, states: { note: "loading", triage: "loading", summary: "loading" } } });
      const results = await Promise.all((summaryOpen ? ["open", "triage", "summary"] as const : ["open", "triage"] as const)
        .map((action) => requestBoardGeneration(ownerId, action, locale, controller!.signal)));
      if (!active || current !== generation || !owner.isCurrent()) return;
      controller = null;
      const value: GeneratedBoard = { ...EMPTY_GENERATED_BOARD, states: { note: "loading", triage: "loading", summary: "loading" } };
      for (const [index, result] of results.entries()) {
        const key = (["note", "triage", "summary"] as const)[index];
        value.states![key] = result.ok ? "ready" : result.reason === "invalid_output" ? "unavailable" : result.reason;
        if (!result.ok) continue;
        if (result.seat === "daily_note") value.note = result.value;
        if (result.seat === "day_summary") value.summary = result.value;
        if (result.seat === "inbox_triage") value.triage = result.value;
      }
      setSnapshot({ owner: ownerId, value });
    };
    clear(); void read();
    const timer = setInterval(() => { void read(); }, 60_000);
    const stopOwner = subscribeAccountTransition(clear);
    const stopPrivacy = subscribePrivacyChanges((change) => { if (change.ownerId === ownerId) { clear(); void read(); } });
    const app = AppState.addEventListener("change", (state) => { clear(); if (state === "active") void read(); });
    return () => { active = false; generation += 1; controller?.abort(); clearInterval(timer); stopOwner(); stopPrivacy(); app.remove(); };
  }, [ownerId, isMinor, locale, summaryOpen, refresh]));
  useEffect(() => { if (isMinor !== false) setSnapshot(null); }, [isMinor]);
  if (!DASHBOARD_GENERATION_ENABLED || isMinor !== false || !captureAccountOwnerLease(ownerId)?.isCurrent()) return EMPTY_GENERATED_BOARD;
  if (currentPrivacyChange(ownerId)?.prefs.recommendations === false) return { ...EMPTY_GENERATED_BOARD,
    states: { note: "denied", triage: "denied", summary: "denied" } } satisfies GeneratedBoard;
  return snapshot?.owner === ownerId ? snapshot.value : { ...EMPTY_GENERATED_BOARD,
    states: { note: "loading", triage: "loading", summary: "loading" } } satisfies GeneratedBoard;
}
