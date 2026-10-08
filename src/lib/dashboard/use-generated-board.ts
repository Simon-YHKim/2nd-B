import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { captureAccountOwnerLease, subscribeAccountTransition } from "../auth/account-epoch";
import { currentPrivacyChange, subscribePrivacyChanges } from "../privacy/changes";
import { DASHBOARD_GENERATION_ENABLED, requestBoardGeneration } from "./generation-client";
import { EMPTY_GENERATED_BOARD, type GeneratedBoard } from "./board/generated";

export function useGeneratedBoard(ownerId: string, isMinor: boolean | null, locale: string, summaryOpen: boolean) {
  const [snapshot, setSnapshot] = useState<{ owner: string; value: GeneratedBoard } | null>(null);
  useFocusEffect(useCallback(() => {
    if (!DASHBOARD_GENERATION_ENABLED || isMinor !== false) return;
    const owner = captureAccountOwnerLease(ownerId); if (!owner) return;
    let active = true; let generation = 0; let controller: AbortController | null = null;
    const clear = () => { generation += 1; controller?.abort(); controller = null; setSnapshot(null); };
    const read = async () => {
      if (!active || !owner.isCurrent() || AppState.currentState === "background" || controller ||
          currentPrivacyChange(ownerId)?.prefs.recommendations === false) return;
      const current = ++generation; controller = new AbortController();
      const results = await Promise.all((summaryOpen ? ["open", "triage", "summary"] as const : ["open", "triage"] as const)
        .map((action) => requestBoardGeneration(ownerId, action, locale, controller!.signal)));
      if (!active || current !== generation || !owner.isCurrent()) return;
      controller = null;
      const value = { ...EMPTY_GENERATED_BOARD };
      for (const result of results) if (result.ok) {
        if (result.seat === "daily_note") value.note = result.value;
        if (result.seat === "day_summary") value.summary = result.value;
        if (result.seat === "inbox_triage") value.triage = result.value;
      }
      setSnapshot({ owner: ownerId, value });
    };
    clear(); void read();
    const timer = setInterval(() => { void read(); }, 60_000);
    const stopOwner = subscribeAccountTransition(clear);
    const stopPrivacy = subscribePrivacyChanges((change) => { if (change.ownerId === ownerId) clear(); });
    const app = AppState.addEventListener("change", (state) => { clear(); if (state === "active") void read(); });
    return () => { active = false; generation += 1; controller?.abort(); clearInterval(timer); stopOwner(); stopPrivacy(); app.remove(); };
  }, [ownerId, isMinor, locale, summaryOpen]));
  useEffect(() => { if (isMinor !== false) setSnapshot(null); }, [isMinor]);
  return DASHBOARD_GENERATION_ENABLED && isMinor === false && snapshot?.owner === ownerId &&
    captureAccountOwnerLease(ownerId)?.isCurrent() && currentPrivacyChange(ownerId)?.prefs.recommendations !== false
    ? snapshot.value : EMPTY_GENERATED_BOARD;
}
