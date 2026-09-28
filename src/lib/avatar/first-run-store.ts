// Session-local result of the first avatar read. A SQL NULL requires setup;
// an unreadable column or a failed request is unknown and cannot lock the app.
// The owner key prevents an old account's result from crossing a sign-out.

export type AvatarFirstRunStatus = "idle" | "loading" | "missing" | "saved" | "error" | "deferred";

export interface AvatarFirstRunSnapshot {
  userId: string | null;
  status: AvatarFirstRunStatus;
}

export type AvatarFirstRunDecision = "allow" | "hold" | "setup";

export function avatarFirstRunDecision(
  userId: string | null,
  hasProfile: boolean | null,
  segment: string | undefined,
  current: AvatarFirstRunSnapshot,
): AvatarFirstRunDecision {
  if (
    !userId ||
    hasProfile !== true ||
    segment === "(auth)" ||
    segment === "onboarding" ||
    segment === "avatar-studio"
  ) return "allow";
  if (current.userId !== userId || current.status === "idle" || current.status === "loading") {
    return "hold";
  }
  return current.status === "missing" ? "setup" : "allow";
}

const INITIAL: AvatarFirstRunSnapshot = { userId: null, status: "idle" };
let snapshot: AvatarFirstRunSnapshot = INITIAL;
let generation = 0;
const listeners = new Set<() => void>();

export function avatarFirstRunSnapshot(): AvatarFirstRunSnapshot {
  return snapshot;
}

export function subscribeAvatarFirstRun(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function publish(next: AvatarFirstRunSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

export function setAvatarFirstRunOwner(userId: string | null): void {
  if (snapshot.userId === userId) return;
  generation += 1;
  publish(userId ? { userId, status: "idle" } : INITIAL);
}

const READ_TIMEOUT_MS = 8_000;

/** Read once for this owner. Late reads cannot undo a save or session change. */
export async function probeAvatarFirstRun(
  userId: string,
  read: () => Promise<unknown | null>,
  timeoutMs = READ_TIMEOUT_MS,
): Promise<void> {
  setAvatarFirstRunOwner(userId);
  if (snapshot.status !== "idle" && snapshot.status !== "error") return;
  const request = ++generation;
  publish({ userId, status: "loading" });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const stored = await Promise.race([
      read(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Avatar read timed out")), timeoutMs);
      }),
    ]);
    if (snapshot.userId !== userId || generation !== request) return;
    publish({ userId, status: stored === null ? "missing" : "saved" });
  } catch {
    if (snapshot.userId !== userId || generation !== request) return;
    // Old clients can run before the numberless avatar_spec migration is
    // applied. A network error is equally unproven. Both fail open for entry.
    publish({ userId, status: "error" });
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

/** Called only after a user-owned update returned a row. */
export function markAvatarFirstRunSaved(userId: string): void {
  if (snapshot.userId !== userId) return;
  generation += 1;
  publish({ userId, status: "saved" });
}

/** Escape from a setup read failure for this runtime, never for another user. */
export function markAvatarFirstRunDeferred(userId: string): void {
  if (snapshot.userId !== userId) return;
  generation += 1;
  publish({ userId, status: "deferred" });
}
