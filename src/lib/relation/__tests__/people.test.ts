import fs from "node:fs";
import path from "node:path";

const mockFrom = jest.fn();
const mockInvalidateDomainLevels = jest.fn();

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ from: mockFrom }),
}));

jest.mock("../../persona/load-domain-levels", () => ({
  invalidateDomainLevels: mockInvalidateDomainLevels,
}));

import {
  AUTHORITATIVE_WRITE_REVISION,
  beginPersonSaveAttempt,
  completePersonSaveAttempt,
  createPerson,
  invalidatePersonSaveAttemptUi,
  isCurrentPersonSaveAttempt,
  listPeople,
  normalizePersonInput,
  releasePersonSaveAttempt,
  type PersonSaveIdentity,
  updatePerson,
} from "../people";

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, "../../../../db/migrations/0147_relation_people_client_revision.sql"),
  "utf8",
);

function dbPerson(overrides: Record<string, unknown> = {}) {
  return {
    id: "person-1",
    user_id: "user-1",
    display_name: "소하",
    relation_kind: "friend",
    closeness: 3,
    contact_cadence: null,
    last_interaction_on: null,
    note: null,
    tags: [],
    created_at: "2026-09-02T00:00:00.000Z",
    updated_at: "2026-09-02T00:00:00.000Z",
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  jest.useRealTimers();
  mockFrom.mockReset();
  mockInvalidateDomainLevels.mockReset();
});

describe("normalizePersonInput (enforces 0058 CHECK constraints, node-pure)", () => {
  test("valid input passes through, name/note trimmed", () => {
    const n = normalizePersonInput({
      display_name: "  소하  ",
      relation_kind: "partner",
      closeness: 5,
      contact_cadence: "daily",
      note: "  결혼  ",
      tags: ["가족"],
    });
    expect(n.display_name).toBe("소하");
    expect(n.relation_kind).toBe("partner");
    expect(n.closeness).toBe(5);
    expect(n.contact_cadence).toBe("daily");
    expect(n.note).toBe("결혼");
  });

  test("invalid relation_kind falls back to 'other'", () => {
    // @ts-expect-error intentional bad enum
    expect(normalizePersonInput({ display_name: "x", relation_kind: "bestie" }).relation_kind).toBe("other");
  });

  test("invalid contact_cadence drops to null (not a DB violation)", () => {
    // @ts-expect-error intentional bad enum
    expect(normalizePersonInput({ display_name: "x", contact_cadence: "yearly" }).contact_cadence).toBeNull();
  });

  test("closeness is clamped to 1..5 or dropped to null", () => {
    expect(normalizePersonInput({ display_name: "x", closeness: 9 }).closeness).toBeNull();
    expect(normalizePersonInput({ display_name: "x", closeness: 0 }).closeness).toBeNull();
    expect(normalizePersonInput({ display_name: "x", closeness: 3.4 }).closeness).toBe(3);
  });

  test("tags are trimmed, de-duped, and empties dropped", () => {
    expect(normalizePersonInput({ display_name: "x", tags: [" a ", "a", "", "b"] }).tags).toEqual(["a", "b"]);
  });

  test("missing kind defaults to 'other' and missing optionals are null", () => {
    const n = normalizePersonInput({ display_name: "친구" });
    expect(n.relation_kind).toBe("other");
    expect(n.closeness).toBeNull();
    expect(n.contact_cadence).toBeNull();
    expect(n.last_interaction_on).toBeNull();
    expect(n.note).toBeNull();
    expect(n.tags).toEqual([]);
  });
});

describe("person save attempt state machine", () => {
  function refs() {
    return {
      gen: { current: 0 },
      identity: { current: null as PersonSaveIdentity | null },
      inFlight: { current: null as PersonSaveIdentity | null },
    };
  }

  test("a retry keeps its id and advances revision; a synchronous second press is ignored", () => {
    const state = refs();
    const createId = jest.fn(() => "id-x");
    const first = beginPersonSaveAttempt(state.gen, state.identity, state.inFlight, createId);
    expect(first).toEqual({ id: "id-x", rev: 1, gen: 1 });
    expect(beginPersonSaveAttempt(state.gen, state.identity, state.inFlight, createId)).toBeNull();

    expect(releasePersonSaveAttempt(state.inFlight, first!)).toBe(true);
    const retry = beginPersonSaveAttempt(state.gen, state.identity, state.inFlight, createId);
    expect(retry).toEqual({ id: "id-x", rev: 2, gen: 2 });
    expect(createId).toHaveBeenCalledTimes(1);
  });

  test("close invalidates only UI and blocks a second request until late success settles", () => {
    const state = refs();
    const createId = jest.fn(() => "id-a");
    const first = beginPersonSaveAttempt(state.gen, state.identity, state.inFlight, createId);
    invalidatePersonSaveAttemptUi(state.gen);
    expect(isCurrentPersonSaveAttempt(state.gen, first!)).toBe(false);
    expect(beginPersonSaveAttempt(state.gen, state.identity, state.inFlight, createId)).toBeNull();
    expect(createId).toHaveBeenCalledTimes(1);

    expect(completePersonSaveAttempt(state.identity, state.inFlight, first!)).toBe(true);
    expect(state.identity.current).toBeNull();
    expect(state.inFlight.current).toBeNull();
  });

  test("late failure unlocks a retry with the same id and the next revision", () => {
    const state = refs();
    const createId = jest.fn(() => "id-a");
    const first = beginPersonSaveAttempt(state.gen, state.identity, state.inFlight, createId);
    invalidatePersonSaveAttemptUi(state.gen);

    expect(releasePersonSaveAttempt(state.inFlight, first!)).toBe(true);
    expect(state.identity.current).toEqual({ id: "id-a", rev: 1 });
    expect(state.inFlight.current).toBeNull();

    const retry = beginPersonSaveAttempt(state.gen, state.identity, state.inFlight, createId);
    expect(retry).toEqual({ id: "id-a", rev: 2, gen: 3 });
    expect(createId).toHaveBeenCalledTimes(1);
  });

  test("a stale attempt cannot complete or release a newer id+revision owner", () => {
    const state = refs();
    const first = beginPersonSaveAttempt(state.gen, state.identity, state.inFlight, () => "id-a");
    invalidatePersonSaveAttemptUi(state.gen);
    expect(releasePersonSaveAttempt(state.inFlight, first!)).toBe(true);
    const second = beginPersonSaveAttempt(state.gen, state.identity, state.inFlight, () => "id-b");

    expect(second).toEqual({ id: "id-a", rev: 2, gen: 3 });
    expect(completePersonSaveAttempt(state.identity, state.inFlight, first!)).toBe(false);
    expect(releasePersonSaveAttempt(state.inFlight, first!)).toBe(false);
    expect(state.identity.current).toEqual({ id: "id-a", rev: 2 });
    expect(state.inFlight.current).toEqual({ id: "id-a", rev: 2 });
  });
});

describe("0147 relation_people client revision migration", () => {
  test("adds one backwards-compatible monotonic revision column", () => {
    expect(MIGRATION).toMatch(
      /ALTER TABLE public\.relation_people\s+ADD COLUMN IF NOT EXISTS client_revision int NOT NULL DEFAULT 0;/,
    );
  });
});

describe("people query timeouts", () => {
  test("rejects a stalled Supabase query instead of loading forever", async () => {
    jest.useFakeTimers();
    const stalled = new Promise<never>(() => {});
    const order = jest.fn(() => stalled);
    const eq = jest.fn(() => ({ order }));
    const select = jest.fn(() => ({ eq }));
    mockFrom.mockReturnValue({ select });

    const result = listPeople("user-1").then(
      () => null,
      (error: unknown) => error,
    );
    await jest.advanceTimersByTimeAsync(20_000);

    await expect(result).resolves.toMatchObject({
      name: "TimeoutError",
      message: "people list timed out after 20000ms",
    });
  });

  test("rejects a stalled insert instead of leaving save locked forever", async () => {
    jest.useFakeTimers();
    const stalled = new Promise<never>(() => {});
    const select = jest.fn(() => stalled);
    const insert = jest.fn(() => ({ select }));
    mockFrom.mockReturnValue({ insert });

    const result = createPerson("user-1", { display_name: "소하" }).then(
      () => null,
      (error: unknown) => error,
    );
    await jest.advanceTimersByTimeAsync(20_000);

    await expect(result).resolves.toMatchObject({
      name: "TimeoutError",
      message: "people save timed out after 20000ms",
    });
  });

  test("bounds a stalled reconciliation update too", async () => {
    jest.useFakeTimers();
    const stalled = new Promise<never>(() => {});
    const updateSelect = jest.fn(() => stalled);
    const lt = jest.fn(() => ({ select: updateSelect }));
    const updateEqId = jest.fn(() => ({ lt }));
    const updateEqUser = jest.fn(() => ({ eq: updateEqId }));
    const update = jest.fn(() => ({ eq: updateEqUser }));
    const upsertSelect = jest.fn(() => Promise.resolve({ data: [], error: null }));
    const upsert = jest.fn(() => ({ select: upsertSelect }));
    mockFrom
      .mockReturnValueOnce({ upsert })
      .mockReturnValueOnce({ update });

    const result = createPerson(
      "user-1",
      { display_name: "소하" },
      "request-1",
      2,
    ).then(
      () => null,
      (error: unknown) => error,
    );
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(20_000);

    await expect(result).resolves.toMatchObject({
      name: "TimeoutError",
      message: "people reconcile timed out after 20000ms",
    });
  });
});

describe("createPerson retry convergence", () => {
  test("keeps the two-argument import path on DB-generated-id insert", async () => {
    const insertSelect = jest.fn(() => Promise.resolve({ data: [dbPerson()], error: null }));
    const insert = jest.fn((_row: Record<string, unknown>) => ({ select: insertSelect }));
    const upsert = jest.fn();
    mockFrom.mockReturnValue({ insert, upsert });

    const result = await createPerson("user-1", {
      display_name: " 소하 ",
      last_interaction_on: "2026-09-02",
    });

    expect(result.id).toBe("person-1");
    expect(upsert).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledTimes(1);
    const inserted = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(inserted).not.toHaveProperty("id");
    expect(inserted).not.toHaveProperty("client_revision");
    expect(mockInvalidateDomainLevels).toHaveBeenCalledTimes(1);
    expect(mockInvalidateDomainLevels).toHaveBeenCalledWith("user-1");
  });

  test("materializes the idempotent upsert once and sends the exact revision", async () => {
    const response = { data: [dbPerson({ id: "request-1" })], error: null };
    const execute = jest.fn(
      (
        resolve: (value: typeof response) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve(response).then(resolve, reject),
    );
    const select = jest.fn(() => ({ then: execute }));
    const upsert = jest.fn(() => ({ select }));
    mockFrom.mockReturnValue({ upsert });

    const result = await createPerson("user-1", { display_name: "소하" }, "request-1", 2);

    expect(result.id).toBe("request-1");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "request-1",
        user_id: "user-1",
        display_name: "소하",
        client_revision: 2,
      }),
      { onConflict: "id", ignoreDuplicates: true },
    );
    expect(mockInvalidateDomainLevels).toHaveBeenCalledTimes(1);
  });

  test("a late rev1 arrival cannot overwrite a rev2 first writer", async () => {
    jest.useFakeTimers();
    const releaseFirstArrival = deferred<void>();
    let stored: Record<string, unknown> | null = null;
    const arrivals: number[] = [];
    const upsert = jest.fn((payload: Record<string, unknown>) => ({
      select: () => {
        const arrive = () => {
          const revision = Number(payload.client_revision);
          arrivals.push(revision);
          if (stored !== null) return { data: [], error: null };
          stored = { ...dbPerson(), ...payload };
          return { data: [stored], error: null };
        };
        return payload.client_revision === 1
          ? releaseFirstArrival.promise.then(arrive)
          : Promise.resolve(arrive());
      },
    }));
    mockFrom.mockReturnValue({ upsert });

    const first = createPerson("user-1", { display_name: "rev1" }, "request-1", 1).then(
      () => null,
      (error: unknown) => error,
    );
    await jest.advanceTimersByTimeAsync(20_000);
    await expect(first).resolves.toMatchObject({ name: "TimeoutError" });

    const second = await createPerson("user-1", { display_name: "rev2" }, "request-1", 2);
    expect(second.display_name).toBe("rev2");
    releaseFirstArrival.resolve();
    await jest.advanceTimersByTimeAsync(0);

    expect(arrivals).toEqual([2, 1]);
    expect(stored).toEqual(expect.objectContaining({
      display_name: "rev2",
      client_revision: 2,
    }));
    expect(mockInvalidateDomainLevels).toHaveBeenCalledTimes(1);
  });

  test("a higher revision wins the guarded reconciliation and invalidates once", async () => {
    const upsertSelect = jest.fn(() => Promise.resolve({ data: [], error: null }));
    const upsert = jest.fn(() => ({ select: upsertSelect }));
    const updateSelect = jest.fn(() => Promise.resolve({
      data: [dbPerson({ id: "request-1", last_interaction_on: "2026-09-02" })],
      error: null,
    }));
    const lt = jest.fn(() => ({ select: updateSelect }));
    const updateEqId = jest.fn(() => ({ lt }));
    const updateEqUser = jest.fn(() => ({ eq: updateEqId }));
    const update = jest.fn(() => ({ eq: updateEqUser }));
    mockFrom
      .mockReturnValueOnce({ upsert })
      .mockReturnValueOnce({ update });

    const result = await createPerson(
      "user-1",
      { display_name: "소하", last_interaction_on: "2026-09-02" },
      "request-1",
      2,
    );

    expect(result.last_interaction_on).toBe("2026-09-02");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      display_name: "소하",
      last_interaction_on: "2026-09-02",
      client_revision: 2,
      updated_at: expect.any(String),
    }));
    expect(updateEqUser).toHaveBeenCalledWith("user_id", "user-1");
    expect(updateEqId).toHaveBeenCalledWith("id", "request-1");
    expect(lt).toHaveBeenCalledWith("client_revision", 2);
    expect(mockInvalidateDomainLevels).toHaveBeenCalledTimes(1);
  });

  test("a reconciliation timeout still observes one late PATCH success", async () => {
    jest.useFakeTimers();
    const pending = deferred<{ data: Record<string, unknown>[]; error: null }>();
    const upsert = jest.fn(() => ({
      select: () => Promise.resolve({ data: [], error: null }),
    }));
    const executeUpdate = jest.fn(
      (
        resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown,
        reject: (reason: unknown) => unknown,
      ) => pending.promise.then(resolve, reject),
    );
    const update = jest.fn(() => ({
      eq: () => ({
        eq: () => ({
          lt: () => ({ select: () => ({ then: executeUpdate }) }),
        }),
      }),
    }));
    mockFrom
      .mockReturnValueOnce({ upsert })
      .mockReturnValueOnce({ update });

    const result = createPerson(
      "user-1",
      { display_name: "소하", last_interaction_on: "2026-09-02" },
      "request-1",
      2,
    ).then(
      () => null,
      (error: unknown) => error,
    );
    await jest.advanceTimersByTimeAsync(20_000);
    await expect(result).resolves.toMatchObject({ name: "TimeoutError" });
    expect(mockInvalidateDomainLevels).not.toHaveBeenCalled();

    pending.resolve({
      data: [dbPerson({ id: "request-1", last_interaction_on: "2026-09-02" })],
      error: null,
    });
    await jest.advanceTimersByTimeAsync(0);
    expect(executeUpdate).toHaveBeenCalledTimes(1);
    expect(mockInvalidateDomainLevels).toHaveBeenCalledTimes(1);
  });

  test("returns the existing winner when its revision is already newer", async () => {
    const upsert = jest.fn(() => ({
      select: () => Promise.resolve({ data: [], error: null }),
    }));
    const update = jest.fn(() => ({
      eq: () => ({
        eq: () => ({
          lt: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
        }),
      }),
    }));
    const finalEqId = jest.fn(() => Promise.resolve({
      data: [dbPerson({ id: "request-1", display_name: "최신 이름" })],
      error: null,
    }));
    const finalEqUser = jest.fn(() => ({ eq: finalEqId }));
    const finalSelect = jest.fn(() => ({ eq: finalEqUser }));
    mockFrom
      .mockReturnValueOnce({ upsert })
      .mockReturnValueOnce({ update })
      .mockReturnValueOnce({ select: finalSelect });

    const result = await createPerson("user-1", { display_name: "옛 이름" }, "request-1", 1);

    expect(result.display_name).toBe("최신 이름");
    expect(finalSelect).toHaveBeenCalledWith("*");
    expect(finalEqUser).toHaveBeenCalledWith("user_id", "user-1");
    expect(finalEqId).toHaveBeenCalledWith("id", "request-1");
    expect(mockInvalidateDomainLevels).not.toHaveBeenCalled();
  });

  test("throws instead of fabricating success when the owner-scoped final read is empty", async () => {
    const upsert = jest.fn(() => ({
      select: () => Promise.resolve({ data: [], error: null }),
    }));
    const update = jest.fn(() => ({
      eq: () => ({
        eq: () => ({
          lt: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
        }),
      }),
    }));
    const select = jest.fn(() => ({
      eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
    }));
    mockFrom
      .mockReturnValueOnce({ upsert })
      .mockReturnValueOnce({ update })
      .mockReturnValueOnce({ select });

    await expect(
      createPerson("user-1", { display_name: "소하" }, "request-1", 2),
    ).rejects.toThrow("relation_people row vanished");
  });

  test("a timed-out upsert still invalidates if its one HTTP request later inserts", async () => {
    jest.useFakeTimers();
    const pending = deferred<{ data: Record<string, unknown>[]; error: null }>();
    const execute = jest.fn(
      (
        resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown,
        reject: (reason: unknown) => unknown,
      ) => pending.promise.then(resolve, reject),
    );
    const upsert = jest.fn(() => ({ select: () => ({ then: execute }) }));
    mockFrom.mockReturnValue({ upsert });

    const result = createPerson("user-1", { display_name: "소하" }, "request-1", 1).then(
      () => null,
      (error: unknown) => error,
    );
    await jest.advanceTimersByTimeAsync(20_000);
    await expect(result).resolves.toMatchObject({ name: "TimeoutError" });
    expect(mockInvalidateDomainLevels).not.toHaveBeenCalled();

    pending.resolve({ data: [dbPerson({ id: "request-1" })], error: null });
    await jest.advanceTimersByTimeAsync(0);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(mockInvalidateDomainLevels).toHaveBeenCalledTimes(1);
  });
});

describe("updatePerson authoritative revision sentinel", () => {
  function updateTable(captured: Record<string, unknown>[]) {
    const single = jest.fn(() => Promise.resolve({ data: dbPerson(), error: null }));
    const select = jest.fn(() => ({ single }));
    const eqId = jest.fn(() => ({ select }));
    const eqUser = jest.fn(() => ({ eq: eqId }));
    const update = jest.fn((payload: Record<string, unknown>) => {
      captured.push(payload);
      return { eq: eqUser };
    });
    return { update };
  }

  test("automatic callers preserve revision while the explicit sentinel is dormant", async () => {
    const captured: Record<string, unknown>[] = [];
    mockFrom
      .mockReturnValueOnce(updateTable(captured))
      .mockReturnValueOnce(updateTable(captured));

    await updatePerson("user-1", "person-1", { contact_cadence: "weekly" });
    await updatePerson(
      "user-1",
      "person-1",
      { contact_cadence: "monthly" },
      { authoritative: true },
    );

    expect(captured[0]).not.toHaveProperty("client_revision");
    expect(captured[1]).toHaveProperty("client_revision", AUTHORITATIVE_WRITE_REVISION);
    expect(AUTHORITATIVE_WRITE_REVISION).toBe(2_147_483_647);
  });
});
