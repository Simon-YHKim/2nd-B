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
  verifyCreatedAtIdPagination?: boolean;
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
  EXCLUDED?: Readonly<Record<string, string>>;
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
  EXCLUDED: typeof EXCLUDED === "object" ? EXCLUDED : undefined,
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
    const awaited = Promise.resolve({ data: [] as Row[], error: null, count: 0 });
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
  select: string;
  filter: [string, string] | null;
  order: string[];
  from: number;
  to: number;
  head?: boolean;
  filters?: [string, string][];
}

function fakeDatabase(data: Record<string, Row[]>, serverPageSize = 2, options: {
  afterPage?: (page: number, call: QueryCall) => void;
  transformPage?: (rows: Row[], page: number) => Row[];
  recount?: { count: unknown; error: unknown };
  counterResult?: (call: QueryCall, count: number | null, index: number) => { count: unknown; error: unknown };
} = {}) {
  const calls: QueryCall[] = [];
  let pages = 0;
  let counters = 0;
  const admin = {
    from(table: string) {
      const call: QueryCall = { table, select: "*", filter: null, order: [], from: 0, to: 0 };
      const filters: [string, string][] = [];
      let wantsCount = false;
      const builder = {
        select(columns: string, opts?: { count?: string; head?: boolean }) {
          call.select = columns;
          wantsCount = opts?.count === "exact";
          call.head = opts?.head;
          return builder;
        },
        eq(column: string, value: string) {
          call.filter = [column, value];
          filters.push([column, value]);
          call.filters = filters;
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
          const rows = (data[table] ?? [])
            .filter((row) => filters.every(([column, value]) => row[column] === value))
            .sort((a, b) => {
              for (const key of call.order) {
                const compared = String(a[key]).localeCompare(String(b[key]));
                if (compared !== 0) return compared;
              }
              return 0;
            });
          const result = {
            data: rows.slice(from, from + Math.min(to - from + 1, serverPageSize))
              .map((row) => call.select === "*" ? row : Object.fromEntries(
                call.select.split(",").map((column) => [column, row[column]]),
              )),
            error: null,
            count: wantsCount ? rows.length : null,
          };
          pages += 1;
          if (options.transformPage) result.data = options.transformPage(result.data, pages);
          options.afterPage?.(pages, call);
          return result;
        },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          calls.push({ ...call, order: [...call.order] });
          const count = wantsCount ? (data[table] ?? [])
            .filter((row) => filters.every(([column, value]) => row[column] === value)).length : null;
          const counterResult = call.select === "id"
            ? options.counterResult?.(call, count, ++counters) : undefined;
          return Promise.resolve({
            data: null, error: null, count, ...options.recount, ...counterResult,
          }).then(resolve, reject);
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
      .toBe('attachment; filename="polascope-account-export.json"');
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
  });

  test("exports a raw clipping whose full owner path is exactly 1024 UTF-8 bytes", async () => {
    const setup = successfulAdmin();
    const name = `${"a".repeat(984)}.md`;
    const path = `${OWNER_ID}/${name}`;
    expect(new TextEncoder().encode(path).byteLength).toBe(1024);
    setup.bucket.list
      .mockResolvedValueOnce({ data: [{ name, metadata: { size: 7 } }], error: null })
      .mockResolvedValue({ data: [], error: null });
    setup.bucket.download.mockResolvedValue({ data: new Blob(["content"]), error: null });
    createClientMock.mockReturnValue(setup.admin);

    const response = await edge.handler(request({ token: jwt(), body: "{}" }));
    expect(response.status).toBe(200);
    const body = await response.json() as { storage: { path: string; markdown: string }[] };
    expect(body.storage).toEqual([{ path, markdown: "content" }]);
    expect(setup.bucket.download).toHaveBeenCalledWith(path);
  });

  test.each([
    ["oversized owner path", `${"a".repeat(985)}.md`],
    ["oversized multibyte owner path", `${"한".repeat(329)}.md`],
    ["nested path", "folder/clip.md"],
    ["backslash path", "folder\\clip.md"],
    ["parent segment", ".."],
    ["control character", "clip\nname.md"],
  ])("fails closed on an unsafe raw clipping name: %s", async (_case, name) => {
    const setup = successfulAdmin();
    setup.bucket.list.mockResolvedValueOnce({
      data: [{ name, metadata: { size: 7 } }], error: null,
    });
    createClientMock.mockReturnValue(setup.admin);

    const response = await edge.handler(request({ token: jwt(), body: "{}" }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "export_temporarily_unavailable" });
    expect(setup.bucket.download).not.toHaveBeenCalled();
  });

  test("keeps the record-photos name limit at 255 characters", async () => {
    const setup = successfulAdmin();
    setup.bucket.list
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: [{ name: "p".repeat(256), metadata: { size: 1 } }], error: null,
      });
    createClientMock.mockReturnValue(setup.admin);

    const response = await edge.handler(request({ token: jwt(), body: "{}" }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "export_temporarily_unavailable" });
    expect(setup.bucket.download).not.toHaveBeenCalled();
  });
});

describe("export-account bounded owned readers", () => {
  test("G4-05 fixture checks the client loopback target across CI port mappings", () => {
    const root = join(__dirname, "../../../..");
    const fixture = readFileSync(join(root, "db/tests/profile_context_import_export.sql"), "utf8");
    const runner = readFileSync(join(root, "scripts/test-profile-import-sql.mjs"), "utf8");
    expect(runner).toContain('"-h", "127.0.0.1"');
    expect(fixture).toContain("set_config('g4export.client_host', :'HOST', true)");
    expect(fixture).toContain("current_setting('g4export.client_host') IS DISTINCT FROM '127.0.0.1'");
    expect(fixture).not.toContain("inet_server_addr()");
  });

  const historyColumns = [
    "id", "user_id", "created_at", "item_count", "profile_change_count", "status",
    "withdrawn_at", "profile_restored",
  ];
  const privateImportColumns = [
    "request_digest", "request_id", "document", "confirmed_ids", "profile_before",
    "profile_patch", "profile_predecessors", "field_undo", "applied_revision", "source_id",
  ];

  test("G4-05 exports exactly the approved history columns with owner and stable order", async () => {
    const descriptors = edge.EXPORT_TABLES?.filter((entry) => entry.table === "profile_context_imports");
    expect(descriptors).toHaveLength(1);
    const descriptor = descriptors![0];
    expect(descriptor).toEqual({
      table: "profile_context_imports", fk: "user_id", order: ["created_at", "id"],
      select: historyColumns.join(","),
      verifyCreatedAtIdPagination: true,
    });
    const createdAt = "2026-10-10T00:00:00Z";
    const row = (id: string, status = "active", userId = OWNER_ID) => ({
      id, user_id: userId, created_at: createdAt, item_count: 2, profile_change_count: 1, status,
      withdrawn_at: status === "withdrawn" ? "2026-10-10T01:00:00Z" : null,
      profile_restored: status === "withdrawn",
      ...Object.fromEntries(privateImportColumns.map((column) => [column, "must stay private"])),
    });
    const db = fakeDatabase({ profile_context_imports: [
      row("3", "withdrawn"), row("0", "active", OTHER_ID), row("1"), row("2"),
    ] });
    const rows = await edge.readAllOwnedRows!(db.admin, descriptor, OWNER_ID) as Row[];
    expect(rows.map(({ id }) => id)).toEqual(["1", "2", "3"]);
    expect(rows[2]).toMatchObject({ status: "withdrawn", profile_restored: true });
    expect(rows.every((entry) => Object.keys(entry).sort().join() === [...historyColumns].sort().join())).toBe(true);
    expect(db.calls.filter(({ head }) => !head).map(({ from }) => from)).toEqual([0, 2]);
    for (const call of db.calls) {
      expect(call.select).toBe(historyColumns.join(","));
      expect(call.filter).toEqual(["user_id", OWNER_ID]);
      expect(call.order).toEqual(call.head ? [] : ["created_at", "id"]);
    }
    expect(db.calls.filter(({ head }) => head)).toHaveLength(1);
  });

  const historyDescriptor = () => edge.EXPORT_TABLES!.find((entry) => entry.table === "profile_context_imports")!;
  const historyRows = () => Array.from({ length: 200 }, (_, index) => ({
    id: String(index + 1).padStart(4, "0"), user_id: OWNER_ID,
    created_at: "2026-10-10T00:00:00.123456+00:00", item_count: 1,
    profile_change_count: 0, status: "active", withdrawn_at: null, profile_restored: false,
  }));

  test("G4-05 documents 0242 as applied and merged while the exporter rollout is pending", () => {
    const intro = readFileSync(join(__dirname, "../../../../docs/PROFILE-CONTEXT-IMPORT.md"), "utf8")
      .split("Implementation target:")[0];
    expect(intro).toContain("0242 was applied on 2026-10-10");
    expect(intro).toContain("18:58 KST (ledger version `20261010095836`)");
    expect(intro).toContain("#2202 merged at 19:04 KST");
    expect(intro).toContain("G4-05's 0243 and `export-account` deployment remain pending");
    expect(intro).not.toMatch(/Pending integrity follow-up|This PR is still a draft|0242 has not been applied/);
  });

  test.each(["earlier timestamp", "smaller same-time id"])(
    "G4-05 rejects a concurrent front insertion with %s between full pages", async (placement) => {
      const data = { profile_context_imports: historyRows() };
      const db = fakeDatabase(data, 100, { afterPage: (page) => {
        if (page === 1) data.profile_context_imports.unshift({
          ...data.profile_context_imports[0], id: "0000",
          created_at: placement === "earlier timestamp"
            ? "2026-10-09T23:59:59+00:00" : data.profile_context_imports[0].created_at,
        });
      } });
      const budget = edge.createExportBudget!();
      edge.reserveExportValue!(budget, { existing: true });
      const before = { ...budget };
      await expect(edge.readAllOwnedRows!(db.admin, historyDescriptor(), OWNER_ID, budget))
        .rejects.toThrow("export_source_unavailable");
      expect(budget).toEqual(before);
      expect(db.calls.filter(({ head }) => !head).map(({ from }) => from)).toEqual([0, 100]);
    },
  );

  test.each(["insert", "delete"])("G4-05 rechecks the owner count after the last page: %s", async (change) => {
    const data = { profile_context_imports: historyRows() };
    const db = fakeDatabase(data, 100, { afterPage: (page) => {
      if (page !== 2) return;
      if (change === "delete") data.profile_context_imports.pop();
      else data.profile_context_imports.push({ ...data.profile_context_imports[0], id: "9999" });
    } });
    await expect(edge.readAllOwnedRows!(db.admin, historyDescriptor(), OWNER_ID))
      .rejects.toThrow("export_source_unavailable");
    expect(db.calls.at(-1)).toMatchObject({ head: true, filter: ["user_id", OWNER_ID] });
  });

  test("G4-05 scopes the recount to the owner and opts in only the new history table", async () => {
    expect(edge.EXPORT_TABLES!.filter((entry) => entry.verifyCreatedAtIdPagination).map(({ table }) => table))
      .toEqual(["profile_context_imports"]);
    const data = { profile_context_imports: historyRows() };
    const db = fakeDatabase(data, 100, { afterPage: (page) => {
      if (page === 1) data.profile_context_imports.push({ ...data.profile_context_imports[0], user_id: OTHER_ID });
    } });
    await expect(edge.readAllOwnedRows!(db.admin, historyDescriptor(), OWNER_ID)).resolves.toHaveLength(200);
    expect(db.calls.at(-1)).toMatchObject({ head: true, select: historyColumns.join(","), filter: ["user_id", OWNER_ID] });
  });

  test.each([
    { count: null, error: null }, { count: 200, error: { message: "unavailable" } },
    { count: 199.5, error: null },
  ])("G4-05 fails closed when the final count is unavailable: %j", async (recount) => {
    const db = fakeDatabase({ profile_context_imports: historyRows() }, 100, { recount });
    await expect(edge.readAllOwnedRows!(db.admin, historyDescriptor(), OWNER_ID))
      .rejects.toThrow("export_source_unavailable");
  });

  test.each(["timestamp reversal", "id reversal", "duplicate id at a later time", "missing id", "missing timestamp"])(
    "G4-05 rejects %s even when the final count is unchanged", async (corruption) => {
      const db = fakeDatabase({ profile_context_imports: historyRows() }, 100, {
        transformPage: (rows, page) => {
          if (page !== 2) return rows;
          if (corruption === "timestamp reversal") rows[0].created_at = "2026-10-09T23:59:59+00:00";
          if (corruption === "id reversal") [rows[0], rows[1]] = [rows[1], rows[0]];
          if (corruption === "duplicate id at a later time") rows[99] = {
            ...rows[99], id: "0001", created_at: "2026-10-10T00:00:01+00:00",
          };
          if (corruption === "missing id") delete rows[0].id;
          if (corruption === "missing timestamp") delete rows[0].created_at;
          return rows;
        },
      });
      await expect(edge.readAllOwnedRows!(db.admin, historyDescriptor(), OWNER_ID))
        .rejects.toThrow("export_source_unavailable");
    },
  );

  test("G4-05 keeps timestamp precedence at PostgreSQL microsecond precision", async () => {
    const rows = historyRows().slice(0, 3);
    rows[0].id = "9999";
    rows[1].created_at = "2026-10-10T00:00:00.123457+00:00";
    rows[2].created_at = "2026-10-10T00:00:00.123458+00:00";
    const db = fakeDatabase({ profile_context_imports: rows });
    await expect(edge.readAllOwnedRows!(db.admin, historyDescriptor(), OWNER_ID)).resolves.toEqual(rows);
  });

  test("G4-05 rechecks an initially empty history", async () => {
    const data: Record<string, Row[]> = { profile_context_imports: [] };
    const db = fakeDatabase(data, 100, { afterPage: () => data.profile_context_imports.push(historyRows()[0]) });
    await expect(edge.readAllOwnedRows!(db.admin, historyDescriptor(), OWNER_ID))
      .rejects.toThrow("export_source_unavailable");
  });

  test("G4-05 returns only a 503 error envelope on a concurrent insertion", async () => {
    const fixture = successfulAdmin();
    const data = { profile_context_imports: historyRows() };
    const db = fakeDatabase(data, 100, { afterPage: (page) => {
      if (page === 1) data.profile_context_imports.unshift({ ...data.profile_context_imports[0], id: "0000" });
    } });
    createClientMock.mockReturnValue({
      ...fixture.admin,
      from: (table: string) => table === "profile_context_imports" ? db.admin.from(table) : fixture.from(table),
    });
    const response = await edge.handler(request({ token: jwt(), body: "{}" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "export_temporarily_unavailable" });
  });

  test.each(privateImportColumns)("G4-05 never selects internal import column %s", (column) => {
    const descriptor = edge.EXPORT_TABLES!.find((entry) => entry.table === "profile_context_imports")!;
    expect(descriptor.select).toBeDefined();
    expect(descriptor.select!.split(",")).not.toContain("*");
    expect(descriptor.select!.split(",")).not.toContain(column);
  });

  function historyExport(options: {
    afterPage?: (data: Record<string, Row[]>, call: QueryCall) => void;
    counterResult?: NonNullable<Parameters<typeof fakeDatabase>[2]>["counterResult"];
  } = {}) {
    const fixture = successfulAdmin();
    const data: Record<string, Row[]> = {
      sources: [{ id: "source-1", user_id: OWNER_ID, content: "imported text" }],
      wiki_pages: [{ id: "page-1", user_id: OWNER_ID, content: "imported text" }],
      profile_context_imports: [historyRows()[0], { ...historyRows()[0], user_id: OTHER_ID }],
    };
    const db = fakeDatabase(data, 100, {
      afterPage: (_page, call) => options.afterPage?.(data, call),
      counterResult: options.counterResult,
    });
    createClientMock.mockReturnValue({
      ...fixture.admin,
      from: (table: string) => table in data ? db.admin.from(table) : fixture.from(table),
    });
    return { data, db, run: () => edge.handler(request({ token: jwt(), body: "{}" })) };
  }

  function withdrawHistory(data: Record<string, Row[]>, userId = OWNER_ID) {
    data.sources = data.sources.filter((row) => row.user_id !== userId);
    data.wiki_pages = data.wiki_pages.filter((row) => row.user_id !== userId);
    data.profile_context_imports = data.profile_context_imports.map((row) => row.user_id === userId ? {
      ...row, status: "withdrawn", withdrawn_at: "2026-10-10T01:00:00Z", profile_restored: true,
    } : row);
  }

  test.each(["sources", "wiki_pages", "profile_context_imports"])(
    "G4-05 returns 503 on withdrawal immediately after reading %s", async (table) => {
      const fixture = historyExport({ afterPage: (data, call) => {
        if (call.table === table) withdrawHistory(data);
      } });
      const identityBefore = fixture.data.profile_context_imports.map(({ id, created_at }) => ({ id, created_at }));
      const response = await fixture.run();
      expect(fixture.data.profile_context_imports.map(({ id, created_at }) => ({ id, created_at })))
        .toEqual(identityBefore);
      expect(fixture.data.profile_context_imports[0]).toMatchObject({
        status: "withdrawn", profile_restored: true, withdrawn_at: "2026-10-10T01:00:00Z",
      });
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "export_temporarily_unavailable" });
    },
  );

  test.each([false, true])("G4-05 rejects an insertion before history is read (initially empty: %s)", async (empty) => {
    const fixture = historyExport({ afterPage: (data, call) => {
      if (call.table === "wiki_pages") data.profile_context_imports.push({ ...historyRows()[0], id: "9999" });
    } });
    if (empty) fixture.data.profile_context_imports = [];
    const response = await fixture.run();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "export_temporarily_unavailable" });
  });

  test("G4-05 brackets related reads with exact owner-only total and withdrawn counts", async () => {
    const fixture = historyExport({ afterPage: (data, call) => {
      if (call.table === "wiki_pages") {
        withdrawHistory(data, OTHER_ID);
        data.profile_context_imports.push({ ...historyRows()[0], id: "other-new", user_id: OTHER_ID });
      }
    } });
    const response = await fixture.run();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.tables.sources).toEqual(fixture.data.sources);
    expect(body.tables.wiki_pages).toEqual(fixture.data.wiki_pages);
    expect(body.tables.profile_context_imports).toEqual([historyRows()[0]]);
    expect(fixture.db.calls.map(({ table, head, select, filters }) => ({ table, head: !!head, select, filters })))
      .toEqual([
        { table: "profile_context_imports", head: true, select: "id", filters: [["user_id", OWNER_ID]] },
        { table: "profile_context_imports", head: true, select: "id", filters: [["user_id", OWNER_ID], ["status", "withdrawn"]] },
        { table: "sources", head: false, select: "*", filters: [["user_id", OWNER_ID]] },
        { table: "wiki_pages", head: false, select: "*", filters: [["user_id", OWNER_ID]] },
        { table: "profile_context_imports", head: false, select: historyColumns.join(","), filters: [["user_id", OWNER_ID]] },
        { table: "profile_context_imports", head: true, select: historyColumns.join(","), filters: [["user_id", OWNER_ID]] },
        { table: "profile_context_imports", head: true, select: "id", filters: [["user_id", OWNER_ID]] },
        { table: "profile_context_imports", head: true, select: "id", filters: [["user_id", OWNER_ID], ["status", "withdrawn"]] },
      ]);
  });

  test("G4-05 allows an already withdrawn history without its source or page", async () => {
    const fixture = historyExport();
    withdrawHistory(fixture.data);
    const response = await fixture.run();
    expect(response.status).toBe(200);
    expect((await response.json()).tables).toMatchObject({
      sources: [], wiki_pages: [], profile_context_imports: [fixture.data.profile_context_imports[0]],
    });
  });

  describe.each([1, 2, 3, 4])("G4-05 lifecycle count query %s", (queryIndex) => {
    test.each([
      { count: null, error: null }, { count: 1, error: { message: "unavailable" } },
      { count: -1, error: null }, { count: 0.5, error: null }, { count: Number.MAX_SAFE_INTEGER + 1, error: null },
    ])("fails closed on an unavailable or invalid counter: %j", async (invalid) => {
      const fixture = historyExport({ counterResult: (_call, count, index) =>
        index === queryIndex ? invalid : { count, error: null } });
      const response = await fixture.run();
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "export_temporarily_unavailable" });
      if (queryIndex <= 2) expect(fixture.db.calls.every(({ head }) => head)).toBe(true);
    });
  });

  test("G4-05 uses the existing tables key and versioned JSON envelope", async () => {
    const fixture = successfulAdmin();
    createClientMock.mockReturnValue(fixture.admin);
    const response = await edge.handler(request({ token: jwt(), body: "{}" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schema_version: 1, kind: "2nd-b-account-export", tables: { profile_context_imports: [] },
    });
    expect(fixture.terminalFilters).toContainEqual({ table: "profile_context_imports", column: "user_id", value: OWNER_ID });
  });

  test("G4-05 leaves erasure classification and private undo retention unchanged", () => {
    const root = join(__dirname, "../../../..");
    const registry = JSON.parse(readFileSync(join(root, "db/erasure-registry.json"), "utf8"));
    expect(registry.tables.profile_context_imports).toMatchObject({ owner: "user_id", class: "retained" });
    const policies = JSON.parse(readFileSync(join(root, "db/migration-drafts/service-contract-erasure-entries.json"), "utf8"));
    expect(policies.columnPolicies["0242_profile_context_import_integrity.sql"]["profile_context_imports.field_undo"])
      .toContain("Account deletion cascades the row.");
    const migration = readFileSync(join(root, "db/migrations/0243_profile_context_import_export_grant.sql"), "utf8")
      .replace(/--[^\n]*/g, "");
    expect(migration).not.toMatch(/\b(?:CREATE|ALTER|INSERT|UPDATE|DELETE|DROP|TRUNCATE|POLICY)\b/i);
    expect(migration).not.toMatch(/\b(?:authenticated|anon|PUBLIC\s*[,;])\b/i);
    expect(migration).toMatch(/GRANT SELECT\s*\([^)]+\)\s*ON public\.profile_context_imports TO service_role;\s*$/);
  });

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

  test("discloses every newer account-scoped operational and security table as excluded", () => {
    expect(edge.EXCLUDED).toMatchObject({
      public_data_quota_daily: expect.any(String),
      oauth_naver_identities: expect.any(String),
      billing_self_service_rate_limits: expect.any(String),
      llm_proxy_purpose_daily: expect.any(String),
      reward_ssv_issue_rate_limits: expect.any(String),
      peer_response_rate_limits: expect.any(String),
      rss_proxy_quota_daily: expect.any(String),
      account_deletion_tombstones: expect.any(String),
    });
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
