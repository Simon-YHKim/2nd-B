// Start the app again when a different account takes over (Simon Q-261013-29).
//
// A fresh JS realm holds no scenes, module caches or queued work of the previous
// owner, so nothing has to be proven about the retained navigation tree before
// the new owner sees anything. The root layout asks for the restart once the new
// owner is published and the user is outside the sign-in screens. It keeps its
// navigation reset for a build that cannot restart itself (a development build,
// or a platform call that fails), so this file never leaves the screen covered
// with nothing left to lift the cover.

import * as Updates from "expo-updates";
import { Platform } from "react-native";

type RestartState = "idle" | "pending" | "unavailable";
type Listener = () => void;

// How long a requested restart may take. Past this the realm is still running,
// so the restart did not happen and the caller resets navigation instead.
export const ACCOUNT_RESTART_GRACE_MS = 4000;

// The web reloads the address it is on. The router writes that address a moment
// after its state changes (and rewinds history asynchronously), so the reload
// waits for it to settle.
export const ACCOUNT_RESTART_WEB_SETTLE_MS = 300;

let state: RestartState = "idle";
let graceTimer: ReturnType<typeof setTimeout> | null = null;
let onUnavailable: Listener | null = null;

function markUnavailable(): void {
  if (state !== "pending") return;
  state = "unavailable";
  if (graceTimer !== null) clearTimeout(graceTimer);
  graceTimer = null;
  const listener = onUnavailable;
  onUnavailable = null;
  try {
    listener?.();
  } catch {
    // The caller's re-render must not turn a failed restart into a crash.
  }
}

function requestRestart(): void {
  if (Platform.OS === "web") {
    const location = typeof window !== "undefined" ? window.location : undefined;
    if (typeof location?.reload !== "function") {
      markUnavailable();
      return;
    }
    setTimeout(() => {
      try {
        location.reload();
      } catch {
        markUnavailable();
      }
    }, ACCOUNT_RESTART_WEB_SETTLE_MS);
    return;
  }
  // Release builds reach the native reload. A development build rejects here,
  // which is the "unavailable" answer the caller falls back on.
  void Updates.reloadAsync().catch(markUnavailable);
}

/**
 * Ask for the restart (once per realm) and say whether it is on its way.
 *
 * true  = requested and still expected; keep the screen covered and do nothing else.
 * false = this build cannot restart; reset navigation as before.
 *
 * `listener` is called once if a requested restart turns out not to happen, so
 * the caller can run again and take the fallback. A failed restart is not tried
 * again in the same realm: what failed once would fail the same way.
 */
export function accountRestartPending(listener: Listener): boolean {
  if (state === "unavailable") return false;
  onUnavailable = listener;
  if (state === "pending") return true;

  state = "pending";
  graceTimer = setTimeout(markUnavailable, ACCOUNT_RESTART_GRACE_MS);
  try {
    requestRestart();
  } catch {
    markUnavailable();
  }
  // markUnavailable() may have run synchronously above.
  return (state as RestartState) === "pending";
}

/** Test-only reset for this module singleton. */
export function __resetAccountRestartForTests(): void {
  if (graceTimer !== null) clearTimeout(graceTimer);
  graceTimer = null;
  onUnavailable = null;
  state = "idle";
}
