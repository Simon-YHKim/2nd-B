import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFocusEffect } from "expo-router";
import { accountTransitionSnapshot, captureAccountOwnerLease, subscribeAccountTransition } from "../auth/account-epoch";
import { isTimeoutError, TimeoutError, withTimeout } from "../async/with-timeout";
import { getSupabaseClient } from "../supabase/client";
import { withSystemTagsColumn } from "../records/system-tags";
import { loadCorePersonaSnapshot, type CorePersonaSnapshot } from "./build";
import { mergeEvidence, type OriginShard, type RawRecordRow, type RawSourceRow } from "./evidence";

export const CORE_EVIDENCE_READ_TIMEOUT_MS = 10_000;
/** Both archives are required; an error response must not wait for its peer. */
export async function loadCoreBrainEvidence(userId: string, locale: "en" | "ko", assertCurrent: () => void): Promise<OriginShard[]> {
  assertCurrent();
  const client = getSupabaseClient();
  const records = withSystemTagsColumn((present) => {
    // This callback may run again after a missing-column response. Its legacy
    // SELECT belongs to the same live owner/attempt/deadline as the first read.
    assertCurrent();
    return client.from("records")
      .select(present ? "id, kind, topic, created_at, tags, system_tags" : "id, kind, topic, created_at, tags")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(24);
  })
    .then((result) => { if (result.error) throw result.error; return (result.data ?? []) as unknown as RawRecordRow[]; });
  assertCurrent();
  const sources = Promise.resolve(client.from("sources").select("id, kind, title, captured_at, tags")
    .eq("user_id", userId).order("captured_at", { ascending: false }).limit(24))
    .then((result) => { if (result.error) throw result.error; return (result.data ?? []) as RawSourceRow[]; });
  const [rows, clips] = await Promise.all([records, sources]);
  return mergeEvidence(rows, clips, locale);
}

type Data = { evidence: OriginShard[]; persona: CorePersonaSnapshot | null };
type Scope = { ownerId: string | null; locale: "en" | "ko"; lease: ReturnType<typeof captureAccountOwnerLease> };
type Key = { scope: Scope; reloadKey: number; evidenceReloadKey: number };
type Session = { key: Key; cancel: () => void; active: boolean; ready: boolean; autoAllowed: boolean };
type State = { session: Session; status: "loading" | "error" | "timeout"; data: null }
  | { session: Session; status: "ready"; data: Data };

/** Primary evidence and saved fields. Brightness remains a separate follow-up. */
export function useCoreEvidenceRead(
  ownerId: string | null, enabled: boolean, locale: "en" | "ko", reloadKey: number, evidenceReloadKey: number,
  onRetry: () => void, onConnection: () => void,
) {
  const transition = useSyncExternalStore(subscribeAccountTransition, accountTransitionSnapshot, accountTransitionSnapshot);
  const scope = useMemo<Scope>(() => ({ ownerId, locale, lease: ownerId && enabled ? captureAccountOwnerLease(ownerId) : null }), [ownerId, enabled, locale, transition]);
  const key = useMemo<Key>(() => ({ scope, reloadKey, evidenceReloadKey }), [scope, reloadKey, evidenceReloadKey]);
  const currentKey = useRef(key); currentKey.current = key;
  const sessionRef = useRef<Session | null>(null);
  const cache = useRef<{ scope: Scope; reloadKey: number; data: Data | null; error?: "error" | "timeout" } | null>(null);
  const callbacks = useRef({ onRetry, onConnection }); callbacks.current = { onRetry, onConnection };
  const [state, setState] = useState<State | null>(null);
  const owns = useCallback((session: Session) => sessionRef.current === session && session.active
    && currentKey.current === session.key && !!session.key.scope.lease?.isCurrent(), []);

  useEffect(() => subscribeAccountTransition(() => {
    const session = sessionRef.current;
    if (session?.key.scope === scope && !scope.lease?.isCurrent()) session.cancel();
  }), [scope]);
  useFocusEffect(useCallback(() => {
    if (!scope.ownerId || !scope.lease?.isCurrent()) return;
    let cancel!: () => void;
    const cancelled = new Promise<never>((_, reject) => { cancel = () => reject(new Error("Core read no longer owned")); });
    const session: Session = {
      key, active: true, ready: false, autoAllowed: reloadKey === 0 && evidenceReloadKey === 0,
      cancel: () => { session.active = false; session.autoAllowed = false; cancel(); },
    };
    sessionRef.current = session;
    setState({ session, status: "loading", data: null });
    const cached = cache.current?.scope === scope && cache.current.reloadKey === reloadKey ? cache.current : null;
    // A failed initial snapshot stays failed on focus; only its explicit retry
    // may re-run the full snapshot path. Successful focus refresh stays cheap.
    if (cached?.error && !cached.data) {
      session.autoAllowed = false;
      void cancelled.catch(() => {});
      setState({ session, status: cached.error, data: null });
      return () => { session.active = false; session.autoAllowed = false; if (sessionRef.current === session) sessionRef.current = null; };
    }
    const previous = cached?.data ?? null;
    const fullRead = previous === null;
    const deadline = Date.now() + CORE_EVIDENCE_READ_TIMEOUT_MS;
    let finished = false;
    const requireCurrent = () => {
      if (!owns(session) || finished) throw new Error("Core read no longer owned");
      if (Date.now() >= deadline) throw new TimeoutError(CORE_EVIDENCE_READ_TIMEOUT_MS, "Core evidence");
    };
    const owner = scope.ownerId;
    const work = Promise.resolve().then(async (): Promise<Data> => {
      requireCurrent();
      const evidence = await loadCoreBrainEvidence(owner, scope.locale, requireCurrent);
      requireCurrent();
      // Refocus refreshes evidence; only mount/full retry reads the saved snapshot.
      const snapshot = fullRead ? evidence.length > 0 ? await loadCorePersonaSnapshot(owner, requireCurrent) : null : previous.persona;
      requireCurrent();
      return { evidence, persona: snapshot };
    });
    void withTimeout(Promise.race([work, cancelled]), CORE_EVIDENCE_READ_TIMEOUT_MS, "Core evidence")
      .then((data) => {
        if (!owns(session)) return;
        cache.current = { scope, reloadKey, data }; session.ready = true;
        setState({ session, status: "ready", data });
        if (fullRead && data.persona) callbacks.current.onConnection();
      })
      .catch((error: unknown) => {
        if (!owns(session)) return;
        session.autoAllowed = false;
        const status = isTimeoutError(error) ? "timeout" : "error";
        cache.current = { scope, reloadKey, data: previous, error: status };
        setState({ session, status, data: null });
      }).finally(() => { finished = true; });
    return () => { session.cancel(); if (sessionRef.current === session) sessionRef.current = null; };
  }, [scope, key, reloadKey, evidenceReloadKey, owns]));

  const visible = state && owns(state.session) ? state : null;
  const session = visible?.session ?? null;
  const isCurrent = useCallback(() => !!session && owns(session), [session, owns]);
  const canAutoPropose = useCallback(() => !!session && owns(session) && session.ready && session.autoAllowed, [session, owns]);
  const invalidateAuto = useCallback(() => { if (session && owns(session)) session.autoAllowed = false; }, [session, owns]);
  const retry = () => {
    if (!visible || !owns(visible.session) || (visible.status !== "error" && visible.status !== "timeout")) return;
    // Invalidate before React renders the increment: a queued claim cannot commit.
    visible.session.cancel(); callbacks.current.onRetry();
  };
  return { status: visible?.status ?? "loading", data: visible?.data ?? null, scope: session,
    isCurrent, canAutoPropose, invalidateAuto, retry };
}
