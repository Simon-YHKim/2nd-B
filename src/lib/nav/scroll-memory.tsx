import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ForwardedRef, type ReactNode } from "react";
import type { FlatList, ScrollView, ScrollViewProps } from "react-native";
import { captureAccountOwnerLease, currentAccountOwner } from "../auth/account-epoch";
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
  const owner = currentAccountOwner();
  const lease = useMemo(() => owner ? captureAccountOwnerLease(owner) : null, [owner]);
  const handle = useRef<T | null>(null);
  const saved = useRef<ScrollPosition>(key ? readViewMemory<ScrollPosition>(key) ?? { x: 0, y: 0 } : { x: 0, y: 0 });
  const pending = useRef(saved.current.x > 0 || saved.current.y > 0);
  const focused = useRef(true);
  const size = useRef({ width: 0, height: 0, viewWidth: 0, viewHeight: 0 });
  const frame = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restore = useCallback(() => {
    if (!key || !lease?.isCurrent() || !pending.current || !handle.current) return;
    const s = size.current;
    if (!s.viewHeight || !s.height) return;
    const target = boundedScroll(saved.current, s.width, s.height, s.viewWidth, s.viewHeight);
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    if (settle.current !== null) clearTimeout(settle.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (!lease.isCurrent() || !focused.current) return;
      if (list) (handle.current as FlatList<unknown> | null)?.scrollToOffset({ offset: props.horizontal ? target.x : target.y, animated: false });
      else (handle.current as ScrollView | null)?.scrollTo({ ...target, animated: false });
      // A virtualized list can still resize after reporting its first content size.
      // Reapply after layout settles before accepting its synthetic scroll events.
      if (target.x === saved.current.x && target.y === saved.current.y) settle.current = setTimeout(() => {
        settle.current = null;
        if (!lease.isCurrent() || !focused.current || !pending.current) return;
        if (list) (handle.current as FlatList<unknown> | null)?.scrollToOffset({ offset: props.horizontal ? target.x : target.y, animated: false });
        else (handle.current as ScrollView | null)?.scrollTo({ ...target, animated: false });
        pending.current = false;
      }, 180);
    });
  }, [key, lease, list, props.horizontal]);
  useEffect(() => {
    if (scope?.focused === false) { focused.current = false; return; }
    focused.current = true;
    if (key) saved.current = readViewMemory<ScrollPosition>(key) ?? saved.current;
    pending.current = saved.current.x > 0 || saved.current.y > 0;
    restore();
    return () => {
      focused.current = false;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (settle.current !== null) clearTimeout(settle.current);
    };
  }, [key, restore, scope?.focused]);
  const ref = useCallback((node: T | null) => {
    handle.current = node;
    focused.current = !!node && scope?.focused !== false;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }, [forwardedRef, scope?.focused]);
  return {
    ref,
    contentOffset: props.contentOffset ?? saved.current,
    scrollEventThrottle: props.scrollEventThrottle ?? 16,
    onScroll: (event: Parameters<NonNullable<ScrollViewProps["onScroll"]>>[0]) => {
      if (key && lease?.isCurrent() && focused.current && !pending.current) {
        // RN Web offsets have live getters; retain numbers, not the event object.
        const { x, y } = event.nativeEvent.contentOffset;
        saved.current = { x, y };
        writeViewMemory(key, saved.current);
      }
      props.onScroll?.(event);
    },
    onScrollBeginDrag: (event: Parameters<NonNullable<ScrollViewProps["onScrollBeginDrag"]>>[0]) => {
      pending.current = false;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (settle.current !== null) clearTimeout(settle.current);
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
