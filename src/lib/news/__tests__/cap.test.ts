// Wave 2 — the per-day summary cap (KST-anchored, device-local). We drive the
// React-Native AsyncStorage path with an in-memory mock so read/bump/allowance
// behave deterministically and the day boundary resets the counter.

const store = new Map<string, string>();

jest.mock(
  "@react-native-async-storage/async-storage",
  () => ({
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => (store.has(k) ? store.get(k)! : null)),
      setItem: jest.fn(async (k: string, v: string) => {
        store.set(k, v);
      }),
    },
  }),
  { virtual: true },
);

import {
  readSummaryUsage,
  bumpSummaryUsage,
  summaryAllowanceLeft,
  NEWS_SUMMARY_DAILY_LIMIT,
} from "../summarize";

describe("summary daily cap (KST day, device-local counter)", () => {
  const realNav = globalThis.navigator;
  beforeAll(() => {
    // Force the React-Native storage branch (node test env defaults to web/none).
    Object.defineProperty(globalThis, "navigator", {
      value: { product: "ReactNative" },
      configurable: true,
    });
  });
  afterAll(() => {
    Object.defineProperty(globalThis, "navigator", { value: realNav, configurable: true });
  });
  beforeEach(() => store.clear());

  const day1 = new Date("2026-06-11T03:00:00.000Z"); // KST 2026-06-11
  const day2 = new Date("2026-06-12T03:00:00.000Z"); // KST 2026-06-12

  test("starts at 0 and increments per bump", async () => {
    expect(await readSummaryUsage("u", day1)).toBe(0);
    expect(await bumpSummaryUsage("u", day1)).toBe(1);
    expect(await bumpSummaryUsage("u", day1)).toBe(2);
    expect(await readSummaryUsage("u", day1)).toBe(2);
  });

  test("allowance shrinks toward 0 and never goes negative", async () => {
    expect(await summaryAllowanceLeft("u", day1)).toBe(NEWS_SUMMARY_DAILY_LIMIT);
    for (let i = 0; i < NEWS_SUMMARY_DAILY_LIMIT + 3; i++) await bumpSummaryUsage("u", day1);
    expect(await summaryAllowanceLeft("u", day1)).toBe(0);
  });

  test("the counter resets on the next KST day", async () => {
    await bumpSummaryUsage("u", day1);
    expect(await readSummaryUsage("u", day1)).toBe(1);
    expect(await readSummaryUsage("u", day2)).toBe(0);
  });

  test("counters are per-user", async () => {
    await bumpSummaryUsage("a", day1);
    expect(await readSummaryUsage("a", day1)).toBe(1);
    expect(await readSummaryUsage("b", day1)).toBe(0);
  });
});
