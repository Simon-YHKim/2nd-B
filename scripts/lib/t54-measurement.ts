// T54 measurement only: the baseline rule is deliberately frozen at b95fa4e0.
// Never serialize the input rows; the public report contains aggregate values only.
import { DOMAIN_STARS, isDomainId, type DomainEntry, type DomainId } from "../../src/lib/persona/domain-stars";
import { domainLevel } from "../../src/lib/persona/domain-confidence";
import { brightnessFraction, type LadderLevel } from "../../src/lib/persona/brightness";
import { SEVEN_STARS } from "../../src/lib/persona/seven-stars";

export const MEASURED_TABLES = ["records", "sources", "relation_people", "recreation_items", "ops_ledger", "ops_reading"] as const;
export type MeasuredTable = typeof MEASURED_TABLES[number];
export interface MeasuredRow {
  id: string;
  user_id: string;
  created_at?: string | null;
  captured_at?: string | null;
  tags?: string[] | null;
  system_tags?: string[] | null;
  audit_period?: string | null;
  last_interaction_on?: string | null;
  occurred_on?: string | null;
  updated_at?: string | null;
}
export type MeasurementSnapshot = Record<MeasuredTable, MeasuredRow[]> & {
  now: string;
  hasDeviceHealth: boolean;
  brightnessLimits: Record<MeasuredTable, number>;
  /** Exact first-query sets, including the server's actual max-rows cap. */
  brightnessRows?: Record<MeasuredTable, MeasuredRow[]>;
};

const RATIFIED = "reasoning:ratified";
const OLD_CAPTURE = new Set(["voice", "todo"]);
const NEW_CAPTURE = new Set(["voice", "todo", "memo", "fourw", "link"]);
const domainOf = (row: MeasuredRow): DomainId | null => {
  for (const tag of row.tags ?? []) {
    if (!tag.toLowerCase().startsWith("domain:")) continue;
    const domain = tag.slice(7).toLowerCase();
    if (isDomainId(domain)) return domain;
  }
  return null;
};
const hasRatification = (row: MeasuredRow): boolean => (row.tags ?? []).includes(RATIFIED) || (row.system_tags ?? []).includes(RATIFIED);
function organizedRecord(row: MeasuredRow, after: boolean): boolean {
  const capture = after ? NEW_CAPTURE : OLD_CAPTURE;
  return (after && hasRatification(row)) || (row.tags ?? []).some((tag) => {
    const t = tag.toLowerCase();
    return !t.startsWith("domain:") && !capture.has(t) && !(t === "interview" && !Array.isArray(row.system_tags));
  });
}
function unfiled(row: MeasuredRow, after: boolean): boolean {
  return !(after && hasRatification(row)) && !(row.tags ?? []).some((t) => !t.toLowerCase().startsWith("domain:"));
}

/** Local empty-message routing probe, without retrieval, prompts or a model call.
 * A source contract test compares this with retrieve.ts's actual pure router. */
export function emptyMessageAdvisorBatches(levels: Partial<Record<string, number>>): string[] {
  const mapping: Record<string, string> = {
    finance: "financial-wellbeing", career: "vocational-interests", recreation: "leisure-wellbeing",
    relation: "relationship-maintenance", health: "behaviour-change",
  };
  const dim = Object.entries(levels).filter(([domain, level]) => level != null && level <= 2 && mapping[domain])
    .sort((a, b) => a[1]! - b[1]!);
  const selected = [...new Set(dim.map(([domain]) => mapping[domain]!))];
  return ["crisis-detection", ...(selected.length ? selected : ["self-knowledge", "sdt", "big-five"]).slice(0, 3)];
}

function countUnfiled(records: MeasuredRow[], sources: MeasuredRow[]) {
  const count = (rows: MeasuredRow[]) => ({
    rows: rows.length,
    before: rows.filter((r) => unfiled(r, false)).length,
    after: rows.filter((r) => unfiled(r, true)).length,
    explainedBySystemRatification: rows.filter((r) => unfiled(r, false) && !unfiled(r, true) && (r.system_tags ?? []).includes(RATIFIED)).length,
  });
  const all = [...records, ...sources];
  const byDomain = Object.fromEntries(DOMAIN_STARS.map(({ id }) => [id, count(all.filter((row) => (row.tags ?? []).some((tag) => tag.toLowerCase() === `domain:${id}`)))])) as Record<DomainId, ReturnType<typeof count>>;
  // Only fixed audit-period values are emitted; arbitrary row text stays private.
  const periods = SEVEN_STARS.flatMap(({ period }) => period ? [period] : []);
  const byPeriod = Object.fromEntries(periods.map((period) => [period, count(records.filter((r) => r.audit_period === period))]));
  const byPeriodAndDomain = Object.fromEntries(periods.map((period) => [period, Object.fromEntries(DOMAIN_STARS.map(({ id }) => [id,
    count(records.filter((row) => row.audit_period === period && (row.tags ?? []).some((tag) => tag.toLowerCase() === `domain:${id}`))),
  ]))]));
  return { all: count(all), records: count(records), sources: count(sources), byDomain, byPeriod, byPeriodAndDomain };
}

function measure(snapshot: MeasurementSnapshot) {
  const now = Date.parse(snapshot.now);
  if (!Number.isFinite(now)) throw new Error("T54_INVALID_NOW");
  const domains = Object.fromEntries(DOMAIN_STARS.map(({ id }) => {
    const records = snapshot.records.filter((r) => domainOf(r) === id);
    const sources = snapshot.sources.filter((r) => domainOf(r) === id);
    const structuredTable = ({ relation: "relation_people", recreation: "recreation_items", finance: "ops_ledger", growth: "ops_reading" } as const)[id as "relation" | "recreation" | "finance" | "growth"];
    const structured = structuredTable ? snapshot[structuredTable] : [];
    const structuredEntries: DomainEntry[] = structured.map((row) => ({
      domain: id, createdAt: (id === "relation" ? row.last_interaction_on : id === "growth" ? row.updated_at : row.occurred_on) ?? row.created_at ?? undefined, tags: ["structured"],
    }));
    const version = (after: boolean) => {
      const entries: DomainEntry[] = [
        ...records.map((row) => ({ domain: id, createdAt: row.created_at ?? undefined, tags: organizedRecord(row, after) ? ["organized"] : [] })),
        ...sources.map((row) => ({ domain: id, createdAt: row.captured_at ?? undefined, tags: ["ratified"] })),
        ...structuredEntries,
      ];
      const organized = entries.filter((e) => (e.tags ?? []).length > 0).length;
      const timestamps = entries.map((e) => Date.parse(e.createdAt ?? "")).filter(Number.isFinite);
      const newest = timestamps.length ? timestamps.reduce((latest, at) => Math.max(latest, at), -Infinity) : null;
      // Match the existing loader: any health domain entry + a device sample.
      const crossSourceAgreement = id === "health" && entries.length > 0 && snapshot.hasDeviceHealth;
      const level = domainLevel(entries, { now, crossSourceAgreement });
      return {
        observations: entries.length, organized, organizedRatio: entries.length ? organized / entries.length : 0,
        passesOrganizedFloor: entries.length > 0 && organized / entries.length >= 0.5,
        newestAt: newest === null ? null : new Date(newest).toISOString(),
        stale: newest !== null && now - newest > 60 * 86400000,
        crossSourceAgreement, level, brightness: brightnessFraction(level),
      };
    };
    const before = version(false), after = version(true);
    return [id, {
      inputs: { records: records.length, sources: sources.length, structured: structured.length }, before, after,
      brightnessDelta: after.brightness - before.brightness,
      causes: {
        captureOnlySignalRemoved: records.filter((r) => organizedRecord(r, false) && !organizedRecord(r, true)).length,
        ratifiedRecords: records.filter(hasRatification).length,
        systemOnlyRatifiedRecords: records.filter((r) => (r.system_tags ?? []).includes(RATIFIED) && !(r.tags ?? []).includes(RATIFIED)).length,
      },
    }];
  })) as Record<DomainId, {
    inputs: { records: number; sources: number; structured: number };
    before: { observations: number; organized: number; organizedRatio: number; passesOrganizedFloor: boolean; newestAt: string | null; stale: boolean; crossSourceAgreement: boolean; level: LadderLevel; brightness: number };
    after: { observations: number; organized: number; organizedRatio: number; passesOrganizedFloor: boolean; newestAt: string | null; stale: boolean; crossSourceAgreement: boolean; level: LadderLevel; brightness: number };
    brightnessDelta: number;
    causes: { captureOnlySignalRemoved: number; ratifiedRecords: number; systemOnlyRatifiedRecords: number };
  }>;
  const beforeLevels = Object.fromEntries(DOMAIN_STARS.map(({ id }) => [id, domains[id].before.level])) as Record<DomainId, LadderLevel>;
  const afterLevels = Object.fromEntries(DOMAIN_STARS.map(({ id }) => [id, domains[id].after.level])) as Record<DomainId, LadderLevel>;
  const unfiledCounts = countUnfiled(snapshot.records, snapshot.sources);
  return {
    domains, unfiled: unfiledCounts,
    downstream: {
      shareCard: { before: Object.values(beforeLevels).filter((n) => n >= 2).length, after: Object.values(afterLevels).filter((n) => n >= 2).length },
      changedDashboardDomains: DOMAIN_STARS.filter(({ id }) => id !== "collect" && beforeLevels[id] !== afterLevels[id]).map(({ id }) => id),
      star: Object.fromEntries(DOMAIN_STARS.map(({ id }) => [id, { before: domains[id].before.brightness, after: domains[id].after.brightness }])) as Record<DomainId, { before: number; after: number }>,
      advisor: {
        before: { domainLevels: beforeLevels, emptyMessageBatches: emptyMessageAdvisorBatches(beforeLevels) },
        after: { domainLevels: afterLevels, emptyMessageBatches: emptyMessageAdvisorBatches(afterLevels) },
      },
    },
  };
}

export function compareT54Snapshot(snapshot: MeasurementSnapshot) {
  const brightnessSnapshot = { ...snapshot };
  for (const table of MEASURED_TABLES) brightnessSnapshot[table] = snapshot.brightnessRows?.[table] ?? snapshot[table].slice(0, snapshot.brightnessLimits[table]);
  const full = measure(snapshot), brightnessRead = measure(brightnessSnapshot);
  const blockers: string[] = [];
  for (const [scope, measured] of [["full", full], ["brightnessRead", brightnessRead]] as const) {
    for (const { id } of DOMAIN_STARS) {
      const { before, after } = measured.domains[id];
      if (before.observations !== after.observations || before.newestAt !== after.newestAt) blockers.push(`${scope}:${id}:coverage_or_time_changed`);
      if (before.observations < 5 && before.level !== after.level) blockers.push(`${scope}:${id}:low_count_level_changed`);
    }
    const counts = measured.unfiled.all;
    if (counts.before - counts.after !== counts.explainedBySystemRatification) blockers.push(`${scope}:unexplained_unfiled_change`);
  }
  // listAllRecords stops on a short 100-row page; listSourcePieces asks for 200.
  // A lower PostgREST cap therefore also truncates those screen reads.
  const recordsServerCap = snapshot.brightnessRows && snapshot.records.length > snapshot.brightnessLimits.records ? snapshot.brightnessLimits.records : Infinity;
  const sourcesServerCap = snapshot.brightnessRows && snapshot.sources.length > snapshot.brightnessLimits.sources ? snapshot.brightnessLimits.sources : Infinity;
  const wikiRecordsLimit = recordsServerCap < 100 ? recordsServerCap : 5000;
  const wikiSourcesLimit = Math.min(200, sourcesServerCap);
  const sourceBoundaryTied = snapshot.sources.length > wikiSourcesLimit && wikiSourcesLimit > 0 &&
    snapshot.sources[wikiSourcesLimit - 1]!.captured_at === snapshot.sources[wikiSourcesLimit]!.captured_at;
  // sources has no id tie-breaker in the real screen query. Do not present a
  // deterministic sorted subset as proof of that screen's ambiguous boundary.
  if (sourceBoundaryTied) blockers.push("wiki:source_boundary_tie_requires_list_check");
  return {
    now: snapshot.now, baseline: "b95fa4e0", full, brightnessRead,
    wikiScope: countUnfiled(snapshot.records.slice(0, wikiRecordsLimit), snapshot.sources.slice(0, wikiSourcesLimit)),
    scopeLimits: { wikiRecords: 5000, wikiSources: 200, recordsExcluded: Math.max(0, snapshot.records.length - wikiRecordsLimit), sourcesExcluded: Math.max(0, snapshot.sources.length - wikiSourcesLimit) },
    effectiveWikiLimits: { records: wikiRecordsLimit, sources: wikiSourcesLimit, sourceBoundaryTied },
    blockers,
    interpretation: [
      "Legacy tags are retained; this report never identifies who authored a same-name tag or rewrites it.",
      "Organized-ratio changes can affect levels only at n >= 5; stale inputs can mask a level change.",
      "Source domain classification remains sufficient; a record ratification marker never sets ratified=true.",
      "Advisor batches use a fixed empty-message local probe; actual evidence rows and model responses are not requested.",
      "Period stars and Polaris use separate calculations and are not represented by these domain levels.",
      "Wiki source and brightness boundary ties may vary because the app does not use a secondary id order.",
    ],
  };
}
