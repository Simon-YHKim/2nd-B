type RecoveryStorageListener = (event: StorageEvent) => void;

interface StorageEventTargetLike {
  addEventListener(type: "storage", listener: RecoveryStorageListener): void;
  removeEventListener(type: "storage", listener: RecoveryStorageListener): void;
}

function isStorageEventTarget(value: unknown): value is StorageEventTargetLike {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    return false;
  }
  const target = value as Partial<StorageEventTargetLike>;
  return (
    typeof target.addEventListener === "function" &&
    typeof target.removeEventListener === "function"
  );
}

/**
 * Subscribe only when the runtime actually exposes DOM storage events.
 * React Native defines `window`, but it is not a DOM Window and does not
 * implement these methods.
 */
export function subscribeRecoveryStorageEvent(
  target: unknown,
  listener: RecoveryStorageListener,
): () => void {
  if (!isStorageEventTarget(target)) return () => {};

  target.addEventListener("storage", listener);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    target.removeEventListener("storage", listener);
  };
}
