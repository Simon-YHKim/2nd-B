import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ForwardedRef, type ReactNode } from "react";
import type { FlatList, ScrollView, ScrollViewProps } from "react-native";
import { accountTransitionSnapshot, captureAccountOwnerLease, currentAccountOwner, subscribeAccountTransition } from "../auth/account-epoch";
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

export function useScrollMemory<T extends Scroller>(props: ScrollViewProps, forwardedRef: ForwardedRef<T>, list = false) {
  const scope = useContext(Context);
  const [slot] = useState(() => scope ? scope.slots.next++ : 0);
  const key = scope ? `scroll:${scope.id}:${props.testID ?? slot}` : null;
  const snapshot = useSyncExternalStore(subscribeAccountTransition, accountTransitionSnapshot, accountTransitionSnapshot);
  const owner = currentAccountOwner();
  const lease = useMemo(() => owner ? captureAccountOwnerLease(owner) : null, [owner, snapshot]);
  const handle = useRef<T | null>(null);
  // Each epoch and navigation target owns its copy and scheduled work. A late
  // callback retains only the old object and lease, never the new owner's state.
  const memory = useMemo(() => ({
    saved: key ? readViewMemory<ScrollPosition>(key) ?? { x: 0, y: 0 } : { x: 0, y: 0 },
    pending: !!key, focused: true,
    frame: null as ReturnType<typeof requestAnimationFrame> | null,
    settle: null as ReturnType<typeof setTimeout> | null,
  }), [key, snapshot]);
  const size = useRef({ width: 0, height: 0, viewWidth: 0, viewHeight: 0 });
  const cancelRestore = useCallback(() => {
    if (memory.frame !== null) cancelAnimationFrame(memory.frame);
    if (memory.settle !== null) clearTimeout(memory.settle);
    memory.frame = null; memory.settle = null;
  }, [memory]);
  const restore = useCallback(() => {
    if (!key || !lease?.isCurrent() || !memory.pending || !memory.focused || !handle.current) return;
    const s = size.current;
    if (!s.viewHeight || !s.height) return;
    const target = boundedScroll(memory.saved, s.width, s.height, s.viewWidth, s.viewHeight);
    cancelRestore();
    memory.frame = requestAnimationFrame(() => {
      memory.frame = null;
      if (!lease.isCurrent() || !memory.focused) return;
      if (list) (handle.current as FlatList<unknown> | null)?.scrollToOffset({ offset: props.horizontal ? target.x : target.y, animated: false });
      else (handle.current as ScrollView | null)?.scrollTo({ ...target, animated: false });
      // A virtualized list can still resize after reporting its first content size.
      // Reapply after layout settles before accepting its synthetic scroll events.
      if (target.x === memory.saved.x && target.y === memory.saved.y) memory.settle = setTimeout(() => {
        memory.settle = null;
        if (!lease.isCurrent() || !memory.focused || !memory.pending) return;
        if (list) (handle.current as FlatList<unknown> | null)?.scrollToOffset({ offset: props.horizontal ? target.x : target.y, animated: false });
        else (handle.current as ScrollView | null)?.scrollTo({ ...target, animated: false });
        memory.pending = false;
      }, 180);
    });
  }, [key, lease, memory, cancelRestore, list, props.horizontal]);
  useEffect(() => {
    if (scope?.focused === false) { memory.focused = false; return; }
    memory.focused = true;
    memory.saved = key ? readViewMemory<ScrollPosition>(key) ?? { x: 0, y: 0 } : { x: 0, y: 0 };
    // Zero is a restoration too: the native host may still be at A's offset.
    // Ignore synthetic events until the new position has settled or a drag starts.
    memory.pending = !!key;
    restore();
    return () => {
      memory.focused = false;
      cancelRestore();
    };
  }, [key, memory, restore, cancelRestore, scope?.focused]);
  const ref = useCallback((node: T | null) => {
    handle.current = node;
    memory.focused = !!node && scope?.focused !== false;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }, [forwardedRef, memory, scope?.focused]);
  return {
    ref,
    contentOffset: props.contentOffset ?? memory.saved,
    scrollEventThrottle: props.scrollEventThrottle ?? 16,
    onScroll: (event: Parameters<NonNullable<ScrollViewProps["onScroll"]>>[0]) => {
      if (key && lease?.isCurrent() && memory.focused && !memory.pending) {
        // RN Web offsets have live getters; retain numbers, not the event object.
        const { x, y } = event.nativeEvent.contentOffset;
        memory.saved = { x, y };
        writeViewMemory(key, memory.saved);
      }
      props.onScroll?.(event);
    },
    onScrollBeginDrag: (event: Parameters<NonNullable<ScrollViewProps["onScrollBeginDrag"]>>[0]) => {
      memory.pending = false;
      cancelRestore();
      props.onScrollBeginDrag?.(event);
    },
    onContentSizeChange: (width: number, height: number) => {
      size.current.width = width; size.current.height = height;
      restore(); props.onContentSizeChange?.(width, height);
    },
    onLayout: (event: Parameters<NonNullable<ScrollViewProps["onLayout"]>>[0]) => {
      size.current.viewWidth = event.nativeEvent.layout.width;
      size.current.viewHeight = event.nativeEvent.layout.height;
      restore(); props.onLayout?.(event);
    },
  };
}
