// 0178 records.client_request_id - the client half of the retry key.
//
// The server half is live (UNIQUE (user_id, client_request_id), applied to prod
// 2026-09-26). These tests pin what createRecord does with it: send the key
// only when there is one, turn the server's 23505 into a replay of the row the
// earlier attempt already committed, and refuse to alias a different note. The
// fake table below enforces the same owner-scoped uniqueness the migration does,
// so "one row" is counted, not assumed.
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Row = { id: string; user_id: string; kind: string; body: string; tags: string[]; client_request_id?: string };

const mockRows: Row[] = [];
const mockInserted: Record<string, unknown>[] = [];
const mockLookupFilters: Array<[string, unknown]> = [];
let mockLoseNextResponse = false;
let mockForceOtherConflict = false;
const mockAwardXp = jest.fn();
const mockInvalidate = jest.fn();
const mockClassify = jest.fn();

function mockUniqueViolation() {
  return {
    code: "23505",
    message: 'duplicate key value violates unique constraint "records_owner_client_request_unique"',
  };
}

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      if (table !== "records") throw new Error(`unexpected table: ${table}`);
      return {
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              mockInserted.push(row);
              if (mockForceOtherConflict) return { data: null, error: mockUniqueViolation() };
              // Postgres UNIQUE never matches NULL, so NULL is "no key".
              const key = (row.client_request_id ?? undefined) as string | undefined;
              if (key !== undefined && mockRows.some((r) => r.user_id === row.user_id && r.client_request_id === key)) {
                return { data: null, error: mockUniqueViolation() };
              }
              const stored: Row = {
                id: `rec-${mockRows.length + 1}`,
                user_id: row.user_id as string,
                kind: row.kind as string,
                body: row.body as string,
                tags: row.tags as string[],
                ...(key !== undefined ? { client_request_id: key } : {}),
              };
              mockRows.push(stored);
              if (mockLoseNextResponse) {
                // Committed server-side; the client never hears back.
                mockLoseNextResponse = false;
                throw new Error("network lost after commit");
              }
              return { data: { id: stored.id }, error: null };
            },
          }),
        }),
        select: () => {
          const filters: Array<[string, unknown]> = [];
          const query = {
            eq: (field: string, value: unknown) => {
              filters.push([field, value]);
              mockLookupFilters.push([field, value]);
              return query;
            },
            maybeSingle: async () => {
              const hit = mockRows.find((r) =>
                filters.every(([f, v]) => (r as unknown as Record<string, unknown>)[f] === v),
              );
              return { data: hit ?? null, error: null };
            },
          };
          return query;
        },
      };
    },
  }),
}));
jest.mock("../../llm/boundary", () => ({
  callAdvisor: jest.fn(),
  callLlm: jest.fn(),
  classifyRecordTextForCrisis: (...args: unknown[]) => mockClassify(...args),
}));
jest.mock("../../progression/xp", () => ({
  awardXpSafe: (...args: unknown[]) => mockAwardXp(...args),
}));
jest.mock("../../persona/load-domain-levels", () => ({
  invalidateDomainLevels: (...args: unknown[]) => mockInvalidate(...args),
}));
jest.mock("../../env", () => ({ getEnv: () => ({ EXPO_PUBLIC_LLM_MODE: "mock" }) }));
jest.mock("../records-embeddings", () => ({
  embedAndStoreRecord: jest.fn(),
  recordsEmbeddingAllowed: jest.fn(),
}));
jest.mock("../../knowledge/engines", () => ({ buildMemorizedPattern: jest.fn() }));

import { createRecord } from "../create";

const args = {
  userId: "owner-a",
  locale: "en" as const,
  kind: "note" as const,
  body: "device-local pending note",
  withFollowup: false,
  clientRequestId: "preauth:p_1782000000000_abc12",
};

beforeEach(() => {
  mockRows.length = 0;
  mockInserted.length = 0;
  mockLookupFilters.length = 0;
  mockLoseNextResponse = false;
  mockForceOtherConflict = false;
  mockAwardXp.mockReset().mockResolvedValue(null);
  mockInvalidate.mockReset();
  mockClassify.mockReset().mockResolvedValue(null);
});

describe("createRecord - 0178 client_request_id", () => {
  test("a keyed insert sends the key and awards side effects once", async () => {
    await expect(createRecord(args)).resolves.toMatchObject({ id: "rec-1" });
    expect(mockInserted[0]).toEqual(expect.objectContaining({ client_request_id: args.clientRequestId }));
    expect(mockAwardXp).toHaveBeenCalledTimes(1);
    expect(mockRows).toHaveLength(1);
  });

  test("an unkeyed insert sends NULL, which the unique key never matches", async () => {
    const { clientRequestId: _omit, ...unkeyed } = args;
    await createRecord(unkeyed);
    await createRecord(unkeyed);
    expect(mockInserted[0]).toEqual(expect.objectContaining({ client_request_id: null }));
    // Two ordinary saves of the same text are two notes, as before.
    expect(mockRows).toHaveLength(2);
  });

  test("a retry after a committed-but-lost response replays the one row", async () => {
    mockLoseNextResponse = true;
    await expect(createRecord(args)).rejects.toThrow("network lost after commit");
    expect(mockRows).toHaveLength(1);

    const replay = await createRecord(args);

    expect(replay.id).toBe("rec-1");
    expect(mockRows).toHaveLength(1);
    // Rewards belong to the attempt that committed; the replay repeats none.
    expect(mockAwardXp).toHaveBeenCalledTimes(0);
    // The lookup is bound to the owner as well as the key.
    expect(mockLookupFilters).toEqual([
      ["user_id", args.userId],
      ["client_request_id", args.clientRequestId],
    ]);
    // The committed attempt died before dropping the cached levels.
    expect(mockInvalidate).toHaveBeenCalledWith(args.userId);
  });

  test("two sequential sends of the same key leave exactly one row", async () => {
    const first = await createRecord(args);
    const second = await createRecord(args);
    expect(second.id).toBe(first.id);
    expect(mockRows).toHaveLength(1);
    expect(mockAwardXp).toHaveBeenCalledTimes(1);
  });

  test("the key is owner-scoped: another user's identical key is a different row", async () => {
    await createRecord(args);
    const other = await createRecord({ ...args, userId: "owner-b" });
    expect(other.id).not.toBe("rec-1");
    expect(mockRows.map((r) => r.user_id)).toEqual(["owner-a", "owner-b"]);
  });

  test("a reused key with a different body fails closed and adds no row", async () => {
    await createRecord(args);
    await expect(createRecord({ ...args, body: "different private text" })).rejects.toThrow(
      "record_idempotency_conflict",
    );
    expect(mockRows).toHaveLength(1);
    expect(mockAwardXp).toHaveBeenCalledTimes(1);
  });

  test("a 23505 with no row under this key rethrows the insert error", async () => {
    // A unique violation from some other constraint: nothing to replay.
    mockForceOtherConflict = true;
    await expect(createRecord(args)).rejects.toMatchObject({ code: "23505" });
    expect(mockRows).toHaveLength(0);
  });

  test("C9 still runs on the replay and its red follow-up is returned", async () => {
    await createRecord(args);
    mockClassify.mockResolvedValue({ text: "fixed crisis template" });

    const replay = await createRecord(args);

    expect(mockClassify).toHaveBeenCalledTimes(2);
    expect(replay.followup).toEqual({ text: "fixed crisis template", zone: "red", fixedTemplate: true });
  });

  test.each([
    ["whitespace in the key", { clientRequestId: "contains whitespace" }],
    ["a key over 128 chars", { clientRequestId: `k${"x".repeat(128)}` }],
    ["a journal", { kind: "journal" as const }],
    ["an audit answer", { kind: "audit_response" as const }],
    ["follow-ups left on", { withFollowup: true }],
    ["follow-ups unspecified", { withFollowup: undefined }],
  ])("rejects %s before classification or any write", async (_label, patch) => {
    await expect(createRecord({ ...args, ...patch })).rejects.toThrow("invalid_client_request_id");
    expect(mockInserted).toHaveLength(0);
    expect(mockClassify).not.toHaveBeenCalled();
  });
});

describe("0178 migration contract (live since 2026-09-26)", () => {
  const sql = readFileSync(
    join(process.cwd(), "db", "migrations", "0178_records_client_request_id.sql"),
    "utf8",
  );

  test("owner-scoped unique key with the same bound the client checks", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS client_request_id text/);
    expect(sql).toMatch(/UNIQUE \(user_id, client_request_id\)/);
    expect(sql).toMatch(/char_length\(client_request_id\) BETWEEN 1 AND 128/);
    expect(sql).toContain("client_request_id ~ '^[A-Za-z0-9._:-]+$'");
  });

  test("keeps records under forced RLS so the replay lookup cannot cross owners", () => {
    expect(sql).toMatch(/ALTER TABLE public\.records FORCE ROW LEVEL SECURITY;/);
  });
});
