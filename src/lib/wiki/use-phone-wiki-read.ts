import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFocusEffect } from "expo-router";
import { accountTransitionSnapshot, captureAccountOwnerLease, subscribeAccountTransition } from "../auth/account-epoch";
import { isTimeoutError, withTimeout } from "../async/with-timeout";
import { getBacklinks, getWikiPageById, listWikiPages } from "./queries";
import type { WikiPageRow } from "./types";

export const PHONE_WIKI_READ_TIMEOUT_MS = 10_000;
type Read<T> =
  | { status: "loading"; value: null; errorKey: null }
  | { status: "failed"; value: null; errorKey: string }
  | { status: "ready"; value: T; errorKey: null };
const LOADING = { status: "loading", value: null, errorKey: null } as const;

/** The phone draws its own wiki list and page, including hosted citation links. */
export function usePhoneWikiRead(ownerId: string, listOpen: boolean, pageId: string | null) {
  const transition = useSyncExternalStore(subscribeAccountTransition, accountTransitionSnapshot, accountTransitionSnapshot);
  const lease = useMemo(() => captureAccountOwnerLease(ownerId), [ownerId, transition]);
  const [attempt, setAttempt] = useState(0);
  const scope = useMemo(() => ({ ownerId, listOpen, pageId, lease, attempt }), [ownerId, listOpen, pageId, lease, attempt]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const generation = useRef(0);
  const focused = useRef(false);
  const [read, setRead] = useState<{
    scope: typeof scope;
    list: Read<WikiPageRow[]>;
    page: Read<WikiPageRow | null>;
    backlinks: Read<WikiPageRow[]>;
  } | null>(null);

  useFocusEffect(useCallback(() => {
    if ((!listOpen && !pageId) || !lease?.isCurrent()) return;
    focused.current = true;
    let active = true;
    const request = ++generation.current;
    const current = () => active && currentScope.current === scope && request === generation.current && lease.isCurrent();
    setRead({ scope, list: LOADING, page: LOADING, backlinks: LOADING });
    let cancel!: () => void;
    const cancelled = new Promise<never>((_, reject) => {
      cancel = () => reject(new Error("Phone wiki read no longer owned"));
    });
    const load = <K extends "list" | "page" | "backlinks">(key: K, work: () => Promise<NonNullable<typeof read>[K]["value"]>) => {
      const pending = Promise.resolve().then(() => {
        if (!current()) throw new Error("Phone wiki read no longer owned");
        return work();
      });
      void withTimeout(Promise.race([pending, cancelled]), PHONE_WIKI_READ_TIMEOUT_MS, "Phone wiki")
        .then((value) => {
          if (current()) setRead((previous) => current() && previous?.scope === scope
            ? { ...previous, [key]: { status: "ready", value, errorKey: null } } : previous);
        })
        .catch((error: unknown) => {
          if (current()) setRead((previous) => current() && previous?.scope === scope
            ? { ...previous, [key]: { status: "failed", value: null,
              errorKey: isTimeoutError(error) ? "common:errors.network" : "common:errors.unknown" } } : previous);
        });
    };
    if (listOpen) load("list", () => listWikiPages(ownerId, { limit: 200 }));
    if (pageId) {
      load("page", () => getWikiPageById(ownerId, pageId));
      load("backlinks", () => getBacklinks(ownerId, pageId));
    }
    return () => { active = false; focused.current = false; generation.current += 1; cancel(); };
  }, [scope, listOpen, pageId, ownerId, lease]));

  const retry = useCallback(() => {
    if (!focused.current || currentScope.current !== scope || !lease?.isCurrent()) return;
    generation.current += 1;
    setAttempt((previous) => previous + 1);
  }, [scope, lease]);
  const owned = read?.scope === scope && lease?.isCurrent() ? read : null;
  return { list: owned?.list ?? LOADING, page: owned?.page ?? LOADING, backlinks: owned?.backlinks ?? LOADING, retry };
}
