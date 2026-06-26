import * as Updates from "expo-updates";

/**
 * Human-readable build/OTA identifier for on-device diagnostics — so a tester can
 * always tell WHICH bundle is running (the 2026-06-26 head-touch crash incident was
 * prolonged by uncertainty over embedded-vs-OTA). Shown on the account screen.
 *
 * Examples:
 *   "v0.0.6 · dev"                      (Metro / Updates disabled)
 *   "v0.0.6 · preview · embedded"       (running the bundle baked into the APK)
 *   "v0.0.6 · preview · OTA 019f0239"   (running an over-the-air update)
 *
 * Resilient: in dev / web / Expo Go, `Updates.isEnabled` is false and the constants
 * are null — we never throw, just report "dev".
 */
export function buildInfoLine(): string {
  const rt = Updates.runtimeVersion ?? "?";
  if (!Updates.isEnabled) return `v${rt} · dev`;
  const channel = Updates.channel ?? "—";
  const id = Updates.updateId;
  // No updateId while running the embedded bundle; an applied OTA carries one.
  if (!id) return `v${rt} · ${channel} · embedded`;
  return `v${rt} · ${channel} · OTA ${id.slice(0, 8)}`;
}
