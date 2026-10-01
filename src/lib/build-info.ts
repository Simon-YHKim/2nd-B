import * as Updates from "expo-updates";

/**
 * Human-readable build/OTA identifier for on-device diagnostics — so a tester can
 * always tell WHICH bundle is running (the 2026-06-26 head-touch crash incident was
 * prolonged by uncertainty over embedded-vs-OTA). Shown in the settings and account
 * screen footers.
 *
 * Examples:
 *   "v0.0.6 · dev"                          (Metro / Updates disabled)
 *   "v0.0.6 · preview · embedded c437df67"  (running the bundle baked into the APK)
 *   "v0.0.6 · preview · OTA 019f0239"       (running an over-the-air update)
 *
 * `v…` is `Updates.runtimeVersion`. app.json uses the fingerprint policy, so it is a
 * native fingerprint hash: not a source commit and not the store version.
 *
 * The word after the channel is the verdict; read it before the id. Embedded vs OTA
 * comes from `Updates.isEmbeddedLaunch` (launched update id == embedded update id, on
 * both native sides), never from whether `updateId` is set: the embedded bundle has an
 * id too, the `id` in the APK's `assets/app.manifest`. This used to branch on
 * `!updateId`, so every embedded launch read "OTA <id>". vibe r260913 T1a (2026-09-13)
 * ran the v0.8.0 preview APK with a single row in `updates.db` and an empty
 * `.expo-internal`, and the line still said "OTA c437df67". The short id stays on both
 * kinds so an embedded launch can be matched against `assets/app.manifest`.
 *
 * Resilient: in dev / web / Expo Go, `Updates.isEnabled` is false and the constants
 * are null — we never throw, just report "dev".
 *
 * An unknown value prints "?" (runtime version, channel, OTA id). Never an em dash:
 * this string is rendered in the settings and account footers, and DESIGN.md bans
 * U+2014 in UI strings. The channel fallback used to be one, hidden by an exclusion
 * for this file in scripts/check-no-emdash.ts; both are gone (PR #1810 gate F3).
 */
export function buildInfoLine(): string {
  const rt = Updates.runtimeVersion ?? "?";
  if (!Updates.isEnabled) return `v${rt} · dev`;
  const channel = Updates.channel ?? "?";
  const id = Updates.updateId?.slice(0, 8);
  if (Updates.isEmbeddedLaunch) {
    return id ? `v${rt} · ${channel} · embedded ${id}` : `v${rt} · ${channel} · embedded`;
  }
  return `v${rt} · ${channel} · OTA ${id ?? "?"}`;
}
