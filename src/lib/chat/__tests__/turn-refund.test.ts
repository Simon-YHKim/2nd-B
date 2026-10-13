// refundChatTurn: the screen's side of 0252 (Z46). The server gives a turn back only on evidence
// it wrote itself; this pins how the app asks: again after SQLSTATE 40001 (up to twice), once
// more after NULL, and never by throwing.

interface RpcAnswer {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
  throws?: boolean;
}

const answers: RpcAnswer[] = [];
const calls: { fn: string; args: unknown }[] = [];
let clientThrows = false;

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: jest.fn(() => {
    if (clientThrows) throw new Error("no client");
    return {
      rpc: jest.fn((fn: string, args: unknown) => {
        calls.push({ fn, args });
        const next = answers.shift() ?? { data: null, error: null };
        if (next.throws) return Promise.reject(new Error("network"));
        return Promise.resolve({ data: next.data ?? null, error: next.error ?? null });
      }),
    };
  }),
}));

import { refundChatTurn } from "../usage";

const SERIALIZATION = { error: { code: "40001", message: "could not serialize access" } };

beforeEach(() => {
  answers.length = 0;
  calls.length = 0;
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

  test("an answer that is not a number is not taken for a count", async () => {
    answers.push({ data: "3" }, { data: { count: 3 } });
    await expect(refundChatTurn("2026-10-13")).resolves.toBeNull();
    expect(calls).toHaveLength(2);
  });

  test("without a day it asks for today in KST", async () => {
    answers.push({ data: 1 });
    await refundChatTurn();
    const args = calls[0]?.args as { p_day: string };
    expect(args.p_day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
