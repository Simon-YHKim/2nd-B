import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFocusEffect } from "expo-router";
import { accountTransitionSnapshot, captureAccountOwnerLease, subscribeAccountTransition } from "../auth/account-epoch";
import { isTimeoutError, withTimeout } from "../async/with-timeout";
import { getWikiPageById } from "./queries";
import type { WikiPageRow } from "./types";

export const FOCUSED_WIKI_READ_TIMEOUT_MS = 10_000;

/** A citation outside the loaded list is a separate read, never a default row. */
export function useFocusedWikiPage(
  userId: string | null,
  focusPageId: string | undefined,
  pages: readonly WikiPageRow[],
  listPending: boolean,
  authLoading: boolean,
) {
  const transition = useSyncExternalStore(subscribeAccountTransition, accountTransitionSnapshot, accountTransitionSnapshot);
  const lease = useMemo(() => userId && !authLoading ? captureAccountOwnerLease(userId) : null, [userId, authLoading, transition]);
  const [attempt, setAttempt] = useState(0);
  const key = useMemo(() => ({ userId, focusPageId, lease, attempt }), [userId, focusPageId, lease, attempt]);
  const currentKey = useRef(key);
  currentKey.current = key;
  const generation = useRef(0);
  const focused = useRef(false);
  const [read, setRead] = useState<{
    key: typeof key;
    status: "loading" | "ready" | "missing" | "error" | "timeout";
    page: WikiPageRow | null;
  } | null>(null);
  const inWindow = !listPending && lease?.isCurrent() ? pages.find((page) => page.id === focusPageId) : undefined;

  useFocusEffect(useCallback(() => {
    if (!userId || !focusPageId || listPending || !lease?.isCurrent()) return;
    focused.current = true;
    let active = true;
    const request = ++generation.current;
    const current = () => active && currentKey.current === key && request === generation.current && lease.isCurrent();
    if (inWindow) return () => { active = false; focused.current = false; generation.current += 1; };
    setRead({ key, status: "loading", page: null });
    let cancel!: () => void;
    const cancelled = new Promise<never>((_, reject) => {
      cancel = () => reject(new Error("Focused wiki read no longer owned"));
    });
    const work = Promise.resolve().then(() => {
      if (!current()) throw new Error("Focused wiki read no longer owned");
      return getWikiPageById(userId, focusPageId);
    });
    void withTimeout(Promise.race([work, cancelled]), FOCUSED_WIKI_READ_TIMEOUT_MS, "Focused wiki page")
      .then((page) => { if (current()) setRead({ key, status: page ? "ready" : "missing", page }); })
      .catch((error: unknown) => { if (current()) setRead({ key, status: isTimeoutError(error) ? "timeout" : "error", page: null }); });
    return () => { active = false; focused.current = false; generation.current += 1; cancel(); };
  }, [key, userId, focusPageId, listPending, lease, inWindow]));

  const retry = useCallback(() => {
    if (!focused.current || currentKey.current !== key || !lease?.isCurrent()) return;
    generation.current += 1;
    setAttempt((value) => value + 1);
  }, [key, lease]);
  const owned = !listPending && lease?.isCurrent() && read?.key === key ? read : null;
  return {
    key,
    status: !focusPageId ? "idle" : inWindow ? "ready" : owned?.status ?? "loading",
    page: inWindow ?? owned?.page ?? null,
    retry,
  };
}
