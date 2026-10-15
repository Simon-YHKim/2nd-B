import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFocusEffect } from "expo-router";
import { accountTransitionSnapshot, captureAccountOwnerLease, subscribeAccountTransition } from "../auth/account-epoch";
import { isTimeoutError, withTimeout } from "../async/with-timeout";
import { getWikiPage } from "../wiki/queries";

type Scope = { lease: ReturnType<typeof captureAccountOwnerLease>; isChatCurrent: () => boolean };
type ChatScope = { key: string; conversation: { readonly current: number } };
type Drawer = { scope: Scope; slugs: readonly string[] };
type Attempt = { drawer: Drawer; slug: string; cancel: () => void };
type Read = { attempt: Attempt; status: "loading" | "missing" | "error" | "timeout" };

/** A citation is a slug, so resolve it before navigating to a page ID. This
 * ephemeral drawer belongs to its current chat, never to the persisted session. */
export function useCitedWikiPage(userId: string | null, chatScope: ChatScope, onResolved: (pageId: string) => void) {
  const ownerSnapshot = useSyncExternalStore(subscribeAccountTransition, accountTransitionSnapshot, accountTransitionSnapshot);
  const { key, conversation } = chatScope;
  const conversationId = conversation.current;
  const scope = useMemo<Scope>(() => ({
    lease: userId ? captureAccountOwnerLease(userId) : null,
    isChatCurrent: () => conversation.current === conversationId,
  }), [userId, ownerSnapshot, key, conversation, conversationId]);
  const currentScope = useRef(scope); currentScope.current = scope;
  const navigate = useRef(onResolved); navigate.current = onResolved;
  const mounted = useRef(true);
  const focused = useRef(false);
  const drawerRef = useRef<Drawer | null>(null);
  const active = useRef<Attempt | null>(null);
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [read, setRead] = useState<Read | null>(null);

  const cancelAttempt = useCallback(() => {
    const previous = active.current;
    active.current = null;
    previous?.cancel();
  }, []);
  const invalidate = useCallback(() => {
    drawerRef.current = null;
    cancelAttempt();
  }, [cancelAttempt]);
  const ownsScope = () => mounted.current && focused.current && currentScope.current === scope && scope.isChatCurrent() && !!scope.lease?.isCurrent();
  const ownsDrawer = (candidate: Drawer | null): candidate is Drawer =>
    ownsScope() && candidate !== null && candidate.scope === scope && drawerRef.current === candidate;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; invalidate(); };
  }, [invalidate]);
  useEffect(() => subscribeAccountTransition(() => {
    if (!scope.lease?.isCurrent()) invalidate();
  }), [scope, invalidate]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    // Returning to a screen does not resume an old navigation request.
    invalidate(); setDrawer(null); setRead(null);
    return () => { focused.current = false; invalidate(); };
  }, [scope, invalidate]));

  const openDrawer = (slugs: readonly string[]) => {
    if (!ownsScope()) return;
    invalidate();
    const next = { scope, slugs: [...slugs] };
    drawerRef.current = next;
    setDrawer(next); setRead(null);
  };
  const closeDrawer = () => {
    if (!ownsDrawer(drawer)) return;
    invalidate(); setDrawer(null); setRead(null);
  };
  const run = (slug: string) => {
    if (!ownsDrawer(drawer) || !drawer.slugs.includes(slug)) return;
    cancelAttempt();
    let cancel!: () => void;
    const cancelled = new Promise<null>((resolve) => { cancel = () => resolve(null); });
    const attempt: Attempt = { drawer, slug, cancel };
    active.current = attempt;
    const isCurrent = () => ownsDrawer(attempt.drawer) && active.current === attempt;
    setRead({ attempt, status: "loading" });
    // Deferring the query also fences an owner hold raised in the tap's turn.
    const query = Promise.resolve().then(() => isCurrent() ? getWikiPage(scope.lease!.ownerId, slug) : null);
    void withTimeout(Promise.race([query, cancelled]), 10_000, "Cited wiki page")
      .then((page) => {
        if (!isCurrent()) return;
        if (!page) { setRead({ attempt, status: "missing" }); return; }
        invalidate(); setDrawer(null); setRead(null);
        navigate.current(page.id);
      })
      .catch((error: unknown) => {
        if (isCurrent()) setRead({ attempt, status: isTimeoutError(error) ? "timeout" : "error" });
      });
  };
  const visibleDrawer = ownsDrawer(drawer) ? drawer : null;
  const visibleRead = visibleDrawer && read?.attempt === active.current ? read : null;
  const retry = () => {
    if (visibleRead && active.current === visibleRead.attempt && (visibleRead.status === "error" || visibleRead.status === "timeout")) {
      run(visibleRead.attempt.slug);
    }
  };
  return {
    slugs: visibleDrawer?.slugs ?? null,
    slug: visibleRead?.attempt.slug ?? null,
    status: visibleRead?.status ?? "idle",
    openDrawer, closeDrawer, openCitedPage: run, retry,
  };
}
