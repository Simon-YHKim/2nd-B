// Tests for buildPersona() — verifies that MBTI and ECR-S records are surfaced
// into the PersonaCard, and that traitsSource flips from "heuristic" to "tipi"
// when a TIPI assessment exists. Supabase calls are mocked per-table.

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

const tableFixtures: Record<string, QueryResult> = {};
const upsertCalls: { table: string; payload: unknown; opts: unknown }[] = [];

function chainable(result: QueryResult) {
  // Thenable terminus so `await` works regardless of which chain step ends.
  const promise = Promise.resolve(result);
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    contains: () => chain,
    order: () => chain,
    limit: () => chain,
    then: (...args: unknown[]) => promise.then(...(args as Parameters<typeof promise.then>)),
    catch: (...args: unknown[]) => promise.catch(...(args as Parameters<typeof promise.catch>)),
    finally: (...args: unknown[]) => promise.finally(...(args as Parameters<typeof promise.finally>)),
  };
  return chain;
}

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => ({
      select: () => chainable(tableFixtures[`${table}:select`] ?? { data: [], error: null }),
      upsert: (payload: unknown, opts: unknown) => {
        upsertCalls.push({ table, payload, opts });
        return Promise.resolve({ data: null, error: null });
      },
    }),
  }),
}));

jest.mock("../../llm/gemini", () => ({
  callGemini: jest.fn(() =>
    Promise.resolve({
      text: "mock summary",
      safety: { zone: "green" },
      audit: { modelUsed: "mock:gemini-2.5-flash" },
    }),
  ),
}));

import { buildPersona } from "../build";

function reset() {
  for (const k of Object.keys(tableFixtures)) delete tableFixtures[k];
  upsertCalls.length = 0;
}

describe("buildPersona", () => {
  beforeEach(reset);

  test("no assessments → heuristic source, mbti/attachment null", async () => {
    tableFixtures["records:select"] = { data: [], error: null };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    const card = await buildPersona("u1", "en");
    expect(card.traitsSource).toBe("heuristic");
    expect(card.mbti).toBeNull();
    expect(card.attachment).toBeNull();
    expect(card.version).toBe(1);
    expect(card.markdownExport).toContain("Persona v1");
  });

  test("MBTI record present → mbti surfaced + markdown section", async () => {
    // First records:select is the audit_response query; loadLatestMbti also
    // hits records:select. We collapse via a single fixture that returns both
    // shapes the parsers tolerate — audit rows ignore tag fields, MBTI loader
    // ignores rows without parseable body.
    tableFixtures["records:select"] = {
      data: [
        {
          body: JSON.stringify({
            type: "INTJ",
            scores: { E: 0, I: 4, S: 0, N: 4, T: 4, F: 0, J: 4, P: 0 },
          }),
          created_at: "2026-05-01T00:00:00Z",
        },
      ],
      error: null,
    };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    const card = await buildPersona("u1", "ko");
    expect(card.mbti).toEqual({
      type: "INTJ",
      scores: { E: 0, I: 4, S: 0, N: 4, T: 4, F: 0, J: 4, P: 0 },
    });
    expect(card.markdownExport).toContain("INTJ");
  });

  test("ECR-S attachment record → attachment surfaced + markdown section", async () => {
    tableFixtures["records:select"] = {
      data: [
        {
          body: JSON.stringify({ style: "secure", anxiety: 2.5, avoidance: 1.8 }),
          created_at: "2026-05-01T00:00:00Z",
        },
      ],
      error: null,
    };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    const card = await buildPersona("u1", "en");
    expect(card.attachment).toEqual({ style: "secure", anxiety: 2.5, avoidance: 1.8 });
    expect(card.markdownExport).toContain("Attachment style");
  });

  test("BFI record → traitsSource = 'bfi' + neuroticism measured directly (no inversion)", async () => {
    tableFixtures["records:select"] = {
      data: [
        {
          body: JSON.stringify({
            scores: {
              openness: 4,
              conscientiousness: 3.5,
              extraversion: 2,
              agreeableness: 4,
              neuroticism: 1.5,
            },
          }),
          created_at: "2026-05-01T00:00:00Z",
        },
      ],
      error: null,
    };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    const card = await buildPersona("u1", "en");
    expect(card.traitsSource).toBe("bfi");
    // BFI 1-5 → 0-1: norm(v) = (v - 1) / 4
    // neuroticism 1.5 → (1.5 - 1) / 4 = 0.125 — preserved, NOT inverted
    expect(card.traits.neuroticism).toBeCloseTo(0.125, 5);
    expect(card.traits.openness).toBeCloseTo((4 - 1) / 4, 5);
  });

  test("persona row upserted with version 1", async () => {
    tableFixtures["records:select"] = { data: [], error: null };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    await buildPersona("u1", "en");
    const personaUpsert = upsertCalls.find((c) => c.table === "personas");
    expect(personaUpsert).toBeDefined();
    expect((personaUpsert?.payload as { version: number }).version).toBe(1);
    expect((personaUpsert?.opts as { onConflict: string }).onConflict).toBe("user_id,version");
  });
});
