// GitHub connection persistence (side_project, B). Device-local only — the
// public username is not sensitive, so AsyncStorage (no schema, no migration) is
// the right store; it lets the screen remember the connection and lets grounding
// reuse it. Best-effort: any failure degrades to "no connection".

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "ops.github.username";

/** The saved GitHub username, or "" when none/unavailable. */
export async function getGithubUsername(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(KEY)) ?? "";
  } catch {
    return "";
  }
}

/** Save (or clear, when blank) the GitHub username. */
export async function setGithubUsername(username: string): Promise<void> {
  try {
    const value = username.trim();
    if (value) await AsyncStorage.setItem(KEY, value);
    else await AsyncStorage.removeItem(KEY);
  } catch {
    /* best-effort */
  }
}
