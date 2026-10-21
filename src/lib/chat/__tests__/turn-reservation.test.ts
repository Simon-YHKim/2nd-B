import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { bumpChatUsageForTurn, ChatLimitExceededError } from "../usage";
import { kstDateToday } from "../limits";

const mockRpc = jest.fn();
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({ rpc: mockRpc }) }));

const TURN_ID = "12345678-1234-4234-8234-123456789abc";
const DAY = "2026-10-21";
const MISSING = {
  code: "PGRST202",
  message: "Could not find the function public.bump_chat_usage_for_turn(p_day, p_user_id) in the schema cache",
  details: "Searched for the function public.bump_chat_usage_for_turn with parameters p_day, p_user_id or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache.",
  hint: "Perhaps you meant to call the function public.bump_chat_usage_if_under_cap",
};
const success = (data: unknown) => ({ data, error: null, status: 200 });
const failure = (error: unknown, status = 404) => ({ data: null, error, status });
const send = () => bumpChatUsageForTurn("owner-a", 5, DAY);

beforeEach(() => mockRpc.mockReset());

describe("T01 reservation receipt", () => {
  test.each([1, 7, 2_147_483_647])("accepts SQL count %i and UUID without imposing the client cap", async count => {
    mockRpc.mockResolvedValue(success({ count, turnId: TURN_ID, extra: "ignored" }));
    await expect(send()).resolves.toEqual({ count, turnId: TURN_ID });
    expect(mockRpc.mock.calls).toEqual([["bump_chat_usage_for_turn", { p_user_id: "owner-a", p_day: DAY }]]);
  });

  test("keeps an uppercase UUID and defaults to the current KST date", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-20T16:00:00Z"));
    try {
      mockRpc.mockResolvedValue(success({ count: 1, turnId: TURN_ID.toUpperCase() }));
      await expect(bumpChatUsageForTurn("owner-a", 5)).resolves.toEqual({ count: 1, turnId: TURN_ID.toUpperCase() });
      expect(mockRpc).toHaveBeenCalledWith("bump_chat_usage_for_turn", { p_user_id: "owner-a", p_day: kstDateToday() });
      expect(kstDateToday()).toBe(DAY);
    } finally { jest.useRealTimers(); }
  });

  test.each([null, undefined, 0, -1, 1.5, 2_147_483_648, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, "1", true, {}, []])(
    "rejects invalid count %# without a second bump", async count => {
      mockRpc.mockResolvedValue(success({ count, turnId: TURN_ID }));
      await expect(send()).rejects.toThrow("invalid_chat_turn_reservation_response");
      expect(mockRpc).toHaveBeenCalledTimes(1);
    },
  );

  test.each([undefined, null, 1, {}, "", "not-a-uuid", "12345678-1234-4234-8234-123456789abg",
    "00000000-0000-0000-0000-000000000000", "12345678-1234-4234-7234-123456789abc", `${TURN_ID}suffix`, ` ${TURN_ID}`, `${TURN_ID}\n`])(
    "rejects invalid UUID %# without a second bump", async turnId => {
      mockRpc.mockResolvedValue(success({ count: 1, turnId }));
      await expect(send()).rejects.toThrow("invalid_chat_turn_reservation_response");
      expect(mockRpc).toHaveBeenCalledTimes(1);
    },
  );

  test.each([null, undefined, 1, "{broken", JSON.stringify({ count: 1, turnId: TURN_ID }),
    [{ count: 1, turnId: TURN_ID }], {}, { count: 1, turn_id: TURN_ID }])(
    "rejects invalid success envelope %# without a second bump", async data => {
      mockRpc.mockResolvedValue(success(data));
      await expect(send()).rejects.toThrow("invalid_chat_turn_reservation_response");
      expect(mockRpc).toHaveBeenCalledTimes(1);
    },
  );
});

describe("T02 narrowly confirmed fallback", () => {
  test.each([
    MISSING,
    { ...MISSING, message: "Could not find the public.bump_chat_usage_for_turn(p_day, p_user_id) function in the schema cache" },
    { code: "42883", message: "function public.bump_chat_usage_for_turn(uuid, date) does not exist" },
    { code: "42883", message: "function public.bump_chat_usage_for_turn(p_day => date, p_user_id => uuid) does not exist" },
  ])("confirmed missing RPC %# calls legacy once without a free receipt", async error => {
    mockRpc.mockResolvedValueOnce(failure(error)).mockResolvedValueOnce(success(7));
    await expect(send()).resolves.toEqual({ count: 7, turnId: null });
    expect(mockRpc.mock.calls).toEqual([
      ["bump_chat_usage_for_turn", { p_user_id: "owner-a", p_day: DAY }],
      ["bump_chat_usage_if_under_cap", { p_user_id: "owner-a", p_day: DAY, p_cap: 5 }],
    ]);
  });

  test.each([500, 502, 503, 504])("5xx %i after a committed reservation must not double bump", async status => {
    let count = 0;
    const error = { ...MISSING };
    mockRpc.mockImplementation(async (rpc: string) => {
      count += 1; // The reservation committed, but its response was replaced upstream.
      return rpc === "bump_chat_usage_for_turn" ? failure(error, status) : success(count);
    });
    const outcome = await send().then(value => ({ value }), failure => ({ error: failure }));
    expect(count).toBe(1);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ error });
  });

  test.each([
    failure({ ...MISSING, message: MISSING.message.replace("for_turn", "for_turn_other") }),
    failure({ ...MISSING, message: MISSING.message.replace("public.", "private.") }),
    failure({ ...MISSING, message: MISSING.message.replace("p_day, p_user_id", "p_day, p_user_id, p_cap") }),
    failure({ ...MISSING, message: `prefix ${MISSING.message}` }),
    failure({ ...MISSING, message: "missing function", details: MISSING.message }),
    failure({ ...MISSING, code: "42501" }, 403),
    failure({ ...MISSING, code: "PGRST203" }, 300),
    failure({ ...MISSING, code: "PGRST205" }),
    failure({ message: MISSING.message }),
    failure({ code: "PGRST202" }),
    failure({ code: "42883", message: "function public.inner_helper(uuid, date) does not exist", hint: MISSING.message }),
    failure({ code: "42883", message: "function public.bump_chat_usage_for_turn(uuid) does not exist" }),
    failure("Not Found"),
    failure([MISSING]),
    failure(MISSING, 200),
    failure(MISSING, 401),
    failure({ code: "PGRST003", message: "connection pool timeout" }, 504),
    failure({ code: "", message: "TypeError: Failed to fetch" }, 0),
  ])("ambiguous/server error %# never falls back", async result => {
    mockRpc.mockResolvedValue(result);
    await expect(send()).rejects.toBe(result.error);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  test.each([new Error("timeout"), new TypeError("Failed to fetch"), new SyntaxError("Unexpected token"), MISSING])(
    "transport rejection %# never falls back", async error => {
      mockRpc.mockRejectedValue(error);
      await expect(send()).rejects.toBe(error);
      expect(mockRpc).toHaveBeenCalledTimes(1);
    },
  );

  test("a delayed receipt remains the sole bump and never triggers a follow-up call", async () => {
    let resolve!: (value: unknown) => void;
    mockRpc.mockReturnValue(new Promise(done => { resolve = done; }));
    const pending = send();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    resolve(success({ count: 1, turnId: TURN_ID }));
    await expect(pending).resolves.toEqual({ count: 1, turnId: TURN_ID });
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});

describe.each(["reservation", "legacy"])("%s result classification", route => {
  function prepare(result: unknown) {
    if (route === "legacy") mockRpc.mockResolvedValueOnce(failure(MISSING));
    mockRpc.mockResolvedValueOnce(result);
  }
  const calls = route === "legacy" ? 2 : 1;

  test("only exact HTTP 400/P0001/chat_limit_exceeded becomes the existing limit error", async () => {
    prepare(failure({ code: "P0001", message: "chat_limit_exceeded", details: null, hint: null }, 400));
    await expect(send()).rejects.toBeInstanceOf(ChatLimitExceededError);
    expect(mockRpc).toHaveBeenCalledTimes(calls);
  });

  test.each([
    failure({ code: "P0001", message: "chat_limit_exceeded" }, 500),
    failure({ code: "P0001", message: "chat_limit_exceeded" }, 200),
    failure({ code: "P0001", message: "prefix chat_limit_exceeded suffix" }, 400),
    failure({ message: "chat_limit_exceeded" }, 400),
    failure({ code: "42501", message: "chat_limit_exceeded" }, 400),
    failure({ code: "P0001", message: "other", details: "chat_limit_exceeded" }, 400),
    failure(MISSING),
  ].filter(result => route === "legacy" || result.error !== MISSING))(
    "unconfirmed error %# retains identity without further calls", async result => {
      prepare(result);
      await expect(send()).rejects.toBe(result.error);
      expect(mockRpc).toHaveBeenCalledTimes(calls);
    },
  );
});

test.each([null, 0, -1, 1.5, 2_147_483_648, NaN, Infinity, "1", { count: 1, turnId: TURN_ID }])(
  "invalid legacy success %# cannot mint a receipt or retry", async count => {
    mockRpc.mockResolvedValueOnce(failure(MISSING)).mockResolvedValueOnce(success(count));
    await expect(send()).rejects.toThrow("invalid_chat_usage_response");
    expect(mockRpc).toHaveBeenCalledTimes(2);
  },
);

test("legacy transport failure is not retried", async () => {
  const error = new Error("offline");
  mockRpc.mockResolvedValueOnce(failure(MISSING)).mockRejectedValueOnce(error);
  await expect(send()).rejects.toBe(error);
  expect(mockRpc).toHaveBeenCalledTimes(2);
});

test("A1-U reservation consumers are dormant transitively across all production src", () => {
  const sources = new Map<string, string>();
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "__tests__") continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
        sources.set(path.relative(process.cwd(), file).replace(/\\/g, "/"), readFileSync(file, "utf8"));
      }
    }
  };
  visit(path.join(process.cwd(), "src"));
  const consumers = [...sources].filter(([file, source]) => file !== "src/lib/chat/usage.ts"
    && /\bbumpChatUsageForTurn\b|["']bump_chat_usage_for_turn["']/.test(source)).map(([file]) => file);
  expect(consumers).toEqual(["src/lib/chat/conversation-turn.ts"]);
  // Import aliases, namespace imports and re-exports still name this module.
  // Check all src, including helpers outside screens, before accepting dormancy.
  for (const [file, source] of sources) {
    if (file === "src/lib/chat/conversation-turn.ts") continue;
    expect({ file, callsDormantEntry: /conversation-turn|\b(createLiveChatTurn|sendLiveChatMessage)\b/.test(source) })
      .toEqual({ file, callsDormantEntry: false });
  }
  const conversation = readFileSync(path.resolve(__dirname, "../conversation.ts"), "utf8");
  expect(conversation.includes("bumpChatUsageIfUnderCap")).toBe(true);
});
