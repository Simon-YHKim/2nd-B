// Coordinator-only T54 measurement. No login, dotenv, RPC, model call or write.
// Default invocation prints help. Explicit --collect uses an existing QA session.
import { createHash } from "node:crypto";
import { MEASURED_TABLES, compareT54Snapshot, type MeasuredRow, type MeasuredTable, type MeasurementSnapshot } from "./lib/t54-measurement";

export interface MeasurementConfig {
  url: string;
  anonKey: string;
  accessToken: string;
  ownerId: string;
  now: string;
  pageSize?: number;
  maxRows?: number;
}
type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type QueryMetadata = { rows: number; total: number; complete: true; pages: number; order: string; brightnessRows: number };
const COLUMNS: Record<MeasuredTable, string> = {
  records: "id,user_id,created_at,tags,system_tags,audit_period",
  sources: "id,user_id,captured_at,tags,system_tags",
  relation_people: "id,user_id,created_at,last_interaction_on",
  recreation_items: "id,user_id,created_at,occurred_on",
  ops_ledger: "id,user_id,created_at,occurred_on",
  ops_reading: "id,user_id,created_at,updated_at",
};
const orderFor = (table: MeasuredTable): string => table === "records" ? "created_at.desc,id.desc" : table === "sources" ? "captured_at.desc,id.desc" : "id.asc";
const fail = (code: string): never => { throw new Error(`T54_${code}`); };

function validateConfig(config: MeasurementConfig) {
  let url: URL;
  try { url = new URL(config.url); } catch { return fail("CONFIG"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(config.ownerId) ||
    !config.anonKey || !config.accessToken || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(config.now) || !Number.isFinite(Date.parse(config.now))) fail("CONFIG");
  const pageSize = config.pageSize ?? 500, maxRows = config.maxRows ?? 10000;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000 || !Number.isSafeInteger(maxRows) || maxRows < pageSize || maxRows > 100000) fail("CONFIG");
  return { origin: url.origin, pageSize, maxRows };
}

function totalFrom(response: Response): number {
  const match = /^(?:\d+-\d+|\*)\/(\d+)$/.exec(response.headers.get("content-range") ?? "");
  if (!match || !Number.isSafeInteger(Number(match[1]))) return fail("COUNT_UNKNOWN");
  return Number(match[1]);
}

/** Validate and copy only selected metadata. No raw tag, id or timestamp is logged. */
function rowsFrom(data: unknown, table: MeasuredTable, ownerId: string, systemTagsPresent: boolean): MeasuredRow[] {
  if (!Array.isArray(data)) return fail("ROW_SHAPE");
  return data.map((value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return fail("ROW_SHAPE");
    const row = value as Record<string, unknown>;
    if (row.user_id !== ownerId) fail("ROW_OWNER");
    if (typeof row.id !== "string" || !row.id) fail("ROW_SHAPE");
    const fields = COLUMNS[table].split(",").filter((key) => key !== "system_tags" || systemTagsPresent);
    const copy: Record<string, unknown> = {};
    for (const key of fields) {
      const field = row[key];
      if (key === "tags" || key === "system_tags") {
        if (field !== null && (!Array.isArray(field) || field.some((tag) => typeof tag !== "string"))) fail("ROW_SHAPE");
        if (key === "system_tags" && !Array.isArray(field)) fail("ROW_SHAPE");
      } else if (field !== null && typeof field !== "string") fail("ROW_SHAPE");
      copy[key] = field;
    }
    return copy as unknown as MeasuredRow;
  });
}

/**
 * Fetch twice and require identical metadata sets. This proves observed stability,
 * not a repeatable-read database transaction: metadata reports that limit explicitly.
 * Each pass includes the app's uncapped first read AND a complete paginated read.
 */
export async function collectT54Snapshot(config: MeasurementConfig, fetcher: Fetch = fetch) {
  const { origin, pageSize, maxRows } = validateConfig(config);
  const started = Date.now(), deadline = started + 120000;
  let requests = 0;
  const request = async (path: string, params?: URLSearchParams) => {
    if (Date.now() >= deadline) return fail("DEADLINE");
    const url = new URL(path, origin);
    if (params) url.search = params.toString();
    requests++;
    try {
      return await fetcher(url, {
        method: "GET", redirect: "error", cache: "no-store",
        headers: { apikey: config.anonKey, Authorization: `Bearer ${config.accessToken}`, Accept: "application/json", Prefer: "count=exact" },
        signal: AbortSignal.timeout(Math.min(15000, deadline - Date.now())),
      });
    } catch { return fail("TRANSPORT"); }
  };
  const json = async (response: Response): Promise<unknown> => {
    try { return await response.json(); } catch { return fail("RESPONSE_JSON"); }
  };
  const auth = await request("/auth/v1/user");
  if (!auth.ok) fail("AUTH_READ");
  const user = await json(auth) as { id?: unknown } | null;
  if (!user || user.id !== config.ownerId) fail("OWNER_MISMATCH");

  const readPass = async () => {
    let sourceSystemTags = true;
    const tables = {} as Record<MeasuredTable, QueryMetadata>;
    const snapshot: MeasurementSnapshot = {
      now: config.now, records: [], sources: [], relation_people: [], recreation_items: [], ops_ledger: [], ops_reading: [],
      hasDeviceHealth: false, brightnessLimits: {} as Record<MeasuredTable, number>, brightnessRows: {} as Record<MeasuredTable, MeasuredRow[]>,
    };
    for (const table of MEASURED_TABLES) {
      const read = async (offset: number | null) => {
        const columns = table === "sources" && !sourceSystemTags ? COLUMNS[table].replace(",system_tags", "") : COLUMNS[table];
        const params = new URLSearchParams({ select: columns, user_id: `eq.${config.ownerId}` });
        if (offset === null) {
          // Match the loader's first request; no invented limit or structured sort.
          if (table === "records") params.set("order", "created_at.desc");
          if (table === "sources") params.set("order", "captured_at.desc");
        } else {
          params.set("order", orderFor(table));
          params.set("offset", String(offset));
          params.set("limit", String(pageSize));
        }
        return request(`/rest/v1/${table}`, params);
      };
      let first = await read(null);
      if (!first.ok && table === "sources") {
        const error = await json(first) as { code?: unknown; message?: unknown } | null;
        // Cache and permission failures are not absence. Only a named SQL missing
        // column error permits the pre-0264 sources read, never a generic retry.
        if (error?.code !== "42703" || typeof error.message !== "string" || !/\b(?:sources\.)?system_tags\b/.test(error.message) || !/does not exist/i.test(error.message)) fail("SOURCES_READ");
        sourceSystemTags = false;
        first = await read(null);
      }
      if (!first.ok) fail("TABLE_READ");
      const total = totalFrom(first);
      if (total > maxRows) fail("ROW_BOUND_EXCEEDED");
      const hasSystemColumn = table === "records" || table === "sources" && sourceSystemTags;
      const brightnessRows = rowsFrom(await json(first), table, config.ownerId, hasSystemColumn);
      if (brightnessRows.length > total || total > 0 && brightnessRows.length === 0) fail("COUNT_MISMATCH");
      snapshot.brightnessRows![table] = brightnessRows;
      snapshot.brightnessLimits[table] = brightnessRows.length;
      const rows: MeasuredRow[] = [];
      let pages = 0;
      const ids = new Set<string>();
      do {
        const response = await read(rows.length);
        if (!response.ok) fail("PAGE_READ");
        if (totalFrom(response) !== total) fail("COUNT_CHANGED");
        const page = rowsFrom(await json(response), table, config.ownerId, hasSystemColumn);
        pages++;
        if (page.length > pageSize || rows.length + page.length > total || !page.length && rows.length < total) fail("PAGE_INCOMPLETE");
        for (const row of page) {
          if (ids.has(row.id)) fail("DUPLICATE_ROW");
          ids.add(row.id);
          rows.push(row);
        }
      } while (rows.length < total);
      // The full walk must contain the loader's first set with identical values.
      const byId = new Map(rows.map((row) => [row.id, JSON.stringify(row)]));
      if (new Set(brightnessRows.map((row) => row.id)).size !== brightnessRows.length || brightnessRows.some((row) => byId.get(row.id) !== JSON.stringify(row))) fail("SNAPSHOT_CHANGED");
      snapshot[table] = rows;
      tables[table] = { rows: rows.length, total, complete: true, pages, order: orderFor(table), brightnessRows: brightnessRows.length };
    }
    const health = await request("/rest/v1/health_samples", new URLSearchParams({
      select: "user_id,source", user_id: `eq.${config.ownerId}`, source: "in.(healthkit,health_connect,strava)", limit: "1",
    }));
    if (!health.ok) fail("HEALTH_READ");
    const healthRows = await json(health);
    if (!Array.isArray(healthRows)) return fail("HEALTH_SHAPE");
    if (healthRows.length > 1 || healthRows.some((row) => !row || row.user_id !== config.ownerId || !["healthkit", "health_connect", "strava"].includes(row.source))) fail("HEALTH_SHAPE");
    snapshot.hasDeviceHealth = healthRows.length === 1;
    return { snapshot, tables, sourceSystemTags };
  };
  const first = await readPass(), second = await readPass();
  const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  if (digest(first) !== digest(second)) fail("SNAPSHOT_CHANGED");
  return {
    snapshot: first.snapshot,
    metadata: {
      fixedNow: config.now, collectedAt: new Date(started).toISOString(), finishedAt: new Date().toISOString(),
      stableAcrossReads: true, atomicDatabaseSnapshot: false,
      stabilityMethod: "two identical bounded metadata reads; concurrent changes can still occur between requests",
      tables: first.tables, sourceSystemTags: first.sourceSystemTags, recordsSystemTags: true,
      pageSize, maxRowsPerTable: maxRows, requests, writes: 0, modelCalls: 0,
      health: { deviceExists: first.snapshot.hasDeviceHealth, limit: 1, purpose: "existence only" },
    },
  };
}

const HELP = `T54 read-only measurement (existing QA session; no login)
Required environment variables: T54_SUPABASE_URL, T54_SUPABASE_ANON_KEY,
T54_QA_ACCESS_TOKEN, T54_QA_OWNER_ID, T54_MEASUREMENT_NOW (fixed ISO time).
Run: npx tsx scripts/measure-t54-system-tags.ts --collect > <local-report.json>
Optional bounds: T54_PAGE_SIZE (default 500), T54_MAX_ROWS (default 10000/table).
No .env file is loaded. Do not put tokens on the command line or in the report.
Output contains aggregates only. Exit 1 means no trustworthy complete comparison.
Read stability is checked twice; this is not an atomic DB transaction.
Coordinate a quiet QA account. Real QA execution belongs to the coordinator.
`;

if (require.main === module) {
  if (process.argv.length !== 3 || process.argv[2] !== "--collect") {
    process.stdout.write(HELP);
    if (process.argv.length > 2 && process.argv[2] !== "--help") process.exitCode = 1;
  } else {
    void collectT54Snapshot({
      url: process.env.T54_SUPABASE_URL ?? "", anonKey: process.env.T54_SUPABASE_ANON_KEY ?? "",
      accessToken: process.env.T54_QA_ACCESS_TOKEN ?? "", ownerId: process.env.T54_QA_OWNER_ID ?? "",
      now: process.env.T54_MEASUREMENT_NOW ?? "", pageSize: Number(process.env.T54_PAGE_SIZE ?? "500"), maxRows: Number(process.env.T54_MAX_ROWS ?? "10000"),
    }).then(({ snapshot, metadata }) => {
      const report = compareT54Snapshot(snapshot);
      process.stdout.write(`${JSON.stringify({ metadata, ...report }, null, 2)}\n`);
      if (report.blockers.length) process.exitCode = 1;
    }).catch((error: unknown) => {
      // Never print a transport/SQL error body, URL, auth header or raw row.
      const code = error instanceof Error && /^T54_[A-Z_]+$/.test(error.message) ? error.message : "T54_FAILED";
      process.stderr.write(`${code}\n`);
      process.exitCode = 1;
    });
  }
}
