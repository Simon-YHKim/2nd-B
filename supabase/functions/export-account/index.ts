// Authenticated, bounded account data export.
//
// This service-role function can read data that ordinary RLS policies hide, so
// every database and Storage operation is scoped to the user independently
// verified by Supabase Auth. The request cannot select a user, table, or filter.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = new Set<string>([
  'https://simon-yhkim.github.io',
  'http://localhost:8081',
  'http://localhost:19006',
]);

const DATABASE_PAGE_SIZE = 100;
const STORAGE_PAGE_SIZE = 100;
const MAX_REQUEST_BODY_BYTES = 1024;
const MAX_EXPORT_ROWS = 50_000;
const MAX_STORAGE_OBJECTS = 5_000;
const MAX_EXPORT_CONTENT_BYTES = 20 * 1024 * 1024;
const MAX_EXPORT_RESPONSE_BYTES = 24 * 1024 * 1024;
const MAX_STORAGE_OBJECT_BYTES = 2 * 1024 * 1024;
const EXPORT_TIMEOUT_MS = 25_000;
const MAX_ACCESS_TOKEN_BYTES = 4096;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_STORAGE_NAME = /^(?!\.{1,2}$)[^/\\\u0000-\u001f\u007f]{1,255}$/u;

function requestOriginAllowed(req: Request): boolean {
  const origin = req.headers.get('origin');
  return origin === null || ALLOWED_ORIGINS.has(origin);
}

function responseOrigin(req: Request): string {
  const origin = req.headers.get('origin');
  return origin !== null && ALLOWED_ORIGINS.has(origin) ? origin : 'null';
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function jsonResponse(
  req: Request,
  body: unknown,
  status = 200,
  maxBytes?: number,
  extraHeaders: Record<string, string> = {},
): Response {
  let payload = JSON.stringify(body) ?? 'null';
  let responseStatus = status;
  let safeExtraHeaders = extraHeaders;
  if (maxBytes !== undefined && utf8ByteLength(payload) > maxBytes) {
    payload = JSON.stringify({ error: 'export_response_too_large' });
    responseStatus = 413;
    safeExtraHeaders = {};
  }

  return new Response(payload, {
    status: responseStatus,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'cdn-cache-control': 'no-store',
      'surrogate-control': 'no-store',
      'pragma': 'no-cache',
      'expires': '0',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
      'access-control-allow-origin': responseOrigin(req),
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
      'access-control-expose-headers': 'content-disposition, retry-after',
      'vary': 'origin, authorization',
      ...safeExtraHeaders,
    },
  });
}

function corsPreflight(req: Request): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'cache-control': 'no-store',
      'cdn-cache-control': 'no-store',
      'surrogate-control': 'no-store',
      'access-control-allow-origin': responseOrigin(req),
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
      'access-control-max-age': '86400',
      'vary': 'origin, authorization',
    },
  });
}

class RequestContractError extends Error {
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = 'RequestContractError';
    this.status = status;
  }
}

class ExportLimitError extends Error {
  constructor(code: string) {
    super(code);
    this.name = 'ExportLimitError';
  }
}

class ExportSourceError extends Error {
  constructor() {
    super('export_source_unavailable');
    this.name = 'ExportSourceError';
  }
}

class ExportDeadlineError extends Error {
  constructor() {
    super('export_deadline_exceeded');
    this.name = 'ExportDeadlineError';
  }
}

function isRequestContractError(error: unknown): error is RequestContractError {
  return error instanceof RequestContractError;
}

function isExportLimitError(error: unknown): error is ExportLimitError {
  return error instanceof ExportLimitError;
}

async function readChunkWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) throw new ExportDeadlineError();

  return await new Promise((resolve, reject) => {
    const onAbort = () => reject(new ExportDeadlineError());
    signal.addEventListener('abort', onAbort, { once: true });
    reader.read().then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
}

async function requireEmptyJsonObject(req: Request, signal: AbortSignal): Promise<void> {
  const encoding = req.headers.get('content-encoding');
  if (encoding !== null && encoding.toLowerCase() !== 'identity') {
    throw new RequestContractError('unsupported_content_encoding', 415);
  }

  const declaredLength = req.headers.get('content-length');
  if (declaredLength !== null) {
    if (!/^\d{1,10}$/.test(declaredLength)) {
      throw new RequestContractError('invalid_request_body', 400);
    }
    if (Number(declaredLength) > MAX_REQUEST_BODY_BYTES) {
      throw new RequestContractError('request_body_too_large', 413);
    }
  }

  if (req.body === null) return;
  const reader = req.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let body = '';
  let totalBytes = 0;
  try {
    for (;;) {
      const chunk = await readChunkWithAbort(reader, signal);
      if (chunk.done) break;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        throw new RequestContractError('request_body_too_large', 413);
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      // Cancellation is best effort; the response remains fail-closed.
    }
    if (error instanceof RequestContractError || error instanceof ExportDeadlineError) throw error;
    throw new RequestContractError('invalid_request_body', 400);
  } finally {
    reader.releaseLock();
  }

  if (body.trim().length === 0) return;
  const contentType = req.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('application/json')) {
    throw new RequestContractError('unsupported_content_type', 415);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new RequestContractError('invalid_request_body', 400);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length !== 0) {
    throw new RequestContractError('invalid_request_body', 400);
  }
}

interface GatewayIdentity {
  accessToken: string;
  subject: string;
}

function identityFromGatewayJwt(authHeader: string): GatewayIdentity | null {
  const match = /^Bearer\s+([^\s]+)$/i.exec(authHeader);
  if (!match) return null;
  const accessToken = match[1];
  if (utf8ByteLength(accessToken) > MAX_ACCESS_TOKEN_BYTES) return null;
  const segments = accessToken.split('.');
  if (segments.length !== 3 || segments[1].length === 0 || segments[1].length > 2048) return null;

  try {
    const encoded = segments[1].replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (encoded.length % 4)) % 4);
    const payload = JSON.parse(atob(encoded + padding));
    const subject = typeof payload?.sub === 'string' ? payload.sub.toLowerCase() : '';
    if (payload?.role !== 'authenticated' || !UUID_PATTERN.test(subject)) return null;
    return { accessToken, subject };
  } catch {
    return null;
  }
}

async function limitResponseBody(response: Response, maxBytes: number): Promise<Response> {
  if (response.body === null) return response;
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxBytes) {
    await response.body.cancel();
    throw new ExportLimitError('export_source_response_too_large');
  }

  const reader = response.body.getReader();
  let bytes = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          controller.close();
          return;
        }
        bytes += chunk.value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel();
          controller.error(new ExportLimitError('export_source_response_too_large'));
          return;
        }
        controller.enqueue(chunk.value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function createAdminClient(
  supabaseUrl: string,
  serviceRoleKey: string,
  signal: AbortSignal,
) {
  const deadlineFetch: typeof fetch = async (input, init) => {
    const response = await fetch(input, { ...init, signal });
    return await limitResponseBody(response, MAX_EXPORT_CONTENT_BYTES);
  };
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: deadlineFetch },
  });
}

type AdminClient = ReturnType<typeof createAdminClient>;

interface ExportTable {
  readonly table: string;
  readonly fk: string;
  readonly order?: readonly string[];
  readonly select?: string;
  readonly key?: string;
}

// This is the only database schema inventory the request path can use. Every
// descriptor includes an owner predicate and deterministic pagination order.
const EXPORT_TABLES: readonly ExportTable[] = Object.freeze([
  { table: 'records', fk: 'user_id' },
  { table: 'sources', fk: 'user_id' },
  { table: 'wiki_pages', fk: 'user_id' },
  { table: 'wiki_links', fk: 'user_id', order: ['from_page', 'to_page'] },
  { table: 'personas', fk: 'user_id' },
  { table: 'persona_entity', fk: 'user_id' },
  { table: 'persona_relation', fk: 'user_id' },
  { table: 'persona_reasoning_trace', fk: 'user_id' },
  { table: 'memorized_patterns', fk: 'user_id' },
  { table: 'self_contexts', fk: 'user_id' },
  { table: 'esm_responses', fk: 'user_id' },
  { table: 'chat_usage', fk: 'user_id', order: ['day'] },
  { table: 'usage_counters', fk: 'user_id', order: ['month_bucket'] },
  { table: 'consent_records', fk: 'user_id' },
  { table: 'consent_changes', fk: 'user_id' },
  { table: 'testimonials', fk: 'user_id' },
  { table: 'xp_events', fk: 'user_id' },
  { table: 'star_tier_history', fk: 'user_id' },
  { table: 'resurface_ledger', fk: 'user_id' },
  { table: 'clipper_templates', fk: 'owner_id' },
  { table: 'health_samples', fk: 'user_id' },
  { table: 'ingest_log', fk: 'user_id' },
  { table: 'reasoning_runs', fk: 'user_id' },
  {
    table: 'reasoning_run_proposals',
    fk: 'reasoning_runs.user_id',
    order: ['run_id', 'ordinal'],
    select: '*,reasoning_runs!inner(user_id)',
  },
  { table: 'recreation_items', fk: 'user_id' },
  { table: 'relation_people', fk: 'user_id' },
  { table: 'srs_cards', fk: 'user_id' },
  { table: 'srs_reviews', fk: 'user_id' },
  { table: 'peer_invitations', fk: 'user_id' },
  { table: 'ops_routines', fk: 'user_id' },
  { table: 'ops_routine_logs', fk: 'user_id' },
  { table: 'ops_ledger', fk: 'user_id' },
  { table: 'ops_daily_brief', fk: 'user_id', order: ['day'] },
  { table: 'ops_meal_plan', fk: 'user_id' },
  { table: 'ops_milestones', fk: 'user_id' },
  { table: 'ops_reading', fk: 'user_id' },
  { table: 'interview_coverage', fk: 'user_id', order: ['period', 'layer'] },
  { table: 'user_notice_reads', fk: 'user_id' },
  { table: 'community_profiles', fk: 'user_id', order: ['user_id'] },
  { table: 'community_rooms', fk: 'created_by' },
  { table: 'community_room_members', fk: 'user_id', order: ['room_id'] },
  { table: 'community_messages', fk: 'sender_id' },
  { table: 'community_invites', fk: 'created_by' },
  {
    table: 'knowledge_sources',
    fk: 'added_by',
    key: 'knowledge_sources_contributed',
  },
]);

const EXCLUDED: Readonly<Record<string, string>> = Object.freeze({
  ai_audit_log: 'hash-only retained audit evidence, not subject content',
  gemini_spend_daily: 'internal cost accounting',
  revenue_events: 'billing and operations records',
  paddle_webhook_events: 'billing and operations records',
  billing_self_service_log: 'billing and operations records',
  credit_ledger: 'billing and operations records',
  credit_balance: 'billing and operations records',
  credit_backfill_0135: 'internal billing migration snapshot',
  account_export_rate_limits: 'operational anti-abuse timestamp',
  llm_proxy_capacity_reservations: 'operational capacity accounting',
  reward_ssv_tickets: 'short-lived hashed ad callback binding',
  rewarded_ssv_txns: 'internal ad reward accounting',
  content_reports: 'moderation record that can reference another user',
  template_blocks: 'moderation data',
  community_blocks: 'moderation data',
  community_message_reports: 'moderation record that can reference another user',
  clipper_template_moderation: 'staff moderation decision',
  user_roles: 'internal access-control record',
  crisis_events: 'minimized safety record with hashed subject reference',
  guardian_consents: 'contains a guardian third-party identity',
  peer_observations: 'contains informant third-party input',
  informant_consents: 'informant consent record',
});

interface ExportBudget {
  rows: number;
  bytes: number;
  maxRows: number;
  maxBytes: number;
}

function createExportBudget(
  limits: { maxRows?: number; maxBytes?: number } = {},
): ExportBudget {
  return {
    rows: 0,
    bytes: 0,
    maxRows: limits.maxRows ?? MAX_EXPORT_ROWS,
    maxBytes: limits.maxBytes ?? MAX_EXPORT_CONTENT_BYTES,
  };
}

function assertRowsFit(budget: ExportBudget, rows: number): void {
  if (!Number.isSafeInteger(rows) || rows < 0 || budget.rows + rows > budget.maxRows) {
    throw new ExportLimitError('export_row_limit_exceeded');
  }
}

function reserveExportValue(budget: ExportBudget, value: unknown, rows = 1): void {
  assertRowsFit(budget, rows);
  const serialized = JSON.stringify(value);
  if (typeof serialized !== 'string') {
    throw new ExportLimitError('export_value_not_serializable');
  }
  const bytes = utf8ByteLength(serialized);
  if (!Number.isSafeInteger(bytes) || budget.bytes + bytes > budget.maxBytes) {
    throw new ExportLimitError('export_byte_limit_exceeded');
  }
  budget.rows += rows;
  budget.bytes += bytes;
}

function assertStorageDownloadAllowed(
  object: { metadata?: Record<string, unknown> | null },
  budget: ExportBudget,
): number {
  const size = object.metadata?.size;
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0) {
    throw new ExportLimitError('export_storage_size_unavailable');
  }
  if (size > MAX_STORAGE_OBJECT_BYTES) {
    throw new ExportLimitError('export_storage_object_too_large');
  }
  assertRowsFit(budget, 1);
  if (budget.bytes + size > budget.maxBytes) {
    throw new ExportLimitError('export_byte_limit_exceeded');
  }
  return size;
}

function ownedValue(row: unknown, ownerPath: string): unknown {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return undefined;
  let cursor: unknown = row;
  for (const segment of ownerPath.split('.')) {
    if (cursor === null || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

async function readAllOwnedRows(
  admin: AdminClient,
  source: ExportTable,
  userId: string,
  budget = createExportBudget(),
): Promise<unknown[]> {
  const rows: unknown[] = [];
  const initialRows = budget.rows;
  const initialBytes = budget.bytes;
  let expectedCount: number | undefined;

  try {
    do {
      let query = admin.from(source.table)
        .select(source.select ?? '*', { count: expectedCount === undefined ? 'exact' : undefined })
        .eq(source.fk, userId);
      for (const column of source.order ?? ['id']) {
        query = query.order(column, { ascending: true });
      }

      const { data, error, count } = await query.range(
        rows.length,
        rows.length + DATABASE_PAGE_SIZE - 1,
      );
      if (error || !Array.isArray(data) || data.length > DATABASE_PAGE_SIZE) {
        throw new ExportSourceError();
      }
      if (expectedCount === undefined) {
        if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
          throw new ExportSourceError();
        }
        expectedCount = count;
        assertRowsFit(budget, expectedCount);
      }
      if (data.length === 0 && rows.length < expectedCount) {
        throw new ExportSourceError();
      }

      for (const row of data) {
        if (ownedValue(row, source.fk) !== userId) throw new ExportSourceError();
        reserveExportValue(budget, row);
        rows.push(row);
      }
      if (rows.length > expectedCount) throw new ExportSourceError();
    } while (rows.length < expectedCount);

    return rows;
  } catch (error) {
    budget.rows = initialRows;
    budget.bytes = initialBytes;
    throw error;
  }
}

interface StorageExportEntry {
  path: string;
  markdown: string;
}

async function readOwnedStorage(
  admin: AdminClient,
  userId: string,
  budget: ExportBudget,
): Promise<StorageExportEntry[]> {
  const entries: StorageExportEntry[] = [];
  const initialRows = budget.rows;
  const initialBytes = budget.bytes;
  const bucket = admin.storage.from('raw-clippings');
  let offset = 0;

  try {
    for (;;) {
      const { data, error } = await bucket.list(userId, {
        limit: STORAGE_PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error || !Array.isArray(data) || data.length > STORAGE_PAGE_SIZE) {
        throw new ExportSourceError();
      }
      if (data.length === 0) break;
      if (offset + data.length > MAX_STORAGE_OBJECTS) {
        throw new ExportLimitError('export_storage_object_limit_exceeded');
      }

      for (const object of data) {
        if (typeof object?.name !== 'string' || !SAFE_STORAGE_NAME.test(object.name)) {
          throw new ExportSourceError();
        }
        const expectedSize = assertStorageDownloadAllowed(object, budget);
        const path = `${userId}/${object.name}`;
        const { data: blob, error: downloadError } = await bucket.download(path);
        if (downloadError || !(blob instanceof Blob) || blob.size !== expectedSize) {
          throw new ExportSourceError();
        }
        const entry = { path, markdown: await blob.text() };
        reserveExportValue(budget, entry);
        entries.push(entry);
      }

      if (data.length < STORAGE_PAGE_SIZE) break;
      offset += data.length;
    }
    return entries;
  } catch (error) {
    budget.rows = initialRows;
    budget.bytes = initialBytes;
    throw error;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    if (!requestOriginAllowed(req)) return jsonResponse(req, { error: 'origin_not_allowed' }, 403);
    return corsPreflight(req);
  }
  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'method_not_allowed' }, 405, undefined, {
      'allow': 'POST, OPTIONS',
    });
  }
  if (!requestOriginAllowed(req)) {
    return jsonResponse(req, { error: 'origin_not_allowed' }, 403);
  }

  const abortController = new AbortController();
  const deadline = setTimeout(() => abortController.abort(), EXPORT_TIMEOUT_MS);

  try {
    await requireEmptyJsonObject(req, abortController.signal);

    const identity = identityFromGatewayJwt(req.headers.get('authorization') ?? '');
    if (!identity) return jsonResponse(req, { error: 'invalid_authorization' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(req, { error: 'server_misconfigured' }, 500);
    }

    const admin = createAdminClient(supabaseUrl, serviceRoleKey, abortController.signal);

    let verifiedUser: { id: string } | null = null;
    try {
      const { data, error } = await admin.auth.getUser(identity.accessToken);
      if (!error && data.user && UUID_PATTERN.test(data.user.id)) {
        verifiedUser = { id: data.user.id.toLowerCase() };
      }
    } catch {
      verifiedUser = null;
    }
    if (verifiedUser === null || verifiedUser.id !== identity.subject) {
      return jsonResponse(req, { error: 'invalid_authorization' }, 401);
    }
    const userId = verifiedUser.id;

    let retryAfter: unknown;
    try {
      const claim = await admin.rpc('claim_account_export', { p_user_id: userId });
      if (claim.error) return jsonResponse(req, { error: 'export_temporarily_unavailable' }, 503);
      retryAfter = claim.data;
    } catch {
      return jsonResponse(req, { error: 'export_temporarily_unavailable' }, 503);
    }
    if (!Number.isSafeInteger(retryAfter) || (retryAfter as number) < 0 || (retryAfter as number) > 300) {
      return jsonResponse(req, { error: 'export_temporarily_unavailable' }, 503);
    }
    if ((retryAfter as number) > 0) {
      return jsonResponse(req, {
        error: 'export_cooldown',
        retry_after_seconds: retryAfter,
      }, 429, undefined, { 'retry-after': String(retryAfter) });
    }

    const budget = createExportBudget();
    const tables: Record<string, unknown> = {};

    const profileResult = await admin.from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (profileResult.error) throw new ExportSourceError();
    if (ownedValue(profileResult.data, 'id') !== userId) {
      throw new RequestContractError('account_not_exportable', 409);
    }
    reserveExportValue(budget, profileResult.data);
    tables.users = profileResult.data;

    for (const source of EXPORT_TABLES) {
      tables[source.key ?? source.table] = await readAllOwnedRows(admin, source, userId, budget);
    }

    const storage = await readOwnedStorage(admin, userId, budget);

    // Detect an account deletion that committed while the export was being read.
    const finalAccountCheck = await admin.from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    if (finalAccountCheck.error || ownedValue(finalAccountCheck.data, 'id') !== userId) {
      throw new ExportSourceError();
    }

    return jsonResponse(req, {
      schema_version: 1,
      kind: '2nd-b-account-export',
      exported_at: new Date().toISOString(),
      user_id: userId,
      tables,
      storage,
      excluded: EXCLUDED,
      errors: {},
    }, 200, MAX_EXPORT_RESPONSE_BYTES, {
      'content-disposition': 'attachment; filename="2nd-brain-account-export.json"',
    });
  } catch (error) {
    if (isRequestContractError(error)) {
      return jsonResponse(req, { error: error.message }, error.status);
    }
    if (isExportLimitError(error)) {
      return jsonResponse(req, { error: error.message }, 413);
    }
    return jsonResponse(req, { error: 'export_temporarily_unavailable' }, 503);
  } finally {
    clearTimeout(deadline);
  }
});
