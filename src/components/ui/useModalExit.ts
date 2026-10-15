import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useIsFocused } from "expo-router";

/** Route-owned transient dialogs defer navigation until their visible exit.
 * Blur/unmount discards the pending action; it must never navigate later from
 * a screen the user has already left. No outgoing child tree is retained.
 */
export function useModalExit(visible = true) {
  const active = useIsFocused();
  const [closing, setClosing] = useState(false);
  const pending = useRef<(() => void) | null>(null);
  const focused = useRef(active && visible);
  useLayoutEffect(() => {
    focused.current = active && visible;
    if (!active || !visible) {
      pending.current = null;
      setClosing(false);
    }
    return () => { focused.current = false; pending.current = null; };
  }, [active, visible]);
  const requestClose = useCallback((afterExit: () => void) => {
    if (!focused.current || pending.current) return;
    pending.current = afterExit;
    setClosing(true);
  }, []);
  const completeClose = useCallback(() => {
    const afterExit = pending.current;
    pending.current = null;
    afterExit?.();
  }, []);
  return { active, closing, requestClose, completeClose };
}
