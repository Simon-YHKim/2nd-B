import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import type { SevenStarId } from "../persona/seven-stars";

/** A separate namespace keeps weekly steps independent of dashboard/chat suggestions.
 *  This is a deterministic ID with the v4 shape required by the existing save contract,
 *  not a random UUID. Keep the namespace and encoding stable across app versions. */
export async function weeklyGrowthRoutineId(ownerId: string, stepId: SevenStarId): Promise<string> {
  const hash = await digestStringAsync(CryptoDigestAlgorithm.SHA256,
    JSON.stringify(["2ndB:weekly-growth:routine:v1", ownerId, stepId]));
  const variant = ((parseInt(hash[16], 16) & 3) | 8).toString(16);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/** A React ref is acquired synchronously, before either hashing or saving can yield. */
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
