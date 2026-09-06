// Health Connect HealthSource, WEB side of the platform split -- fail-closed
// stub. The real adapter lives in ./health-connect.ts; Metro resolves THIS
// file on web and ./health-connect.ts on ios/android (and under tsc/jest).
//
// WHY A SPLIT (audit D5-11): the native file reaches the SDK through a
// function-scope require(), which keeps it from THROWING on web but does not
// keep it OUT of the web bundle -- Metro follows require() statically, so
// react-native-health-connect rode into the web entry for a source that
// reports isAvailable() === false there anyway. This stub keeps the recorded
// discipline (never throws, isAvailable() false, read() []) with zero SDK
// reference.
//
// RULES: never reference the native SDK here in any importable form; keep the
// export surface identical to ./health-connect.ts (guarded by
// src/lib/__tests__/web-bundle-shims.test.ts).

import type { HealthPermission, HealthSample, HealthSource } from "../HealthSource";

export const healthConnectSource: HealthSource = {
  id: "health_connect",

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
