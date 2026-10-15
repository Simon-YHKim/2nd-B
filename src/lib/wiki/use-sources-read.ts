import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFocusEffect } from "expo-router";
import { accountTransitionSnapshot, captureAccountOwnerLease, subscribeAccountTransition } from "../auth/account-epoch";
import { isTimeoutError, withTimeout } from "../async/with-timeout";
import { fetchProfileImportedContext, type ProfileImportedContext } from "../supabase/profile-context-import";
import { isProfileContextImportSource } from "./profile-context-source";
import { listSources } from "./queries";
import { downloadRawClipping } from "./storage";
import type { SourceRow } from "./types";

export type SourceBodyState = { kind: "loading" } | { kind: "text"; text: string }
  | { kind: "context"; context: ProfileImportedContext } | { kind: "error"; errorKey: string };
type ListState = { status: "loading" | "error" | "timeout"; rows: null }
  | { status: "ready"; rows: SourceRow[] };
type Scope = { ownerId: string; lease: ReturnType<typeof captureAccountOwnerLease> };
type Attempt = { cancel: () => void; cancelled: Promise<never> };
type PreviewAttempt = Attempt & { row: SourceRow };
type Session = {
  scope: Scope; rows: SourceRow[] | null; expandedId: string | null;
  cache: Map<SourceRow, SourceBodyState>; listAttempt: Attempt | null; previewAttempt: PreviewAttempt | null;
};
type Snapshot = {
  session: Session; list: ListState; listAttempt: Attempt | null;
  expandedId: string | null; body: SourceBodyState | undefined; previewAttempt: PreviewAttempt | null;
};
const LOADING: ListState = { status: "loading", rows: null };
const READ_TIMEOUT_MS = 10_000;
const LIST_LIMIT = 100;
function attempt(): Attempt {
  let cancel!: () => void;
  const cancelled = new Promise<never>((_, reject) => { cancel = () => reject(new Error("Source read no longer owned")); });
  return { cancel, cancelled };
}
function cancelPreview(session: Session) {
  session.previewAttempt?.cancel(); session.previewAttempt = null;
}
function release(session: Session) {
  session.listAttempt?.cancel(); session.listAttempt = null;
  cancelPreview(session); session.rows = null; session.cache.clear();
}

/** Screen-local read state only. None of these retries can run phase1/phase2. */
export function useSourcesRead(ownerId: string) {
  const transition = useSyncExternalStore(subscribeAccountTransition, accountTransitionSnapshot, accountTransitionSnapshot);
  const scope = useMemo<Scope>(() => ({ ownerId, lease: captureAccountOwnerLease(ownerId) }), [ownerId, transition]);
  const currentScope = useRef(scope); currentScope.current = scope;
  const sessionRef = useRef<Session | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const owns = useCallback((session: Session) => sessionRef.current === session
    && currentScope.current === session.scope && !!session.scope.lease?.isCurrent(), []);
  const publish = useCallback((session: Session, patch: Partial<Snapshot>) => {
    if (!owns(session)) return;
    const previous = snapshotRef.current?.session === session ? snapshotRef.current : null;
    const next: Snapshot = {
      session, list: LOADING, listAttempt: null, expandedId: session.expandedId, body: undefined, previewAttempt: null,
      ...previous, ...patch,
    };
    snapshotRef.current = next; setSnapshot(next);
  }, [owns]);

  const loadPreview = useCallback(async (session: Session, row: SourceRow) => {
    if (!owns(session) || !session.rows?.includes(row) || session.expandedId !== row.id) return;
    cancelPreview(session);
    const cached = session.cache.get(row);
    if (cached) { publish(session, { body: cached, previewAttempt: null }); return; }
    const request: PreviewAttempt = { ...attempt(), row };
    session.previewAttempt = request;
    const current = () => owns(session) && session.previewAttempt === request
      && session.rows?.includes(row) && session.expandedId === row.id;
    publish(session, { body: { kind: "loading" }, previewAttempt: request });
    const managed = isProfileContextImportSource(row.frontmatter);
    const inline = row.frontmatter?._body_fallback;
    const fallback = !managed && typeof inline === "string" && inline.trim().length > 0 ? inline : null;
    const work = Promise.resolve().then(async (): Promise<SourceBodyState> => {
      if (!current()) throw new Error("Source preview no longer owned");
      if (managed) return { kind: "context", context: await fetchProfileImportedContext(session.scope.ownerId, row.id) };
      if (row.storage_path?.trim()) return { kind: "text", text: await downloadRawClipping(row.storage_path) };
      if (fallback !== null) return { kind: "text", text: fallback };
      throw new Error("Source body unavailable");
    });
    let body: SourceBodyState;
    try {
      body = await withTimeout(Promise.race([work, request.cancelled]), READ_TIMEOUT_MS, "Source preview");
    } catch (error: unknown) {
      // A real saved inline body remains readable when Storage is unavailable.
      // Managed imports always require the validated active ledger instead.
      body = fallback !== null ? { kind: "text", text: fallback } : {
        kind: "error", errorKey: isTimeoutError(error) ? "common:errors.network" : "common:errors.unknown",
      };
    }
    if (!current()) return;
    if (body.kind === "text" || body.kind === "context") session.cache.set(row, body);
    publish(session, { body });
  }, [owns, publish]);

  const loadList = useCallback(async (session: Session) => {
    if (!owns(session)) return;
    session.listAttempt?.cancel(); cancelPreview(session);
    session.cache.clear(); session.rows = null;
    const request = attempt(); session.listAttempt = request;
    const current = () => owns(session) && session.listAttempt === request;
    publish(session, { list: LOADING, listAttempt: request, body: undefined, previewAttempt: null });
    const work = Promise.resolve().then(() => {
      if (!current()) throw new Error("Source list no longer owned");
      return listSources(session.scope.ownerId, { limit: LIST_LIMIT });
    });
    try {
      const rows = await withTimeout(Promise.race([work, request.cancelled]), READ_TIMEOUT_MS, "Source list");
      if (!current()) return;
      session.rows = rows;
      const expanded = rows.find((row) => row.id === session.expandedId);
      if (!expanded) session.expandedId = null;
      publish(session, { list: { status: "ready", rows }, expandedId: session.expandedId });
      if (expanded) void loadPreview(session, expanded);
    } catch (error: unknown) {
      if (current()) publish(session, { list: { status: isTimeoutError(error) ? "timeout" : "error", rows: null } });
    }
  }, [owns, publish, loadPreview]);

  useEffect(() => subscribeAccountTransition(() => {
    const session = sessionRef.current;
    if (session?.scope === scope && !scope.lease?.isCurrent()) {
      sessionRef.current = null; release(session);
    }
  }), [scope]);
  useFocusEffect(useCallback(() => {
    if (!scope.lease?.isCurrent()) return;
    const session: Session = { scope, rows: null, expandedId: null, cache: new Map(), listAttempt: null, previewAttempt: null };
    sessionRef.current = session;
    void loadList(session);
    return () => { if (sessionRef.current === session) sessionRef.current = null; release(session); };
  }, [scope, loadList]));

  const visible = snapshot && owns(snapshot.session) ? snapshot : null;
  const session = visible?.session;
  // Stable across attempts, but not across owner/focus sessions. Existing
  // post-mutation callers may refresh only the read scope that started them.
  const load = useCallback(async () => { if (session && owns(session)) await loadList(session); }, [session, owns, loadList]);
  const retryList = () => {
    if (visible && owns(visible.session) && visible.session.listAttempt === visible.listAttempt
      && (visible.list.status === "error" || visible.list.status === "timeout")) void loadList(visible.session);
  };
  const toggle = (row: SourceRow) => {
    if (!visible || !owns(visible.session) || visible.list.status !== "ready" || visible.session.rows !== visible.list.rows || !visible.list.rows.includes(row)) return;
    const current = visible.session;
    cancelPreview(current);
    current.expandedId = current.expandedId === row.id ? null : row.id;
    publish(current, { expandedId: current.expandedId, body: undefined, previewAttempt: null });
    if (current.expandedId !== null) void loadPreview(current, row);
  };
  const retryPreview = () => {
    if (visible?.body?.kind === "error" && visible.previewAttempt && owns(visible.session)
      && visible.session.previewAttempt === visible.previewAttempt) void loadPreview(visible.session, visible.previewAttempt.row);
  };
  return {
    list: visible?.list ?? LOADING,
    expandedId: visible?.list.status === "ready" ? visible.expandedId : null,
    body: visible?.body, load, retryList, toggle, retryPreview,
  };
}
