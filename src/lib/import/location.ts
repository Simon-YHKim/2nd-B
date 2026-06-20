// Google location history parser (personal-data import, 🔴 위치 최민감).
//
// Google deprecated the Timeline web/API and moved Location History on-device,
// so there is no live read API. The viable path is the user's own Google Takeout
// export → this pure parser. No network, no LLM, no storage — it transforms a
// file the user explicitly handed us. The caller persists only DERIVED signals
// (place/visit summary), never the full point trail ("원문 비보존").
//
// Handles both Takeout shapes defensively:
//   - legacy Records.json: { locations: [{ latitudeE7, longitudeE7, timestamp }] }
//   - Semantic Location History: { timelineObjects: [{ placeVisit: {...} }] }
// Unknown shapes yield []. Output is capped.

export interface LocationVisit {
  /** ISO timestamp, or null when unparseable. */
  atIso: string | null;
  lat: number;
  lon: number;
  /** Place name when the export provides one (semantic history). */
  name?: string;
}

export interface LocationSummary {
  points: number;
  /** distinct named places (semantic history only). */
  places: string[];
  /** [earliest, latest] ISO, or null when empty. */
  range: [string, string] | null;
}

const MAX_VISITS = 5000;
const PLACES_CAP = 50;

function e7(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value / 1e7;
}

function tsToIso(value: unknown): string | null {
  if (typeof value === "string") {
    // ISO string, or epoch-ms as a numeric string (legacy timestampMs).
    if (/^\d+$/.test(value)) {
      const d = new Date(Number(value));
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function fromRecords(rows: unknown[]): LocationVisit[] {
  const out: LocationVisit[] = [];
  for (const r of rows) {
    if (out.length >= MAX_VISITS) break;
    if (!r || typeof r !== "object") continue;
    const row = r as Record<string, unknown>;
    const lat = e7(row.latitudeE7);
    const lon = e7(row.longitudeE7);
    if (lat === null || lon === null) continue;
    out.push({ lat, lon, atIso: tsToIso(row.timestamp ?? row.timestampMs) });
  }
  return out;
}

function fromTimeline(objs: unknown[]): LocationVisit[] {
  const out: LocationVisit[] = [];
  for (const o of objs) {
    if (out.length >= MAX_VISITS) break;
    if (!o || typeof o !== "object") continue;
    const visit = (o as Record<string, unknown>).placeVisit;
    if (!visit || typeof visit !== "object") continue;
    const v = visit as Record<string, unknown>;
    const loc = v.location && typeof v.location === "object" ? (v.location as Record<string, unknown>) : null;
    if (!loc) continue;
    const lat = e7(loc.latitudeE7);
    const lon = e7(loc.longitudeE7);
    if (lat === null || lon === null) continue;
    const dur = v.duration && typeof v.duration === "object" ? (v.duration as Record<string, unknown>) : null;
    const start = dur ? (dur.startTimestamp ?? dur.startTimestampMs) : null;
    const visitRow: LocationVisit = { lat, lon, atIso: tsToIso(start) };
    if (typeof loc.name === "string" && loc.name.trim()) visitRow.name = loc.name.trim().slice(0, 120);
    out.push(visitRow);
  }
  return out;
}

/** Defensive parse of a Takeout location JSON object. Pure. */
export function parseTakeoutLocations(json: unknown): LocationVisit[] {
  if (!json || typeof json !== "object") return [];
  const obj = json as Record<string, unknown>;
  if (Array.isArray(obj.locations)) return fromRecords(obj.locations);
  if (Array.isArray(obj.timelineObjects)) return fromTimeline(obj.timelineObjects);
  return [];
}

/** Pure: roll visits into the derived summary the caller may persist. */
export function summarizeLocations(visits: ReadonlyArray<LocationVisit>): LocationSummary {
  const places: string[] = [];
  let earliest: string | null = null;
  let latest: string | null = null;
  for (const v of visits) {
    if (v.name && !places.includes(v.name) && places.length < PLACES_CAP) places.push(v.name);
    if (v.atIso) {
      if (!earliest || v.atIso < earliest) earliest = v.atIso;
      if (!latest || v.atIso > latest) latest = v.atIso;
    }
  }
  return {
    points: visits.length,
    places,
    range: earliest && latest ? [earliest, latest] : null,
  };
}
