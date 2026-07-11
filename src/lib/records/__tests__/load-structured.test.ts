// The context block the 세컨비 chat sees must date records by the app's canonical
// KST day, not a raw UTC slice, or a record made just after KST midnight reads a day
// early. Minimal chainable supabase mock + pass-through structured mock.

let mockRows: Array<Record<string, unknown>> = [];

jest.mock("../../supabase/client", () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.not = () => chain;
  chain.order = () => chain;
  chain.limit = () => Promise.resolve({ data: mockRows, error: null });
  return { getSupabaseClient: () => ({ from: () => chain }) };
});

jest.mock("../../capture/structured", () => ({
  parseStructured: (s: unknown) => s ?? null,
  renderStructuredForContext: () => "BODY",
}));

import { loadStructuredContext } from "../load-structured";

describe("loadStructuredContext", () => {
  test("dates the header by the KST calendar day, not a raw UTC slice", async () => {
    // 23:00Z on the 25th == 08:00 KST on the 26th → the header must read 2026-05-26.
    mockRows = [{ topic: "운동", created_at: "2026-05-25T23:00:00.000Z", structured: { x: 1 } }];
    const out = await loadStructuredContext("u1", 5);
    expect(out).toContain("2026-05-26"); // KST day
    expect(out).not.toContain("2026-05-25"); // not the UTC slice
  });

  test("empty result returns an empty string (fails soft)", async () => {
    mockRows = [];
    expect(await loadStructuredContext("u1", 5)).toBe("");
  });
});
