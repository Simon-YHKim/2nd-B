// The reasoning screen's own usage read (T43). It owns one strict read per focus, account
// epoch and request, and publishes a result only to that same scope:
// - pending (first or refresh) shows "...", never the previous number as current;
// - an I/O, schema or bucket failure is "error", a 10 s silence is "timeout"; both offer a
//   retry that repeats only the two usage reads;
// - an owner change, hold, same-owner return, blur or unmount drops every late result
//   without a state write, and an account transition cancels the read before React re-renders.
// `refresh` keeps one identity per confirmed owner generation (the epoch of a published,
// non-pending lease), so the screen's recovery effect (deps [refresh, userId]) never
// re-runs because of a refresh, a retry, a focus change or a hold, and a callback captured
// by an older generation (A -> B -> A, even with no render in between) is refused.
// A ready result also carries a ready token that is dropped synchronously by a refresh,
// a blur, an account transition and unmount; `confirmCurrent` reads it at press time so a
// run button captured in an earlier render cannot start on a number that is no longer current.
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

import {
  captureAccountOwnerLease,
  currentAccountEpoch,
  subscribeAccountTransition,
  type AccountOwnerLease,
} from "@/lib/auth/account-epoch";
import { readReasoningUsageStrict } from "@/lib/entitlements/reasoning-usage-read";
import type { ReasoningUsage } from "@/lib/entitlements/usage";

export const REASONING_USAGE_READ_TIMEOUT_MS = 10_000;

export type ReasoningUsageView =
  | { status: "pending" }
  | { status: "ready"; usage: ReasoningUsage }
  | { status: "error" }
  | { status: "timeout" };

type Held = {
  ownerId: string;
  epoch: number;
  session: number;
  request: number;
  status: "ready" | "error" | "timeout";
  usage?: ReasoningUsage;
};

class StaleUsageRead extends Error {
  constructor() {
    super("stale reasoning usage read");
    this.name = "StaleUsageRead";
  }
}

const PENDING: ReasoningUsageView = { status: "pending" };

type ReadyToken = { lease: AccountOwnerLease; session: number };

export function useReasoningUsageRead(userId: string | null, enabled: boolean): {
  view: ReasoningUsageView;
  retry: () => void;
  refresh: () => void;
  /** Press-time check: true only while the shown ready number is still this owner's current one. */
  confirmCurrent: () => boolean;
} {
  const accountEpoch = currentAccountEpoch();
  const [request, setRequest] = useState(0);
  const [session, setSession] = useState(0);
  const [held, setHeld] = useState<Held | null>(null);
  const sessionSeq = useRef(0);
  const mounted = useRef(true);
  const readyRef = useRef<ReadyToken | null>(null);
  // The generation rotates only when a new valid lease is confirmed; during a hold there is
  // no lease, so the previous identity stays (and refuses itself, its epoch being stale).
  const generation = useRef<{ ownerId: string | null; epoch: number | null }>({ ownerId: null, epoch: null });
  const renderLease = userId ? captureAccountOwnerLease(userId) : null;
  if (renderLease && (generation.current.ownerId !== userId || generation.current.epoch !== renderLease.epoch)) {
    generation.current = { ownerId: userId, epoch: renderLease.epoch };
  } else if (!userId && generation.current.ownerId !== null) {
    generation.current = { ownerId: null, epoch: null };
  }
  const genOwner = generation.current.ownerId;
  const genEpoch = generation.current.epoch;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      readyRef.current = null;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!enabled || !userId) return undefined;
      const lease = captureAccountOwnerLease(userId);
      if (!lease || lease.epoch !== accountEpoch) return undefined;
      sessionSeq.current += 1;
      const mySession = sessionSeq.current;
      readyRef.current = null;
      setSession(mySession);
      let live = true;
      let settled = false;
      const current = () => live && mounted.current && lease.isCurrent() && sessionSeq.current === mySession;
      const unsubscribe = subscribeAccountTransition(() => {
        if (lease.isCurrent()) return;
        live = false;
        if (readyRef.current?.session === mySession) readyRef.current = null;
      });
      const finish = (status: Held["status"], usage?: ReasoningUsage) => {
        if (settled || !current()) return;
        settled = true;
        clearTimeout(timer);
        readyRef.current = status === "ready" ? { lease, session: mySession } : null;
        setHeld({ ownerId: userId, epoch: lease.epoch, session: mySession, request, status, ...(usage ? { usage } : {}) });
      };
      const timer = setTimeout(() => finish("timeout"), REASONING_USAGE_READ_TIMEOUT_MS);
      void readReasoningUsageStrict(userId, {
        assertCurrent: () => {
          if (!current()) throw new StaleUsageRead();
        },
      }).then(
        (usage) => finish("ready", usage),
        () => finish("error"),
      );
      return () => {
        live = false;
        clearTimeout(timer);
        unsubscribe();
        if (readyRef.current?.session === mySession) readyRef.current = null;
      };
    }, [enabled, userId, accountEpoch, request]),
  );

  const current =
    held !== null &&
    (held.status !== "ready" || readyRef.current?.session === held.session) &&
    held.ownerId === userId &&
    held.epoch === accountEpoch &&
    held.session === session &&
    held.request === request;
  const view: ReasoningUsageView = !current
    ? PENDING
    : held.status === "ready" && held.usage
      ? { status: "ready", usage: held.usage }
      : { status: held.status === "timeout" ? "timeout" : "error" };

  // One identity per confirmed generation. The callback re-checks its own owner and epoch
  // against a fresh lease, and the queued updater re-checks the generation, so an older
  // generation's callback cannot start a read in the newer scope.
  const bump = useCallback(() => {
    if (!mounted.current || !userId || genOwner !== userId || genEpoch === null) return;
    const lease = captureAccountOwnerLease(userId);
    if (!lease || lease.epoch !== genEpoch) return;
    readyRef.current = null;
    setRequest((value) =>
      generation.current.ownerId === genOwner && generation.current.epoch === genEpoch ? value + 1 : value,
    );
  }, [userId, genOwner, genEpoch]);

  // Bound to the exact ready token this render shows. A press captured in this render stays
  // valid only while that same token object is still the current one, so a later ready
  // (a refresh that found the cap spent, a refocus, an A -> B -> A return) cannot
  // re-authorize a callback from an earlier render.
  const shownToken = current && held.status === "ready" ? readyRef.current : null;
  const confirmCurrent = useCallback(() => {
    const token = shownToken;
    return (
      token !== null &&
      readyRef.current === token &&
      mounted.current &&
      token.session === sessionSeq.current &&
      token.lease.isCurrent()
    );
  }, [shownToken]);

  return { view, retry: bump, refresh: bump, confirmCurrent };
}
