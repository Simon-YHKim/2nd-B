// Clipboard paste offer (O-R2 ⑥-b-i scrap track).
//
// Privacy contract: clipboard CONTENT is never read until the user taps the
// offer. Availability uses the presence-only check (hasStringAsync), which
// avoids the iOS 14+ paste banner and the Android 13+ access toast - both
// fire only on the explicit, user-initiated read below.
//
// Native-only: web browsers gate navigator.clipboard reads behind their own
// permission prompts, and in-page paste is already the natural affordance.
// (Same runtime detection as capture/draft.ts - no react-native import so the
// module stays loadable in the node test environment.)

import * as ExpoClipboard from "expo-clipboard";

function isReactNativeRuntime(): boolean {
  const nav = globalThis.navigator as { product?: string } | undefined;
  return nav?.product === "ReactNative";
}

/** Presence-only check - safe to call on screen/mode entry. */
export async function clipboardHasContent(): Promise<boolean> {
  if (!isReactNativeRuntime()) return false;
  try {
    return await ExpoClipboard.hasStringAsync();
  } catch {
    return false;
  }
}

/**
 * Reads the clipboard text. Call ONLY from an explicit user action (the OS
 * paste notice is expected there). Returns null when empty or unreadable.
 */
export async function readClipboardText(): Promise<string | null> {
  if (!isReactNativeRuntime()) return null;
  try {
    const text = await ExpoClipboard.getStringAsync();
    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}
