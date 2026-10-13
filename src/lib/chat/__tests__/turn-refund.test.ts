// The screen's side of 0252 (Z46). The server gives a turn back only on evidence it wrote itself.
// refundChatTurn pins how the app asks: again after SQLSTATE 40001 (up to twice), once more after
// NULL and only after NULL, and never by throwing. settleChatTurn pins what the app then knows
// about the count, and that it always answers within its deadline.

interface RpcAnswer {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
  throws?: boolean;
  /** Never answers: a stalled connection, or a lock the server is still waiting on. */
  hangs?: boolean;
}

interface ReadAnswer {
  count?: number;
  fails?: boolean;
  hangs?: boolean;
}

const answers: RpcAnswer[] = [];
const calls: { fn: string; args: unknown }[] = [];
const reads: { userId: unknown; day: unknown }[] = [];
let readAnswer: ReadAnswer = { count: 0 };
let clientThrows = false;

const NEVER = new Promise<never>(() => {});

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: jest.fn(() => {
    if (clientThrows) throw new Error("no client");
    return {
      rpc: jest.fn((fn: string, args: unknown) => {
        calls.push({ fn, args });
        const next = answers.shift() ?? { data: null, error: null };
        if (next.hangs) return NEVER;
        if (next.throws) return Promise.reject(new Error("network"));
        return Promise.resolve({ data: next.data ?? null, error: next.error ?? null });
      }),
      // readChatUsageDetail: from("chat_usage").select(...).eq("user_id", ...).eq("day", ...).maybeSingle()
      from: jest.fn(() => {
        const filters: Record<string, unknown> = {};
        const query = {
          select: () => query,
          eq: (column: string, value: unknown) => {
            filters[column] = value;
            return query;
          },
          maybeSingle: () => {
            reads.push({ userId: filters.user_id, day: filters.day });
            if (readAnswer.hangs) return NEVER;
            if (readAnswer.fails) return Promise.resolve({ data: null, error: new Error("read failed") });
            return Promise.resolve({ data: { count: readAnswer.count ?? 0, ad_bonus: 0 }, error: null });
          },
        };
        return query;
      }),
    };
  }),
}));

import { CHAT_TURN_SETTLEMENT_DEADLINE_MS, refundChatTurn, settleChatTurn } from "../usage";

const SERIALIZATION = { error: { code: "40001", message: "could not serialize access" } };

beforeEach(() => {
  answers.length = 0;
  calls.length = 0;
  reads.length = 0;
  readAnswer = { count: 0 };
  clientThrows = false;
});

describe("refundChatTurn (0252 · Z46)", () => {
  test("asks the server function for that day and returns the new count", async () => {
    answers.push({ data: 4 });
    await expect(refundChatTurn("2026-10-13")).resolves.toBe(4);
    expect(calls).toEqual([{ fn: "refund_chat_turn_after_output_swap", args: { p_day: "2026-10-13" } }]);
  });

  test("a count of zero is a count, not nothing", async () => {
    answers.push({ data: 0 });
    await expect(refundChatTurn("2026-10-13")).resolves.toBe(0);
    expect(calls).toHaveLength(1);
  });

  test("NULL is asked once more, and a second NULL means there was nothing to give back", async () => {
    answers.push({ data: null }, { data: 3 });
    await expect(refundChatTurn("2026-10-13")).resolves.toBe(3);
    expect(calls).toHaveLength(2);

    calls.length = 0;
    answers.push({ data: null }, { data: null }, { data: 9 });
    await expect(refundChatTurn("2026-10-13")).resolves.toBeNull();
    expect(calls).toHaveLength(2);
  });

  test("a serialization failure is retried, twice at most", async () => {
    answers.push(SERIALIZATION, { data: 2 });
    await expect(refundChatTurn("2026-10-13")).resolves.toBe(2);
    expect(calls).toHaveLength(2);

    calls.length = 0;
    answers.push(SERIALIZATION, SERIALIZATION, { data: 2 });
    await expect(refundChatTurn("2026-10-13")).resolves.toBe(2);
    expect(calls).toHaveLength(3);

    calls.length = 0;
    answers.push(SERIALIZATION, SERIALIZATION, SERIALIZATION, { data: 2 });
    await expect(refundChatTurn("2026-10-13")).resolves.toBeNull();
    expect(calls).toHaveLength(3);
  });

  test("the two rules share one budget: at most four calls however the answers alternate", async () => {
    answers.push(SERIALIZATION, { data: null }, SERIALIZATION, { data: null }, { data: 7 });
    await expect(refundChatTurn("2026-10-13")).resolves.toBeNull();
    expect(calls).toHaveLength(4);
  });

  test("any other error ends it at once, without throwing", async () => {
    answers.push({ error: { code: "42501", message: "permission denied" } }, { data: 5 });
    await expect(refundChatTurn("2026-10-13")).resolves.toBeNull();
    expect(calls).toHaveLength(1);

    calls.length = 0;
    answers.length = 0;
    answers.push({ error: { message: "no code at all" } });
    await expect(refundChatTurn("2026-10-13")).resolves.toBeNull();
    expect(calls).toHaveLength(1);
  });

  test("a call that rejects, or a client that cannot be made, gives null", async () => {
    answers.push({ throws: true }, { data: 5 });
    await expect(refundChatTurn("2026-10-13")).resolves.toBeNull();
    expect(calls).toHaveLength(1);

    clientThrows = true;
    await expect(refundChatTurn("2026-10-13")).resolves.toBeNull();
  });

  // Only NULL means "nothing yet, ask once more". A count that arrived in the wrong shape may be a
  // refund that happened: asking again could spend a second piece of evidence.
  test.each([["a string", "3"], ["an object", { count: 3 }], ["a boolean", true]])(
    "an answer that is %s is not a count and is not asked again",
    async (_name, data) => {
      answers.push({ data }, { data: 5 });
      await expect(refundChatTurn("2026-10-13")).resolves.toBeNull();
      expect(calls).toHaveLength(1);
    },
  );

  test("without a day it asks for today in KST", async () => {
    answers.push({ data: 1 });
    await refundChatTurn();
    const args = calls[0]?.args as { p_day: string };
    expect(args.p_day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("settleChatTurn (Z46)", () => {
  test("asks for the turn back, then reads that day's count for that user", async () => {
    answers.push({ data: 1 });
    readAnswer = { count: 1 };
    await expect(settleChatTurn("u1", "2026-10-13")).resolves.toBe(1);
    expect(calls).toEqual([{ fn: "refund_chat_turn_after_output_swap", args: { p_day: "2026-10-13" } }]);
    expect(reads).toEqual([{ userId: "u1", day: "2026-10-13" }]);
  });

  test("the count read afterwards wins: it is what the server holds now", async () => {
    // Nothing was given back, and the count is still the bumped one.
    answers.push({ data: null }, { data: null });
    readAnswer = { count: 2 };
    await expect(settleChatTurn("u1", "2026-10-13")).resolves.toBe(2);
  });

  test("a refund that happened is still known when the read afterwards fails", async () => {
    answers.push({ data: 1 });
    readAnswer = { fails: true };
    await expect(settleChatTurn("u1", "2026-10-13")).resolves.toBe(1);
  });

  test("nothing given back and a failed read: nothing is known", async () => {
    answers.push({ data: null }, { data: null });
    readAnswer = { fails: true };
    await expect(settleChatTurn("u1", "2026-10-13")).resolves.toBeNull();
  });

  describe("it always answers within its deadline", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test("a refund call that never answers", async () => {
      answers.push({ hangs: true });
      const settled = jest.fn();
      void settleChatTurn("u1", "2026-10-13").then(settled);
      await jest.advanceTimersByTimeAsync(CHAT_TURN_SETTLEMENT_DEADLINE_MS - 1);
      expect(settled).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      expect(settled).toHaveBeenCalledWith(null);
      expect(reads).toHaveLength(0);
    });

    test("a read that never answers keeps the count the refund returned", async () => {
      answers.push({ data: 1 });
      readAnswer = { hangs: true };
      const settled = jest.fn();
      void settleChatTurn("u1", "2026-10-13").then(settled);
      await jest.advanceTimersByTimeAsync(CHAT_TURN_SETTLEMENT_DEADLINE_MS - 1);
      expect(settled).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      expect(settled).toHaveBeenCalledWith(1);
    });

    test("a read that never answers after nothing was given back: nothing is known", async () => {
      answers.push({ data: null }, { data: null });
      readAnswer = { hangs: true };
      const settled = jest.fn();
      void settleChatTurn("u1", "2026-10-13").then(settled);
      await jest.advanceTimersByTimeAsync(CHAT_TURN_SETTLEMENT_DEADLINE_MS);
      expect(settled).toHaveBeenCalledWith(null);
    });

    test("an answer in time leaves no timer behind", async () => {
      answers.push({ data: 1 });
      readAnswer = { count: 1 };
      await expect(settleChatTurn("u1", "2026-10-13")).resolves.toBe(1);
      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
