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

import { buildPersona, deriveValues, traitConfidenceFor } from "../build";
import { callGemini } from "../../llm/gemini";
import { AUDIT_QUESTIONS } from "../../audit/questions";

function reset() {
  for (const k of Object.keys(tableFixtures)) delete tableFixtures[k];
  upsertCalls.length = 0;
}

describe("traitConfidenceFor (SOKA per-trait confidence)", () => {
  test("bfi → questionnaire / high", () => {
    expect(traitConfidenceFor("bfi", 1)).toEqual({ source: "questionnaire", confidence: "high", observationCount: 1 });
  });
  test("heuristic scales confidence with observation count", () => {
    expect(traitConfidenceFor("heuristic", 0)).toMatchObject({ source: "default", confidence: "low", observationCount: 0 });
    expect(traitConfidenceFor("heuristic", 3)).toMatchObject({ source: "journal_text", confidence: "low" });
    expect(traitConfidenceFor("heuristic", 8)).toMatchObject({ source: "journal_text", confidence: "medium" });
    expect(traitConfidenceFor("heuristic", 20)).toMatchObject({ source: "journal_text", confidence: "high", observationCount: 20 });
  });
});

describe("deriveValues", () => {
  // deriveValues only reads `.prompt`, so cast lightweight rows to the row type.
  function answer(ids: string[]) {
    return AUDIT_QUESTIONS.filter((q) => ids.includes(q.id)).map((q) => ({
      prompt: q.prompt.en,
    })) as unknown as Parameters<typeof deriveValues>[0];
  }

  test("ranks frameworks by answered count, not AUDIT_QUESTIONS declaration order", () => {
    const byFw = new Map<string, string[]>();
    for (const q of AUDIT_QUESTIONS) {
      const a = byFw.get(q.framework) ?? [];
      a.push(q.id);
      byFw.set(q.framework, a);
    }
    const heavy = [...byFw.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    const early = AUDIT_QUESTIONS[0].framework; // declared first (sdt:autonomy)
    expect(heavy[0]).not.toBe(early); // precondition: a heavier, later framework exists
    // Answer ALL of the heavy framework + ONE question of the earlier one.
    const values = deriveValues(answer([...heavy[1], byFw.get(early)![0]]));
    expect(values[0]).toBe(heavy[0]); // most-answered wins over declaration order
    expect(values.indexOf(early)).toBeGreaterThan(0); // earlier framework present but not first
  });

  test("returns empty when nothing was answered", () => {
    expect(deriveValues(answer([]))).toEqual([]);
  });
});

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
    // Phase A: an empty starter card leaves every star dim (L1), Soul Core 0.2.
    expect(card.starLevels?.now).toBe(1);
    expect(card.soulCoreBrightness).toBeCloseTo(0.2);
  });

  test("no written entries → skips LLM summary (no Barnum fabrication), honest empty message", async () => {
    (callGemini as jest.Mock).mockClear();
    tableFixtures["records:select"] = { data: [], error: null };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    const card = await buildPersona("u1", "en");
    // With zero audit/journal rows there is nothing to summarize: the LLM must
    // not be asked to invent a narrative.
    expect(callGemini).not.toHaveBeenCalled();
    expect(card.patterns.summary).toContain("No written entries yet");
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

  test("malformed MBTI rows are ignored instead of surfaced as identity truth", async () => {
    tableFixtures["records:select"] = {
      data: [
        {
          body: JSON.stringify({
            type: "XXXX",
            scores: { E: 0, I: 4, S: 0, N: 4, T: 4, F: 0, J: 4, P: 0 },
          }),
          created_at: "2026-05-01T00:00:00Z",
        },
      ],
      error: null,
    };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    const card = await buildPersona("u1", "en");
    expect(card.mbti).toBeNull();
    expect(card.markdownExport).not.toContain("## MBTI");
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
    // Phase A: a completed ECR-S lights star5 (관계의 나) to L4.
    expect(card.starLevels?.relational).toBe(4);
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
    // Phase A: a validated instrument lights star1 (지금의 나) to L4.
    expect(card.starLevels?.now).toBe(4);
    expect(card.soulCoreBrightness).toBeGreaterThan(0.2);
  });

  test("partial BFI score rows are ignored instead of zeroing missing traits", async () => {
    tableFixtures["records:select"] = {
      data: [
        {
          body: JSON.stringify({ scores: { openness: 4 } }),
          created_at: "2026-05-01T00:00:00Z",
        },
      ],
      error: null,
    };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    const card = await buildPersona("u1", "en");
    expect(card.traitsSource).toBe("heuristic");
    expect(card.traits.conscientiousness).toBeGreaterThan(0);
    expect(card.traitConfidence?.conscientiousness.source).toBe("journal_text");
  });

  test("evidenceRefs = resolvable record refs for the rows the card was built from (0060)", async () => {
    // Audit rows carry ids; buildPersona reads them ascending and exposes the
    // most-recent (bounded, newest-first) as `record:<id>` provenance — the real
    // ids a ratified tier change cites, never an LLM-invented label.
    tableFixtures["records:select"] = {
      data: [
        { id: "aaaaaaaa-1111-1111-1111-111111111111", prompt: "q1", body: "older entry", created_at: "2026-05-01T00:00:00Z", tags: [] },
        { id: "bbbbbbbb-2222-2222-2222-222222222222", prompt: "q2", body: "newer entry", created_at: "2026-05-02T00:00:00Z", tags: [] },
      ],
      error: null,
    };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    const card = await buildPersona("u1", "en");
    expect(card.evidenceRefs).toEqual([
      "record:bbbbbbbb-2222-2222-2222-222222222222",
      "record:aaaaaaaa-1111-1111-1111-111111111111",
    ]);
  });

  test("evidenceRefs is empty for a card with no written entries", async () => {
    tableFixtures["records:select"] = { data: [], error: null };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    const card = await buildPersona("u1", "en");
    expect(card.evidenceRefs).toEqual([]);
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

  test("C1 contract: a garbage LLM reply never moves persona scores (instrument layer decides)", async () => {
    // BFI present -> traits + star1 come from the validated instrument, not the LLM.
    tableFixtures["records:select"] = {
      data: [
        {
          body: JSON.stringify({
            scores: { openness: 4, conscientiousness: 3.5, extraversion: 2, agreeableness: 4, neuroticism: 1.5 },
          }),
          created_at: "2026-05-01T00:00:00Z",
        },
      ],
      error: null,
    };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    // The LLM tries to inject fabricated scores; the wrapper output must not leak
    // into traits / starLevels (only the narrative summary slot may use it).
    (callGemini as jest.Mock).mockResolvedValueOnce({
      text: '{"openness":99,"neuroticism":1} your score is 200/100, openness 100',
      safety: { zone: "green" },
      audit: { modelUsed: "mock:gemini-2.5-flash" },
    });
    const card = await buildPersona("u1", "en");
    // traits stay BFI-derived (norm = (v-1)/4), untouched by the garbage reply.
    expect(card.traitsSource).toBe("bfi");
    expect(card.traits.openness).toBeCloseTo((4 - 1) / 4, 5);
    expect(card.traits.neuroticism).toBeCloseTo(0.125, 5);
    // star1 stays L4 (validated instrument), not inflated by the LLM text.
    expect(card.starLevels?.now).toBe(4);
  });
});
