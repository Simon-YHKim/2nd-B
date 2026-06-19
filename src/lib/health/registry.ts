// Phase B Slice 1: the runtime health-source registry.
//
// Returns only the sources that can actually run on the current platform
// (isAvailable() === true). Slice 1 registers manual + mock — both always
// available (pure JS, no native module). When the native sources land in
// Slice 2 they register here too; the consumer code never changes because it
// only ever asks "which sources are available right now?".

import type { HealthSource } from "./HealthSource";
import { manualHealthSource } from "./sources/manual";
import { mockHealthSource } from "./sources/mock";

// Registration order = display order. Manual first (the universal fallback),
// mock second (dev / demo only).
const ALL_SOURCES: readonly HealthSource[] = [manualHealthSource, mockHealthSource];

/** The sources that can run on the current platform. */
export function availableHealthSources(): HealthSource[] {
  return ALL_SOURCES.filter((s) => {
    try {
      return s.isAvailable();
    } catch {
      return false;
    }
  });
}

/** Look up one available source by id, or null when it can't run here. */
export function healthSourceById(id: HealthSource["id"]): HealthSource | null {
  return availableHealthSources().find((s) => s.id === id) ?? null;
}
