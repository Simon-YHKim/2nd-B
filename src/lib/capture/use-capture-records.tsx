import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { isTimeoutError, withTimeout } from "../async/with-timeout";
import { accountTransitionSnapshot, captureAccountOwnerLease, subscribeAccountTransition } from "../auth/account-epoch";
import { countRecordsByKind, listRecentRecords } from "../records/create";

export const CAPTURE_RECORD_READ_TIMEOUT_MS = 10_000;
type RecentRecord = Awaited<ReturnType<typeof listRecentRecords>>[number];
type ResourceRead<T> =
  | { status: "loading"; value: null; errorKey: null }
  | { status: "failed"; value: null; errorKey: string }
  | { status: "ready"; value: T; errorKey: null };
type ReadState = {
  ownerId: string;
  epoch: number;
  generation: number;
  records: ResourceRead<readonly RecentRecord[]>;
  count: ResourceRead<number>;
};
const EMPTY_ROWS: readonly RecentRecord[] = [];
const LOADING = { status: "loading", value: null, errorKey: null } as const;

/** Only the shipped full capture's record reads; retry never saves or calls a model. */
export function useCaptureRecords(userId: string | null, authLoading: boolean) {
  const transition = useSyncExternalStore(subscribeAccountTransition, accountTransitionSnapshot, accountTransitionSnapshot);
  const lease = useMemo(() => userId && !authLoading ? captureAccountOwnerLease(userId) : null, [userId, authLoading, transition]);
  const generation = useRef(0);
  const mounted = useRef(false);
  const cancelWait = useRef<(() => void) | null>(null);
  const [read, setRead] = useState<ReadState | null>(null);

  const refresh = useCallback(() => {
    if (!mounted.current || !lease?.isCurrent()) return;
    const request = ++generation.current;
    cancelWait.current?.();
    const owner = { ownerId: lease.ownerId, epoch: lease.epoch, generation: request };
    const current = () => mounted.current && request === generation.current && lease.isCurrent();
    setRead({ ...owner, records: LOADING, count: LOADING });
    // Stop waiting and clear deadlines on replacement/unmount. The service read
    // itself may finish later; ownership and attempt checks reject that result.
    const cancelled = new Promise<never>((_, reject) => {
      cancelWait.current = () => reject(new Error("Capture read no longer owned"));
    });
    const load = <K extends "records" | "count">(key: K, work: () => Promise<NonNullable<ReadState[K]["value"]>>) => {
      const pending = Promise.resolve().then(() => {
        if (!current()) throw new Error("Capture read no longer owned");
        return work();
      });
      void withTimeout(Promise.race([pending, cancelled]), CAPTURE_RECORD_READ_TIMEOUT_MS, "Capture records")
        .then((value) => {
          if (current()) setRead((previous) => current() && previous?.generation === request
            ? { ...previous, [key]: { status: "ready", value, errorKey: null } } : previous);
        })
        .catch((error: unknown) => {
          if (current()) setRead((previous) => current() && previous?.generation === request
            ? { ...previous, [key]: { status: "failed", value: null,
              errorKey: isTimeoutError(error) ? "common:errors.network" : "common:errors.unknown" } } : previous);
        });
    };
    // A failed recent list must not hide a known usage count, or vice versa.
    load("records", () => listRecentRecords(lease.ownerId));
    load("count", () => countRecordsByKind(lease.ownerId, "journal", { requireCount: true }));
  }, [lease]);

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => { mounted.current = false; generation.current += 1; cancelWait.current?.(); };
  }, [refresh]);

  // Hide an old owner's result during the render before effect cleanup, too.
  const owned = lease?.isCurrent() && read?.ownerId === lease.ownerId && read.epoch === lease.epoch ? read : null;
  const records = owned?.records ?? LOADING;
  const count = owned?.count ?? LOADING;
  const status = records.status === "failed" || count.status === "failed" ? "failed"
    : records.status === "ready" && count.status === "ready" ? "ready" : "loading";
  return {
    status,
    rowsStatus: records.status,
    rows: records.value ?? EMPTY_ROWS,
    journalCount: count.value,
    errorKey: count.errorKey ?? records.errorKey,
    refresh,
    isOwnerCurrent: () => mounted.current && lease?.isCurrent() === true,
    isCountCurrent: () => count.status === "ready" && mounted.current && owned?.generation === generation.current && lease?.isCurrent() === true,
  };
}

export function CaptureRecordReadNotice({ read }: { read: ReturnType<typeof useCaptureRecords> }) {
  const { t } = useTranslation("common");
  if (read.status === "ready") return null;
  return (
    <View style={{ gap: 8 }}>
      <Text variant="body" color="textMuted" accessibilityLiveRegion="polite">
        {read.errorKey ? t(read.errorKey) : "..."}
      </Text>
      {read.status === "failed" ? <Button label={t("actions.retry")} onPress={read.refresh} /> : null}
    </View>
  );
}
