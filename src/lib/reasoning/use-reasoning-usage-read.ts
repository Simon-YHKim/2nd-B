// The reasoning screen's own usage read (T43). It owns one strict read per focus, account
// epoch and request, and publishes a result only to that same scope:
// - pending (first or refresh) shows "...", never the previous number as current;
// - an I/O, schema or bucket failure is "error", a 10 s silence is "timeout"; both offer a
//   retry that repeats only the two usage reads;
// - an owner change, hold, same-owner return, blur or unmount drops every late result
//   without a state write, and an account transition cancels the read before React re-renders.
// `refresh` keeps one identity per signed-in owner generation, so the screen's recovery
// effect (deps [refresh, userId]) never re-runs because of a refresh or retry, and a
// callback captured by an older owner generation (A -> B -> A) is refused.
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

import { captureAccountOwnerLease, currentAccountEpoch, subscribeAccountTransition } from "@/lib/auth/account-epoch";
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

export function useReasoningUsageRead(userId: string | null, enabled: boolean): {
  view: ReasoningUsageView;
  retry: () => void;
  refresh: () => void;
} {
  const accountEpoch = currentAccountEpoch();
  const [request, setRequest] = useState(0);
  const [session, setSession] = useState(0);
  const [held, setHeld] = useState<Held | null>(null);
  const sessionSeq = useRef(0);
  const mounted = useRef(true);
  const generation = useRef<{ ownerId: string | null; gen: number }>({ ownerId: userId, gen: 0 });
  if (generation.current.ownerId !== userId) {
    generation.current = { ownerId: userId, gen: generation.current.gen + 1 };
  }
  const gen = generation.current.gen;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!enabled || !userId) return undefined;
      const lease = captureAccountOwnerLease(userId);
      if (!lease || lease.epoch !== accountEpoch) return undefined;
      sessionSeq.current += 1;
      const mySession = sessionSeq.current;
      setSession(mySession);
      let live = true;
      let settled = false;
      const current = () => live && mounted.current && lease.isCurrent() && sessionSeq.current === mySession;
      const unsubscribe = subscribeAccountTransition(() => {
        if (!lease.isCurrent()) live = false;
      });
      const finish = (status: Held["status"], usage?: ReasoningUsage) => {
        if (settled || !current()) return;
        settled = true;
        clearTimeout(timer);
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
      };
    }, [enabled, userId, accountEpoch, request]),
  );

  const current =
    held !== null &&
    held.ownerId === userId &&
    held.epoch === accountEpoch &&
    held.session === session &&
    held.request === request;
  const view: ReasoningUsageView = !current
    ? PENDING
    : held.status === "ready" && held.usage
      ? { status: "ready", usage: held.usage }
      : { status: held.status === "timeout" ? "timeout" : "error" };

  // One identity per owner generation. A queued updater re-checks the generation, so an
  // older owner's callback cannot start a read in the newer scope.
  const bump = useCallback(() => {
    if (!mounted.current || !userId || generation.current.gen !== gen) return;
    if (!captureAccountOwnerLease(userId)) return;
    setRequest((value) => (generation.current.gen === gen ? value + 1 : value));
  }, [userId, gen]);

  return { view, retry: bump, refresh: bump };
}
