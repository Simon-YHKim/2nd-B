// T43 strict usage read: only a usage both sources confirmed resolves. Errors, malformed
// values, foreign rows and a rolled-over bucket reject; nothing turns into 0.
import { ReasoningUsageReadError, readReasoningUsageStrict } from "../reasoning-usage-read";
import { monthBucket, weekBucket } from "../usage";

type Reply = { data?: unknown; error?: { message: string } | null };
const calls: Array<{ kind: string; args: unknown[] }> = [];
let counterReply: () => Promise<Reply>;
let ledgerReply: () => Promise<Reply>;
let onCounterDispatch: () => void = () => undefined;

function builder(resolve: () => Promise<Reply>, onDispatch: () => void) {
  const chain = {
    select: (...args: unknown[]) => { calls.push({ kind: "select", args }); return chain; },
    eq: (...args: unknown[]) => { calls.push({ kind: "eq", args }); return chain; },
    then: (ok: (reply: Reply) => unknown, no?: (error: unknown) => unknown) => {
      calls.push({ kind: "dispatch", args: [] });
      onDispatch();
      return resolve().then(ok, no);
    },
  };
  return chain;
}

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (...args: unknown[]) => { calls.push({ kind: "from", args }); return builder(() => counterReply(), () => onCounterDispatch()); },
    rpc: (...args: unknown[]) => {
      calls.push({ kind: "rpc", args });
      return { then: (ok: (reply: Reply) => unknown, no?: (error: unknown) => unknown) => { calls.push({ kind: "dispatch", args: [] }); return ledgerReply().then(ok, no); } };
    },
  }),
}));

const NOW = new Date("2026-10-19T03:00:00Z");
const WEEK = weekBucket(NOW);
const MONTH = monthBucket(NOW);
const row = (over: Record<string, unknown> = {}) => ({ user_id: "owner-a", month_bucket: WEEK, reasoning_used: 1, ...over });
const ledger = (over: Record<string, unknown> = {}) => ({ available: 0, ad_earned_this_month: 0, ...over });
const ok = (data: unknown): (() => Promise<Reply>) => () => Promise.resolve({ data, error: null });
const read = (assertCurrent = () => undefined, now = () => NOW) => readReasoningUsageStrict("owner-a", { assertCurrent, now });

beforeEach(() => {
  calls.length = 0; onCounterDispatch = () => undefined;
  counterReply = ok([row()]); ledgerReply = ok(ledger());
});

test("a confirmed row and ledger resolve with the server's numbers", async () => {
  counterReply = ok([row({ reasoning_used: 2 })]); ledgerReply = ok(ledger({ available: 50, ad_earned_this_month: 3 }));
  await expect(read()).resolves.toEqual({ used: 2, rewardCredits: 50, rewardEarned: 3, weekBucket: WEEK, monthBucket: MONTH });
});

test("only an empty counter list means 0 used; a valid zero ledger is a real zero", async () => {
  counterReply = ok([]);
  await expect(read()).resolves.toMatchObject({ used: 0, rewardCredits: 0, rewardEarned: 0 });
});

test("the counter reads the owner's current week only and the ledger takes no argument", async () => {
  await read();
  expect(calls.find((c) => c.kind === "from")?.args).toEqual(["usage_counters"]);
  expect(calls.find((c) => c.kind === "select")?.args).toEqual(["user_id, month_bucket, reasoning_used"]);
  expect(calls.filter((c) => c.kind === "eq").map((c) => c.args)).toEqual([["user_id", "owner-a"], ["month_bucket", WEEK]]);
  expect(calls.find((c) => c.kind === "rpc")?.args).toEqual(["credit_summary_self"]);
});

test.each([
  ["counter error", () => { counterReply = () => Promise.resolve({ error: { message: "boom" } }); }],
  ["counter reject", () => { counterReply = () => Promise.reject(new Error("offline")); }],
  ["counter null", () => { counterReply = ok(null); }],
  ["counter object", () => { counterReply = ok({}); }],
  ["two rows", () => { counterReply = ok([row(), row()]); }],
  ["foreign owner", () => { counterReply = ok([row({ user_id: "owner-b" })]); }],
  ["another bucket", () => { counterReply = ok([row({ month_bucket: MONTH })]); }],
  ["used string", () => { counterReply = ok([row({ reasoning_used: "1" })]); }],
  ["used negative", () => { counterReply = ok([row({ reasoning_used: -1 })]); }],
  ["used fraction", () => { counterReply = ok([row({ reasoning_used: 1.5 })]); }],
  ["used null", () => { counterReply = ok([row({ reasoning_used: null })]); }],
  ["ledger error", () => { ledgerReply = () => Promise.resolve({ error: { message: "42501" } }); }],
  ["ledger reject", () => { ledgerReply = () => Promise.reject(new Error("offline")); }],
  ["ledger null", () => { ledgerReply = ok(null); }],
  ["ledger empty object", () => { ledgerReply = ok({}); }],
  ["ledger array", () => { ledgerReply = ok([]); }],
  ["available string", () => { ledgerReply = ok(ledger({ available: "bad" })); }],
  ["available infinite", () => { ledgerReply = ok(ledger({ available: Infinity })); }],
  ["available NaN", () => { ledgerReply = ok(ledger({ available: Number.NaN })); }],
  ["earned boolean", () => { ledgerReply = ok(ledger({ ad_earned_this_month: true })); }],
] as const)("%s rejects instead of becoming 0", async (_name, arrange) => {
  arrange();
  await expect(read()).rejects.toBeInstanceOf(Error);
});

test("a counter failure is reported while the ledger still hangs", async () => {
  counterReply = () => Promise.resolve({ error: { message: "boom" } });
  ledgerReply = () => new Promise<Reply>(() => undefined);
  await expect(read()).rejects.toMatchObject({ source: "counter" });
});

test("a ledger failure is reported while the counter still hangs", async () => {
  counterReply = () => new Promise<Reply>(() => undefined);
  ledgerReply = () => Promise.resolve({ error: { message: "boom" } });
  await expect(read()).rejects.toMatchObject({ source: "ledger" });
});

test("an owner change during the first dispatch keeps the second from going out", async () => {
  let current = true;
  onCounterDispatch = () => { current = false; };
  const stale = new Error("stale");
  await expect(read(() => { if (!current) throw stale; })).rejects.toBe(stale);
  expect(calls.filter((c) => c.kind === "rpc")).toHaveLength(0);
});

test("an owner change after both replies drops the result", async () => {
  let checks = 0;
  const stale = new Error("stale");
  // start, before counter, before ledger, after counter, after ledger -> then the last check fails.
  await expect(read(() => { checks += 1; if (checks > 5) throw stale; })).rejects.toBe(stale);
});

test("a week that changed during the read is not published as current", async () => {
  const times = [NOW, new Date("2026-10-26T03:00:00Z")];
  await expect(read(() => undefined, () => times.shift() ?? NOW)).rejects.toMatchObject({ source: "bucket" });
});

test("errors carry the failing source", async () => {
  ledgerReply = ok(ledger({ available: "bad" }));
  const error = await read().catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ReasoningUsageReadError);
  expect((error as ReasoningUsageReadError).source).toBe("ledger");
});
