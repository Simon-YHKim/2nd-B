import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

type Row = Record<string, unknown>;

interface ExportSource {
  table: string;
  fk: string;
  order?: string[];
  select?: string;
  key?: string;
}

interface ExportBudget {
  rows: number;
  bytes: number;
  maxRows: number;
  maxBytes: number;
}

interface TestQueryBuilder extends PromiseLike<unknown> {
  select: (...args: unknown[]) => TestQueryBuilder;
  eq: (column: string, value: string) => TestQueryBuilder;
  order: (...args: unknown[]) => TestQueryBuilder;
  range: (...args: number[]) => Promise<{ data: Row[]; error: unknown; count: number | null }>;
  maybeSingle: () => Promise<{ data: Row | null; error: unknown }>;
}

interface ExportModule {
  handler: (req: Request) => Promise<Response>;
  readAllOwnedRows?: (
    admin: unknown,
    source: ExportSource,
    userId: string,
    budget?: ExportBudget,
  ) => Promise<unknown[]>;
  createExportBudget?: (limits?: { maxRows?: number; maxBytes?: number }) => ExportBudget;
  reserveExportValue?: (budget: ExportBudget, value: unknown, rows?: number) => void;
  assertStorageDownloadAllowed?: (
    object: { metadata?: Record<string, unknown> | null },
    budget: ExportBudget,
  ) => number;
  limitResponseBody?: (response: Response, maxBytes: number) => Promise<Response>;
  jsonResponse: (
    req: Request,
    body: unknown,
    status?: number,
    maxBytes?: number,
    headers?: Record<string, string>,
  ) => Response;
  DATABASE_PAGE_SIZE?: number;
  MAX_EXPORT_ROWS?: number;
  MAX_EXPORT_CONTENT_BYTES?: number;
  MAX_EXPORT_RESPONSE_BYTES?: number;
  MAX_STORAGE_OBJECT_BYTES?: number;
  EXPORT_TIMEOUT_MS?: number;
  EXPORT_TABLES?: ExportSource[];
}

const edgePath = join(__dirname, "../../../../supabase/functions/export-account/index.ts");
const source = readFileSync(edgePath, "utf8");
const js = ts.transpileModule(source.replace(/^import .*;\r?$/gm, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const serveMock = jest.fn();
const createClientMock = jest.fn();
const exported = new Function("Deno", "createClient", `${js}\nreturn {
  readAllOwnedRows: typeof readAllOwnedRows === "function" ? readAllOwnedRows : undefined,
  createExportBudget: typeof createExportBudget === "function" ? createExportBudget : undefined,
  reserveExportValue: typeof reserveExportValue === "function" ? reserveExportValue : undefined,
  assertStorageDownloadAllowed: typeof assertStorageDownloadAllowed === "function"
    ? assertStorageDownloadAllowed : undefined,
  limitResponseBody: typeof limitResponseBody === "function" ? limitResponseBody : undefined,
  jsonResponse,
  DATABASE_PAGE_SIZE: typeof DATABASE_PAGE_SIZE === "number" ? DATABASE_PAGE_SIZE : undefined,
  MAX_EXPORT_ROWS: typeof MAX_EXPORT_ROWS === "number" ? MAX_EXPORT_ROWS : undefined,
  MAX_EXPORT_CONTENT_BYTES: typeof MAX_EXPORT_CONTENT_BYTES === "number"
    ? MAX_EXPORT_CONTENT_BYTES : undefined,
  MAX_EXPORT_RESPONSE_BYTES: typeof MAX_EXPORT_RESPONSE_BYTES === "number"
    ? MAX_EXPORT_RESPONSE_BYTES : undefined,
  MAX_STORAGE_OBJECT_BYTES: typeof MAX_STORAGE_OBJECT_BYTES === "number"
    ? MAX_STORAGE_OBJECT_BYTES : undefined,
  EXPORT_TIMEOUT_MS: typeof EXPORT_TIMEOUT_MS === "number" ? EXPORT_TIMEOUT_MS : undefined,
  EXPORT_TABLES: typeof EXPORT_TABLES === "object" ? EXPORT_TABLES : undefined,
};`)({
  serve: serveMock,
  env: {
    get: (name: string) => name === "SUPABASE_URL"
      ? "https://project.test"
      : name === "SUPABASE_SERVICE_ROLE_KEY" ? "service-role-test" : undefined,
  },
}, createClientMock) as Omit<ExportModule, "handler">;
const edge: ExportModule = {
  ...exported,
  handler: serveMock.mock.calls[0][0] as ExportModule["handler"],
};

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_ID = "00000000-0000-4000-8000-000000000002";

function jwt(sub = OWNER_ID, role = "authenticated"): string {
  const payload = Buffer.from(JSON.stringify({ sub, role })).toString("base64url");
  return `header.${payload}.signature`;
}

function request(options: {
  token?: string;
  body?: string;
  origin?: string;
  method?: string;
} = {}): Request {
  const headers = new Headers();
  if (options.token !== undefined) headers.set("authorization", `Bearer ${options.token}`);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.origin !== undefined) headers.set("origin", options.origin);
  return new Request("https://project.test/functions/v1/export-account", {
    method: options.method ?? "POST",
    headers,
    body: options.body,
  });
}

function successfulAdmin(authUserId = OWNER_ID) {
  const terminalFilters: { table: string; column: string; value: string }[] = [];
  const auth = {
    getUser: jest.fn().mockResolvedValue({ data: { user: { id: authUserId } }, error: null }),
  };
  const rpc = jest.fn().mockResolvedValue({ data: 0, error: null });
  const from = jest.fn((table: string) => {
    let filter: [string, string] | null = null;
    const awaited = Promise.resolve({ data: [] as Row[], error: null });
    const builder: TestQueryBuilder = {
      select: jest.fn(() => builder),
      eq: jest.fn((column: string, value: string) => {
        filter = [column, value];
        return builder;
      }),
      order: jest.fn(() => builder),
      range: jest.fn(async () => {
        if (filter) terminalFilters.push({ table, column: filter[0], value: filter[1] });
        return { data: [], error: null, count: 0 };
      }),
      maybeSingle: jest.fn(async () => {
        if (filter) terminalFilters.push({ table, column: filter[0], value: filter[1] });
        return table === "users"
          ? { data: { id: authUserId, date_of_birth: "1990-01-01" }, error: null }
          : { data: null, error: null };
      }),
      then: awaited.then.bind(awaited),
    };
    return builder;
  });
  const bucket = {
    list: jest.fn().mockResolvedValue({ data: [], error: null }),
    download: jest.fn(),
  };
  const storage = { from: jest.fn(() => bucket) };
  return { admin: { auth, rpc, from, storage }, auth, rpc, from, storage, bucket, terminalFilters };
}

interface QueryCall {
  table: string;
  filter: [string, string] | null;
  order: string[];
  from: number;
  to: number;
}

function fakeDatabase(data: Record<string, Row[]>, serverPageSize = 2) {
  const calls: QueryCall[] = [];
  const admin = {
    from(table: string) {
      const call: QueryCall = { table, filter: null, order: [], from: 0, to: 0 };
      let wantsCount = false;
      const builder = {
        select(_columns: string, opts?: { count?: string }) {
          wantsCount = opts?.count === "exact";
          return builder;
        },
        eq(column: string, value: string) {
          call.filter = [column, value];
          return builder;
        },
        order(column: string) {
          call.order.push(column);
          return builder;
        },
        async range(from: number, to: number) {
          call.from = from;
          call.to = to;
          calls.push({ ...call, order: [...call.order] });
          const [column, value] = call.filter ?? ["", ""];
          const rows = (data[table] ?? [])
            .filter((row) => row[column] === value)
            .sort((a, b) => {
              for (const key of call.order) {
                const compared = String(a[key]).localeCompare(String(b[key]));
                if (compared !== 0) return compared;
              }
              return 0;
            });
          return {
            data: rows.slice(from, from + Math.min(to - from + 1, serverPageSize)),
            error: null,
            count: wantsCount ? rows.length : null,
          };
        },
      };
      return builder;
    },
  };
  return { admin, calls };
}

beforeEach(() => {
  createClientMock.mockReset();
});

describe("export-account trust boundary", () => {
  test("keeps gateway verification enabled", () => {
    const config = readFileSync(join(__dirname, "../../../../supabase/config.toml"), "utf8");
    expect(config).toMatch(/\[functions\.export-account\][\s\S]*?verify_jwt\s*=\s*true/);
  });

  test("rejects client-selected identity, table, or filter before privileged setup", async () => {
    createClientMock.mockImplementation(() => { throw new Error("admin client must not be created"); });
    const response = await edge.handler(request({
      token: jwt(),
      body: JSON.stringify({ user_id: OTHER_ID, table: "users", filter: "*" }),
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request_body" });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  test("rejects an untrusted browser origin before it can consume a cooldown", async () => {
    const setup = successfulAdmin();
    createClientMock.mockReturnValue(setup.admin);
    const response = await edge.handler(request({
      token: jwt(), body: "{}", origin: "https://attacker.example",
    }));
    expect(response.status).toBe(403);
    expect(setup.rpc).not.toHaveBeenCalled();
  });

  test("verifies the JWT with auth.getUser and requires its subject to match", async () => {
    const setup = successfulAdmin(OTHER_ID);
    createClientMock.mockReturnValue(setup.admin);
    const token = jwt(OWNER_ID);
    const response = await edge.handler(request({ token, body: "{}" }));
    expect(response.status).toBe(401);
    expect(setup.auth.getUser).toHaveBeenCalledWith(token);
    expect(setup.rpc).not.toHaveBeenCalled();
    expect(setup.from).not.toHaveBeenCalled();
  });

  test("fails closed before personal reads when the atomic limiter is missing", async () => {
    const setup = successfulAdmin();
    setup.rpc.mockResolvedValue({ data: null, error: { message: "function missing" } });
    createClientMock.mockReturnValue(setup.admin);
    const response = await edge.handler(request({ token: jwt(), body: "{}" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "export_temporarily_unavailable" });
    expect(setup.rpc).toHaveBeenCalledWith("claim_account_export", { p_user_id: OWNER_ID });
    expect(setup.from).not.toHaveBeenCalled();
  });

  test("returns a bounded retry without reading personal data", async () => {
    const setup = successfulAdmin();
    setup.rpc.mockResolvedValue({ data: 127, error: null });
    createClientMock.mockReturnValue(setup.admin);
    const response = await edge.handler(request({ token: jwt(), body: "{}" }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("127");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(setup.from).not.toHaveBeenCalled();
  });

  test("does not turn a source failure into a partial successful export", async () => {
    const setup = successfulAdmin();
    setup.from.mockImplementation(() => {
      const failure = {
        data: null,
        error: { message: "date_of_birth=1990-01-01 service role secret" },
      };
      const awaited = Promise.resolve(failure);
      const builder: TestQueryBuilder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        range: async () => ({ ...failure, data: [], count: null }),
        maybeSingle: async () => failure,
        then: awaited.then.bind(awaited),
      };
      return builder;
    });
    createClientMock.mockReturnValue(setup.admin);
    const response = await edge.handler(request({ token: jwt(), body: "{}" }));
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ error: "export_temporarily_unavailable" });
    expect(body).not.toContain("1990-01-01");
  });

  test("exports an otherwise empty account with owner predicates on every admin query", async () => {
    const setup = successfulAdmin();
    createClientMock.mockReturnValue(setup.admin);
    const response = await edge.handler(request({ token: jwt(), body: "{}" }));
    expect(response.status).toBe(200);
    const body = await response.json() as { user_id: string; errors: unknown; storage: unknown[] };
    expect(body).toMatchObject({ user_id: OWNER_ID, errors: {}, storage: [] });
    expect(setup.terminalFilters.length).toBeGreaterThan(1);
    expect(setup.terminalFilters.every(({ value }) => value === OWNER_ID)).toBe(true);
    expect(setup.terminalFilters.find(({ table }) => table === "users"))
      .toMatchObject({ column: "id", value: OWNER_ID });
    expect(response.headers.get("content-disposition"))
      .toBe('attachment; filename="2nd-brain-account-export.json"');
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
  });
});

describe("export-account bounded owned readers", () => {
  test("paginates a fixed table and excludes cross-owner rows on every page", async () => {
    expect(edge.readAllOwnedRows).toBeDefined();
    const readAllOwnedRows = edge.readAllOwnedRows;
    if (!readAllOwnedRows) return;
    const db = fakeDatabase({ records: [
      { id: "3", user_id: OWNER_ID },
      { id: "0", user_id: OTHER_ID },
      { id: "1", user_id: OWNER_ID },
      { id: "2", user_id: OWNER_ID },
    ] });
    await expect(readAllOwnedRows(
      db.admin,
      { table: "records", fk: "user_id" },
      OWNER_ID,
    )).resolves.toEqual([
      { id: "1", user_id: OWNER_ID },
      { id: "2", user_id: OWNER_ID },
      { id: "3", user_id: OWNER_ID },
    ]);
    expect(db.calls.map(({ from }) => from)).toEqual([0, 2]);
    expect(db.calls.every(({ filter }) => filter?.join(":") === `user_id:${OWNER_ID}`)).toBe(true);
  });

  test("enforces finite row, UTF-8 byte, storage object, response, and time limits", async () => {
    expect(edge.createExportBudget).toBeDefined();
    expect(edge.reserveExportValue).toBeDefined();
    expect(edge.assertStorageDownloadAllowed).toBeDefined();
    if (!edge.createExportBudget || !edge.reserveExportValue || !edge.assertStorageDownloadAllowed) return;

    const value = { text: "한글🙂" };
    const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
    const budget = edge.createExportBudget({ maxRows: 1, maxBytes: bytes });
    edge.reserveExportValue(budget, value);
    expect(budget).toMatchObject({ rows: 1, bytes });
    expect(() => edge.reserveExportValue?.(budget, value)).toThrow("export_row_limit_exceeded");

    expect(() => edge.assertStorageDownloadAllowed?.(
      { metadata: { size: (edge.MAX_STORAGE_OBJECT_BYTES ?? 0) + 1 } },
      edge.createExportBudget?.() as ExportBudget,
    )).toThrow("export_storage_object_too_large");
    expect(edge.DATABASE_PAGE_SIZE).toBe(100);
    expect(edge.MAX_EXPORT_ROWS).toBeGreaterThan(0);
    expect(edge.MAX_EXPORT_ROWS).toBeLessThanOrEqual(50_000);
    expect(edge.MAX_EXPORT_CONTENT_BYTES).toBeLessThan(edge.MAX_EXPORT_RESPONSE_BYTES ?? 0);
    expect(edge.EXPORT_TIMEOUT_MS).toBeGreaterThan(0);
    expect(edge.EXPORT_TIMEOUT_MS).toBeLessThanOrEqual(30_000);

    const tooLarge = edge.jsonResponse(
      request({ method: "GET" }),
      { value: "한".repeat(20) },
      200,
      32,
    );
    expect(tooLarge.status).toBe(413);
    await expect(tooLarge.json()).resolves.toEqual({ error: "export_response_too_large" });
  });

  test("caps each privileged upstream response before the SDK can buffer it", async () => {
    expect(edge.limitResponseBody).toBeDefined();
    if (!edge.limitResponseBody) return;
    const response = await edge.limitResponseBody(new Response("x".repeat(33)), 32);
    await expect(response.text()).rejects.toThrow("export_source_response_too_large");
  });

  test("uses only a code-owned source inventory and abortable privileged requests", () => {
    expect(edge.EXPORT_TABLES?.length).toBeGreaterThan(20);
    expect(source).toContain("new AbortController()");
    expect(source).toMatch(/global:\s*\{\s*fetch:/);
    expect(source).toContain("clearTimeout(");
    expect(source).not.toMatch(/console\.(?:log|warn|error)/);
    expect(source).not.toContain("String(error)");
    expect(source).not.toMatch(/errors\[[^\]]+\]\s*=/);
  });
});

describe("account export cooldown migration contract", () => {
  test("is an atomic service-role-only claim with FORCE RLS", () => {
    const migrationPath = join(__dirname, "../../../../db/migrations/0175_account_export_rate_limit.sql");
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.account_export_rate_limits/i);
    expect(migration).toMatch(/PRIMARY KEY \(user_id\)/i);
    expect(migration).toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/FORCE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.claim_account_export\(p_user_id uuid\)/i);
    expect(migration).toMatch(/SECURITY DEFINER[\s\S]*SET search_path = ''/i);
    expect(migration).toMatch(/billing_request_role\(\)[\s\S]*service_role/i);
    expect(migration).toMatch(/ON CONFLICT \(user_id\)[\s\S]*DO UPDATE[\s\S]*last_claimed_at/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.claim_account_export\(uuid\)[\s\S]*PUBLIC, anon, authenticated, service_role/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.claim_account_export\(uuid\) TO service_role/i);
  });
});
