import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFocusEffect } from "expo-router";
import { accountTransitionSnapshot, captureAccountOwnerLease, subscribeAccountTransition } from "../auth/account-epoch";
import { isTimeoutError, TimeoutError, withTimeout } from "../async/with-timeout";
import { listRecordsByIds } from "../records/create";
import { loadRoleCards, roleEvidenceIds, type RoleCard } from "./role-cards";

export const ROLE_EVIDENCE_READ_TIMEOUT_MS = 10_000;
type Pair = { cards: RoleCard[]; evidence: Awaited<ReturnType<typeof listRecordsByIds>> };
type ReadState = { status: "loading" | "error" | "timeout"; pair: null }
  | { status: "ready"; pair: Pair };
type Scope = { ownerId: string | null; lease: ReturnType<typeof captureAccountOwnerLease>; refresh: number; routeKey: string };
type Attempt = { cancel: () => void; finished: boolean; deadline: number };
type Session = { scope: Scope; attempt: Attempt | null };
type Snapshot = { session: Session; attempt: Attempt; state: ReadState };
const LOADING: ReadState = { status: "loading", pair: null };

/** The graph needs both reads. A retry never generates or ratifies role cards. */
export function useRoleEvidenceRead(ownerId: string | null, authLoading: boolean, refresh: number, routeKey: string) {
  const transition = useSyncExternalStore(subscribeAccountTransition, accountTransitionSnapshot, accountTransitionSnapshot);
  const scope = useMemo<Scope>(() => ({
    ownerId, lease: ownerId && !authLoading ? captureAccountOwnerLease(ownerId) : null, refresh, routeKey,
    // Refresh and route identity are read ownership, even when the owner repeats.
  }), [ownerId, authLoading, transition, refresh, routeKey]);
  const currentScope = useRef(scope); currentScope.current = scope;
  const sessionRef = useRef<Session | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const owns = useCallback((session: Session) => sessionRef.current === session
    && currentScope.current === session.scope && !!session.scope.lease?.isCurrent(), []);

  const load = useCallback(async (session: Session) => {
    if (!owns(session) || !session.scope.ownerId) return;
    session.attempt?.cancel();
    let cancel!: () => void;
    const cancelled = new Promise<never>((_, reject) => { cancel = () => reject(new Error("Role read no longer owned")); });
    const attempt: Attempt = {
      cancel: () => { attempt.finished = true; cancel(); }, finished: false,
      deadline: Date.now() + ROLE_EVIDENCE_READ_TIMEOUT_MS,
    };
    session.attempt = attempt;
    const current = () => owns(session) && session.attempt === attempt;
    const requireCurrent = () => {
      if (!current() || attempt.finished) throw new Error("Role read no longer owned");
      if (Date.now() >= attempt.deadline) throw new TimeoutError(ROLE_EVIDENCE_READ_TIMEOUT_MS, "Role evidence");
    };
    setSnapshot({ session, attempt, state: LOADING });
    const owner = session.scope.ownerId;
    const work = Promise.resolve().then(async () => {
      requireCurrent();
      const cards = await loadRoleCards(owner);
      // An abandoned/timed-out first stage must not start another query.
      requireCurrent();
      const ids = roleEvidenceIds(cards);
      const evidence = ids.length ? await listRecordsByIds(owner, ids) : [];
      requireCurrent();
      return { cards, evidence };
    });
    try {
      const pair = await withTimeout(Promise.race([work, cancelled]), ROLE_EVIDENCE_READ_TIMEOUT_MS, "Role evidence");
      if (current()) setSnapshot({ session, attempt, state: { status: "ready", pair } });
    } catch (error: unknown) {
      if (current()) setSnapshot({ session, attempt, state: { status: isTimeoutError(error) ? "timeout" : "error", pair: null } });
    } finally { attempt.finished = true; }
  }, [owns]);

  useEffect(() => subscribeAccountTransition(() => {
    const session = sessionRef.current;
    if (session?.scope === scope && !scope.lease?.isCurrent()) {
      sessionRef.current = null; session.attempt?.cancel();
    }
  }), [scope]);
  useFocusEffect(useCallback(() => {
    if (!scope.lease?.isCurrent()) return;
    const session: Session = { scope, attempt: null };
    sessionRef.current = session;
    void load(session);
    return () => { if (sessionRef.current === session) sessionRef.current = null; session.attempt?.cancel(); };
  }, [scope, load]));

  const visible = snapshot && owns(snapshot.session) && snapshot.session.attempt === snapshot.attempt ? snapshot : null;
  const retry = () => {
    if (visible && owns(visible.session) && visible.session.attempt === visible.attempt
      && (visible.state.status === "error" || visible.state.status === "timeout")) void load(visible.session);
  };
  return { ...(visible?.state ?? LOADING), retry };
}
