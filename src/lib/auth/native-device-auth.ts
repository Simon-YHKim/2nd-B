import { Platform } from "react-native";
import type { DeviceAuthResult } from "./device-lock";

// Lazy import: an older binary without this module must show a locked update
// screen, not throw while evaluating the root layout or silently grant access.
let nativeModule: Promise<typeof import("expo-local-authentication")> | null = null;
let generation = 0;
let cancellation = Promise.resolve();
function loadNative() {
  return nativeModule ??= import("expo-local-authentication");
}

export async function authenticateDevice(labels: {
  title: string; fallback: string; cancel: string;
}): Promise<DeviceAuthResult> {
  if (Platform.OS === "web") return { success: false, error: "unavailable" };
  const attempt = generation;
  try {
    const native = await loadNative();
    await cancellation;
    if (generation !== attempt) return { success: false, error: "cancelled" };
    // Do not gate on hasHardware/isEnrolled: a PIN-only phone is valid.
    const result = await native.authenticateAsync({
      promptMessage: labels.title,
      // Our API<30 patch labels the explicit PIN/pattern choice with this.
      cancelLabel: Platform.OS === "android" ? labels.fallback : labels.cancel,
      fallbackLabel: labels.fallback,
      disableDeviceFallback: false,
      biometricsSecurityLevel: "strong",
      requireConfirmation: true,
    });
    if (generation !== attempt) return { success: false, error: "cancelled" };
    if (result.success) return { success: true };
    if (["user_cancel", "app_cancel", "system_cancel"].includes(result.error)) return { success: false, error: "cancelled" };
    if (["not_enrolled", "passcode_not_set"].includes(result.error)) return { success: false, error: "not_enrolled" };
    return { success: false, error: "failed" };
  } catch {
    return { success: false, error: "unavailable" };
  }
}

export function cancelDeviceAuthentication(): void {
  generation += 1;
  if (!nativeModule) return;
  // Both platforms implement cancellation in the checked-in native patch.
  // Never clear/reuse the native credential slot merely because JS cancelled.
  const pending = nativeModule;
  cancellation = cancellation.then(() => pending).then(native => native.cancelAuthenticate()).catch(() => undefined);
}
