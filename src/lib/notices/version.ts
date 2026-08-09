// notices.min_app_version gate.
//
// The column is advisory data the CLIENT filters on, not a server-side rule -
// PostgREST only ever sees the shared anon-key JWT, which carries no build
// version, so the database cannot know who is asking. See the header of
// db/migrations/0113_notices.sql.
//
// Two deliberate choices:
//
//   * The comparison functions are pure and take the version as an argument, so
//     the whole gate is testable in the node jest environment. Only
//     getAppVersion() touches the platform.
//   * The gate FAILS OPEN. If the running version cannot be determined, or the
//     stored value is unparseable, the notice is shown. A maintenance or
//     incident notice that fails to reach people is a worse outcome than one
//     that reaches a build it does not quite apply to.

/** Numeric release segments, prerelease/build metadata discarded. Returns null
 *  when the input is not "1", "1.2" or "1.2.3" shaped. */
function parseVersion(value: string): number[] | null {
  const core = value.trim().split(/[-+]/)[0] ?? "";
  if (core === "") return null;
  const parts = core.split(".");
  if (parts.length === 0 || parts.length > 3) return null;
  const numbers: number[] = [];
  for (const part of parts) {
    if (!/^[0-9]+$/.test(part)) return null;
    numbers.push(Number(part));
  }
  return numbers;
}

/** -1 / 0 / 1, or null when either side is unparseable. Missing segments count
 *  as 0, so "1.2" === "1.2.0". */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  for (let index = 0; index < 3; index += 1) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;
    if (l < r) return -1;
    if (l > r) return 1;
  }
  return 0;
}

/**
 * Should a notice carrying `minAppVersion` be shown to a build running
 * `appVersion`?
 *
 * null minAppVersion means every build. Otherwise the build must be at or above
 * it. Unknown / unparseable inputs fail open (see the header).
 */
export function meetsMinAppVersion(
  appVersion: string | null,
  minAppVersion: string | null,
): boolean {
  if (!minAppVersion) return true;
  if (!appVersion) return true;
  const order = compareVersions(appVersion, minAppVersion);
  if (order === null) return true;
  return order >= 0;
}

/**
 * The running app's marketing version ("0.1.0"), from app.json `expo.version`.
 *
 * NOT Updates.runtimeVersion: app.json pins `runtimeVersion.policy` to
 * "fingerprint", so that value is a build fingerprint hash and would never
 * compare meaningfully against a semver string.
 *
 * expo-constants is required lazily inside a try/catch, matching how this repo
 * already reaches AsyncStorage and react-native from testable modules
 * (src/lib/supabase/client.ts, src/app/notices.tsx). jest runs in a node
 * environment with no expo runtime and no moduleNameMapper entry for
 * expo-constants, so a top-level import would break every suite that
 * transitively pulls this file in.
 */
export function getAppVersion(): string | null {
  try {
    const constants = require("expo-constants").default as
      | { expoConfig?: { version?: string | null } | null }
      | undefined;
    return constants?.expoConfig?.version ?? null;
  } catch {
    return null;
  }
}
