// GitHub connection persistence (side_project, B). Device-local and owner-scoped
// so one signed-in account never restores another account's handle. The old
// unscoped key is deliberately not read because it has no provable owner.

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_PREFIX = "ops.github.username";

function keyFor(userId: string): string | null {
  const owner = userId.trim();
  return owner ? `${KEY_PREFIX}:${owner}` : null;
}

/** The saved GitHub username, or "" when none/unavailable. */
export async function getGithubUsername(userId: string): Promise<string> {
  const key = keyFor(userId);
  if (!key) return "";

  try {
    return (await AsyncStorage.getItem(key)) ?? "";
  } catch {
    return "";
  }
}

/** Save (or clear, when blank) the GitHub username. */
export async function setGithubUsername(userId: string, username: string): Promise<void> {
  const key = keyFor(userId);
  if (!key) return;

  try {
    const value = username.trim();
    if (value) await AsyncStorage.setItem(key, value);
    else await AsyncStorage.removeItem(key);
  } catch {
    /* best-effort */
  }
}
