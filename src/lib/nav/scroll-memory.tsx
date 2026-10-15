import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ForwardedRef, type ReactNode } from "react";
import type { FlatList, ScrollView, ScrollViewProps } from "react-native";
import { accountEpochFromSnapshot, accountTransitionSnapshot, captureAccountOwnerLease, currentAccountOwner, subscribeAccountTransition } from "../auth/account-epoch";
import { boundedScroll, readViewMemory, writeViewMemory, type ScrollPosition } from "./view-memory";

const Context = createContext<{ id: string; slots: { next: number }; focused: boolean } | null>(null);

/** Each actual navigation entry owns its scroll offsets, including repeated routes. */
export function ScrollMemoryScope({ id, active, children }: { id: string; active?: boolean; children: ReactNode }) {
  const parent = useContext(Context);
  const focused = active ?? parent?.focused ?? true;
  const slots = useMemo(() => ({ next: 0 }), [id]);
  const value = useMemo(() => ({ id, slots, focused }), [id, slots, focused]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

type Scroller = ScrollView | FlatList<unknown>;

/** One committed entry's optional, one-shot reveal. A ready row is not necessarily visible. */
export interface ScrollRevealRequest {
  readonly token: object;
  readonly target: Readonly<ScrollPosition>;
  readonly ready: boolean;
  isCurrent(): boolean;
  onRevealed(): void;
}

type Reveal = {
  request: ScrollRevealRequest;
  target: ScrollPosition;
  state: "pending" | "applying" | "done" | "cancelled";
};
const emptySize = () => ({ width: 0, height: 0, viewWidth: 0, viewHeight: 0, laidOut: false });
function currentReveal(request: ScrollRevealRequest): boolean {
  try { return request.isCurrent() === true; } catch { return false; }
}
function revealTarget(request: ScrollRevealRequest): ScrollPosition | null {
  try {
    const { x, y } = request.target;
    return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 ? { x, y } : null;
  } catch { return null; }
}

export function useScrollMemory<T extends Scroller>(
  props: ScrollViewProps, forwardedRef: ForwardedRef<T>, list = false,
  priorityReveal?: ScrollRevealRequest | null,
) {
  const scope = useContext(Context);
  const [slot] = useState(() => scope ? scope.slots.next++ : 0);
  const key = scope ? `scroll:${scope.id}:${props.testID ?? slot}` : null;
  const snapshot = useSyncExternalStore(subscribeAccountTransition, accountTransitionSnapshot, accountTransitionSnapshot);
  const hostKey = accountEpochFromSnapshot(snapshot);
  const owner = currentAccountOwner();
  const lease = useMemo(() => owner ? captureAccountOwnerLease(owner) : null, [owner, snapshot]);
  const [, refreshHost] = useState(() => 0);
  // Entry, epoch and host own both measurements and queued work. Old closures
  // retain only this object, never a later entry's handle or size.
  const memory = useMemo(() => ({
    saved: key ? readViewMemory<ScrollPosition>(key) ?? { x: 0, y: 0 } : { x: 0, y: 0 },
    pending: !!key, focused: false, active: false, committed: false,
    node: null as T | null, attached: false, size: emptySize(),
    generation: 0, reveal: null as Reveal | null, consumed: null as object | null,
    frame: null as ReturnType<typeof requestAnimationFrame> | null,
    settle: null as ReturnType<typeof setTimeout> | null,
  }), [key, snapshot]);
  const current = useRef<typeof memory | null>(null);
  const forwardedOwner = useRef<typeof memory | null>(null);
  const size = memory.size;
  const cancelRestore = useCallback(() => {
    memory.generation += 1;
    if (memory.frame !== null) cancelAnimationFrame(memory.frame);
    if (memory.settle !== null) clearTimeout(memory.settle);
    memory.frame = null; memory.settle = null;
  }, [memory]);
  const owns = useCallback(() => current.current === memory && memory.active && lease?.isCurrent() === true, [memory, lease]);
  const visible = useCallback(() => owns() && memory.focused && memory.node !== null, [memory, owns]);
  const restore = useCallback(() => {
    if (!key || !visible()) return;
    const reveal = memory.reveal;
    if (reveal && (reveal.state === "pending" || reveal.state === "applying")) {
      if (!currentReveal(reveal.request)) {
        reveal.state = "cancelled"; memory.consumed = reveal.request.token;
        memory.pending = true; cancelRestore();
      } else {
        if (reveal.state === "applying" || !reveal.request.ready || !memory.size.laidOut
          || !memory.size.viewHeight || !memory.size.height) return;
        cancelRestore();
        const generation = memory.generation, node = memory.node;
        const target = boundedScroll(reveal.target, memory.size.width, memory.size.height,
          memory.size.viewWidth, memory.size.viewHeight);
        const stillCurrent = () => visible() && memory.node === node && memory.generation === generation
          && memory.reveal === reveal && currentReveal(reveal.request);
        if (!stillCurrent()) return;
        // Claim before native callbacks or the recipient can re-enter.
        reveal.state = "applying";
        const retryLater = () => {
          if (memory.reveal === reveal && reveal.state === "applying") reveal.state = "pending";
        };
        try { (node as ScrollView).scrollTo({ ...target, animated: false }); }
        catch { retryLater(); return; }
        if (!stillCurrent()) { retryLater(); return; }
        reveal.state = "done"; memory.consumed = reveal.request.token;
        memory.pending = false; memory.saved = target;
        writeViewMemory(key, target);
        try { reveal.request.onRevealed(); } catch { /* Completion is already claimed. */ }
        return;
      }
    }
    if (!memory.pending || !memory.size.viewHeight || !memory.size.height) return;
    const target = boundedScroll(memory.saved, memory.size.width, memory.size.height,
      memory.size.viewWidth, memory.size.viewHeight);
    cancelRestore();
    const generation = memory.generation, node = memory.node;
    const canRestore = () => visible() && memory.node === node && memory.generation === generation
      && memory.pending && memory.reveal?.state !== "pending" && memory.reveal?.state !== "applying";
    const apply = () => {
      if (list) (node as FlatList<unknown>).scrollToOffset({ offset: props.horizontal ? target.x : target.y, animated: false });
      else (node as ScrollView).scrollTo({ ...target, animated: false });
    };
    memory.frame = requestAnimationFrame(() => {
      if (!canRestore()) return;
      memory.frame = null;
      apply();
      if (!canRestore()) return;
      // Preserve the existing virtualized-content settle, scoped to this job.
      if (target.x === memory.saved.x && target.y === memory.saved.y) memory.settle = setTimeout(() => {
        if (!canRestore()) return;
        memory.settle = null;
        apply();
        if (canRestore()) memory.pending = false;
      }, 180);
    });
  }, [key, visible, memory, cancelRestore, list, props.horizontal]);
  useLayoutEffect(() => {
    current.current = memory; memory.active = true; memory.committed = true;
    return () => {
      memory.active = false; memory.focused = false; cancelRestore();
      if (current.current === memory) current.current = null;
    };
  }, [memory, cancelRestore]);
  useLayoutEffect(() => {
    const focused = scope?.focused !== false;
    if (memory.focused !== focused) {
      cancelRestore(); memory.focused = focused;
      if (focused) {
        memory.saved = key ? readViewMemory<ScrollPosition>(key) ?? { x: 0, y: 0 } : { x: 0, y: 0 };
        memory.pending = !!key;
      }
    }
    // No scope means no authoritative visibility; lists retain their old API.
    const request = key && !list ? priorityReveal ?? null : null;
    if (request?.token !== memory.reveal?.request.token) {
      cancelRestore();
      const target = request ? revealTarget(request) : null;
      memory.reveal = request && target && currentReveal(request)
        ? { request, target, state: memory.consumed === request.token ? "cancelled" : "pending" } : null;
      memory.pending = !!key && memory.reveal?.state !== "pending";
    } else if (request && memory.reveal) {
      const target = revealTarget(request);
      memory.reveal.request = request;
      if (!target || target.x !== memory.reveal.target.x || target.y !== memory.reveal.target.y || !currentReveal(request)) {
        cancelRestore(); memory.reveal.state = "cancelled"; memory.consumed = request.token; memory.pending = !!key;
      }
    }
    if (memory.reveal?.state === "pending") memory.pending = false;
    restore();
  }, [key, list, memory, priorityReveal, restore, cancelRestore, scope?.focused]);
  const ref = useCallback((node: T | null) => {
    // Ref attachment precedes layout effects. Allow a new memory's first
    // attachment, but never let a retired entry overwrite the forwarded ref.
    if (memory.committed && current.current !== memory
      && (node !== null || forwardedOwner.current !== memory)) return;
    if (memory.node !== node) {
      cancelRestore();
      if (memory.attached) memory.size = emptySize();
      memory.node = node;
      if (node && memory.attached) refreshHost(value => value + 1);
      if (node) memory.attached = true;
    }
    forwardedOwner.current = node ? memory : null;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
    restore();
  }, [forwardedRef, memory, cancelRestore, restore]);
  const ownsLayout = () => owns() && memory.node !== null && memory.size === size;
  return {
    hostKey,
    ref,
    contentOffset: props.contentOffset ?? memory.saved,
    scrollEventThrottle: props.scrollEventThrottle ?? 16,
    onScroll: (event: Parameters<NonNullable<ScrollViewProps["onScroll"]>>[0]) => {
      if (key && ownsLayout() && memory.focused && !memory.pending && memory.reveal?.state !== "pending" && memory.reveal?.state !== "applying") {
        // RN Web offsets have live getters; retain numbers, not the event object.
        const { x, y } = event.nativeEvent.contentOffset;
        memory.saved = { x, y };
        writeViewMemory(key, memory.saved);
      }
      props.onScroll?.(event);
    },
    onScrollBeginDrag: (event: Parameters<NonNullable<ScrollViewProps["onScrollBeginDrag"]>>[0]) => {
      if (!ownsLayout() || !memory.focused || !size.laidOut) return;
      memory.pending = false; cancelRestore();
      if (memory.reveal?.state === "pending" || memory.reveal?.state === "applying") {
        memory.reveal.state = "cancelled"; memory.consumed = memory.reveal.request.token;
      }
      props.onScrollBeginDrag?.(event);
    },
    onContentSizeChange: (width: number, height: number) => {
      if (!ownsLayout()) return;
      size.width = width; size.height = height;
      restore(); props.onContentSizeChange?.(width, height);
    },
    onLayout: (event: Parameters<NonNullable<ScrollViewProps["onLayout"]>>[0]) => {
      if (!ownsLayout()) return;
      size.laidOut = true;
      size.viewWidth = event.nativeEvent.layout.width;
      size.viewHeight = event.nativeEvent.layout.height;
      restore(); props.onLayout?.(event);
    },
  };
}
