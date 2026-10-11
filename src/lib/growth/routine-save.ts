import { randomUUID } from "expo-crypto";
import { captureAccountOwnerLease } from "../auth/account-epoch";
import type { SevenStarId } from "../persona/seven-stars";

const routineIds = new Map<SevenStarId, string>();
let routineEpoch: number | null = null;

/** R2260-01: keep retries stable only in memory; public account/step IDs cannot
 *  predict the UUID. An account transition retires every prior session ID. */
export function weeklyGrowthSessionRoutineId(ownerId: string, stepId: SevenStarId): string {
  const owner = captureAccountOwnerLease(ownerId);
  if (!owner?.isCurrent()) throw new Error("Routine owner changed");
  if (routineEpoch !== owner.epoch) {
    routineIds.clear();
    routineEpoch = owner.epoch;
  }
  const existing = routineIds.get(stepId);
  if (existing) return existing;
  const id = randomUUID();
  routineIds.set(stepId, id);
  return id;
}

/** A React ref is acquired synchronously, before either reading or saving can yield. */
export async function runWeeklyGrowthSave(
  saving: { current: boolean }, save: () => Promise<void>,
): Promise<boolean> {
  if (saving.current) return false;
  saving.current = true;
  try {
    await save();
    return true;
  } finally {
    saving.current = false;
  }
}
