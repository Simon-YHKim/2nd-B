// GitHub connection persistence (side_project, B). Device-local and owner-scoped
// so one signed-in account never restores another account's handle. The old
// unscoped key is deliberately not read because it has no provable owner.

import {
  getEncryptedNativeStorage,
  type StringStorage,
} from "../storage/encrypted-native-storage";
import { sanitizeUsername } from "./github";

const KEY_PREFIX = "ops.github.username";
const OWNER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function keyFor(userId: string): string {
  const owner = typeof userId === "string" ? userId.trim() : "";
  if (!OWNER_PATTERN.test(owner)) throw new Error("invalid_github_owner");
  return `${KEY_PREFIX}:${owner}`;
}

function isReactNativeRuntime(): boolean {
  const nav = globalThis.navigator as { product?: string } | undefined;
  return nav?.product === "ReactNative";
}

function browserStorage(): Storage | null {
  if (isReactNativeRuntime() || typeof document === "undefined") return null;
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function nativeStorage(): StringStorage | null {
  if (!isReactNativeRuntime()) return null;
  return getEncryptedNativeStorage();
}

function parseStoredUsername(raw: string | null): string {
  if (raw === null) return "";
  const username = sanitizeUsername(raw);
  if (!username || username !== raw) throw new Error("invalid_stored_github_username");
  return username;
}

/** The saved GitHub username, or "" when none. Native storage failures reject. */
export async function getGithubUsername(userId: string): Promise<string> {
  const key = keyFor(userId);
  const native = nativeStorage();
  if (native) return parseStoredUsername(await native.getItem(key));

  const browser = browserStorage();
  if (!browser) return "";
  try {
    return parseStoredUsername(browser.getItem(key));
  } catch {
    return "";
  }
}

/** Save (or clear, when blank) the GitHub username. Native storage failures reject. */
export async function setGithubUsername(userId: string, username: string): Promise<void> {
  const key = keyFor(userId);
  if (typeof username !== "string") throw new Error("invalid_github_username");
  const candidate = username.trim();
  const clear = candidate.length === 0;
  const value = clear ? "" : sanitizeUsername(candidate);
  if (!clear && !value) throw new Error("invalid_github_username");

  const native = nativeStorage();
  if (native) {
    if (clear) await native.removeItem(key);
    else await native.setItem(key, value);
    return;
  }

  const browser = browserStorage();
  if (!browser) return;
  try {
    if (clear) browser.removeItem(key);
    else browser.setItem(key, value);
  } catch {
    /* Browser persistence remains best-effort (private/quota modes). */
  }
}
