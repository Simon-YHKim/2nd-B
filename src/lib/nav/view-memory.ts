import { captureAccountOwnerLease, currentAccountEpoch, currentAccountOwner, subscribeAccountTransition } from "../auth/account-epoch";

// Navigation/scroll state is session-local, never written to disk or shared across accounts.
const entries = new Map<string, unknown>();
let memoryEpoch = -1;
subscribeAccountTransition(() => entries.clear());
const LIMIT = 256;
function synchronize(): void {
  const epoch = currentAccountEpoch();
  if (memoryEpoch !== epoch) { entries.clear(); memoryEpoch = epoch; }
}

export function readViewMemory<T>(key: string): T | undefined {
  synchronize();
  const owner = currentAccountOwner();
  if (!owner || !captureAccountOwnerLease(owner)) return undefined;
  return entries.get(`${owner}:${key}`) as T | undefined;
}

export function writeViewMemory<T>(key: string, value: T): void {
  synchronize();
  const owner = currentAccountOwner();
  if (!owner || !captureAccountOwnerLease(owner)) return;
  const fullKey = `${owner}:${key}`;
  entries.delete(fullKey);
  entries.set(fullKey, value);
  if (entries.size > LIMIT) entries.delete(entries.keys().next().value!);
}

export interface ScrollPosition { x: number; y: number }
export function boundedScroll(position: ScrollPosition, width: number, height: number, viewportWidth: number, viewportHeight: number): ScrollPosition {
  return { x: Math.max(0, Math.min(position.x, width - viewportWidth)),
    y: Math.max(0, Math.min(position.y, height - viewportHeight)) };
}
