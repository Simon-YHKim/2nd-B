import { createContext, useContext, useLayoutEffect } from "react";

// The root supplies this only on native. Modals are separate native windows,
// so covering the route's View alone does not hide their private content.
export const DeviceLockCoveredContext = createContext(false);
export function useDeviceLockCovered(): boolean {
  return useContext(DeviceLockCoveredContext);
}

// Route-local and root crisis dialogs both pause OS authentication. Only a
// boolean count is shared; there is no account data or persisted notice here.
const priorityOwners = new Set<object>();
const priorityListeners = new Set<() => void>();
export const crisisLockPrioritySnapshot = () => priorityOwners.size > 0;
export function subscribeCrisisLockPriority(listener: () => void) {
  priorityListeners.add(listener);
  return () => { priorityListeners.delete(listener); };
}
export function useCrisisLockPriority(visible: boolean): void {
  useLayoutEffect(() => {
    if (!visible) return;
    const owner = {};
    priorityOwners.add(owner);
    for (const listener of priorityListeners) listener();
    return () => {
      priorityOwners.delete(owner);
      for (const listener of priorityListeners) listener();
    };
  }, [visible]);
}
