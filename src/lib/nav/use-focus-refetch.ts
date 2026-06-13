import { useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";

/**
 * Refetch on route re-focus without double-loading the first mount.
 * The normal screen effect owns the initial read; this covers returning from
 * capture/detail flows after data may have changed.
 */
export function useFocusRefetch(refetch: () => void, enabled = true) {
  const refetchRef = useRef(refetch);
  const initialFocusHandledRef = useRef(false);
  refetchRef.current = refetch;

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
      if (!initialFocusHandledRef.current) {
        initialFocusHandledRef.current = true;
        return undefined;
      }
      refetchRef.current();
      return undefined;
    }, [enabled]),
  );
}
