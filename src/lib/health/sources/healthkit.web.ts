// HealthKit HealthSource, WEB side of the platform split -- fail-closed stub.
// The real adapter lives in ./healthkit.ts; Metro resolves THIS file on web
// and ./healthkit.ts on ios/android (and under tsc/jest).
//
// WHY A SPLIT (audit D5-11): the native file reaches the SDK through a
// function-scope require(), which keeps it from THROWING on web but does not
// keep it OUT of the web bundle -- Metro follows require() statically, so
// @kingstinct/react-native-healthkit rode into the web entry for a source
// that reports isAvailable() === false there anyway. This stub keeps the
// recorded discipline (never throws, isAvailable() false, read() []) with
// zero SDK reference.
//
// RULES: never reference the native SDK here in any importable form; keep the
// export surface identical to ./healthkit.ts (guarded by
// src/lib/__tests__/web-bundle-shims.test.ts).

import type { HealthPermission, HealthSample, HealthSource } from "../HealthSource";

export const healthKitSource: HealthSource = {
  id: "healthkit",

  isAvailable(): boolean {
    return false;
  },

  async requestPermission(): Promise<HealthPermission> {
    return "unavailable";
  },

  async read(): Promise<HealthSample[]> {
    return [];
  },
};
